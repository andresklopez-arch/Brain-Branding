import uuid
from sqlalchemy import Column, String, Boolean, Text, DateTime, ForeignKey, Integer, JSON, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from .database import Base

# --- GUID Type Decorator for PostgreSQL and SQLite Compatibility ---
class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as string.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                try:
                    return str(uuid.UUID(value))
                except ValueError:
                    return str(value)
            else:
                return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            else:
                return value


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    nombre_empresa = Column(String(255), nullable=False)
    plan_saas = Column(String(50), nullable=False, default="Free")
    estado_global = Column(String(50), nullable=False, default="Active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    knowledge_bases = relationship("KnowledgeBase", back_populates="tenant", cascade="all, delete-orphan")
    credentials = relationship("ChannelsCredentials", uselist=False, back_populates="tenant", cascade="all, delete-orphan")
    threads = relationship("ConversationsThread", back_populates="tenant", cascade="all, delete-orphan")
    leads = relationship("LeadCRM", back_populates="tenant", cascade="all, delete-orphan")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_base"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    url_origen = Column(String(2048), nullable=False)
    texto_scrapeado_limpio = Column(Text, nullable=False)
    ultima_actualizacion = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="knowledge_bases")


class ChannelsCredentials(Base):
    __tablename__ = "channels_credentials"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False)
    whatsapp_token = Column(Text, nullable=True)
    whatsapp_phone_id = Column(String(100), nullable=True)
    twilio_sms_sid = Column(String(100), nullable=True)
    twilio_sms_auth = Column(String(100), nullable=True)
    instagram_page_token = Column(Text, nullable=True)
    messenger_page_token = Column(Text, nullable=True)
    messenger_page_id = Column(String(100), nullable=True)
    telegram_bot_token = Column(String(255), nullable=True)
    email_imap_smtp_config_json = Column(JSON, nullable=True)
    twitter_x_bearer_token = Column(Text, nullable=True)
    tiktok_business_access_token = Column(Text, nullable=True)
    youtube_api_key = Column(String(255), nullable=True)
    google_business_profile_id = Column(String(100), nullable=True)
    gemini_api_key = Column(Text, nullable=True)
    gemini_model_name = Column(String(100), nullable=True)
    gemini_temperature = Column(Float, nullable=True)
    active_channels_json = Column(JSON, nullable=True, default=dict)
    custom_lead_fields_json = Column(JSON, nullable=True, default=list)
    encryption_salt = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="credentials")


class ConversationsThread(Base):
    __tablename__ = "conversations_threads"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    canal_origen = Column(String(50), nullable=False)
    contacto_identificador_plataforma = Column(String(255), nullable=False)
    historial_chat_json = Column(JSON, nullable=False, default=list) # [{role: "user"|"model", content: "...", timestamp: "..."}]
    ai_active_status = Column(Boolean, nullable=False, default=True)
    ultima_interaccion_timestamp = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="threads")


class LeadCRM(Base):
    __tablename__ = "leads_crm"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    nombre_extraido = Column(String(255), nullable=True)
    telefono = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    red_social_origen = Column(String(50), nullable=False)
    notas_interes_ia = Column(Text, nullable=True)
    campos_personalizados_json = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant", back_populates="leads")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(GUID, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    usuario_origen = Column(String(255), nullable=False)
    accion_realizada = Column(String(255), nullable=False)
    detalles = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tenant = relationship("Tenant")


class AsyncTaskQueue(Base):
    __tablename__ = "async_task_queue"

    id = Column(Integer, primary_key=True, index=True)
    task_type = Column(String(100), nullable=False)
    payload_json = Column(JSON, nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    retries = Column(Integer, nullable=False, default=0)
    max_retries = Column(Integer, nullable=False, default=3)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    run_at = Column(DateTime(timezone=True), server_default=func.now())
