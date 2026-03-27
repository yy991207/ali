import { useState, useEffect, useMemo, useCallback } from 'react'
import { Layout, Spin, message } from 'antd'
import VideoPlayer from './components/VideoPlayer'
import TranscriptPanel from './components/TranscriptPanel'
import SmartOverview from './components/SmartOverview'
import NotePanel from './components/NotePanel'
import { LabInfoResponse, TransResultResponse, ParsedTranscript, AgendaItem, KeywordItem, RoleSummaryItem, QAPair, LabInfo } from './types'
import { formatTimeFromMs } from './utils/time'
import { viewerApiService } from './services/viewerApi'
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

const { Content } = Layout

const filterTranscriptBySpeakers = (transcript: ParsedTranscript, speakerIds: number[]): ParsedTranscript => {
  const speakerSet = new Set(speakerIds)
  return {
    pg: transcript.pg.reduce<ParsedTranscript['pg']>((result, paragraph) => {
      const filteredSentences = paragraph.sc.filter(sentence => speakerSet.has(sentence.si))
      if (filteredSentences.length === 0) {
        return result
      }
      result.push({
        ...paragraph,
        sc: filteredSentences
      })
      return result
    }, [])
  }
}

function App() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
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

  const allLabCards = useMemo<LabInfo[]>(() => {
    if (!labInfo) return []
    return [
      ...labInfo.data.labCardsMap.labSummaryInfo,
      ...labInfo.data.labCardsMap.labInfo
    ]
  }, [labInfo])

  const findLabCardByKey = useCallback((keys: string[]) => {
    return allLabCards.find((lab) => keys.includes(lab.key))
  }, [allLabCards])

  // 加载数据
  useEffect(() => {
    let cancelled = false

    const applyPageData = (payload: {
      labInfo: LabInfoResponse
      transResult: TransResultResponse
      parsedTranscript: ParsedTranscript
    }) => {
      if (cancelled) return
      setLoadError('')
      setLabInfo(payload.labInfo)
      setTransResult(payload.transResult)
      setParsedTranscript(payload.parsedTranscript)
      setFilteredTranscript(payload.parsedTranscript)
      setLoading(false)
    }

    const loadData = async () => {
      try {
        applyPageData(await viewerApiService.loadPageData())
      } catch (error) {
        console.error('加载真实接口失败:', error)
        if (!cancelled) {
          const nextError = error instanceof Error ? error.message : '真实接口加载失败'
          setLoadError(nextError)
          message.error(nextError)
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  // 提取议程数据（合并 pptTitle 的时间数据和 agendaSummary 的摘要数据）
  const agendaItems = useMemo(() => {
    if (!labInfo) return []

    // 从 pptTitle 获取带时间戳的章节数据
    const pptTitleLab = findLabCardByKey(['pptTitle'])
    const timeItems = pptTitleLab?.contents[0]?.contentValues as AgendaItem[] || []

    // 从 agendaSummary 获取带摘要的章节数据
    const agendaLab = findLabCardByKey(['agendaSummary'])
    const summaryItems = agendaLab?.contents[0]?.contentValues as AgendaItem[] || []

    // 真实接口有时只返回 agendaSummary，没有 pptTitle。
    // 这种情况下也要把摘要内容渲染出来，方便确认接口数据已接到页面。
    if (timeItems.length > 0) {
      return timeItems.map((timeItem, index) => {
        const title = timeItem.title || timeItem.value || `章节 ${index + 1}`
        return {
          ...timeItem,
          title,
          value: title,
          summary: summaryItems[index]?.value || ''
        }
      })
    }

    return summaryItems.map((summaryItem, index) => {
      const title = summaryItem.title || summaryItem.value || `章节 ${index + 1}`
      return {
        ...summaryItem,
        title,
        value: title,
        summary: summaryItem.value || ''
      }
    })
  }, [findLabCardByKey, labInfo])

  // 全文概要优先读取真实接口的 fullSummary 卡片，没有时再退回章节摘要拼接
  const fullSummary = useMemo(() => {
    const fullSummaryLab = findLabCardByKey(['fullSummary'])
    const fullSummaryItems = fullSummaryLab?.contents[0]?.contentValues as AgendaItem[] || []
    const directSummary = fullSummaryItems.map(item => item.value).filter(Boolean).join('')
    if (directSummary) {
      return directSummary
    }
    return agendaItems.map(item => item.summary).filter(Boolean).join('')
  }, [agendaItems, findLabCardByKey])

  // 提取关键词数据
  const keywords = useMemo(() => {
    if (!labInfo) return []
    const keywordLab = findLabCardByKey(['keyWordsExtractor'])
    if (keywordLab?.contents[0]?.contentValues) {
      return keywordLab.contents[0].contentValues as KeywordItem[]
    }
    return []
  }, [findLabCardByKey, labInfo])

  // 提取角色摘要数据
  const roleSummary = useMemo(() => {
    if (!labInfo) return []
    const roleLab = findLabCardByKey(['roleSummary'])
    if (roleLab?.contents[0]?.contentValues) {
      return roleLab.contents[0].contentValues as RoleSummaryItem[]
    }
    return []
  }, [findLabCardByKey, labInfo])

  // 提取问答回顾数据：真实接口如果返回 questionAnswerLlm 或 qaReview，就直接展示
  const qaPairs = useMemo(() => {
    if (!labInfo) return []
    const qaLab = findLabCardByKey(['questionAnswerLlm', 'qaReview'])
    if (qaLab?.contents[0]?.contentValues) {
      return qaLab.contents[0].contentValues as QAPair[]
    }
    return []
  }, [findLabCardByKey, labInfo])

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

  // 发言人筛选直接在前端本地处理，避免依赖旧的本地模拟接口
  const handleSpeakerFilterChange = useCallback((nextFilter: SpeakerFilterState) => {
    setSpeakerFilter(nextFilter)
    if (!parsedTranscript) return
    if (nextFilter.useAll) {
      setFilteredTranscript(parsedTranscript)
      return
    }
    setFilteredTranscript(filterTranscriptBySpeakers(parsedTranscript, nextFilter.speakerIds))
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
        {loadError || '数据加载失败，请刷新页面重试'}
      </div>
    )
  }

  return (
    <Layout className={`app-layout ${isNotePanelOpen ? 'with-note-panel' : ''}`}>
      {/* 顶部标题栏 */}
      <header className="app-header">
        <div className="app-title-block">
          <h1 className="app-title">{transResult.data.tag.showName}</h1>
          <p className="app-subtitle">智能转写与会议要点工作台</p>
        </div>
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
                  qaPairs={qaPairs}
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
