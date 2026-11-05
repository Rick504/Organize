# Publicar o Organize: Railway + Vercel

O repositório contém dois projetos independentes. A Railway executa somente `backend_organize/`; a Vercel publica somente `front_organize/frontend/`. O banco SQLite e os anexos ficam no volume da Railway.

## 1. Valide localmente

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize\backend_organize'
npm.cmd ci
npm.cmd run check
npm.cmd test
cd ..\front_organize\frontend
npm.cmd ci
npm.cmd run build
```

No PowerShell, `npm.cmd` evita o bloqueio de `npm.ps1` pela política de execução. Node.js 24 é necessário.

## 2. Backend na Railway

Conecte o repositório GitHub ao serviço de backend. Em **Settings → Source**, defina **Root Directory** como `/backend_organize`. No deploy, use **Start Command** `npm start`, Node.js 24 e **Healthcheck Path** `/api/health`. Não configure um build do frontend nesse serviço.

Mantenha ou anexe um volume com ponto de montagem `/data`. Se o serviço já usa esse volume, a mudança de pastas no repositório não altera os dados que estão nele. Configure estas variáveis no serviço:

```text
NODE_ENV=production
ORGANIZE_DATA_DIR=/data
RAILPACK_NODE_VERSION=24
ORGANIZE_PUBLIC_ORIGIN=https://organize-gray.vercel.app
```

O valor de `ORGANIZE_PUBLIC_ORIGIN` acima usa o domínio Vercel informado para este projeto. A Railway fornece `PORT`; não defina porta fixa. Remova variáveis antigas `ORGANIZE_DIST_DIR` e `RAILPACK_NO_SPA`, caso existam. Se `ORGANIZE_DB_PATH` estiver definido, aponte para `/data/organize.sqlite` ou remova a variável para usar `ORGANIZE_DATA_DIR`. Não configure certificados TLS locais na Railway.

O domínio de backend informado para este projeto é `https://organize-production-b9ef.up.railway.app`, mas a consulta a `/api/health` retornou 404 `Application not found` em 24/10/2026, antes da publicação desta nova estrutura. No painel da Railway, confirme que o domínio está ligado ao serviço do backend no ambiente de produção, que o último deploy está ativo e que os logs mostram `Organize API`. Se o domínio exibido em **Settings → Networking → Public Networking** for diferente, atualize `front_organize/frontend/vercel.json` antes de publicar o frontend. Não execute `npm run seed` em produção, pois ele cria contas de demonstração com senha conhecida.

Se publicar pela CLI a partir da raiz do repositório, use `railway.cmd up ./backend_organize --path-as-root` após vincular o serviço correto. Para deploy automático, faça commit e push das mudanças; o serviço com Root Directory `/backend_organize` deve acompanhar esse repositório.

## 3. Frontend na Vercel

Importe o mesmo repositório como outro projeto e defina **Root Directory** `front_organize/frontend`, **Build Command** `npm run build` e **Output Directory** `dist`. O arquivo [frontend/vercel.json](../frontend/vercel.json) encaminha `/api/*` para o domínio Railway informado acima e entrega `index.html` nas rotas da interface. Aponte-o para o domínio ativo antes do deploy.

Se o domínio da Railway mudar, execute dentro de `front_organize/frontend/`:

```powershell
node scripts/configure-vercel.mjs https://NOVO-BACKEND.up.railway.app
```

Inclua o `vercel.json` atualizado no próximo commit. Configure `ORGANIZE_PUBLIC_ORIGIN=https://organize-gray.vercel.app` na Railway e aplique o deploy das variáveis. O frontend usa requisições relativas à própria origem; não exponha segredos em variáveis de build da Vercel.

## 4. Teste a publicação

1. Abra `https://organize-production-b9ef.up.railway.app/api/health`; espere `{"ok":true,"database":"sqlite"}`.
2. Abra `https://organize-gray.vercel.app/api/health`; espere a mesma resposta. Se a Vercel mostrar `NOT_FOUND`, confira o Root Directory `front_organize/frontend`, o deploy mais recente e se `front_organize/frontend/vercel.json` foi incluído no Git.
3. Abra o domínio Vercel em uma janela privada, registre uma conta e faça login.
4. Crie um quadro, lista e cartão; mova o cartão, atualize a página e confirme a persistência.
5. Teste convite, upload/download de anexo e atualização de duas sessões em tempo real. Verifique `/api/events` no navegador publicado.
6. Faça um novo deploy do backend e confirme que os dados permanecem no volume. No celular, instale a PWA pelo domínio HTTPS da Vercel.

Os dados locais em `backend_organize/data/` não são enviados automaticamente à Railway. Para migrá-los, pare o serviço local, faça uma cópia consistente do SQLite **junto com WAL e uploads**, e transfira ao volume antes de usar o serviço hospedado. A exportação JSON do Organize não inclui os binários dos anexos. Mantenha uma única instância com esse SQLite e faça backups do volume.

O Organize ainda está em desenvolvimento; veja [a matriz de paridade](PARIDADE.md) para recursos incompletos e o [README](../README.md) para execução local.

Documentação das plataformas: [Railway monorepo](https://docs.railway.com/deployments/monorepo), [Railway CLI](https://docs.railway.com/cli/deploying), [Vercel monorepo](https://vercel.com/docs/monorepos) e [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
