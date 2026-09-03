# P0 범위 변경 공지: 양파·딸기 8개 작업 코드

2026-09-03부터 P0는 **양파만**이 아니라 **양파·딸기 두 작물만** 지원한다. 전달 언어(`vi`, `ne`), 익명 24시간 WorkerLink, Asia/Seoul 당일 TodayWorkTeam, 수량 변경만 가능한 범위는 변하지 않는다.

## 확정 코드

| task_family | 작업 | task_code |
|---|---|---|
| `ONION` | 양파 수확 | `ONION_HARVEST` |
| `ONION` | 양파 손질 | `ONION_TRIMMING` |
| `ONION` | 양파 분류 | `ONION_SORTING` |
| `ONION` | 양파 운반 | `ONION_TRANSPORT` |
| `STRAWBERRY` | 딸기 수확 | `STRAWBERRY_HARVEST` |
| `STRAWBERRY` | 딸기 분류 | `STRAWBERRY_SORTING` |
| `STRAWBERRY` | 딸기 검수 | `STRAWBERRY_INSPECTION` |
| `STRAWBERRY` | 딸기 포장 | `STRAWBERRY_PACKING` |

## 팀별 반영 사항

- **모두:** 이전 `ONION_COLLECT`, `BAGGING`, `LOADING`, `WAREHOUSE_TRANSPORT`, `STACKING`은 더 이상 P0 코드가 아니다. 화면·fixture·API payload에 남기지 않는다.
- **AI:** structure prompt와 평가 세트는 두 작물과 8개 코드를 사용한다. output의 `task_family`와 non-null `task_code`가 맞지 않으면 invalid다. 새 영상은 AI 생성 provenance를 기록하고 사람 검수 전에는 `PENDING`이다.
- **BE:** JSON Schema, semantic allowlist, DB check constraint, publish RPC를 같은 8개 코드와 `ONION|STRAWBERRY`로 맞춘다. `task_family`/code 불일치는 `422 SCHEMA_INVALID`로 막는다.
- **FE:** union type, 아이콘, mock fixture, label을 8개 코드로 맞춘다. API가 반환한 code를 화면에서 자체 변환하거나 이전 코드로 추론하지 않는다.

## Legacy migration compatibility

위 retired-code 금지는 새 P0 write에만 적용한다. 기존 immutable WorkVersion과 연결 VisualAsset은 저장된 legacy code 그대로 계속 읽을 수 있어야 한다. migration은 이를 reset, delete, rewrite하거나 새 code로 silent remap하지 않는다. DB는 historical asset code를 보존하고, 새 `structure-v2`/`ontology-v2` publish만 current 8개 code와 family match를 적용한다. `structure-v1` version은 읽기 전용이다.

## 안전과 영상

`ONION_TRANSPORT`도 차량·동력 장비를 운전하거나 이동시키면 `HIGH`여서 게시할 수 없다. 새 8개 영상은 Storage 후보 파일일 뿐이며, `visual_assets`에서 `AI_GENERATED_PREGENERATED` + 사람 `APPROVED` + `LOW`가 모두 확인된 뒤에만 근로자에게 노출한다.

## 2026-09-03 반영 완료

- 8개 후보는 농장주(OWNER)가 사람 검수해 모두 `APPROVED`·`LOW`로 등록됐다.
- public Supabase Storage `visual-assets/p0/2026-09-03/` URL과 [`assets/asset_manifest.csv`](../assets/asset_manifest.csv)가 1:1로 대응한다.
- 생성 provider, prompt version, 생성 시각은 확인할 수 없어 `null`로 남겼다. `AI_GENERATED_PREGENERATED` provenance와 사람 검수·안전 gate는 유지한다.

## 반영 규칙

이 변경은 API·AI·DB 계약 변경이다. 프론트와 백엔드는 같은 브랜치의 최신 `docs/openapi.yaml`, `docs/schemas/structure-v2.schema.json`, `docs/schemas/worker-briefing-v2.schema.json`, DB migration을 함께 반영해야 한다. 구 코드와 새 코드를 조용히 매핑하는 호환 계층은 만들지 않는다.
