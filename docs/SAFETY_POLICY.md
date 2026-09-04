# 안전 정책 `safety-policy-v1`

이 정책은 AI가 위험을 추측해 낮추지 못하게 하는 publish gate다. BE는 AI extraction과 deterministic rule을 합친다. 하나라도 HIGH면 HIGH, HIGH 없이 하나라도 UNKNOWN이면 UNKNOWN, 모두 LOW일 때만 LOW다.

## current contract guard

장소 생략 자체는 안전 모호성이 아니며 게시 차단 사유가 아니다. 실제로 언급된 장소의 충돌이나 알아들을 수 없는 장소 표현은 blocking LOCATION으로 유지한다. 장소 생략 허용은 SAFETY/TASK/QUANTITY, HIGH/UNKNOWN 위험 또는 빈 실행 단계 차단을 완화하지 않는다.

임시 팀 작성·관리 권한 변경은 아래 게시 gate를 완화하지 않는다. 첫 게시 실패 시 팀 활성화도 rollback한다. 근로자의 지시 확인은 이해·작업 완료·안전 승인으로 취급하지 않는다.

`structure-v2`/`ontology-v2` current-code family/task-code mismatch, retired 또는 unknown code를 새 write에 쓰는 경우, schema invalidity, HIGH/UNKNOWN risk, no executable step은 publish blocker다. `structure-v1`은 read-only다. Worker response에는 risk assessment를 포함하지 않으며 video metadata는 APPROVED/LOW만 허용한다.

Worker briefing의 `context.safety[]`는 locale text를 담고, 해당 문구의 verified `OFFICIAL_GUIDE` HIT provenance는 `source_detail[]`의 `SAFETY`/`step_sequence:null` entry로 보존한다. safety guide MISS, unverified source, page/url/license 누락은 fallback 번역하지 않고 publish를 차단한다. 안전 문구는 TTS input에도 포함하지만 risk level/reason은 worker DTO에 노출하지 않는다.

## `risk_assessment`

| field | type | rule |
|---|---|---|
| `level` | `LOW\|HIGH\|UNKNOWN` | 합산한 최종 위험 |
| `reasons` | unique enum array | 아래 risk reason 중 하나 이상; LOW면 빈 배열 |
| `schema_version` | string | `1` |
| `contract_version` | string | `safety-policy-v1` |

`reasons` 허용값은 `VEHICLE_OPERATION`, `ROTATING_BLADE`, `PESTICIDE_OR_CHEMICAL`, `WORK_AT_HEIGHT`, `POWERED_MACHINERY`, `INSUFFICIENT_CONTEXT`, `OTHER_HIGH_RISK`다.

## 결정 행렬

| condition | level | 게시 결과 |
|---|---|---|
| 검수된 LOW asset, 지원 수작업, blocking ambiguity 없음 | LOW | 게시 가능 |
| 비안전 미지원 작업이며 실행 가능한 text 단계가 있음 | LOW | owner reason이 있을 때만 게시 가능 |
| 차량 운전·차량 이동 작업 | HIGH | BLOCKED |
| 회전날·동력 기계·농약/화학물질·고소 작업 | HIGH | BLOCKED |
| 안전 맥락 부족 또는 safety ambiguity | UNKNOWN | BLOCKED |
| `ONION_TRANSPORT`의 수작업, 차량·동력 장비를 작동하거나 이동시키지 않는 경우만 | LOW | 다른 blocking gate가 없을 때만 가능 |

BE가 이 행렬과 interpretation으로 게시 결과를 계산한다. HIGH/UNKNOWN, safety ambiguity, invalid schema, 또는 executable step 없음은 override할 수 없다. HIGH asset은 기록할 수 있지만 publish하지 않는다. 안전표현은 verified `OFFICIAL_GUIDE` provenance가 없으면 publish하지 않는다.

현장 지시어만 있는 LOCATION 권고는 non-blocking이며 원문 위치를 유지한다. 위치 권고만 남은 LOW-risk 초안에서 농장주가 현장 설명 전달 버튼을 누르면 기존 `PUBLISH_AS_IS`·`IN_PERSON_BRIEFING` 감사를 남긴다. 실제 실행 장소 충돌의 blocking LOCATION, TASK/QUANTITY/SAFETY 및 나머지 게시 gate는 이 경로로 우회하지 않는다.
