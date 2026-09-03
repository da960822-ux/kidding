import { readFile } from 'node:fs/promises';
import { parseAssetManifest, matchVisualAsset } from '../lib/visual-match.mjs';
import { TASK_CODES_BY_FAMILY } from '../lib/ontology-v2.mjs';

const allowEmpty = process.argv.includes('--allow-empty');
const file = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? new URL('../../assets/asset_manifest.csv', import.meta.url);
const assets = parseAssetManifest(await readFile(file, 'utf8'));
const codes = Object.values(TASK_CODES_BY_FAMILY).flat();
if (!assets.length && allowEmpty) process.exit(0);
for (const code of codes) {
  const current = assets.filter((asset) => matchVisualAsset([asset], code));
  if (current.length > 1) throw new Error(`DUPLICATE_CURRENT_APPROVED_LOW_VIDEO:${code}`);
  if (!current.length) throw new Error(`MISSING_CURRENT_APPROVED_LOW_VIDEO:${code}`);
}
for (const asset of assets) if (asset.checksum_md5 && !/^[a-f0-9]{32}$/i.test(asset.checksum_md5)) throw new Error(`INVALID_MD5:${asset.id}`);
