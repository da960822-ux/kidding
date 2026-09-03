import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
STRUCTURE_SCHEMA = ROOT / "docs" / "schemas" / "structure-v2.schema.json"
OPENAPI = ROOT / "docs" / "openapi.yaml"
BACKEND_MAIN = ROOT / "backend" / "app" / "main.py"
ONTOLOGY_MIGRATION = ROOT / "supabase" / "migrations" / "202609030007_expand_onion_strawberry_ontology.sql"


def structure(task_family: str, task_code: str) -> dict:
    return {
        "interpretation": "READY",
        "summary_ko": "작업을 진행합니다.",
        "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None},
        "task_family": task_family,
        "quantity": {"value": 20, "unit": "망"},
        "deadline": None,
        "safety": [],
        "notes": None,
        "steps": [{
            "sequence": 1,
            "task_code": task_code,
            "title_ko": "작업",
            "description_ko": "작업을 진행합니다.",
            "unsupported_reason": None,
        }],
        "ambiguities": [],
        "schema_version": "2",
        "contract_version": "structure-v2",
        "ontology_version": "ontology-v2",
    }


class CurrentContractTests(unittest.TestCase):
    def test_ontology_migration_preserves_legacy_versions_and_assets(self):
        migration = ONTOLOGY_MIGRATION.read_text(encoding="utf-8").lower()

        self.assertNotIn("reset those sessions", migration)
        self.assertNotRegex(migration, r"(?:truncate|delete\s+from|update)\s+public\.work_versions")
        self.assertRegex(
            migration,
            r"comment on constraint visual_assets_task_code_check on public\.visual_assets is\s*"
            r"'legacy structure-v1/ontology-v1 asset codes remain readable",
        )
        self.assertIn("structure-v1", migration)
        self.assertIn("ontology-v1", migration)
        for legacy_code in (
            "onion_collect", "bagging", "loading", "warehouse_transport", "stacking",
        ):
            self.assertIn(legacy_code, migration)

    def test_new_publish_requires_current_codes_and_matching_family(self):
        validator = Draft202012Validator(json.loads(STRUCTURE_SCHEMA.read_text(encoding="utf-8")))
        self.assertFalse(list(validator.iter_errors(structure("ONION", "ONION_HARVEST"))))
        self.assertFalse(list(validator.iter_errors(structure("STRAWBERRY", "STRAWBERRY_HARVEST"))))
        self.assertTrue(list(validator.iter_errors(structure("ONION", "ONION_COLLECT"))))
        self.assertTrue(list(validator.iter_errors(structure("ONION", "STRAWBERRY_HARVEST"))))
    def test_contract_documents_name_structure_v2_as_current_and_v1_as_legacy(self):
        documents = [
            OPENAPI,
            ROOT / "docs" / "DATA_MODEL.md",
            ROOT / "docs" / "AI_CONTRACTS.md",
            ROOT / "docs" / "TEAM_UPDATE_ONION_STRAWBERRY_P0.md",
        ]
        for document in documents:
            text = document.read_text(encoding="utf-8")
            self.assertIn("structure-v1", text)
            self.assertIn("structure-v2", text)
            self.assertIn("ontology-v2", text)

    def test_openapi_uses_origin_not_static_csrf_token(self):
        openapi = OPENAPI.read_text(encoding="utf-8")
        backend = BACKEND_MAIN.read_text(encoding="utf-8")
        self.assertIn("exact allowed Origin", openapi)
        self.assertNotIn("X-CSRF-Token", openapi)
        self.assertNotIn("CsrfToken", openapi)
        self.assertNotIn("x-csrf-token", backend.lower())

if __name__ == "__main__":
    unittest.main()
