import { useState, useRef } from 'react'
import { Button, Tooltip, Input, Select, Space } from 'antd'
import { 
  CloseOutlined, 
  BoldOutlined, 
  ItalicOutlined, 
  UnderlineOutlined,
  PictureOutlined
} from '@ant-design/icons'
import './index.css'

const { TextArea } = Input
const { Option } = Select

interface NoteItem {
  id: string
  timestamp: number
  imageUrl: string
  content: string
  createdAt: Date
}

interface NotePanelProps {
  isOpen: boolean
  onClose: () => void
  notes: NoteItem[]
  onAddNote: (note: NoteItem) => void
  onUpdateNote: (id: string, content: string) => void
}

export default function NotePanel({ 
  isOpen, 
  onClose, 
  notes, 
  onUpdateNote 
}: NotePanelProps) {
  const [fontSize, setFontSize] = useState('14')
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="note-panel">
      {/* 顶部标题栏 */}
      <div className="note-panel-header">
        <span className="note-panel-title">笔记</span>
        <Button 
          type="text" 
          icon={<CloseOutlined />} 
          onClick={onClose}
          className="close-btn"
        />
      </div>

      {/* 工具栏 */}
      <div className="note-toolbar">
        <Space>
          <Tooltip title="字体大小">
            <Select
              value={fontSize}
              onChange={setFontSize}
              className="font-size-select"
              popupMatchSelectWidth={false}
            >
              <Option value="12">12</Option>
              <Option value="14">14</Option>
              <Option value="16">16</Option>
              <Option value="18">18</Option>
              <Option value="20">20</Option>
              <Option value="24">24</Option>
            </Select>
          </Tooltip>
          
          <Tooltip title="加粗">
            <Button 
              type={isBold ? 'primary' : 'text'}
              icon={<BoldOutlined />}
              onClick={() => setIsBold(!isBold)}
              size="small"
            />
          </Tooltip>
          
          <Tooltip title="斜体">
            <Button 
              type={isItalic ? 'primary' : 'text'}
              icon={<ItalicOutlined />}
              onClick={() => setIsItalic(!isItalic)}
              size="small"
            />
          </Tooltip>
          
          <Tooltip title="下划线">
            <Button 
              type={isUnderline ? 'primary' : 'text'}
              icon={<UnderlineOutlined />}
              onClick={() => setIsUnderline(!isUnderline)}
              size="small"
            />
          </Tooltip>
        </Space>
      </div>

      {/* 笔记内容区域 */}
      <div className="note-content" ref={contentRef}>
        {notes.length === 0 ? (
          <div className="empty-notes">
            <PictureOutlined className="empty-icon" />
            <p>点击"截屏笔记"按钮添加笔记</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="note-item">
              {/* 时间戳 */}
              <div className="note-timestamp">
                <span className="time-badge">{formatTime(note.timestamp)}</span>
                <span className="create-time">
                  {note.createdAt.toLocaleTimeString()}
                </span>
              </div>
              
              {/* 截图 */}
              <div className="note-image-container">
                <img 
                  src={note.imageUrl} 
                  alt={`截图 ${formatTime(note.timestamp)}`}
                  className="note-image"
                />
              </div>
              
              {/* 文字编辑区 */}
              <TextArea
                className="note-textarea"
                placeholder="在此输入笔记内容..."
                value={note.content}
                onChange={(e) => onUpdateNote(note.id, e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
                style={{
                  fontSize: `${fontSize}px`,
                  fontWeight: isBold ? 'bold' : 'normal',
                  fontStyle: isItalic ? 'italic' : 'normal',
                  textDecoration: isUnderline ? 'underline' : 'none'
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
