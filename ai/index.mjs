import { readFile } from 'node:fs/promises';
import { createOpenAiProvider } from './lib/openai-provider.mjs';
import { validateStructureV2 } from './lib/structure-v2-contract.mjs';
import { buildWorkerPackagesV2, guideFor } from './lib/worker-briefing-v2.mjs';
import { matchVisualAsset } from './lib/visual-match.mjs';
import { loadDialectReferenceDocument, renderDialectContext, selectDialectContext } from './lib/dialect-reference.mjs';
import { guardQuantitySource } from './lib/quantity-source.mjs';

const prompt = await readFile(new URL('./prompts/prompt-structure-005.md', import.meta.url), 'utf8');
const transcriptionPrompt = await readFile(new URL('./prompts/prompt-transcription-002.md', import.meta.url), 'utf8');
const transcriptionReviewPrompt = await readFile(new URL('./prompts/prompt-transcription-review-001.md', import.meta.url), 'utf8');
const supplementPrompt = await readFile(new URL('./prompts/prompt-structure-supplement-002.md', import.meta.url), 'utf8');
const quantityPrompt = await readFile(new URL('./prompts/prompt-quantity-change-001.md', import.meta.url), 'utf8');
const structureSchema = JSON.parse(await readFile(new URL('../docs/schemas/structure-v2.schema.json', import.meta.url), 'utf8'));
const quantitySchema = JSON.parse(await readFile(new URL('../docs/schemas/quantity-change-v1.schema.json', import.meta.url), 'utf8'));
const dialectReferenceDocument = await loadDialectReferenceDocument(new URL('./references/dialect-v2.json', import.meta.url));
const agricultureTerms = JSON.parse(await readFile(new URL('./references/agriculture-terms-v2.json', import.meta.url), 'utf8'));

function domainContext(text, glossary = []) {
  return agricultureTerms.entries.filter((entry) => text.includes(entry.term) && !glossary.some((guide) => guide.canonical_ko === entry.term))
    .map((entry) => ({ ...entry, verified: agricultureTerms.verified, review_status: agricultureTerms.review_status, provenance: agricultureTerms.provenance }));
}

function uniqueGuides(guides) {
  const grouped = new Map();
  for (const guide of guides) {
    const key = JSON.stringify([guide.canonical_ko, guide.category, guide.phrase_type, guide.language_code]);
    const previous = grouped.get(key);
    if (previous && previous.translated_text !== guide.translated_text) throw new TypeError('INVALID_GUIDE_TRANSLATION_CONFLICT');
    grouped.set(key, guide);
  }
  return [...grouped.values()];
}

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
  const dialectPrompt = (basePrompt, transcript) => `${basePrompt}\n${renderDialectContext(dialectReference === null ? null : selectDialectContext(transcript, dialectReference))}\n<agriculture-context>${JSON.stringify(domainContext(transcript))}</agriculture-context>`;
  return {
    async transcribeAudio(payload) {
      return provider.transcribe(payload);
    },
    async buildOwnerDraftV2({ transcript }) {
      return assertStructure(guardQuantitySource(assertStructure(await provider.interpretStructureV2({ prompt: dialectPrompt(prompt, transcript), transcript, schema: structureSchema })), transcript));
    },
    async mergeSupplementV2({ structure, transcript }) {
      assertStructure(structure);
      const merged = assertStructure(await provider.interpretStructureV2({ prompt: `${dialectPrompt(supplementPrompt, transcript)}\n${JSON.stringify(structure)}`, transcript, schema: structureSchema }));
      const quantityCorrection = /(?:수량|목표량?|총량)\s*[은는을를만]?\s*\d|(?:으로|로)\s*(?:바꿔|바꾸|변경|수정|맞춰|맞추)/u.test(transcript);
      if (!quantityCorrection && merged.quantity?.value === structure.quantity?.value && merged.quantity?.unit === structure.quantity?.unit) return merged;
      return assertStructure(guardQuantitySource(merged, transcript));
    },
    async parseQuantityChange({ transcript, expected_version }) {
      if (!Number.isInteger(expected_version) || expected_version < 1) throw new TypeError('INVALID_EXPECTED_VERSION');
      return guardQuantitySource(await provider.interpretQuantityChange({ prompt: dialectPrompt(quantityPrompt, transcript), transcript, expected_version, schema: quantitySchema }), transcript);
    },
    async buildWorkerPackagesV2({ work, languages, assets = [], guides = [] }) {
      assertPackageWork(work);
      return buildWorkerPackagesV2(work, languages, {
        translate: async (request) => {
          const glossary = uniqueGuides(guides.filter((guide) => guide.category === 'WORK_TERM' && guide.phrase_type === 'TERM'
            && guideFor(request.languageCode, guide) && typeof guide.canonical_ko === 'string' && guide.canonical_ko && request.text.includes(guide.canonical_ko)));
          return glossary.find((guide) => guide.canonical_ko === request.text)?.translated_text
            ?? provider.translate({ ...request, glossary, domainContext: domainContext(request.text, glossary), taskFamily: work.task_family });
        },
        synthesize: provider.synthesize ?? (async () => ({ status: 'FALLBACK', audio_url: null })),
        matchVisualAsset: (taskCode) => matchVisualAsset(assets, taskCode),
        guideLookup: ({ languageCode, canonical_ko, segment }) => uniqueGuides(guides.filter((guide) => guide.canonical_ko === canonical_ko
          && guide.category === (segment === 'SAFETY' ? 'SAFETY' : 'WORK_INSTRUCTION') && guide.phrase_type === 'INSTRUCTION' && guideFor(languageCode, guide)))[0] ?? null,
      });
    }
  };
}
