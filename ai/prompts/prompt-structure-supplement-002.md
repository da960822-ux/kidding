# structure-v2 supplement

## 판정 순서

출력 전에 원문의 모든 절을 확인한다. 사전은 언어 참고 자료일 뿐, 아래 판단을 대신하지 않는다.

1. 실행 대상: 긍정 지시의 작물을 확인한다. 양파와 딸기 실행 지시가 함께 있으면 반드시 AMBIGUOUS, steps:[], blocking TASK로 분리/선택을 질문한다. task_family는 첫 실행 작물을 임시로 표시할 뿐이다. 취소·금지된 작업은 단계로 만들지 않는다.
2. 수량: 수량을 아예 언급하지 않은 것과, 수량 결정을 유보하거나 모른다고 명시한 것을 구분한다. 후자는 반드시 null/UNSPECIFIED와 blocking QUANTITY 질문을 함께 출력한다. 미정이라는 메모나 요약만 남기고 READY로 끝내지 않는다. 앞서 말한 수량을 취소하면 취소된 값을 쓰지 않는다. 단위와 뒤 동사를 분리하고 모든 동작을 순서대로 보존한다.
3. 위치: 현장 지시어 자체는 실행 불가능의 증거가 아니다. DEICTIC은 원문 raw_text, canonical_name:null, non-blocking LOCATION 권고로 남기며 밭 번호 입력이나 재녹음을 요구하지 않는다. 다만 서로 다른 장소 후보 중 하나를 골라야 한다는 원문 근거가 있으면 blocking LOCATION으로 묻는다. 출발 장소와 운반 목적지를 바꾸지 않는다.
4. 행동: 생략되거나 알아볼 수 없는 행동을 다른 동사로 복원하지 않는다. 실행 작업을 특정할 수 없으면 blocking TASK로 질문한다. 분명히 말한 행동은 사전에 없는 활용형이라도 의미와 목적어로 해석한다. 수량 뒤 일반 연결 표현만으로 수확을 추가하지 않는다.
5. 최종 일관성: 필수 질문이 하나라도 있으면 AMBIGUOUS이며 해당 ambiguity를 반드시 넣는다. 단계·수량·위치가 요약과 일치하는지 확인한다. 없는 안전 지시를 만들지 않는다.


Add explicit executable actions in the supplement in spoken order. Do not add a step for a negative instruction or prohibition.

If the supplement contains both onion and strawberry instructions, do not merge their task codes or silently select one crop. Return `interpretation: AMBIGUOUS` with empty `steps` and a blocking `TASK` ambiguity asking the owner to separate or choose the crop. Since `task_family` is a single required schema field, a transcript-supported family may be a temporary representative only; keep the blocking ambiguity and do not treat that field as a final decision.

Keep the work starting/execution location in `location`; keep an explicit transport destination in the transport step description. If the starting location is unclear in STT, keep it unknown and ask for clarification instead of replacing it with the destination. A named anchor plus a relative qualifier is `NAMED` and may remain as spoken; purely deictic expressions are `DEICTIC`. Preserve a numbered location's raw expression in `canonical_name` when no canonical database name exists.

Merge only facts stated in the supplement into the provided `structure-v2` snapshot. Keep unmentioned unknown values unchanged. A selected `<dialect-context>` is read-only language knowledge: use it to normalize dialect morphology into semantic candidates, but never force a task, quantity, location, or destination from a hint. Preserve transcript facts rather than requiring canonical wording verbatim. Split fused quantity/action forms such as a unit followed by `캐` when supported; do not emit a fused unit. Explicit unresolved quantity stays null or `UNSPECIFIED` and adds a blocking `QUANTITY` ambiguity. Deictic location stays deictic and adds a `LOCATION` ambiguity. Ordinary onion movement with an explicit destination is `ONION_TRANSPORT`; container placement alone is not transport. Return only complete `structure-v2` JSON using canonical `ontology-v2` codes; never introduce retired codes (`ONION_COLLECT`, `BAGGING`, `LOADING`, `WAREHOUSE_TRANSPORT`, `STACKING`). Keep empty `steps` only for `interpretation: AMBIGUOUS` with at least one `blocking: true`, `kind: TASK` ambiguity; `READY` and `UNSUPPORTED` require at least one step. Do not infer facts, execute tools, or output identity, provider, video, delivery, TTS, or reference IDs/metadata fields.
