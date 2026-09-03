import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupGuide, validateTranslationSegment } from '../lib/guide-translation.mjs';
import { AiRuntimeError, validateTranslation } from '../lib/contracts.mjs';

const verified = {
  canonical_ko: '양파를 수확하세요',
  phrase_key: 'ONION_HARVEST',
  language_code: 'vi',
  translated_text: 'Hãy thu hoạch hành tây.',
  source_name: 'guide.pdf',
  source_page: '7',
  source_url: 'https://example.test/guide.pdf',
  license: '공공누리',
  verified: 'true',
};

test('returns official HIT only for exact normalized canonical text and complete evidence', () => {
  const result = lookupGuide('  양파를   수확하세요 ', 'vi', 'ACTION', [verified]);

  assert.equal(result.status, 'HIT');
  assert.deepEqual(result.segment, {
    segment: 'ACTION',
    language_code: 'vi',
    text: 'Hãy thu hoạch hành tây.',
    source: 'OFFICIAL_GUIDE',
    guide_lookup: 'HIT',
    phrase_key: 'ONION_HARVEST',
    verified: true,
    source_page: 7,
    source_url: 'https://example.test/guide.pdf',
    license: '공공누리',
    schema_version: '1',
    contract_version: 'translation-v1',
  });
});

test('unverified and incomplete rows become general AI translation requests', () => {
  const result = lookupGuide('양파를 수확하세요', 'ne', 'ACTION', [{
    ...verified,
    language_code: 'ne',
    verified: 'false',
  }]);

  assert.equal(result.status, 'MISS');
  assert.equal(result.blocked, false);
  assert.deepEqual(result.request, {
    segment: 'ACTION',
    language_code: 'ne',
    source_text: '양파를 수확하세요',
    source: 'AI_TRANSLATION',
    guide_lookup: 'MISS',
    phrase_key: null,
    verified: false,
  });
});

test('safety MISS is blocking and cannot create an AI translation request', () => {
  const result = lookupGuide('안전 문구', 'vi', 'SAFETY', []);

  assert.deepEqual(result, {
    status: 'MISS',
    blocked: true,
    request: null,
  });
});

test('rejects non-HTTP official source URLs', () => {
  const row = { ...verified, source_url: 'data:text/plain,not-a-guide' };
  assert.equal(lookupGuide('양파를 수확하세요', 'vi', 'ACTION', [row]).status, 'MISS');

  const segment = {
    segment: 'ACTION',
    language_code: 'vi',
    text: 'Hãy thu hoạch hành tây.',
    source: 'OFFICIAL_GUIDE',
    guide_lookup: 'HIT',
    phrase_key: 'ONION_HARVEST',
    verified: true,
    source_page: 7,
    source_url: row.source_url,
    license: '공공누리',
    schema_version: '1',
    contract_version: 'translation-v1',
  };
  assert.throws(() => validateTranslationSegment(segment), /source_url/);
  assert.throws(
    () => validateTranslation(segment),
    (error) => error instanceof AiRuntimeError && error.code === 'SCHEMA_INVALID',
  );
});

test('rejects non-P0 languages and validates translation-v1 provenance variants', () => {
  assert.throws(() => lookupGuide('양파를 수확하세요', 'en', 'ACTION', []), /language_code/);
  assert.throws(() => validateTranslationSegment({
    segment: 'SAFETY',
    language_code: 'vi',
    text: '안전',
    source: 'AI_TRANSLATION',
    guide_lookup: 'MISS',
    phrase_key: null,
    verified: false,
    source_page: null,
    source_url: null,
    license: null,
    schema_version: '1',
    contract_version: 'translation-v1',
  }), /SAFETY/);
  assert.doesNotThrow(() => validateTranslationSegment({
    segment: 'ACTION',
    language_code: 'vi',
    text: 'Thu hoạch hành.',
    source: 'AI_TRANSLATION',
    guide_lookup: 'MISS',
    phrase_key: null,
    verified: false,
    source_page: null,
    source_url: null,
    license: null,
    schema_version: '1',
    contract_version: 'translation-v1',
  }));
});
