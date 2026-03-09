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
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-5.2"
    openai_artifact_edit_model: str = "gpt-5.2"
    openai_connect_timeout_seconds: float = 15.0
    openai_plan_timeout_seconds: float = 60.0
    openai_artifact_build_timeout_seconds: float = 180.0
    openai_artifact_edit_timeout_seconds: float = 240.0
    openai_artifact_repair_timeout_seconds: float = 240.0
    openai_artifact_answer_timeout_seconds: float = 90.0


settings = Settings()
