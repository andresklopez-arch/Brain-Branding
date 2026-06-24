from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Tenant, ChannelsCredentials, KnowledgeBase
from ..schemas import TenantResponse, CredentialsResponse, CredentialsUpdate, ScraperCallbackInput
from ..services.websocket import socket_manager
from ..tasks import run_scraper_celery
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
    try:
        run_scraper_celery.delay(str(tenant.id), website_url)
        print("[CELERY] Task successfully enqueued.")
    except Exception as e:
        print(f"[CELERY WARNING] Redis is offline. Running scraper locally via BackgroundTasks: {str(e)}")
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
