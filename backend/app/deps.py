from __future__ import annotations

from .config import settings
from .realtime import ConnectionManager
from .store import InMemoryStore
from .store_supabase import SupabaseStore

if settings.supabase_url and settings.supabase_service_role_key:
    store = SupabaseStore(
        settings.supabase_url, settings.supabase_service_role_key
    )
else:
    store = InMemoryStore()
manager = ConnectionManager()


def get_store() -> InMemoryStore:
    return store


def get_manager() -> ConnectionManager:
    return manager
