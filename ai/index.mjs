import { readFile } from 'node:fs/promises';
import { createOpenAiProvider } from './lib/openai-provider.mjs';
import { validateStructureV2 } from './lib/structure-v2-contract.mjs';
import { buildWorkerPackagesV2 } from './lib/worker-briefing-v2.mjs';
import { matchVisualAsset } from './lib/visual-match.mjs';

const prompt = await readFile(new URL('./prompts/prompt-structure-005.md', import.meta.url), 'utf8');
const supplementPrompt = await readFile(new URL('./prompts/prompt-structure-supplement-002.md', import.meta.url), 'utf8');
const quantityPrompt = await readFile(new URL('./prompts/prompt-quantity-change-001.md', import.meta.url), 'utf8');
const structureSchema = JSON.parse(await readFile(new URL('../docs/schemas/structure-v2.schema.json', import.meta.url), 'utf8'));
const quantitySchema = JSON.parse(await readFile(new URL('../docs/schemas/quantity-change-v1.schema.json', import.meta.url), 'utf8'));

function assertStructure(value) {
  if (!validateStructureV2(value).ok) throw new TypeError('INVALID_STRUCTURE_V2');
  return value;
}

function assertPackageWork(work) {
  const { session_id, version, ...structure } = work ?? {};
  if (typeof session_id !== 'string' || !session_id || !Number.isInteger(version) || version < 1) throw new TypeError('INVALID_WORK_PACKAGE');
  assertStructure(structure);
}

export function createRuntime({ env = {}, providers = {} }) {
  const provider = Object.keys(providers).length ? providers : createOpenAiProvider({ env });
  return {
    async transcribeAudio(payload) {
      return provider.transcribe(payload);
    },
    async buildOwnerDraftV2({ transcript }) {
      return assertStructure(await provider.interpretStructureV2({ prompt, transcript, schema: structureSchema }));
    },
    async mergeSupplementV2({ structure, transcript }) {
      assertStructure(structure);
      return assertStructure(await provider.interpretStructureV2({ prompt: `${supplementPrompt}\n${JSON.stringify(structure)}`, transcript, schema: structureSchema }));
    },
    async parseQuantityChange({ transcript, expected_version }) {
      if (!Number.isInteger(expected_version) || expected_version < 1) throw new TypeError('INVALID_EXPECTED_VERSION');
      return provider.interpretQuantityChange({ prompt: quantityPrompt, transcript, expected_version, schema: quantitySchema });
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
