import httpx
from typing import Dict, Any, Optional
from ..models import ChannelsCredentials
import json

class OmnichannelService:
    def __init__(self):
        self.client = httpx.AsyncClient()

    async def send_whatsapp_message(self, creds: ChannelsCredentials, phone_number: str, text: str):
        """Sends WhatsApp message via Meta Cloud API."""
        if not creds.whatsapp_token or not creds.whatsapp_phone_id:
            print(f"[MOCK WHATSAPP] To: {phone_number} | Message: {text}")
            return True
            
        url = f"https://graph.facebook.com/v18.0/{creds.whatsapp_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {creds.whatsapp_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "text",
            "text": {"body": text}
        }
        try:
            response = await self.client.post(url, headers=headers, json=payload, timeout=10.0)
            return response.status_code in [200, 201]
        except Exception as e:
            print(f"[WHATSAPP ERROR] Failed to send: {str(e)}")
            return False

    async def send_telegram_message(self, creds: ChannelsCredentials, chat_id: str, text: str):
        """Sends Telegram message via Telegram Bot API."""
        if not creds.telegram_bot_token:
            print(f"[MOCK TELEGRAM] ChatID: {chat_id} | Message: {text}")
            return True
            
        url = f"https://api.telegram.org/bot{creds.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML"
        }
        try:
            response = await self.client.post(url, json=payload, timeout=10.0)
            return response.status_code == 200
        except Exception as e:
            print(f"[TELEGRAM ERROR] Failed to send: {str(e)}")
            return False

    async def send_sms_twilio(self, creds: ChannelsCredentials, to_number: str, text: str):
        """Sends SMS via Twilio API."""
        if not creds.twilio_sms_sid or not creds.twilio_sms_auth:
            print(f"[MOCK TWILIO SMS] To: {to_number} | Message: {text}")
            return True
            
        # Twilio sends auth via Basic Auth (SID, Token)
        url = f"https://api.twilio.com/2010-04-01/Accounts/{creds.twilio_sms_sid}/Messages.json"
        auth = (creds.twilio_sms_sid, creds.twilio_sms_auth)
        data = {
            "To": to_number,
            "From": "AstroLink",  # Normally a Twilio phone number configured
            "Body": text
        }
        try:
            response = await self.client.post(url, auth=auth, data=data, timeout=10.0)
            return response.status_code in [200, 201]
        except Exception as e:
            print(f"[TWILIO ERROR] Failed to send SMS: {str(e)}")
            return False

    async def send_instagram_dm(self, creds: ChannelsCredentials, recipient_id: str, text: str):
        """Sends direct message via Meta Graph API for Instagram."""
        if not creds.instagram_page_token:
            print(f"[MOCK INSTAGRAM DM] Recipient: {recipient_id} | Message: {text}")
            return True
            
        url = "https://graph.facebook.com/v18.0/me/messages"
        headers = {"Content-Type": "application/json"}
        params = {"access_token": creds.instagram_page_token}
        payload = {
            "recipient": {"id": recipient_id},
            "message": {"text": text}
        }
        try:
            response = await self.client.post(url, params=params, headers=headers, json=payload, timeout=10.0)
            return response.status_code == 200
        except Exception as e:
            print(f"[INSTAGRAM ERROR] Failed to send DM: {str(e)}")
            return False

    async def handle_comment_to_dm(
        self, 
        creds: ChannelsCredentials, 
        platform: str, 
        comment_id: str, 
        user_id: str, 
        public_reply_text: str = "¡Hola! Te envié los detalles por mensaje privado 📩",
        private_dm_text: str = ""
    ):
        """
        Executes Comment-to-DM strategy:
        1. Responds suttly to the public comment.
        2. Sends a direct message with details.
        """
        print(f"[COMMENT-TO-DM] Platform: {platform} | Comment ID: {comment_id} | User: {user_id}")
        
        # 1. Public Reply
        public_success = False
        if platform == "instagram" and creds.instagram_page_token:
            url = f"https://graph.facebook.com/v18.0/{comment_id}/replies"
            params = {"access_token": creds.instagram_page_token}
            payload = {"message": public_reply_text}
            try:
                res = await self.client.post(url, params=params, json=payload)
                public_success = res.status_code in [200, 201]
            except Exception as e:
                print(f"[IG COMMENT REPLY ERROR] {str(e)}")
        else:
            # Mock success for other platforms
            print(f"[MOCK PUBLIC REPLY] Platform: {platform} | Comment ID: {comment_id} | Text: {public_reply_text}")
            public_success = True

        # 2. Private DM
        dm_success = False
        if platform == "instagram":
            dm_success = await self.send_instagram_dm(creds, user_id, private_dm_text)
        elif platform == "telegram":
            dm_success = await self.send_telegram_message(creds, user_id, private_dm_text)
        elif platform == "whatsapp":
            dm_success = await self.send_whatsapp_message(creds, user_id, private_dm_text)
        else:
            print(f"[MOCK PRIVATE DM] Platform: {platform} | User: {user_id} | Text: {private_dm_text}")
            dm_success = True
            
        return public_success and dm_success
        
    async def close(self):
        await self.client.aclose()

# Global instantiable service
omnichannel = OmnichannelService()
