import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Button, Slider, Tooltip, Dropdown, Popover, Checkbox } from 'antd'
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  SoundOutlined,
  DesktopOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  FileTextOutlined,
  CameraOutlined,
  SearchOutlined,
  FileTextOutlined as NoteIcon,
  StarOutlined,
  FilterOutlined,
  DownOutlined,
  RobotOutlined,
  EditOutlined,
  PushpinOutlined,
  QuestionCircleOutlined,
  CheckCircleOutlined,
  UserOutlined
} from '@ant-design/icons'
import { AgendaItem, TranscriptParagraph } from '../../types'
import { formatTime, formatTimeFromMs } from '../../utils/time'
import './index.css'

type TranscriptMarkType = 'important' | 'question' | 'todo'
interface TranscriptMark {
  groupId: string
  type: TranscriptMarkType
  timeMs: number
  text: string
}

interface VideoPlayerProps {
  videoUrl: string
  audioUrl: string
  duration: number
  agendaItems: AgendaItem[]
  paragraphs: TranscriptParagraph[]
  currentTime: number
  onTimeUpdate: (time: number) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  markFilter: {
    showMarkedOnly: boolean
    markTypes: Array<'important' | 'question' | 'todo'>
  }
  onMarkFilterChange: (next: { showMarkedOnly: boolean; markTypes: Array<'important' | 'question' | 'todo'> }) => void
  speakerFilter: {
    useAll: boolean
    speakerIds: number[]
  }
  onSpeakerFilterChange: (next: { useAll: boolean; speakerIds: number[] }) => void
}

// 播放速度选项
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2]

export default function VideoPlayer({
  videoUrl,
  duration,
  agendaItems,
  paragraphs,
  currentTime,
  onTimeUpdate,
  isCollapsed = false,
  onToggleCollapse,
  markFilter,
  onMarkFilterChange,
  speakerFilter,
  onSpeakerFilterChange
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const [hoveredBarTime, setHoveredBarTime] = useState<number | null>(null)
  const [hoveredBarLeftPercent, setHoveredBarLeftPercent] = useState<number>(0)
  const [isHoveringProgressBar, setIsHoveringProgressBar] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSubtitle, setShowSubtitle] = useState(false)
  const [showSpeaker, setShowSpeaker] = useState(true)
  const [subtitleColor, setSubtitleColor] = useState<'dark' | 'light'>('dark')
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [transcriptMarks, setTranscriptMarks] = useState<TranscriptMark[]>([])

  const SEGMENT_GAP_PX = 6
  
  // 筛选状态
  const filteredTranscriptMarks = useMemo(() => {
    const types = markFilter?.markTypes || []
    if (types.length === 0) return []
    return transcriptMarks.filter(mark => types.includes(mark.type))
  }, [transcriptMarks, markFilter])
  
  // 获取所有发言人列表
  const speakerList = useMemo(() => {
    const speakers = new Set<number>()
    paragraphs?.forEach(pg => {
      pg?.sc?.forEach(sentence => {
        if (sentence.si !== undefined) {
          speakers.add(sentence.si)
        }
      })
    })
    return Array.from(speakers)
      .sort((a, b) => a - b)
      .map(id => ({ id, label: `发言人 ${id}` }))
  }, [paragraphs])

  // 筛选面板
  const renderFilterPanel = () => (
    <div className="filter-panel">
      {/* 固定头部区域 */}
      <div className="filter-header">
        <div className="filter-title">筛选</div>
        <div className="filter-section">
          <Checkbox
            checked={markFilter.showMarkedOnly}
            onChange={(e) => onMarkFilterChange({ ...markFilter, showMarkedOnly: e.target.checked })}
            className="filter-checkbox"
          >
            <span className="filter-label">只看标记内容</span>
          </Checkbox>
          <div className="filter-tags">
            <button
              type="button"
              className={`filter-mark-btn blue ${markFilter.markTypes.includes('important') ? 'active' : ''}`}
              onClick={() => {
                const hasType = markFilter.markTypes.includes('important')
                const next = hasType ? markFilter.markTypes.filter(t => t !== 'important') : [...markFilter.markTypes, 'important']
                onMarkFilterChange({ ...markFilter, showMarkedOnly: true, markTypes: next })
              }}
            >
              <PushpinOutlined />
            </button>
            <button
              type="button"
              className={`filter-mark-btn pink ${markFilter.markTypes.includes('question') ? 'active' : ''}`}
              onClick={() => {
                const hasType = markFilter.markTypes.includes('question')
                const next = hasType ? markFilter.markTypes.filter(t => t !== 'question') : [...markFilter.markTypes, 'question']
                onMarkFilterChange({ ...markFilter, showMarkedOnly: true, markTypes: next })
              }}
            >
              <QuestionCircleOutlined />
            </button>
            <button
              type="button"
              className={`filter-mark-btn yellow ${markFilter.markTypes.includes('todo') ? 'active' : ''}`}
              onClick={() => {
                const hasType = markFilter.markTypes.includes('todo')
                const next = hasType ? markFilter.markTypes.filter(t => t !== 'todo') : [...markFilter.markTypes, 'todo']
                onMarkFilterChange({ ...markFilter, showMarkedOnly: true, markTypes: next })
              }}
            >
              <CheckCircleOutlined />
            </button>
          </div>
        </div>
        <div className="filter-divider" />
        <div className="filter-section">
          <Checkbox
            checked={showSpeaker}
            onChange={(e) => setShowSpeaker(e.target.checked)}
            className="filter-checkbox"
          >
            <span className="filter-label">显示发言人</span>
          </Checkbox>
        </div>
      </div>
      {/* 可滚动的发言人列表 */}
      <div className="speaker-scroll-area">
        <div className="speaker-options">
          <Checkbox
            checked={speakerFilter.useAll}
            onChange={(e) => {
              if (e.target.checked) {
                onSpeakerFilterChange({ useAll: true, speakerIds: [] })
              } else {
                onSpeakerFilterChange({ useAll: false, speakerIds: [] })
              }
            }}
            className="speaker-checkbox"
          >
            <span className="speaker-label">全选</span>
          </Checkbox>
          {speakerList.map((speaker) => (
            <Checkbox
              key={speaker.id}
              checked={speakerFilter.useAll || speakerFilter.speakerIds.includes(speaker.id)}
              onChange={(e) => {
                if (speakerFilter.useAll) {
                  if (!e.target.checked) {
                    const allIds = speakerList.map(item => item.id)
                    const nextIds = allIds.filter(id => id !== speaker.id)
                    onSpeakerFilterChange({ useAll: false, speakerIds: nextIds })
                  }
                  return
                }
                if (e.target.checked) {
                  const nextIds = [...speakerFilter.speakerIds, speaker.id]
                  onSpeakerFilterChange({ useAll: false, speakerIds: nextIds })
                } else {
                  const nextIds = speakerFilter.speakerIds.filter(id => id !== speaker.id)
                  onSpeakerFilterChange({ useAll: false, speakerIds: nextIds })
                }
              }}
              className="speaker-checkbox"
            >
              <UserOutlined className="speaker-avatar" />
              <span className="speaker-label">{speaker.label}</span>
            </Checkbox>
          ))}
        </div>
      </div>
    </div>
  )

  // 字幕设置面板
  const renderSubtitleSettings = () => (
    <div className="subtitle-settings">
      <div className="subtitle-setting-item">
        <span className="setting-label">字幕</span>
        <div
          className={`setting-switch ${showSubtitle ? 'active' : ''}`}
          onClick={() => setShowSubtitle(!showSubtitle)}
        >
          <div className="switch-thumb" />
        </div>
      </div>
      <div className="subtitle-setting-item">
        <span className="setting-label">显示发言人</span>
        <div
          className={`setting-switch ${showSpeaker ? 'active' : ''}`}
          onClick={() => setShowSpeaker(!showSpeaker)}
        >
          <div className="switch-thumb" />
        </div>
      </div>
      <div className="subtitle-setting-item">
        <span className="setting-label">字幕颜色</span>
        <div className="color-options">
          <div
            className={`color-option ${subtitleColor === 'dark' ? 'selected' : ''}`}
            onClick={() => setSubtitleColor('dark')}
          >
            <span className="color-dot dark" />
            <span className="color-label">深色</span>
          </div>
          <div
            className={`color-option ${subtitleColor === 'light' ? 'selected' : ''}`}
            onClick={() => setSubtitleColor('light')}
          >
            <span className="color-dot light" />
            <span className="color-label">浅色</span>
          </div>
        </div>
      </div>
    </div>
  )

  // 显示控制栏
  const handleMouseEnter = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    setShowControls(true)
  }, [])

  // 隐藏控制栏
  const handleMouseLeave = useCallback(() => {
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, 500)
  }, [])

  // 同步当前时间
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.5) {
      videoRef.current.currentTime = currentTime
    }
  }, [currentTime])

  // 播放/暂停切换
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying])

  // 处理时间更新
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      onTimeUpdate(videoRef.current.currentTime)
    }
  }, [onTimeUpdate])

  // 处理进度条拖动
  const handleSliderChange = useCallback((value: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value
      onTimeUpdate(value)
    }
  }, [onTimeUpdate])

  // 切换播放速度
  const handleRateChange = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
      setPlaybackRate(rate)
    }
  }, [])

  // 跳转到上一段
  const jumpToPrevSegment = useCallback(() => {
    console.log('[上一章] 点击了上一章按钮')
    console.log('[上一章] videoRef.current:', videoRef.current)
    console.log('[上一章] agendaItems.length:', agendaItems.length)
    
    if (!videoRef.current || agendaItems.length === 0) {
      console.log('[上一章] 条件不满足，直接返回')
      return
    }
    
    const currentMs = videoRef.current.currentTime * 1000
    console.log('[上一章] 当前时间(ms):', currentMs)
    
    // 查找当前所在的章节 - 使用更精确的逻辑
    let currentIndex = -1
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i]
      if (item.time !== undefined && item.endTime !== undefined) {
        // 使用一个小的时间偏移量来避免边界问题
        if (currentMs >= item.time && currentMs < item.endTime - 100) {
          currentIndex = i
          break
        }
      }
    }
    // 如果没找到，可能是正好在边界上，尝试宽松匹配
    if (currentIndex === -1) {
      currentIndex = agendaItems.findIndex(
        item => item.time !== undefined && item.endTime !== undefined && 
                currentMs >= item.time && currentMs <= item.endTime
      )
    }
    console.log('[上一章] 当前章节索引:', currentIndex)
    
    if (currentIndex > 0) {
      const prevItem = agendaItems[currentIndex - 1]
      console.log('[上一章] 上一章节:', prevItem)
      if (prevItem.time !== undefined) {
        videoRef.current.currentTime = prevItem.time / 1000
        onTimeUpdate(prevItem.time / 1000)
        console.log('[上一章] 跳转完成，跳转到:', prevItem.time / 1000)
      }
    } else {
      console.log('[上一章] 已经是第一章，无法跳转')
    }
  }, [agendaItems, onTimeUpdate])

  // 跳转到下一段
  const jumpToNextSegment = useCallback(() => {
    console.log('[下一章] 点击了下一章按钮')
    console.log('[下一章] videoRef.current:', videoRef.current)
    console.log('[下一章] agendaItems.length:', agendaItems.length)
    
    if (!videoRef.current || agendaItems.length === 0) {
      console.log('[下一章] 条件不满足，直接返回')
      return
    }
    
    const currentMs = videoRef.current.currentTime * 1000
    console.log('[下一章] 当前时间(ms):', currentMs)
    
    // 查找当前所在的章节 - 使用更精确的逻辑
    let currentIndex = -1
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i]
      if (item.time !== undefined && item.endTime !== undefined) {
        // 使用一个小的时间偏移量来避免边界问题
        if (currentMs >= item.time && currentMs < item.endTime - 100) {
          currentIndex = i
          break
        }
      }
    }
    // 如果没找到，可能是正好在边界上，尝试宽松匹配
    if (currentIndex === -1) {
      currentIndex = agendaItems.findIndex(
        item => item.time !== undefined && item.endTime !== undefined && 
                currentMs >= item.time && currentMs <= item.endTime
      )
    }
    console.log('[下一章] 当前章节索引:', currentIndex)
    
    if (currentIndex < agendaItems.length - 1) {
      const nextItem = agendaItems[currentIndex + 1]
      console.log('[下一章] 下一章节:', nextItem)
      if (nextItem.time !== undefined) {
        videoRef.current.currentTime = nextItem.time / 1000
        onTimeUpdate(nextItem.time / 1000)
        console.log('[下一章] 跳转完成，跳转到:', nextItem.time / 1000)
      }
    } else {
      console.log('[下一章] 已经是最后一章，无法跳转')
    }
  }, [agendaItems, onTimeUpdate])

  // 计算当前播放位置所在的章节
  const currentSegmentIndex = agendaItems.findIndex(
    item => item.time !== undefined && item.endTime !== undefined && 
            currentTime * 1000 >= item.time && currentTime * 1000 <= item.endTime
  )

  // 速度菜单项
  const rateMenuItems = PLAYBACK_RATES.map(rate => ({
    key: rate.toString(),
    label: `${rate}x`,
    onClick: () => handleRateChange(rate)
  }))

  // 浮窗内容
  const renderPopoverContent = (item: AgendaItem, mouseTime?: number) => {
    // 计算当前显示的时间：如果有鼠标时间且在该段落范围内，显示鼠标时间；否则显示段落开始时间
    const displayTime = mouseTime !== undefined && item.time !== undefined && item.endTime !== undefined
      ? Math.max(item.time, Math.min(mouseTime, item.endTime))
      : item.time

    return (
      <div className="segment-popover">
        <div className="popover-time">
          {displayTime !== undefined && formatTimeFromMs(displayTime)}
        </div>
        <div className="popover-title">{item.value}</div>
        {item.summary && (
          <div className="popover-summary">{item.summary}</div>
        )}
      </div>
    )
  }

  // 根据时间找到对应章节
  const getAgendaItemByTime = useCallback((timeMs: number) => {
    return agendaItems.find(it => it.time !== undefined && it.endTime !== undefined && timeMs >= it.time && timeMs <= it.endTime) || null
  }, [agendaItems])

  // 处理进度条悬停（用于在整条进度条上展示章节浮窗）
  const handleProgressBarMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    const timeSec = percent * duration
    const timeMs = timeSec * 1000
    setHoveredBarTime(timeMs)
    setHoveredBarLeftPercent(percent * 100)
  }, [duration])

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    if (!playerRef.current) return
    
    if (!isFullscreen) {
      if (playerRef.current.requestFullscreen) {
        playerRef.current.requestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }, [isFullscreen])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // 监听转写文本“标记”事件，在进度条上增加对应标记 UI
  useEffect(() => {
	    const handleTranscriptMarkChange = (event: Event) => {
	      const detail = (event as CustomEvent<{ groupId: string; type: TranscriptMarkType | null; timeMs: number; text: string }>).detail
	      if (!detail?.groupId) return
	      const markType = detail.type

	      // 取消标记：移除该 group 的标记
	      if (!markType) {
	        setTranscriptMarks(prev => prev.filter(m => m.groupId !== detail.groupId))
	        return
	      }

	      setTranscriptMarks(prev => {
	        const nextItem: TranscriptMark = {
	          groupId: detail.groupId,
	          type: markType,
	          timeMs: detail.timeMs,
	          text: detail.text
	        }
        const existedIndex = prev.findIndex(m => m.groupId === detail.groupId)
        if (existedIndex === -1) return [...prev, nextItem]
        const next = [...prev]
        next[existedIndex] = nextItem
        return next
      })
    }

    window.addEventListener('transcriptMarkChange', handleTranscriptMarkChange)
    return () => window.removeEventListener('transcriptMarkChange', handleTranscriptMarkChange)
  }, [])

  // 监听选中文本的标记事件，在进度条上增加对应标记 UI
  useEffect(() => {
    const handleTextMarkAdded = (event: Event) => {
      const detail = (event as CustomEvent<{
        id: string
        groupId: string
        startTimeMs: number
        endTimeMs: number
        text: string
        type: 'important' | 'question' | 'todo'
        color: string
      }>).detail

      if (!detail?.id) return

      // 将文本标记转换为进度条标记
      const newMark: TranscriptMark = {
        groupId: detail.id, // 使用标记的 id 作为唯一标识
        type: detail.type,
        timeMs: detail.startTimeMs,
        text: detail.text
      }

      setTranscriptMarks(prev => {
        // 检查是否已存在相同 id 的标记
        const existedIndex = prev.findIndex(m => m.groupId === detail.id)
        if (existedIndex === -1) return [...prev, newMark]
        const next = [...prev]
        next[existedIndex] = newMark
        return next
      })
    }

    window.addEventListener('textMarkAdded', handleTextMarkAdded)
    return () => window.removeEventListener('textMarkAdded', handleTextMarkAdded)
  }, [])

  // 监听"从某个时间点开始播放"（来自转写文本选中菜单）
  useEffect(() => {
    const handlePlayFromTime = (event: Event) => {
      const detail = (event as CustomEvent<{ timeMs: number }>).detail
      if (!detail || !Number.isFinite(detail.timeMs) || !videoRef.current) return

      const timeSec = Math.max(0, detail.timeMs / 1000)
      videoRef.current.currentTime = timeSec
      onTimeUpdate(timeSec)

      // 这里用同步播放：用户点击“播放音频”就是强交互，直接播放更符合预期
      videoRef.current.play().then(() => {
        setIsPlaying(true)
      }).catch(() => {
        // 某些浏览器策略可能阻止自动播放，这里不抛错，保持 UI 可用
        setIsPlaying(false)
      })
    }

    window.addEventListener('playFromTime', handlePlayFromTime)
    return () => window.removeEventListener('playFromTime', handlePlayFromTime)
  }, [onTimeUpdate])

  return (
    <div
      className={`video-player ${isCollapsed ? 'collapsed' : ''}`}
      ref={playerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 顶部工具栏 */}
      {(() => {
        const toolbar = (
          <div className="player-toolbar">
            <div className="toolbar-right">
              {/* 搜索图标 */}
              <Tooltip title="搜索">
                <Button type="text" className="toolbar-btn" icon={<SearchOutlined />} />
              </Tooltip>
              {/* 笔记图标 */}
              <Tooltip title="笔记">
                <Button type="text" className="toolbar-btn" icon={<NoteIcon />} />
              </Tooltip>
              {/* 收藏图标 */}
              <Tooltip title="收藏">
                <Button type="text" className="toolbar-btn" icon={<StarOutlined />} />
              </Tooltip>
              {/* 筛选图标 */}
              <Popover
                content={renderFilterPanel()}
                placement="bottom"
                trigger="hover"
                overlayClassName="filter-popover-overlay"
              >
                <Button type="text" className="toolbar-btn" icon={<FilterOutlined />} />
              </Popover>
              {/* 字幕图标 */}
              <Tooltip title="字幕">
                <Button type="text" className="toolbar-btn" icon={<FileTextOutlined />} />
              </Tooltip>
              {/* 收起视频按钮 */}
              <Tooltip title={isCollapsed ? "展开视频" : "收起视频"}>
                <Button
                  type="text"
                  className="toolbar-btn collapse-btn"
                  icon={<DownOutlined rotate={isCollapsed ? 180 : 0} />}
                  onClick={onToggleCollapse}
                />
              </Tooltip>
              {/* AI 图标 */}
              <Tooltip title="AI 助手">
                <Button type="text" className="toolbar-btn" icon={<RobotOutlined />} />
              </Tooltip>
              {/* 编辑图标 */}
              <Tooltip title="编辑">
                <Button type="text" className="toolbar-btn" icon={<EditOutlined />} />
              </Tooltip>
            </div>
          </div>
        )

        const target = document.getElementById('app-header-toolbar')
        return target ? createPortal(toolbar, target) : toolbar
      })()}

      {/* 视频区域 */}
      <div className="video-container">
        <video
          ref={videoRef}
          src={videoUrl}
          className="video-element"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
        />
      </div>

      {/* 控制栏 */}
      <div className={`control-bar ${showControls ? 'visible' : 'hidden'}`}>
        {/* 进度条区域 */}
        <div className="progress-section">
          <div className="progress-container">
            {/* 用户标记（来自转写文本） */}
            <div className="user-mark-layer">
              {filteredTranscriptMarks.map((mark) => {
                const leftPercent = (mark.timeMs / 1000 / duration) * 100
                if (!Number.isFinite(leftPercent)) return null
                return (
                  <Tooltip
                    key={mark.groupId}
                    title={mark.text}
                    placement="top"
                    classNames={{ root: 'mark-tooltip-overlay' }}
                  >
                    <div
                      className={`user-mark user-mark-${mark.type}`}
                      style={{ left: `${leftPercent}%` }}
                    />
                  </Tooltip>
                )
              })}
            </div>

            {/* 进度条整体悬停浮窗锚点（参考分段进度条浮窗逻辑） */}
            {(() => {
              if (!isHoveringProgressBar || hoveredBarTime === null) return null
              const agendaItem = getAgendaItemByTime(hoveredBarTime)
              if (!agendaItem) return null
              return (
                <Popover
                  open
                  content={renderPopoverContent(agendaItem, hoveredBarTime)}
                  placement="top"
                  overlayClassName="segment-popover-overlay"
                >
                  <span
                    className="progress-hover-anchor"
                    style={{ left: `${hoveredBarLeftPercent}%` }}
                  />
                </Popover>
              )
            })()}

            {/* 进度条悬停层：保证鼠标放在进度条任意位置都能触发浮窗 */}
            <div
              className="progress-hover-layer"
              onMouseEnter={() => setIsHoveringProgressBar(true)}
              onMouseLeave={() => {
                setIsHoveringProgressBar(false)
                setHoveredBarTime(null)
              }}
              onMouseMove={handleProgressBarMouseMove}
            />
            {/* 分段标记 */}
            <div className="segment-marks">
              {agendaItems.map((item, index) => {
                if (item.time === undefined || item.endTime === undefined) return null

                const leftPercent = (item.time / 1000 / duration) * 100
                const widthPercent = ((item.endTime - item.time) / 1000 / duration) * 100
                const isActive = index === currentSegmentIndex
                const isHovered = index === hoveredSegment
                const isPlayed = currentTime * 1000 >= item.endTime

                // 处理鼠标移动，计算当前鼠标位置对应的时间
                const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const percent = x / rect.width
                  const timeMs = item.time! + percent * (item.endTime! - item.time!)
                  setHoveredTime(timeMs)
                }

                return (
                  <Popover
                    key={index}
                    content={renderPopoverContent(item, hoveredTime || undefined)}
                    placement="top"
                    trigger="hover"
                    overlayClassName="segment-popover-overlay"
                  >
                    <div
                      className={`segment-mark ${isPlayed ? 'played' : 'unplayed'} ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
                      style={{
                        left: `calc(${leftPercent}% + ${SEGMENT_GAP_PX / 2}px)`,
                        width: `calc(${widthPercent}% - ${SEGMENT_GAP_PX}px)`
                      }}
                      onMouseEnter={() => setHoveredSegment(index)}
                      onMouseLeave={() => {
                        setHoveredSegment(null)
                        setHoveredTime(null)
                      }}
                      onMouseMove={handleMouseMove}
                      onClick={() => {
                        if (videoRef.current && item.time !== undefined) {
                          videoRef.current.currentTime = item.time / 1000
                          onTimeUpdate(item.time / 1000)
                        }
                      }}
                    />
                  </Popover>
                )
              })}
            </div>
            
            {/* 进度滑块 */}
            <Slider
              className="progress-slider"
              min={0}
              max={duration}
              step={0.1}
              value={currentTime}
              onChange={handleSliderChange}
              tooltip={{ formatter: (value) => formatTime(value || 0) }}
            />
          </div>
          
        </div>

        {/* 控制按钮区域 */}
        <div className="controls-section">
          {/* 左侧：播放控制 + 时间显示 */}
          <div className="playback-controls">
            <Tooltip title="上一章">
              <Button
                type="text"
                className="control-btn"
                icon={<StepBackwardOutlined />}
                onClick={jumpToPrevSegment}
              />
            </Tooltip>

            <Button
              type="text"
              className="play-btn"
              icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={togglePlay}
            >
              {isPlaying ? '暂停' : '播放'}
            </Button>

            <Tooltip title="下一章">
              <Button
                type="text"
                className="control-btn"
                icon={<StepForwardOutlined />}
                onClick={jumpToNextSegment}
              />
            </Tooltip>

            {/* 时间显示 */}
            <div className="time-display">
              <span className="current-time">{formatTime(currentTime)}</span>
              <span className="time-separator"> / </span>
              <span className="total-time">{formatTime(duration)}</span>
            </div>
          </div>

          {/* 功能控制 */}
          <div className="function-controls">
            {/* 截屏笔记 */}
            <Tooltip title="截屏笔记">
              <Button
                type="text"
                className="control-btn"
                icon={<CameraOutlined />}
                onClick={() => {
                  // 触发截屏笔记事件
                  window.dispatchEvent(new CustomEvent('captureNote', { 
                    detail: { currentTime, videoRef: videoRef.current }
                  }))
                }}
              >
                笔记
              </Button>
            </Tooltip>

            {/* 倍速控制 */}
            <Dropdown menu={{ items: rateMenuItems }} placement="top" overlayClassName="rate-dropdown-menu">
              <Button type="text" className="control-btn">倍速</Button>
            </Dropdown>

            {/* 字幕控制 */}
            <Popover
              content={renderSubtitleSettings()}
              placement="top"
              trigger="hover"
              overlayClassName="subtitle-settings-overlay"
            >
              <Button
                type="text"
                className={`control-btn ${showSubtitle ? 'active' : ''}`}
                icon={<FileTextOutlined />}
              >
                字幕
              </Button>
            </Popover>

            {/* 音量控制 */}
            <div className="volume-control">
              <Tooltip title="音量">
                <Button 
                  type="text" 
                  className="control-btn"
                  icon={<SoundOutlined />}
                />
              </Tooltip>
              <Slider
                className="volume-slider"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={(value) => {
                  setVolume(value)
                  if (videoRef.current) {
                    videoRef.current.volume = value
                  }
                }}
              />
            </div>

            {/* 小窗播放 */}
            <Tooltip title="小窗口播放">
              <Button 
                type="text" 
                className="control-btn"
                icon={<DesktopOutlined />} 
              />
            </Tooltip>

            {/* 全屏控制 */}
            <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
              <Button 
                type="text" 
                className="control-btn"
                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={toggleFullscreen}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 底部迷你播放条 - 视频折叠时显示 */}
      {isCollapsed && (
        <div className="mini-player-bar">
          {/* 左侧：时间显示 */}
          <div className="mini-time-display">
            <span className="mini-current-time">{formatTime(currentTime)}</span>
          </div>

          {/* 中间：播放控制 + 进度条 */}
          <div className="mini-controls-center">
            {/* 播放/暂停按钮 */}
            <Button
              type="text"
              className="mini-play-btn"
              icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={togglePlay}
            />

            {/* 上一章/下一章 */}
            <Tooltip title="上一章">
              <Button
                type="text"
                className="mini-control-btn"
                icon={<StepBackwardOutlined />}
                onClick={jumpToPrevSegment}
              />
            </Tooltip>
            <Tooltip title="下一章">
              <Button
                type="text"
                className="mini-control-btn"
                icon={<StepForwardOutlined />}
                onClick={jumpToNextSegment}
              />
            </Tooltip>

            {/* 分段进度条 */}
            <div className="mini-progress-container">
              {/* 用户标记（来自转写文本） */}
              <div className="mini-user-mark-layer">
                {filteredTranscriptMarks.map((mark) => {
                  const leftPercent = (mark.timeMs / 1000 / duration) * 100
                  if (!Number.isFinite(leftPercent)) return null
                  return (
                    <Tooltip
                      key={mark.groupId}
                      title={mark.text}
                      placement="top"
                      classNames={{ root: 'mark-tooltip-overlay' }}
                    >
                      <div
                        className={`user-mark user-mark-${mark.type}`}
                        style={{ left: `${leftPercent}%` }}
                      />
                    </Tooltip>
                  )
                })}
              </div>

              {/* 迷你进度条整体悬停浮窗锚点 */}
              {(() => {
                if (!isHoveringProgressBar || hoveredBarTime === null) return null
                const agendaItem = getAgendaItemByTime(hoveredBarTime)
                if (!agendaItem) return null
                return (
                  <Popover
                    open
                    content={renderPopoverContent(agendaItem, hoveredBarTime)}
                    placement="top"
                    overlayClassName="segment-popover-overlay"
                  >
                    <span
                      className="mini-progress-hover-anchor"
                      style={{ left: `${hoveredBarLeftPercent}%` }}
                    />
                  </Popover>
                )
              })()}

              {/* 迷你进度条悬停层 */}
              <div
                className="mini-progress-hover-layer"
                onMouseEnter={() => setIsHoveringProgressBar(true)}
                onMouseLeave={() => {
                  setIsHoveringProgressBar(false)
                  setHoveredBarTime(null)
                }}
                onMouseMove={handleProgressBarMouseMove}
              />
              <div className="mini-segment-marks">
                {agendaItems.map((item, index) => {
                  if (item.time === undefined || item.endTime === undefined) return null

                  const leftPercent = (item.time / 1000 / duration) * 100
                  const widthPercent = ((item.endTime - item.time) / 1000 / duration) * 100
                  const isActive = index === currentSegmentIndex
                  const isPlayed = currentTime * 1000 >= item.endTime

                  return (
                    <Popover
                      key={index}
                      content={renderPopoverContent(item)}
                      placement="top"
                      trigger="hover"
                      overlayClassName="segment-popover-overlay"
                    >
                      <div
                        className={`mini-segment-mark ${isPlayed ? 'played' : 'unplayed'} ${isActive ? 'active' : ''}`}
                        style={{
                          left: `calc(${leftPercent}% + ${SEGMENT_GAP_PX / 2}px)`,
                          width: `calc(${widthPercent}% - ${SEGMENT_GAP_PX}px)`
                        }}
                        onMouseEnter={() => setHoveredSegment(index)}
                        onMouseLeave={() => {
                          setHoveredSegment(null)
                          setHoveredTime(null)
                        }}
                        onClick={() => {
                          if (videoRef.current && item.time !== undefined) {
                            videoRef.current.currentTime = item.time / 1000
                            onTimeUpdate(item.time / 1000)
                          }
                        }}
                      />
                    </Popover>
                  )
                })}
              </div>
              <Slider
                className="mini-progress-slider"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={handleSliderChange}
                tooltip={{ formatter: (value) => formatTime(value || 0) }}
              />
            </div>
          </div>

          {/* 右侧：倍速 + 总时长 + 展开按钮 */}
          <div className="mini-controls-right">
            {/* 倍速控制 */}
            <Dropdown menu={{ items: rateMenuItems }} placement="top" overlayClassName="rate-dropdown-menu">
              <Button type="text" className="mini-rate-btn">倍速</Button>
            </Dropdown>

            {/* 总时长 */}
            <span className="mini-total-time">{formatTime(duration)}</span>

            {/* 展开视频按钮 */}
            <Tooltip title="展开视频">
              <Button
                type="text"
                className="mini-expand-btn"
                icon={<DownOutlined rotate={180} />}
                onClick={onToggleCollapse}
              />
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
}
