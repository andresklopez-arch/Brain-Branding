from celery import Celery
import asyncio
import httpx
import os

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("astro_tasks", broker=redis_url, backend=redis_url)

@celery_app.task(name="run_scraper_celery")
def run_scraper_celery(tenant_id: str, url: str):
    """
    Celery task that crawls and scrapes the website asynchronously, 
    and POSTs the results back to the FastAPI callback endpoint.
    """
    from app.services.scraper import WebScraper
    scraper = WebScraper(max_pages=5)
    
    # Run the async crawler in a synchronous celery thread context
    try:
        clean_text = asyncio.run(scraper.scrape_site(url))
    except Exception as e:
        print(f"[CELERY SCRAPER ERROR] Failed to crawl: {str(e)}")
        clean_text = ""

    # Execute callback to FastAPI backend
    internal_backend_url = os.getenv("INTERNAL_BACKEND_URL", "http://backend:8000")
    callback_endpoint = f"{internal_backend_url}/tenants/scraper-callback"
    
    payload = {
        "tenant_id": tenant_id,
        "url": url,
        "text": clean_text
    }
    
    try:
        response = httpx.post(callback_endpoint, json=payload, timeout=20.0)
        return {
            "status": "success" if response.status_code == 200 else "error",
            "http_status": response.status_code,
            "response": response.text
        }
    except Exception as e:
        print(f"[CELERY CALLBACK ERROR] HTTP request failed: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }
