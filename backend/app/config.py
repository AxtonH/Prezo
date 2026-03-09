from __future__ import annotations

import json
import re

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
    "https://localhost:5173",
    "https://localhost:5174",
    "https://prezo-backend-production.up.railway.app",
    "https://prezo-frontend-addin-production.up.railway.app",
    "https://prezo-frontend-audience-production.up.railway.app",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)

    app_name: str = "Prezo"
    cors_origins: list[str] = Field(
        default_factory=lambda: list(DEFAULT_CORS_ORIGINS)
    )
    cors_origin_regex: str = r"^https://prezo-[a-z0-9-]+\.up\.railway\.app$|^https?://localhost:\d+$"
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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        if value is None or value == "":
            return list(DEFAULT_CORS_ORIGINS)
        if isinstance(value, list):
            origins = [str(item).strip() for item in value if str(item).strip()]
            return origins or list(DEFAULT_CORS_ORIGINS)
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return list(DEFAULT_CORS_ORIGINS)
            normalized_text = text.replace('\\"', '"').strip()
            if (
                len(normalized_text) >= 2
                and normalized_text[0] == normalized_text[-1]
                and normalized_text[0] in ('"', "'")
            ):
                normalized_text = normalized_text[1:-1].strip()
            if normalized_text.startswith("["):
                try:
                    parsed = json.loads(normalized_text)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    origins = [str(item).strip() for item in parsed if str(item).strip()]
                    return origins or list(DEFAULT_CORS_ORIGINS)
            origin_matches = re.findall(
                r"""https?://[^\s,;\]"']+""",
                normalized_text,
                flags=re.IGNORECASE,
            )
            if origin_matches:
                deduped: list[str] = []
                seen: set[str] = set()
                for origin in origin_matches:
                    normalized_origin = origin.strip()
                    if not normalized_origin or normalized_origin in seen:
                        continue
                    seen.add(normalized_origin)
                    deduped.append(normalized_origin)
                if deduped:
                    return deduped
            origins = [
                part.strip()
                for part in re.split(r"[\s,;]+", normalized_text)
                if part and part.strip()
            ]
            return origins or list(DEFAULT_CORS_ORIGINS)
        return list(DEFAULT_CORS_ORIGINS)


settings = Settings()
