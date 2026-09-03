# 영상 자산

P0 영상은 AI가 사전 생성하고 사람이 검수한 정적 `public/videos` 파일만 사용한다.
`asset_manifest.csv`에 provenance, review_status, safety_level, reviewer,
captions_text를 기록한다. 아직 실제 검수 영상이 없으므로 manifest는 빈 양식이다.

`safety_level: HIGH` 또는 `review_status`가 `APPROVED`가 아닌 자산은 게시하지 않는다.
