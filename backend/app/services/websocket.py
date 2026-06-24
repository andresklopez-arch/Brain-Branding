from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        # Maps tenant_id (str) to list of active WebSockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_id: str):
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = []
        self.active_connections[tenant_id].append(websocket)
        print(f"[WEBSOCKET] Agent connected to Tenant: {tenant_id}")

    def disconnect(self, websocket: WebSocket, tenant_id: str):
        if tenant_id in self.active_connections:
            if websocket in self.active_connections[tenant_id]:
                self.active_connections[tenant_id].remove(websocket)
                print(f"[WEBSOCKET] Agent disconnected from Tenant: {tenant_id}")
            if not self.active_connections[tenant_id]:
                del self.active_connections[tenant_id]

    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        """Sends JSON message ONLY to agents matching the tenant_id (Strict Isolation)."""
        if tenant_id in self.active_connections:
            payload = json.dumps(message)
            # Create a copy of list to iterate safely
            targets = list(self.active_connections[tenant_id])
            for connection in targets:
                try:
                    await connection.send_text(payload)
                except Exception as e:
                    # Remove dead connections
                    print(f"[WEBSOCKET ERROR] Failed broadcasting: {str(e)}")
                    try:
                        self.active_connections[tenant_id].remove(connection)
                    except ValueError:
                        pass

socket_manager = ConnectionManager()
