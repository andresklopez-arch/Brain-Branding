from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from .database import engine, Base
from .routers import auth, tenants, webhooks, inbox, crm
import os

# Create DB tables if not present (helps with SQLite/Postgres auto-migrations)
try:
    Base.metadata.create_all(bind=engine)
    print("[DATABASE] Tables synchronized successfully.")
    
    # Executing dynamic column migration for sqlite/postgres compat
    from sqlalchemy import text
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE channels_credentials ADD COLUMN gemini_api_key TEXT;"))
            print("[DATABASE MIGRATION] Added gemini_api_key column to channels_credentials.")
        except Exception as col_err:
            pass
        try:
            conn.execute(text("ALTER TABLE channels_credentials ADD COLUMN gemini_model_name VARCHAR(100);"))
            print("[DATABASE MIGRATION] Added gemini_model_name column to channels_credentials.")
        except Exception as col_err:
            pass
        try:
            conn.execute(text("ALTER TABLE channels_credentials ADD COLUMN gemini_temperature FLOAT;"))
            print("[DATABASE MIGRATION] Added gemini_temperature column to channels_credentials.")
        except Exception as col_err:
            pass
        try:
            conn.execute(text("ALTER TABLE channels_credentials ADD COLUMN encryption_salt VARCHAR(100);"))
            print("[DATABASE MIGRATION] Added encryption_salt column to channels_credentials.")
        except Exception as col_err:
            pass
        try:
            conn.execute(text("ALTER TABLE channels_credentials ADD COLUMN custom_lead_fields_json TEXT;"))
            print("[DATABASE MIGRATION] Added custom_lead_fields_json column to channels_credentials.")
        except Exception as col_err:
            pass
        try:
            conn.execute(text("ALTER TABLE leads_crm ADD COLUMN campos_personalizados_json TEXT;"))
            print("[DATABASE MIGRATION] Added campos_personalizados_json column to leads_crm.")
        except Exception as col_err:
            pass
except Exception as e:
    print(f"[DATABASE ERROR] Could not synchronize tables: {str(e)}")

app = FastAPI(
    title="Astro Link API",
    description="Multi-tenant, Plug-and-Play AI Customer Agent API powered by Gemini 3.5 Flash",
    version="1.0.0"
)

# CORS middleware configuration for frontend dashboard
allowed_origins = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://brain-branding.web.app").split(",") 
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middleware to inject CSP and other security headers
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    # Content-Security-Policy setting (supports self, widgets and fonts)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' http: https: data: 'unsafe-inline' 'unsafe-eval'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://brain-branding.web.app http://localhost:5173; "
        "connect-src 'self' http: https: ws: wss:;"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# Include API routers
app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(webhooks.router)
app.include_router(inbox.router)
app.include_router(crm.router)

@app.on_event("startup")
def startup_event():
    from .tasks import start_async_task_processor
    start_async_task_processor()

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Astro Link"}

@app.get("/health/worker")
def health_worker():
    from .tasks import LAST_WORKER_HEARTBEAT, check_and_recover_worker
    import time
    now = time.time()
    time_since_heartbeat = now - LAST_WORKER_HEARTBEAT
    recovered = False
    
    # Only recover if worker has had time to start (LAST_WORKER_HEARTBEAT > 0)
    # or if we are well past startup time and it still hasn't heartbeat.
    if LAST_WORKER_HEARTBEAT > 0.0 and time_since_heartbeat > 15.0:
        recovered = check_and_recover_worker()
    
    return {
        "status": "unhealthy" if (LAST_WORKER_HEARTBEAT > 0.0 and time_since_heartbeat > 15.0) else "healthy",
        "last_heartbeat": LAST_WORKER_HEARTBEAT,
        "time_since_heartbeat": time_since_heartbeat,
        "recovered": recovered
    }

@app.get("/widget.js")
def get_widget_script(tenant_id: str):
    """
    Returns the embeddable JavaScript code that companies can copy-paste into their sites.
    It injects a floating iframe chat box at the bottom right corner.
    """
    # Point the iframe to the web widget sub-view on our frontend
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    widget_url = f"{frontend_url}/widget?tenant_id={tenant_id}"
    
    js_code = f"""
    (function() {{
        // Create float button
        const btn = document.createElement('div');
        btn.id = 'astrolink-widget-btn';
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.right = '20px';
        btn.style.width = '60px';
        btn.style.height = '60px';
        btn.style.borderRadius = '50%';
        btn.style.backgroundColor = '#4F46E5';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.style.zIndex = '999999';
        btn.style.transition = 'all 0.3s ease';
        btn.innerHTML = '<span style="color:white; font-size:30px; font-weight:bold;">💬</span>';
        
        // Create iframe container
        const container = document.createElement('div');
        container.id = 'astrolink-widget-container';
        container.style.position = 'fixed';
        container.style.bottom = '90px';
        container.style.right = '20px';
        container.style.width = '380px';
        container.style.height = '500px';
        container.style.borderRadius = '12px';
        container.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
        container.style.display = 'none';
        container.style.zIndex = '999999';
        container.style.overflow = 'hidden';
        container.style.border = 'none';
        container.style.transition = 'all 0.3s ease';
        
        const iframe = document.createElement('iframe');
        iframe.src = '{widget_url}';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        
        container.appendChild(iframe);
        document.body.appendChild(btn);
        document.body.appendChild(container);
        
        // Toggle widget open/close
        btn.addEventListener('click', () => {{
            if (container.style.display === 'none') {{
                container.style.display = 'block';
                btn.innerHTML = '<span style="color:white; font-size:24px; font-weight:bold;">❌</span>';
            }} else {{
                container.style.display = 'none';
                btn.innerHTML = '<span style="color:white; font-size:30px; font-weight:bold;">💬</span>';
            }}
        }});
    }})();
    """
    return Response(content=js_code, media_type="application/javascript")
