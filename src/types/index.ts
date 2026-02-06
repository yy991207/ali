// 从 getAllLabInfo.json 提取的类型定义

// 议程摘要
export interface AgendaItem {
  id: number;
  value: string;
  title: string;
  time?: number;
  endTime?: number;
  summary?: string;
  extensions?: Array<{
    startTime: number;
    endTime: number;
    sId: number;
  }>;
}

// 关键词
export interface KeywordItem {
  id: number;
  value: string;
}

// 角色摘要
export interface RoleSummaryItem {
  id: number;
  value: string;
  speaker: string;
  status: number;
}

// Lab卡片内容
export interface LabContent {
  type: string;
  contentValues: AgendaItem[] | KeywordItem[] | RoleSummaryItem[];
}

// Lab信息
export interface LabInfo {
  basicInfo: {
    name: string;
    des?: string;
  };
  contents: LabContent[];
  status: number;
  key: string;
  feedbackInfo?: {
    des: string;
    radios: Array<{ id: number; text: string }>;
  };
}

// getAllLabInfo 响应结构
export interface LabInfoResponse {
  code: string;
  message: string;
  requestId: string;
  data: {
    userId: number;
    labCardsMap: {
      labSummaryInfo: LabInfo[];
      labInfo: LabInfo[];
    };
  };
}

// 从 getTransResult.json 提取的类型定义

// 转写段落中的句子
export interface TranscriptSentence {
  bt: number;      // 开始时间(毫秒)
  et: number;      // 结束时间(毫秒)
  id: number;
  si: number;      // 说话人ID
  tc: string;      // 文本内容
}

// 转写段落
export interface TranscriptParagraph {
  pi: string;      // 段落ID
  sc: TranscriptSentence[];
}

// 音频分段信息
export interface AudioSegment {
  beginTime: number;
  endTime: number;
  ui: string;      // 说话人
  sentenceId: number;
  paragraphId: string;
}

// 问答对
export interface QAPair {
  id: number;
  value: string;
  title: string;
  extensions: Array<{
    sentenceIdsOfAnswer: number[];
    sentenceInfoOfAnswer: AudioSegment[];
    sentenceIdsOfQuestion: number[];
    sentenceInfoOfQuestion: AudioSegment[];
  }>;
}

// getTransResult 响应结构
export interface TransResultResponse {
  code: string;
  message: string;
  requestId: string;
  data: {
    userId: number;
    username: string;
    taskId: string;
    status: number;
    fileSize: number;
    playback: string;           // 音频播放URL
    spectrum: number[];         // 音频频谱数据
    duration: number;           // 总时长(秒)
    wordCount: number;
    result: string;             // JSON字符串，包含转写段落
    tag: {
      showName: string;
      hasNote: string;
      lang: string;
      fileFormat: string;
    };
    playVideoUrl: string;       // 视频播放URL
    videoFrameUrl: string;
    audioSegments: number[][] | string;  // 音频分段[[start, end], ...] 或 JSON字符串
    transId: string;
  };
}

// 解析后的转写结果
export interface ParsedTranscript {
  pg: TranscriptParagraph[];
}

// 组件Props类型
export interface VideoPlayerProps {
  videoUrl: string;
  audioUrl: string;
  duration: number;
  segments: number[][];
  onTimeUpdate?: (currentTime: number) => void;
  onSegmentClick?: (segmentIndex: number) => void;
}

export interface TranscriptPanelProps {
  paragraphs: TranscriptParagraph[];
  currentTime: number;
  onSentenceClick?: (sentence: TranscriptSentence) => void;
}

export interface AgendaPanelProps {
  agendaItems: AgendaItem[];
  onItemClick?: (item: AgendaItem) => void;
}

export interface KeywordPanelProps {
  keywords: KeywordItem[];
  onKeywordClick?: (keyword: KeywordItem) => void;
}
