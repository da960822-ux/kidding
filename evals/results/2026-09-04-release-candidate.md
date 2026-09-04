# 통합 배포 후보 2026.09.04-rc.1

2026-09-04에 각 작업의 로컬 변경을 통합한 프론트엔드·백엔드 배포 후보를 준비했다. 운영 배포, 원격 push, DB 변경은 수행하지 않았다. Render는 commit 자동 배포가 설정되어 있으므로 준비 단계에서 원격 push를 하지 않았다.

## 후보 식별과 산출물

- 공통 실행 revision: `2026.09.04-rc.1+5be22371c84e`
- 기준 Git commit: `ff68b9595fbaae6849ed3df0108a4e49947f8b49`
- 소스 snapshot SHA-256: `5be22371c84e`로 시작하는 전체 값과 207개 파일의 hash는 [manifest](../../tmp/release-20260904/manifest.json)에 기록했다.
- 기준 commit 이후의 미커밋 변경·신규 파일까지 포함했다. Git commit만 배포하면 이번 변경이 빠지므로 반드시 후보 소스와 일치하는 commit 또는 아래 snapshot을 사용한다.
- 이 식별자는 배포 버전이다. 기존 HTTP API `2.0.0`, `structure-v2`, `worker-briefing-v2` 계약 버전은 유지한다.

| 파일 | 용도 |
| --- | --- |
| [전체 소스 ZIP](../../tmp/release-20260904/batmeori-source.zip) | FE/BE 코드, 테스트, 계약, Vercel/Render 설정 및 파일 manifest |
| [프론트 빌드 ZIP](../../tmp/release-20260904/batmeori-frontend-dist.zip) | 새로 설치한 환경에서 생성한 프로덕션 `dist` |
| [백엔드 Docker context ZIP](../../tmp/release-20260904/batmeori-backend-context.zip) | Dockerfile, Python 앱, Node AI, 필수 참고자료·schema |
| [산출물 SHA-256](../../tmp/release-20260904/artifacts.json) | 각 ZIP의 무결성 검증값 |
| [프론트 환경 예시](../../tmp/release-20260904/frontend.env.example) | same-origin API와 공통 revision 설정 |
| [백엔드 릴리스 환경 예시](../../tmp/release-20260904/backend-release.env.example) | 공개 주소와 공통 revision 설정, 기존 비밀값 유지 |

ZIP 내부 검사와 압축 무결성 검사를 통과했다. 실제 `.env`, 로컬 에이전트 설정, `node_modules`는 포함하지 않았다. 평가용 녹음·스크린샷은 배포 소스에서 제외하고 기존 평가 경로에 보존했다. 프론트 `dist`만 정적 업로드하면 API rewrite가 구성되지 않는다. Vercel에는 전체 소스의 `vercel.ts`와 환경설정을 함께 적용한다.

## 포함된 수정

- 근로자 URL·QR 접근 안내, 기존 팀 관리 링크/PIN 복귀, QR 화면 관리정보 비노출.
- 작업별 공유 링크·변경 알림 분리, 초안 복구·로그아웃·늦은 응답 처리, 수량 후보 중복 확정 방지.
- 관리자 스토리보드 실제 영상 연결, 근로자 단계 진입·재생·미디어 오류 처리.
- DB 조회 대기와 반복 조회 개선, AI 요청 예산·응답 유실 재시도 복구.
- 수량 변경 시 단계·메모의 이전 목표량 정합성, 원문 수량 충돌 검사, 기존 DB 용어 사전 연결.
- 금지사항 상시 표시, 전체 TTS의 공통정보·마감·순서·금지사항, 카드·문장 단위 통일.
- 랜딩 휴대폰 이미지의 투명 배경 자산 복구.

구조화 추론 축소·번역 묶음 등의 속도 개선안은 실험/계획 상태이며 제품 기본값으로 추가 적용하지 않았다. 게시된 작업의 전체 업무 변경도 이번 배포에 새 기능으로 추가하지 않았다.

준비 중 발견한 Docker 제외 규칙을 수정했다. 필수 `ai/references/agriculture-terms-v2.json`이 이미지에서 빠지면 Node import가 실패하므로 `.dockerignore` 예외를 추가했다. 기존 owner 음성 테스트의 dummy hash도 실제 전체 텍스트 SHA-256으로 수정하고 비동기 검증 완료를 기다리게 했다.

## 검증

| 검사 | 결과 |
| --- | --- |
| 전체 `npm test` | **9/9 묶음 통과** |
| AI 단위 | 77/77 |
| 백엔드 단위 | 107/107 |
| 브라우저 E2E | 88/88 + API 재시도 1/1 |
| manifest·전사 dataset·FE fixture·HTTP 계약·Vercel proxy | 통과 |
| 후보 소스에서 `npm ci` 후 TypeScript·Vite production build | 통과 |
| 빌드 결과 실제 브라우저, 390/1280px | revision 일치, 이미지 로딩, 가로 넘침·페이지 오류 없음 |
| 백엔드 context 내 Node import·FastAPI `/health` | 통과, 공통 revision 일치 |
| snapshot과 작업 폴더의 소스 hash 비교 | 일치 |
| 실제 Docker 이미지 빌드 | 미실행: 로컬 Docker CLI 없음 |

첫 통합 실행의 owner 음성 fixture 실패는 [초기 로그](../../tmp/release-20260904/test.log)에 보존했다. 수정 후 [최종 로그](../../tmp/release-20260904/test-final.log)는 9/9 통과다. [별도 설치](../../tmp/release-20260904/install.log), [빌드](../../tmp/release-20260904/build.log), [프론트 smoke](../../tmp/release-20260904/frontend-smoke.json), [백엔드 smoke](../../tmp/release-20260904/backend-smoke.json)도 남겼다. 로컬 Node는 24이며 Dockerfile은 Node 22·Python 3.12를 사용하므로 이미지 실행 검증을 대신한다고 보지 않는다.

## 배포 절차와 유지할 설정

1. 아래 출시 조건을 충족한 뒤, 실제 배포 직전 FE/BE 배포 ID와 revision을 다시 기록한다. 후보 소스와 같은 내용을 배포 대상으로 고정한다.
2. 백엔드 context 루트에서 `docker build -f backend/Dockerfile -t batmeori-api:2026.09.04-rc.1 .`를 실행한다. 완성 이미지에서 `docker run --rm --entrypoint node batmeori-api:2026.09.04-rc.1 --input-type=module -e "await import('./ai/index.mjs')"`를 확인한다. `/ready`만으로 필수 JSON import 성공을 판정하지 않는다.
3. 기존 Render 서비스에 같은 revision과 서버 설정을 적용한다. `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OWNER_SESSION_SECRET`, `OPENAI_API_KEY`와 기존 provider 설정을 유지한다. 새 서비스 생성으로 `OWNER_SESSION_SECRET`을 재발급하지 않는다.
4. Vercel에 같은 revision으로 전체 소스를 빌드한다. `API_UPSTREAM_ORIGIN`은 Render HTTPS origin, `VITE_API_BASE_URL`은 빈 값, mock은 false다. 백엔드의 세 공개 주소는 Vercel origin으로 일치시킨다. 후보 preview를 쓰면 그 origin에 맞게 별도 검증 환경을 구성한다.
5. 동일 후보의 `/health`, `/ready`, 화면 `data-build-revision`을 확인하고 실제 owner/member cookie·음성·QR·지시 확인·수량 새 버전 전달을 검증한다. 코드 준비와 실제 운영 검증을 구분해 기록한다.

새 DB migration은 없다. 이번 앱 배포에 DB reset, bootstrap, 포괄적인 migration push를 포함하지 않는다. 기존 기록상 운영은 `001~016`과 `018` 적용 상태이고 삭제용 `017`은 미적용이다. 계획 문서의 `019`도 이번 변경에 포함되지 않는다.

## 운영 전 남은 조건과 롤백

배포 후보 파일 준비는 완료했지만 **운영 P0 출시 gate 통과로 판정하지 않는다.** [EVALS](../../docs/EVALS.md)의 STT·실기기 기준을 유지한다. [기존 STT 평가](2026-09-04-dialect-resume-review.md)에 남은 수확 누락·장소 인식 실패와 실제 휴대폰 2대/전달 방식별 3회 연속 검증은 미완료다. [이번 음성 수정 검증](instruction-fixes-20260904/REPORT.md)은 생성 TTS·브라우저 재생 증거이며 새 STT·실제 DB 게시·원어민 검수를 대신하지 않는다.

[현재 운영 조회](../../tmp/release-20260904/current-production.json)에서 FE는 `ff68b9595fbaae6849ed3df0108a4e49947f8b49`, BE는 `a12aca0b059f2e57c37ee04d663188e8abdf3962`였고 백엔드 `/health`·`/ready`는 200이었다. 배포 ID는 호스팅 제어판에서 별도 확인해야 한다. 문제 발생 시 배포 직전 기록한 FE/BE 아티팩트로 되돌리고 공개 주소·revision을 다시 확인한다. DB, 기존 WorkVersion·package·TTS cache와 서명 secret은 유지한다.
