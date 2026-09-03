import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ContractMigrationReviewTests(unittest.TestCase):
    def test_openapi_v2_write_worker_and_legacy_read_contracts(self):
        openapi = (ROOT / "docs" / "openapi.yaml").read_text(encoding="utf-8")

        self.assertIn("state: { $ref: '#/components/schemas/StructureV2' }", openapi)
        self.assertIn("schema: { $ref: '#/components/schemas/WorkerBriefing' }", openapi)
        self.assertIn("LegacyWorkSessionRead", openapi)
        self.assertIn("contract_version: { type: string, const: structure-v2 }", openapi)

    def test_quantity_rpc_is_v2_only_and_farm_scoped(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030008_refresh_quantity_translations.sql").read_text(encoding="utf-8")

        for invariant in (
            "p_farm_id uuid", "legacy_read_only",
            "contract_version <> 'structure-v2'", "ontology_version <> 'ontology-v2'",
            "id = p_session_id and farm_id = p_farm_id",
        ):
            self.assertIn(invariant, sql)

    def test_farm_scope_columns_are_non_null_and_cross_farm_links_are_blocked(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030009_two_crop_owner_scope.sql").read_text(encoding="utf-8")

        for table in ("work_drafts", "work_sessions", "worker_links", "today_work_teams", "today_work_team_members", "today_work_assignments"):
            self.assertIn(f"alter table public.{table} alter column farm_id set not null", sql)
        for constraint in ("today_work_teams_farm_work_date_key", "worker_links_session_farm_fkey", "today_assignments_member_farm_fkey", "today_assignments_session_farm_fkey"):
            self.assertIn(constraint, sql)

    def test_atomic_v2_publish_rpc_writes_both_packages_before_switching_latest(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030009_two_crop_owner_scope.sql").read_text(encoding="utf-8")

        for invariant in (
            "create function public.publish_work_version_with_packages",
            "p_draft_id uuid", "p_session_id uuid", "p_expected_version integer",
            "p_packages jsonb", "jsonb_array_length(p_packages) <> 2",
            "invalid_worker_briefing_packages", "worker_briefing_packages",
            "value->>'session_id' <> p_session_id::text",
            "value->>'version' <> next_version::text",
            "contract_version <> 'structure-v2'", "legacy_read_only",
            "set status = 'SUPERSEDED'", "set status = 'PUBLISHED'",
        ):
            self.assertIn(invariant, sql)

    def test_confirm_contract_publishes_shared_package_before_delivery_selection(self):
        openapi = (ROOT / "docs" / "openapi.yaml").read_text(encoding="utf-8")
        main = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        frontend = (ROOT / "src" / "webapp" / "api.ts").read_text(encoding="utf-8")

        self.assertIn("required: [expected_version, decision]", openapi)
        self.assertNotIn("required: [expected_version, decision, delivery_mode, language_code]", openapi)
        confirm_model = main.split("class DraftConfirmRequest", 1)[1].split("class QuantityChangeConfirmRequest", 1)[0]
        self.assertNotIn("delivery_mode", confirm_model)
        self.assertNotIn("language_code", confirm_model)
        confirm_request = frontend.split("confirmDraft:", 1)[1].split("listSessions:", 1)[0]
        self.assertNotIn("deliveryMode", confirm_request)
        self.assertNotIn("languageCode", confirm_request)

    def test_demo_owner_authentication_keeps_pin_hash_server_side(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030009_two_crop_owner_scope.sql").read_text(encoding="utf-8")

        for invariant in (
            "create function public.authenticate_demo_owner(p_pin text)",
            "security definer", "crypt(p_pin, pin_hash) = pin_hash",
            "where is_active", "returns table(owner_id uuid, farm_id uuid)",
            "create function public.seed_demo_owner(p_farm_slug text, p_pin text)",
            "nullif(p_pin, '')", "revoke all on function public.authenticate_demo_owner(text) from public, anon, authenticated",
        ):
            self.assertIn(invariant, sql)

    def test_documented_node_bridge_includes_transcribe_audio_operation(self):
        architecture = (ROOT / "docs" / "ARCHITECTURE.md").read_text(encoding="utf-8")
        contracts = (ROOT / "docs" / "AI_CONTRACTS.md").read_text(encoding="utf-8")

        self.assertIn("TRANSCRIBE_AUDIO", architecture)
        self.assertIn("TRANSCRIBE_AUDIO", contracts)

    def test_v2_worker_link_issue_is_farm_scoped_and_rejects_legacy(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030009_two_crop_owner_scope.sql").read_text(encoding="utf-8")

        for invariant in (
            "create function public.issue_worker_link_v2(",
            "p_farm_id uuid", "p_session_id uuid", "p_language_code text", "p_link jsonb",
            "id = p_session_id and farm_id = p_farm_id",
            "raise exception 'legacy_read_only'", "insert into public.worker_links(farm_id, work_session_id",
        ):
            self.assertIn(invariant, sql)

    def test_old_incomplete_quantity_publish_rpc_is_not_callable_after_009(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030009_two_crop_owner_scope.sql").read_text(encoding="utf-8")

        self.assertIn("revoke all on function public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb)", sql)


if __name__ == "__main__":
    unittest.main()
