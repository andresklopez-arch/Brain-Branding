from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Tenant, ChannelsCredentials, KnowledgeBase
from ..schemas import TenantCreate, TenantResponse, CredentialsResponse, CredentialsUpdate
from ..services.scraper import WebScraper
from ..services.websocket import socket_manager
import uuid

router = APIRouter(prefix="/tenants", tags=["Tenants"])
scraper = WebScraper(max_pages=5)

async def run_scraper_task(tenant_id: str, url: str, db_session_maker):
    """Background task to crawl, scrape, and update company Knowledge Base."""
    print(f"[BACKGROUND TASK] Scraping started for tenant {tenant_id} URL: {url}")
    try:
        clean_text = await scraper.scrape_site(url)
        
        # Open separate session for background task
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
        
        print(f"[BACKGROUND TASK] Scraping finished for tenant {tenant_id}. Context size: {len(clean_text)} characters.")
        
        # Broadcast real-time notifications to UI
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
        print(f"[SCRAPER BACKGROUND TASK ERROR] {str(e)}")
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
    3. Trigger async site scraper.
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
    
    # 3. Queue web scraping in background task
    from ..database import SessionLocal
    background_tasks.add_task(
        run_scraper_task,
        str(tenant.id),
        website_url,
        SessionLocal
    )
    
    return tenant

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
