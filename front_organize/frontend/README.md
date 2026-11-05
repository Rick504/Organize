# Frontend do Organize

Aplicação React/TypeScript e PWA. Consome a API por caminhos relativos `/api/*`; não contém banco, senhas ou chaves do servidor.

## Desenvolvimento

Em outro terminal, inicie o backend conforme [backend_organize/README.md](../../backend_organize/README.md). Depois:

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize\front_organize\frontend'
npm.cmd ci
npm.cmd run dev
```

Abra `http://localhost:5173`. O Vite encaminha `/api/*` para `http://127.0.0.1:3001`. Se a API estiver em outra porta, defina `ORGANIZE_API_PROXY_TARGET` antes de iniciar o Vite. O backend deve ter `ORGANIZE_PUBLIC_ORIGIN=http://localhost:5173` em `backend_organize/.env`.

```powershell
npm.cmd run build
npm.cmd run preview
```

O build gera `front_organize/frontend/dist/`, inclusive manifesto e Service Worker. O preview abre em `http://localhost:4173`; para testar escritas nessa porta, defina `ORGANIZE_PUBLIC_ORIGIN=http://localhost:4173` no backend.

## Vercel

Configure a **Root Directory** do projeto Vercel como `front_organize/frontend`, **Build Command** `npm run build` e **Output Directory** `dist`. Depois de obter o domínio HTTPS da API na Railway, execute na pasta `front_organize/frontend/`:

```powershell
node scripts/configure-vercel.mjs https://organize-production-b9ef.up.railway.app
```

O `vercel.json` deste repositório já está configurado com o domínio Railway acima. Revise e inclua o arquivo no Git antes do deploy pela Vercel. Configure no backend Railway `ORGANIZE_PUBLIC_ORIGIN=https://organize-gray.vercel.app`. Use a URL exata, sem barra final. O proxy é necessário para que a sessão por cookie permaneça na origem do frontend. Teste login, logout, criação de cartão, upload e eventos em tempo real no domínio publicado.

Em 24/10/2026, `https://organize-gray.vercel.app/` abriu, mas `/api/health` respondeu `NOT_FOUND`; o domínio Railway respondeu `Application not found`. Publique a estrutura nova em ambos os serviços e confirme o último deploy antes de testar login.

Se o domínio Railway mudar, execute novamente o comando com a URL nova e publique o `vercel.json` atualizado.
