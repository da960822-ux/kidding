import assert from 'node:assert/strict';
import test from 'node:test';

import { createBatmeoriAi } from '../index.mjs';

const structure = {
  interpretation: 'READY',
  summary_ko: '아랫밭 양파 20망을 캔다.',
  location: { raw_text: '아랫밭', kind: 'NAMED', canonical_name: '아랫밭' },
  task_family: 'ONION',
  quantity: { value: 20, unit: '망' },
  deadline: null,
  safety: [],
  notes: null,
  steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 캔다.', unsupported_reason: null }],
  ambiguities: [],
  schema_version: '1',
  contract_version: 'structure-v1',
};

const completed = (value) => ({ status: 'completed', output_text: JSON.stringify(value) });

test('facade runs owner, supplement, quantity, and selected-language worker AI flows', async () => {
  const transcripts = ['아랫밭 양파 스무 망 캐라', '오늘 안에', '열다섯 망으로 바꿔'];
  const provider = {
    transcribe: async () => ({ text: transcripts.shift(), confidence: null }),
    respond: async (request) => {
      const name = request.text.format.name;
      if (name === 'structure_v1') return completed(structure);
      if (name === 'quantity_change_v1') return completed({
        interpretation: 'READY', quantity: { value: 15, unit: '망' }, expected_version: 1,
        ambiguities: [], schema_version: '1', contract_version: 'quantity-change-v1',
      });
      const content = request.input.at(-1).content;
      const language = content.includes('"language_code":"vi"') ? 'vi' : 'ne';
      const segment = content.match(/"segment":"([A-Z]+)"/)[1];
      return completed({
        segment, language_code: language, text: `${language} translated`, source: 'AI_TRANSLATION',
        guide_lookup: 'MISS', phrase_key: null, verified: false, source_page: null,
        source_url: null, license: null, schema_version: '1', contract_version: 'translation-v1',
      });
    },
    speak: async () => ({ audio: new Uint8Array([9]), model: 'gpt-4o-mini-tts', voice: 'alloy', response_format: 'mp3' }),
  };
  const ai = createBatmeoriAi({ provider, guideRows: [], visualRows: [] });

  const owner = await ai.ownerDraftFromAudio(new Uint8Array([1]));
  const supplement = await ai.supplementDraftFromAudio({
    baseTranscript: owner.transcript,
    baseStructure: owner.structure,
    audio: new Uint8Array([2]),
  });
  const quantity = await ai.quantityChangeFromAudio(new Uint8Array([3]), 1);
  const worker = await ai.workerBriefing(owner.structure, 'vi');

  assert.equal(owner.publishable, true);
  assert.match(supplement.transcript, /오늘 안에/);
  assert.equal(quantity.quantity.value, 15);
  assert.equal('transcript' in quantity, false);
  assert.equal(worker.language_code, 'vi');
  assert.equal(worker.tts.status, 'OK');
});

test('facade preserves safe audio filename and MIME metadata for transcription', async () => {
  let audioOptions;
  const ai = createBatmeoriAi({
    provider: {
      transcribe: async (_audio, options) => { audioOptions = options; return { text: '아랫밭 양파를 캐라' }; },
      respond: async () => completed(structure),
      speak: async () => ({ audio: new Uint8Array([1]) }),
    },
    guideRows: [],
    visualRows: [],
  });

  await ai.ownerDraftFromAudio(new Uint8Array([1]), { filename: 'recording.mp4', mimeType: 'audio/mp4' });

  assert.equal(audioOptions.filename, 'recording.mp4');
  assert.equal(audioOptions.mimeType, 'audio/mp4');
});
