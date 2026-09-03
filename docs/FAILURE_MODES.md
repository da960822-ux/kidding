# 실패 모드와 대응

| 상황 | 판정/응답 | FE | BE | AI 주담당 |
|---|---|---|---|---|
| STT 실패·빈 transcript | 재녹음 안내, 저장하지 않음 | 녹음 재시도 UI | 오류 envelope | AI: confidence/empty 판정 |
| 변경 음성 parse ambiguous | 저장하지 않음, 한 질문 | before/after 대신 보완 UI | `expected_version` 재검증 | AI: ambiguity preservation |
| 구조화 JSON invalid | draft 거부, `422` | 원문 유지·재시도 안내 | schema validation | AI: schema 계약 준수 |
| non-blocking ambiguity | `AMBIGUOUS`; owner가 `PUBLISH_AS_IS`/`SUPPLEMENT` 선택 | 배지·선택 UI | override reason/audit 저장 | AI: unknown 보존 |
| safety ambiguity | `OVERRIDE_NOT_ALLOWED`(422) | 강한 차단 | 게시 금지 | AI |
| no executable step | empty `steps` + blocking `TASK` draft, publish block | 강한 차단 | 게시 금지 | AI |
| unsupported non-safety task_code | LOW 비안전만 owner override 시 task_code null/marker, video null, text+TTS | 미지원·확인 필요 badge | policy/reason audit | AI |
| 임의의 non-null task_code | `422`, 자동 매칭 금지 | 지원 범위 표시 | allowlist 차단 | AI: ontology 검증 |
| guide MISS 일반 작업표현 | `AI_TRANSLATION` + 언어별 source snapshot 표시 | fallback badge | source snapshot 기록 | AI: 번역 |
| guide MISS 안전표현/검수 없음 | 자동 게시 금지 | 확인 필요 표시 | safety gate 차단 | AI: source 검수 |
| HIGH/UNKNOWN risk 또는 HIGH 영상 | `PUBLISHED` 거부 | 텍스트 fallback 또는 차단 표시 | Safety Policy assessment gate, HIGH/UNKNOWN 절대 게시 금지 | AI: 위험 등급 검수 |
| 영상 없음/재생 실패 | 텍스트+TTS fallback | fallback 렌더 | asset URL health 확인 | FE: 접근성 |
| TTS 실패 | 텍스트 유지 | 재생 버튼 비활성·텍스트 표시 | audio optional | AI: provider retry |
| owner 인증 없음 | mutation `401` | PIN 재입력 | 쿠키 검증 | BE |
| `CO_PRESENT` owner 인증 없음 | briefing 차단, PIN 재입력 | PIN 재입력 | cookie 검증 | BE |
| `REMOTE` token 만료 | 외부 일반 접근 불가 + 재발급 안내 | 안내 화면 | 24시간 expiry 검사 | BE |
| `REMOTE` 재생성 | raw URL은 단일 create/reissue 응답에서만 한 번 표시 | owner 전달 UI | 기존 link revoke 후 새 24h hash 저장 | BE |
| `REMOTE` token invalid | 외부 일반 접근 불가 | 안내 화면 | 내부 사유 노출 금지 | BE |
| concurrent quantity change | `409`, 최신 version 재조회 | before/after 재확인 | version/idempotency 검사 | BE |
| delivery version 증가 | `CO_PRESENT`·`REMOTE` 모두 5초 polling 또는 focus 복귀 즉시 조회 | 화면/TTS 교체 | 최신 `PUBLISHED` 반환 | BE/FE |
| API/DB 일시 장애 | 재시도·데모 fallback | 마지막 표시 상태와 오류 구분 | `/health`, `/ready` | BE |

## 원칙

`AI는 추측하지 않는다. 결정은 농장주가 한다.` AI 결과는 제안이다. unknown은 `UNSPECIFIED`/`null`로 남긴다. BE 검증과 [Safety Policy](SAFETY_POLICY.md) 게시 gate가 최종 권한을 가진다. raw audio는 STT 요청 동안만 임시 저장하고 성공·실패 무관 즉시 삭제한다. transcript는 version 감사용으로만 보관하고 anonymous remote API에는 반환하지 않는다.

## 역할 인계

FE는 오류를 숨기지 않고 canonical status와 source를 표시한다. BE는 모든 mutation·버전 충돌·safety gate를 서버에서 재검증한다. AI는 실패 원인과 입력/출력 ID를 `EXPERIMENT_LOG.md`와 평가 결과에 남긴다.
