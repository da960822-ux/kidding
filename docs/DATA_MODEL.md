# 데이터 모델

PostgreSQL 기준 논리 모델. Supabase를 써도 같은 field/status/constraint를 유지한다.

## `work_sessions`

`id` UUID primary key, `location` JSONB, `task_family`(`ONION|STRAWBERRY`), `status`(`PUBLISHED`), `current_version` integer, `created_at`, `updated_at`를 가진다. 확인 전 데이터는 WorkDraft에만 존재한다.

## `work_drafts`

`id`, `draft_revision`, `summary_ko`, `transcript`, `interpretation`, `state_json`, `ambiguities`, `contract_version`, `created_at`, `updated_at`, `expires_at`를 저장한다. supplement마다 revision을 증가시키고 expected revision을 원자 비교한다. raw audio는 저장하지 않는다.

## `work_versions`

`id`, `work_session_id`, `version`, `status`(`PUBLISHED|SUPERSEDED`), `state_json`, `transcript`, `confirmed_at`, `confirmation_decision`, `ambiguity_override`, `override_reason`, `overridden_at`, `created_at`를 저장한다. session별 `(work_session_id, version)`은 unique이며 PUBLISHED는 하나만 허용한다. WorkVersion content는 수정하지 않고 새 version을 만든다.

`state_json.steps[]`는 `{sequence, task_code, title_ko, description_ko, video, audio_url, delivery_mode, unsupported_reason, translations}`다. non-null `task_code`는 8개 two-crop ontology만 허용하며 같은 state의 `task_family`와 일치해야 한다. null은 LOW 비안전 미지원 작업을 owner가 승인한 경우에만 허용한다.

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

`id`, `task_code`, `asset_type`, `public_path`, `provenance`, `generator_provider`, `prompt_version`, `generated_at`, `reviewer`, `review_status`, `safety_level`, `purpose`, `captions_text`를 가진다. `provenance`는 필수이고, 과거 생성물에서 확인할 수 없는 `generator_provider`·`prompt_version`·`generated_at`은 추측하지 않고 `null`로 남긴다. P0는 `AI_GENERATED_PREGENERATED`·`APPROVED`·`LOW`만 게시한다.

## `tts_assets`

게시된 step의 언어별 텍스트를 SHA-256 `text_hash`로 cache한다. `text_hash`, `language_code`(`vi|ne`), `audio_bytes`, `content_type`, `created_at`를 가지며 `(text_hash, language_code)`는 unique다. TTS는 이 cache를 먼저 조회하고, 성공한 audio만 `audio_url`로 노출한다. 생성 실패는 row를 만들지 않고 해당 언어 step을 `audio_url:null`, `delivery_mode:TEXT`로 전달한다. audio는 cache일 뿐 text가 source of truth다.

## owner PIN session과 공개 경계

P0는 별도 owner session table 없이 server secret으로 서명한 짧은 cookie를 사용한다. `HttpOnly`, `Secure`, `SameSite=None`, exact Origin/CSRF 검증을 유지한다. P0에는 worker profile, phone, nationality, SMS, worker login을 저장하지 않는다. TodayWorkTeam의 표시 별명은 24시간 임시 roster용으로만 저장한다.

raw audio는 즉시 삭제하고 transcript는 owner 감사용 version에만 남긴다. remote worker 응답에는 transcript, token hash, secret을 반환하지 않는다. 모든 timestamp는 UTC다.

## 관계

- `work_sessions 1—N work_versions`
- `work_sessions 1—N worker_links`
- `today_work_teams 1—N today_work_team_members 1—N today_work_assignments`
- `today_work_assignments N—1 work_sessions`
- `guide_phrases 1—N guide_translations`
- `visual_assets.task_code`는 8개 two-crop ontology code만 참조
