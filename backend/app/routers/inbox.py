from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import ConversationsThread, ChannelsCredentials
from ..schemas import ConversationsThreadResponse
from ..services.websocket import socket_manager
from ..services.channels import omnichannel
import datetime
import json

router = APIRouter(prefix="/inbox", tags=["Unified Inbox"])

# 1. Get all active conversations for a tenant
@router.get("/{tenant_id}/conversations", response_model=List[ConversationsThreadResponse])
def get_conversations(tenant_id: str, db: Session = Depends(get_db)):
    threads = db.query(ConversationsThread).filter(
        ConversationsThread.tenant_id == tenant_id
    ).order_by(ConversationsThread.ultima_interaccion_timestamp.desc()).all()
    return threads

# 2. Get specific conversation details
@router.get("/{tenant_id}/conversations/{thread_id}", response_model=ConversationsThreadResponse)
def get_conversation_detail(tenant_id: str, thread_id: int, db: Session = Depends(get_db)):
    thread = db.query(ConversationsThread).filter(
        ConversationsThread.tenant_id == tenant_id,
        ConversationsThread.id == thread_id
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation thread not found.")
    return thread

# 3. Toggle AI response status (manual take-over / hand-back)
@router.post("/{tenant_id}/conversations/{thread_id}/toggle-ai")
def toggle_ai_status(tenant_id: str, thread_id: int, active: bool, db: Session = Depends(get_db)):
    thread = db.query(ConversationsThread).filter(
        ConversationsThread.tenant_id == tenant_id,
        ConversationsThread.id == thread_id
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation thread not found.")
    
    thread.ai_active_status = active
    db.commit()
    
    # Broadcast status change
    return {"status": "success", "ai_active_status": thread.ai_active_status}

# 4. Human manual intervention: Send message to client and mute AI
@router.post("/{tenant_id}/conversations/{thread_id}/send")
async def send_human_message(
    tenant_id: str, 
    thread_id: int, 
    message: str, 
    db: Session = Depends(get_db)
):
    thread = db.query(ConversationsThread).filter(
        ConversationsThread.tenant_id == tenant_id,
        ConversationsThread.id == thread_id
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Conversation thread not found.")
    
    # 1. Turn off AI automatically for this chat since human intervened
    thread.ai_active_status = False
    
    # 2. Add message to history
    history = thread.historial_chat_json
    history.append({
        "role": "model",  # Sent as the representative of the tenant
        "content": message,
        "timestamp": str(datetime.datetime.utcnow()),
        "by_human": True
    })
    thread.historial_chat_json = list(history)
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(thread, "historial_chat_json")
    
    thread.ultima_interaccion_timestamp = datetime.datetime.utcnow()
    db.commit()
    
    # 3. Send message out to the actual channel
    creds = db.query(ChannelsCredentials).filter(ChannelsCredentials.tenant_id == tenant_id).first()
    sent_success = False
    if creds:
        channel = thread.canal_origen
        recipient_id = thread.contacto_identificador_plataforma
        if channel == "whatsapp":
            sent_success = await omnichannel.send_whatsapp_message(creds, recipient_id, message)
        elif channel == "messenger":
            sent_success = await omnichannel.send_messenger_message(creds, recipient_id, message)
        elif channel == "telegram":
            sent_success = await omnichannel.send_telegram_message(creds, recipient_id, message)
        elif channel == "sms":
            sent_success = await omnichannel.send_sms_twilio(creds, recipient_id, message)
        elif channel == "instagram":
            sent_success = await omnichannel.send_instagram_dm(creds, recipient_id, message)
        else:
            print(f"[MANUAL MOCK SEND] Channel: {channel} | To: {recipient_id} | Msg: {message}")
            sent_success = True
            
    # 4. Broadcast change via WebSockets so dashboard updates immediately
    await socket_manager.broadcast_to_tenant(
        tenant_id,
        {
            "event": "message_sent",
            "channel": thread.canal_origen,
            "sender_id": thread.contacto_identificador_plataforma,
            "content": message,
            "ai_active": False,
            "by_human": True
        }
    )
    
    return {"status": "success", "sent": sent_success}

# 5. WebSocket connection endpoint for real-time notifications
@router.websocket("/{tenant_id}/ws")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await socket_manager.connect(websocket, tenant_id)
    try:
        while True:
            # Keep connection alive; accept messages if agents send any client-side commands
            data = await websocket.receive_text()
            # Echo or process custom websocket command actions
            payload = json.loads(data)
            await websocket.send_text(json.dumps({"status": "received", "data": payload}))
    except WebSocketDisconnect:
        socket_manager.disconnect(websocket, tenant_id)
    except Exception as e:
        print(f"[WS CONNECTION ERROR] {str(e)}")
        socket_manager.disconnect(websocket, tenant_id)

# 6. Clear simulation history (web_widget channel)
@router.post("/{tenant_id}/clear-simulation")
def clear_simulation_history(tenant_id: str, db: Session = Depends(get_db)):
    db.query(ConversationsThread).filter(
        ConversationsThread.tenant_id == tenant_id,
        ConversationsThread.canal_origen == "web_widget"
    ).delete()
    db.commit()
    return {"status": "success", "message": "Simulation history cleared."}
