import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ContractMigrationReviewTests(unittest.TestCase):
    def test_openapi_v2_write_worker_and_legacy_read_contracts(self):
        openapi = (ROOT / "docs" / "openapi.yaml").read_text(encoding="utf-8")

        self.assertIn("state: { $ref: '#/components/schemas/WorkState' }", openapi)
        self.assertIn("schema: { $ref: '#/components/schemas/WorkerBriefing' }", openapi)
        self.assertIn("LegacyWorkSessionRead", openapi)
        self.assertIn("LegacyWorkVersion", openapi)
        self.assertIn("/api/v1/tts/{text_hash}/{language_code}:", openapi)
        self.assertIn("'403': { $ref: '#/components/responses/Forbidden' }", openapi)
        self.assertNotIn("    WorkerAssignment:", openapi)
        self.assertIn("contract_version: { type: string, const: structure-v2 }", openapi)

    def test_quantity_rpc_is_v2_only_and_farm_scoped(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030012_refresh_quantity_translations.sql").read_text(encoding="utf-8")

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
        repair = (ROOT / "supabase" / "migrations" / "202609030013_fix_publish_package_version_reference.sql").read_text(encoding="utf-8")

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

        self.assertIn("update public.work_versions as previous_version", repair)
        self.assertIn("previous_version.version = p_expected_version", repair)

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

    def test_clean_install_bootstrap_closes_the_009_forward_reference(self):
        migrations = ROOT / "supabase" / "migrations"
        before_009 = "\n".join(path.read_text(encoding="utf-8") for path in sorted(migrations.glob("*.sql"))[:8]).lower()
        migration_009 = (migrations / "202609030009_two_crop_owner_scope.sql").read_text(encoding="utf-8").lower()
        migration_012 = (migrations / "202609030012_refresh_quantity_translations.sql").read_text(encoding="utf-8").lower()
        bootstrap = (ROOT / "supabase" / "clean-install-bootstrap.sql").read_text(encoding="utf-8").lower()
        five_argument_declaration = (
            "p_farm_id uuid,\n  p_session_id uuid,\n  p_expected_version integer,\n"
            "  p_quantity jsonb,\n  p_state_json jsonb"
        )
        signature = "public.publish_quantity_change(uuid, uuid, integer, jsonb, jsonb)"

        self.assertNotIn(five_argument_declaration, before_009)
        self.assertIn(f"revoke all on function {signature}", migration_009)
        self.assertIn("clean_install_bootstrap_requires_empty_database", bootstrap)
        self.assertIn("namespace.nspname = 'public' and relation.relkind in ('r', 'p')", bootstrap)
        self.assertIn(five_argument_declaration, bootstrap)
        self.assertIn(f"revoke all on function {signature}", bootstrap)
        self.assertIn(f"drop function if exists {signature};", migration_012)

    def test_farm_code_owner_credentials_are_provisioned_and_authenticated_per_farm(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030015_farm_code_owner_credentials.sql").read_text(encoding="utf-8")

        for invariant in (
            "drop index if exists public.demo_owners_active_farm_idx",
            "create unique index if not exists demo_owners_one_active_credential_per_farm_idx",
            "on public.demo_owners (farm_id)",
            "where is_active",
            "create function public.provision_farm_owner(",
            "p_farm_code text",
            "p_display_name text",
            "p_pin text",
            "farm_code text, farm_name text",
            "on conflict (farm_id) where is_active do update",
            "extensions.crypt(p_pin, extensions.gen_salt('bf', 12))",
            "create function public.authenticate_farm_owner(p_farm_code text, p_pin text)",
            "farm.slug = lower(btrim(p_farm_code))",
            "extensions.crypt(p_pin, owner.pin_hash) = owner.pin_hash",
            "grant execute on function public.provision_farm_owner(text, text, text) to service_role",
            "grant execute on function public.authenticate_farm_owner(text, text) to service_role",
        ):
            self.assertIn(invariant, sql)

        self.assertNotIn("drop function if exists public.authenticate_demo_owner", sql)
        self.assertNotIn("drop function if exists public.seed_demo_owner", sql)
        self.assertNotIn("revoke all on function public.authenticate_demo_owner", sql)
        self.assertNotIn("revoke all on function public.seed_demo_owner", sql)

        returned_columns = sql.split(") returns table(", 1)[1].split(")\nlanguage plpgsql", 1)[0]
        self.assertNotIn("pin", returned_columns)

    def test_015_fails_before_active_credential_data_loss_and_serializes_qr_rotation(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030015_farm_code_owner_credentials.sql").read_text(encoding="utf-8")

        for invariant in (
            "having count(*) > 1",
            "active_demo_owner_duplicate",
            "create table if not exists public.today_work_team_invite_rotations",
            "primary key (team_id, idempotency_key)",
            "create function public.rotate_today_work_team_invite(",
            "for update",
            "values (target_team.id, target_team.invite_issue_idempotency_key)",
            "on conflict do nothing",
            "return next target_team",
            "create function public.p0_readiness()",
            "to_regprocedure('public.authenticate_farm_owner(text,text)')",
            "to_regprocedure('public.provision_farm_owner(text,text,text)')",
            "grant execute on function public.p0_readiness() to service_role",
        ):
            self.assertIn(invariant, sql)

    def test_farm_owner_provisioner_reads_secrets_without_printing_them(self):
        source = (ROOT / "backend" / "provision_farm_owner.py").read_text(encoding="utf-8")

        for invariant in (
            'required_environment("FARM_CODE")',
            'required_environment("FARM_DISPLAY_NAME")',
            'required_environment("FARM_OWNER_PIN")',
            '"provision_farm_owner"',
        ):
            self.assertIn(invariant, source)
        self.assertNotIn("print(pin)", source)
        self.assertNotIn('os.getenv("FARM_OWNER_PIN",', source)

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

    def test_legacy_auth_and_write_rpcs_are_removed_only_after_current_cutover(self):
        migrations = ROOT / "supabase" / "migrations"
        contract_path = migrations / "202609030017_remove_legacy_write_rpcs.sql"
        contract = contract_path.read_text(encoding="utf-8")
        backend = (ROOT / "backend" / "app" / "main.py").read_text(encoding="utf-8")
        obsolete_signatures = (
            "authenticate_demo_owner(text)",
            "seed_demo_owner(text, text)",
            "publish_initial_draft(uuid, jsonb, text, text, text, boolean, text, text, jsonb)",
            "publish_quantity_change(uuid, integer, jsonb)",
            "publish_quantity_change(uuid, uuid, integer, jsonb, jsonb)",
            "issue_worker_link(uuid, text, jsonb)",
        )

        self.assertEqual(contract_path, sorted(migrations.glob("*.sql"))[-1])
        for signature in obsolete_signatures:
            self.assertIn(f"drop function if exists public.{signature};", contract)
            self.assertNotIn(f'"{signature.split("(", 1)[0]}"', backend)

    def test_legacy_visual_assets_can_receive_manifest_metadata_once(self):
        sql = (ROOT / "supabase" / "migrations" / "202609030014_backfill_legacy_visual_asset_metadata.sql").read_text(encoding="utf-8")

        self.assertIn("stored.checksum_md5 is not null", sql)
        self.assertIn("on conflict (id) do update set", sql)
        self.assertIn("where visual_assets.checksum_md5 is null", sql)


if __name__ == "__main__":
    unittest.main()
