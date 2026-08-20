from __future__ import annotations

import asyncio
from pathlib import Path
import sys
from unittest import TestCase

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.library import (
    WIDGET_PRESET_LIMIT,
    get_widget_presets,
    sanitize_widget_preset_library,
    save_widget_presets,
)
from app.auth import AuthUser
from app.models import WidgetPresetLibraryUpsert
from app.store import InMemoryStore


def preset(preset_id: str, name: str = "Design", style: dict | None = None) -> dict:
    return {"id": preset_id, "name": name, "style": style or {"accentColor": "#2563eb"}}


class SanitizeWidgetPresetLibraryTests(TestCase):
    def test_keeps_well_formed_kinds_and_drops_the_rest(self) -> None:
        result = sanitize_widget_preset_library(
            {
                "poll": {
                    "presets": [
                        preset("a", "Cola"),
                        {"id": "", "name": "no id", "style": {}},
                        {"id": "b", "name": "   ", "style": {}},
                        {"id": "c", "name": "bad style", "style": "nope"},
                        "not-a-dict",
                    ],
                    "defaultId": "a",
                },
                "mystery-kind": {"presets": [preset("x")], "defaultId": "x"},
                "qna": "not-a-bucket",
            }
        )
        self.assertEqual([p["id"] for p in result["poll"]["presets"]], ["a"])
        self.assertEqual(result["poll"]["defaultId"], "a")
        self.assertNotIn("mystery-kind", result)
        self.assertNotIn("qna", result)

    def test_clears_dangling_default_and_dedupes_ids(self) -> None:
        result = sanitize_widget_preset_library(
            {
                "poll": {
                    "presets": [preset("a", "First"), preset("a", "Duplicate")],
                    "defaultId": "gone",
                }
            }
        )
        self.assertEqual(len(result["poll"]["presets"]), 1)
        self.assertEqual(result["poll"]["presets"][0]["name"], "First")
        self.assertIsNone(result["poll"]["defaultId"])

    def test_caps_presets_and_normalizes_names(self) -> None:
        many = [preset(f"id-{i}", f"  Name   {i}  ") for i in range(WIDGET_PRESET_LIMIT + 5)]
        result = sanitize_widget_preset_library({"poll": {"presets": many, "defaultId": None}})
        self.assertEqual(len(result["poll"]["presets"]), WIDGET_PRESET_LIMIT)
        self.assertEqual(result["poll"]["presets"][0]["name"], "Name 0")

    def test_non_dict_input_yields_empty_library(self) -> None:
        self.assertEqual(sanitize_widget_preset_library(None), {})
        self.assertEqual(sanitize_widget_preset_library([1, 2]), {})


class WidgetPresetStoreTests(TestCase):
    def test_round_trip_and_isolation_between_users(self) -> None:
        store = InMemoryStore()
        data = {"poll": {"presets": [preset("a")], "defaultId": "a"}}

        saved = asyncio.run(store.save_widget_preset_library("user-1", data))
        self.assertEqual(saved.data, data)
        self.assertIsNotNone(saved.updated_at)

        loaded = asyncio.run(store.get_widget_preset_library("user-1"))
        assert loaded is not None
        self.assertEqual(loaded.data, data)

        self.assertIsNone(asyncio.run(store.get_widget_preset_library("user-2")))

    def test_saved_data_is_cloned_not_shared(self) -> None:
        store = InMemoryStore()
        data = {"poll": {"presets": [preset("a")], "defaultId": None}}
        asyncio.run(store.save_widget_preset_library("user-1", data))
        data["poll"]["defaultId"] = "a"
        loaded = asyncio.run(store.get_widget_preset_library("user-1"))
        assert loaded is not None
        self.assertIsNone(loaded.data["poll"]["defaultId"])


class WidgetPresetEndpointTests(TestCase):
    def test_get_returns_empty_library_before_first_save(self) -> None:
        store = InMemoryStore()
        user = AuthUser(id="user-1", email="user@example.com")
        result = asyncio.run(get_widget_presets(store=store, user=user))
        self.assertEqual(result.data, {})
        self.assertIsNone(result.updated_at)

    def test_put_sanitizes_then_get_round_trips(self) -> None:
        store = InMemoryStore()
        user = AuthUser(id="user-1", email="user@example.com")
        payload = WidgetPresetLibraryUpsert(
            data={
                "poll": {
                    "presets": [preset("a", "Cola"), {"id": "bad"}],
                    "defaultId": "a",
                },
                "junk": {"presets": []},
            }
        )
        saved = asyncio.run(save_widget_presets(payload=payload, store=store, user=user))
        self.assertEqual([p["id"] for p in saved.data["poll"]["presets"]], ["a"])
        self.assertNotIn("junk", saved.data)

        loaded = asyncio.run(get_widget_presets(store=store, user=user))
        self.assertEqual(loaded.data, saved.data)
        self.assertIsNotNone(loaded.updated_at)
