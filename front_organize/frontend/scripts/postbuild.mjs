import { cp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const version = Date.now().toString(36);

await Promise.all(['assets/app.js', 'assets/app.css'].map(async file => {
  await readFile(join(dist, file));
}));
await cp(join(root, 'public'), dist, { recursive: true, force: true });

const htmlPath = join(dist, 'index.html');
const html = await readFile(join(root, 'index.html'), 'utf8');
if (!html.includes('/src/main.tsx') || !html.includes('</head>')) throw new Error('HTML de entrada inválido.');
await writeFile(htmlPath, html
  .replace('/src/main.tsx', `/assets/app.js?v=${version}`)
  .replace('</head>', `<link rel="stylesheet" href="/assets/app.css?v=${version}" /></head>`));

const swPath = join(dist, 'sw.js');
const sw = await readFile(swPath, 'utf8');
if (!sw.includes('__BUILD_ID__')) throw new Error('Marcador da versão do Service Worker não encontrado.');
await writeFile(swPath, sw.replace('__BUILD_ID__', version));
