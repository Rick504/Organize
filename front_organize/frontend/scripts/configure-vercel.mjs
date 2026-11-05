import { writeFile } from 'node:fs/promises';

const input = process.argv[2];
if (!input) {
  console.error('Uso: node scripts/configure-vercel.mjs https://seu-backend.up.railway.app');
  process.exit(1);
}

let url;
try {
  url = new URL(input);
} catch {
  console.error('Informe uma URL HTTPS válida do backend Railway.');
  process.exit(1);
}
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
  console.error('Informe apenas a origem HTTPS, sem caminho, consulta ou credenciais.');
  process.exit(1);
}

const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  rewrites: [
    { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
    { source: '/(.*)', destination: '/index.html' }
  ]
};

await writeFile(new URL('../vercel.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
console.log(`front_organize/frontend/vercel.json configurado para ${url.origin}`);
