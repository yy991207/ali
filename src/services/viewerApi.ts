import { LabInfoResponse, ParsedTranscript, TransResultResponse } from '../types'
import { runtimeConfig } from './runtimeConfig'

interface PageDataBundle {
  labInfo: LabInfoResponse
  transResult: TransResultResponse
  parsedTranscript: ParsedTranscript
}

interface ApiErrorPayload {
  success?: boolean
  code?: number | string
  message?: string
  result?: unknown
}

type JsonRecord = Record<string, unknown>

const API_BASE_URL = 'https://test-guoren-admin.grtcloud.net/jeecg-boot/resource/aiParse'

const isRecord = (value: unknown): value is JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const unwrapEnvelope = <T>(payload: unknown): T => {
  let current = payload
  while (isRecord(current) && isRecord(current.result)) {
    current = current.result
  }
  return current as T
}

const ensureRuntimeConfig = () => {
  if (!runtimeConfig.token) {
    throw new Error('config.yaml 里缺少 X-Access-Token，当前无法直连真实接口')
  }
  if (!runtimeConfig.resourceId) {
    throw new Error('config.yaml 里缺少 resourceId，当前无法直连真实接口')
  }
}

const normalizeLabInfoResponse = (payload: unknown): LabInfoResponse => {
  const response = unwrapEnvelope<LabInfoResponse>(payload)
  const rawData: JsonRecord = isRecord(response?.data) ? response.data : {}
  const rawLabCardsMap: JsonRecord = isRecord(rawData.labCardsMap) ? rawData.labCardsMap : {}

  return {
    ...response,
    data: {
      ...response.data,
      ...rawData,
      labCardsMap: {
        labSummaryInfo: Array.isArray(rawLabCardsMap.labSummaryInfo)
          ? rawLabCardsMap.labSummaryInfo
          : Array.isArray(rawData.labSummaryInfo)
            ? rawData.labSummaryInfo
            : [],
        labInfo: Array.isArray(rawLabCardsMap.labInfo)
          ? rawLabCardsMap.labInfo
          : Array.isArray(rawData.labInfo)
            ? rawData.labInfo
            : []
      }
    }
  }
}

const normalizeTransResultResponse = (payload: unknown): TransResultResponse => (
  unwrapEnvelope<TransResultResponse>(payload)
)

const normalizeAudioSegments = (transResult: TransResultResponse): TransResultResponse => {
  const nextResult = {
    ...transResult,
    data: {
      ...transResult.data
    }
  }

  const { audioSegments } = nextResult.data
  if (typeof audioSegments === 'string') {
    nextResult.data.audioSegments = JSON.parse(audioSegments)
  }

  return nextResult
}

const parseTranscript = (transResult: TransResultResponse): ParsedTranscript => {
  const rawResult = transResult.data?.result
  if (typeof rawResult !== 'string') {
    throw new Error('转写结果格式不对')
  }
  return JSON.parse(rawResult) as ParsedTranscript
}

const buildApiUrl = (endpoint: string) => {
  const params = new URLSearchParams({
    resourceId: runtimeConfig.resourceId
  })
  return `${API_BASE_URL}/${endpoint}?${params.toString()}`
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json() as ApiErrorPayload
    if (payload?.message) {
      return payload.message
    }
  } catch {
    // 这里吞掉解析异常，统一回退到通用文案
  }
  return `接口请求失败，状态码 ${response.status}`
}

const fetchJson = async <T>(endpoint: string): Promise<T> => {
  ensureRuntimeConfig()
  const response = await fetch(buildApiUrl(endpoint), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Access-Token': runtimeConfig.token
    }
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const payload = await response.json() as ApiErrorPayload
  if (payload?.success === false || String(payload?.code ?? '') === '401') {
    throw new Error(payload.message || '远程接口鉴权失败')
  }

  return payload as T
}

class ViewerApiService {
  async loadPageData(): Promise<PageDataBundle> {
    const [labInfoPayload, transResultPayload] = await Promise.all([
      fetchJson<unknown>('getAllLabInfo'),
      fetchJson<unknown>('getTransResult')
    ])

    const labInfo = normalizeLabInfoResponse(labInfoPayload)
    const transResult = normalizeAudioSegments(normalizeTransResultResponse(transResultPayload))
    const parsedTranscript = parseTranscript(transResult)

    return {
      labInfo,
      transResult,
      parsedTranscript
    }
  }
}

export const viewerApiService = new ViewerApiService()
