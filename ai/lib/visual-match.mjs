const REQUIRED_COLUMNS = ['id', 'task_code', 'asset_type', 'content_type', 'public_path', 'provenance', 'generator_provider', 'prompt_version', 'generated_at', 'reviewer', 'review_status', 'safety_level', 'purpose', 'captions_text', 'reviewed_at', 'checksum_md5', 'is_current'];

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { field += char; index += 1; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { fields.push(field); field = ''; } else field += char;
  }
  if (quoted) throw new TypeError('INVALID_ASSET_MANIFEST');
  fields.push(field);
  return fields;
}

export function parseAssetManifest(csv) {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return [];
  const columns = parseCsvLine(lines.shift());
  if (columns.join(',') !== REQUIRED_COLUMNS.join(',')) throw new TypeError('INVALID_ASSET_MANIFEST_HEADER');
  return lines.map((line) => {
    const values = parseCsvLine(line);
    if (values.length !== columns.length) throw new TypeError('INVALID_ASSET_MANIFEST');
    return Object.fromEntries(columns.map((column, index) => [column, values[index] === '' ? null : values[index]]));
  });
}

export function matchVisualAsset(assets, taskCode) {
  const matches = assets.filter((asset) => asset.task_code === taskCode && asset.asset_type === 'VIDEO' && asset.content_type === 'video/mp4' && asset.provenance === 'AI_GENERATED_PREGENERATED' && asset.review_status === 'APPROVED' && asset.safety_level === 'LOW' && (asset.is_current === true || asset.is_current === 'true'));
  if (matches.length > 1) throw new TypeError(`DUPLICATE_CURRENT_APPROVED_LOW_VIDEO:${taskCode}`);
  return matches[0] ?? null;
}
