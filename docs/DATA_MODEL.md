# 데이터 모델

PostgreSQL 기준 논리 모델. Supabase를 써도 같은 field/status/constraint를 유지한다.

## 핵심 테이블

### `work_sessions`

| field | type | rule |
|---|---|---|
| `id` | UUID | primary key |
| `location` | JSONB | 원문·종류·정규명; unknown 허용 |
| `task_family` | text | P0=`ONION|STRAWBERRY` |
| `status` | enum | P0=`PUBLISHED`; 확인 전 상태는 `work_drafts`에만 존재 |
| `current_version` | integer | 최초 publish=1, 증가만 허용 |
| `created_at`, `updated_at` | timestamp | server time |

owner confirmation은 별도 감사 필드로 기록한다. P0 confirm은 immutable v1을 만들고 즉시 `PUBLISHED`로 전환한다. `current_version`은 최신 published integer를 가리킨다.

### `work_drafts`

`id`, `draft_revision`, `summary_ko`, `transcript`, `interpretation`, `state_json`, `ambiguities`, `risk_assessment_json`, `contract_version`, `created_at`, `updated_at`, `expires_at`를 저장한다. `draft_revision`은 audio supplement마다 증가하고 `expected_draft_revision`과 원자 비교한다. `summary_ko`와 transcript는 owner-only 확인 필드다. confirm transaction에서 최종 transcript와 risk assessment를 WorkVersion으로 복사하고 draft를 제거하며, 미확정 draft도 24시간 뒤 제거한다. raw audio는 저장하지 않는다.

### `work_versions`

| field | type | rule |
|---|---|---|
| `id` | UUID | primary key |
| `work_session_id` | UUID | FK |
| `version` | integer | session별 unique; 1부터 증가 |
| `status` | enum | `PUBLISHED`, `SUPERSEDED` |
| `state_json` | JSONB | `location`, `quantity`, `deadline?`, `safety`, `notes?`, `steps` |
| `transcript` | text | 감사용; worker public API 반환 금지 |
| `risk_assessment_json` | JSONB | `safety-policy-v1` immutable gate snapshot |
| `confirmed_at` | timestamp | owner 확인 시각 |
| `confirmation_decision` | enum | `CONFIRM` 또는 `PUBLISH_AS_IS` |
| `override_reason`, `overridden_at` | nullable | non-blocking ambiguity override 감사 |
| `created_at` | timestamp | server time |

WorkVersion lifecycle의 canonical 값은 `PUBLISHED`, `SUPERSEDED`다. `DRAFT`는 별도 WorkDraft 상태이며 WorkVersion이 아니다. P0 initial confirm은 transaction에서 content-immutable `v1 PUBLISHED`를 만든다. 변경 확인은 현재 `expected_version`을 요구하며 불일치는 `VERSION_CONFLICT`(HTTP 409)다. 새 버전 생성 때 이전 버전 content는 바꾸지 않고 status만 `SUPERSEDED`로 전환한다.

모호한 draft는 `ambiguities[]`에 `field`, `message`, `blocking`, `kind`(`SAFETY|TASK|LOCATION|QUANTITY|TIME|OTHER`)를 기록한다. `blocking:false`인 경우 owner가 `PUBLISH_AS_IS` 또는 `SUPPLEMENT`를 선택할 수 있다. 그대로 전달하면 `ambiguity_override`, `override_reason`, `overridden_at`을 version 감사 필드에 기록하고 worker state에 `확인이 필요한 지시`를 표시한다. `SAFETY` ambiguity, HIGH 위험, schema invalid, no executable step은 override할 수 없다. unsupported non-safety task는 `task_code: null` 또는 `UNSUPPORTED` marker와 video null, text+TTS fallback으로 owner가 전달할 수 있다.

`state_json.steps[]`는 `{sequence, task_code, title_ko, description_ko, quantity?}`이며 `sequence`는 1부터 연속이다. non-null `task_code`는 P0 8개 allowlist만 허용하고 접두사가 `task_family`와 일치해야 한다. 불일치는 `SCHEMA_INVALID`로 거부한다. `null`은 감사된 비안전 `UNSUPPORTED` fallback에만 허용한다. `quantity`는 `{value: positive integer, unit: non-empty string}`이다.

DB migration과 publish RPC는 `(task_family='ONION' AND task_code IN (ONION 4개)) OR (task_family='STRAWBERRY' AND task_code IN (STRAWBERRY 4개)) OR task_code IS NULL`을 같은 의미의 CHECK로 강제한다. `task_code IS NULL`은 별도의 override 감사 조건을 통과한 경우에만 publish할 수 있다.

각 step은 `video`(asset id/url/provenance/review_status/safety_level) 또는 null, `audio_url` 또는 null, `delivery_mode`(`VIDEO|TEXT_TTS|TEXT`), `unsupported_reason` 또는 null을 가진다. `task_code:null`은 owner가 override한 non-safety `UNSUPPORTED`에만 허용하고 `delivery_mode`는 `TEXT_TTS` 또는 `TEXT`다. `location`은 `{raw_text, kind, canonical_name}`과 worker 표시용 `location_display`를 보존한다. DEICTIC은 장소를 정규화하지 않는다.

각 step의 `translations[]`는 `segment`, `language_code`, `text`, `source`, `verified`, `guide_lookup`과 nullable source metadata를 가진다. `source`는 `OFFICIAL_GUIDE|AI_TRANSLATION|DETERMINISTIC`이다. `DETERMINISTIC`은 수량·순서 template 전용이며 `guide_lookup: NOT_APPLICABLE`이다.

### 수량 변경 저장 규칙

change-audio preview는 저장하지 않고 `READY|AMBIGUOUS`, quantity/null, ambiguities, `expected_version`만 반환한다. 별도 proposal table은 두지 않는다. direct confirm request의 `quantity`, `expected_version`, `Idempotency-Key`를 검증한 transaction만 새 WorkVersion을 만들며, confirmed version 자체가 변경 감사 기록이다.

### `worker_links`

`id`, `work_session_id`, `language_code`, `token_hash`, `issued_at`, `expires_at`, `revoked_at?`, `issue_idempotency_key`를 저장한다. 익명 language-specific link row가 P0 remote delivery다. `expires_at = issued_at + 24h`; raw token은 DB에 저장하지 않는다. raw URL은 단일 create/reissue 응답에서 한 번만 반환하며 regular owner read에는 반환하지 않는다. 유효 링크 resolve는 매번 최신 `PUBLISHED` version이다. 같은 session/language 재발급은 기존 active link를 revoke하고 새 24h link를 만든다.

### `work_teams` / `work_team_invites` / `work_team_members`

`work_teams`: `id`, `work_date`, `status`(`ACTIVE|CLOSED`), `created_at`, `closed_at?`. P0는 demo owner session당 같은 업무일의 active team 하나만 허용한다. `work_date` 경계는 `Asia/Seoul`이다.

`work_team_invites`: `id`, `work_team_id`, `token_hash`, `token_ciphertext`, `issued_at`, `expires_at`, `revoked_at?`, `issue_idempotency_key`. raw token은 DB·로그에 평문 저장하지 않는다. `token_ciphertext`는 서버 전용 키로 암호화해 owner-authenticated 오늘 팀 조회에서 QR URL을 복원할 때만 사용한다. 만료는 발급 후 24시간과 업무일 종료 중 빠른 시각이다.

`work_team_members`: `id`, `work_team_id`, `display_name`, `nationality_code`, `language_code`, `joined_at`. `display_name`은 trim 후 1~30자이며 계정 식별자가 아니다. `nationality_code`는 `VN|PH|LA|KH|TH|NP|MM|MN`, `language_code`는 P0 안내 언어 `vi|ne|km`다. 국적과 안내 언어를 자동 동일시하지 않는다. owner 조회의 members는 `joined_at` 오름차순이다.

### `guide_phrases` / `guide_translations`

`guide_phrases`: `phrase_key`, `category`(`WORK_TERM|WORK_INSTRUCTION|SAFETY`), `canonical_ko`, `phrase_type`.

`guide_translations`: `phrase_key`, `language_code`, `translated_text`, `source_name`, `source_page`, `source_url`, `license`, `verified`. `(phrase_key, language_code)`는 unique다. 출처와 검수 상태는 언어별 PDF가 다르므로 번역 row가 소유한다.

source page/url/license 또는 사람 검수가 없으면 `verified=true` 금지, `OFFICIAL_GUIDE` 금지. 실제 값은 PDF 대조 뒤 data collection gate를 통과한 것만 import한다. 없는 값을 추정하지 않는다.

농식품부 보도자료는 가이드가 10쪽 포켓북·8개 언어·③ 농작업 실무단어/④ 안전수칙·공공누리 출처표시 조건임을 설명하는 catalog 근거로만 사용한다: https://www.mafra.go.kr/bbs/home/792/577794/artclView.do. 개별 언어 PDF URL/page/번역 문구는 확보·대조 전까지 row에 넣지 않으며, 보도자료 URL을 번역 source로 가장하지 않는다.

### `visual_assets`

`id`, `task_code`, `asset_type`, `public_path`, `provenance`, `generator_provider?`, `prompt_version`, `generated_at`, `reviewer?`, `review_status`, `safety_level`, `purpose`, `captions_text`. API는 `public_path`를 배포 origin과 결합해 `video_url`로 반환한다.

P0 허용 provenance는 `AI_GENERATED_PREGENERATED`; 8개 task_code 모두 사람 검수 `APPROVED`가 필요하다. LOW로 검수된 작업만 게시한다. 운전·차량 또는 동력 장비 이동·회전날·농약·고소작업은 HIGH로 기록하고 게시하지 않는다. `ONION_TRANSPORT` 자산은 차량·동력 장비 운전 또는 이동 장면을 포함하지 않는다.

영상은 FE `public/videos`에 둔 정적 `video/*` 자산이며 배포 플랫폼 CDN으로 제공한다. 모바일 재생 가능한 크기와 `captions_text`를 가져야 하고 runtime 생성·별도 object storage는 P0에 두지 않는다.

### demo owner session

P0는 로그인 입력과 별도 session table 없이 농장주 역할 선택 시 서버 secret으로 서명한 짧은 만료 cookie를 발급한다. cookie는 `HttpOnly`, `Secure`, `SameSite=None`이며 모든 owner mutation은 exact Origin/credentials를 요구한다. CSRF는 exact `Origin` 검증으로 막고 별도 CSRF header는 두지 않는다. cookie는 DB·로그에 저장하지 않는다. P1 회원가입/계정관리는 이 모델 범위 밖이다.

## 보존·공개 경계

raw audio는 STT 처리 중 임시 저장만 하고 성공·실패 무관 즉시 삭제한다. transcript는 work version 감사용으로 보관한다. worker public API는 transcript, risk assessment, token hash를 반환하지 않는다.

모든 저장 timestamp는 UTC다. 업무일 계산만 Asia/Seoul을 사용한다. session별 version unique와 current-version 증가를 transaction으로 보장한다. TTS cache key는 text content hash이며 text가 source of truth다. worker link token은 128-bit 이상 random을 hash-at-rest로 보관하고 로그에 남기지 않는다.

## 관계와 소유권

- `work_sessions 1—N work_versions`; session별 `(work_session_id, version)` unique.
- `work_sessions 1—N worker_links`; link는 하나의 `language_code`를 가지며 재발급 시 같은 language의 기존 row를 revoke한다.
- `work_teams 1—N work_team_members`, `work_teams 1—N work_team_invites`; team 종료 시 invite도 함께 무효화한다.
- `guide_phrases 1—N guide_translations`; `(phrase_key, language_code)` unique.
- `visual_assets.task_code`는 양파·딸기 8개 ontology code만 참조한다.
- BE가 schema·migration·transaction을 소유하고, AI는 검수된 guide/asset manifest만 제공한다. FE는 DB에 직접 접근하지 않고 `openapi.yaml`만 사용한다.
