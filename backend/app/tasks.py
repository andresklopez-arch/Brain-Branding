from celery import Celery
import asyncio
import httpx
import os
import threading
import time
import datetime
import json
import traceback
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models import AsyncTaskQueue

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


# --- database-backed persistent task queue worker ---

def queue_async_task(db: Session, task_type: str, payload: dict, delay_seconds: int = 0) -> AsyncTaskQueue:
    """Queues a task in database for asynchronous processing."""
    run_time = datetime.datetime.utcnow() + datetime.timedelta(seconds=delay_seconds)
    task = AsyncTaskQueue(
        task_type=task_type,
        payload_json=payload,
        status="pending",
        retries=0,
        max_retries=3,
        run_at=run_time
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

def execute_task(task_type: str, payload: dict, db: Session) -> tuple[bool, str]:
    """Routes task type to the corresponding action."""
    try:
        if task_type == "incoming_message":
            # Late imports to avoid circular dependency
            from .routers.webhooks import process_incoming_message
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    process_incoming_message(
                        tenant_id=payload["tenant_id"],
                        channel=payload["channel"],
                        sender_id=payload["sender_id"],
                        message_text=payload["message_text"],
                        db=db,
                        is_public_comment=payload.get("is_public_comment", False),
                        comment_id=payload.get("comment_id")
                    )
                )
            finally:
                loop.close()
            return True, ""

        elif task_type == "webhook_retry":
            # Outgoing channel retry simulation (Sugerencia 12)
            url = payload.get("url")
            data = payload.get("data")
            if not url:
                return False, "Missing target URL for webhook retry"
                
            response = httpx.post(url, json=data, timeout=10.0)
            if response.status_code < 400:
                return True, f"Webhook delivered successfully: {response.status_code}"
            else:
                return False, f"Server returned error code: {response.status_code}"

        return False, f"Unsupported task type: {task_type}"
    except Exception as e:
        return False, f"{str(e)}\n{traceback.format_exc()}"

def start_async_task_processor():
    """Spawns background task worker in a daemon thread."""
    def worker_loop():
        time.sleep(2)  # Wait for DB tables setup in main thread
        print("[ASYNC QUEUE] Persistent SQLite-backed task worker started.")
        while True:
            db = SessionLocal()
            try:
                now = datetime.datetime.utcnow()
                # Find next pending task where run_at time has passed
                task = db.query(AsyncTaskQueue).filter(
                    AsyncTaskQueue.status == "pending",
                    AsyncTaskQueue.run_at <= now
                ).order_by(AsyncTaskQueue.created_at.asc()).first()

                if task:
                    task.status = "processing"
                    db.commit()
                    print(f"[ASYNC QUEUE] Processing task {task.id} (type: {task.task_type})")
                    
                    success, err_msg = execute_task(task.task_type, task.payload_json, db)
                    
                    if success:
                        task.status = "completed"
                        task.error_message = None
                    else:
                        task.retries += 1
                        task.error_message = err_msg
                        if task.retries >= task.max_retries:
                            task.status = "failed"
                            print(f"[ASYNC QUEUE] Task {task.id} failed after {task.max_retries} attempts.")
                        else:
                            # Exponential backoff: wait 5s, 10s, 20s
                            delay = 5 * (2 ** task.retries)
                            task.status = "pending"
                            task.run_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=delay)
                            print(f"[ASYNC QUEUE] Task {task.id} failed. Retrying in {delay} seconds.")
                    db.commit()
                else:
                    time.sleep(1)
            except Exception as e:
                print(f"[ASYNC QUEUE ERROR] Worker loop crashed: {str(e)}")
                time.sleep(2)
            finally:
                db.close()

    t = threading.Thread(target=worker_loop, daemon=True)
    t.start()
