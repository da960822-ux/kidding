import { TASK_CODES } from '../scripts/validate-manifests.mjs';

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const eligible = (row) => row
  && row.review_status === 'APPROVED'
  && row.safety_level === 'LOW'
  && row.provenance === 'AI_GENERATED_PREGENERATED'
  && /^video\//.test(row.asset_type)
  && ['id', 'asset_type', 'public_path', 'reviewer', 'captions_text'].every((key) => nonEmpty(row[key]));

export function matchVisualAsset(taskCode, rows) {
  if (!TASK_CODES.includes(taskCode)) throw new Error('task_code is not allowlisted');
  if (!Array.isArray(rows)) throw new Error('visual rows must be an array');
  return rows.find((row) => row.task_code === taskCode && eligible(row)) ?? null;
}
