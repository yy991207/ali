import { Card, Tag, Timeline, Typography } from 'antd'
import { ClockCircleOutlined, TagOutlined } from '@ant-design/icons'
import { AgendaItem, KeywordItem } from '../../types'
import { formatTimeFromMs } from '../../utils/time'
import './index.css'

const { Text, Paragraph } = Typography

interface SidePanelProps {
  agendaItems: AgendaItem[]
  keywords: KeywordItem[]
  currentTime: number
  onAgendaClick?: (item: AgendaItem) => void
}

export default function SidePanel({ 
  agendaItems, 
  keywords,
  currentTime,
  onAgendaClick 
}: SidePanelProps) {
  
  // 判断议程项是否正在进行
  const isActiveAgenda = (item: AgendaItem) => {
    if (item.time === undefined || item.endTime === undefined) return false
    const currentMs = currentTime * 1000
    return currentMs >= item.time && currentMs <= item.endTime
  }

  // 构建 Timeline items 数组
  const timelineItems = agendaItems.map((item) => {
    const isActive = isActiveAgenda(item)
    
    return {
      key: item.id,
      color: isActive ? '#605ce5' : 'gray',
      children: (
        <div 
          className={`agenda-item ${isActive ? 'active' : ''}`}
          onClick={() => onAgendaClick?.(item)}
        >
          <div className="agenda-header">
            <Text className="agenda-title" strong={isActive}>
              {item.value}
            </Text>
            {item.time !== undefined && (
              <Tag className="agenda-time">
                {formatTimeFromMs(item.time)}
              </Tag>
            )}
          </div>
          
          {item.summary && (
            <Paragraph 
              className="agenda-summary"
              ellipsis={{ rows: 2 }}
            >
              {item.summary}
            </Paragraph>
          )}
        </div>
      )
    }
  })

  return (
    <div className="side-panel">
      {/* 关键词区域 */}
      <Card 
        className="keywords-card"
        title={
          <div className="card-title">
            <TagOutlined />
            <span>关键词</span>
          </div>
        }
      >
        <div className="keywords-list">
          {keywords.map((keyword) => (
            <Tag 
              key={keyword.id}
              className="keyword-tag"
              color="processing"
            >
              {keyword.value}
            </Tag>
          ))}
        </div>
      </Card>

      {/* 章节速览区域 */}
      <Card 
        className="agenda-card"
        title={
          <div className="card-title">
            <ClockCircleOutlined />
            <span>章节速览</span>
          </div>
        }
      >
        <Timeline className="agenda-timeline" items={timelineItems} />
      </Card>
    </div>
  )
}
