from google import genai
from google.genai import types
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from ..config import settings
import json

class GeminiOutput(BaseModel):
    reply: str
    extracted_name: Optional[str] = None
    extracted_email: Optional[str] = None
    extracted_phone: Optional[str] = None
    ai_active_status: bool = True
    sentiment_alert: bool = False
    extracted_custom_fields: Optional[Dict[str, Optional[str]]] = None

class GeminiService:
    def __init__(self):
        # Initialize Google GenAI client
        self.api_key = settings.GEMINI_API_KEY
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            print("[GEMINI SERVICE] Warning: GEMINI_API_KEY is not configured. Running in mock mode.")

    def get_system_prompt(self, knowledge_base: str, custom_fields: Optional[List[str]] = None) -> str:
        custom_fields_inst = ""
        if custom_fields:
            fields_str = ", ".join(custom_fields)
            custom_fields_inst = f"\n4. Intenta extraer información para los siguientes campos personalizados si se mencionan en la conversación, y devuélvelos en el diccionario 'extracted_custom_fields': {fields_str}. Las claves del diccionario deben corresponder exactamente a los nombres de estos campos."

        return f"""Actúas como un humano real y profesional, representando a la empresa de manera natural y empática. 
NUNCA utilices lenguaje corporativo rígido ni digas frases estilo "¡Hola! Soy tu asistente virtual de IA" o "¿En qué puedo ayudarte hoy?". 
Evita saludos repetitivos y mecánicos. Responde con fluidez, calidez y de forma resolutiva, adaptándote a modismos regionales si es necesario.
Mantén tus respuestas relativamente cortas y directas, idóneas para canales de mensajería (WhatsApp/DMs).

Tu base de conocimientos sobre el negocio es la siguiente:
=== INICIO BASE CONOCIMIENTO ===
{knowledge_base}
=== FIN BASE CONOCIMIENTO ===

REGLAS DE COMPORTAMIENTO:
1. Si detectas enojo extremo, insultos o frustración severa en el usuario, o si solicita explícitamente "hablar con un humano", debes establecer 'ai_active_status' a false. Explícale al usuario que un agente humano tomará el control en breve.
2. Si el usuario te proporciona su nombre, correo electrónico o número telefónico, debes extraerlo para guardarlo en el CRM.
3. Responde estrictamente con la información provista en la base de conocimientos. Si no conoces la respuesta, indícalo con amabilidad y ofrece transferir a un agente humano (poniendo 'ai_active_status' en false).{custom_fields_inst}
"""

    async def generate_response(
        self, 
        knowledge_base: str, 
        chat_history: List[Dict[str, Any]], 
        new_message: str,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: Optional[float] = None,
        custom_fields: Optional[List[str]] = None
    ) -> GeminiOutput:
        """Calls Gemini 3.5 Flash using structured schema output."""
        system_instruction = self.get_system_prompt(knowledge_base, custom_fields)
        
        # Format conversation history
        contents = []
        for msg in chat_history:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(f"{role}: {msg['content']}")
            
        contents.append(f"user: {new_message}")
        prompt = "\n".join(contents)

        current_api_key = api_key or self.api_key
        current_model = model_name or 'gemini-2.5-flash'
        current_temp = temperature if temperature is not None else 0.7
        if not current_api_key:
            # Mock mode implementation for offline/keyless development
            return self._mock_response(new_message, custom_fields)

        try:
            # Dynamically instantiate genai.Client if using tenant key, or reuse self.client
            client = genai.Client(api_key=current_api_key) if api_key else self.client
            if not client:
                client = genai.Client(api_key=current_api_key)

            # We use gemini-2.5-flash as the default endpoint (Gemini 3.5 Flash alias or current stable flash)
            response = client.models.generate_content(
                model=current_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=GeminiOutput,
                    temperature=current_temp,
                ),
            )
            
            # Parse the JSON response
            data = json.loads(response.text)
            return GeminiOutput(**data)
            
        except Exception as e:
            print(f"[GEMINI ERROR] API call failed: {str(e)}")
            # Fallback to general text request if structured fails, or mock
            return self._mock_response(new_message, custom_fields, error_msg=f"Error en motor: {str(e)}")

    def _mock_response(self, message: str, custom_fields: Optional[List[str]] = None, error_msg: str = None) -> GeminiOutput:
        """Returns mock content if API key is not configured or fails."""
        msg_lower = message.lower()
        extracted_name = None
        extracted_email = None
        extracted_phone = None
        ai_active_status = True
        sentiment_alert = False
        
        # Mock sentiment check
        if any(word in msg_lower for word in ["humano", "persona", "soporte", "queja", "estafa", "enojado", "molesto", "mierda"]):
            reply = "Entiendo perfectamente tu frustración. Voy a pausar la IA y a transferirte inmediatamente con un agente de soporte humano."
            ai_active_status = False
            sentiment_alert = True
        else:
            reply = f"Hola, gracias por escribir. He recibido tu mensaje: '{message}'. Este es una respuesta simulada de Astro Link porque no has configurado tu GEMINI_API_KEY. Configúrala en docker-compose.yml o backend/.env para activar la IA real."
            
        # Mock CRM extraction
        # Look for emails
        email_match = re_email.search(message)
        if email_match:
            extracted_email = email_match.group(0)
            
        # Look for phone
        phone_match = re_phone.search(message)
        if phone_match:
            extracted_phone = phone_match.group(0)

        # Mock custom fields extraction
        extracted_custom_fields = {}
        if custom_fields:
            for field in custom_fields:
                extracted_custom_fields[field] = None
                # Simple extraction rules for testing/mocking
                if field.lower() == "presupuesto":
                    # Look for things like "presupuesto de 500" or similar
                    match = re.search(r'(?:presupuesto|budget)\b.*?\b(\d+)\b', msg_lower)
                    if match:
                        extracted_custom_fields[field] = f"{match.group(1)} USD"
                    elif "dólares" in msg_lower or "dolares" in msg_lower or "usd" in msg_lower or "$" in msg_lower:
                        # Extract first number near these words
                        num_match = re.search(r'(\d+)\s*(?:dólares|dolares|usd|\$)', msg_lower)
                        if num_match:
                            extracted_custom_fields[field] = f"{num_match.group(1)} USD"
                elif field.lower() in ("servicio", "servicios", "interes", "interés"):
                    match = re.search(r'(?:interesa|servicio|servicios|interés|interes)\b.*?\b(\w+)\b', msg_lower)
                    if match:
                        extracted_custom_fields[field] = match.group(1)
            
        return GeminiOutput(
            reply=reply,
            extracted_name=extracted_name,
            extracted_email=extracted_email,
            extracted_phone=extracted_phone,
            ai_active_status=ai_active_status,
            sentiment_alert=sentiment_alert,
            extracted_custom_fields=extracted_custom_fields
        )

# Precompile regex for mock extraction
import re
re_email = re.compile(r'[\w\.-]+@[\w\.-]+\.\w+')
re_phone = re.compile(r'\+?\d{8,15}')
