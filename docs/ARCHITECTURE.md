# 밭머리 아키텍처

## 경계

```text
React/Vite/Tailwind (Vercel)
  │ HTTPS REST, owner session cookie / anonymous worker token
FastAPI (Railway)
  ├─ WorkDraft → WorkSession + immutable version service
  ├─ CO_PRESENT briefing + REMOTE link + today-team service
  ├─ guide lookup + visual/safety publish gate
  └─ provider-neutral AI adapters
PostgreSQL (Supabase 가능)
  ├─ sessions, drafts, versions, anonymous language links, temporary team roster/assignments
  ├─ guide phrases/translations
  ├─ visual asset manifest
  └─ TTS audio cache (published vi/ne text hash)
Supabase Storage public `visual-assets` bucket (worker video CDN)
```

## 주요 데이터 흐름

`audio → transcript → WorkDraft → owner confirm + delivery_mode/language → WorkSession v1 PUBLISHED → CO_PRESENT briefing, REMOTE link resolve, 또는 TodayWorkTeam member assignment`.

수량 변경은 저장 없는 preview → owner direct confirm(`quantity`, `expected_version`)으로만 다음 immutable version을 만든다. 새 버전은 이전 버전을 `SUPERSEDED`로 바꾸고 remote 링크는 같은 토큰으로 최신 `PUBLISHED` 버전을 읽는다.

## 전달 모델

- `CO_PRESENT`: owner PIN cookie가 있는 owner 폰에서 `vi|ne`를 선택해 최신 briefing을 본다.
- `REMOTE`: `vi|ne` 중 하나를 고른 뒤 언어별 익명 링크를 발급한다. 사람 등록·로그인·전화번호 없이 링크 보유자가 본다.
- 링크는 발급 후 24시간 유효하고, 재발급 시 같은 session·언어의 기존 활성 링크를 폐기한다.
- 링크는 공개 검색·채팅·답장 채널이 아니다. 외부 오류는 일반화하고 만료만 재발급 안내를 준다.
- TodayWorkTeam: owner PIN으로 오늘 QR URL을 열고, 참가자는 그 URL에서 별명·`vi|ne`만 제출한다. 서버는 임시 TeamMember browser cookie를 발급하며, cookie는 team 만료와 함께 끝난다. 농장주는 TeamAssignment로 하나 이상 WorkSession을 연결한다. 근로자는 ID를 입력하지 않고 자기 cookie로만 연결된 최신 `PUBLISHED` state를 읽는다.

## 인증·게시 gate

P0 농장주 인증은 server env의 공유 PIN 검증 후 짧은 HMAC 서명 `HttpOnly; Secure; SameSite=None` 쿠키를 발급한다. 별도 owner/session table은 두지 않는다. owner mutation은 exact Origin과 CSRF 검증을 요구한다.

BE는 schema·ontology·risk assessment·번역 source·영상 provenance/review를 재검증한다. HIGH/UNKNOWN 위험, safety ambiguity, schema invalid, no executable step은 게시하지 않는다. 안전표현은 verified `OFFICIAL_GUIDE` source가 없으면 자동 게시하지 않는다.

P0 ontology는 `ONION|STRAWBERRY` 두 family와 8개 canonical task code로 닫혀 있다. non-null step code는 state의 family와 일치해야 하며, FE 입력·LLM output·DB 저장 어느 경로에서도 이 검증을 우회하지 않는다.

## 보안·운영 불변조건

- CORS wildcard 금지, exact frontend Origin allowlist + credentials.
- audio MIME/10 MiB/60초 제한. raw audio는 처리 중 임시 저장만 하고 성공·실패와 무관하게 즉시 삭제한다.
- anonymous link token은 128-bit 이상 random, DB에는 hash만 저장한다. URL·로그·referrer에 secret을 남기지 않는다.
- WorkVersion은 content immutable이며 session별 version unique/current-version 증가를 DB transaction으로 보장한다.
- TTS cache key는 text content hash이며 text가 source of truth다.
- TTS는 PUBLISHED version의 `vi|ne` step text만 생성한다. cache miss/provider failure는 publish를 막지 않으며 worker/briefing은 `audio_url:null`과 `TEXT` fallback을 받는다.
- `/health`는 process liveness, `/ready`는 DB/provider readiness다.
