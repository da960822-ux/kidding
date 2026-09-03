# 실패 모드와 대응

| 상황 | 판정/응답 | FE | BE | AI 주담당 |
|---|---|---|---|---|
| 빈 transcript·한국어 음성 불명확 | `422 AUDIO_UNCLEAR`, 저장하지 않음 | 녹음 재생 확인·재시도 | provider 장애와 분리 | confidence/empty 판정 |
| STT provider 연결·응답 실패 | `503 PROVIDER_UNAVAILABLE` | 잠시 후 재시도 | 안전한 오류 envelope | provider failure 판정 |
| 구조화 JSON invalid | `422`, draft 저장·게시 금지 | 원문 유지·재시도 | schema validation | 계약 준수 |
| 사투리·수량/동사 경계가 불명확 | 추측 치환 없이 blocking `TASK`/`QUANTITY` ambiguity | 해당 내용 보완 | 기존 게시 차단 유지 | 관련 사전 문맥만 참고 |
| DEICTIC 위치 권고 누락 | non-blocking `LOCATION` 추가, 원문 보존 | 위치 입력 없이 현장 설명을 선택하는 전달 버튼 제공 | reason/audit 유지, 실제 blocking LOCATION은 낮추지 않음 | 지시어 자체로 blocking 금지 |
| 양파·딸기 실행 지시 혼합 | 빈 단계·blocking `TASK`인 `AMBIGUOUS` 초안 | 작물별 분리 또는 선택 요청 | family mismatch 저장·게시 금지 | 부정문 작물과 실행 대상 구분 |
| non-blocking ambiguity | owner가 `PUBLISH_AS_IS`/`SUPPLEMENT` 선택 | 배지·선택 UI | reason/audit 저장 | unknown 보존 |
| safety ambiguity | `OVERRIDE_NOT_ALLOWED` | 강한 차단 | 게시 금지 | 위험 판정 |
| HIGH/UNKNOWN risk | `OVERRIDE_NOT_ALLOWED` | 강한 차단 | 게시 금지 | risk extraction |
| no executable step | `OVERRIDE_NOT_ALLOWED` | 강한 차단 | 게시 금지 | task 판정 |
| unsupported non-safety | owner reason 후 task null/text+TTS | 미지원 badge | 감사 저장 | unsupported 판정 |
| 임의 task_code 또는 task_family 불일치 | `422` | 지원 범위 표시 | two-crop allowlist·family 일치 차단 | ontology 검증 |
| guide MISS 일반 작업표현 | `AI_TRANSLATION` + source badge | fallback 표시 | source 기록 | 번역 |
| guide MISS 안전표현 | 자동 게시 금지 | 확인 필요 | safety gate | source 검수 |
| 안전 수준 HIGH 영상 | 게시 금지 | text fallback/차단 | gate | 영상 검수 |
| 영상·TTS 실패 | text fallback | 재시도·텍스트 | 상태 반환 | provider retry |
| 신규 양파 운반의 영상 제외 정책 | `ONION_TRANSPORT` 유지, text+TTS 제공 | 작업 안내 유지 | 저장된 기존 package는 그대로 읽음 | 데이터 정책을 신규 package 생성에만 적용 |
| worker locale leakage 또는 unverified safety provenance | `422 SCHEMA_INVALID`, package·게시 금지 | 해당 언어 안내 | locale/provenance 재검증 | 번역/guide 재검증 |
| worker DTO에 transcript/risk/identity/token/cache key 또는 UI의 TTS hash 노출 | `422 SCHEMA_INVALID`, package·게시 금지 | 비노출 | DTO/UI allowlist 검증 | package builder 검증 |
| TTS safety 또는 step 누락 | `422 SCHEMA_INVALID`, package·게시 금지 | 텍스트 노출 금지 | TTS input 재검증 | package builder 재생성 |
| owner 인증 없음 | mutation `401` | PIN 재입력 | cookie 검증 | - |
| 기존 농장 인증 호환 경로의 Farm access code 또는 Owner PIN 불일치 | 일반화된 `401` | 두 값을 다시 확인 | 조합 검증·rate limit | - |
| owner 세션 만료 | `401` | 재로그인 뒤 원래 화면 복귀 | cookie 만료·삭제 | - |
| 임시 팀 관리 링크/PIN 불일치·만료 | 일반화된 `401`; 반복 실패 `429` | PIN 재입력 또는 새 팀 시작, 자동으로 기존 작업을 새 팀에 옮기지 않음 | 정확한 team/farm·DB 만료 검사 | - |
| 미확정 팀에서 QR 요청 | `409 VERSION_CONFLICT` | 첫 작업 확정 안내 | pending 초대·배정 금지 | - |
| 자정 경과·작업 변경·QR 재발급 | 팀 활성화부터 고정 24시간 | 기존 팀 유지·실제 만료 시각 표시 | 날짜로 새 팀을 생성하거나 expiry 연장 금지 | - |
| 새 배정·배정 작업 변경 | 미확인 receipt와 최신 briefing | vi/ne 알림·명시적 지시 확인 | 조회만으로 확인 저장 금지 | - |
| 근로자의 구버전 확인 | `409 VERSION_CONFLICT` | 최신 내용 표시 후 다시 확인 | session lock과 expected_version 비교 | - |
| 확인 저장 실패 | 오류·미확인 유지 | 성공 표시 금지, 재시도 | 최초 성공 시각 유지·idempotent 처리 | - |
| 작업 화면 닫힘·기기 잠금 | polling 알림 보장 불가 | 재접속 시 미확인 배정 표시 | OS 푸시 전송으로 오인시키지 않음 | - |
| 초안 복구 | 유효·미확정 v2만 `200 no-store`; 만료/타 Farm/없음 `404`, 확정 `409`, legacy `422` | 원음 없이 해석 결과 재표시, 실패 시 새 녹음 안내 | farm·expiry·confirmed·contract 검사 | - |
| confirm에 delivery mode/language가 들어감 | `422 SCHEMA_INVALID` | publish 뒤 전달 화면에서 선택 | confirm은 공용 `vi`·`ne` package만 publish | - |
| REMOTE link issue 또는 CO_PRESENT briefing의 언어 누락/허용값 외 입력 | `422 SCHEMA_INVALID` | `vi|ne`를 다시 선택 | 별도 link/briefing endpoint 검증 | - |
| remote link 만료 | `410`, 재발급 안내 | 안내 화면 | expiry 검사 | - |
| remote token invalid/revoked | 일반화된 `404` | 접근 불가 화면 | 내부 사유 비공개 | - |
| today-team QR invalid/revoked | 일반화된 `404` | 접근 불가·QR 재표시 | token hash·expiry 검사 | - |
| today-team QR 명시적 재발급 | 이전 QR `404` | 새 QR만 공유 | 새 hash 저장·기존 token 폐기 | - |
| today-team QR 만료 | `410`, 새 QR 안내 | 농장주에게 QR 재열기 안내 | 저장된 team expiry 검사 | - |
| 팀 배정 없음 | `200` 빈 assignments | 배정 대기 화면 | member cookie 범위만 조회 | - |
| concurrent quantity change | `409` | 최신 version 재확인 | transaction/version 검사 | - |
| legacy v1 WorkVersion quantity preview/confirm | `422 LEGACY_READ_ONLY` | legacy version은 읽기 전용 안내 | remap·mutation 없이 차단 | version contract |
| worker version 증가 | 5초 polling/focus 즉시 조회 | 화면/TTS 교체 | 최신 PUBLISHED 반환 | - |
| API/DB 일시 장애 | 재시도·demo fallback | 마지막 상태와 오류 구분 | `/health`, `/ready` | - |
| production public web URL 없음 | `/ready` `503`, REMOTE 발급 차단 | 배포 설정 안내 | `PUBLIC_WEB_BASE_URL` 확인 | - |
| Vercel API upstream 미설정·비HTTPS | Vercel build 실패 | 배포 중단 | `API_UPSTREAM_ORIGIN` HTTPS origin 설정 | - |
| Vercel/Render public origin 불일치 | owner·TeamMember cookie 후속 요청 `401` | 재로그인·재참가 대신 배포 중단 | `FRONTEND_ORIGINS`·`PUBLIC_WEB_BASE_URL`·`PUBLIC_API_BASE_URL`을 Vercel origin으로 통일 | - |
| 기대 release revision과 FE/BE revision 불일치 | live smoke 실패·배포 중단 | 구 화면을 계속 사용하지 않음 | `/health.revision`과 FE build revision을 기대 commit과 비교 | - |
| `OWNER_SESSION_SECRET` rotation | owner session, team QR/member cookie, WorkerLink 무효 | 새 QR·REMOTE 링크 발급 | secret 교체 뒤 기존 token 재사용 금지 | - |

## 원칙

`AI는 추측하지 않는다. 결정은 농장주가 한다.` raw audio는 즉시 삭제하고 transcript는 owner 감사용으로만 보관하며 anonymous worker API에는 절대 반환하지 않는다. P0는 영구 근로자 개인정보·계정·채팅을 저장하지 않는다. 새 TodayWorkTeam은 별명·언어만 가진 임시 roster이며 첫 작업 확정부터 24시간 뒤 만료한다. 기존 팀의 저장된 만료는 변경하지 않는다. `CO_PRESENT`, `REMOTE`, team assignment는 모두 같은 최신 WorkVersion을 읽는다. REMOTE URL은 browser `/w/{token}` route이고 owner mutation은 PIN cookie와 exact Origin만 사용한다.
