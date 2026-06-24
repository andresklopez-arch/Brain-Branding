from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Tenant, ChannelsCredentials, KnowledgeBase
from ..schemas import TenantResponse, CredentialsResponse, CredentialsUpdate, ScraperCallbackInput
from ..services.websocket import socket_manager
from ..tasks import run_scraper_celery
import uuid

router = APIRouter(prefix="/tenants", tags=["Tenants"])

@router.post("/setup", response_model=TenantResponse)
def setup_tenant(
    nombre_empresa: str,
    website_url: str,
    db: Session = Depends(get_db)
):
    """
    SaaS One-Click Setup Pipeline:
    1. Create tenant.
    2. Initialize credentials mapping.
    3. Trigger async Celery site scraper task.
    """
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
    
    # 3. Trigger Celery scraper task in background
    run_scraper_celery.delay(str(tenant.id), website_url)
    
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
    return creds

@router.put("/{tenant_id}/credentials", response_model=CredentialsResponse)
def update_credentials(tenant_id: str, payload: CredentialsUpdate, db: Session = Depends(get_db)):
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if not creds:
        raise HTTPException(status_code=404, detail="Credentials record not found for tenant.")
        
    # Update fields
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(creds, key, value)
        
    db.commit()
    db.refresh(creds)
    return creds
