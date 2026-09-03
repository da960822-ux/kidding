import { createOpenAiProvider } from './lib/openai-provider.mjs';
import {
  buildOwnerDraft,
  interpretQuantityChange,
  interpretTranscript,
  mergeSupplement,
  transcribeAudio,
} from './lib/owner-runtime.mjs';
import { buildWorkerBriefing } from './lib/worker-briefing.mjs';

export { createOpenAiProvider } from './lib/openai-provider.mjs';
export { buildStructureRequest, buildSupplementRequest, buildQuantityChangeRequest, buildTranslationRequest } from './lib/openai-requests.mjs';
export { OpenAiTransportError, requestOpenAi } from './lib/openai-transport.mjs';
export { AiRuntimeError } from './lib/contracts.mjs';
export { preflightSafety } from './lib/safety.mjs';
export { lookupGuide, validateTranslationSegment } from './lib/guide-translation.mjs';
export { matchVisualAsset } from './lib/visual-match.mjs';
export { buildOwnerDraft, interpretQuantityChange, interpretTranscript, mergeSupplement, transcribeAudio } from './lib/owner-runtime.mjs';
export { buildWorkerBriefing, synthesizeSpeech } from './lib/worker-briefing.mjs';

export function createBatmeoriAi({
  provider = createOpenAiProvider(),
  guideRows,
  visualRows,
  guideReviewApproved = false,
} = {}) {
  const dependencies = {
    transcribe: provider.transcribe,
    respond: provider.respond,
  };
  return {
    ownerDraftFromAudio: (audio, audioOptions = {}) => buildOwnerDraft(audio, dependencies, audioOptions),
    async supplementDraftFromAudio({ baseTranscript, baseStructure, audio, audioOptions = {} }) {
      const supplement = await transcribeAudio(audio, dependencies, audioOptions);
      return mergeSupplement({ baseTranscript, baseStructure, supplementTranscript: supplement.transcript }, dependencies);
    },
    async quantityChangeFromAudio(audio, expectedVersion, audioOptions = {}) {
      const stt = await transcribeAudio(audio, dependencies, audioOptions);
      return interpretQuantityChange(stt.transcript, expectedVersion, dependencies);
    },
    workerBriefing: (structure, languageCode) => buildWorkerBriefing(structure, languageCode, {
      respond: provider.respond,
      speak: provider.speak,
      ...(guideRows === undefined ? {} : { guideRows }),
      ...(visualRows === undefined ? {} : { visualRows }),
      guideReviewApproved,
    }),
  };
}
