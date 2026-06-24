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

# Dependency to get db session in FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
