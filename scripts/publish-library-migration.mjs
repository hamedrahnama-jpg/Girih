import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'supabase/migrations/202607270001_shared_asset_library.sql');
const target = resolve(root, 'public/design/shared-asset-library-phase2.sql');

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log('Published /design/shared-asset-library-phase2.sql');
