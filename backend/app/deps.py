from __future__ import annotations

from .realtime import ConnectionManager
from .store import InMemoryStore

store = InMemoryStore()
manager = ConnectionManager()


def get_store() -> InMemoryStore:
    return store


def get_manager() -> ConnectionManager:
    return manager