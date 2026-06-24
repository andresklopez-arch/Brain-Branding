import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://astro_user:astro_password@localhost:5432/astro_db")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-key-astro-link-9988")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    META_APP_SECRET: str = os.getenv("META_APP_SECRET", "")
    RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "30"))
    RATE_LIMIT_WINDOW: int = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
