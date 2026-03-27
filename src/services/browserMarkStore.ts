import { runtimeConfig } from './runtimeConfig'

export interface StoredGroupMark {
  groupId: string
  type: 'important' | 'question' | 'todo'
  timeMs: number
  text: string
}

export interface StoredTextMark {
  id: string
  groupId: string
  startTimeMs: number
  endTimeMs: number
  text: string
  type: 'important' | 'question' | 'todo'
  color: string
}

export interface StoredMarkPayload {
  groupMarks: StoredGroupMark[]
  textMarks: StoredTextMark[]
}

const EMPTY_MARK_PAYLOAD: StoredMarkPayload = {
  groupMarks: [],
  textMarks: []
}

class BrowserMarkStore {
  private getStorageKey() {
    return runtimeConfig.markStorageKey
  }

  load(): StoredMarkPayload {
    // 这里改成浏览器本地持久化，删除 8000 服务后仍然能保留当前资源的标记状态
    try {
      const rawValue = window.localStorage.getItem(this.getStorageKey())
      if (!rawValue) {
        return EMPTY_MARK_PAYLOAD
      }
      const parsed = JSON.parse(rawValue) as Partial<StoredMarkPayload>
      return {
        groupMarks: Array.isArray(parsed.groupMarks) ? parsed.groupMarks : [],
        textMarks: Array.isArray(parsed.textMarks) ? parsed.textMarks : []
      }
    } catch {
      return EMPTY_MARK_PAYLOAD
    }
  }

  save(payload: StoredMarkPayload) {
    window.localStorage.setItem(this.getStorageKey(), JSON.stringify(payload))
  }
}

export const browserMarkStore = new BrowserMarkStore()
