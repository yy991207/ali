import { useMemo, useRef, useEffect, useState, useCallback, memo } from 'react'
import { Card, Typography, Tag, Tooltip, Button } from 'antd'
import { PushpinOutlined, QuestionCircleOutlined, CheckCircleOutlined, StopOutlined, FileTextOutlined, SoundOutlined } from '@ant-design/icons'
import { TranscriptParagraph, TranscriptSentence } from '../../types'
import { formatTimeFromMs } from '../../utils/time'
import './index.css'

const { Text } = Typography

// 合并后的发言组
interface SpeakerGroup {
  id: string
  speakerId: number
  startTime: number
  endTime: number
  sentences: TranscriptSentence[]
  text: string
}

interface TranscriptPanelProps {
  paragraphs: TranscriptParagraph[]
  currentTime: number
  onSentenceClick?: (time: number) => void
}

type MarkType = 'important' | 'question' | 'todo' | null

// SpeakerGroupItem 组件定义在 TranscriptPanel 外部，通过 props 接收 textMarks
interface SpeakerGroupItemProps {
  group: SpeakerGroup
  shouldHighlight: boolean
  isSelected: boolean
  markType: MarkType
  markedClassName: string
  previewText: string
  activeGroupRef: React.RefObject<HTMLDivElement | null>
  onSelect: (group: SpeakerGroup) => void
  onMarkChange: (group: SpeakerGroup, type: MarkType, previewText: string) => void
  onTextMouseUp: (group: SpeakerGroup, el: HTMLElement) => void
  onTextMouseDown: () => void
  textMarks: Array<{
    id: string
    groupId: string
    startTimeMs: number
    endTimeMs: number
    text: string
    type: 'important' | 'question' | 'todo'
    color: string
  }>
}

const SpeakerGroupItem = memo(function SpeakerGroupItem({
  group,
  shouldHighlight,
  isSelected,
  markType,
  markedClassName,
  previewText,
  activeGroupRef,
  onSelect,
  onMarkChange,
  onTextMouseUp,
  onTextMouseDown,
  textMarks
}: SpeakerGroupItemProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    // 检查是否有文本被选中
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() || ''
    
    // 如果有选中的文本，不触发整段选中
    if (selectedText.length > 0) {
      return
    }
    onSelect(group)
  }, [group, onSelect])

  // 渲染带高亮的文本 - 使用与整段标记相同的样式
  const renderHighlightedText = useCallback(() => {
    if (!textMarks || textMarks.length === 0) {
      return group.text
    }

    // 获取当前组的文本标记
    const groupMarks = textMarks.filter(mark => mark.groupId === group.id)
    if (groupMarks.length === 0) {
      return group.text
    }

    // 按文本位置排序
    const sortedMarks = [...groupMarks].sort((a, b) => {
      const idxA = group.text.indexOf(a.text)
      const idxB = group.text.indexOf(b.text)
      return idxA - idxB
    })

    const parts: React.ReactNode[] = []
    let lastIndex = 0

    sortedMarks.forEach((mark, index) => {
      const markIndex = group.text.indexOf(mark.text, lastIndex)
      if (markIndex === -1) return

      // 添加标记前的普通文本
      if (markIndex > lastIndex) {
        parts.push(
          <span key={`text-${index}-before`}>
            {group.text.substring(lastIndex, markIndex)}
          </span>
        )
      }

      // 添加高亮标记的文本 - 复用整段标记的样式
      parts.push(
        <span
          key={`mark-${mark.id}`}
          className={`text-mark-highlight ${mark.type ? `marked-${mark.type}` : ''}`}
          data-mark-id={mark.id}
        >
          {mark.text}
        </span>
      )

      lastIndex = markIndex + mark.text.length
    })

    // 添加剩余的普通文本
    if (lastIndex < group.text.length) {
      parts.push(
        <span key="text-end">
          {group.text.substring(lastIndex)}
        </span>
      )
    }

    return parts
  }, [group.text, group.id, textMarks])

  return (
    <div
      ref={shouldHighlight ? activeGroupRef : null}
      className={`speaker-group ${shouldHighlight ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      {/* 右上角标记按钮：仅 hover 时显示 */}
      <div className="group-actions" onClick={(e) => e.stopPropagation()}>
        <Tooltip title="标记为重点" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
          <Button
            type="text"
            size="small"
            className={`mark-btn mark-important ${markType === 'important' ? 'active' : ''}`}
            icon={<PushpinOutlined />}
            onClick={() => {
              onMarkChange(group, 'important', previewText)
            }}
          />
        </Tooltip>
        <Tooltip title="标记为问题" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
          <Button
            type="text"
            size="small"
            className={`mark-btn mark-question ${markType === 'question' ? 'active' : ''}`}
            icon={<QuestionCircleOutlined />}
            onClick={() => {
              onMarkChange(group, 'question', previewText)
            }}
          />
        </Tooltip>
        <Tooltip title="标记为待办" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
          <Button
            type="text"
            size="small"
            className={`mark-btn mark-todo ${markType === 'todo' ? 'active' : ''}`}
            icon={<CheckCircleOutlined />}
            onClick={() => {
              onMarkChange(group, 'todo', previewText)
            }}
          />
        </Tooltip>
        <Tooltip title="取消标记" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
          <Button
            type="text"
            size="small"
            className="mark-btn mark-clear"
            icon={<StopOutlined />}
            onClick={() => {
              onMarkChange(group, null, previewText)
            }}
          />
        </Tooltip>
      </div>

      {/* 头部信息：时间戳和发言人 */}
      <div className="group-header">
        <Tag className="timestamp">
          {formatTimeFromMs(group.startTime)}
        </Tag>
        <Tag className="speaker" color="blue">
          发言人 {group.speakerId}
        </Tag>
      </div>

      {/* 文本内容 */}
      <Text
        className={`group-text ${markedClassName}`}
        onMouseUp={(e) => onTextMouseUp(group, e.currentTarget as unknown as HTMLElement)}
        onMouseDown={onTextMouseDown}
      >
        {renderHighlightedText()}
      </Text>
    </div>
  )
}, (prev, next) => {
  return prev.group === next.group &&
    prev.shouldHighlight === next.shouldHighlight &&
    prev.isSelected === next.isSelected &&
    prev.markType === next.markType &&
    prev.markedClassName === next.markedClassName &&
    prev.previewText === next.previewText &&
    prev.textMarks === next.textMarks
})

export default function TranscriptPanel({
  paragraphs,
  currentTime,
  onSentenceClick
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeGroupRef = useRef<HTMLDivElement>(null)
  const isSelectingRef = useRef(false)
  const selectionRangeRef = useRef<Range | null>(null)
  const selectionMenuRafRef = useRef<number | null>(null)
  const selectionMenuRef = useRef<HTMLDivElement | null>(null)
  const [forceScrollSentence, setForceScrollSentence] = useState<TranscriptSentence | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupMarks, setGroupMarks] = useState<Record<string, MarkType>>({})
  const [renderTimeMs, setRenderTimeMs] = useState(0)
  const [selectionMenu, setSelectionMenu] = useState<{
    visible: boolean
    x: number
    y: number
    startTimeMs: number
    text: string
    anchorGroupId?: string
  }>({ visible: false, x: 0, y: 0, startTimeMs: 0, text: '', anchorGroupId: undefined })
  
  // 文本标记状态：存储选中文本的标记信息
  const [textMarks, setTextMarks] = useState<Array<{
    id: string
    groupId: string
    startTimeMs: number
    endTimeMs: number
    text: string
    type: 'important' | 'question' | 'todo'
    color: string
  }>>([])

  const getScrollContainerEl = useCallback(() => {
    // antd Card 可滚动区域在 .ant-card-body
    return (containerRef.current?.querySelector('.ant-card-body') as HTMLDivElement | null) || null
  }, [])

  const updateSelectionMenuPosition = useCallback((range: Range | null, anchorGroupId?: string) => {
    const scrollEl = getScrollContainerEl()
    if (!scrollEl) return

    if (anchorGroupId) {
      const anchor = scrollEl.querySelector(`[data-group-id="${anchorGroupId}"]`) as HTMLElement | null
      if (!anchor) return
      const menuWidth = selectionMenuRef.current?.offsetWidth || 0
      const scrollLeft = scrollEl.scrollLeft
      const maxX = scrollLeft + scrollEl.clientWidth - menuWidth - 12
      const minX = scrollLeft + 12
      const preferredX = anchor.offsetLeft + anchor.offsetWidth - (menuWidth || 160) - 12
      const x = Math.max(minX, Math.min(maxX, preferredX))
      const y = anchor.offsetTop + anchor.offsetHeight + 8
      setSelectionMenu(prev => {
        if (!prev.visible) return prev
        if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) return prev
        return { ...prev, x, y }
      })
      return
    }

    if (!range) return
    const rangeRect = range.getBoundingClientRect()
    if (!rangeRect || rangeRect.width === 0 || rangeRect.height === 0) return

    const scrollRect = scrollEl.getBoundingClientRect()
    const centerX = rangeRect.left + rangeRect.width / 2
    const bottomY = rangeRect.bottom

    const x = centerX - scrollRect.left + scrollEl.scrollLeft
    const y = bottomY - scrollRect.top + scrollEl.scrollTop + 12

    setSelectionMenu(prev => {
      if (!prev.visible) return prev
      if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) return prev
      return { ...prev, x, y }
    })
  }, [getScrollContainerEl])

  // 将所有句子按发言人合并成组（连续的同一个人说的话合并）
  const speakerGroups = useMemo(() => {
    const groups: SpeakerGroup[] = []
    let currentGroup: SpeakerGroup | null = null

    // 遍历所有段落和句子
    for (const paragraph of paragraphs) {
      for (const sentence of paragraph.sc) {
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
            sentences: [sentence],
            text: sentence.tc
          }
        } else {
          // 同一个发言人，合并到当前组
          currentGroup.endTime = sentence.et
          currentGroup.sentences.push(sentence)
          currentGroup.text += sentence.tc
        }
      }
    }

    // 添加最后一组
    if (currentGroup) {
      groups.push(currentGroup)
    }

    return groups
  }, [paragraphs])

  // 把所有句子拍平成列表，便于用二分查找提升性能
  const allSentences = useMemo(() => {
    const sentences: TranscriptSentence[] = []
    for (const paragraph of paragraphs) {
      if (!paragraph?.sc) continue
      sentences.push(...paragraph.sc)
    }
    return sentences.sort((a, b) => a.bt - b.bt)
  }, [paragraphs])

  // sentenceId -> group 映射，避免每次都在 groups 里扫
  const sentenceIdToGroupId = useMemo(() => {
    const map = new Map<number, string>()
    for (const group of speakerGroups) {
      for (const s of group.sentences) {
        map.set(s.id, group.id)
      }
    }
    return map
  }, [speakerGroups])

  // 降频渲染：视频 currentTime 变化很频繁，直接驱动整列表重渲染会导致选中文字时卡顿
  useEffect(() => {
    const nextMs = currentTime * 1000
    if (selectionMenu.visible || isSelectingRef.current) return

    // 只有变化足够大才触发 state 更新，避免每帧重渲染
    if (Math.abs(nextMs - renderTimeMs) < 180) return
    setRenderTimeMs(nextMs)
  }, [currentTime, renderTimeMs, selectionMenu.visible])

  const currentSentence = useMemo(() => {
    const currentMs = renderTimeMs
    if (allSentences.length === 0) return null

    // 二分查找：找最后一个 bt <= currentMs 的句子
    let left = 0
    let right = allSentences.length - 1
    let candidate = -1
    while (left <= right) {
      const mid = (left + right) >> 1
      if (allSentences[mid].bt <= currentMs) {
        candidate = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }
    if (candidate === -1) return null

    const sentence = allSentences[candidate]
    return currentMs <= sentence.et ? sentence : null
  }, [allSentences, renderTimeMs])

  // 当前时间对应的组
  const currentGroup = useMemo(() => {
    if (!currentSentence) return null
    const groupId = sentenceIdToGroupId.get(currentSentence.id)
    if (!groupId) return null
    return speakerGroups.find(g => g.id === groupId) || null
  }, [currentSentence, sentenceIdToGroupId, speakerGroups])

  // 强制滚动对应的组
  const forceScrollGroup = useMemo(() => {
    if (!forceScrollSentence) return null
    return speakerGroups.find(group =>
      group.sentences.some(s => s.id === forceScrollSentence.id)
    ) || null
  }, [forceScrollSentence, speakerGroups])

  // 监听 sentenceChange 事件
  useEffect(() => {
    const handleSentenceChange = (event: CustomEvent<TranscriptSentence>) => {
      setForceScrollSentence(event.detail)
    }

    window.addEventListener('sentenceChange', handleSentenceChange as EventListener)
    return () => {
      window.removeEventListener('sentenceChange', handleSentenceChange as EventListener)
    }
  }, [])

  // 自动滚动到当前组
  useEffect(() => {
    const targetGroup = forceScrollGroup || currentGroup
    if (targetGroup && activeGroupRef.current && containerRef.current) {
      activeGroupRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
      if (forceScrollSentence) {
        setForceScrollSentence(null)
      }
    }
  }, [currentGroup, forceScrollGroup, forceScrollSentence])

  // 处理文本选中后的浮窗菜单
  const handleTextSelection = useCallback((group: SpeakerGroup, containerEl: HTMLElement | null) => {
    if (!containerEl) return
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() || ''
    if (!selection || !selectedText) {
      setSelectionMenu(prev => ({ ...prev, visible: false }))
      selectionRangeRef.current = null
      return
    }

    // 确保选区在当前段落内
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
    if (!range) return
    const commonAncestor = range.commonAncestorContainer
    const anchorEl = commonAncestor instanceof Element ? commonAncestor : commonAncestor.parentElement
    if (!anchorEl || !containerEl.contains(anchorEl)) {
      setSelectionMenu(prev => ({ ...prev, visible: false }))
      return
    }

    const rect = range.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return

    // 计算选中文段的开始时间：尽量贴近选区起点，而不是整段开始时间
    const computeSelectionStartTimeMs = () => {
      try {
        const startRange = document.createRange()
        startRange.selectNodeContents(containerEl)
        startRange.setEnd(range.startContainer, range.startOffset)
        const prefixTextLength = startRange.toString().length

        let cursor = 0
        for (const sentence of group.sentences) {
          const sentenceText = sentence.tc || ''
          const nextCursor = cursor + sentenceText.length
          if (prefixTextLength <= nextCursor) {
            const offsetInSentence = Math.max(0, prefixTextLength - cursor)
            const ratio = sentenceText.length > 0 ? offsetInSentence / sentenceText.length : 0
            return sentence.bt + ratio * (sentence.et - sentence.bt)
          }
          cursor = nextCursor
        }
        return group.startTime
      } catch {
        return group.startTime
      }
    }

    const selectionStartTimeMs = computeSelectionStartTimeMs()

    // 记录 range：用于滚动时跟随更新位置
    selectionRangeRef.current = range.cloneRange()

    // 使用 absolute 定位：直接放在该文段下方右侧，避免遮挡正文
    const scrollEl = getScrollContainerEl()
    const groupEl = containerEl.closest('.speaker-group') as HTMLElement | null
    const centerX = rect.left + rect.width / 2
    const bottomY = rect.bottom
    const menuWidth = selectionMenuRef.current?.offsetWidth || 0
    const preferredX = groupEl ? (groupEl.offsetLeft + groupEl.offsetWidth - (menuWidth || 160) - 12) : centerX
    const scrollLeft = scrollEl?.scrollLeft || 0
    const maxX = scrollEl ? (scrollLeft + scrollEl.clientWidth - menuWidth - 12) : preferredX
    const minX = scrollEl ? (scrollLeft + 12) : preferredX
    const x = scrollEl ? Math.max(minX, Math.min(maxX, preferredX)) : preferredX
    const y = groupEl ? (groupEl.offsetTop + groupEl.offsetHeight + 8) : (bottomY + 12)

    setSelectionMenu({
      visible: true,
      x,
      y,
      startTimeMs: selectionStartTimeMs,
      text: selectedText,
      anchorGroupId: group.id
    })
  }, [getScrollContainerEl])

  // 浮窗跟随滚动：选区不变时，滚动也要同步更新位置
  useEffect(() => {
    const scrollEl = getScrollContainerEl()
    if (!scrollEl) return

    const handleScroll = () => {
      if (!selectionMenu.visible) return
      const range = selectionRangeRef.current
      const anchorId = selectionMenu.anchorGroupId
      if (!range && !anchorId) return
      if (selectionMenuRafRef.current !== null) return
      selectionMenuRafRef.current = window.requestAnimationFrame(() => {
        selectionMenuRafRef.current = null
        updateSelectionMenuPosition(range, anchorId)
      })
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    return () => {
      if (selectionMenuRafRef.current !== null) {
        window.cancelAnimationFrame(selectionMenuRafRef.current)
        selectionMenuRafRef.current = null
      }
      scrollEl.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [selectionMenu.visible, selectionMenu.anchorGroupId, updateSelectionMenuPosition])

  useEffect(() => {
    if (!selectionMenu.visible) return
    const rafId = window.requestAnimationFrame(() => {
      updateSelectionMenuPosition(selectionRangeRef.current, selectionMenu.anchorGroupId)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [selectionMenu.visible, selectionMenu.anchorGroupId, updateSelectionMenuPosition])

  // 点击页面其他位置关闭弹窗
  useEffect(() => {
    if (!selectionMenu.visible) return

    const handleClickOutside = (e: MouseEvent) => {
      const menuEl = containerRef.current?.querySelector('.selection-menu')
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setSelectionMenu(prev => ({ ...prev, visible: false }))
        window.getSelection()?.removeAllRanges()
        selectionRangeRef.current = null
      }
    }

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [selectionMenu.visible])

  const handleGroupClickStable = useCallback((group: SpeakerGroup) => {
    setSelectedGroupId(group.id)
    onSentenceClick?.(group.startTime)
  }, [onSentenceClick])

  const handleMarkChange = useCallback((group: SpeakerGroup, type: MarkType, previewText: string) => {
    setGroupMarks(prev => ({ ...prev, [group.id]: type }))
    window.dispatchEvent(new CustomEvent('transcriptMarkChange', {
      detail: { groupId: group.id, type, timeMs: group.startTime, text: previewText }
    }))
  }, [])

  const handleTextMouseUp = useCallback((group: SpeakerGroup, el: HTMLElement) => {
    isSelectingRef.current = false
    handleTextSelection(group, el)
  }, [handleTextSelection])

  const handleTextMouseDown = useCallback(() => {
    isSelectingRef.current = true
    setSelectionMenu(prev => ({ ...prev, visible: false }))
    selectionRangeRef.current = null
  }, [])

  return (
    <Card
      className="transcript-panel"
      title="转写文本"
      ref={containerRef}
    >
      {/* 选中文本后的操作浮窗 */}
      {selectionMenu.visible && (
        <div
          ref={selectionMenuRef}
          className="selection-menu"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="selection-menu-row">
            <span className="selection-menu-row-icon">
              <FileTextOutlined />
            </span>
            <Button
              type="text"
              className="selection-menu-row-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('oneClickSummary', {
                  detail: { timeMs: selectionMenu.startTimeMs, text: selectionMenu.text }
                }))
                window.getSelection()?.removeAllRanges()
                selectionRangeRef.current = null
                setSelectionMenu(prev => ({ ...prev, visible: false }))
              }}
            >
              一键摘取
            </Button>
          </div>

          <div className="selection-menu-row">
            <span className="selection-menu-row-icon">
              <PushpinOutlined />
            </span>
            <span className="selection-menu-row-label">标记</span>
            <div className="selection-menu-mark-actions">
              {(() => {
                const markId = `sel-${Math.round(selectionMenu.startTimeMs)}`
                const preview = selectionMenu.text.length > 18 ? `${selectionMenu.text.slice(0, 18)}...` : selectionMenu.text

                // 颜色配置
                const markColors: Record<string, string> = {
                  important: '#60a5fa', // 蓝色
                  question: '#f472b6',  // 粉色
                  todo: '#fbbf24'       // 黄色
                }

                const dispatchMark = (type: 'important' | 'question' | 'todo' | null) => {
                  if (type && selectionMenu.anchorGroupId) {
                    // 添加文本标记
                    const newMark = {
                      id: markId,
                      groupId: selectionMenu.anchorGroupId,
                      startTimeMs: selectionMenu.startTimeMs,
                      endTimeMs: selectionMenu.startTimeMs + 5000, // 默认5秒时长
                      text: selectionMenu.text,
                      type: type,
                      color: markColors[type]
                    }
                    setTextMarks(prev => [...prev, newMark])
                    
                    // 触发事件通知其他组件（如进度条）
                    window.dispatchEvent(new CustomEvent('textMarkAdded', {
                      detail: newMark
                    }))
                    
                    // 标记后把选区清掉
                    window.getSelection()?.removeAllRanges()
                    selectionRangeRef.current = null
                    setSelectionMenu(prev => ({ ...prev, visible: false }))
                  }
                }

                return (
                  <>
                    <Tooltip title="标记为重点" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
                      <Button
                        type="text"
                        size="small"
                        className="mark-btn mark-important"
                        icon={<PushpinOutlined />}
                        onClick={() => dispatchMark('important')}
                      />
                    </Tooltip>
                    <Tooltip title="标记为问题" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
                      <Button
                        type="text"
                        size="small"
                        className="mark-btn mark-question"
                        icon={<QuestionCircleOutlined />}
                        onClick={() => dispatchMark('question')}
                      />
                    </Tooltip>
                    <Tooltip title="标记为待办" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
                      <Button
                        type="text"
                        size="small"
                        className="mark-btn mark-todo"
                        icon={<CheckCircleOutlined />}
                        onClick={() => dispatchMark('todo')}
                      />
                    </Tooltip>
                    <Tooltip title="取消标记" placement="top" classNames={{ root: 'mark-tooltip-overlay' }}>
                      <Button
                        type="text"
                        size="small"
                        className="mark-btn mark-clear"
                        icon={<StopOutlined />}
                        onClick={() => dispatchMark(null)}
                      />
                    </Tooltip>
                  </>
                )
              })()}
            </div>
          </div>

          <div className="selection-menu-row">
            <span className="selection-menu-row-icon">
              <SoundOutlined />
            </span>
            <Button
              type="text"
              className="selection-menu-row-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('playFromTime', {
                  detail: { timeMs: selectionMenu.startTimeMs }
                }))
                window.getSelection()?.removeAllRanges()
                selectionRangeRef.current = null
                setSelectionMenu(prev => ({ ...prev, visible: false }))
              }}
            >
              播放音频
            </Button>
          </div>
        </div>
      )}

      <div className="transcript-content">
        {speakerGroups.map((group) => {
          const isActive = currentGroup?.id === group.id
          const isForceActive = forceScrollGroup?.id === group.id
          const shouldHighlight = isActive || isForceActive
          const isSelected = selectedGroupId === group.id
          const markType = groupMarks[group.id] ?? null
          const markedClassName = markType ? `marked-${markType}` : ''
          const previewText = group.text.length > 18 ? `${group.text.slice(0, 18)}...` : group.text

          return (
            <SpeakerGroupItem
              key={group.id}
              group={group}
              shouldHighlight={shouldHighlight}
              isSelected={isSelected}
              markType={markType}
              markedClassName={markedClassName}
              previewText={previewText}
              activeGroupRef={activeGroupRef}
              onSelect={handleGroupClickStable}
              onMarkChange={handleMarkChange}
              onTextMouseUp={handleTextMouseUp}
              onTextMouseDown={handleTextMouseDown}
              textMarks={textMarks}
            />
          )
        })}
      </div>
    </Card>
  )
}
