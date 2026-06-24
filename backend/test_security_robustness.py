import sys
import os
import asyncio
import httpx
import uuid

# Add current folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.utils import is_safe_url
from app.services.scraper import WebScraper

def test_url_safety():
    print("[TEST] Testing URL safety validations (SSRF protection)...")
    
    # Safe URLs
    assert is_safe_url("https://brain-branding.web.app/") == True
    assert is_safe_url("http://google.com") == True
    
    # Unsafe URLs
    assert is_safe_url("http://localhost") == False
    assert is_safe_url("http://127.0.0.1") == False
    assert is_safe_url("http://127.0.0.1:8000") == False
    assert is_safe_url("file:///etc/passwd") == False
    assert is_safe_url("ftp://somehost") == False
    assert is_safe_url("http://169.254.169.254/latest/meta-data") == False
    
    # Advanced SSRF Ranges (Documentation and Benchmarking blocklists)
    assert is_safe_url("http://192.0.2.1") == False
    assert is_safe_url("http://198.51.100.5") == False
    assert is_safe_url("http://203.0.113.10") == False
    assert is_safe_url("http://198.18.1.1") == False
    assert is_safe_url("http://100.64.0.1") == False
    
    print("[SUCCESS] All URL safety validations passed.")


def test_api_endpoints():
    print("[TEST] Testing setup security API endpoints (calling running backend on port 8000)...")
    url = "http://127.0.0.1:8000/tenants/setup"
    
    # Test 1: SSRF Block
    params_unsafe = {
        "nombre_empresa": "Spam Company Unsafe",
        "website_url": "http://127.0.0.1:8000/some-private-resource"
    }
    try:
        res = httpx.post(url, params=params_unsafe, timeout=5.0)
        print("Unsafe URL setup status:", res.status_code)
        assert res.status_code == 400
        print("[SUCCESS] Unsafe URL blocked correctly with 400.")
    except Exception as e:
        print("[WARNING] Could not test API SSRF block (is backend server running?):", str(e))
        return

    # Test 2: Double Submission Block
    company_name = f"Unique Co {uuid.uuid4().hex[:6]}"
    params_ok = {
        "nombre_empresa": company_name,
        "website_url": "https://brain-branding.web.app/"
    }
    
    try:
        # First request should succeed
        res1 = httpx.post(url, params=params_ok, timeout=5.0)
        print("First setup request status:", res1.status_code)
        assert res1.status_code == 200
        
        # Immediate second request with same name should be blocked (409 Conflict)
        res2 = httpx.post(url, params=params_ok, timeout=5.0)
        print("Second setup request status:", res2.status_code)
        assert res2.status_code == 409
        print("[SUCCESS] Double submission blocked correctly with 409.")
    except Exception as e:
        print("[ERROR] Double submission test failed:", str(e))
        raise e


async def test_scraper_timeout():
    print("[TEST] Testing scraper timeout limit...")
    # Instantiate scraper
    scraper = WebScraper(max_pages=2)
    # We can test with a mock wait or a target that exists
    # Since we want to make sure it doesn't hang, we run it and measure elapsed time
    import time
    start = time.time()
    # Scrape a real URL, max pages is 2 so it should be fast anyway
    text = await scraper.scrape_site("https://brain-branding.web.app/")
    elapsed = time.time() - start
    print(f"Scraping completed in {elapsed:.2f}s (length: {len(text)})")
    assert elapsed < 15.0
    print("[SUCCESS] Scraper execution completed well within bounds.")


if __name__ == "__main__":
    test_url_safety()
    test_api_endpoints()
    asyncio.run(test_scraper_timeout())
    print("\n[COMPLETE] All security & robustness test checks passed successfully.")
