/**
 * 格式化时间（秒 -> MM:SS 或 HH:MM:SS）
 */
export function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '00:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * 格式化时间（毫秒 -> MM:SS 或 HH:MM:SS）
 */
export function formatTimeFromMs(ms: number): string {
  return formatTime(ms / 1000)
}

/**
 * 解析时间字符串为秒数
 */
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  
  return parts[0] || 0
}
