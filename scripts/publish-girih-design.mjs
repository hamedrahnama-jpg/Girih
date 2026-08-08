import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'packages', 'girih-design');
const target = path.join(root, 'public', 'design');

await mkdir(target, { recursive: true });
await mkdir(path.join(target, 'icons'), { recursive: true });
await Promise.all([
  copyFile(path.join(source, 'theme.css'), path.join(target, 'theme.css')),
  copyFile(path.join(source, 'apps.json'), path.join(target, 'apps.json')),
  copyFile(path.join(source, 'brand.json'), path.join(target, 'brand.json')),
  copyFile(path.join(source, 'app-switcher.js'), path.join(target, 'app-switcher.js')),
  ...['girih.png', 'bricks.png', 'muqarnas.png', 'mehraz.png'].map((file) =>
    copyFile(path.join(source, 'icons', file), path.join(target, 'icons', file))),
]);
