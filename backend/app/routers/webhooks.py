from fastapi import APIRouter, Depends, Query, Request, Response, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models import Tenant, KnowledgeBase, ConversationsThread, LeadCRM, ChannelsCredentials
from ..schemas import WidgetMessageInput
from ..services.gemini import GeminiService
from ..services.channels import omnichannel
from ..services.websocket import socket_manager
import datetime
import json

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])
gemini_service = GeminiService()

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

    # If human agent took over, do not reply automatically
    if not thread.ai_active_status:
        # Broadcast incoming message to Unified Inbox via WebSockets
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
        return

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
    thread.historial_chat_json = history
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
    try:
        body = await request.json()
        # Parse payload WhatsApp message structure
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        
        if messages:
            msg = messages[0]
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
    try:
        body = await request.json()
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
    try:
        form_data = await request.form()
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
    try:
        body = await request.json()
        entry = body.get("entry", [])[0]
        messaging = entry.get("messaging", [])
        changes = entry.get("changes", [])
        
        # Scenario A: Direct Message (DM)
        if messaging:
            msg_event = messaging[0]
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
