# Organize

Plataforma de gestão de tarefas com dois projetos independentes no mesmo repositório:

- [frontend/](frontend/README.md): React, TypeScript, estilos, ícones e PWA. Pode ser publicado na Vercel.
- [backend_organize/](../backend_organize/README.md): API Node.js/TypeScript, autenticação, autorização, SQLite, uploads, eventos e automações. Pode ser publicado na Railway.
- [docs/PARIDADE.md](docs/PARIDADE.md): estado de cada recurso em relação ao Trello. O produto ainda está em desenvolvimento.

## Executar localmente

Requer Node.js 24 ou superior. No PowerShell, use `npm.cmd` se a política de execução bloquear `npm.ps1`.

Terminal 1:

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize\backend_organize'
npm.cmd ci
npm.cmd run dev
```

Terminal 2:

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize\front_organize\frontend'
npm.cmd ci
npm.cmd run dev
```

Abra [http://localhost:5173](http://localhost:5173). O Vite encaminha as chamadas `/api/*` para o backend em `http://127.0.0.1:3001`. Para criar dados de demonstração, rode `npm.cmd run seed` na pasta `backend_organize/`; as contas locais são `ana@organize.local` e `bruno@organize.local`, senha `Organize123!`. Não rode o seed em produção.

## Verificação

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize\backend_organize'
npm.cmd run check
npm.cmd test
cd ..\front_organize\frontend
npm.cmd run build
```

Cada projeto tem seu próprio `package.json`, `package-lock.json`, dependências, configuração TypeScript e comandos. O frontend gera `front_organize/frontend/dist/`. O backend responde apenas por `/api/*`; não depende do build da interface.

## Dados existentes

O banco local e os uploads estão em `backend_organize/data/`. Essa pasta é ignorada pelo Git. O backend reconhece os caminhos antigos dos anexos já registrados no SQLite. Faça backup do banco, arquivos WAL e uploads com o serviço parado. Em produção, defina `ORGANIZE_DATA_DIR=/data` e anexe um volume da Railway em `/data`.

## Hospedagem

Use `/backend_organize` como Root Directory na Railway e `front_organize/frontend` como Root Directory na Vercel. O arquivo [frontend/vercel.json](frontend/vercel.json) encaminha `/api/*` ao domínio Railway informado; confirme ou atualize esse domínio antes de publicar. Configure `ORGANIZE_PUBLIC_ORIGIN=https://organize-gray.vercel.app` no backend para autorizar as escritas e gerar links de convite. Veja [docs/RAILWAY.md](docs/RAILWAY.md) para os passos de publicação e migração do serviço existente.

A PWA instala a interface, mas quadros, cartões, autenticação e anexos precisam da API online. O projeto ainda não tem edição offline, envio de email, SSO ou todas as funções do Trello. Consulte a matriz para o estado exato.
