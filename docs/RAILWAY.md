# Hospedar o Organize na Railway

O frontend e a API são um único serviço Node.js. O banco SQLite e os anexos ficam em um volume persistente. Este guia usa o código local com a Railway CLI; GitHub é opcional.

## 1. Confira o projeto

No PowerShell:

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize'
npm.cmd ci
npm.cmd run build
npm.cmd test
```

No PowerShell, use `npm.cmd` e `railway.cmd`: isso chama os executáveis do Windows sem acionar os atalhos `.ps1`, que podem ser bloqueados pela política de execução. O arquivo `.nvmrc` fixa Node.js 24. O build atual usa esbuild de forma portátil; não usa o script PowerShell antigo. A Railway deve executar `npm run build` e `npm start`.

## 2. Crie o projeto e o serviço

Crie ou acesse sua conta em [railway.com](https://railway.com/). Instale a [Railway CLI](https://docs.railway.com/cli) e autentique-se:

```powershell
npm.cmd install -g @railway/cli
railway.cmd login
railway.cmd init --name Organize
railway.cmd add --service Organize
```

Quando houver mais de um workspace ou ambiente, selecione o correto nos prompts. `railway.cmd add --service Organize` cria um serviço vazio e o vincula à pasta local.

## 3. Prepare a persistência antes de publicar

Crie um [volume](https://docs.railway.com/volumes) no serviço com ponto de montagem `/data`:

```powershell
railway.cmd volume add --mount-path /data
```

Selecione o serviço **Organize** caso a CLI pergunte. No dashboard, confirme que o volume está anexado a esse serviço. Sem ele, o SQLite e os anexos desaparecem em redeploys.

Configure as variáveis do serviço:

```powershell
railway.cmd variable set NODE_ENV=production ORGANIZE_DATA_DIR=/data RAILPACK_NO_SPA=1 RAILPACK_NODE_VERSION=24
```

`RAILPACK_NO_SPA=1` impede que a Railway trate a interface como site estático e deixe de iniciar a API. `ORGANIZE_DATA_DIR=/data` coloca `organize.sqlite` e `uploads/` no volume. A Railway injeta `PORT`; não defina uma porta fixa. Não defina `ORGANIZE_TLS_CERT_PATH` ou `ORGANIZE_TLS_KEY_PATH`: o domínio público da Railway já fornece HTTPS.

## 4. Publique e obtenha o endereço

```powershell
railway.cmd up
railway.cmd domain
```

O primeiro comando envia o projeto local, compila no Linux e inicia o servidor; o segundo gera um domínio `*.up.railway.app`. No painel do serviço, confira **Settings → Deploy**: Build Command `npm run build`, Start Command `npm start`, e configure Healthcheck Path `/api/health` se não estiver definido. O backend responde na porta injetada pela Railway. O certificado HTTPS do domínio Railway é automático.

## 5. Verifique o resultado

Substitua o domínio pelo gerado no passo anterior:

```powershell
Invoke-RestMethod 'https://SEU-DOMINIO.up.railway.app/api/health'
```

O resultado esperado é `ok: true` e `database: sqlite`. Abra o domínio no navegador, crie sua conta e teste criar um quadro, lista e cartão. Faça um novo deploy com `railway.cmd up` e confirme que o cartão continua lá. No celular, abra o mesmo endereço HTTPS e use **Instalar Organize**; no iPhone, use Safari → Compartilhar → Adicionar à Tela de Início. A PWA instalada continua dependente da API para ler e editar os dados.

## Dados existentes, manutenção e limites

- O primeiro deploy começa com banco vazio: `server/data/` está ignorado e não é enviado por `railway up`. Não execute `node server/seed.ts` no ambiente público; o seed cria contas de demonstração com senhas conhecidas.
- Se precisar migrar seus quadros atuais, pare o servidor local, faça uma cópia consistente do SQLite e envie **o banco e a pasta `uploads/` juntos** ao volume antes de usar o serviço hospedado. A [Railway CLI permite upload de arquivos e diretórios para volumes](https://docs.railway.com/cli/volume). Evite substituir um banco em uso.
- Ative [backups do volume](https://docs.railway.com/volumes) no painel e teste uma restauração. A exportação JSON do Organize não contém os binários dos anexos.
- Mantenha uma única instância do serviço com esse SQLite. A Railway não permite réplicas para serviços com volume e pode ocorrer uma breve indisponibilidade durante o redeploy.
- O projeto ainda está em desenvolvimento; antes de armazenar dados sensíveis de usuários externos, revise as limitações de segurança e operação descritas no [README](../README.md) e na [matriz de paridade](PARIDADE.md).
- Consulte os [preços e limites atuais da Railway](https://docs.railway.com/pricing) antes de escolher o plano. Volume, CPU, RAM e tráfego entram no consumo da conta; volumes de trial têm regras próprias de retenção.

Para atualizar o projeto depois de alterar o código, rode `railway.cmd up` novamente na pasta do Organize. Se preferir deploy automático a cada push, conecte o serviço a um repositório GitHub privado no dashboard da Railway.
