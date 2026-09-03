# P0 영상 후보 사람 검수표

이 표는 private Supabase Storage bucket `video-candidates/2026-09-03/`의 후보를
P0 task code에 연결한다. 농장주(OWNER)가 `2026-09-03T19:06:22+09:00`에 8개를
직접 검수하고 모두 `LOW`로 승인했다. 이 문서는 `visual_assets` 등록 전 검수 근거다.

| task_code | 후보 Storage object | 파일 MD5 | 사람 검수 결과 |
|---|---|---|---|
| `ONION_HARVEST` | `KakaoTalk_20260903_161121750.mp4` | `b9b4411591b4fd40d5caae6790559572` | `APPROVED` · `LOW` · OWNER |
| `ONION_TRIMMING` | `KakaoTalk_20260903_161125326.mp4` | `bdfab68ed27aa4a596ee1b989ea736c9` | `APPROVED` · `LOW` · OWNER |
| `ONION_SORTING` | `KakaoTalk_20260903_163220219.mp4` | `958b60d319a5e6a911ac2f0da0921632` | `APPROVED` · `LOW` · OWNER |
| `ONION_TRANSPORT` | `KakaoTalk_20260903_163223929.mp4` | `9a28ead59501382dfdba502164dc1dcf` | `APPROVED` · `LOW` · OWNER |
| `STRAWBERRY_HARVEST` | `KakaoTalk_20260903_172727506.mp4` | `c266ddf8304356b7068e402d41c30cde` | `APPROVED` · `LOW` · OWNER |
| `STRAWBERRY_SORTING` | `KakaoTalk_20260903_172718390.mp4` | `669ccdfb86be20cdf631a14a8cd6e7d2` | `APPROVED` · `LOW` · OWNER |
| `STRAWBERRY_INSPECTION` | `KakaoTalk_20260903_172724533.mp4` | `1c58d67d7434e30d995f7e03960b1d62` | `APPROVED` · `LOW` · OWNER |
| `STRAWBERRY_PACKING` | `KakaoTalk_20260903_172721458.mp4` | `d8df9ffc66627fde2c694ec30caa9cbd` | `APPROVED` · `LOW` · OWNER |

## `APPROVED` 전 필수 기록

각 영상을 끝까지 본 사람이 다음을 기록한다.

1. reviewer와 검수 시각
2. `LOW` 또는 `HIGH` safety level
3. worker가 읽을 자막
4. 확인 가능한 생성 provider, prompt version, 생성 시각 (모르면 `null`)
5. worker delivery용 공개 URL

`HIGH` 또는 검수 불가 후보는 `REJECTED` 또는 `PENDING`으로 남긴다. 이 문서의 파일 이름만으로
`APPROVED`나 `LOW`를 선언하지 않으며, 이번 승인 근거는 농장주의 명시적 검수 확인이다.
