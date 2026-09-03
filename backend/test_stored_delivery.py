"""New delivery policy must not rewrite previously published packages."""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app import main
from test_main import worker_briefing


class StoredDeliveryTests(unittest.TestCase):
    def test_published_transport_video_is_returned_without_regeneration(self):
        package = worker_briefing(steps=[{
            "sequence": 1, "task_code": "ONION_TRANSPORT", "title": "Transport",
            "description": "Move to storage", "delivery_mode": "VIDEO",
        }])
        package["video"] = [{
            "step_sequence": 1, "asset_id": "old-transport", "task_code": "ONION_TRANSPORT",
            "video_url": "https://example.test/old.mp4", "provenance": "AI_GENERATED_PREGENERATED",
            "review_status": "APPROVED", "safety_level": "LOW", "captions_text": "Move to storage",
        }]
        stored_rows = {
            "work_sessions": {"id": "session-1", "current_version": 1, "status": "PUBLISHED", "contract_version": "structure-v2", "ontology_version": "ontology-v2"},
            "work_versions": {"id": "version-1"},
            "worker_briefing_packages": {"package_json": package},
        }

        def table(name):
            query = MagicMock()
            query.select.return_value = query
            query.eq.return_value = query
            query.execute.return_value = SimpleNamespace(data=[stored_rows[name]])
            return query

        client = MagicMock()
        client.table.side_effect = table
        with patch.object(main, "build_worker_packages", side_effect=AssertionError("must not regenerate")):
            result = main.stored_worker_briefing(client, "session-1", "vi", "farm-1")
        self.assertEqual(result, package)
        self.assertEqual(result["video"][0]["asset_id"], "old-transport")


if __name__ == "__main__":
    unittest.main()
