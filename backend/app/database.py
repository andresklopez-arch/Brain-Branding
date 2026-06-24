from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

# Create engine for PostgreSQL connection
engine = create_engine(settings.DATABASE_URL)

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
