from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Tenant, ChannelsCredentials, KnowledgeBase
from ..schemas import TenantResponse, CredentialsResponse, CredentialsUpdate, ScraperCallbackInput
from ..services.websocket import socket_manager
from ..tasks import run_scraper_celery
from ..utils import encrypt_val, decrypt_val, check_redis_connection, is_safe_url
from ..config import settings
import uuid

router = APIRouter(prefix="/tenants", tags=["Tenants"])

async def local_scraper_fallback(tenant_id: str, url: str, db_session_maker):
    """Fallback scraping runner that runs locally if Redis/Celery is offline."""
    print(f"[FALLBACK SCRAPER] Running local BS4 scraper task for {tenant_id}...")
    from ..services.scraper import WebScraper
    scraper = WebScraper(max_pages=5)
    try:
        clean_text = await scraper.scrape_site(url)
        db = db_session_maker()
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == tenant_id).first()
        if not kb:
            kb = KnowledgeBase(
                tenant_id=tenant_id,
                url_origen=url,
                texto_scrapeado_limpio=clean_text
            )
            db.add(kb)
        else:
            kb.url_origen = url
            kb.texto_scrapeado_limpio = clean_text
        db.commit()
        db.close()
        
        print(f"[FALLBACK SCRAPER] Finished local scraping for {tenant_id}.")
        await socket_manager.broadcast_to_tenant(
            tenant_id,
            {
                "event": "scraper_finished",
                "status": "success",
                "message": "Indexación web completada. Tu IA está lista para responder.",
                "url": url
            }
        )
    except Exception as e:
        print(f"[FALLBACK SCRAPER ERROR] {str(e)}")
        await socket_manager.broadcast_to_tenant(
            tenant_id,
            {
                "event": "scraper_finished",
                "status": "error",
                "message": f"Error indexando tu sitio: {str(e)}"
            }
        )

@router.post("/setup", response_model=TenantResponse)
def setup_tenant(
    nombre_empresa: str,
    website_url: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    SaaS One-Click Setup Pipeline:
    1. Create tenant.
    2. Initialize credentials mapping.
    3. Trigger Celery scraper (or fallback to local background task if Redis is offline).
    """
    # 0. SSRF URL safety check
    if not is_safe_url(website_url):
        raise HTTPException(
            status_code=400,
            detail="La URL del sitio web no es segura o es inválida."
        )

    # 0.5. Double submission / spam check
    from datetime import datetime, timedelta
    time_threshold = datetime.utcnow() - timedelta(seconds=15)
    recent_tenant = db.query(Tenant).filter(
        Tenant.nombre_empresa == nombre_empresa,
        Tenant.created_at >= time_threshold
    ).first()
    if recent_tenant:
        raise HTTPException(
            status_code=409,
            detail="Se detectó una solicitud de creación duplicada en progreso. Por favor espera."
        )
    # 1. Create Tenant
    tenant = Tenant(
        nombre_empresa=nombre_empresa,
        plan_saas="Growth",
        estado_global="Active"
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    
    # 2. Init credentials record
    creds = ChannelsCredentials(tenant_id=tenant.id)
    db.add(creds)
    db.commit()
    
    # 3. Trigger Celery task, fallback to local background task if Redis is offline
    use_celery = False
    if settings.REQUIRE_REDIS:
        use_celery = True
    else:
        # Check connection to avoid blocking request thread if Redis is offline
        use_celery = check_redis_connection(settings.REDIS_URL, timeout=1.0)

    if use_celery:
        try:
            run_scraper_celery.delay(str(tenant.id), website_url)
            print("[CELERY] Task successfully enqueued.")
        except Exception as e:
            print(f"[CELERY WARNING] Failed to enqueue Celery task: {str(e)}")
            use_celery = False

    if not use_celery:
        print("[FALLBACK SCRAPER] Running scraper locally via BackgroundTasks...")
        from ..database import SessionLocal
        background_tasks.add_task(
            local_scraper_fallback,
            str(tenant.id),
            website_url,
            SessionLocal
        )
    
    return tenant

@router.post("/scraper-callback")
async def scraper_callback(payload: ScraperCallbackInput, db: Session = Depends(get_db)):
    """
    Callback endpoint called by the Celery worker once scraping is complete.
    Saves clean text to database and alerts the user UI in real-time.
    """
    tenant_id = payload.tenant_id
    url = payload.url
    clean_text = payload.text

    kb = db.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == tenant_id).first()
    if not kb:
        kb = KnowledgeBase(
            tenant_id=tenant_id,
            url_origen=url,
            texto_scrapeado_limpio=clean_text
        )
        db.add(kb)
    else:
        kb.url_origen = url
        kb.texto_scrapeado_limpio = clean_text

    db.commit()
    
    # Broadcast notification to the specific tenant's agents
    await socket_manager.broadcast_to_tenant(
        tenant_id,
        {
            "event": "scraper_finished",
            "status": "success" if clean_text else "error",
            "message": "Indexación web completada. Tu IA está lista para responder." if clean_text else "No se pudo extraer texto del sitio de referencia.",
            "url": url
        }
    )
    return {"status": "success"}

@router.get("/{tenant_id}/credentials", response_model=CredentialsResponse)
def get_credentials(tenant_id: str, db: Session = Depends(get_db)):
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Credentials record not found for tenant.")
    
    # Decrypt key for API response serialization
    resp = CredentialsResponse.model_validate(creds)
    sensitive_keys = {"gemini_api_key", "whatsapp_token", "instagram_page_token", "messenger_page_token", "twilio_sms_auth", "telegram_bot_token"}
    for key in sensitive_keys:
        val = getattr(resp, key, None)
        if val:
            setattr(resp, key, decrypt_val(val, salt_str=creds.encryption_salt))
    return resp

@router.put("/{tenant_id}/credentials", response_model=CredentialsResponse)
def update_credentials(tenant_id: str, payload: CredentialsUpdate, db: Session = Depends(get_db)):
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Credentials record not found for tenant.")
        
    # Generate dynamic salt if not already present
    if not creds.encryption_salt:
        import base64
        import os
        creds.encryption_salt = base64.b64encode(os.urandom(16)).decode('utf-8')
        db.commit()
        db.refresh(creds)

    # Update fields
    sensitive_keys = {"gemini_api_key", "whatsapp_token", "instagram_page_token", "messenger_page_token", "twilio_sms_auth", "telegram_bot_token"}
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key in sensitive_keys and value:
            value = encrypt_val(value, salt_str=creds.encryption_salt)
        setattr(creds, key, value)
        
    # Write Audit Log (Sugerencia 18)
    from ..models import AuditLog
    modified_fields = [k for k, v in update_data.items()]
    audit = AuditLog(
        tenant_id=tenant_id,
        usuario_origen="admin",
        accion_realizada="update_credentials",
        detalles=f"Modificó credenciales. Campos alterados: {', '.join(modified_fields)}"
    )
    db.add(audit)
    db.commit()
    db.refresh(creds)
    
    # Decrypt key for API response serialization
    resp = CredentialsResponse.model_validate(creds)
    for key in sensitive_keys:
        val = getattr(resp, key, None)
        if val:
            setattr(resp, key, decrypt_val(val, salt_str=creds.encryption_salt))
    return resp

@router.post("/{tenant_id}/rotate-secret")
def rotate_secret(
    tenant_id: str,
    new_secret: str,
    db: Session = Depends(get_db)
):
    """
    Atomic secret key rotation for tenant credentials:
    Decrypts using the current secret key, then encrypts with the new secret key.
    """
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Credentials record not found for tenant.")
        
    sensitive_keys = {
        "gemini_api_key", "whatsapp_token", "instagram_page_token", 
        "messenger_page_token", "twilio_sms_auth", "telegram_bot_token"
    }
    
    decrypted_values = {}
    for key in sensitive_keys:
        val = getattr(creds, key, None)
        if val:
            decrypted_values[key] = decrypt_val(val, salt_str=creds.encryption_salt)
            
    # Helper to encrypt with the new secret key
    import hashlib
    import base64
    import os
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    
    def encrypt_with_new_secret(plaintext: str, secret: str, salt: Optional[str]) -> str:
        if not plaintext:
            return ""
        secret_key = secret
        if salt:
            secret_key += salt
        key = hashlib.sha256(secret_key.encode('utf-8')).digest()
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
        return base64.b64encode(nonce + ciphertext).decode('utf-8')

    for key, val in decrypted_values.items():
        if val:
            encrypted_val = encrypt_with_new_secret(val, new_secret, creds.encryption_salt)
            setattr(creds, key, encrypted_val)
            
    # Write Audit Log
    from ..models import AuditLog
    audit = AuditLog(
        tenant_id=tenant_id,
        usuario_origen="admin",
        accion_realizada="rotate_secret_key",
        detalles="Rotación exitosa de la clave secreta global de cifrado."
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "message": "Secret key rotated successfully for tenant credentials."}
