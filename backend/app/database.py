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
    # Fallback to SQLite (check_same_thread is needed for multi-threaded SQLite usage in FastAPI)
    engine = create_engine(
        "sqlite:///./astro_db.sqlite", 
        connect_args={"check_same_thread": False}
    )

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
