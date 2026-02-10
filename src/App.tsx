import { useState, useEffect, useMemo, useCallback } from 'react'
import { Layout, Spin, message } from 'antd'
import VideoPlayer from './components/VideoPlayer'
import TranscriptPanel from './components/TranscriptPanel'
import SmartOverview from './components/SmartOverview'
import NotePanel from './components/NotePanel'
import { LabInfoResponse, TransResultResponse, ParsedTranscript, AgendaItem, KeywordItem, RoleSummaryItem } from './types'
import { formatTimeFromMs } from './utils/time'
import './App.css'

// 笔记项接口
interface NoteItem {
  id: string
  timestamp: number
  imageUrl?: string
  content: string
  createdAt: Date
}

type MarkFilterType = 'important' | 'question' | 'todo'
interface MarkFilterState {
  showMarkedOnly: boolean
  markTypes: MarkFilterType[]
}

interface SpeakerFilterState {
  useAll: boolean
  speakerIds: number[]
}

// 导入JSON数据
import labInfoData from '../getAllLabInfo.json'
import transResultData from '../getTransResult.json'

const { Content } = Layout

function App() {
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [labInfo, setLabInfo] = useState<LabInfoResponse | null>(null)
  const [transResult, setTransResult] = useState<TransResultResponse | null>(null)
  const [parsedTranscript, setParsedTranscript] = useState<ParsedTranscript | null>(null)
  const [isNotePanelOpen, setIsNotePanelOpen] = useState(false)
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [isVideoCollapsed, setIsVideoCollapsed] = useState(false)
  const [markFilter, setMarkFilter] = useState<MarkFilterState>({
    showMarkedOnly: false,
    markTypes: ['important', 'question', 'todo']
  })
  const [speakerFilter, setSpeakerFilter] = useState<SpeakerFilterState>({
    useAll: true,
    speakerIds: []
  })
  const [filteredTranscript, setFilteredTranscript] = useState<ParsedTranscript | null>(null)

  // 加载数据
  useEffect(() => {
    try {
      // 使用真实JSON数据
      setLabInfo(labInfoData as LabInfoResponse)

      // 处理 transResultData
      const transData = transResultData as TransResultResponse

      // 解析 audioSegments（如果是字符串）
      if (typeof transData.data.audioSegments === 'string') {
        transData.data.audioSegments = JSON.parse(transData.data.audioSegments)
      }

      setTransResult(transData)

      // 解析转写结果
      if (transData.data?.result) {
        const parsed = JSON.parse(transData.data.result)
        setParsedTranscript(parsed)
        setFilteredTranscript(parsed)
      }

      setLoading(false)
    } catch (error) {
      console.error('加载数据失败:', error)
      message.error('数据加载失败')
      setLoading(false)
    }
  }, [])

  // 提取议程数据（合并 pptTitle 的时间数据和 agendaSummary 的摘要数据）
  const agendaItems = useMemo(() => {
    if (!labInfo) return []

    // 从 pptTitle 获取带时间戳的章节数据
    const pptTitleLab = labInfo.data.labCardsMap.labInfo.find(lab => lab.key === 'pptTitle')
    const timeItems = pptTitleLab?.contents[0]?.contentValues as AgendaItem[] || []

    // 从 agendaSummary 获取带摘要的章节数据
    const agendaLab = labInfo.data.labCardsMap.labSummaryInfo.find(lab => lab.key === 'agendaSummary')
    const summaryItems = agendaLab?.contents[0]?.contentValues as AgendaItem[] || []

    // 合并数据：将 summary 从 agendaSummary 匹配到 pptTitle 的章节
    return timeItems.map((timeItem, index) => ({
      ...timeItem,
      summary: summaryItems[index]?.value || ''
    }))
  }, [labInfo])

  // 生成全文概要（将所有章节的 summary 拼接）
  const fullSummary = useMemo(() => {
    return agendaItems.map(item => item.summary).filter(Boolean).join('')
  }, [agendaItems])

  // 提取关键词数据
  const keywords = useMemo(() => {
    if (!labInfo) return []
    const keywordLab = labInfo.data.labCardsMap.labInfo.find(lab => lab.key === 'keyWordsExtractor')
    if (keywordLab?.contents[0]?.contentValues) {
      return keywordLab.contents[0].contentValues as KeywordItem[]
    }
    return []
  }, [labInfo])

  // 提取角色摘要数据
  const roleSummary = useMemo(() => {
    if (!labInfo) return []
    const roleLab = labInfo.data.labCardsMap.labSummaryInfo.find(lab => lab.key === 'roleSummary')
    if (roleLab?.contents[0]?.contentValues) {
      return roleLab.contents[0].contentValues as RoleSummaryItem[]
    }
    return []
  }, [labInfo])

  // 处理时间更新
  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time)
  }

  // 处理议程项点击
  const handleAgendaClick = (item: AgendaItem) => {
    if (item.time !== undefined) {
      setCurrentTime(item.time / 1000)
    }
  }

  // 处理句子点击
  const handleSentenceClick = (time: number) => {
    setCurrentTime(time / 1000)
  }

  // 发言人筛选：由后端处理，前端只渲染结果
  const handleSpeakerFilterChange = useCallback(async (nextFilter: SpeakerFilterState) => {
    setSpeakerFilter(nextFilter)
    if (!parsedTranscript) return
    if (nextFilter.useAll) {
      setFilteredTranscript(parsedTranscript)
      return
    }
    try {
      const res = await fetch('/api/transcript/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerIds: nextFilter.speakerIds })
      })
      if (!res.ok) throw new Error('筛选失败')
      const json = await res.json() as { code: number; data?: ParsedTranscript }
      if (json?.code !== 0 || !json.data) return
      setFilteredTranscript(json.data)
    } catch {
      // 接口异常时不阻断页面交互
    }
  }, [parsedTranscript])

  // 截取视频帧
  const captureVideoFrame = useCallback((video: HTMLVideoElement): string => {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 360
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    }
    return ''
  }, [])

  // 添加笔记
  const handleAddNote = useCallback((event: CustomEvent<{ currentTime: number; videoRef: HTMLVideoElement | null }>) => {
    const { currentTime: captureTime, videoRef } = event.detail

    // 打开笔记面板
    setIsNotePanelOpen(true)

    // 如果有视频元素，截取当前帧
    if (videoRef && videoRef.readyState >= 2) {
      const imageUrl = captureVideoFrame(videoRef)
      if (imageUrl) {
        const newNote: NoteItem = {
          id: Date.now().toString(),
          timestamp: captureTime,
          imageUrl,
          content: '',
          createdAt: new Date()
        }
        setNotes(prev => [...prev, newNote])
      }
    }
  }, [captureVideoFrame])

  // 更新笔记内容
  const handleUpdateNote = useCallback((id: string, content: string) => {
    setNotes(prev => prev.map(note =>
      note.id === id ? { ...note, content } : note
    ))
  }, [])

  // 监听截屏笔记事件
  useEffect(() => {
    const handleCaptureNote = (event: Event) => {
      handleAddNote(event as CustomEvent<{ currentTime: number; videoRef: HTMLVideoElement | null }>)
    }
    window.addEventListener('captureNote', handleCaptureNote)
    return () => {
      window.removeEventListener('captureNote', handleCaptureNote)
    }
  }, [handleAddNote])

  // 监听“一键摘要”事件（从转写文本选中片段触发）
  useEffect(() => {
    const handleOneClickSummary = (event: Event) => {
      const detail = (event as CustomEvent<{ timeMs: number; text: string }>).detail
      if (!detail?.text || !Number.isFinite(detail.timeMs)) return

      // 打开右侧编辑面板
      setIsNotePanelOpen(true)

      const newNote: NoteItem = {
        id: Date.now().toString(),
        timestamp: detail.timeMs / 1000,
        imageUrl: undefined,
        content: `[${formatTimeFromMs(detail.timeMs)}] ${detail.text}`,
        createdAt: new Date()
      }
      setNotes(prev => [...prev, newNote])
    }

    window.addEventListener('oneClickSummary', handleOneClickSummary)
    return () => window.removeEventListener('oneClickSummary', handleOneClickSummary)
  }, [])

  if (loading) {
    return (
      <div className="loading-container">
        <Spin size="large">
          <div style={{ minHeight: '200px' }} />
        </Spin>
      </div>
    )
  }

  if (!transResult || !parsedTranscript) {
    return (
      <div className="error-container">
        数据加载失败，请刷新页面重试
      </div>
    )
  }

  return (
    <Layout className={`app-layout ${isNotePanelOpen ? 'with-note-panel' : ''}`}>
      {/* 顶部标题栏 */}
      <header className="app-header">
        <h1 className="app-title">{transResult.data.tag.showName}</h1>
        {/* VideoPlayer 顶部工具栏挂载点：和标题在同一个容器内 */}
        <div id="app-header-toolbar" className="app-header-toolbar" />
      </header>

      <div className="main-layout">
        <Content className="app-content">
          <div className="main-container">
            {/* 固定区域 - 视频 */}
            <div className="fixed-section">
              <div className="video-wrapper">
                <VideoPlayer
                  videoUrl={transResult.data.playVideoUrl}
                  audioUrl={transResult.data.playback}
                  duration={transResult.data.duration}
                  agendaItems={agendaItems}
                  paragraphs={parsedTranscript.pg}
                  currentTime={currentTime}
                  onTimeUpdate={handleTimeUpdate}
                  isCollapsed={isVideoCollapsed}
                  onToggleCollapse={() => setIsVideoCollapsed(!isVideoCollapsed)}
                  markFilter={markFilter}
                  onMarkFilterChange={setMarkFilter}
                  speakerFilter={speakerFilter}
                  onSpeakerFilterChange={handleSpeakerFilterChange}
                />
              </div>
            </div>

            {/* 滚动区域 - 从关键词开始 */}
            <div className="scrollable-section">
              <div className="scrollable-content">
                {/* 智能速览区域 */}
                <SmartOverview
                  keywords={keywords}
                  agendaItems={agendaItems}
                  roleSummary={roleSummary}
                  fullSummary={fullSummary}
                  currentTime={currentTime}
                  onAgendaClick={handleAgendaClick}
                />

                {/* 转写文本面板 */}
                <TranscriptPanel
                  paragraphs={(filteredTranscript || parsedTranscript).pg}
                  currentTime={currentTime}
                  onSentenceClick={handleSentenceClick}
                  markFilter={markFilter}
                />
              </div>
            </div>
          </div>
        </Content>

        {/* 笔记面板 */}
        <NotePanel
          isOpen={isNotePanelOpen}
          onClose={() => setIsNotePanelOpen(false)}
          notes={notes}
          onAddNote={(note) => setNotes(prev => [...prev, note])}
          onUpdateNote={handleUpdateNote}
        />
      </div>
    </Layout>
  )
}

export default App
