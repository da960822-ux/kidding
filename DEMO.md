# 밭머리 3분 데모

## 준비

배포 URL, 농장주 PIN, AI 사전 생성·사람 검수된 LOW 양파 영상 6개, 언어별 source snapshot이 있는 검수 가이드 rows를 준비한다. [Safety Policy](docs/SAFETY_POLICY.md)를 확인한다. 원음·실명·비밀키는 공개하지 않는다.

## 시나리오

1. “저짝 양파 스무 망 캐갖고 다 허면 차에 실어서 창고로 옮겨”를 녹음한다.
2. transcript와 AI 구조화 결과를 확인한다. 양파 `task_code`와 수량 `20망`을 표시하고, `저짝`은 `raw_text`로 보존하되 `kind: DEICTIC`, `canonical_name: null`로 표시한다.
3. 한국어 요약 TTS를 듣고 `맞아, 전달`을 선택한다. 필요한 보완은 음성으로만 추가한다.
4. `CO_PRESENT`를 고르고 `vi`를 선택한다. owner PIN session의 owner 폰에서 단계별 검수 영상과 TTS briefing을 재생한다.
5. `REMOTE`도 고르고 `ne`를 선택한다. 두 번째 휴대폰에서 익명 24시간 링크를 열어 최신 `PUBLISHED` 작업을 확인한다.
6. 농장주가 “20망 말고 15망으로 해”를 녹음한다. 저장 없는 preview의 before/after와 `expected_version`을 확인하고 직접 확정한다.
7. 새 버전 `v2`를 publish한다. owner briefing과 기존 remote link를 각각 새로고침해 `15망`을 확인한다. 만료된 링크는 owner가 단일 링크 생성 API로 새 URL을 한 번만 전달한다.

모호한 입력이면 `확인이 필요한 지시` 배지와 owner choice를 보여준다. LOW 비안전 미지원 작업만 reason을 남겨 전달할 수 있다. safety ambiguity·HIGH·UNKNOWN 위험·schema invalid·빈 단계는 전달하지 않는다.

## 실패 시

영상·TTS·API가 실패하면 화면은 원인을 숨기지 않고 text fallback 또는 재시도 안내를 보여준다. 일반 모호함은 농장주가 결정하며, safety ambiguity·검수되지 않은 안전표현·HIGH/UNKNOWN 위험·schema invalid·빈 단계만 강하게 차단한다.

## 역할·인계

FE가 녹음/두 delivery branch 화면·fallback·모바일 리허설을 시연하고, BE가 인증·version·override·최신 resolve·배포를 보장하며, AI가 추측 없는 구조화·언어별 번역 provenance·영상 safety/review gate·평가 증거를 제공한다. FE가 두 branch의 3회 연속 E2E를 기록한다. 고정 fixture 사용 시 `DEMO FALLBACK` badge를 표시한다.
