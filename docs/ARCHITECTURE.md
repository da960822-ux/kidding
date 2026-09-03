# 밭머리 아키텍처

## current P0 ownership and briefing boundary

farm-scoped demo-owner PIN cookie가 owner mutation을 보호하며 client는 owner/farm selector를 보내지 않는다. WorkDraft, WorkSession, WorkerLink, TodayWorkTeam, TeamAssignment는 current P0 state를 사용한다. CO_PRESENT, remote, assignment는 같은 최신 `PUBLISHED` WorkVersion의 저장된 언어별 `worker-briefing-v2` package를 그대로 반환한다.

## 경계

```text
React/Vite/Tailwind (Vercel)
  │ HTTPS REST, owner session cookie / anonymous worker token
FastAPI (Render)
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

`audio → transcript → structure-v2 WorkDraft → owner confirm → WorkSession v1 PUBLISHED + vi/ne packages → CO_PRESENT briefing, REMOTE link issue/resolve, 또는 TodayWorkTeam member assignment`.

수량 변경은 저장 없는 preview → owner direct confirm(`quantity`, `expected_version`)으로만 다음 immutable version을 만든다. 새 state와 두 package 삽입이 성공한 뒤에만 이전 `PUBLISHED`를 `SUPERSEDED`로 바꾸며, remote 링크는 같은 토큰으로 최신 `PUBLISHED` 버전을 읽는다.

## Atomic v2 publish RPC

BE는 `public.publish_work_version_with_packages(p_farm_id uuid, p_draft_id uuid|null, p_session_id uuid, p_expected_version integer, p_state_json jsonb, p_packages jsonb, p_decision text, p_ambiguity_override boolean, p_override_reason text) -> (session_id uuid, version integer)`만 호출한다. 초기 confirm은 `p_draft_id`와 `expected_version:0`을, 수량 재생성은 `p_draft_id:null`과 현재 version을 사용한다. `p_state_json`은 이미 검증된 `structure-v2`/`ontology-v2`이고 `p_packages`는 완성된 `worker-briefing-v2` `vi`·`ne` 정확히 두 개다. RPC는 version과 packages를 먼저 insert하고 그 뒤 이전 PUBLISHED를 supersede하므로 실패·conflict에는 새 row가 남지 않는다. legacy v1은 `legacy_read_only`로 거부한다.

REMOTE 발급은 별도 `public.issue_worker_link_v2(p_farm_id uuid, p_session_id uuid, p_language_code text, p_link jsonb) -> void`를 호출한다. RPC는 cookie farm 안의 v2 PUBLISHED session을 lock하고 해당 최신 version의 언어 package 존재를 확인한 뒤 기존 같은 언어 link를 revoke하고 새 hash row를 insert한다. v1과 cross-farm 요청은 legacy/read-only 또는 not-found로 처리하며 legacy `issue_worker_link`를 fallback으로 호출하지 않는다.

## 전달 모델

- `CO_PRESENT`: owner PIN cookie가 있는 owner 폰에서 `vi|ne`를 선택해 최신 briefing을 본다.
- `REMOTE`: `vi|ne` 중 하나를 고른 뒤 언어별 익명 링크를 발급한다. 사람 등록·로그인·전화번호 없이 링크 보유자가 본다.
- 링크는 발급 후 24시간 유효하고, 재발급 시 같은 session·언어의 기존 활성 링크를 폐기한다.
- 링크는 공개 검색·채팅·답장 채널이 아니다. 외부 오류는 일반화하고 만료만 재발급 안내를 준다.
- TodayWorkTeam: owner PIN으로 오늘 QR URL을 열고, 참가자는 그 URL에서 별명·`vi|ne`만 제출한다. 서버는 임시 TeamMember browser cookie를 발급하며, cookie는 team 만료와 함께 끝난다. 농장주는 TeamAssignment로 하나 이상 WorkSession을 연결한다. 근로자는 ID를 입력하지 않고 자기 cookie로만 연결된 최신 `PUBLISHED` state를 읽는다.

## 인증·게시 gate

P0 농장주 인증은 service-role 전용 `authenticate_demo_owner(p_pin)` RPC가 active `demo_owners` PIN hash를 검증해 반환한 `owner_id`, `farm_id`만 cookie claim으로 쓴다. Python은 PIN hash를 읽지 않는다. 배포 시 service-role 전용 `seed_demo_owner(farm_slug, pin)`에 secret-store PIN을 전달해 salted hash를 upsert하며 migration·로그·응답에 raw PIN을 두지 않는다. shared global PIN claim이나 client-supplied owner/farm selector는 없다. owner mutation은 cookie의 farm claim과 `FRONTEND_ORIGINS` exact Origin을 요구한다. 정적 CSRF header는 사용하지 않는다.

BE는 schema·ontology·risk assessment·번역 source·영상 provenance/review를 재검증한다. HIGH/UNKNOWN 위험, safety ambiguity, schema invalid, no executable step은 게시하지 않는다. 안전표현은 verified `OFFICIAL_GUIDE` source가 없으면 자동 게시하지 않는다.

P0 ontology는 `ONION|STRAWBERRY` 두 family와 8개 canonical task code로 닫혀 있다. non-null step code는 state의 family와 일치해야 하며, FE 입력·LLM output·DB 저장 어느 경로에서도 이 검증을 우회하지 않는다.

## 보안·운영 불변조건

- CORS wildcard 금지, exact frontend Origin allowlist + credentials.
- audio MIME/10 MiB/60초 제한. raw audio는 처리 중 임시 저장만 하고 성공·실패와 무관하게 즉시 삭제한다.
- anonymous link token은 128-bit 이상 random, DB에는 hash만 저장한다. URL·로그·referrer에 secret을 남기지 않는다.
- WorkVersion은 content immutable이며 session별 version unique/current-version 증가를 DB transaction으로 보장한다.
- TTS cache key는 text content hash이며 text가 source of truth다.
- TTS는 PUBLISHED version의 `vi|ne` step text만 생성한다. cache miss/provider failure는 publish를 막지 않으며 worker/briefing은 `audio_url:null`과 `TEXT` fallback을 받는다. FastAPI는 storage/auth/transaction과 DB read만 소유하고 STT·structure·quantity parse·guide lookup·translation·TTS·visual match는 private JSONL/stdio Node bridge 하나만 호출한다. STT bridge operation은 `TRANSCRIBE_AUDIO`이며 validated `audio_base64`, MIME, filename, `language_hint`만 받고 `{transcript, language_code, confidence, schema_version, contract_version}`를 반환한다; raw audio·owner/farm/member identity는 결과와 metadata에 남기지 않는다.
- `PUBLIC_WEB_BASE_URL`은 browser worker route의 host다. REMOTE 발급 URL은 `${PUBLIC_WEB_BASE_URL}/w/{token}`이고 browser가 API assignment endpoint를 호출한다. production `/ready`는 이 값, DB, owner auth, provider가 모두 없으면 실패한다. `DEMO_FALLBACK=1`은 명시적 demo 전용으로 첫 exact frontend Origin을 local browser host로 허용한다.
- `/health`는 process liveness, `/ready`는 DB/provider/public-web deployment readiness다.
