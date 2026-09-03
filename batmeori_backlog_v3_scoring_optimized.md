# 밭머리 개발 백로그 v3 — 심사기준 최적화
## 실제 전달·배치 흐름 반영 / 인터넷 상시 사용 전제

> **Critical Loop**
```text
사투리 음성
→ 작업 구조화
→ 작업 스토리보드
→ 영상 자동매칭
→ today_assignment 기반 전달대상 확인
→ 근로자별 개인 링크/현장 브리핑
→ 모국어 + TTS + 영상
→ 명확한 변경
→ 최신 작업 동기화
```

---

# 1. P0 원칙

P0가 실제 배포 URL에서 끝까지 돌아가기 전에는:
- 질문 챗봇
- 관리자 통계
- 성과관리
- 추가 작물

을 시작하지 않는다.

---

# 2. 기반

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| A-01 | P0 | React/Vite/Tailwind | 모바일 렌더 |
| A-02 | P0 | FastAPI | `/health` 200 |
| A-03 | P0 | PostgreSQL/Supabase | WorkSession CRUD |
| A-04 | P0 | env/API key | 서버 전용 |
| A-05 | P0 | Vercel/Railway | Public HTTPS |

---

# 3. 농장주 음성

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| B-01 | P0 | Owner Home | 큰 음성 CTA |
| B-02 | P0 | MediaRecorder | Blob 생성 |
| B-03 | P0 | 녹음 UX | 시작/중지/재녹음 |
| B-04 | P0 | 음성 업로드 | multipart |
| B-05 | P0 | STT | transcript |

---

# 4. 사투리·작업 구조화

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| C-01 | P0 | 양파 task ontology | 코드 동결 |
| C-02 | P0 | JSON Schema | 5조건+notes+steps |
| C-03 | P0 | SOLAR prompt | 안정 JSON |
| C-04 | P0 | 전라도 few-shot | 대표 표현 처리 |
| C-05 | P0 | 모호함 판정 | clarify 반환 |
| C-06 | P0 | JSON validation | invalid reject |
| C-07 | P0 | AI 요약문 생성 | 농장주에게 자연어로 읽기 |

---

# 5. 농장주 확인 UX

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| D-01 | P0 | AI 요약 화면 | 1문장 요약 |
| D-02 | P0 | TTS 한국어 확인 | 요약 읽기 |
| D-03 | P0 | `맞아` CTA | Review 진입 |
| D-04 | P0 | `다시 말하기` | 재녹음 |
| D-05 | P0 | clarification 음성 | 한 질문씩 |
| D-06 | P0 | clarification merge | state 반영 |

---

# 6. 영상 자산

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| E-01 | P0 | 양파 영상 6개 코드 | 확정 |
| E-02 | P0 | AI 사전 생성 영상 제작·사람 검수 | MP4 6개+ 및 provenance/review_status |
| E-03 | P0 | 영상 압축 | 모바일 빠른 재생 |
| E-04 | P0 | `/public/videos` | URL 접근 |
| E-05 | P0 | task_code-video map | 자동 URL |
| E-06 | P0 | no-video fallback | text+TTS |

오프라인 캐시 기능은 MVP 범위에서 제외한다.

---

# 7. Storyboard

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| F-01 | P0 | Storyboard layout | 단계 흐름 |
| F-02 | P0 | 영상 썸네일 | step별 표시 |
| F-03 | P0 | 장소/수량/시간 요약 | 한눈에 확인 |
| F-04 | P0+ | 생성 애니메이션 | 순차 등장 |
| F-05 | P0 | Publish 상태 | PUBLISHED |

---

# 8. 번역/TTS

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| G-01 | P0 | step 번역 contract | language output |
| G-02 | P0 | 베트남어 | vi |
| G-03 | P0 | 네팔어 | ne |
| G-04 | P0 | TTS | 음성 재생 |
| G-05 | P0 | TTS fallback | 텍스트 유지 |

---

# 9. 오늘 배치 근로자 데이터

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| L-01 | P0 | Worker seed data | vi 2 + ne 1 이상 |
| L-02 | P0 | today_assignment model | WorkSession 대상 조회 |
| L-03 | P0 | preferred_language | worker별 자동언어 |
| L-04 | P2 | CSV/API import 설계 | 실서비스 문서화 |

### MVP 원칙
농장주용 근로자 등록화면은 개발하지 않는다.

---

# 10. 근로자 개인 링크

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| M-01 | P0 | signed/random token 생성 | worker link |
| M-02 | P0 | token-worker-work mapping | DB 저장 |
| M-03 | P0 | `/w/:token` route | 로그인 없이 접근 |
| M-04 | P0 | 자동 language resolve | vi/ne 자동 |
| M-05 | P0 | 만료/invalid UX | 오류 안내 |
| M-06 | P1 | 실제 SMS API | 문자 발송 |
| M-07 | P1 | Web Share/메신저 공유 | 공유 UI |

### Hackathon
실제 SMS보다 **개인화 링크 생성 및 두 번째 휴대폰 접속**을 우선한다.

---

# 11. 현장 단체 브리핑

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| N-01 | P0 | `/brief?lang=` 화면 | vi/ne |
| N-02 | P0 | 전체화면 영상 | 시연 가능 |
| N-03 | P0 | 단계별 TTS | 함께 듣기 |
| N-04 | P0 | 다음 단계 | 순차 진행 |

---

# 12. 근로자 화면

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| H-01 | P0 | W-01 최신 작업 요약 | latest state |
| H-02 | P0 | W-02 단계별 화면 | video 50%+ |
| H-03 | P0 | HTML5 video | 재생 |
| H-04 | P0 | 이전/다음 | 순서 이동 |
| H-05 | P0 | step TTS | preferred language |
| H-06 | P0 | video fallback | text+TTS |

---

# 13. Current Work State / 변경

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| I-01 | P0 | version model | v1/v2 |
| I-02 | P0 | 변경 음성 | 제출 |
| I-03 | P0 | quantity 변경 파싱 | 20→15 |
| I-04 | P0 | 변경 확인 | before/after |
| I-05 | P0 | confirm API | v2 저장 |
| I-06 | P0 | 번역 재생성 | 최신 수량 |
| I-07 | P0 | worker latest refresh | 15망 |
| I-08 | P0 | 변경 알림 | 현재값만 표시 |
| I-09 | P0+ | 모호한 변경 재질문 | 자동변경 금지 |

P0는 quantity만 완벽히 지원.

---

# 14. 검증

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| J-01 | P0 | 사투리 지시 10건 | 구조화 평가 |
| J-02 | P0 | 누락 5건 | 재질문 |
| J-03 | P0 | task_code 매칭 | 영상 일치 |
| J-04 | P0 | 번역 vi/ne 확인 | 의미 보존 |
| J-05 | P0 | 개인 링크 E2E | 두 번째 폰 |
| J-06 | P0 | 단체 브리핑 E2E | vi/ne |
| J-07 | P0 | 변경 E2E | 20→15 |
| J-08 | P0 | 전체 Demo E2E | 3회 연속 |

---

# 15. 배포

| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| K-01 | P0 | Vercel | Front HTTPS |
| K-02 | P0 | Railway | API HTTPS |
| K-03 | P0 | CORS/env | 호출 PASS |
| K-04 | P0 | Android Chrome | 실기기 PASS |
| K-05 | P0 | 영상 용량 최적화 | 재생 지연 최소 |
| K-06 | P0 | Demo fallback | API 장애 대비 |
| K-07 | P0 | 3분 리허설 | 3회 성공 |

인터넷 불안정/오프라인 캐시는 이번 해커톤 범위에서 고려하지 않는다.

---

# 16. P1

- 실제 SMS 자동전송
- 근로자 음성 질문
- 질문 3분류
- 농장주 답변
- 변경이력
- 확인 상태

---

# 17. 하지 않을 것

- 농장주 근로자 등록 UI
- 숙련도/인력배치
- 출퇴근/급여
- ERP
- 고위험 영상 자동 게시
- 영상 분석
- 품질 이미지 분석
- 오프라인 캐시
- 전체 작물 지원
- 네이티브 앱
- 관리자 통계 대시보드

---

# 18. 최종 Critical Path

```text
음성
↓
STT
↓
사투리·작업 구조화
↓
농장주 음성 확인
↓
Storyboard + 영상
↓
today_assignment
↓
현장 브리핑 + 개인 링크
↓
worker 자동언어
↓
영상/TTS
↓
20망→15망
↓
근로자 최신화
↓
실기기 배포 시연
```

---

# 19. Definition of Done

실제 배포 URL과 휴대폰 2대로 다음을 3회 연속 성공:

1. 농장주 사투리 녹음
2. 4단계 Storyboard 생성
3. 영상 자동매칭
4. AI가 한국어 요약을 읽음
5. 농장주 `맞아, 전달`
6. 오늘 배치 worker 대상 생성
7. 베트남 근로자 개인 링크 접속
8. 언어선택 없이 베트남어 화면
9. 영상 + TTS 재생
10. 현장 단체 브리핑도 재생 가능
11. 농장주 `20망 → 15망`
12. 변경 확인
13. 근로자 링크 최신 상태 15망

---

# 20. 심사기준 대응 추가 백로그

## SCORE-A — 평가·실험 증거
| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| S-A01 | P0 | Evaluation dataset 20~30건 | JSONL |
| S-A02 | P0 | Baseline 실행 | 결과 CSV |
| S-A03 | P0 | 밭머리 Pipeline 실행 | 결과 CSV |
| S-A04 | P0 | 구조화/step/video 정확도 계산 | EVALUATION.md |
| S-A05 | P0 | Prompt v1/v2 비교 | EXPERIMENT_LOG |
| S-A06 | P0 | 모호함 5건 abstention 검증 | 임의확정 0건 목표 |

## SCORE-B — 데이터·라이선스·재현성
| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| S-B01 | P0 | asset_manifest.csv | 출처/라이선스 전부 기록 |
| S-B02 | P0 | DATA_LICENSE.md | 이용조건 |
| S-B03 | P0 | prompts 저장 | 버전 고정 |
| S-B04 | P0 | onion ontology 저장 | JSON |
| S-B05 | P0 | sample input/expected output | 재현 가능 |
| S-B06 | P0 | Provider 교체문서 | MODEL_SELECTION.md |
| S-B07 | P0 | 번역/TTS/asset 결과 캐시 | 중복호출 감소 |

## SCORE-C — 신뢰성/Fallback
| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| S-C01 | P0 | JSON Schema validation | invalid 차단 |
| S-C02 | P0 | LLM retry+오류 UI | PASS |
| S-C03 | P0 | STT 재녹음 | PASS |
| S-C04 | P0 | video fallback | text+TTS |
| S-C05 | P0 | TTS fallback | text |
| S-C06 | P0 | token error fallback | 브리핑 안내 |
| S-C07 | P0 | idempotency/version check | 중복변경 방지 |
| S-C08 | P0 | health/ready | 배포체크 |

## SCORE-D — 책임 있는 AI
| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| S-D01 | P0 | 공개데모 dummy only | 실정보 0 |
| S-D02 | P0 | 원음 삭제 | 코드/문서 |
| S-D03 | P0 | worker token expiry | 구현 |
| S-D04 | P0 | 위험 자동판단 금지 | prompt/schema |
| S-D05 | P0 | API key scan | key 0 |
| S-D06 | P0 | 라이선스 manifest review | 누락 0 |

## SCORE-E — 현장관찰/팀워크
| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| S-E01 | P0 | 역할분담 문서 | 명확 |
| S-E02 | P0 | TASK_BOARD | 담당/상태 |
| S-E03 | P0 | EXPERIMENT_LOG | 가설/결과 |
| S-E04 | P0 | DECISIONS | 변경기록 |
| S-E05 | P0 | CHANGELOG | 최신 |

## SCORE-F — 제출 리스크
| ID | P | 작업 | 완료조건 |
|---|---|---|---|
| S-F01 | P0 | 배포 URL 내부마감 | 공식마감 1시간 전 |
| S-F02 | P0 | 대체영상 | 무인증 URL |
| S-F03 | P0 | 필수 링크 접근체크 | 전부 PASS |
| S-F04 | P0 | 공개데모 개인정보/API key 검사 | 문제 0 |

# 21. 심사기준 기준 최종 DoD

### 제품
- [ ] 실제 음성→Worker E2E
- [ ] 사투리→4단계 Storyboard
- [ ] 영상 자동매칭
- [ ] 베트남어/네팔어 + TTS
- [ ] 개인 링크
- [ ] 20망→15망 최신화
- [ ] 모호한 변경 자동확정 금지

### 실험
- [ ] Baseline 비교
- [ ] 실제 평가표
- [ ] Prompt 개선 전후 증거

### 재현성
- [ ] prompts
- [ ] ontology
- [ ] test data
- [ ] asset manifest
- [ ] license docs

### 신뢰성
- [ ] retry/fallback
- [ ] health/ready
- [ ] 라이브 3회 연속 PASS

### 제출
- [ ] 배포 URL
- [ ] Git
- [ ] 발표자료
- [ ] 제출 DB
- [ ] 산출물
- [ ] 대체영상
