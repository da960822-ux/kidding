# 밭머리 아키텍처

## current P0 ownership and briefing boundary

운영자가 발급한 Farm access code와 Owner PIN으로 만든 farm-scoped cookie가 owner mutation을 보호한다. 로그인 뒤 client는 owner/farm selector를 mutation에 보내지 않는다. WorkDraft, WorkSession, WorkerLink, TodayWorkTeam, TeamAssignment는 current P0 state를 사용한다. CO_PRESENT, remote, assignment는 같은 최신 `PUBLISHED` WorkVersion의 저장된 언어별 `worker-briefing-v2` package를 그대로 반환한다.

## 경계

```text
React/Vite/Tailwind (Vercel)
  │ same-origin HTTPS `/api` rewrite, owner/member cookie / anonymous worker token
  ▼
FastAPI (Render upstream)
  ├─ WorkDraft → WorkSession + immutable version service
  ├─ CO_PRESENT briefing + REMOTE link + today-team service
  ├─ DB asset/verified-guide read + safety/publish gate
  └─ private JSONL/stdio transport only
Node `ai/`
  └─ STT, structure, quantity parse, guide lookup, translation, visual match, TTS
PostgreSQL (Supabase 가능)
  ├─ sessions, drafts, versions, anonymous language links, temporary team roster/assignments
  ├─ guide phrases/translations
  ├─ visual asset manifest
  └─ TTS audio cache (published vi/ne text hash)
Supabase Storage public `visual-assets` bucket (worker video CDN)
```

## 주요 데이터 흐름

사투리 해석은 Node의 ontology-v2 참고 JSON을 LLM 문맥에 추가하는 로컬 검색 방식이다. 벡터DB·추가 provider 호출·전사문 강제 치환은 사용하지 않는다. 최초 지시, 보완, 수량 변경이 같은 참고 자료 선택 경로를 쓰며 기존 provider-neutral JSON 입출력은 유지한다. 영상 제외 정책은 별도 JSON 데이터이며 작업 분류와 분리한다. 현재 신규 ONION_TRANSPORT package는 text/TTS로 전달하고 기존 저장 package는 그대로 읽는다.

`audio → transcript → structure-v2 WorkDraft → owner confirm → WorkSession v1 PUBLISHED + vi/ne packages → CO_PRESENT briefing, REMOTE link issue/resolve, 또는 TodayWorkTeam member assignment`.

owner client은 새로고침 뒤 tab에 남은 draft ID만으로 `GET /api/v1/work-sessions/drafts/{draftId}`를 다시 요청할 수 있다. BE는 cookie Farm filter, `expires_at`, `confirmed_session_id`, current v2 contract를 확인한 뒤 기존 `WorkDraft` DTO만 `Cache-Control: no-store`로 반환한다. raw audio, owner/farm claim, transcript가 든 오류는 반환하지 않는다.

수량 변경은 저장 없는 preview → owner direct confirm(`quantity`, `expected_version`)으로만 다음 immutable version을 만든다. 새 state와 두 package 삽입이 성공한 뒤에만 이전 `PUBLISHED`를 `SUPERSEDED`로 바꾸며, remote 링크는 같은 토큰으로 최신 `PUBLISHED` 버전을 읽는다.

## Atomic v2 publish RPC

BE는 `public.publish_work_version_with_packages(p_farm_id uuid, p_draft_id uuid|null, p_session_id uuid, p_expected_version integer, p_state_json jsonb, p_packages jsonb, p_decision text, p_ambiguity_override boolean, p_override_reason text) -> (session_id uuid, version integer)`만 호출한다. 초기 confirm은 `p_draft_id`와 `expected_version:0`을, 수량 재생성은 `p_draft_id:null`과 현재 version을 사용한다. `p_state_json`은 이미 검증된 `structure-v2`/`ontology-v2`이고 `p_packages`는 완성된 `worker-briefing-v2` `vi`·`ne` 정확히 두 개다. RPC는 version과 packages를 먼저 insert하고 그 뒤 이전 PUBLISHED를 supersede하므로 실패·conflict에는 새 row가 남지 않는다. legacy v1은 `legacy_read_only`로 거부한다.

REMOTE 발급은 별도 `public.issue_worker_link_v2(p_farm_id uuid, p_session_id uuid, p_language_code text, p_link jsonb) -> void`를 호출한다. RPC는 cookie farm 안의 v2 PUBLISHED session을 lock하고 해당 최신 version의 언어 package 존재를 확인한 뒤 기존 같은 언어 link를 revoke하고 새 hash row를 insert한다. v1과 cross-farm 요청은 legacy/read-only 또는 not-found로 처리하며 legacy `issue_worker_link`를 fallback으로 호출하지 않는다.

## 전달 모델

- `CO_PRESENT`: owner PIN cookie가 있는 owner 폰에서 `vi|ne`를 선택해 최신 briefing을 본다.
- `REMOTE`: `vi|ne` 중 하나를 고른 뒤 언어별 익명 링크를 발급한다. 사람 등록·로그인·전화번호 없이 링크 보유자가 본다.
- 링크는 발급 후 24시간 유효하고, 재발급 시 같은 session·언어의 기존 활성 링크를 폐기한다.
- 링크는 공개 검색·채팅·답장 채널이 아니다. 외부 오류는 일반화하고 만료만 재발급 안내를 준다.
- TodayWorkTeam: owner cookie로 Farm의 당일 QR URL을 연다. 같은 Farm·작업일에는 저장된 발급 키로 동일 URL을 복원하고, 명시적 재발급에서만 기존 QR을 폐기한다. 참가자는 그 URL에서 별명·`vi|ne`만 제출한다. 서버는 임시 TeamMember browser cookie를 발급하며, cookie는 team 만료와 함께 끝난다. 농장주는 TeamAssignment로 하나 이상 WorkSession을 연결한다. 근로자는 ID를 입력하지 않고 자기 cookie로만 연결된 최신 `PUBLISHED` state를 읽는다.

`worker-briefing-v2` package builder는 source WorkVersion step 배열을 삭제·정렬 변경 없이 locale별로 변환한다. `context.safety[]`는 locale text를 담고 verified guide provenance는 `source_detail[]`의 `SAFETY`/`step_sequence:null` entries로 보존하며, video caption도 같은 locale로 변환한다. worker DTO의 TTS `text_hash`는 UI 비표시 opaque fingerprint이고, exact text/audio bytes/cache key는 Node↔BE private transport에만 남긴다.

## 인증·게시 gate

P0 농장주 인증은 service-role 전용 `authenticate_farm_owner(farm_code, pin)` RPC가 선택한 Farm의 active credential PIN hash를 검증해 반환한 `owner_id`, `farm_id`만 cookie claim으로 쓴다. Python은 PIN hash를 읽지 않는다. 운영 시 service-role 전용 provisioning RPC에 Farm access code·표시명·PIN을 전달해 Farm과 salted hash를 원자적으로 생성하거나 갱신하며 migration·로그·응답에 raw PIN을 두지 않는다. owner mutation은 cookie의 farm claim과 `FRONTEND_ORIGINS` exact Origin을 요구한다. 정적 CSRF header는 사용하지 않는다.

BE는 schema·ontology·risk assessment·번역 source·영상 provenance/review를 재검증한다. HIGH/UNKNOWN 위험, safety ambiguity, schema invalid, no executable step은 게시하지 않는다. 안전표현은 verified `OFFICIAL_GUIDE` source가 없으면 자동 게시하지 않는다.

P0 ontology는 `ONION|STRAWBERRY` 두 family와 8개 canonical task code로 닫혀 있다. non-null step code는 state의 family와 일치해야 하며, FE 입력·LLM output·DB 저장 어느 경로에서도 이 검증을 우회하지 않는다.

## 보안·운영 불변조건

- Vercel `API_UPSTREAM_ORIGIN` is build-time only; `/api/:path*` external rewrite is before SPA fallback. `VITE_API_BASE_URL` stays empty in production, and `FRONTEND_ORIGINS`, `PUBLIC_WEB_BASE_URL`, and `PUBLIC_API_BASE_URL` all use the public Vercel origin.
- Local Vite development reuses `API_UPSTREAM_ORIGIN` for its `/api` proxy; loopback HTTP is allowed only for this local upstream. The browser and backend public URL settings use the same Vite origin.
- CORS wildcard 금지, exact frontend Origin allowlist + credentials.
- audio MIME/10 MiB/60초 제한. raw audio는 처리 중 임시 저장만 하고 성공·실패와 무관하게 즉시 삭제한다.
- anonymous link token은 128-bit 이상 random, DB에는 hash만 저장한다. URL·로그·referrer에 secret을 남기지 않는다.
- WorkVersion은 content immutable이며 session별 version unique/current-version 증가를 DB transaction으로 보장한다.
- TTS cache key는 text content hash이며 text가 source of truth다.
- TTS는 PUBLISHED version의 `vi|ne` step text만 생성한다. cache miss/provider failure는 publish를 막지 않으며 worker/briefing은 `audio_url:null`과 `TEXT` fallback을 받는다. FastAPI는 storage/auth/transaction과 DB read만 소유하고 STT·structure·quantity parse·guide lookup·translation·TTS·visual match는 private JSONL/stdio Node bridge 하나만 호출한다. STT bridge operation은 `TRANSCRIBE_AUDIO`이며 validated `audio_base64`, MIME, filename, `language_hint`만 받고 `{transcript}`를 반환한다. 기준 전사의 token log probability가 설정 임계값보다 낮을 때만 독립 모델로 같은 원음을 재검증하며, 불일치는 `AUDIO_UNCLEAR`로 닫는다. raw audio·owner/farm/member identity는 결과와 metadata에 남기지 않는다.
- `PUBLIC_WEB_BASE_URL`은 browser worker route의 host다. REMOTE 발급 URL은 `${PUBLIC_WEB_BASE_URL}/w/{token}`이고 browser가 API assignment endpoint를 호출한다. production `/ready`는 이 값, DB, owner auth, provider가 모두 없으면 실패한다. `DEMO_FALLBACK=1`은 명시적 demo 전용으로 첫 exact frontend Origin을 local browser host로 허용한다.
- `OWNER_SESSION_SECRET` rotation invalidates owner sessions, TodayWorkTeam QR URLs, TeamMember browser cookies, and WorkerLinks because their signatures or token hashes use that secret. Reissue QR and remote links after rotation.
- `/health`는 process liveness와 실행 중인 source revision을 반환한다. `/ready`는 같은 revision과 함께 DB의 `p0_readiness`, worker briefing package 저장소, provider, public-web/public-API deployment 설정을 검증한다.
