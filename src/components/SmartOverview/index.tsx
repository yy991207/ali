import { useState, useRef, useEffect } from 'react'
import { Card, Tag, Timeline, Typography, Tabs, Button } from 'antd'
import { ClockCircleOutlined, TagOutlined, FileTextOutlined, MessageOutlined, QuestionCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { AgendaItem, KeywordItem, RoleSummaryItem } from '../../types'
import { formatTimeFromMs } from '../../utils/time'
import './index.css'

const { Text, Paragraph } = Typography

interface SmartOverviewProps {
  keywords: KeywordItem[]
  agendaItems: AgendaItem[]
  roleSummary: RoleSummaryItem[]
  fullSummary: string
  currentTime: number
  onAgendaClick?: (item: AgendaItem) => void
}

export default function SmartOverview({
  keywords,
  agendaItems,
  roleSummary,
  fullSummary,
  currentTime,
  onAgendaClick
}: SmartOverviewProps) {
  const [activeTab, setActiveTab] = useState('agenda')
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [keywordsExpanded, setKeywordsExpanded] = useState(false)
  const [selectedAgendaId, setSelectedAgendaId] = useState<number | null>(null)
  const agendaListRef = useRef<HTMLDivElement>(null)

  // 默认显示的关键词数量
  const DEFAULT_KEYWORDS_COUNT = 8
  const displayedKeywords = keywordsExpanded ? keywords : keywords.slice(0, DEFAULT_KEYWORDS_COUNT)
  const hasMoreKeywords = keywords.length > DEFAULT_KEYWORDS_COUNT

  // 判断议程项是否正在进行
  const isActiveAgenda = (item: AgendaItem) => {
    if (item.time === undefined || item.endTime === undefined) return false
    const currentMs = currentTime * 1000
    return currentMs >= item.time && currentMs <= item.endTime
  }

  // 处理点击外部取消选中
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agendaListRef.current && !agendaListRef.current.contains(event.target as Node)) {
        setSelectedAgendaId(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 渲染章节速览列表
  const renderAgendaList = () => (
    <div className="agenda-list" ref={agendaListRef}>
      {agendaItems.map((item, index) => {
        const isPlaying = isActiveAgenda(item)
        const isSelected = selectedAgendaId === item.id
        const isLast = index === agendaItems.length - 1

        return (
          <div
            key={item.id}
            className={`agenda-item ${isPlaying ? 'playing' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedAgendaId(item.id)
              onAgendaClick?.(item)
            }}
          >
            {/* 左侧时间单元（时间戳 + 原点 + 虚线） */}
            <div className="agenda-time-unit">
              <div className="agenda-time-row">
                {item.time !== undefined && (
                  <div className="agenda-time-left">
                    {formatTimeFromMs(item.time)}
                  </div>
                )}
                <div className={`timeline-dot ${isSelected ? 'active' : ''}`} />
              </div>
              {!isLast && <div className="timeline-line" />}
            </div>

            {/* 内容区域 */}
            <div className="agenda-content">
              <div className="agenda-header">
                <Text className="agenda-title" strong={isPlaying}>
                  {item.value}
                </Text>
                {/* 回顾图标 */}
                <span className="review-icon">
                  <ClockCircleOutlined />
                  回顾
                </span>
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
          </div>
        )
      })}
    </div>
  )

  const tabItems = [
    {
      key: 'agenda',
      label: (
        <span className="tab-label">
          <ClockCircleOutlined />
          章节速览
        </span>
      ),
      children: renderAgendaList()
    },
    {
      key: 'summary',
      label: (
        <span className="tab-label">
          <MessageOutlined />
          发言总结
        </span>
      ),
      children: (
        <div className="role-summary-list">
          {roleSummary.map((role) => (
            <div key={role.id} className="role-summary-item">
              <Tag color="blue">发言人 {role.speaker}</Tag>
              <Paragraph className="role-summary-text">
                {role.value}
              </Paragraph>
            </div>
          ))}
        </div>
      )
    },
    {
      key: 'qa',
      label: (
        <span className="tab-label">
          <QuestionCircleOutlined />
          问答回顾
        </span>
      ),
      children: (
        <div className="qa-placeholder">
          问答回顾内容
        </div>
      )
    }
  ]

  return (
    <div className="smart-overview">
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
        <div className="keywords-wrapper">
          <div className={`keywords-list ${keywordsExpanded ? 'expanded' : 'collapsed'}`}>
            {keywords.map((keyword) => (
              <Tag
                key={keyword.id}
                className="keyword-tag"
              >
                {keyword.value}
              </Tag>
            ))}
          </div>
          {hasMoreKeywords && (
            <Button
              type="link"
              size="small"
              className="keywords-expand-btn"
              onClick={() => setKeywordsExpanded(!keywordsExpanded)}
            >
              {keywordsExpanded ? '收起' : '展开全部'}
            </Button>
          )}
        </div>
      </Card>

      {/* 全文概要区域 */}
      {fullSummary && (
        <Card 
          className="summary-card"
          title={
            <div className="card-title">
              <FileTextOutlined />
              <span>全文概要</span>
            </div>
          }
        >
          <div className="summary-wrapper">
            <div className={`full-summary ${summaryExpanded ? 'expanded' : 'collapsed'}`}>
              {fullSummary}
              <span 
                className="summary-expand-inline"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
              >
                {summaryExpanded ? ' 收起' : '...展开全部'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* 章节速览/发言总结/问答回顾 Tab */}
      <Card className="tabs-card">
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={tabItems}
          className="overview-tabs"
        />
      </Card>
    </div>
  )
}
