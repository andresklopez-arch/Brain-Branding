from fastapi import APIRouter, Depends, Query, Request, Response, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from collections import defaultdict
from ..database import get_db
from ..models import Tenant, KnowledgeBase, ConversationsThread, LeadCRM, ChannelsCredentials
from ..schemas import WidgetMessageInput
from ..services.gemini import GeminiService
from ..services.channels import omnichannel
from ..services.websocket import socket_manager
from ..config import settings
import datetime
import json
import hmac
import hashlib
import time

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])
gemini_service = GeminiService()

def verify_meta_signature(body: bytes, signature_header: str, app_secret: str) -> bool:
    """Validates X-Hub-Signature-256 header sent by Meta to authenticate webhook requests."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected_sig = signature_header.split("sha256=")[1]
    computed_sig = hmac.new(
        app_secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected_sig, computed_sig)

# In-memory stores for rate limiting and webhook message deduplication
RATE_LIMIT_WINDOW = 60  # 1 minute
RATE_LIMIT_MAX_REQUESTS = 30
request_history = defaultdict(list)
processed_message_ids = {}

def is_rate_limited(key: str) -> bool:
    """Checks if a key (IP address or contact identifier) has exceeded rate limits."""
    current_time = time.time()
    # Remove logs older than the time window
    request_history[key] = [t for t in request_history[key] if current_time - t < RATE_LIMIT_WINDOW]
    if len(request_history[key]) >= RATE_LIMIT_MAX_REQUESTS:
        return True
    request_history[key].append(current_time)
    return False

def is_duplicate_message(message_id: str) -> bool:
    """Checks if a webhook message ID is duplicate, avoiding double-processing."""
    if not message_id:
        return False
    current_time = time.time()
    # Clean up records older than 10 minutes
    for mid, t in list(processed_message_ids.items()):
        if current_time - t > 600:
            processed_message_ids.pop(mid, None)
            
    if message_id in processed_message_ids:
        return True
    processed_message_ids[message_id] = current_time
    return False

async def process_incoming_message(
    tenant_id: str,
    channel: str,
    sender_id: str,
    message_text: str,
    db: Session,
    is_public_comment: bool = False,
    comment_id: Optional[str] = None
):
    """
    Core pipeline to process incoming omnichannel messages:
    1. Check/create thread.
    2. Read company knowledge base.
    3. Generate human-like reply using Gemini 3.5 Flash.
    4. Handle Lead CRM extraction.
    5. Perform action (Reply message / Comment-to-DM).
    6. Update chat history and trigger WebSocket human takeover alerts if paused.
    """
    # 1. Fetch thread
    thread = db.query(ConversationsThread).filter(
        ConversationsThread.tenant_id == tenant_id,
        ConversationsThread.canal_origen == channel,
        ConversationsThread.contacto_identificador_plataforma == sender_id
    ).first()

    if not thread:
        thread = ConversationsThread(
            tenant_id=tenant_id,
            canal_origen=channel,
            contacto_identificador_plataforma=sender_id,
            historial_chat_json=[]
        )
        db.add(thread)
        db.commit()
        db.refresh(thread)

    # Broadcast incoming user message to WebSocket in real time
    await socket_manager.broadcast_to_tenant(
        tenant_id, 
        {
            "event": "new_message",
            "channel": channel,
            "sender_id": sender_id,
            "content": message_text,
            "ai_active": thread.ai_active_status
        }
    )

    # If human agent took over, do not reply automatically
    if not thread.ai_active_status:
        return None

    # 2. Get Knowledge Base
    kb = db.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == tenant_id).first()
    kb_text = kb.texto_scrapeado_limpio if kb else "No hay información adicional de la empresa."

    # 3. Call Gemini
    history = thread.historial_chat_json
    ai_response = await gemini_service.generate_response(kb_text, history, message_text)

    # 4. CRM Leads Extraction
    if ai_response.extracted_name or ai_response.extracted_email or ai_response.extracted_phone:
        lead = LeadCRM(
            tenant_id=tenant_id,
            nombre_extraido=ai_response.extracted_name,
            email=ai_response.extracted_email,
            telefono=ai_response.extracted_phone,
            red_social_origen=channel,
            notas_interes_ia=f"Interés detectado en el chat. Respuesta IA: {ai_response.reply}"
        )
        db.add(lead)
        db.commit()
        # Notify CRM updates in real time
        await socket_manager.broadcast_to_tenant(
            tenant_id,
            {"event": "new_lead", "lead_id": lead.id, "name": lead.nombre_extraido}
        )

    # 5. Check Human Handoff / Pause trigger
    if not ai_response.ai_active_status:
        thread.ai_active_status = False
        db.commit()
        # Trigger push/websocket alert to agent dashboard
        await socket_manager.broadcast_to_tenant(
            tenant_id,
            {
                "event": "human_handoff_alert",
                "channel": channel,
                "sender_id": sender_id,
                "reason": "AI requested handoff / Sentiment detected"
            }
        )

    # 6. Execute Reply based on strategy (Direct chat vs Comment-to-DM)
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    
    if is_public_comment and comment_id and creds:
        # Public Comment: Comment-to-DM Strategy
        # Reply publicly and trigger private DM
        await omnichannel.handle_comment_to_dm(
            creds=creds,
            platform=channel,
            comment_id=comment_id,
            user_id=sender_id,
            public_reply_text="¡Hola! Te envié todos los detalles por mensaje privado 📩",
            private_dm_text=ai_response.reply
        )
    else:
        # Direct Chat: Send standard direct message
        if creds:
            if channel == "whatsapp":
                await omnichannel.send_whatsapp_message(creds, sender_id, ai_response.reply)
            elif channel == "messenger":
                await omnichannel.send_messenger_message(creds, sender_id, ai_response.reply)
            elif channel == "telegram":
                await omnichannel.send_telegram_message(creds, sender_id, ai_response.reply)
            elif channel == "sms":
                await omnichannel.send_sms_twilio(creds, sender_id, ai_response.reply)
            elif channel == "instagram":
                await omnichannel.send_instagram_dm(creds, sender_id, ai_response.reply)
            else:
                print(f"[DIRECT MOCK SEND] Channel: {channel} | To: {sender_id} | Msg: {ai_response.reply}")

    # 7. Update Thread History
    history.append({"role": "user", "content": message_text, "timestamp": str(datetime.datetime.utcnow())})
    history.append({"role": "model", "content": ai_response.reply, "timestamp": str(datetime.datetime.utcnow())})
    thread.historial_chat_json = list(history)
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(thread, "historial_chat_json")
    
    thread.ultima_interaccion_timestamp = datetime.datetime.utcnow()
    db.commit()

    # Broadcast thread updates to Unified Inbox
    await socket_manager.broadcast_to_tenant(
        tenant_id,
        {
            "event": "message_sent",
            "channel": channel,
            "sender_id": sender_id,
            "content": ai_response.reply,
            "ai_active": thread.ai_active_status
        }
    )
    return ai_response

# --- Webhooks Endpoints ---

# 1. WhatsApp Webhook
@router.get("/{tenant_id}/whatsapp")
async def verify_whatsapp(
    tenant_id: str,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    """WhatsApp verification token webhook."""
    # Simple verification logic, in production match with ChannelsCredentials
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/{tenant_id}/whatsapp")
async def receive_whatsapp(tenant_id: str, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives WhatsApp Cloud API webhook JSON payload."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling WhatsApp request from IP: {client_ip}")
        return {"status": "rate_limited"}
        
    if settings.META_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256")
        body_bytes = await request.body()
        if not verify_meta_signature(body_bytes, signature, settings.META_APP_SECRET):
            print("[SECURITY WARNING] Invalid WhatsApp webhook signature! Rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        body = await request.json()
        # Parse payload WhatsApp message structure
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        
        if messages:
            msg = messages[0]
            msg_id = msg.get("id")
            if is_duplicate_message(msg_id):
                print(f"[DEDUPLICATION] Ignoring duplicate WhatsApp message ID: {msg_id}")
                return {"status": "duplicate"}
                
            sender_id = msg.get("from")
            text = msg.get("text", {}).get("body", "")
            if text:
                background_tasks.add_task(
                    process_incoming_message,
                    tenant_id, "whatsapp", sender_id, text, db
                )
    except Exception as e:
        print(f"[WHATSAPP WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 2. Telegram Webhook
@router.post("/{tenant_id}/telegram")
async def receive_telegram(tenant_id: str, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives Telegram Bot API updates."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling Telegram request from IP: {client_ip}")
        return {"status": "rate_limited"}
        
    try:
        body = await request.json()
        update_id = str(body.get("update_id", ""))
        if update_id and is_duplicate_message(update_id):
            print(f"[DEDUPLICATION] Ignoring duplicate Telegram update ID: {update_id}")
            return {"status": "duplicate"}
            
        message = body.get("message", {})
        chat_id = str(message.get("chat", {}).get("id", ""))
        text = message.get("text", "")
        if chat_id and text:
            background_tasks.add_task(
                process_incoming_message,
                tenant_id, "telegram", chat_id, text, db
            )
    except Exception as e:
        print(f"[TELEGRAM WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 3. Twilio SMS Webhook
@router.post("/{tenant_id}/sms")
async def receive_sms(tenant_id: str, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives Twilio SMS message webhook (Form URL Encoded)."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling Twilio request from IP: {client_ip}")
        return Response(content="<Response></Response>", media_type="application/xml")
        
    try:
        form_data = await request.form()
        msg_id = form_data.get("MessageSid", "")
        if msg_id and is_duplicate_message(msg_id):
            print(f"[DEDUPLICATION] Ignoring duplicate SMS MessageSid: {msg_id}")
            return Response(content="<Response></Response>", media_type="application/xml")
            
        sender_id = form_data.get("From", "")
        text = form_data.get("Body", "")
        if sender_id and text:
            background_tasks.add_task(
                process_incoming_message,
                tenant_id, "sms", sender_id, text, db
            )
    except Exception as e:
        print(f"[SMS WEBHOOK PARSE ERROR] {str(e)}")
    # Respond with Twilio XML format
    return Response(content="<Response></Response>", media_type="application/xml")

# 4. Instagram Webhook
@router.get("/{tenant_id}/instagram")
async def verify_instagram(hub_challenge: str = Query(None, alias="hub.challenge")):
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/{tenant_id}/instagram")
async def receive_instagram(tenant_id: str, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Instagram Webhook supporting both DMs and public comment validation (Comment-to-DM)."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling Instagram request from IP: {client_ip}")
        return {"status": "rate_limited"}
        
    if settings.META_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256")
        body_bytes = await request.body()
        if not verify_meta_signature(body_bytes, signature, settings.META_APP_SECRET):
            print("[SECURITY WARNING] Invalid Instagram webhook signature! Rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        body = await request.json()
        entry = body.get("entry", [])[0]
        messaging = entry.get("messaging", [])
        changes = entry.get("changes", [])
        
        # Scenario A: Direct Message (DM)
        if messaging:
            msg_event = messaging[0]
            msg_id = msg_event.get("message", {}).get("mid")
            if is_duplicate_message(msg_id):
                print(f"[DEDUPLICATION] Ignoring duplicate Instagram message ID: {msg_id}")
                return {"status": "duplicate"}
                
            sender_id = msg_event.get("sender", {}).get("id")
            text = msg_event.get("message", {}).get("text", "")
            if sender_id and text:
                background_tasks.add_task(
                    process_incoming_message,
                    tenant_id, "instagram", sender_id, text, db
                )
                
        # Scenario B: Public Comment (Comment-to-DM Strategy)
        elif changes:
            change = changes[0]
            field = change.get("field")
            value = change.get("value", {})
            if field == "comments":
                comment_id = value.get("id")
                # Deduplicate comments too if necessary
                if comment_id and is_duplicate_message(comment_id):
                    print(f"[DEDUPLICATION] Ignoring duplicate comment ID: {comment_id}")
                    return {"status": "duplicate"}
                    
                sender_id = value.get("from", {}).get("id")
                text = value.get("text", "")
                # If comment has a question mark or keywords of interest
                if sender_id and text and comment_id:
                    # Filter questions/interest words
                    if any(keyword in text.lower() for keyword in ["precio", "info", "costo", "detalles", "comprar", "interes", "quien", "?", "como"]):
                        background_tasks.add_task(
                            process_incoming_message,
                            tenant_id, "instagram", sender_id, text, db, 
                            is_public_comment=True, comment_id=comment_id
                        )
    except Exception as e:
        print(f"[INSTAGRAM WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 5. Widget Web Embed Chat Router
@router.post("/{tenant_id}/widget")
async def receive_widget_message(
    tenant_id: str, 
    payload: WidgetMessageInput, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    """Processes message incoming from client website embed floating chat widget."""
    background_tasks.add_task(
        process_incoming_message,
        tenant_id, "web_widget", payload.contacto_id, payload.mensaje, db
    )
    return {"status": "queued"}

# 6. Messenger Webhook (Tenant-specific)
@router.get("/{tenant_id}/messenger")
async def verify_messenger(
    tenant_id: str,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    """Messenger verification token webhook."""
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/{tenant_id}/messenger")
async def receive_messenger(tenant_id: str, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives Messenger webhook JSON payload."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling Messenger request from IP: {client_ip}")
        return {"status": "rate_limited"}
        
    if settings.META_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256")
        body_bytes = await request.body()
        if not verify_meta_signature(body_bytes, signature, settings.META_APP_SECRET):
            print("[SECURITY WARNING] Invalid Messenger webhook signature! Rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        body = await request.json()
        entry = body.get("entry", [])[0]
        messaging = entry.get("messaging", [])
        if messaging:
            msg_event = messaging[0]
            msg_id = msg_event.get("message", {}).get("mid")
            if is_duplicate_message(msg_id):
                print(f"[DEDUPLICATION] Ignoring duplicate Messenger message ID: {msg_id}")
                return {"status": "duplicate"}
                
            sender_id = msg_event.get("sender", {}).get("id")
            text = msg_event.get("message", {}).get("text", "")
            if sender_id and text:
                background_tasks.add_task(
                    process_incoming_message,
                    tenant_id, "messenger", sender_id, text, db
                )
    except Exception as e:
        print(f"[MESSENGER WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 7. Global (Tenant-Agnostic) WhatsApp Webhook
@router.get("/whatsapp")
async def verify_global_whatsapp(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    """Global WhatsApp verification token webhook."""
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/whatsapp")
async def receive_global_whatsapp(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives WhatsApp Cloud API webhook JSON payload and routes by phone_number_id."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling Global WhatsApp request from IP: {client_ip}")
        return {"status": "rate_limited"}
        
    if settings.META_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256")
        body_bytes = await request.body()
        if not verify_meta_signature(body_bytes, signature, settings.META_APP_SECRET):
            print("[SECURITY WARNING] Invalid Global WhatsApp webhook signature! Rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        body = await request.json()
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        metadata = value.get("metadata", {})
        phone_number_id = metadata.get("phone_number_id")
        messages = value.get("messages", [])
        
        if messages and phone_number_id:
            msg = messages[0]
            msg_id = msg.get("id")
            if is_duplicate_message(msg_id):
                print(f"[DEDUPLICATION] Ignoring duplicate WhatsApp message ID: {msg_id}")
                return {"status": "duplicate"}
                
            sender_id = msg.get("from")
            text = msg.get("text", {}).get("body", "")
            if text:
                # Find tenant by phone_number_id
                creds = db.query(ChannelsCredentials).filter(
                    ChannelsCredentials.whatsapp_phone_id == phone_number_id
                ).first()
                if creds:
                    tenant_id = str(creds.tenant_id)
                    background_tasks.add_task(
                        process_incoming_message,
                        tenant_id, "whatsapp", sender_id, text, db
                    )
                else:
                    print(f"[GLOBAL WHATSAPP WEBHOOK] No tenant found for phone_number_id: {phone_number_id}")
    except Exception as e:
        print(f"[GLOBAL WHATSAPP WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 8. Global (Tenant-Agnostic) Messenger Webhook
@router.get("/messenger")
async def verify_global_messenger(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    """Global Messenger verification token webhook."""
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/messenger")
async def receive_global_messenger(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receives Facebook Messenger webhook JSON payload and routes by page_id."""
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        print(f"[RATE LIMIT] Throttling Global Messenger request from IP: {client_ip}")
        return {"status": "rate_limited"}
        
    if settings.META_APP_SECRET:
        signature = request.headers.get("X-Hub-Signature-256")
        body_bytes = await request.body()
        if not verify_meta_signature(body_bytes, signature, settings.META_APP_SECRET):
            print("[SECURITY WARNING] Invalid Global Messenger webhook signature! Rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid signature")
    try:
        body = await request.json()
        entry = body.get("entry", [])[0]
        page_id = entry.get("id")
        messaging = entry.get("messaging", [])
        if messaging and page_id:
            msg_event = messaging[0]
            msg_id = msg_event.get("message", {}).get("mid")
            if is_duplicate_message(msg_id):
                print(f"[DEDUPLICATION] Ignoring duplicate Messenger message ID: {msg_id}")
                return {"status": "duplicate"}
                
            sender_id = msg_event.get("sender", {}).get("id")
            text = msg_event.get("message", {}).get("text", "")
            if sender_id and text:
                # Find tenant by page_id
                creds = db.query(ChannelsCredentials).filter(
                    ChannelsCredentials.messenger_page_id == page_id
                ).first()
                if creds:
                    tenant_id = str(creds.tenant_id)
                    background_tasks.add_task(
                        process_incoming_message,
                        tenant_id, "messenger", sender_id, text, db
                    )
                else:
                    print(f"[GLOBAL MESSENGER WEBHOOK] No tenant found for page_id: {page_id}")
    except Exception as e:
        print(f"[GLOBAL MESSENGER WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}
