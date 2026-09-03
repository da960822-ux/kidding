# Codex 인수인계 메모

이 파일은 Codex 계정을 바꾼 뒤 새 Codex 작업에서 먼저 읽는 메모다. 비밀번호,
Supabase secret key, PIN, 토큰은 기록하지 않는다.

## 새 계정에서 시작하는 방법

1. Codex 데스크톱 앱에서 `C:\Users\kimmo\OneDrive\Desktop\밭머리` 폴더를 연다.
2. 새 작업을 만든다.
3. 아래 문장을 첫 메시지로 보낸다.

```text
이 프로젝트는 밭머리다. 먼저 AGENTS.md, README.md, CONTEXT.md,
docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md를 읽어라. 백엔드 작업이면
docs/DATA_MODEL.md, docs/openapi.yaml, docs/AI_CONTRACTS.md,
docs/FAILURE_MODES.md, docs/BACKLOG.md도 읽어라. 현재 구현은 ZIP 최신본 기준이며,
P0는 양파·딸기만, vi/ne만, 수량 변경만 지원한다. 현재 상태와 미완료 작업을 먼저 요약한 뒤
수정하라. AI는 추측하지 않으며, 결정은 농장주가 한다.
```

## 현재 제품 결정

- P0 작물은 양파·딸기만 지원한다. task code와 팀 영향은 `docs/TEAM_UPDATE_ONION_STRAWBERRY_P0.md`를 따른다.
- 전달 언어는 베트남어(`vi`)와 네팔어(`ne`)만 지원한다.
- 전달 방식은 `CO_PRESENT`(농장주와 함께 보기), `REMOTE`(익명 링크), 또는 TodayWorkTeam의 개인 배정이다.
- P0에는 영구 근로자 등록·계정, 전화번호, 국적, SMS, 개인 프로필, 채팅이 없다. TodayWorkTeam은 별명·`vi|ne`만 가진 24시간 임시 QR roster다.
- `REMOTE` 링크는 언어 하나를 선택하며 발급 후 24시간 뒤 만료된다.
- 링크는 항상 최신 `PUBLISHED` WorkVersion을 보여준다.
- 안전 위험이 `HIGH` 또는 `UNKNOWN`이면 게시할 수 없다.
- P0 영상은 AI 사전 생성 후 사람 검수한 자산만 사용한다. `HIGH` 자산은 게시하지 않는다.
- 정부 가이드의 URL·페이지·번역은 사람이 PDF와 대조하기 전까지 공식 자료로 표시하지 않는다.

## 현재 구현 상태

- `backend/app/main.py`: FastAPI API, PIN/member cookie 인증, draft/version/link/team 흐름, BE schema/risk/guide/video gate
- `backend/app/ai.py`: OpenAI STT, Luna Structured Output, translation-v1 adapter (server-only env)
- `docs/openapi.yaml`: 현재 API 계약
- `supabase/migrations/`: work session, anonymous language link, temporary team, guide/asset/TTS cache 테이블과 RPC
- `docs/schemas/`: structure, quantity-change, translation JSON Schema
- `evals/`: 오디오 평가 입력과 manifest
- 기존 `workers` API와 `worker_ids` 입력은 제거했다.
- 누락된 `risk_assessment`는 백엔드가 `UNKNOWN/INSUFFICIENT_CONTEXT`로 보완하고 게시를 막는다.
- worker 응답에서는 `risk_assessment`를 제거한다.
- `DEMO_FALLBACK=0`으로 실제 provider 경로를 사용한다. `backend/.env`의 OpenAI 설정은 채워져 있다.

## 현재 로컬 검증 결과

- backend unit test 34개, Node AI test 36개, 브라우저 E2E 7개 통과
- 8개 asset manifest의 schema/checksum 입력 검증과 frontend contract/production build 통과
- confirm은 delivery 방식·언어 없이 공용 `vi`·`ne` package만 publish한다. 프론트 스토리보드에서 `CO_PRESENT` 언어를 고르거나 `REMOTE` 언어별 링크를 별도 발급하며, 재발급은 이전 링크를 폐기한다.
- `202609030007_expand_onion_strawberry_ontology.sql`의 양파·딸기 8코드와 `task_family` DB constraint를 적용했다. retired code를 가진 기존 immutable version/link/asset은 reset·delete·rewrite·자동 remap 없이 legacy read-only로 보존한다.

## 배포 환경에서 남은 검증

- Supabase에 010까지 migration을 적용하고 `seed_demo_owner.py`, `import_visual_assets.py`를 실행한다.
- 두 farm owner로 cross-farm isolation, 실제 Node provider와 audio→draft→confirm→CO_PRESENT/REMOTE/team→수량 변경 E2E를 실행한다.

## 주의

- 실제 비밀값은 `backend/.env`에만 둔다. 저장소·프론트·Postman 예시에 넣지 않는다.
- `202609030004_migrate_to_anonymous_language_links.sql`은 기존 worker registry를 최신 익명 링크 모델로 바꾸는 migration이다. 기존 worker 데이터가 있으면 실행 전에 백업한다.
- `202609030007_expand_onion_strawberry_ontology.sql`은 immutable version의 retired code를 자동 변환하지 않는다. legacy data가 있는 환경에서도 reset 없이 v1 read-only로 보존한다.
- Node AI provider가 연결되지 않으면 audio API는 `503 PROVIDER_UNAVAILABLE`을 반환한다. 합성 fixture STT/LLM runtime은 없다.
