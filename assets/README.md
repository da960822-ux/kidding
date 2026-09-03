# 영상 자산

P0 영상은 AI가 사전 생성하고 사람이 검수한 정적 worker-delivery URL만 사용한다.
`asset_manifest.csv`는 release manifest 하나이며 8개 P0 task code별 current
`VIDEO`/`video/mp4`, provenance, review status, safety level, reviewer, captions,
reviewed timestamp, MD5 checksum을 기록한다. 모든 현재 row는 OWNER가 검수한
`APPROVED`/`LOW` 자산이다.

`safety_level: HIGH` 또는 `review_status`가 `APPROVED`가 아닌 자산은 게시하지 않는다.
검증 불일치나 runtime 조회 실패 시에는 text+TTS fallback을 사용한다.
