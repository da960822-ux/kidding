# 데이터 모델

PostgreSQL 기준 논리 모델. Supabase를 써도 같은 field/status/constraint를 유지한다.

## current write와 legacy read

현재 P0 write 계약은 `structure-v2`/`ontology-v2`다. current two-crop code는 양파 `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`와 딸기 `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`이다. 신규 draft와 publish는 이 code만 허용하고 `task_family`와 일치시킨다. `structure-v1`/`ontology-v1` row는 immutable read-only다. migration은 legacy version 또는 asset code를 삭제·reset·rewrite·remap하지 않는다.

## `work_sessions`

`id` UUID primary key, non-null `farm_id`, `location` JSONB, `task_family`(`ONION|STRAWBERRY`), `status`(`PUBLISHED`), `current_version` integer, immutable `contract_version`, `ontology_version`, `created_at`, `updated_at`를 가진다. 확인 전 데이터는 WorkDraft에만 존재한다.

## `work_drafts`

`id`, non-null `farm_id`, `draft_revision`, `summary_ko`, `transcript`, `interpretation`, `state_json`, `ambiguities`, `contract_version`, `ontology_version`, `confirmed_session_id`, `created_at`, `updated_at`, `expires_at`를 저장한다. supplement마다 revision을 증가시키고 expected revision을 원자 비교한다. raw audio는 저장하지 않는다. owner draft 조회는 같은 Farm의 `structure-v2`이고 `expires_at`이 현재보다 뒤이며 `confirmed_session_id`가 null인 row만 허용한다.

## `work_versions`

수량 변경은 새 quantity와 이전 목표량을 명확히 참조하는 단계/메모를 함께 갱신한다. 다른 수치나 관계가 불명확한 문구를 전역 치환하지 않는다. 정합성을 확보하지 못하면 저장 전 거부하며 이전 state와 package는 그대로 유지한다.

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

새 임시 팀은 별도 자동 Farm 경계를 하나씩 사용한다. `owner_id`(nullable FK), `owner_pin_hash`(nullable bcrypt), `bootstrap_key_hash`(nullable unique), `activated_at`(nullable)를 추가한다. 기존 팀은 이 값이 null인 legacy로 보존한다. 새 팀의 미확정 작성 공간은 생성부터 1시간 만료이며 첫 `work_sessions` insert와 같은 transaction의 trigger가 `activated_at`, `issued_at`, `expires_at = activated_at + interval '24 hours'`를 단 한 번 설정한다. 작업 추가·버전 변경은 이 시각을 갱신하지 않는다. `work_date`는 표시·legacy 호환 필드이며 새 팀 조회·권한은 날짜 대신 team ID를 사용한다. 모든 새 팀 write는 DB에서도 만료를 검사한다.

`start_temporary_work_team` RPC는 private Farm, 비활성 legacy owner, PIN hash, QR hash, pending 팀을 원자 생성한다. bootstrap key의 HMAC hash로 재시도를 재사용한다. `authenticate_temporary_team`은 활성·미만료 팀의 hash만 검사하며 PIN 원문을 반환하지 않는다. PIN은 server secret과 독립 domain으로 재구성하고 owner 인증 응답에만 제공한다. 참가 QR과 관리 링크는 별개다. 공개·authenticated role은 RPC를 실행하거나 관리 hash를 읽을 수 없다.

`today_work_assignments`에는 nullable `acknowledged_version`(positive integer), `acknowledged_at`을 추가한다. 둘 다 null이거나 둘 다 값이 있어야 한다. `acknowledge_team_assignment`는 team/member/active assignment 경계와 만료를 검사하고 WorkSession을 lock해 현재 version과 요청 expected_version을 비교한다. stale이면 conflict, 같은 버전이면 최초 시각을 유지한다. receipt는 mutable assignment 메타데이터이며 WorkVersion·WorkerBriefing 저장값을 바꾸지 않는다.

`today_work_teams`는 `id`, `farm_id`, Asia/Seoul `work_date`, `invite_token_hash`, `invite_issue_idempotency_key`, `issued_at`, `expires_at`, `created_at`를 가진다. 기존 `(farm_id, work_date)` unique는 보존하며 새 팀은 독립 Farm을 사용한다. raw QR token은 DB에 저장하지 않고 저장된 발급 키로 같은 팀의 URL을 재구성한다. 명시적 재발급만 발급 키와 hash를 교체한다.

`today_work_team_members`는 `id`, `team_id`, `display_name`, `language_code`(`vi|ne`), `joined_at`, `join_idempotency_key`를 가진다. `(team_id, join_idempotency_key)`는 unique다. 영구 worker profile, 전화번호, 국적, 로그인 credential은 저장하지 않는다.

`today_work_assignments`는 `id`, `team_member_id`, `work_session_id`, `assigned_at`, `revoked_at`를 가진다. 활성 연결은 member/session별 하나이며, worker 읽기는 연결된 WorkSession의 latest `PUBLISHED` version을 resolve한다.

## `guide_phrases` / `guide_translations`

기존 테이블이 번역 용어 자료의 원본이다. BE는 category·phrase_type·원본 phrase_key를 유지해 Node에 전달한다. 같은 canonical_ko/category/phrase_type의 언어별 자료를 묶되 다른 뜻이나 충돌 번역을 임의 통합하지 않는다. 자체 전문어 의미는 로컬 JSON 참고로 관리하며 검증되지 않은 자료를 verified 공식 row로 넣지 않는다. 연결 수정에 DB schema 변경이나 기존 row 덮어쓰기는 없다.

`guide_phrases`: `phrase_key`, `category`(`WORK_TERM|WORK_INSTRUCTION|SAFETY`), `canonical_ko`, `phrase_type`, `source_name`, `source_page`, `source_url`, `license`, `verified`.

`guide_translations`: `phrase_key`, `language_code`, `translated_text`, `verified`. source/page/license와 사람 검수가 없으면 공식 번역으로 부르지 않는다. 실제 PDF 대조 전에는 data collection gate 상태다.

## `visual_assets`

`id`, `task_code`, `asset_type`, `content_type`, `public_path`, `provenance`, `generator_provider`, `prompt_version`, `generated_at`, `reviewer`, `review_status`, `safety_level`, `purpose`, `captions_text`, `reviewed_at`, `checksum_md5`, `is_current`를 가진다. `assets/asset_manifest.csv`가 current 8개 P0 asset의 유일한 release input이며 service-role `import_visual_assets_v2` RPC가 row 전체를 먼저 검증한 뒤 한 transaction으로 insert한다. 같은 `id`·checksum 재실행은 no-op이고 checksum 불일치는 아무 row도 쓰지 않는다. P0는 `AI_GENERATED_PREGENERATED`·`APPROVED`·`LOW`·`is_current:true`만 게시하며 current 8개 code별 eligible asset은 최대 하나다. DB constraint는 historical asset code를 남겨 existing version 참조를 보존하고, 새 `structure-v2` publish는 current 8개 code만 사용한다. legacy asset code는 reset·삭제·자동 변환하지 않는다.

## `tts_assets`

신규 package는 [AI_CONTRACTS](AI_CONTRACTS.md)의 위치·객체 수량·마감·안전·전체 단계·메모 순서로 조립한 언어별 전체 텍스트를 SHA-256 `text_hash`로 cache한다. `text_hash`, `language_code`(`vi|ne`), `audio_bytes`, `content_type`, `created_at`를 가지며 `(text_hash, language_code)`는 unique다. TTS는 이 cache를 먼저 조회하고, 성공한 audio만 `audio_url`로 노출한다. 생성 실패는 row를 만들지 않고 해당 언어 package를 `audio_url:null`과 text fallback으로 전달한다. audio는 cache일 뿐 text가 source of truth다. 기존 부분 음성 cache와 immutable package의 단위·번역·hash는 재작성하지 않으며 새 column·schema version·migration은 필요하지 않다.

## owner PIN session과 공개 경계

기존 농장 인증 호환 경로는 별도 owner session table 없이 Farm access code로 Farm을 선택하고, service-role 전용 `authenticate_farm_owner(farm_code, pin)`이 해당 Farm의 active credential hash를 검증한다. 반환한 `owner_id`, `farm_id`, expiry는 server secret으로 서명한 짧은 cookie에만 둔다. `pin_hash`는 Python·client response에 노출하지 않는다. provisioning RPC는 운영자 입력으로 Farm과 salted `pgcrypto` hash를 원자적으로 생성하거나 갱신한다. `HttpOnly`, `Secure`, exact Origin 검증을 유지하며 static CSRF header는 없다. P0에는 worker profile, phone, nationality, SMS, worker login을 저장하지 않는다. TodayWorkTeam의 표시 별명은 당일 임시 roster용으로만 저장한다.

농장 코드 인증 전환은 expand/contract 순서를 따른다. 먼저 새 provisioning·인증 RPC를 추가하고 배포된 BE 전환과 농장 provisioning을 검증할 때까지 기존 PIN-only 인증 RPC를 유지한다. 전환 완료 뒤 후속 migration에서 기존 인증·seed RPC와 현재 BE가 호출하지 않는 legacy publish·link RPC를 삭제한다. 저장된 legacy WorkVersion과 읽기 경로는 이 RPC 정리의 대상이 아니다.

### 빈 데이터베이스 설치

적용된 migration은 수정하지 않는다. 빈 Supabase 데이터베이스는 chronological migration 실행 전에 [clean-install-bootstrap.sql](../supabase/clean-install-bootstrap.sql)을 한 번 적용한다. 이 prelude는 `public` schema에 table이 이미 있으면 실패하고, historical `009`가 권한을 회수하는 5인자 `publish_quantity_change` overload만 항상 오류를 반환하는 임시 함수로 생성한다. `012`가 이를 drop한 뒤 당시 구현으로 교체하고 최종 legacy RPC cleanup migration이 제거하므로 current schema에는 bootstrap 함수가 남지 않는다. 기존 데이터베이스나 부분 적용 데이터베이스에는 이 prelude를 실행하지 않는다.

raw audio는 즉시 삭제하고 transcript는 owner 감사용 version에만 남긴다. remote worker 응답에는 transcript, token hash, secret을 반환하지 않는다. 모든 timestamp는 UTC다.

## 관계

- `work_sessions 1—N work_versions`
- `work_sessions 1—N worker_links`
- `today_work_teams 1—N today_work_team_members 1—N today_work_assignments`
- `today_work_assignments N—1 work_sessions`
- `guide_phrases 1—N guide_translations`
- `visual_assets.task_code`는 historical code와 current 8개 two-crop code를 모두 보존; 새 `structure-v2` write는 current code만 사용
