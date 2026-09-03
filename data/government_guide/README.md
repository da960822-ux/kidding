# 정부 가이드 데이터 수집 게이트

현재는 원문 PDF를 사람 눈으로 대조한 뒤 채울 빈 양식만 둔다.

- `guide_phrases.csv`: 한국어 표제어와 공식 출처 metadata
- `guide_translations.csv`: `vi`/`ne` 번역과 사람 검수 상태
- 빈 source/page/license 또는 `verified=false`인 row는 공식 가이드로 게시하지 않는다.
- 농식품부 보도자료 URL을 개별 번역의 출처로 가장하지 않는다.
