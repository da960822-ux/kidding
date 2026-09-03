# 데이터 모델

PostgreSQL 기준 논리 모델. Supabase를 써도 같은 field/status/constraint를 유지한다.

## current write와 legacy read

현재 P0 write 계약은 `structure-v2`/`ontology-v2`다. current two-crop code는 양파 `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`와 딸기 `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`이다. 신규 draft와 publish는 이 code만 허용하고 `task_family`와 일치시킨다. `structure-v1`/`ontology-v1` row는 immutable read-only다. migration은 legacy version 또는 asset code를 삭제·reset·rewrite·remap하지 않는다.

## `work_sessions`

`id` UUID primary key, non-null `farm_id`, `location` JSONB, `task_family`(`ONION|STRAWBERRY`), `status`(`PUBLISHED`), `current_version` integer, immutable `contract_version`, `ontology_version`, `created_at`, `updated_at`를 가진다. 확인 전 데이터는 WorkDraft에만 존재한다.

## `work_drafts`

`id`, non-null `farm_id`, `draft_revision`, `summary_ko`, `transcript`, `interpretation`, `state_json`, `ambiguities`, `contract_version`, `ontology_version`, `confirmed_session_id`, `created_at`, `updated_at`, `expires_at`를 저장한다. supplement마다 revision을 증가시키고 expected revision을 원자 비교한다. raw audio는 저장하지 않는다.

## `work_versions`

`id`, `work_session_id`, `version`, `status`(`PUBLISHED|SUPERSEDED`), `state_json`, `transcript`, `confirmed_at`, `confirmation_decision`, `ambiguity_override`, `override_reason`, `overridden_at`, `created_at`를 저장한다. session별 `(work_session_id, version)`은 unique이며 PUBLISHED는 하나만 허용한다. WorkVersion content는 수정하지 않고 새 version을 만든다.

`state_json`은 `structure-v2` snapshot이다. 새 쓰기의 non-null `task_code`는 8개 current two-crop code만 허용하며 같은 state의 `task_family`와 일치해야 한다. null은 LOW 비안전 미지원 작업을 owner가 승인한 경우에만 허용한다.

### Ontology migration and immutable history

기존 WorkVersion은 저장된 `state_json`과 retired code를 그대로 보존해 읽는다. migration은 WorkVersion을 reset, delete, rewrite하거나 retired code를 새 code로 remap하지 않는다. legacy v1 version은 read-only이며 신규 publish는 `structure-v2`/`ontology-v2`의 current 8개 two-crop code만 쓴다.

## `worker_briefing_packages`와 원자 게시

각 WorkVersion에는 immutable `worker-briefing-v2` JSON package가 `vi`, `ne` 각각 하나씩 있다. `publish_work_version_with_packages` RPC는 farm/session/draft 및 expected version을 lock하고, v2 state와 두 package를 먼저 insert한 뒤 기존 PUBLISHED를 `SUPERSEDED`로 바꾼다. 어떤 validation, package insert, version conflict가 실패해도 transaction 전체가 rollback된다. 기존 `structure-v1` session/draft는 `legacy_read_only`다.

## `worker_links`

근로자 개인을 저장하지 않는다. 한 row는 `work_session_id`, `language_code`(`vi|ne`), `token_hash`, `issued_at`, `expires_at`, `revoked_at`, `issue_idempotency_key`를 가진 익명 전달 링크다.

같은 session·언어에 대해 재발급하면 기존 활성 링크를 revoke하고 새 24시간 링크를 만든다. raw token은 응답에서 한 번만 반환하고 DB에는 hash만 저장한다. 유효 링크는 매번 해당 session의 최신 PUBLISHED version을 resolve한다.

## `today_work_teams` / `today_work_team_members` / `today_work_assignments`

`today_work_teams`는 `id`, Asia/Seoul `work_date`(unique), `invite_token_hash`, `invite_issue_idempotency_key`, `issued_at`, `expires_at`, `created_at`를 가진다. raw QR token은 응답에서만 URL로 반환하고 DB에는 hash만 둔다. 같은 idempotency key는 같은 QR을 다시 반환한다.

`today_work_team_members`는 `id`, `team_id`, `display_name`, `language_code`(`vi|ne`), `joined_at`, `join_idempotency_key`를 가진다. `(team_id, join_idempotency_key)`는 unique다. 영구 worker profile, 전화번호, 국적, 로그인 credential은 저장하지 않는다.

`today_work_assignments`는 `id`, `team_member_id`, `work_session_id`, `assigned_at`, `revoked_at`를 가진다. 활성 연결은 member/session별 하나이며, worker 읽기는 연결된 WorkSession의 latest `PUBLISHED` version을 resolve한다.

## `guide_phrases` / `guide_translations`

`guide_phrases`: `phrase_key`, `category`(`WORK_TERM|WORK_INSTRUCTION|SAFETY`), `canonical_ko`, `phrase_type`, `source_name`, `source_page`, `source_url`, `license`, `verified`.

`guide_translations`: `phrase_key`, `language_code`, `translated_text`, `verified`. source/page/license와 사람 검수가 없으면 공식 번역으로 부르지 않는다. 실제 PDF 대조 전에는 data collection gate 상태다.

## `visual_assets`

`id`, `task_code`, `asset_type`, `public_path`, `provenance`, `generator_provider`, `prompt_version`, `generated_at`, `reviewer`, `review_status`, `safety_level`, `purpose`, `captions_text`를 가진다. P0는 `AI_GENERATED_PREGENERATED`·`APPROVED`·`LOW`만 게시한다. DB constraint는 historical asset code를 남겨 existing version 참조를 보존하고, 새 `structure-v2` publish는 current 8개 code만 사용한다. legacy asset code는 reset·삭제·자동 변환하지 않는다.

## `tts_assets`

게시된 step의 언어별 텍스트를 SHA-256 `text_hash`로 cache한다. `text_hash`, `language_code`(`vi|ne`), `audio_bytes`, `content_type`, `created_at`를 가지며 `(text_hash, language_code)`는 unique다. TTS는 이 cache를 먼저 조회하고, 성공한 audio만 `audio_url`로 노출한다. 생성 실패는 row를 만들지 않고 해당 언어 step을 `audio_url:null`, `delivery_mode:TEXT`로 전달한다. audio는 cache일 뿐 text가 source of truth다.

## owner PIN session과 공개 경계

P0는 별도 owner session table 없이 service-role 전용 `authenticate_demo_owner(p_pin)`이 active `demo_owners` hash를 검증해 반환한 `owner_id`, `farm_id`, expiry를 담아 server secret으로 서명한 짧은 cookie를 사용한다. `pin_hash`는 Python·client response에 노출하지 않는다. `seed_demo_owner(farm_slug, p_pin)`은 deployment secret input만 받아 salted `pgcrypto` hash를 upsert한다. `HttpOnly`, `Secure`, `SameSite=None`, exact Origin 검증을 유지하며 static CSRF header는 없다. P0에는 worker profile, phone, nationality, SMS, worker login을 저장하지 않는다. TodayWorkTeam의 표시 별명은 24시간 임시 roster용으로만 저장한다.

raw audio는 즉시 삭제하고 transcript는 owner 감사용 version에만 남긴다. remote worker 응답에는 transcript, token hash, secret을 반환하지 않는다. 모든 timestamp는 UTC다.

## 관계

- `work_sessions 1—N work_versions`
- `work_sessions 1—N worker_links`
- `today_work_teams 1—N today_work_team_members 1—N today_work_assignments`
- `today_work_assignments N—1 work_sessions`
- `guide_phrases 1—N guide_translations`
- `visual_assets.task_code`는 historical code와 current 8개 two-crop code를 모두 보존; 새 `structure-v2` write는 current code만 사용
