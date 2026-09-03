# 영상 자산

P0 영상은 AI가 사전 생성하고 사람이 검수한 worker delivery용 URL만 사용한다.
`asset_manifest.csv`에 provenance, review_status, safety_level, reviewer,
captions_text를 기록한다. 생성 provider·prompt version·생성 시각을 확인할 수 없으면
그 값은 비워 두며 지어내지 않는다.

private Storage 후보의 파일 매칭과 사람 검수 항목은
[`CANDIDATE_REVIEW.md`](CANDIDATE_REVIEW.md)에 기록한다. 사람 검수 전 후보는 `PENDING`이며
`asset_manifest.csv` 또는 `visual_assets`에 `APPROVED`로 옮기기 전에는 전달하지 않는다.

`safety_level: HIGH` 또는 `review_status`가 `APPROVED`가 아닌 자산은 게시하지 않는다.
