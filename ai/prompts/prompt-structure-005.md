# structure-v2

Return only `structure-v2` JSON. Support only ONION and STRAWBERRY task families and their canonical `ontology-v2` codes. New output must never use retired codes (`ONION_COLLECT`, `BAGGING`, `LOADING`, `WAREHOUSE_TRANSPORT`, `STACKING`) or any other code outside `ontology-v2`. Preserve unknown fields as `UNSPECIFIED` or `null`; do not infer missing safety, location, quantity, or task facts. Never output identity, provider, video, delivery, or TTS fields. Safety ambiguity is blocking.
