from fastapi import APIRouter, Depends, Query, Request, Response, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from typing import Optional
from collections import defaultdict
from email.mime.text import MIMEText
from email.header import Header
from ..database import get_db, SessionLocal
from ..models import KnowledgeBase, ConversationsThread, LeadCRM, ChannelsCredentials
from ..schemas import WidgetMessageInput
from ..services.gemini import GeminiService
from ..services.channels import omnichannel
from ..services.websocket import socket_manager
from ..config import settings
from ..utils import decrypt_val, scrub_sensitive_data
import datetime
import json
import hmac
import hashlib
import time
import redis


router = APIRouter(prefix="/webhooks", tags=["Webhooks"])
gemini_service = GeminiService()

def queue_incoming_message(
    db: Session,
    tenant_id: str,
    channel: str,
    sender_id: str,
    text: str,
    is_public_comment: bool = False,
    comment_id: Optional[str] = None
):
    """Sanitizes text and queues the message processing in AsyncTaskQueue."""
    from ..utils import sanitize_input
    from ..tasks import queue_async_task
    
    clean_text = sanitize_input(text)
    payload = {
        "tenant_id": tenant_id,
        "channel": channel,
        "sender_id": sender_id,
        "message_text": clean_text,
        "is_public_comment": is_public_comment,
        "comment_id": comment_id
    }
    queue_async_task(db, "incoming_message", payload)

# Try connecting to Redis for production-grade rate limiting and deduplication
redis_client = None
try:
    redis_client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=1.0)
    # Ping to check connection
    redis_client.ping()
    print("[REDIS] Webhooks: Connected successfully to Redis.")
except Exception as e:
    redis_client = None
    msg = f"[REDIS ERROR] Webhooks: Redis connection failed ({str(e)})."
    if settings.REQUIRE_REDIS:
        print(f"CRITICAL: {msg} Startup halted because REQUIRE_REDIS is enabled.")
        raise RuntimeError(msg)
    else:
        print(f"{msg} Falling back to local in-memory store.")

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

async def enforce_signature(request: Request):
    """Enforces Meta Webhook signature validation if enabled or secret configured."""
    if settings.REQUIRE_META_SIGNATURE or settings.META_APP_SECRET:
        if not settings.META_APP_SECRET:
            print("[SECURITY ERROR] META_APP_SECRET is not configured but signatures are required!")
            raise HTTPException(status_code=500, detail="Webhook security configuration error")
        signature = request.headers.get("X-Hub-Signature-256")
        body_bytes = await request.body()
        if not verify_meta_signature(body_bytes, signature, settings.META_APP_SECRET):
            print("[SECURITY WARNING] Invalid Meta webhook signature! Rejecting request.")
            raise HTTPException(status_code=403, detail="Invalid signature")


# Local in-memory fallback stores
request_history = defaultdict(list)
processed_message_ids = {}

def is_rate_limited(key: str) -> bool:
    """Checks if a key has exceeded rate limits, using Redis if available."""
    window = settings.RATE_LIMIT_WINDOW
    max_reqs = settings.RATE_LIMIT_MAX_REQUESTS
    
    if redis_client:
        try:
            rkey = f"ratelimit:{key}"
            current = redis_client.get(rkey)
            if current is None:
                redis_client.set(rkey, 1, ex=window)
                return False
            else:
                count = int(current)
                if count >= max_reqs:
                    return True
                redis_client.incr(rkey)
                return False
        except Exception as e:
            print(f"[REDIS ERROR] Rate limiter fallback to local store: {str(e)}")
            
    # Local fallback
    current_time = time.time()
    request_history[key] = [t for t in request_history[key] if current_time - t < window]
    if len(request_history[key]) >= max_reqs:
        return True
    request_history[key].append(current_time)
    return False

def is_duplicate_message(message_id: str) -> bool:
    """Checks if a message ID is duplicate, using Redis if available."""
    if not message_id:
        return False
    if redis_client:
        try:
            rkey = f"dedup:{message_id}"
            is_new = redis_client.set(rkey, "1", nx=True, ex=600)  # expires in 10 minutes
            return not is_new
        except Exception as e:
            print(f"[REDIS ERROR] Deduplicator fallback to local store: {str(e)}")
            
    # Local fallback
    current_time = time.time()
    for mid, t in list(processed_message_ids.items()):
        if current_time - t > 600:
            processed_message_ids.pop(mid, None)
    if message_id in processed_message_ids:
        return True
    processed_message_ids[message_id] = current_time
    return False

async def send_spam_email_alert(tenant_id: str, channel: str, sender_id: str, db: Session):
    """Sends email alert to the tenant if they have SMTP email credentials configured."""
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if not creds or not creds.email_imap_smtp_config_json:
        return
        
    config = creds.email_imap_smtp_config_json
    smtp_server = config.get("smtp_server")
    smtp_port = config.get("smtp_port")
    username = config.get("username") or config.get("smtp_user") or config.get("email_config_user")
    password = config.get("password") or config.get("smtp_pass") or config.get("email_config_pass")
    
    if not smtp_server or not smtp_port or not username or not password:
        return
        
    subject = "⚠️ Alerta de Spam en Astro Link"
    body = f"""
Se ha detectado posible SPAM del contacto '{sender_id}' en el canal '{channel}'.

La IA ha sido desactivada automáticamente para esta conversación para proteger tu cuota y permitir atención humana.

Inicia sesión en tu panel de Astro Link para gestionar este chat.
"""
    
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = username
    msg["To"] = username
    
    try:
        import asyncio
        import smtplib
        def send():
            with smtplib.SMTP(smtp_server, int(smtp_port)) as server:
                server.starttls()
                server.login(username, password)
                server.sendmail(username, [username], msg.as_string())
        await asyncio.get_event_loop().run_in_executor(None, send)
        print(f"[SMTP EMAIL ALERT] Sent spam alert email successfully to {username}.")
    except Exception as e:
        print(f"[SMTP EMAIL ALERT ERROR] Failed to send email alert: {str(e)}")

async def process_incoming_message(
    tenant_id: str,
    channel: str,
    sender_id: str,
    message_text: str,
    db: Optional[Session] = None,
    is_public_comment: bool = False,
    comment_id: Optional[str] = None
):
    """
    Core pipeline to process incoming omnichannel messages:
    0. Rate limiting (Spam protection).
    1. Check/create thread.
    2. Read company knowledge base.
    3. Generate human-like reply using Gemini 3.5 Flash.
    4. Handle Lead CRM extraction.
    5. Perform action (Reply message / Comment-to-DM).
    6. Update chat history and trigger WebSocket human takeover alerts if paused.
    """
    is_local_session = db is None
    db = db if db is not None else SessionLocal()
    try:
        # Scrub sensitive PII data like credit cards
        message_text = scrub_sensitive_data(message_text)

        # 1. Fetch or create thread
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

        # 0. Rate limiting by sender_id to prevent spam
        rate_limit_key = f"{tenant_id}:{channel}:{sender_id}"
        if is_rate_limited(rate_limit_key):
            print(f"[SPAM DETECTED] Throttling sender {sender_id} on {channel} for tenant {tenant_id}")
            
            # Send friendly warning message back to sender
            creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
            if creds:
                warning_msg = "Has enviado demasiados mensajes. Por favor espera un momento antes de continuar."
                if channel == "whatsapp":
                    await omnichannel.send_whatsapp_message(creds, sender_id, warning_msg)
                elif channel == "messenger":
                    await omnichannel.send_messenger_message(creds, sender_id, warning_msg)
                elif channel == "telegram":
                    await omnichannel.send_telegram_message(creds, sender_id, warning_msg)
                elif channel == "sms":
                    await omnichannel.send_sms_twilio(creds, sender_id, warning_msg)
                elif channel == "instagram":
                    await omnichannel.send_instagram_dm(creds, sender_id, warning_msg)
                else:
                    print(f"[RATE LIMIT MOCK SEND] Channel: {channel} | To: {sender_id} | Msg: {warning_msg}")

            # Only notify/deactivate if AI is currently active.
            # This prevents spam loops (repeated emails/websockets/system alerts).
            if thread.ai_active_status:
                thread.ai_active_status = False
                spam_message = f"Alerta de Spam: El contacto {sender_id} ha enviado demasiados mensajes. La IA ha sido desactivada en esta conversación."
                
                history = thread.historial_chat_json or []
                history.append({"role": "user", "content": message_text, "timestamp": str(datetime.datetime.utcnow())})
                history.append({
                    "role": "system",
                    "content": spam_message,
                    "timestamp": str(datetime.datetime.utcnow())
                })
                thread.historial_chat_json = list(history)
                flag_modified(thread, "historial_chat_json")
                thread.ultima_interaccion_timestamp = datetime.datetime.utcnow()
                db.commit()
                
                # Broadcast spam alert WebSocket event to tenant dashboard
                await socket_manager.broadcast_to_tenant(
                    tenant_id,
                    {
                        "event": "spam_alert",
                        "channel": channel,
                        "sender_id": sender_id,
                        "message": spam_message
                    }
                )
                
                # Try sending email notification in background
                await send_spam_email_alert(tenant_id, channel, sender_id, db)
            else:
                # If already inactive, just record the user message in history
                history = thread.historial_chat_json or []
                history.append({"role": "user", "content": message_text, "timestamp": str(datetime.datetime.utcnow())})
                thread.historial_chat_json = list(history)
                flag_modified(thread, "historial_chat_json")
                thread.ultima_interaccion_timestamp = datetime.datetime.utcnow()
                db.commit()

            # Broadcast incoming user message to WebSocket in real time even under rate limit
            await socket_manager.broadcast_to_tenant(
                tenant_id, 
                {
                    "event": "new_message",
                    "channel": channel,
                    "sender_id": sender_id,
                    "content": message_text,
                    "ai_active": False
                }
            )
            return None

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

        # Check if Gemini engine is globally active for this tenant
        creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
        active_channels = (creds.active_channels_json or {}) if creds else {}
        is_gemini_active = active_channels.get("gemini", True)

        # If human agent took over, or Gemini AI engine is globally inactive, save the incoming message to database history and do not reply automatically
        if not thread.ai_active_status or not is_gemini_active:
            history = thread.historial_chat_json or []
            history.append({"role": "user", "content": message_text, "timestamp": str(datetime.datetime.utcnow())})
            thread.historial_chat_json = list(history)
            flag_modified(thread, "historial_chat_json")
            thread.ultima_interaccion_timestamp = datetime.datetime.utcnow()
            db.commit()
            return None

        # 2. Get Knowledge Base and Credentials
        kb = db.query(KnowledgeBase).filter(KnowledgeBase.tenant_id == tenant_id).first()
        kb_text = kb.texto_scrapeado_limpio if kb else "No hay información adicional de la empresa."

        creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
        api_key = decrypt_val(creds.gemini_api_key, salt_str=creds.encryption_salt) if (creds and creds.gemini_api_key) else None
        model_name = creds.gemini_model_name if (creds and creds.gemini_model_name) else None
        temperature = creds.gemini_temperature if (creds and creds.gemini_temperature is not None) else None

        # 3. Call Gemini
        history = thread.historial_chat_json
        try:
            ai_response = await gemini_service.generate_response(
                kb_text, history, message_text, 
                api_key=api_key, model_name=model_name, temperature=temperature
            )
        except Exception as e:
            print(f"[GEMINI FALLBACK] Error calling model {model_name}: {str(e)}. Falling back to gemini-2.5-flash.")
            ai_response = await gemini_service.generate_response(
                kb_text, history, message_text, 
                api_key=api_key, model_name="gemini-2.5-flash", temperature=temperature
            )
            
        # Scrub sensitive data from generated reply too (Sugerencia 8 / PII Scrubbing)
        if ai_response.reply:
            ai_response.reply = scrub_sensitive_data(ai_response.reply)

        # 4. CRM Leads Extraction
        if ai_response.extracted_name or ai_response.extracted_email or ai_response.extracted_phone:
            # Validate email format (Sugerencia 16)
            email = ai_response.extracted_email
            if email:
                import re
                if not re.match(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", email):
                    email = None
                    
            lead = LeadCRM(
                tenant_id=tenant_id,
                nombre_extraido=ai_response.extracted_name,
                email=email,
                telefono=ai_response.extracted_phone,
                red_social_origen=channel,
                notas_interes_ia=f"Interés detectado en el chat. Respuesta IA: {ai_response.reply}"
            )
            
            # Write Audit Log (Sugerencia 18)
            from ..models import AuditLog
            audit = AuditLog(
                tenant_id=tenant_id,
                usuario_origen="system_ia",
                accion_realizada="lead_creation",
                detalles=f"Lead creado automáticamente para el contacto {sender_id}."
            )
            db.add(lead)
            db.add(audit)
            db.commit()
            # Notify CRM updates in real time
            await socket_manager.broadcast_to_tenant(
                tenant_id,
                {"event": "new_lead", "lead_id": lead.id, "name": lead.nombre_extraido}
            )

        # 5. Check Human Handoff / Pause trigger
        handoff_alert_triggered = False
        if not ai_response.ai_active_status:
            thread.ai_active_status = False
            db.commit()
            handoff_alert_triggered = True
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
                    if handoff_alert_triggered:
                        await omnichannel.send_whatsapp_message(creds, sender_id, "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.")
                elif channel == "messenger":
                    await omnichannel.send_messenger_message(creds, sender_id, ai_response.reply)
                    if handoff_alert_triggered:
                        await omnichannel.send_messenger_message(creds, sender_id, "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.")
                elif channel == "telegram":
                    await omnichannel.send_telegram_message(creds, sender_id, ai_response.reply)
                    if handoff_alert_triggered:
                        await omnichannel.send_telegram_message(creds, sender_id, "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.")
                elif channel == "sms":
                    await omnichannel.send_sms_twilio(creds, sender_id, ai_response.reply)
                    if handoff_alert_triggered:
                        await omnichannel.send_sms_twilio(creds, sender_id, "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.")
                elif channel == "instagram":
                    await omnichannel.send_instagram_dm(creds, sender_id, ai_response.reply)
                    if handoff_alert_triggered:
                        await omnichannel.send_instagram_dm(creds, sender_id, "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.")
                else:
                    print(f"[DIRECT MOCK SEND] Channel: {channel} | To: {sender_id} | Msg: {ai_response.reply}")
                    if handoff_alert_triggered:
                        print(f"[DIRECT MOCK SEND] Channel: {channel} | To: {sender_id} | Msg: Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.")

        # 7. Update Thread History
        history = thread.historial_chat_json or []
        history.append({"role": "user", "content": message_text, "timestamp": str(datetime.datetime.utcnow())})
        history.append({"role": "model", "content": ai_response.reply, "timestamp": str(datetime.datetime.utcnow())})
        
        if handoff_alert_triggered:
            history.append({
                "role": "system",
                "content": "Derivación a agente humano: La IA solicitó asistencia o detectó un sentimiento que requiere atención.",
                "timestamp": str(datetime.datetime.utcnow())
            })
            history.append({
                "role": "model",
                "content": "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.",
                "timestamp": str(datetime.datetime.utcnow())
            })
            
        thread.historial_chat_json = list(history)
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
        if handoff_alert_triggered:
            await socket_manager.broadcast_to_tenant(
                tenant_id,
                {
                    "event": "message_sent",
                    "channel": channel,
                    "sender_id": sender_id,
                    "content": "Nuestra inteligencia artificial se ha pausado. Un agente humano continuará la conversación en breve.",
                    "ai_active": False
                }
            )
        return ai_response
    finally:
        if is_local_session:
            db.close()


# --- Webhooks Endpoints ---

# 1. WhatsApp Webhook
@router.get("/{tenant_id}/whatsapp")
async def verify_whatsapp(
    tenant_id: str,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    db: Session = Depends(get_db)
):
    """WhatsApp verification token webhook."""
    if not hub_mode:
        return Response(
            content=f"El Webhook de WhatsApp para el tenant {tenant_id} está activo. Por favor configure esta URL en el Portal de Desarrolladores de Meta.",
            media_type="text/plain"
        )
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if creds and creds.whatsapp_token:
        expected_token = decrypt_val(creds.whatsapp_token, salt_str=creds.encryption_salt)
        allowed_tokens = [expected_token, tenant_id, creds.whatsapp_phone_id]
        if expected_token and hub_verify_token not in allowed_tokens:
            raise HTTPException(status_code=403, detail="Verification token mismatch")
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/{tenant_id}/whatsapp")
async def receive_whatsapp(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Receives WhatsApp Cloud API webhook JSON payload."""
    await enforce_signature(request)
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
                queue_incoming_message(
                    db, tenant_id, "whatsapp", sender_id, text, False, None
                )
    except Exception as e:
        print(f"[WHATSAPP WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 2. Telegram Webhook
@router.post("/{tenant_id}/telegram")
async def receive_telegram(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Receives Telegram Bot API updates."""
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
            queue_incoming_message(
                db, tenant_id, "telegram", chat_id, text, False, None
            )
    except Exception as e:
        print(f"[TELEGRAM WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}

# 3. Twilio SMS Webhook
@router.post("/{tenant_id}/sms")
async def receive_sms(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Receives Twilio SMS message webhook (Form URL Encoded)."""
    try:
        form_data = await request.form()
        msg_id = form_data.get("MessageSid", "")
        if msg_id and is_duplicate_message(msg_id):
            print(f"[DEDUPLICATION] Ignoring duplicate SMS MessageSid: {msg_id}")
            return Response(content="<Response></Response>", media_type="application/xml")
            
        sender_id = form_data.get("From", "")
        text = form_data.get("Body", "")
        if sender_id and text:
            queue_incoming_message(
                db, tenant_id, "sms", sender_id, text, False, None
            )
    except Exception as e:
        print(f"[SMS WEBHOOK PARSE ERROR] {str(e)}")
    # Respond with Twilio XML format
    return Response(content="<Response></Response>", media_type="application/xml")

# 4. Instagram Webhook
@router.get("/{tenant_id}/instagram")
async def verify_instagram(
    tenant_id: str,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    db: Session = Depends(get_db)
):
    """Instagram verification token webhook."""
    if not hub_mode:
        return Response(
            content=f"El Webhook de Instagram para el tenant {tenant_id} está activo. Por favor configure esta URL en el Portal de Desarrolladores de Meta.",
            media_type="text/plain"
        )
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if creds and creds.instagram_page_token:
        expected_token = decrypt_val(creds.instagram_page_token, salt_str=creds.encryption_salt)
        allowed_tokens = [expected_token, tenant_id]
        if expected_token and hub_verify_token not in allowed_tokens:
            raise HTTPException(status_code=403, detail="Verification token mismatch")
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/{tenant_id}/instagram")
async def receive_instagram(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Instagram Webhook supporting both DMs and public comment validation (Comment-to-DM)."""
    await enforce_signature(request)
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
                queue_incoming_message(
                    db, tenant_id, "instagram", sender_id, text, False, None
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
                        queue_incoming_message(
                            db, tenant_id, "instagram", sender_id, text, 
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
    db: Session = Depends(get_db)
):
    """Processes message incoming from client website embed floating chat widget."""
    queue_incoming_message(
        db, tenant_id, "web_widget", payload.contacto_id, payload.mensaje, False, None
    )
    return {"status": "queued"}

# 6. Messenger Webhook (Tenant-specific)
@router.get("/{tenant_id}/messenger")
async def verify_messenger(
    tenant_id: str,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    db: Session = Depends(get_db)
):
    """Messenger verification token webhook."""
    if not hub_mode:
        return Response(
            content=f"El Webhook de Messenger para el tenant {tenant_id} está activo. Por favor configure esta URL en el Portal de Desarrolladores de Meta.",
            media_type="text/plain"
        )
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    if creds and creds.messenger_page_token:
        expected_token = decrypt_val(creds.messenger_page_token, salt_str=creds.encryption_salt)
        allowed_tokens = [expected_token, tenant_id, creds.messenger_page_id]
        if expected_token and hub_verify_token not in allowed_tokens:
            raise HTTPException(status_code=403, detail="Verification token mismatch")
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/{tenant_id}/messenger")
async def receive_messenger(tenant_id: str, request: Request, db: Session = Depends(get_db)):
    """Receives Messenger webhook JSON payload."""
    await enforce_signature(request)
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
                queue_incoming_message(
                    db, tenant_id, "messenger", sender_id, text, False, None
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
    if not hub_mode:
        return Response(
            content="El Webhook global de WhatsApp de Astro Link está activo. Por favor configure esta URL en el Portal de Desarrolladores de Meta.",
            media_type="text/plain"
        )
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/whatsapp")
async def receive_global_whatsapp(request: Request, db: Session = Depends(get_db)):
    """Receives WhatsApp Cloud API webhook JSON payload and routes by phone_number_id."""
    await enforce_signature(request)
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
                    queue_incoming_message(
                        db, tenant_id, "whatsapp", sender_id, text, False, None
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
    if not hub_mode:
        return Response(
            content="El Webhook global de Messenger de Astro Link está activo. Por favor configure esta URL en el Portal de Desarrolladores de Meta.",
            media_type="text/plain"
        )
    return Response(content=hub_challenge, media_type="text/plain")

@router.post("/messenger")
async def receive_global_messenger(request: Request, db: Session = Depends(get_db)):
    """Receives Facebook Messenger webhook JSON payload and routes by page_id."""
    await enforce_signature(request)
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
                    queue_incoming_message(
                        db, tenant_id, "messenger", sender_id, text, False, None
                    )
                else:
                    print(f"[GLOBAL MESSENGER WEBHOOK] No tenant found for page_id: {page_id}")
    except Exception as e:
        print(f"[GLOBAL MESSENGER WEBHOOK PARSE ERROR] {str(e)}")
    return {"status": "ok"}
