# 밭머리 아키텍처

## 경계

```text
React/Vite/Tailwind (Vercel)
  │ HTTPS REST, owner session cookie / anonymous link token
FastAPI (Railway)
  ├─ WorkSession + version + link service
  ├─ guide lookup + visual safety gate
  └─ provider-neutral AI adapters
PostgreSQL (Supabase 가능)
  ├─ sessions, steps, versions, anonymous links
  ├─ guide phrases/translations
  └─ visual asset manifest
FE public/videos (Vercel static CDN)
```

`AI는 추측하지 않는다. 결정은 농장주가 한다.` AI 판정(`READY`, `AMBIGUOUS`, `UNSUPPORTED`), 확인 전 `WorkDraft`, WorkVersion lifecycle(`PUBLISHED`, `SUPERSEDED`)을 분리한다. FE는 owner choice를 표시하고, BE가 override·version·게시 gate를 검증하며 최신 버전을 resolve한다. ambiguity는 owner decision state다.

## 주요 데이터 흐름

`audio`→`transcript`→`WorkDraft`→owner confirm→guide lookup/언어별 translation source snapshot + approved visual match→`WorkSession v1 PUBLISHED`→delivery branch 선택. `CO_PRESENT`는 owner cookie briefing을, `REMOTE`는 선택 언어의 익명 link를 연다. 수량 변경은 change-audio preview(저장 없음)→owner direct confirm(`quantity`, `expected_version`)으로만 `v2`를 만들고 기존 `v1`을 `SUPERSEDED`로 바꾼다. 두 branch는 5초 polling하고 visibility/focus 복귀 때 즉시 조회한다. 응답 version이 증가하면 FE가 화면과 TTS를 교체한다.

## 인증·링크

P0 농장주 인증은 server env의 공유 데모 PIN 검증 후 만료시각을 HMAC 서명한 짧은 `HttpOnly; Secure; SameSite=None` 쿠키를 발급하는 최소 방식이다. 별도 owner/session table은 두지 않는다. 모든 owner mutation은 쿠키와 허용된 `Origin`을 요구한다. Supabase 회원가입/계정관리는 P1.

`REMOTE` token은 추측 불가능한 랜덤 값으로 저장 시 해시하고 발급 후 24시간 만료한다. 유효 token은 항상 해당 WorkSession의 최신 `PUBLISHED` 버전을 반환한다. 만료·잘못된 token 모두 외부에는 일반화된 접근 불가 응답으로 처리하되, 만료 상태에는 재발급 안내를 제공한다.

confirm은 link를 발급하지 않는다. owner의 language-specific create/reissue만 raw remote URL을 한 번 반환한다. `CO_PRESENT` briefing은 owner cookie를 요구하며 public session-id 조회는 제공하지 않는다.

## 게시 gate

BE는 다음을 모두 만족할 때만 `PUBLISHED`를 허용한다.

- WorkSession draft가 owner confirmation을 받음
- 빈 `steps`는 blocking `TASK` ambiguity로 남아 게시 대상이 아님
- 모든 non-null `task_code`가 양파 ontology에 존재. `null`은 감사된 비안전 미지원 fallback에만 허용
- 안전표현과 `OFFICIAL_GUIDE` 번역은 언어별 source snapshot을 가짐. `source_page`, `source_url`, `license`, 사람 검수 `verified`가 없으면 `OFFICIAL_GUIDE` 표기 금지
- 매칭 영상은 `review_status: APPROVED`, `safety_level: LOW`, `provenance: AI_GENERATED_PREGENERATED`, [Safety Policy](SAFETY_POLICY.md) assessment를 만족
- 영상이 없으면 텍스트+TTS fallback이 명시됨

HIGH/UNKNOWN risk assessment, 검수되지 않은 안전 번역, invalid JSON, schema invalid, auth/version conflict, 또는 blocking ambiguity는 자동 게시·자동 변경 금지다. LOW 비안전 미지원 작업만 owner가 허용된 reason으로 `PUBLISH_AS_IS`할 수 있다. P0 영상은 기계가 정지한 상태의 수작업만 다룬다. 운전·회전날·농약·고소작업은 HIGH risk로 분류하며, `LOADING`·`WAREHOUSE_TRANSPORT`에는 차량 운전 장면을 넣지 않는다.

## 책임·인계

- FE→BE: `openapi.yaml`의 field/status만 전송하고 gate 실패를 사용자에게 표시.
- BE→FE: canonical 상태, version, language별 translation source snapshot, `review_status`, generalized access error를 반환.
- AI→BE: `AI_CONTRACTS.md` JSON만 반환; provider/model은 환경변수와 로그에만 존재.
- AI→BE: 검수 완료 guide rows와 asset manifest, 평가 결과만 import·게시 승인 요청.
- BE→FE: anonymous remote response에는 transcript/raw audio를 절대 포함하지 않는다. raw audio는 STT 요청 중 임시 저장만 하고 성공·실패와 무관하게 즉시 삭제한다.

## 운영·보안 불변조건

- Vercel↔Railway cross-origin 호출은 exact frontend Origin allowlist + credentials만 허용한다. cross-site cookie는 `SameSite=None; Secure`로 설정하고 모든 owner mutation의 exact `Origin` 검증으로 CSRF를 막는다. 별도 CSRF header는 P0 계약에 없다. CORS wildcard는 금지한다.
- 공유 PIN은 brute-force rate limit과 실패 backoff를 적용하고 owner session TTL을 짧게 둔다. AI 요청도 비용 rate limit을 둔다.
- `REMOTE` token은 128-bit 이상 random, at-rest hash, 로그·URL referrer 미노출이다. 응답은 `Referrer-Policy: no-referrer`를 사용한다.
- audio MIME/10 MiB/60초 제한, sync request timeout/retry와 `Idempotency-Key`를 적용한다. API 버전은 `/api/v1`로 유지하고 backward-compatible field 추가만 허용한다.
- timestamp는 UTC 저장, 농장 업무일만 Asia/Seoul로 계산한다. DB transaction으로 session별 version unique/current-version 증가를 보장한다.
- TTS는 text content hash로 cache하며 text가 source of truth다. 영상은 `video/*`, 모바일 용량 제한, captions text를 갖고 autoplay를 강제하지 않는다.
- 로그는 secret, PIN, token, raw audio를 redact한다. `/health`는 process liveness, `/ready`는 DB/provider readiness만 의미한다.
