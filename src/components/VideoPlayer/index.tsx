import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
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
  LeftOutlined,
  RightOutlined,
  CameraOutlined,
  SearchOutlined,
  FileTextOutlined as NoteIcon,
  StarOutlined,
  FilterOutlined,
  DownOutlined,
  RobotOutlined,
  EditOutlined
} from '@ant-design/icons'
import { AgendaItem, TranscriptParagraph, TranscriptSentence } from '../../types'
import { formatTime, formatTimeFromMs } from '../../utils/time'
import './index.css'

interface VideoPlayerProps {
  videoUrl: string
  audioUrl: string
  duration: number
  agendaItems: AgendaItem[]
  paragraphs: TranscriptParagraph[]
  currentTime: number
  onTimeUpdate: (time: number) => void
  onSentenceChange?: (sentence: TranscriptSentence) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
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
  onSentenceChange,
  isCollapsed = false,
  onToggleCollapse
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSubtitle, setShowSubtitle] = useState(false)
  const [showSpeaker, setShowSpeaker] = useState(true)
  const [subtitleColor, setSubtitleColor] = useState<'dark' | 'light'>('dark')
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // 筛选状态
  const [showMarkedOnly, setShowMarkedOnly] = useState(false)
  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>(['all'])
  
  // 获取所有发言人列表
  const speakerList = useMemo(() => {
    const speakers = new Set<string>()
    paragraphs?.forEach(pg => {
      pg?.sc?.forEach(sentence => {
        if (sentence.si !== undefined) {
          speakers.add(`发言人 ${sentence.si + 1}`)
        }
      })
    })
    return Array.from(speakers)
  }, [paragraphs])

  // 获取所有句子列表
  const allSentences = useMemo(() => {
    const sentences: TranscriptSentence[] = []
    if (!paragraphs || !Array.isArray(paragraphs)) return sentences
    paragraphs.forEach(pg => {
      if (pg?.sc && Array.isArray(pg.sc)) {
        sentences.push(...pg.sc)
      }
    })
    // 按开始时间排序
    return sentences.sort((a, b) => a.bt - b.bt)
  }, [paragraphs])

  // 将句子按发言人合并成组（连续的同一个人说的话合并）
  const speakerGroups = useMemo(() => {
    const groups: Array<{
      id: string
      speakerId: number
      startTime: number
      endTime: number
      sentences: TranscriptSentence[]
    }> = []
    let currentGroup: typeof groups[0] | null = null

    for (const sentence of allSentences) {
      if (!currentGroup || currentGroup.speakerId !== sentence.si) {
        // 发言人变化，创建新组
        if (currentGroup) {
          groups.push(currentGroup)
        }
        currentGroup = {
          id: `group-${sentence.id}`,
          speakerId: sentence.si,
          startTime: sentence.bt,
          endTime: sentence.et,
          sentences: [sentence]
        }
      } else {
        // 同一个发言人，合并到当前组
        currentGroup.endTime = sentence.et
        currentGroup.sentences.push(sentence)
      }
    }

    // 添加最后一组
    if (currentGroup) {
      groups.push(currentGroup)
    }

    return groups
  }, [allSentences])

  // 获取当前所在的组索引
  const currentGroupIndex = useMemo(() => {
    const currentMs = currentTime * 1000
    return speakerGroups.findIndex(g => currentMs >= g.startTime && currentMs <= g.endTime)
  }, [currentTime, speakerGroups])

  // 获取当前句子索引（用于触发转写面板滚动）
  const currentSentenceIndex = useMemo(() => {
    const currentMs = currentTime * 1000
    return allSentences.findIndex(s => currentMs >= s.bt && currentMs <= s.et)
  }, [currentTime, allSentences])

  // 跳转到前一句 - 按合并后的发言人组跳转，只跳转到同一发言人的上一个组
  const jumpToPrevSentence = useCallback(() => {
    console.log('[前一句] 点击了前一句按钮')
    console.log('[前一句] videoRef.current:', videoRef.current)
    console.log('[前一句] speakerGroups.length:', speakerGroups.length)

    if (!videoRef.current || speakerGroups.length === 0) {
      console.log('[前一句] 条件不满足，直接返回')
      return
    }

    const currentMs = videoRef.current.currentTime * 1000
    console.log('[前一句] 当前时间(ms):', currentMs)
    console.log('[前一句] 当前时间(秒):', videoRef.current.currentTime)

    // 找到当前所在的组，如果没找到（在间隙中），找最接近的组
    let currentIdx = speakerGroups.findIndex(g => currentMs >= g.startTime && currentMs <= g.endTime)
    console.log('[前一句] 当前组索引(第一次查找):', currentIdx)

    // 如果没找到当前组，找当前时间之后的第一个组，然后回退一个
    if (currentIdx === -1) {
      const nextGroupIdx = speakerGroups.findIndex(g => g.startTime > currentMs)
      currentIdx = nextGroupIdx - 1
      console.log('[前一句] 在间隙中，重新计算后的索引:', currentIdx, 'nextGroupIdx:', nextGroupIdx)
    }

    // 如果还是没找到或者已经在第一个组，无法向前跳转
    if (currentIdx <= 0) {
      console.log('[前一句] 无法跳转，currentIdx:', currentIdx)
      return
    }

    const currentGroup = speakerGroups[currentIdx]
    const currentSpeakerId = currentGroup.speakerId
    console.log('[前一句] 当前组:', currentGroup)
    console.log('[前一句] 当前发言人ID:', currentSpeakerId)

    // 向前查找同一发言人的上一个组
    for (let i = currentIdx - 1; i >= 0; i--) {
      console.log(`[前一句] 检查索引 ${i}, 发言人ID: ${speakerGroups[i].speakerId}`)
      if (speakerGroups[i].speakerId === currentSpeakerId) {
        console.log('[前一句] 找到目标组:', speakerGroups[i])
        videoRef.current.currentTime = speakerGroups[i].startTime / 1000
        onTimeUpdate(speakerGroups[i].startTime / 1000)
        // 触发转写面板滚动到该组的第一个句子
        onSentenceChange?.(speakerGroups[i].sentences[0])
        console.log('[前一句] 跳转完成')
        return
      }
    }
    console.log('[前一句] 没有找到同一发言人的上一个组')
  }, [speakerGroups, onTimeUpdate, onSentenceChange])

  // 跳转到后一句 - 按合并后的发言人组跳转，只跳转到同一发言人的下一个组
  const jumpToNextSentence = useCallback(() => {
    console.log('[后一句] 点击了后一句按钮')
    console.log('[后一句] videoRef.current:', videoRef.current)
    console.log('[后一句] speakerGroups.length:', speakerGroups.length)

    if (!videoRef.current || speakerGroups.length === 0) {
      console.log('[后一句] 条件不满足，直接返回')
      return
    }

    const currentMs = videoRef.current.currentTime * 1000
    console.log('[后一句] 当前时间(ms):', currentMs)
    console.log('[后一句] 当前时间(秒):', videoRef.current.currentTime)

    // 找到当前所在的组，如果没找到（在间隙中），找最接近的组
    let currentIdx = speakerGroups.findIndex(g => currentMs >= g.startTime && currentMs <= g.endTime)
    console.log('[后一句] 当前组索引(第一次查找):', currentIdx)

    // 如果没找到当前组，找当前时间之后的第一个组
    if (currentIdx === -1) {
      const nextGroupIdx = speakerGroups.findIndex(g => g.startTime > currentMs)
      currentIdx = nextGroupIdx - 1
      console.log('[后一句] 在间隙中，重新计算后的索引:', currentIdx, 'nextGroupIdx:', nextGroupIdx)
    }

    // 如果还是没找到或者已经在最后一个组，无法向后跳转
    if (currentIdx < 0 || currentIdx >= speakerGroups.length - 1) {
      console.log('[后一句] 无法跳转，currentIdx:', currentIdx, '总组数:', speakerGroups.length)
      return
    }

    const currentGroup = speakerGroups[currentIdx]
    const currentSpeakerId = currentGroup.speakerId
    console.log('[后一句] 当前组:', currentGroup)
    console.log('[后一句] 当前发言人ID:', currentSpeakerId)

    // 向后查找同一发言人的下一个组
    for (let i = currentIdx + 1; i < speakerGroups.length; i++) {
      console.log(`[后一句] 检查索引 ${i}, 发言人ID: ${speakerGroups[i].speakerId}`)
      if (speakerGroups[i].speakerId === currentSpeakerId) {
        console.log('[后一句] 找到目标组:', speakerGroups[i])
        videoRef.current.currentTime = speakerGroups[i].startTime / 1000
        onTimeUpdate(speakerGroups[i].startTime / 1000)
        // 触发转写面板滚动到该组的第一个句子
        onSentenceChange?.(speakerGroups[i].sentences[0])
        console.log('[后一句] 跳转完成')
        return
      }
    }
    console.log('[后一句] 没有找到同一发言人的下一个组')
  }, [speakerGroups, onTimeUpdate, onSentenceChange])

  // 筛选面板
  const renderFilterPanel = () => (
    <div className="filter-panel">
      {/* 固定头部区域 */}
      <div className="filter-header">
        <div className="filter-title">筛选</div>
        <div className="filter-section">
          <Checkbox
            checked={showMarkedOnly}
            onChange={(e) => setShowMarkedOnly(e.target.checked)}
            className="filter-checkbox"
          >
            <span className="filter-label">只看标记内容</span>
          </Checkbox>
          <div className="filter-tags">
            <span className="filter-tag blue">●</span>
            <span className="filter-tag pink">●</span>
            <span className="filter-tag yellow">●</span>
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
            checked={selectedSpeakers.includes('all')}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedSpeakers(['all'])
              } else {
                setSelectedSpeakers([])
              }
            }}
            className="speaker-checkbox"
          >
            <span className="speaker-label">全选</span>
          </Checkbox>
          {speakerList.map((speaker, index) => (
            <Checkbox
              key={speaker}
              checked={selectedSpeakers.includes(speaker) || selectedSpeakers.includes('all')}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedSpeakers(prev => [...prev.filter(s => s !== 'all'), speaker])
                } else {
                  setSelectedSpeakers(prev => prev.filter(s => s !== speaker))
                }
              }}
              className="speaker-checkbox"
            >
              <span className="speaker-avatar">👤</span>
              <span className="speaker-label">{speaker}</span>
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

  return (
    <div
      className={`video-player ${isCollapsed ? 'collapsed' : ''}`}
      ref={playerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 顶部工具栏 */}
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
            {/* 分段标记 */}
            <div className="segment-marks">
              {agendaItems.map((item, index) => {
                if (item.time === undefined || item.endTime === undefined) return null

                const leftPercent = (item.time / 1000 / duration) * 100
                const widthPercent = ((item.endTime - item.time) / 1000 / duration) * 100
                const isActive = index === currentSegmentIndex
                const isHovered = index === hoveredSegment

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
                      className={`segment-mark ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`
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
    </div>
  )
}
