# 실패 모드와 대응

| 상황 | 판정/응답 | FE | BE | AI 주담당 |
|---|---|---|---|---|
| STT 실패·빈 transcript | 재녹음, 저장하지 않음 | 녹음 재시도 | 오류 envelope | confidence/empty 판정 |
| 구조화 JSON invalid | `422`, draft 저장·게시 금지 | 원문 유지·재시도 | schema validation | 계약 준수 |
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
| owner 인증 없음 | mutation `401` | PIN 재입력 | cookie 검증 | - |
| delivery mode/language 없음 | `422` | 선택 요구 | 입력 검증 | - |
| remote link 만료 | `410`, 재발급 안내 | 안내 화면 | expiry 검사 | - |
| remote token invalid/revoked | 일반화된 `404` | 접근 불가 화면 | 내부 사유 비공개 | - |
| today-team QR invalid/revoked | 일반화된 `404` | 접근 불가·QR 재표시 | token hash·expiry 검사 | - |
| today-team QR 만료 | `410`, 새 QR 안내 | 농장주에게 QR 재열기 안내 | Asia/Seoul work date/expiry 검사 | - |
| 팀 배정 없음 | `200` 빈 assignments | 배정 대기 화면 | member cookie 범위만 조회 | - |
| concurrent quantity change | `409` | 최신 version 재확인 | transaction/version 검사 | - |
| worker version 증가 | 5초 polling/focus 즉시 조회 | 화면/TTS 교체 | 최신 PUBLISHED 반환 | - |
| API/DB 일시 장애 | 재시도·demo fallback | 마지막 상태와 오류 구분 | `/health`, `/ready` | - |

## 원칙

`AI는 추측하지 않는다. 결정은 농장주가 한다.` raw audio는 즉시 삭제하고 transcript는 owner 감사용으로만 보관한다. P0는 영구 근로자 개인정보·계정·채팅을 저장하지 않는다. TodayWorkTeam은 별명·언어만 가진 24시간 임시 roster다. `CO_PRESENT`, `REMOTE`, team assignment는 모두 같은 최신 WorkVersion을 읽는다.
