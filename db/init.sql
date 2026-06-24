-- Database initialization schema for Astro Link (Multi-tenant SaaS)
-- Strict Tenant Isolation is maintained via tenant_id references

-- Enable UUID extension if we want to use UUIDs for tenants
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants Table
CREATE TABLE IF NOT EXISTS Tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_empresa VARCHAR(255) NOT NULL,
    plan_saas VARCHAR(50) NOT NULL DEFAULT 'Free', -- Free, Growth, Enterprise
    estado_global VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Suspended
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Knowledge Base Table
CREATE TABLE IF NOT EXISTS Knowledge_Base (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES Tenants(id) ON DELETE CASCADE,
    url_origen VARCHAR(2048) NOT NULL,
    texto_scrapeado_limpio TEXT NOT NULL,
    ultima_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast tenant lookup in knowledge base
CREATE INDEX IF NOT EXISTS idx_kb_tenant ON Knowledge_Base(tenant_id);

-- 3. Channels Credentials Table
CREATE TABLE IF NOT EXISTS Channels_Credentials (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL UNIQUE REFERENCES Tenants(id) ON DELETE CASCADE,
    whatsapp_token TEXT,
    whatsapp_phone_id VARCHAR(100),
    twilio_sms_sid VARCHAR(100),
    twilio_sms_auth VARCHAR(100),
    instagram_page_token TEXT,
    telegram_bot_token VARCHAR(255),
    email_imap_smtp_config_json JSONB,
    twitter_x_bearer_token TEXT,
    tiktok_business_access_token TEXT,
    youtube_api_key VARCHAR(255),
    google_business_profile_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for tenant credentials lookup
CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON Channels_Credentials(tenant_id);

-- 4. Conversations Threads Table
CREATE TABLE IF NOT EXISTS Conversations_Threads (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES Tenants(id) ON DELETE CASCADE,
    canal_origen VARCHAR(50) NOT NULL, -- whatsapp, sms, instagram, telegram, email, twitter, tiktok, youtube, google_business, web_widget
    contacto_identificador_plataforma VARCHAR(255) NOT NULL, -- platform-specific user identifier (phone, email, chat_id, handle)
    historial_chat_json JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of message objects: [{role: "user"|"model", content: "...", timestamp: "..."}]
    ai_active_status BOOLEAN NOT NULL DEFAULT TRUE, -- Active AI response status (Human Handoff toggle)
    ultima_interaccion_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_channel_contact UNIQUE (tenant_id, canal_origen, contacto_identificador_plataforma)
);

-- Composite index for fast thread lookup by tenant and channel user
CREATE INDEX IF NOT EXISTS idx_threads_tenant_contact ON Conversations_Threads(tenant_id, canal_origen, contacto_identificador_plataforma);

-- 5. Leads CRM Table
CREATE TABLE IF NOT EXISTS Leads_CRM (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES Tenants(id) ON DELETE CASCADE,
    nombre_extraido VARCHAR(255),
    telefono VARCHAR(50),
    email VARCHAR(255),
    red_social_origen VARCHAR(50) NOT NULL,
    notas_interes_ia TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for tenant leads
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON Leads_CRM(tenant_id);
