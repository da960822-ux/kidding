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

## 현재 검증 결과

- Python compile 성공
- backend unit tests 16개 통과
- Supabase `tts_assets` migration 적용 확인
- Supabase `202609030006_today_work_teams.sql` migration 적용 확인
- 실제 OpenAI STT·structure·translation과 TodayWorkTeam QR join→개별 배정 E2E 통과
- 프론트 TodayWorkTeam에서 사람별 게시 WorkSession 선택·배정, QR 참여 뒤 member-cookie 기반 내 작업 대기/최신 지시 화면 연결 완료
- 프론트 draft 확정 화면에서 `CO_PRESENT`/`REMOTE`와 `vi|ne`를 먼저 선택한다. `REMOTE`는 initial publish 응답의 링크를 표시하고, 재발급은 이전 링크를 폐기한다.
- 랜딩 문구도 양파·딸기·음성·`vi|ne`·수량 변경·TodayWorkTeam P0 범위로 정리했다. 글 입력·사진·다른 작물·작업 완료 추적·추가 언어 약속은 제거했다.
- Supabase에는 guide phrase 100개와 translation 100개가 있으나 visual asset은 0 row라 영상은 현재 text+TTS fallback을 사용한다.
- `202609030007_expand_onion_strawberry_ontology.sql`의 양파·딸기 8코드, `task_family` DB constraint, publish RPC를 적용했다. retired code를 가진 기존 test draft/session/version/link/assignment는 reset했다.

## 아직 해야 할 일

- guide phrase/translation의 사람 검수 상태를 확인하고, 8개 LOW 영상 manifest를 provenance·사람 `APPROVED`와 함께 넣기 (P0-02/P0-05 data-collection gate)
- Postman에서 `docs/openapi.yaml`을 import하고 현재 API base URL 환경 구성
- 음성→draft→confirm→CO_PRESENT/REMOTE→수량 변경 전체 E2E를 공개 URL에서 실행

## 주의

- 실제 비밀값은 `backend/.env`에만 둔다. 저장소·프론트·Postman 예시에 넣지 않는다.
- `202609030004_migrate_to_anonymous_language_links.sql`은 기존 worker registry를 최신 익명 링크 모델로 바꾸는 migration이다. 기존 worker 데이터가 있으면 실행 전에 백업한다.
- `202609030007_expand_onion_strawberry_ontology.sql`은 immutable version의 retired code를 자동 변환하지 않는다. legacy data가 있는 다른 환경에서는 reset 또는 별도 보존 계획 후 적용한다.
- `DEMO_FALLBACK=0`이고 실제 AI provider가 연결되지 않은 상태에서는 audio API가 `503 PROVIDER_UNAVAILABLE`을 반환한다. `DEMO_FALLBACK=1`은 checked-in 합성 fixture 전용이다.
