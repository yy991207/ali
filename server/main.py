from typing import List, Optional, Literal
from pathlib import Path
import json
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class GroupMark(BaseModel):
    groupId: str
    type: Literal['important', 'question', 'todo']
    timeMs: float
    text: str


class TextMark(BaseModel):
    id: str
    groupId: str
    startTimeMs: float
    endTimeMs: float
    text: str
    type: Literal['important', 'question', 'todo']
    color: str


class MarksPayload(BaseModel):
    groupMarks: List[GroupMark] = Field(default_factory=list)
    textMarks: List[TextMark] = Field(default_factory=list)


class ApiResponse(BaseModel):
    code: int
    message: str
    data: Optional[MarksPayload] = None


class TranscriptFilterRequest(BaseModel):
    speakerIds: List[int] = Field(default_factory=list)


class TranscriptResponse(BaseModel):
    code: int
    message: str
    data: Optional[dict] = None


class MarkStore:
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self._lock = threading.Lock()

    def load(self) -> MarksPayload:
        # 这里是关键链路，用锁保证并发读写一致性
        with self._lock:
            if not self.storage_path.exists():
                return MarksPayload()
            with self.storage_path.open('r', encoding='utf-8') as f:
                raw = json.load(f)
            return MarksPayload(**raw)

    def save(self, payload: MarksPayload) -> None:
        # 这里使用临时文件写入再替换，避免半写入导致数据损坏
        with self._lock:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = self.storage_path.with_suffix('.tmp')
            with temp_path.open('w', encoding='utf-8') as f:
                json.dump(payload.model_dump(), f, ensure_ascii=False, indent=2)
            temp_path.replace(self.storage_path)


class TranscriptStore:
    def __init__(self, source_path: Path):
        self.source_path = source_path
        self._lock = threading.Lock()
        self._cached_pg: Optional[List[dict]] = None

    def _load_pg(self) -> List[dict]:
        # 这里用同步读取，数据量可控，避免引入额外线程复杂度
        with self._lock:
            if self._cached_pg is not None:
                return self._cached_pg
            if not self.source_path.exists():
                self._cached_pg = []
                return self._cached_pg
            with self.source_path.open('r', encoding='utf-8') as f:
                raw = json.load(f)
            result = raw.get('data', {}).get('result', '{}')
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except Exception:
                    result = {}
            pg = result.get('pg', [])
            self._cached_pg = pg if isinstance(pg, list) else []
            return self._cached_pg

    def filter_by_speakers(self, speaker_ids: List[int]) -> dict:
        pg = self._load_pg()
        if not speaker_ids:
            return {'pg': pg}
        speaker_set = set(speaker_ids)
        filtered_pg: List[dict] = []
        for item in pg:
            sc_list = item.get('sc', [])
            if not isinstance(sc_list, list):
                continue
            filtered_sc = [s for s in sc_list if s.get('si') in speaker_set]
            if not filtered_sc:
                continue
            next_item = dict(item)
            next_item['sc'] = filtered_sc
            filtered_pg.append(next_item)
        return {'pg': filtered_pg}


app = FastAPI()

# 本地开发跨域放开，方便前端直连接口
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

# 这里用相对路径，默认从仓库根目录启动服务
store = MarkStore(Path('server/data/marks.json'))
transcript_store = TranscriptStore(Path('getTransResult.json'))


@app.get('/api/marks')
def get_marks():
    try:
        data = store.load()
        return ApiResponse(code=0, message='ok', data=data)
    except Exception:
        return JSONResponse(status_code=500, content={
            'code': 50001,
            'message': '读取标记失败',
            'data': None
        })


@app.post('/api/marks')
def save_marks(payload: MarksPayload):
    try:
        store.save(payload)
        # 这里只返回写入成功，避免把 GET 的职责混到 POST 里
        return ApiResponse(code=0, message='ok', data=None)
    except Exception:
        return JSONResponse(status_code=500, content={
            'code': 50002,
            'message': '保存标记失败',
            'data': None
        })


@app.post('/api/transcript/filter')
def filter_transcript(payload: TranscriptFilterRequest):
    try:
        data = transcript_store.filter_by_speakers(payload.speakerIds)
        return TranscriptResponse(code=0, message='ok', data=data)
    except Exception:
        return JSONResponse(status_code=500, content={
            'code': 50003,
            'message': '筛选发言人失败',
            'data': None
        })
