from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)

    app_name: str = "Prezo"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:5174",
            "https://localhost:5173",
            "https://localhost:5174",
            "https://prezo-backend-production.up.railway.app",
            "https://prezo-frontend-addin-production.up.railway.app",
            "https://prezo-frontend-audience-production.up.railway.app",
        ]
    )
    public_base_url: str = "http://localhost:5174"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None


settings = Settings()
