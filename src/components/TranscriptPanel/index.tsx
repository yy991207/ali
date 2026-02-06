import { useMemo, useRef, useEffect, useState } from 'react'
import { Card, Typography, Tag } from 'antd'
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

export default function TranscriptPanel({
  paragraphs,
  currentTime,
  onSentenceClick
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeGroupRef = useRef<HTMLDivElement>(null)
  const [forceScrollSentence, setForceScrollSentence] = useState<TranscriptSentence | null>(null)

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

  return (
    <Card
      className="transcript-panel"
      title="转写文本"
      ref={containerRef}
    >
      <div className="transcript-content">
        {speakerGroups.map((group) => {
          const isActive = currentGroup?.id === group.id
          const isForceActive = forceScrollGroup?.id === group.id
          const shouldHighlight = isActive || isForceActive

          return (
            <div
              key={group.id}
              ref={shouldHighlight ? activeGroupRef : null}
              className={`speaker-group ${shouldHighlight ? 'active' : ''}`}
              onClick={() => handleGroupClick(group)}
            >
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
              <Text className="group-text">{group.text}</Text>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
