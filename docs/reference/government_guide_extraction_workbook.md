# 정부 가이드 번역 추출 체크리스트

P0는 베트남어(`vi`)·네팔어(`ne`)의 농작업 표현과 안전수칙만 사람이 원본 PDF와 대조해 CSV로 만든다. PDF 전체 RAG와 무검수 OCR은 하지 않는다.

## CSV

`ai/manifests/guide_phrases.csv`

```csv
phrase_key,category,canonical_ko,phrase_type
WORK_001,WORK_TERM,수확하다,TERM
SAFE_001,SAFETY,장갑을 착용하세요,INSTRUCTION
```

`ai/manifests/guide_translations.csv`

```csv
phrase_key,language_code,translated_text,source_name,source_page,source_url,license,verified
WORK_001,vi,[원문 그대로],[PDF 문서명],[실제 페이지],[직접 PDF URL],[확인한 라이선스],true
```

언어별 PDF·페이지가 다르므로 출처와 검수 상태는 `guide_translations` row가 소유한다. `(phrase_key, language_code)`는 unique다. 대괄호 예시는 placeholder이므로 import하지 않는다.

## 검수 게이트

- `category`: `WORK_TERM|WORK_INSTRUCTION|SAFETY`만 허용한다.
- PDF 문구는 줄바꿈 외에 고치지 않는다.
- `verified:true`는 사람이 해당 언어 PDF의 문구·페이지·URL·라이선스를 모두 대조한 경우만 허용한다.
- 보도자료나 검색 결과 URL을 번역 원문 URL로 대신하지 않는다.
- 출처 값이 하나라도 없으면 `OFFICIAL_GUIDE`로 게시하지 않는다.

## Runtime

```text
일반 작업표현: verified HIT → OFFICIAL_GUIDE
                MISS → AI_TRANSLATION + verified:false
수량·순서:      DETERMINISTIC
안전표현:        verified HIT → OFFICIAL_GUIDE
                MISS → 게시 차단
```

provider 이름은 계약에 넣지 않고 실행 metadata에만 기록한다. import 후 번역별 provenance가 `docs/schemas/translation-v1.schema.json`과 `docs/openapi.yaml`의 `SegmentTranslation`을 통과해야 한다.
