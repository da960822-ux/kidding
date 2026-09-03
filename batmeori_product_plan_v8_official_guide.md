# 밭머리(Batmeori) 최종 기획안 v8
## 농식품부 공식 소통가이드 연계 + AI 작업 스토리보드

> **한 줄 정의**  
> 농장주의 전라도 사투리 구두지시를 AI가 실행 가능한 작업단계로 분해하고, 농식품부의 공식 농작업 용어·안전표현과 사전 생성·검수된 작업영상을 조립해 외국인 근로자에게 모국어 음성·영상 기반 작업 스토리보드로 전달하며, 명확한 지시 변경이 발생하면 최신 작업가이드를 다시 동기화하는 농촌형 AI 작업지시 시스템.

---

# 1. 문제 정의

밭머리가 해결하는 문제는 단순한 “번역 부족”이 아니다.

농장주는 현장에서 다음처럼 말한다.

> “저짝 양파 스무 망 캐갖고 다 허면 차에 실어서 창고로 옮겨. 장갑 꼭 끼고.”

이 한 문장에는:

- 장소
- 작업
- 수량
- 순서
- 이동
- 안전
- 완료조건

이 섞여 있다.

외국인 근로자는 단순 번역문만 받아서는 **실제로 무엇을 어떤 순서로 해야 하는지 다시 해석해야 한다.**

또 작업 중:

> “20망 말고 15망으로 해.”

처럼 지시가 바뀐다.

일반 번역기/메신저는 메시지를 추가하지만, 밭머리는 **현재 해야 할 작업 자체를 갱신한다.**

---

# 2. 제품 핵심 경험

## 입력

농장주:

> “저짝 양파 스무 망 캐갖고 다 허면 차에 실어서 창고로 옮겨.”

## AI 처리

```text
전라도 사투리 음성
↓
STT
↓
방언·농작업 문맥 정규화
↓
작업조건 + 작업단계 분해
↓
공식 농식품부 용어/안전표현 조회
↓
task_code 생성
↓
검수된 작업영상 자동 매칭
↓
근로자 모국어 조립
↓
TTS
```

## 결과

```text
오늘 작업

① 양파 수확
   ▶ 작업 영상

② 망에 담기
   총 20망
   ▶ 작업 영상

③ 차량에 싣기
   ▶ 작업 영상

④ 창고로 옮기기
   ▶ 작업 영상

⚠ 장갑을 착용하세요.

🔊 베트남어 / 네팔어
```

---

# 3. 정부 「우리 농장 소통가이드」의 역할

정부 가이드를 통째로 RAG에 넣지 않는다.

밭머리에서는 다음 두 부분만 사용한다.

## A. 농작업 실무단어·지시표현

역할:

> **공식 다국어 용어 사전**

예:

```text
사투리/현장표현
"캐갖고"
↓
밭머리 의미정규화
"수확"
↓
정부 가이드의 공식 표현 조회
↓
근로자 언어
```

## B. 농작업 안전수칙

역할:

> **안전 관련 자유번역을 줄이는 공식 표현 레이어**

예:

```text
농장주
"장갑 꼭 끼고 해."
↓
SAFETY_GLOVE
↓
정부 가이드 안전표현 조회
↓
공식 번역 우선
```

---

# 4. 가이드에서 필요한 부분만 가져오는 방법

## 4.1 원본

8개 언어 PDF:

- 베트남
- 필리핀
- 라오스
- 네팔
- 미얀마
- 캄보디아
- 태국
- 몽골

## 4.2 추출 범위

PDF 전체를 사용하지 않는다.

다음 섹션만 추출:

```text
③ 농작업 실무단어 / 지시표현
④ 농작업 안전수칙
```

제외:

```text
① 상호존중
② 기초회화
```

MVP에서 필요하면 이후 추가한다.

---

# 5. 추출 방법 — OCR보다 수동 정형화 권장

자료가 약 10쪽 규모이므로 자동 OCR보다 **사람이 공식 표현을 그대로 복사해 CSV로 정리하는 방식이 더 안전하다.**

특히 네팔어·베트남어 등 외국어는 OCR 오류가 생기면 “정부 공식 표현”이라는 의미가 사라진다.

## 절차

### STEP 1
각 언어 PDF에서 `농작업 실무단어`와 `안전수칙` 페이지만 연다.

### STEP 2
한국어 표현을 기준 Key로 잡는다.

예:

```text
수확하다
담다
옮기다
장갑을 착용하세요
조심하세요
```

### STEP 3
각 언어 PDF의 공식 번역을 같은 Key에 연결한다.

### STEP 4
CSV에 source_page / source_url / license까지 기록한다.

### STEP 5
검수 후 DB에 import한다.

---

# 6. 권장 DB 구조

## 6.1 guide_phrases

정부 가이드의 “한국어 원문” 기준 테이블.

```text
id
category
canonical_ko
phrase_type
source_name
source_page
source_url
license
verified
```

category:

```text
WORK_TERM
WORK_INSTRUCTION
SAFETY
```

예:

```text
101
WORK_TERM
수확하다
TERM
우리 농장 소통가이드
7
...
공공누리 출처표시
true
```

---

## 6.2 guide_translations

언어별 번역.

```text
id
phrase_id
language_code
translated_text
verified
```

예:

```text
phrase_id = 101
language_code = vi
translated_text = [공식 베트남어 표현]
verified = true
```

### 장점

8개 언어를 컬럼으로 만드는 것보다:

```text
vi
ne
th
...
```

행으로 관리하므로 향후 언어 추가가 쉽다.

---

# 7. 밭머리 전체 DB

최소 권장 테이블:

## ① workers
기존 배치정보 연동용

```text
id
name
preferred_language
phone
```

## ② work_sessions
오늘 작업의 최신 상태

```text
id
location
task
quantity
deadline
safety
notes
current_version
status
```

## ③ work_steps
스토리보드 단계

```text
id
work_session_id
sequence
task_code
title
description
visual_asset_id
```

## ④ work_versions
작업 변경이력

```text
id
work_session_id
version
state_json
created_at
```

## ⑤ visual_assets
사전 생성·검수 작업영상

```text
id
task_code
asset_type
video_url
generator
prompt_version
review_status
safety_level
```

## ⑥ guide_phrases
정부 공식 한국어 표현

## ⑦ guide_translations
정부 공식 다국어 표현

## ⑧ worker_links
근로자 개인 작업 링크

```text
id
worker_id
work_session_id
token
expires_at
```

### MVP 기준
핵심은:

```text
work_sessions
work_steps
visual_assets
guide_phrases
guide_translations
```

5개.

workers / worker_links / work_versions는 시연 범위에 따라 추가한다.

---

# 8. AI Runtime 로직

농장주:

> “양파 캐갖고 망에 담고 차에 실어.”

## 8.1 의미 구조화

```json
{
  "task_steps": [
    {
      "task_code": "ONION_HARVEST",
      "canonical_action": "수확"
    },
    {
      "task_code": "BAGGING",
      "canonical_action": "담기"
    },
    {
      "task_code": "LOADING",
      "canonical_action": "상차"
    }
  ]
}
```

---

# 9. 번역 선택 로직

각 작업단계마다:

```text
canonical 한국어 표현
↓
정부 guide_phrases 검색
```

## HIT

공식 표현이 있음:

```text
guide_translation 사용
source = OFFICIAL_GUIDE
```

## MISS

공식 표현이 없음:

```text
Qwen 번역
source = AI_TRANSLATION
```

즉:

> **공식표현 우선 → AI 번역 fallback**

구조다.

---

# 10. 안전표현은 더 엄격하게

```text
safety instruction
↓
정부 SAFETY DB 검색
```

## HIT
공식 번역 사용.

## MISS

MVP에서는:

```text
AI 자유 번역
+
unverified 표시
```

또는 고위험 안전표현이면:

```text
자동 확정 금지
```

### 발표 원칙

> “농식품부 공식 안전표현이 존재하는 경우 LLM 자유번역보다 공식 표현을 우선합니다.”

---

# 11. 영상 자산 구조

영상은 모두 사전에 제작한다.

AI 생성 영상 허용.

## 사전 플로우

```text
양파 ontology 정의
↓
task_code 확정
↓
AI 영상 생성
↓
팀 검수
↓
재생성 필요 여부 판단
↓
최종 승인
↓
visual_assets 등록
```

### MVP 영상

```text
ONION_HARVEST
ONION_COLLECT
BAGGING
LOADING
WAREHOUSE_TRANSPORT
STACKING
```

---

# 12. 영상 메타데이터

```text
id
task_code
generator
prompt_version
generated_at
reviewer
review_status
purpose
safety_level
video_url
```

단순 행동:

```text
safety_level = LOW
AI-generated allowed
```

전문/위험:

```text
safety_level = HIGH
MVP 제외 또는 검증자료 사용
```

---

# 13. 작업 스토리보드 생성

밭머리의 핵심 결과물.

```text
① 양파 수확
   canonical_action = 수확
   official translation = HIT
   visual = ONION_HARVEST.mp4

② 망에 담기
   canonical_action = 담기
   translation = AI fallback
   visual = BAGGING.mp4

③ 차량 상차
   canonical_action = 상차
   official translation = HIT/MISS
   visual = LOADING.mp4
```

---

# 14. 실제 농장주 UX

```text
밭머리 접속
↓
🎤 작업 지시
↓
평소 사투리
↓
AI Storyboard 생성
↓
AI가 한국어로 다시 읽어줌
↓
[맞아, 전달]
```

농장주는:

- 공식 용어 검색
- 영상 선택
- 번역 선택

을 하지 않는다.

---

# 15. 외국인 근로자 UX

## 현장

```text
농장주/반장 폰
↓
베트남어 브리핑
↓
영상 + TTS
```

## 떨어진 장소

```text
개인 작업링크
↓
로그인 없이 접속
↓
영상
↓
모국어 TTS
↓
다음 작업
```

---

# 16. Current Work State

농장주:

> “20망에서 15망으로 바꿔.”

밭머리:

```text
20 → 15
```

확인:

```text
[15망으로 변경]
```

Work State:

```text
v1 → v2
```

근로자는 항상:

```text
현재 15망
```

만 본다.

---

# 17. 정부가이드 + 밭머리 역할 구분

## 정부

```text
검증된 언어
검증된 농작업 표현
검증된 안전표현
```

## 밭머리

```text
오늘의 사투리 지시 이해
↓
작업단계 분해
↓
공식 표현 선택
↓
영상 선택
↓
AI 번역 보완
↓
Storyboard 조립
↓
최신 작업 유지
```

### 발표 문장

> **정부가 만든 소통가이드를 대체하는 것이 아니라, 검증된 표현을 오늘의 실제 작업지시에 자동으로 조립합니다.**

---

# 18. 심사기준 대응

## AI 필요성
AI가:
- 사투리 해석
- 작업분해
- task_code
- 모호함 판정
- 공식표현 HIT/MISS 결정에 필요한 의미 정규화
- fallback 번역

을 수행한다.

## 데이터·재현성

Repository:

```text
/data/government_guide/
  guide_phrases.csv
  guide_translations.csv
  README.md

/ontology/
  onion_task_codes.json

/assets/
  asset_manifest.csv
```

각 가이드 row에:

```text
source
page
license
```

기록.

## 책임 있는 AI

```text
공식 번역 우선
↓
AI fallback
```

으로 환각 위험 감소.

안전표현은 공식 DB 우선 사용.

---

# 19. 평가 실험

## Test A
일반 Qwen 자유번역

vs

공식 guide 우선 + Qwen fallback

평가:

```text
정부 공식 표현 일치율
농작업 용어 의미 보존
```

## Test B

STT → 바로 번역

vs

STT → 사투리 정규화 → 작업구조화 → 공식 표현

평가:

- 작업단계 정확도
- task_code 정확도
- 최종 지시 의미 보존

---

# 20. 해커톤 P0

1. 농장주 음성
2. STT
3. 사투리/작업 구조화
4. task_steps
5. guide_phrases lookup
6. official translation 우선
7. Qwen fallback
8. 영상 자동매칭
9. Storyboard
10. TTS
11. 근로자 화면
12. 20망→15망 변경

---

# 21. P1

- 전체 8개 언어 공식가이드 확장
- 기초회화 추가
- 질문 기능
- 실제 SMS
- 농협 배치정보 연동
- 마늘 Vertical

---

# 22. 이번 해커톤의 가장 현실적인 데이터 범위

시간이 부족하면:

### 반드시
- 베트남어
- 네팔어

2개 언어의:
- 실무단어/지시표현
- 안전수칙

만 먼저 정형화.

### 발표

> “공식 가이드는 8개 언어로 동일 구조 확장이 가능하며, MVP는 전남 현장 우선순위를 고려해 베트남어·네팔어를 구현했습니다.”

---

# 23. 최종 제품 정의

> **밭머리는 전라도 농장주의 구두지시를 AI가 작업 스토리보드로 구조화하고, 농식품부 공식 소통가이드의 검증된 농작업·안전표현과 사전에 생성·검수된 작업영상을 자동 조립해 외국인 근로자에게 모국어 영상·음성 작업가이드로 전달하며, 변경된 지시는 항상 하나의 최신 작업상태로 동기화하는 농촌형 AI 작업지시 시스템이다.**
