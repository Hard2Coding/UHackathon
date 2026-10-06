"""Database tables. Raw analysis input is persisted only by an explicit history save."""
import os
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text, LargeBinary, UniqueConstraint, create_engine, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

def utcnow():
    return datetime.now(timezone.utc)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://scamgraph:scamgraph@localhost:5432/scamgraph")
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(12), default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class SessionToken(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class History(Base):
    __tablename__ = "history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(24))
    level: Mapped[str] = mapped_column(String(30))
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("user_id","dedup_hash",name="uq_reports_user_dedup"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    detail: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    entities: Mapped[list] = mapped_column(JSON, default=list)
    dedup_hash: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    moderation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class ThreatRecord(Base):
    __tablename__ = "threat_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    entity_type: Mapped[str] = mapped_column(String(24))
    # Long URLs exceed PostgreSQL B-tree key limits; queries are scoped by the
    # indexed source_id and application graph builds deduplicated entity IDs.
    value: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="reported")
    evidence: Mapped[str] = mapped_column(Text)
    related_entities: Mapped[list] = mapped_column(JSON, default=list)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    analysis_id: Mapped[str] = mapped_column(String(36))
    verdict: Mapped[str] = mapped_column(String(16))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Config(Base):
    __tablename__ = "config"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)

class AnalysisEvent(Base):
    """Anonymous aggregate telemetry: deliberately excludes input, entity and IP."""
    __tablename__ = "analysis_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(24))
    level: Mapped[str] = mapped_column(String(30))
    model_version: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class EvidenceFile(Base):
    __tablename__ = "evidence_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(80))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class ProviderIdentity(Base):
    __tablename__ = "provider_identities"
    __table_args__ = (UniqueConstraint("provider","subject",name="uq_provider_subject"),UniqueConstraint("user_id","provider",name="uq_user_provider"))
    id: Mapped[str] = mapped_column(String(36),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id",ondelete="CASCADE"),index=True)
    provider: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(255))
    email_verified: Mapped[bool] = mapped_column(Boolean,default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=utcnow)

class OAuthState(Base):
    __tablename__ = "oauth_states"
    state_hash: Mapped[str] = mapped_column(String(64),primary_key=True)
    provider: Mapped[str] = mapped_column(String(16))
    client_id: Mapped[str] = mapped_column(String(255))
    app_redirect_uri: Mapped[str] = mapped_column(Text)
    provider_redirect_uri: Mapped[str] = mapped_column(Text)
    client_code_challenge: Mapped[str] = mapped_column(String(43))
    provider_code_verifier: Mapped[str] = mapped_column(String(128))
    nonce: Mapped[str] = mapped_column(String(128))
    intent: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id",ondelete="CASCADE"),nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)

class OAuthExchange(Base):
    __tablename__ = "oauth_exchanges"
    code_hash: Mapped[str] = mapped_column(String(64),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id",ondelete="CASCADE"),index=True)
    client_code_challenge: Mapped[str] = mapped_column(String(43))
    provider: Mapped[str] = mapped_column(String(16))
    intent: Mapped[str] = mapped_column(String(16))
    provider_subject: Mapped[str] = mapped_column(String(255))
    email_verified: Mapped[bool] = mapped_column(Boolean,default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)

class LineFriendship(Base):
    __tablename__ = "line_friendships"
    subject: Mapped[str] = mapped_column(String(40),primary_key=True)
    following: Mapped[bool] = mapped_column(Boolean,default=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class LineSubscription(Base):
    __tablename__ = "line_subscriptions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id",ondelete="CASCADE"),primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean,default=False)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),nullable=True)

class LineDelivery(Base):
    __tablename__ = "line_deliveries"
    __table_args__ = (UniqueConstraint("user_id","history_id",name="uq_line_delivery_history"),)
    id: Mapped[str] = mapped_column(String(36),primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id",ondelete="CASCADE"),index=True)
    history_id: Mapped[str] = mapped_column(ForeignKey("history.id",ondelete="CASCADE"),index=True)
    status: Mapped[str] = mapped_column(String(30),default="queued")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=utcnow)

class WebhookReceipt(Base):
    __tablename__ = "webhook_receipts"
    event_id: Mapped[str] = mapped_column(String(100),primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=utcnow)

def get_db():
    with SessionLocal() as session:
        yield session
