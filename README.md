# 밭머리 — 말이 닿아야 일이 닿습니다

> 농장주의 전라도 사투리 작업 지시를, 외국인 근로자가 **자기 언어로 바로 이해하는 오늘의 작업**으로 바꿉니다.

**밭머리(Batmeori)**는 음성 작업 지시를 양파·딸기 작업 단계로 구조화하고, 검수된 표현·영상·음성을 조립해 베트남어와 네팔어로 전달하는 현장 커뮤니케이션 서비스입니다. AI가 모르는 내용을 채우지 않고, 불확실한 결정은 항상 농장주에게 남깁니다.

2026 [전남광주 청년(YOUTH) AI 솔버톤](https://gsolverthon.kr/) 참여 프로젝트입니다.

---

## 현장의 문제를, 한 번의 작업 흐름으로

농장 현장에서는 말로 전달한 지시가 언어와 상황에 따라 달라집니다. 특히 작업 위치, 수량, 순서, 안전 표현이 짧은 말 안에 함께 들어가면 근로자는 다시 묻기 어렵고 농장주는 같은 설명을 반복하게 됩니다.

| 현장 | 밭머리 |
|---|---|
| 농장주가 사투리로 작업을 말한다 | 음성을 작업 구조로 정리한다 |
| 근로자마다 이해할 언어가 다르다 | 베트남어·네팔어 briefing을 각각 만든다 |
| 인원별 작업이 다르다 | 오늘 작업팀 QR 하나로 여러 작업을 배정한다 |
| `20망`이 `15망`으로 바뀐다 | 새 immutable version, 번역, TTS, 영상 snapshot을 함께 재생성한다 |
| AI가 애매한 말을 단정할 위험이 있다 | `UNSPECIFIED`로 남기고 농장주가 결정한다 |

## 세 가지 전달 방식, 하나의 최신 작업

같은 `PUBLISHED` WorkSession을 세 방식이 공유합니다. 어느 경로로 보더라도 최신 version의 동일한 worker briefing을 받습니다.

운영자가 농장별 접근 코드와 PIN을 발급하면 농장주는 그 두 값으로 자기 농장에 접속합니다. PIN은 QR에 포함되지 않으며, 로그인으로 확인된 농장만 오늘의 작업과 작업팀을 관리할 수 있습니다.

1. **함께 보기 `CO_PRESENT`** — 농장주가 `vi` 또는 `ne`를 골라 자신의 폰에서 근로자와 함께 briefing을 확인합니다.
2. **원격 링크 `REMOTE`** — 언어별 24시간 익명 링크 `/w/{token}`을 발급합니다. 로그인·전화번호·앱 설치가 필요 없습니다.
3. **오늘 작업팀 `TodayWorkTeam`** — 농장주가 QR 하나를 열고, 근로자가 별명과 언어를 직접 고릅니다. 한 사람에게 여러 작업을 배정할 수 있습니다.

```text
농장 코드 + PIN → 농장 세션
  └─ 농장주 음성 → STT → structure-v2 WorkDraft
      └─ 농장주 확인 → PUBLISHED WorkVersion + vi/ne WorkerBriefing
          ├─ CO_PRESENT
          ├─ REMOTE /w/{token}
          └─ 같은 농장·같은 날짜의 TodayWorkTeam QR → 작업 배정
```

## 작지만 닫힌 P0 범위

해커톤 데모에서 신뢰할 수 있는 흐름을 보여주기 위해 범위를 명확히 제한했습니다.

| 지원 | 이번 P0에서 제외 |
|---|---|
| 양파·딸기 | 다른 작물 |
| 베트남어 `vi`, 네팔어 `ne` | 추가 언어 |
| 수량 변경 | 위치·작업·안전 정보 자동 변경 |
| Asia/Seoul 당일·자정 만료 팀원 | 영구 근로자 프로필·로그인·전화번호·SMS |
| 검수된 LOW 영상, text+TTS fallback | runtime 영상 생성 |

### 작업 ontology

| 작물 | 지원 task code |
|---|---|
| 양파 | `ONION_HARVEST` · `ONION_TRIMMING` · `ONION_SORTING` · `ONION_TRANSPORT` |
| 딸기 | `STRAWBERRY_HARVEST` · `STRAWBERRY_SORTING` · `STRAWBERRY_INSPECTION` · `STRAWBERRY_PACKING` |

기존 `structure-v1` WorkVersion과 기존 asset은 **읽기 전용 legacy**로 남깁니다. 신규 publish는 `structure-v2`와 `ontology-v2`, 위 8개 code만 사용합니다.

## AI는 추측하지 않는다. 결정은 농장주가 한다.

밭머리의 핵심 원칙입니다.

- location·quantity·task가 음성에 없으면 `UNSPECIFIED` 또는 `null`로 보존합니다.
- 안전 ambiguity, HIGH/UNKNOWN 위험, schema invalid, 실행 단계 없음은 override할 수 없습니다.
- 일반 작업 표현은 검증된 정부 가이드 번역을 우선하고, 없으면 `AI_TRANSLATION` 출처를 화면에 표시합니다.
- worker DTO에는 transcript, raw audio, risk assessment, token hash, 다른 팀원의 정보가 포함되지 않습니다.
- worker 별명·ID는 AI input, output, provider metadata, cache key에 넣지 않습니다.

## 신뢰할 수 있는 재생성

수량이 바뀌면 기존 row의 숫자만 고치지 않습니다. 이전 version을 기반으로 새 수량을 검증하고, briefing·번역 segment·TTS text/hash/status·visual snapshot을 모두 다시 만든 뒤, 성공했을 때만 새 immutable WorkVersion을 publish합니다.

따라서 `CO_PRESENT`, 원격 링크, 오늘 작업팀은 항상 같은 최신 package를 봅니다. version conflict 또는 재생성 실패 시 불완전한 version은 저장하지 않습니다.

## 구조

```text
React + Vite + Tailwind
        │ HTTPS / owner cookie / worker token
        ▼
FastAPI
  ├─ authentication, version transaction, delivery API
  ├─ asset·guide read, publish safety gate, TTS storage
  └─ private JSONL/stdio bridge only
        │
        ▼
Node AI runtime
  └─ STT · structure · quantity parse · guide lookup
     translation · visual match · TTS
        │
        ▼
Supabase / PostgreSQL + Storage
  └─ farm-scoped data · immutable versions · 24h links · asset manifest
```

FastAPI는 AI provider를 중복 구현하지 않습니다. Node `ai/` runtime 하나가 AI 작업을 소유하고, FastAPI는 private transport·인증·저장·원자적 publish를 담당합니다.

## 솔버톤 심사 관점에 맞춘 구현 증거

솔버톤 공식 안내는 본선 후보 선발에서 **문제 현안 분석, 아이디어 기획, 해결 방안의 구체성, 참여 의지**를 중점적으로 본다고 밝힙니다. 1차 AI 전문 멘토단과 2차 주최·협력기관 심사단은 각각 50%를 맡으며, 세부 배점과 개별 점수는 공개하지 않습니다. 아래는 공개 기준을 밭머리 데모에서 확인할 수 있는 증거로 바꾼 것입니다. 이는 공식 배점표가 아닙니다.

| 공개 심사 관점 | 밭머리에서 보여줄 증거 |
|---|---|
| 문제 현안 분석 | 언어 장벽, 반복 설명, 수량 변경, 안전 ambiguity를 하나의 현장 흐름으로 정의 |
| 아이디어 기획 | 음성 지시를 단순 번역이 아닌 작업 package와 세 가지 전달 방식으로 전환 |
| 해결 방안의 구체성 | 2작물·8 task code·2언어·당일 유지 팀 QR·24시간 원격 링크·farm scope·immutable version으로 범위를 닫음 |
| 실전성 | QR join, 언어 직접 선택, 실제 `/w/{token}` browser route, 최신 version 재생성 흐름 |
| AI 활용의 책임성 | Node 단일 runtime, schema 검증, source detail, human-reviewed asset, fallback과 안전 gate |

공식 안내: [2026 전남광주 청년(YOUTH) AI 솔버톤](https://gsolverthon.kr/)

## 검증

| 검증 영역 | 현재 자동 검증 |
|---|---|
| AI contract | Node test 47개 — 8 task code, identity exclusion, asset match, vi/ne package, quantity regeneration |
| Backend contract | Python test 64개 — farm code+PIN scope, owner cookie, DB readiness, stable daily QR, atomic publish, legacy read, Node-only boundary |
| Frontend | API contract check, 브라우저 E2E 32개 — 로그인·재인증, 서버 오류 분리, 전체 owner→remote/team 흐름, QR 유지·재발급, 원음 재생, `/w/{token}`, 복수 assignment, 최신 version 표시 |
| Asset | `assets/asset_manifest.csv` 8개 row 검증, checksum mismatch 시 transaction 차단 |

P0 release gate는 33건 transcript evaluation, 별도 STT smoke, contract negative case, 실제 모바일 E2E를 모두 요구합니다. 상세 기준은 [EVALS](docs/EVALS.md)를 확인하세요.

## 빠른 실행

### 1. 프론트 UI 데모

실제 API 없이 화면 흐름을 보려면 mock을 명시적으로 켭니다. mock은 production fallback이 아닙니다.

```powershell
pnpm install
$env:VITE_USE_MOCK_API = 'true'
pnpm dev
```

브라우저에서 `/start`, `/owner/home`, `/worker`, `/w/demo-vi-preview`을 열어 흐름을 확인할 수 있습니다.

### 2. 백엔드와 Node AI runtime

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

`backend/.env`에는 server-only `OPENAI_API_KEY`, 선택적 `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_VOICE`, Supabase와 owner session 설정이 필요합니다. `/ready`는 DB·provider·public web 설정이 충족될 때만 성공합니다. 값 자체는 저장소에 넣지 않습니다.

로컬 실서비스도 같은 origin을 사용합니다. 루트 `.env`는 `VITE_API_BASE_URL=`과 `API_UPSTREAM_ORIGIN=http://127.0.0.1:8000`으로 두고, Vite를 `127.0.0.1:5173`에서 실행합니다. Vite는 `/api`만 이 upstream으로 전달합니다. `backend/.env`의 `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL`, `FRONTEND_ORIGINS`는 `http://127.0.0.1:5173`으로 맞춥니다. 설정 변경 뒤 FE와 BE를 재시작합니다.

### Vercel + Render 배포

Vercel은 browser의 `/api/:path*`를 `API_UPSTREAM_ORIGIN`으로 reverse proxy합니다. Vercel project 환경변수에 HTTPS Render origin만 `API_UPSTREAM_ORIGIN`으로 넣고, `VITE_API_BASE_URL`은 비워 둡니다. Render의 `FRONTEND_ORIGINS`, `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL`은 모두 같은 공개 Vercel origin으로 설정합니다. 그러면 owner와 TodayWorkTeam member cookie가 browser의 same-origin `/api` 요청에만 쓰입니다.

`backend/live_e2e.py`는 API smoke 뒤 `scripts/check-live-browser-sessions.mjs`를 실행합니다. 별도 실제 browser context에서 로그인·QR join 뒤 `/api` 요청의 cookie 유지와 owner/member 격리를 검증하며 Cookie header를 주입하지 않습니다. 로컬 통과는 Vite proxy만 증명하므로 Vercel rewrite는 배포 preview에서 같은 검증을 실행해야 합니다.

마이그레이션 적용 후 운영자 환경에서 농장별 접근 정보를 발급하거나 PIN을 교체합니다. PIN 원문은 데이터베이스와 로그에 저장하지 않습니다.

```powershell
$env:FARM_CODE = '<발급할 농장 코드>'
$env:FARM_DISPLAY_NAME = '<화면에 표시할 농장명>'
$env:FARM_OWNER_PIN = '<secret-store의 PIN>'
python .\provision_farm_owner.py
```

### 3. 테스트

```powershell
pnpm test
```

각 검증은 독립 실행되며 하나가 실패해도 나머지를 계속 실행합니다. 개별 실행이 필요하면:

```powershell
node --test ai/tests/*.test.mjs
$env:PYTHONPATH = 'backend'
python -m unittest discover -s backend -p 'test_*.py' -v
pnpm run check:contracts
pnpm run test:web
```

실제 provider·Supabase·Storage·Chrome 영상 재생까지 확인하려면 로컬 FE/BE를 실행하고 운영자가 발급한 테스트 농장 코드와 PIN을 환경변수로 전달합니다. 이 검증은 유료 provider 호출을 포함합니다.

```powershell
$env:LIVE_E2E = '1'
$env:LIVE_API_BASE_URL = 'https://your-render-service.example'
$env:LIVE_FRONTEND_ORIGIN = 'https://your-app.vercel.app'
$env:LIVE_EXPECTED_REVISION = '<배포할 Git commit SHA>'
$env:LIVE_FARM_CODE = '<테스트 농장 코드>'
$env:LIVE_FARM_OWNER_PIN = '<secret-store의 테스트 농장 PIN>'
pnpm test
```

## 팀

| 이름 | 역할 | 담당 |
|---|---|---|
| 김서영 | Frontend | React 화면, 농장주·근로자 flow, 다국어 UI, QR/worker experience |
| 한창수 | Backend | FastAPI, Supabase, farm scope, owner cookie, version transaction, delivery API |
| 정연석 | Logic | P0 domain logic, Node AI runtime, ontology, translation/TTS·asset contract, 안전·평가 기준 |

## 문서 지도

- [제품 명세](docs/PRODUCT_SPEC.md) — P0 사용자 흐름과 범위
- [아키텍처](docs/ARCHITECTURE.md) — 런타임·데이터·보안 경계
- [OpenAPI](docs/openapi.yaml) — HTTP 계약
- [AI 계약](docs/AI_CONTRACTS.md) — Node runtime 입출력과 provider-neutral 원칙
- [데이터 모델](docs/DATA_MODEL.md) — version, team, asset, farm scope
- [안전 정책](docs/SAFETY_POLICY.md) · [실패 모드](docs/FAILURE_MODES.md) · [평가](docs/EVALS.md)

---

밭머리는 번역기를 만드는 프로젝트가 아닙니다. **농장주의 결정이 근로자의 오늘 작업까지 안전하게 도착하도록 만드는 프로젝트**입니다.
