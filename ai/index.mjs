import { readFile } from 'node:fs/promises';
import { createOpenAiProvider } from './lib/openai-provider.mjs';
import { validateStructureV2 } from './lib/structure-v2-contract.mjs';
import { buildWorkerPackagesV2 } from './lib/worker-briefing-v2.mjs';
import { matchVisualAsset } from './lib/visual-match.mjs';
import { loadDialectReferenceDocument, renderDialectContext, selectDialectContext } from './lib/dialect-reference.mjs';

const prompt = await readFile(new URL('./prompts/prompt-structure-005.md', import.meta.url), 'utf8');
const transcriptionPrompt = await readFile(new URL('./prompts/prompt-transcription-002.md', import.meta.url), 'utf8');
const transcriptionReviewPrompt = await readFile(new URL('./prompts/prompt-transcription-review-001.md', import.meta.url), 'utf8');
const supplementPrompt = await readFile(new URL('./prompts/prompt-structure-supplement-002.md', import.meta.url), 'utf8');
const quantityPrompt = await readFile(new URL('./prompts/prompt-quantity-change-001.md', import.meta.url), 'utf8');
const structureSchema = JSON.parse(await readFile(new URL('../docs/schemas/structure-v2.schema.json', import.meta.url), 'utf8'));
const quantitySchema = JSON.parse(await readFile(new URL('../docs/schemas/quantity-change-v1.schema.json', import.meta.url), 'utf8'));
const dialectReferenceDocument = await loadDialectReferenceDocument(new URL('./references/dialect-v2.json', import.meta.url));

function assertStructure(value) {
  const validation = validateStructureV2(value);
  if (!validation.ok) throw new TypeError(`INVALID_STRUCTURE_V2_${validation.code}`);
  return value;
}

function assertPackageWork(work) {
  const { session_id, version, ...structure } = work ?? {};
  if (typeof session_id !== 'string' || !session_id || !Number.isInteger(version) || version < 1) throw new TypeError('INVALID_WORK_PACKAGE');
  assertStructure(structure);
}

export function createRuntime({ env = {}, providers = {}, dialectReference = dialectReferenceDocument }) {
  const provider = Object.keys(providers).length ? providers : createOpenAiProvider({ env, transcriptionPrompt, transcriptionReviewPrompt });
  const dialectPrompt = (basePrompt, transcript) => `${basePrompt}\n${renderDialectContext(dialectReference === null ? null : selectDialectContext(transcript, dialectReference))}`;
  return {
    async transcribeAudio(payload) {
      return provider.transcribe(payload);
    },
    async buildOwnerDraftV2({ transcript }) {
      return assertStructure(await provider.interpretStructureV2({ prompt: dialectPrompt(prompt, transcript), transcript, schema: structureSchema }));
    },
    async mergeSupplementV2({ structure, transcript }) {
      assertStructure(structure);
      return assertStructure(await provider.interpretStructureV2({ prompt: `${dialectPrompt(supplementPrompt, transcript)}\n${JSON.stringify(structure)}`, transcript, schema: structureSchema }));
    },
    async parseQuantityChange({ transcript, expected_version }) {
      if (!Number.isInteger(expected_version) || expected_version < 1) throw new TypeError('INVALID_EXPECTED_VERSION');
      return provider.interpretQuantityChange({ prompt: dialectPrompt(quantityPrompt, transcript), transcript, expected_version, schema: quantitySchema });
    },
    async buildWorkerPackagesV2({ work, languages, assets = [], guides = [] }) {
      assertPackageWork(work);
      return buildWorkerPackagesV2(work, languages, {
        translate: provider.translate,
        synthesize: provider.synthesize ?? (async () => ({ status: 'FALLBACK', audio_url: null })),
        matchVisualAsset: (taskCode) => matchVisualAsset(assets, taskCode),
        guideLookup: ({ languageCode, canonical_ko }) => guides.find((guide) => guide.canonical_ko === canonical_ko && guide.language_code === languageCode && guide.verified === true) ?? null,
      });
    }
  };
}
