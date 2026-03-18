from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.store import InMemoryStore, NotFoundError


class SavedArtifactRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_restore_saved_artifact_version_records_restore_snapshot(self) -> None:
        store = InMemoryStore()
        user_id = "user-1"
        name = "Demo Artifact"

        await store.save_saved_artifact(
            user_id,
            name,
            "<!doctype html><html><body><h1>v1</h1></body></html>",
            None,
            "first",
            {"step": 1},
            {"panelColor": "#111111"},
        )
        await store.save_saved_artifact(
            user_id,
            name,
            "<!doctype html><html><body><h1>v2</h1></body></html>",
            None,
            "second",
            {"step": 2},
            {"panelColor": "#222222"},
        )

        restored = await store.restore_saved_artifact_version(user_id, name, 1)
        self.assertIn(">v1<", restored.html)
        self.assertEqual(restored.last_prompt, "first")
        self.assertEqual(restored.last_answers, {"step": 1})

        versions = await store.list_saved_artifact_versions(user_id, name, 10)
        self.assertGreaterEqual(len(versions), 3)
        self.assertEqual(versions[0].source, "restore")
        self.assertIn(">v1<", versions[0].html)

    async def test_restore_saved_artifact_version_raises_when_version_missing(self) -> None:
        store = InMemoryStore()
        user_id = "user-1"
        name = "Demo Artifact"

        await store.save_saved_artifact(
            user_id,
            name,
            "<!doctype html><html><body><h1>v1</h1></body></html>",
            None,
            None,
            {},
            None,
        )

        with self.assertRaises(NotFoundError):
            await store.restore_saved_artifact_version(user_id, name, 99)


if __name__ == "__main__":
    unittest.main()
