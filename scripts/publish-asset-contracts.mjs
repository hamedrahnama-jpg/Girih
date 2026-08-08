import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ASSET_CONTRACT_MANIFEST } from '../packages/asset-contracts/manifest.js';

const targetDirectory = resolve('public/design');
await mkdir(targetDirectory, { recursive: true });
await writeFile(
  resolve(targetDirectory, 'asset-contracts.v1.json'),
  `${JSON.stringify(ASSET_CONTRACT_MANIFEST, null, 2)}\n`,
  'utf8',
);
console.log('Published /design/asset-contracts.v1.json');
