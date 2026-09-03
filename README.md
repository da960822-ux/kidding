# 밭머리 (Batmeori)

농장주의 전라도 사투리 작업지시를 양파·딸기 작업 스토리보드로 바꿔 외국인 근로자에게 전달하는 해커톤 P0 제품.

## P0 범위

양파·딸기만 지원한다. 전달 언어는 베트남어(`vi`)·네팔어(`ne`), 변경은 수량 변경만 지원한다. confirm 뒤 농장주는 `CO_PRESENT` 같이 보기 또는 `REMOTE` 링크로 보내기를 고르고 언어를 선택한다. 전자는 owner PIN cookie로 여는 owner 폰 video+TTS briefing, 후자는 언어를 고른 익명 24시간 latest-`PUBLISHED` 링크다. 사람별 다른 작업에는 오늘 작업팀 QR을 열고, 참가자가 별명·언어만 제출하면 각 최신 WorkSession을 배정한다. 이는 24시간 임시 roster이며 전화번호·국적·SMS·개인 로그인·영구 근로자 명부는 제외한다. `AI는 추측하지 않는다. 결정은 농장주가 한다.` unknown은 `UNSPECIFIED`/`null`로 유지한다. [Safety Policy](docs/SAFETY_POLICY.md)에 따라 LOW 비안전 미지원 작업만 reason을 남겨 전달할 수 있으며, safety ambiguity·HIGH·UNKNOWN 위험·schema invalid·실행 단계 없음은 override 불가다. 영상은 AI 사전 생성 후 사람 검수한 자산만 사용하며 `safety_level: HIGH` 자산은 게시하지 않는다. 일반 작업표현은 정부 가이드 HIT를 우선하고 MISS 시 `AI_TRANSLATION` 출처를 표시한다. 안전표현은 검수 출처가 없으면 자동 게시하지 않는다. [팀 변경 공지](docs/TEAM_UPDATE_ONION_STRAWBERRY_P0.md)에 8개 코드와 동시 반영 규칙을 정리했다.

## 실행 전제

- FE: React/Vite/Tailwind, Vercel
- BE: FastAPI, PostgreSQL(Supabase 가능), Railway
- AI: STT/구조화/번역/TTS provider-neutral 계약. provider/model은 서버 환경변수.

상세 제품 흐름은 [제품 명세](docs/PRODUCT_SPEC.md), API·경계는 [아키텍처](docs/ARCHITECTURE.md), API schema는 [openapi.yaml](docs/openapi.yaml), 위험 판정은 [Safety Policy](docs/SAFETY_POLICY.md), 데이터·용어는 [CONTEXT.md](CONTEXT.md)와 [DATA_MODEL](docs/DATA_MODEL.md) 참조.

## 검증

배포 URL과 휴대폰 2대로 음성→스토리보드→`CO_PRESENT` owner 폰 briefing과 `REMOTE` 익명 링크의 `vi`/`ne` 전달→변경 음성 parse→`20망`에서 `15망` 직접 확인→각 최신 화면을 3회 연속 성공해야 한다. remote link는 24시간 latest `PUBLISHED` resolve이며, 만료 시 owner에게 단일 링크 생성 API를 안내한다. 실패·fallback 기준은 [FAILURE_MODES](docs/FAILURE_MODES.md), 30 transcript 평가와 별도 synthetic STT smoke 기준은 [EVALS](docs/EVALS.md) 참조.

## 책임

FE는 입력·두 delivery branch 표시·Vercel·모바일 리허설, BE는 상태/인증/DB/API/Railway/게시 gate, AI는 계약 준수 출력·언어별 번역 source snapshot·영상 provenance·평가·E2E 증거를 맡는다. 모든 인계물은 문서의 canonical field/status를 따른다.
