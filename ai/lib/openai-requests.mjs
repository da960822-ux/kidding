import { readFileSync } from 'node:fs';

const readSchema = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const structureSchema = readSchema('../../docs/schemas/structure-v1.schema.json');
const quantityChangeSchema = readSchema('../../docs/schemas/quantity-change-v1.schema.json');
const translationSchema = readSchema('../../docs/schemas/translation-v1.schema.json');
const structureParsingReference = readJson('../references/structure-parsing-v1.json');
const quantityChangePrompt = readFileSync(new URL('../prompts/prompt-quantity-change-002.md', import.meta.url), 'utf8');
const supplementPrompt = readFileSync(new URL('../prompts/prompt-structure-supplement-001.md', import.meta.url), 'utf8');
const translationPrompt = readFileSync(new URL('../prompts/prompt-translation-001.md', import.meta.url), 'utf8');
const model = () => process.env.OPENAI_MODEL || 'gpt-5.6-terra';
const untrustedTranscript = (transcript) => `<untrusted_transcript>\n${JSON.stringify(String(transcript)).replaceAll('<', '\\u003c')}\n</untrusted_transcript>`;
const safeJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');
const structurePrompt = `${readFileSync(new URL('../prompts/prompt-structure-004.md', import.meta.url), 'utf8')}\n\n<trusted_structure_parsing_reference>\n${safeJson(structureParsingReference)}\n</trusted_structure_parsing_reference>`;
const UNSUPPORTED_KEYS = new Set(['$schema', '$id', 'title', 'allOf', 'not', 'if', 'then', 'else']);
const schemaType = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

export function toOpenAiStructuredOutputSchema(value) {
  if (Array.isArray(value)) return value.map(toOpenAiStructuredOutputSchema);
  if (value === null || typeof value !== 'object') return value;
  const adapted = {};
  for (const [key, child] of Object.entries(value)) {
    if (UNSUPPORTED_KEYS.has(key)) continue;
    if (key === 'oneOf') {
      const variants = child.map(toOpenAiStructuredOutputSchema);
      if (variants.every((variant) => 'type' in variant || 'anyOf' in variant || '$ref' in variant)) adapted.anyOf = variants;
      continue;
    }
    adapted[key] = toOpenAiStructuredOutputSchema(child);
  }
  if (!('type' in adapted) && ('const' in adapted || 'enum' in adapted)) {
    const values = 'const' in adapted ? [adapted.const] : adapted.enum;
    const types = [...new Set(values.map(schemaType))];
    adapted.type = types.length === 1 ? types[0] : types;
  }
  return adapted;
}

export function assertOpenAiStructuredOutputSchema(schema, path = '$') {
  if (Array.isArray(schema)) return schema.forEach((item, index) => assertOpenAiStructuredOutputSchema(item, `${path}[${index}]`));
  if (schema === null || typeof schema !== 'object') return;
  for (const key of UNSUPPORTED_KEYS) if (key in schema) throw new Error(`${path} has unsupported ${key}`);
  if ('oneOf' in schema) throw new Error(`${path} has unsupported oneOf`);
  if ('properties' in schema && schema.type !== 'object') throw new Error(`${path} object schema needs type: object`);
  if ('enum' in schema && !('type' in schema)) throw new Error(`${path} enum schema needs type`);
  if ('const' in schema && !('type' in schema)) throw new Error(`${path} const schema needs type`);
  Object.entries(schema).forEach(([key, child]) => assertOpenAiStructuredOutputSchema(child, `${path}.${key}`));
}

const buildRequest = (prompt, format, schema, content) => {
  const openAiSchema = toOpenAiStructuredOutputSchema(schema);
  assertOpenAiStructuredOutputSchema(openAiSchema);
  return {
    model: model(),
    input: [
      { role: 'developer', content: prompt },
      { role: 'user', content },
    ],
    text: { format: { type: 'json_schema', name: format, strict: true, schema: openAiSchema } },
    tools: [],
  };
};

export const buildStructureRequest = (transcript) =>
  buildRequest(structurePrompt, 'structure_v1', structureSchema, untrustedTranscript(transcript));

export const buildQuantityChangeRequest = (transcript, expectedVersion) =>
  buildRequest(
    quantityChangePrompt,
    'quantity_change_v1',
    quantityChangeSchema,
    `<trusted_context>\n${JSON.stringify({ expected_version: expectedVersion })}\n</trusted_context>\n${untrustedTranscript(transcript)}`,
  );

export const buildSupplementRequest = (baseTranscript, baseStructure, supplementTranscript) =>
  buildRequest(
    `${structurePrompt}\n\n${supplementPrompt}`,
    'structure_v1',
    structureSchema,
    `<previous_validated_structure>\n${safeJson(baseStructure)}\n</previous_validated_structure>\n<untrusted_original_transcript>\n${safeJson(String(baseTranscript))}\n</untrusted_original_transcript>\n<untrusted_supplement_transcript>\n${safeJson(String(supplementTranscript))}\n</untrusted_supplement_transcript>`,
  );

export function buildTranslationRequest(text, segment, languageCode) {
  if (!['vi', 'ne'].includes(languageCode)) throw new Error('translation language must be vi or ne');
  if (segment === 'SAFETY') throw new Error('SAFETY requires a verified official guide translation');
  if (['QUANTITY', 'ORDER'].includes(segment)) throw new Error(`${segment} translation is deterministic`);
  if (!['ACTION', 'LOCATION', 'OTHER'].includes(segment)) throw new Error('invalid translation segment');
  if (typeof text !== 'string' || !text.trim()) throw new Error('translation text is required');
  return buildRequest(
    translationPrompt,
    'translation_v1',
    translationSchema,
    `<trusted_context>\n${safeJson({ language_code: languageCode, segment })}\n</trusted_context>\n<untrusted_source_text>\n${safeJson(text)}\n</untrusted_source_text>`,
  );
}
