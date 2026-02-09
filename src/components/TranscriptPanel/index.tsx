import { useMemo, useRef, useEffect, useState } from 'react'
import { Card, Typography, Tag, Tooltip, Button } from 'antd'
import { PushpinOutlined, QuestionCircleOutlined, CheckCircleOutlined, StopOutlined, FileTextOutlined } from '@ant-design/icons'
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

export default function TranscriptPanel({
  paragraphs,
  currentTime,
  onSentenceClick
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeGroupRef = useRef<HTMLDivElement>(null)
  const [forceScrollSentence, setForceScrollSentence] = useState<TranscriptSentence | null>(null)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const [groupMarks, setGroupMarks] = useState<Record<string, MarkType>>({})
  const [selectionMenu, setSelectionMenu] = useState<{
    visible: boolean
    x: number
    y: number
    timeMs: number
    text: string
  }>({ visible: false, x: 0, y: 0, timeMs: 0, text: '' })

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

  // 当前时间对应的句子
  const currentSentence = useMemo(() => {
    const currentMs = currentTime * 1000
    for (const paragraph of paragraphs) {
      for (const sentence of paragraph.sc) {
        if (currentMs >= sentence.bt && currentMs <= sentence.et) {
          return sentence
        }
      }
    }
    return null
  }, [paragraphs, currentTime])

  // 当前时间对应的组
  const currentGroup = useMemo(() => {
    if (!currentSentence) return null
    return speakerGroups.find(group =>
      group.sentences.some(s => s.id === currentSentence.id)
    ) || null
  }, [currentSentence, speakerGroups])

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

  // 处理组点击
  const handleGroupClick = (group: SpeakerGroup) => {
    onSentenceClick?.(group.startTime)
  }

  // 处理文本选中后的浮窗菜单
  const handleTextSelection = (group: SpeakerGroup, containerEl: HTMLElement | null) => {
    if (!containerEl) return
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim() || ''
    if (!selection || !selectedText) {
      setSelectionMenu(prev => ({ ...prev, visible: false }))
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

    // 使用 fixed 定位：跟随视口，不受滚动容器影响
    setSelectionMenu({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 10,
      timeMs: group.startTime,
      text: selectedText
    })
  }

  return (
    <Card
      className="transcript-panel"
      title="转写文本"
      ref={containerRef}
    >
      {/* 选中文本后的操作浮窗 */}
      {selectionMenu.visible && (
        <div
          className="selection-menu"
          style={{ left: selectionMenu.x, top: selectionMenu.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button
            type="text"
            className="selection-menu-item"
            icon={<FileTextOutlined />}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('oneClickSummary', {
                detail: { timeMs: selectionMenu.timeMs, text: selectionMenu.text }
              }))
              window.getSelection()?.removeAllRanges()
              setSelectionMenu(prev => ({ ...prev, visible: false }))
            }}
          >
            一键摘要
          </Button>
        </div>
      )}

      <div className="transcript-content">
        {speakerGroups.map((group) => {
          const isActive = currentGroup?.id === group.id
          const isForceActive = forceScrollGroup?.id === group.id
          const shouldHighlight = isActive || isForceActive
          const isHovered = hoveredGroupId === group.id
          const markType = groupMarks[group.id] ?? null
          const markedClassName = markType ? `marked-${markType}` : ''
          const previewText = group.text.length > 18 ? `${group.text.slice(0, 18)}...` : group.text

          return (
            <div
              key={group.id}
              ref={shouldHighlight ? activeGroupRef : null}
              className={`speaker-group ${shouldHighlight ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
              onClick={() => handleGroupClick(group)}
              onMouseEnter={() => setHoveredGroupId(group.id)}
              onMouseLeave={() => setHoveredGroupId(prev => (prev === group.id ? null : prev))}
            >
              {/* 右上角标记按钮：仅 hover 时显示 */}
              <div className={`group-actions ${isHovered ? 'visible' : ''}`} onClick={(e) => e.stopPropagation()}>
                <Tooltip
                  title="标记为重点"
                  placement="top"
                  overlayClassName="mark-tooltip-overlay"
                >
                  <Button
                    type="text"
                    size="small"
                    className={`mark-btn mark-important ${markType === 'important' ? 'active' : ''}`}
                    icon={<PushpinOutlined />}
                    onClick={() => {
                      setGroupMarks(prev => ({ ...prev, [group.id]: 'important' }))
                      window.dispatchEvent(new CustomEvent('transcriptMarkChange', {
                        detail: { groupId: group.id, type: 'important', timeMs: group.startTime, text: previewText }
                      }))
                    }}
                  />
                </Tooltip>
                <Tooltip
                  title="标记为问题"
                  placement="top"
                  overlayClassName="mark-tooltip-overlay"
                >
                  <Button
                    type="text"
                    size="small"
                    className={`mark-btn mark-question ${markType === 'question' ? 'active' : ''}`}
                    icon={<QuestionCircleOutlined />}
                    onClick={() => {
                      setGroupMarks(prev => ({ ...prev, [group.id]: 'question' }))
                      window.dispatchEvent(new CustomEvent('transcriptMarkChange', {
                        detail: { groupId: group.id, type: 'question', timeMs: group.startTime, text: previewText }
                      }))
                    }}
                  />
                </Tooltip>
                <Tooltip
                  title="标记为待办"
                  placement="top"
                  overlayClassName="mark-tooltip-overlay"
                >
                  <Button
                    type="text"
                    size="small"
                    className={`mark-btn mark-todo ${markType === 'todo' ? 'active' : ''}`}
                    icon={<CheckCircleOutlined />}
                    onClick={() => {
                      setGroupMarks(prev => ({ ...prev, [group.id]: 'todo' }))
                      window.dispatchEvent(new CustomEvent('transcriptMarkChange', {
                        detail: { groupId: group.id, type: 'todo', timeMs: group.startTime, text: previewText }
                      }))
                    }}
                  />
                </Tooltip>
                <Tooltip
                  title="取消标记"
                  placement="top"
                  overlayClassName="mark-tooltip-overlay"
                >
                  <Button
                    type="text"
                    size="small"
                    className="mark-btn mark-clear"
                    icon={<StopOutlined />}
                    onClick={() => {
                      setGroupMarks(prev => ({ ...prev, [group.id]: null }))
                      window.dispatchEvent(new CustomEvent('transcriptMarkChange', {
                        detail: { groupId: group.id, type: null, timeMs: group.startTime, text: previewText }
                      }))
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
                onMouseUp={(e) => {
                  const el = e.currentTarget as unknown as HTMLElement
                  handleTextSelection(group, el)
                }}
                onMouseDown={() => setSelectionMenu(prev => ({ ...prev, visible: false }))}
              >
                {group.text}
              </Text>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
