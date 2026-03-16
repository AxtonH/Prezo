from __future__ import annotations

import json
import re

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


def parse_cors_origins_value(value: object) -> list[str]:
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


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", case_sensitive=False)

    app_name: str = "Prezo"
    cors_origins: str = ",".join(DEFAULT_CORS_ORIGINS)
    public_base_url: str = "http://localhost:5174"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    library_sync_secret: str | None = None
    library_sync_ttl_seconds: int = 604800
    anthropic_api_key: str | None = None
    anthropic_base_url: str = "https://api.anthropic.com/v1"
    anthropic_artifact_build_model: str = "claude-sonnet-4-6"
    anthropic_artifact_build_timeout_seconds: float = 180.0
    gemini_api_key: str | None = None
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_model: str = "gemini-2.5-flash"
    gemini_plan_model: str = "gemini-2.5-flash"
    gemini_artifact_edit_model: str = "gemini-2.5-flash"
    gemini_artifact_repair_model: str = "gemini-2.5-flash"
    gemini_artifact_answer_model: str = "gemini-2.5-flash-lite"
    gemini_plan_timeout_seconds: float = 60.0
    gemini_artifact_build_timeout_seconds: float = 180.0
    gemini_artifact_edit_timeout_seconds: float = 240.0
    gemini_artifact_repair_timeout_seconds: float = 240.0
    gemini_artifact_total_timeout_seconds: float = 270.0
    gemini_artifact_answer_timeout_seconds: float = 90.0

    @property
    def cors_origins_list(self) -> list[str]:
        return parse_cors_origins_value(self.cors_origins)


settings = Settings()
