from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# Try to connect to PostgreSQL. If it fails, fallback to local SQLite for easy development.
try:
    # Use a short login timeout to check availability quickly
    engine = create_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 2} if "postgresql" in settings.DATABASE_URL else {})
    connection = engine.connect()
    connection.close()
    print("[DATABASE] Connected to PostgreSQL successfully.")
except Exception as e:
    print(f"[DATABASE WARNING] PostgreSQL is not reachable: {str(e)}")
    print("[DATABASE INFO] Falling back to SQLite for local development: sqlite:///./astro_db.sqlite")
    engine = create_engine(
        "sqlite:///./astro_db.sqlite", 
        connect_args={"check_same_thread": False}
    )
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.close()
        except Exception:
            pass

# Configure session maker
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for DB models
Base = declarative_base()

# Run dynamic column migrations for SQLite/Postgres compatibility on import
try:
    from sqlalchemy import text
    with engine.begin() as conn:
        for col, table in [
            ("gemini_api_key", "channels_credentials"),
            ("gemini_model_name", "channels_credentials"),
            ("gemini_temperature", "channels_credentials"),
            ("encryption_salt", "channels_credentials"),
            ("custom_lead_fields_json", "channels_credentials"),
            ("campos_personalizados_json", "leads_crm")
        ]:
            try:
                col_type = "TEXT"
                if col == "gemini_temperature":
                    col_type = "FLOAT"
                elif col in ["gemini_model_name", "encryption_salt"]:
                    col_type = "VARCHAR(100)"
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type};"))
                print(f"[DATABASE MIGRATION] Added {col} column to {table} (if not already present).")
            except Exception:
                pass
except Exception as migration_err:
    print(f"[DATABASE MIGRATION ERROR] Could not apply dynamic migrations: {str(migration_err)}")

# Dependency to get db session in FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
