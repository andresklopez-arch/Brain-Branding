import httpx
import json

def test_api():
    url = "http://localhost:8000/tenants/setup"
    params = {
        "nombre_empresa": "Test Company API",
        "website_url": "https://brain-branding.web.app/?v=4"
    }
    
    print(f"[TEST] Sending POST request to {url}...")
    try:
        response = httpx.post(url, params=params, timeout=10.0)
        print("Status Code:", response.status_code)
        print("Headers:", dict(response.headers))
        try:
            print("Response JSON:", response.json())
        except Exception:
            print("Response Text:", response.text)
    except Exception as e:
        print("[ERROR] Request failed:", str(e))

if __name__ == "__main__":
    test_api()
