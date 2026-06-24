from pydantic import BaseModel, HttpUrl, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

# --- Tenant Schemas ---
class TenantBase(BaseModel):
    nombre_empresa: str
    plan_saas: Optional[str] = "Free"
    estado_global: Optional[str] = "Active"

class TenantCreate(TenantBase):
    pass

class TenantResponse(TenantBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# --- Knowledge Base Schemas ---
class KnowledgeBaseBase(BaseModel):
    url_origen: str

class KnowledgeBaseCreate(KnowledgeBaseBase):
    pass

class KnowledgeBaseResponse(KnowledgeBaseBase):
    id: int
    tenant_id: UUID
    texto_scrapeado_limpio: str
    ultima_actualizacion: datetime

    class Config:
        from_attributes = True

# --- Credentials Schemas ---
class CredentialsUpdate(BaseModel):
    whatsapp_token: Optional[str] = None
    whatsapp_phone_id: Optional[str] = None
    twilio_sms_sid: Optional[str] = None
    twilio_sms_auth: Optional[str] = None
    instagram_page_token: Optional[str] = None
    messenger_page_token: Optional[str] = None
    messenger_page_id: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    email_imap_smtp_config_json: Optional[Dict[str, Any]] = None
    twitter_x_bearer_token: Optional[str] = None
    tiktok_business_access_token: Optional[str] = None
    youtube_api_key: Optional[str] = None
    google_business_profile_id: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model_name: Optional[str] = None
    gemini_temperature: Optional[float] = None
    active_channels_json: Optional[Dict[str, bool]] = None
    encryption_salt: Optional[str] = None

class CredentialsResponse(CredentialsUpdate):
    id: int
    tenant_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

# --- Chat Messages Schemas ---
class ChatMessage(BaseModel):
    role: str # "user" or "model"
    content: str
    timestamp: Optional[str] = None

# --- Conversations Threads Schemas ---
class ConversationsThreadBase(BaseModel):
    canal_origen: str
    contacto_identificador_plataforma: str

class ConversationsThreadCreate(ConversationsThreadBase):
    pass

class ConversationsThreadResponse(ConversationsThreadBase):
    id: int
    tenant_id: UUID
    historial_chat_json: List[Dict[str, Any]]
    ai_active_status: bool
    ultima_interaccion_timestamp: datetime

    class Config:
        from_attributes = True

# --- Leads CRM Schemas ---
class LeadCRMResponse(BaseModel):
    id: int
    tenant_id: UUID
    nombre_extraido: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    red_social_origen: str
    notas_interes_ia: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Widget Message Input Schema ---
class WidgetMessageInput(BaseModel):
    contacto_id: str
    mensaje: str

class ScraperCallbackInput(BaseModel):
    tenant_id: str
    url: str
    text: str
