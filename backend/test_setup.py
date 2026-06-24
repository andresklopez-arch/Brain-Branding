import sys
import os
import uuid

# Add current folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, Base, engine
from app.models import Tenant, ChannelsCredentials

def test_insert_tenant():
    print("[TEST] Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    print("[TEST] Creating a Tenant model...")
    try:
        tenant = Tenant(
            nombre_empresa="Test Company 2",
            plan_saas="Growth",
            estado_global="Active"
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        print(f"[SUCCESS] Tenant created with ID: {tenant.id} (Type: {type(tenant.id)})")
        
        # Test credentials creation
        print("[TEST] Creating ChannelsCredentials for tenant...")
        creds = ChannelsCredentials(tenant_id=tenant.id)
        db.add(creds)
        db.commit()
        print("[SUCCESS] Credentials created successfully.")
        
    except Exception as e:
        print("[ERROR] Exception occurred during insert/commit:")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_insert_tenant()
