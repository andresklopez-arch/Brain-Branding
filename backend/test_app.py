import asyncio
import sys
from app.services.scraper import WebScraper
from app.services.gemini import GeminiService
from app.database import Base
from sqlalchemy import create_engine

# 1. Test Scraper Clean HTML Logic
def test_scraper_clean_html():
    print("[TEST] Testing scraper HTML stripping...")
    scraper = WebScraper()
    raw_html = """
    <html>
      <head><style>body {color: red;}</style></head>
      <body>
        <nav><ul><li><a href="/home">Home</a></li></ul></nav>
        <header><h1>Astro Link Page</h1></header>
        <main>
          <p>Ofrecemos servicios de automatizacion IA a bajo costo.</p>
          <script>console.log("hello");</script>
          <p>Precios desde $99/mes.</p>
        </main>
        <footer>© 2026 Astro Link</footer>
      </body>
    </html>
    """
    clean = scraper.clean_html(raw_html)
    print("Clean Text Result:\n", clean)
    assert "servicios de automatizacion IA" in clean
    assert "Precios desde" in clean
    assert "console.log" not in clean
    assert "body {color" not in clean
    print("[SUCCESS] Scraper logic validated.")

# 2. Test Gemini Service Mock Flow & Structured Output
async def test_gemini_mock_flow():
    print("\n[TEST] Testing Gemini service mock fallback and sentiment handoff...")
    gemini = GeminiService()
    
    # Test sentiment/handoff triggers
    res_angry = await gemini.generate_response(
        knowledge_base="Precios desde $99.",
        chat_history=[],
        new_message="¡Esto es una estafa! Quiero hablar con una persona ya mismo"
    )
    print("Angry user reply:", res_angry.reply)
    print("Angry user handoff status (expected False):", res_angry.ai_active_status)
    assert res_angry.ai_active_status is False
    assert res_angry.sentiment_alert is True
    
    # Test leads extraction
    res_lead = await gemini.generate_response(
        knowledge_base="Hamburguesas Gourmet.",
        chat_history=[],
        new_message="Mi correo es juan@gmail.com y mi celular es +5491133334444"
    )
    print("Lead extract email:", res_lead.extracted_email)
    print("Lead extract phone:", res_lead.extracted_phone)
    assert res_lead.extracted_email == "juan@gmail.com"
    assert res_lead.extracted_phone == "+5491133334444"
    print("[SUCCESS] Gemini mock triggers validated.")

# 3. Test SQLAlchemy schema mappings
def test_db_schema():
    print("\n[TEST] Testing database schema mappings...")
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    print("[SUCCESS] Database tables mapped successfully on sqlite memory.")

async def main():
    test_scraper_clean_html()
    await test_gemini_mock_flow()
    test_db_schema()
    print("\n[COMPLETE] All local unit verifications passed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
