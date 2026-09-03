import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "asset_manifest.csv"
MIGRATION = ROOT / "supabase" / "migrations" / "202609030010_asset_manifest_seed.sql"

CURRENT_CODES = {
    "ONION_HARVEST",
    "ONION_TRIMMING",
    "ONION_SORTING",
    "ONION_TRANSPORT",
    "STRAWBERRY_HARVEST",
    "STRAWBERRY_SORTING",
    "STRAWBERRY_INSPECTION",
    "STRAWBERRY_PACKING",
}


def load_importer():
    spec = importlib.util.spec_from_file_location("import_visual_assets", ROOT / "backend" / "import_visual_assets.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class AssetManifestImportTests(unittest.TestCase):
    def test_manifest_parser_accepts_exactly_eight_current_assets(self):
        rows = load_importer().load_manifest(MANIFEST)

        self.assertEqual(8, len(rows))
        self.assertEqual(CURRENT_CODES, {row["task_code"] for row in rows})
        self.assertTrue(all(row["asset_type"] == "VIDEO" for row in rows))
        self.assertTrue(all(row["content_type"] == "video/mp4" for row in rows))
        self.assertTrue(all(row["is_current"] is True for row in rows))

    def test_additive_migration_imports_atomically_and_preserves_matching_rows(self):
        sql = MIGRATION.read_text(encoding="utf-8")

        for invariant in (
            "add column if not exists content_type text",
            "add column if not exists reviewed_at timestamptz",
            "add column if not exists checksum_md5 text",
            "add column if not exists is_current boolean not null default false",
            "create unique index if not exists visual_assets_v2_current_approved_low_task_code_key",
            "create function public.import_visual_assets_v2(p_assets jsonb)",
            "checksum_mismatch",
            "on conflict (id) do nothing",
            "jsonb_array_length(p_assets) <> 8",
        ):
            self.assertIn(invariant, sql)
        self.assertNotIn("delete from public.visual_assets", sql.lower())
        self.assertNotIn("truncate public.visual_assets", sql.lower())

    def test_demo_farm_is_seeded_without_pin_and_legacy_v1_publish_is_revoked(self):
        sql = MIGRATION.read_text(encoding="utf-8")

        self.assertIn("'demo-farm'", sql)
        self.assertNotIn("PIN=", sql)
        self.assertIn(
            "revoke all on function public.publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb) from service_role",
            sql,
        )

    def test_seed_runner_only_reads_pin_from_environment(self):
        source = (ROOT / "backend" / "seed_demo_owner.py").read_text(encoding="utf-8")

        self.assertIn('os.getenv("DEMO_OWNER_PIN")', source)
        self.assertIn('rpc("seed_demo_owner"', source)
        self.assertNotIn("print(pin)", source)
        self.assertNotIn("DEMO_OWNER_PIN=", source)


if __name__ == "__main__":
    unittest.main()
