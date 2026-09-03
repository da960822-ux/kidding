# 안전 정책 `safety-policy-v1`

이 정책은 AI가 위험을 추측해 낮추지 못하게 하는 publish gate다. BE는 AI extraction과 deterministic rule을 합친다. 하나라도 HIGH면 HIGH, HIGH 없이 하나라도 UNKNOWN이면 UNKNOWN, 모두 LOW일 때만 LOW다.

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
