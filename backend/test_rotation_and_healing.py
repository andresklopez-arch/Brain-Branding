import sys
import os
import asyncio
import httpx
import uuid
import time

# Add current folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.gemini import GeminiService
from app.tasks import check_and_recover_worker
import app.tasks as tasks

def test_custom_fields_extraction():
    print("[TEST] Testing custom fields extraction in GeminiService mock...")
    gemini = GeminiService()
    
    # 1. Test budget (presupuesto) extraction
    res_budget = gemini._mock_response(
        message="Hola, mi presupuesto es de 1000 dolares.",
        custom_fields=["presupuesto"]
    )
    print("Mock budget extraction:", res_budget.extracted_custom_fields)
    assert res_budget.extracted_custom_fields is not None
    assert "1000 USD" in res_budget.extracted_custom_fields.get("presupuesto", "")

    # 2. Test services (servicios/interes) extraction
    res_services = gemini._mock_response(
        message="Me interesa contratar desarrollo de software.",
        custom_fields=["interes"]
    )
    print("Mock services extraction:", res_services.extracted_custom_fields)
    assert res_services.extracted_custom_fields is not None
    assert res_services.extracted_custom_fields.get("interes") == "contratar"
    
    print("[SUCCESS] Custom fields extraction mock tests passed.")

def test_worker_health_recovery():
    print("\n[TEST] Testing worker health check and recovery...")
    # Simulate a stalled heartbeat
    tasks.LAST_WORKER_HEARTBEAT = time.time() - 30.0  # 30 seconds ago
    
    # Verify health endpoint detects it and initiates recovery
    try:
        res = httpx.get("http://127.0.0.1:8000/health/worker", timeout=5.0)
        print("Worker health response status:", res.status_code)
        print("Worker health response JSON:", res.json())
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "recovered"
        print("[SUCCESS] Worker heartbeat recovery via health check verified.")
    except Exception as e:
        print("[WARNING] Could not test worker health via API (is backend server running?):", str(e))
        
        # Test recovery logic directly
        recovered = check_and_recover_worker()
        assert recovered is True
        print("[SUCCESS] Direct worker heartbeat recovery verified.")

def test_key_rotation_flow():
    print("\n[TEST] Testing key rotation and credential re-encryption...")
    # 1. Create a setup tenant first
    setup_url = "http://127.0.0.1:8000/tenants/setup"
    company_name = f"Test Rotation Co {uuid.uuid4().hex[:6]}"
    params = {
        "nombre_empresa": company_name,
        "website_url": "https://brain-branding.web.app/"
    }
    
    try:
        setup_res = httpx.post(setup_url, params=params, timeout=5.0)
        assert setup_res.status_code == 200
        tenant_id = setup_res.json()["id"]
        print(f"Created tenant {tenant_id} for rotation test.")
        
        # 2. Update credentials with a secret key
        creds_url = f"http://127.0.0.1:8000/tenants/{tenant_id}/credentials"
        original_gemini_key = "AIzaSyTestApiKeyForRotation12345"
        payload = {
            "gemini_api_key": original_gemini_key
        }
        update_res = httpx.put(creds_url, json=payload, timeout=5.0)
        assert update_res.status_code == 200
        print("Updated credentials with gemini api key.")
        
        # 3. Rotate key using POST /{tenant_id}/rotate-secret?new_secret=...
        rotate_url = f"http://127.0.0.1:8000/tenants/{tenant_id}/rotate-secret"
        new_secret = "new-super-secret-rotated-key-1122"
        rotate_res = httpx.post(rotate_url, params={"new_secret": new_secret}, timeout=5.0)
        assert rotate_res.status_code == 200
        print("Key rotation response:", rotate_res.json())
        
        # 4. Fetch credentials again and check if it decrypts correctly using the rotated key
        get_res = httpx.get(creds_url, timeout=5.0)
        assert get_res.status_code == 200
        retrieved_key = get_res.json()["gemini_api_key"]
        print("Retrieved decrypted key after rotation:", retrieved_key)
        assert retrieved_key == original_gemini_key
        
        print("[SUCCESS] Global key rotation flow validated end-to-end.")
        
    except Exception as e:
        print("[ERROR] Key rotation flow test failed:", str(e))
        raise e

if __name__ == "__main__":
    test_custom_fields_extraction()
    test_worker_health_recovery()
    test_key_rotation_flow()
    print("\n[COMPLETE] All rotation and self-healing checks passed successfully.")
