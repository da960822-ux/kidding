# 밭머리 아키텍처

## 경계

```text
React/Vite/Tailwind (Vercel)
  │ HTTPS REST, automatic demo-owner session cookie / anonymous link token
FastAPI (Railway)
  ├─ WorkSession + version + link service
  ├─ today work team + expiring invite service
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

## 세션·링크

P0에는 로그인 화면과 PIN 입력이 없다. 농장주 역할 선택 시 서버가 짧은 `HttpOnly; Secure; SameSite=None` demo owner session cookie를 자동 발급한다. 별도 owner/session table은 두지 않는다. 모든 owner mutation은 쿠키와 허용된 `Origin`을 요구한다. Supabase 회원가입/계정관리는 P1.

`REMOTE` token은 추측 불가능한 랜덤 값으로 저장 시 해시하고 발급 후 24시간 만료한다. 유효 token은 항상 해당 WorkSession의 최신 `PUBLISHED` 버전을 반환한다. 만료·잘못된 token 모두 외부에는 일반화된 접근 불가 응답으로 처리하되, 만료 상태에는 재발급 안내를 제공한다.

Today work team invite token도 추측 불가능한 랜덤 값으로 검증용 hash와 서버 키로 암호화한 ciphertext만 저장하며, 평문은 DB·로그에 남기지 않는다. ciphertext는 owner-authenticated 오늘 팀 조회에서 QR URL을 복원할 때만 사용한다. 팀의 업무일 종료 또는 발급 24시간 중 먼저 도래하는 시점에 만료한다. 익명 참여 API는 별명 길이, 국적 allowlist, 안내 언어 allowlist를 검증하고 전화번호·계정·실명을 요구하지 않는다.

BE는 owner-authenticated 오늘 팀 응답에 `join_url`을 반환하고 QR 이미지·SVG·Base64는 생성하지 않는다. FE가 `join_url`을 QR로 렌더링하며, 카메라 스캔을 지원하지 않는 기기에서도 같은 URL을 직접 입력할 수 있게 유지한다. 업무일과 만료 경계는 `Asia/Seoul`로 계산하고 timestamp는 UTC ISO 8601로 반환한다.

confirm은 link를 발급하지 않는다. owner의 language-specific create/reissue만 raw remote URL을 한 번 반환한다. `CO_PRESENT` briefing은 owner cookie를 요구하며 public session-id 조회는 제공하지 않는다.

## 게시 gate

BE는 다음을 모두 만족할 때만 `PUBLISHED`를 허용한다.

- WorkSession draft가 owner confirmation을 받음
- 빈 `steps`는 blocking `TASK` ambiguity로 남아 게시 대상이 아님
- 모든 non-null `task_code`가 양파·딸기 8개 ontology에 존재하고 `task_family`와 일치. 불일치는 `422 SCHEMA_INVALID`; `null`은 감사된 비안전 미지원 fallback에만 허용
- 안전표현과 `OFFICIAL_GUIDE` 번역은 언어별 source snapshot을 가짐. `source_page`, `source_url`, `license`, 사람 검수 `verified`가 없으면 `OFFICIAL_GUIDE` 표기 금지
- 매칭 영상은 `review_status: APPROVED`, `safety_level: LOW`, `provenance: AI_GENERATED_PREGENERATED`, [Safety Policy](SAFETY_POLICY.md) assessment를 만족
- 영상이 없으면 텍스트+TTS fallback이 명시됨

HIGH/UNKNOWN risk assessment, 검수되지 않은 안전 번역, invalid JSON, schema invalid, auth/version conflict, 또는 blocking ambiguity는 자동 게시·자동 변경 금지다. LOW 비안전 미지원 작업만 owner가 허용된 reason으로 `PUBLISH_AS_IS`할 수 있다. P0 영상은 검수된 LOW 작업만 다룬다. 운전·차량 또는 동력 장비 이동·회전날·농약·고소작업은 HIGH risk로 분류하며, `ONION_TRANSPORT`도 차량·동력 장비를 운전하거나 이동시키면 게시하지 않는다.

## 책임·인계

- FE→BE: `openapi.yaml`의 field/status만 전송하고 gate 실패를 사용자에게 표시.
- BE→FE: canonical 상태, version, language별 translation source snapshot, `review_status`, generalized access error를 반환.
- AI→BE: `AI_CONTRACTS.md` JSON만 반환; provider/model은 환경변수와 로그에만 존재.
- AI→BE: 검수 완료 guide rows와 asset manifest, 평가 결과만 import·게시 승인 요청.
- BE→FE: anonymous remote response에는 transcript/raw audio를 절대 포함하지 않는다. raw audio는 STT 요청 중 임시 저장만 하고 성공·실패와 무관하게 즉시 삭제한다.

## 운영·보안 불변조건

- Vercel↔Railway cross-origin 호출은 exact frontend Origin allowlist + credentials만 허용한다. cross-site cookie는 `SameSite=None; Secure`로 설정하고 모든 owner mutation의 exact `Origin` 검증으로 CSRF를 막는다. 별도 CSRF header는 P0 계약에 없다. CORS wildcard는 금지한다.
- demo owner session 발급과 owner API에는 rate limit을 적용하고 session TTL을 짧게 둔다. AI 요청도 비용 rate limit을 둔다.
- `REMOTE` token은 128-bit 이상 random, at-rest hash, 로그·URL referrer 미노출이다. 응답은 `Referrer-Policy: no-referrer`를 사용한다.
- audio MIME/10 MiB/60초 제한, sync request timeout/retry와 `Idempotency-Key`를 적용한다. API 버전은 `/api/v1`로 유지하고 backward-compatible field 추가만 허용한다.
- timestamp는 UTC 저장, 농장 업무일만 Asia/Seoul로 계산한다. DB transaction으로 session별 version unique/current-version 증가를 보장한다.
- TTS는 text content hash로 cache하며 text가 source of truth다. 영상은 `video/*`, 모바일 용량 제한, captions text를 갖고 autoplay를 강제하지 않는다.
- 로그는 secret, token, raw audio를 redact한다. `/health`는 process liveness, `/ready`는 DB/provider readiness만 의미한다.
