from typing import Any, Literal
from pydantic import BaseModel, Field, EmailStr, field_validator

Kind = Literal["text", "url", "phone", "account", "wallet"]
Level = Literal["HIGH", "MEDIUM", "LOW", "INSUFFICIENT DATA"]

class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    kind: Kind = "text"
    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError("กรุณาใส่ข้อมูล / Input cannot be blank")
        return value.strip()

class Entity(BaseModel):
    id: str
    type: str
    value: str
    masked_value: str

class Evidence(BaseModel):
    code: str
    title: str
    detail: str
    source: Any = None

class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    value: str
    is_sample: bool = False
    status: str = "no_data"

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    relation: str
    provenance: str
    evidence: str
    retrieved_at: str
    is_sample: bool = False

class GraphResponse(BaseModel):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    features: dict[str, Any] = {}
    is_sample: bool = False
    note: str

class ModelInfo(BaseModel):
    version: str
    status: str
    dataset_is_sample: bool
    components: dict[str, Any] = {}

class AnalysisResponse(BaseModel):
    id: str
    checked_at: str
    input_kind: str
    score: float | None
    score_components: dict[str, Any] = {}
    level: Level
    summary: str
    entities: list[Entity]
    reasons: list[Evidence]
    history: dict[str, Any]
    graph: GraphResponse
    missing_data: list[str]
    model: ModelInfo
    similar_examples: list[dict[str, Any]] = []
    contributions: Any = []
    model_explanations: list[dict[str, Any]] = []
    anomaly: Any = None
    advice: list[str]
    thresholds: dict[str, Any]
    explanation: dict[str, Any]

class ImageResponse(BaseModel):
    extracted_text: str
    editable: bool = True
    status: str
    message: str

class QRResponse(BaseModel):
    payload: str | None
    status: str
    payload_type: str | None = None
    entities: list[Entity] = []
    payment: dict[str, Any] | None = None
    requires_confirmation: bool = True
    message: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=1, max_length=100)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class UserResponse(BaseModel):
    id: str
    email: str
    email_is_placeholder: bool = False
    name: str
    role: str
    created_at: str

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

class HistorySave(AnalyzeRequest):
    # The result is recomputed by the service: clients cannot fabricate history scores.
    pass

class ReportRequest(AnalyzeRequest):
    detail: str = Field(min_length=10, max_length=10000)
    evidence: list[str] = Field(default_factory=list, max_length=10)

class FeedbackRequest(BaseModel):
    analysis_id: str = Field(min_length=1, max_length=36)
    verdict: Literal["correct", "incorrect", "unsure"]
    detail: str = Field(default="", max_length=2000)

class ModerationRequest(BaseModel):
    status: Literal["verified", "rejected"]
    reason: str = Field(min_length=10, max_length=2000)

class SourceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    url: str | None = Field(default=None, max_length=2000)
    is_sample: bool = False

class ThresholdRequest(BaseModel):
    medium: float = Field(ge=0, le=100)
    high: float = Field(ge=0, le=100)
    @field_validator("high")
    @classmethod
    def ordered(cls, value, info):
        if value <= info.data.get("medium", 0): raise ValueError("high must exceed medium")
        return value

class JobResponse(BaseModel):
    id: str
    kind: str
    status: str
    progress: int
    result: dict[str, Any] | None
    error: str | None
    created_at: str
    finished_at: str | None

class GenericResponse(BaseModel):
    status: str
    message: str | None = None

class HistoryResponse(BaseModel):
    id:str
    text:str
    kind:str
    level:Level
    result:AnalysisResponse
    created_at:str

class HistoryList(BaseModel):
    items:list[HistoryResponse]

class ReportResponse(BaseModel):
    id:str
    text:str
    detail:str
    evidence:list[str]
    entities:list[dict[str,Any]]
    status:Literal["pending","verified","rejected"]
    moderation_reason:str|None
    created_at:str
    reviewed_at:str|None

class ReportList(BaseModel):
    items:list[ReportResponse]

class SourceResponse(BaseModel):
    id:str
    name:str
    description:str
    url:str|None
    is_sample:bool
    enabled:bool
    created_at:str

class SourceList(BaseModel):
    items:list[SourceResponse]
