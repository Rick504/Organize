# Organize API

Servidor Node.js 24 com TypeScript, `node:sqlite`, arquivos locais e Server Sent Events (SSE). Nenhum serviço externo é necessário para executar os fluxos principais.

## Execução

Na raiz do projeto:

```sh
npm install
node server/seed.ts
npm run dev
```

O servidor escuta em `http://localhost:3001`. Variáveis opcionais:

- `PORT`: porta HTTP (padrão `3001`).
- `ORGANIZE_DATA_DIR`: diretório do SQLite e dos uploads (padrão `server/data`).
- `ORGANIZE_DB_PATH`: caminho específico do banco.
- `NODE_ENV=production`: marca o cookie de sessão como `Secure`; sirva por HTTPS.

Dados de exemplo: `ana@organize.local` e `bruno@organize.local`, senha `Organize123!`. `node server/seed.ts` é idempotente.

Teste da API: `node --test --test-isolation=none server/tests/api.test.ts`. O teste usa banco temporário e verifica autenticação, criação e movimentação de cartões, permissões, convite, comentários, checklist, SSE e importação/exportação.

## Convenções

- Todas as rotas abaixo começam com `/api`; corpos e respostas são JSON em camelCase.
- A sessão usa cookie `organize_session` HttpOnly, SameSite=Lax, expiração de 30 dias, token aleatório armazenado como SHA-256. Senhas usam scrypt com sal individual.
- Escritas com cabeçalho `Origin` de outro host são rejeitadas. Envie requests pelo mesmo host do frontend (o Vite encaminha `/api`).
- Erros retornam `{ "error": "mensagem" }` com status 4xx ou 5xx.
- IDs são UUIDs. Datas são ISO 8601. A posição numérica pode ser enviada para ordenar listas e cartões; novos itens recebem uma posição após o último.
- `observer` lê; `member` edita; `admin` e `owner` administram. Quadros privados exigem membro explícito do quadro, exceto administradores da área de trabalho.

## Contrato principal

Autenticação e conta:

- `GET /me` → `{user|null}`
- `POST /auth/register` `{name,email,password}` → `{user}`; cria uma área pessoal.
- `POST /auth/login` `{email,password}` → `{user}`
- `POST /auth/logout` → `{ok}`
- `PATCH /me` `{name?,avatar?}`; `POST /me/password` `{oldPassword,newPassword}`
- `GET /preferences`; `PUT /preferences` com objeto JSON.
- `GET /bootstrap` → `{user,workspaces,boards,notifications,inbox}`

Áreas e convites:

- `GET /workspaces`; `POST /workspaces` `{name,description?}` → `{workspace}`
- `GET /workspaces/:id` → `{workspace,members,boards}`; `PATCH /workspaces/:id` `{name?,description?,settingsJson?}`
- `GET /workspaces/:id/members`; `PATCH /workspaces/:id/members/:userId` `{role}`; `DELETE` na mesma URL.
- `POST /workspaces/:id/invites` `{email,role,boardId?}` → `{invite}` com `token` e `inviteUrl` para compartilhar. Se `boardId` for informado, o aceite também adiciona a pessoa ao quadro privado. O servidor registra o convite e notifica contas existentes; envio de e-mail depende de integração externa.
- `GET /workspaces/:id/invites`; `GET /invites` lista convites recebidos pela conta; `POST /invites/:token/accept` aceita um convite destinado ao e-mail autenticado.
- `GET /workspaces/:id/export` → JSON versionado; `POST /workspaces/:id/import` `{data: exportação}` recria quadros, listas, cartões, etiquetas, checklists, comentários, campos e anexos por link. Arquivos locais enviados não estão embutidos no JSON exportado (`includesUploadedFiles:false`).

Quadros e listas:

- `GET /boards`; `POST /boards` `{workspaceId,title,description?,visibility?,background?}` → `{board}`.
- `GET /boards/:id` → `{board,lists,cards,labels,members,customFields,automations}`. Os cartões incluem `memberIds`, `labelIds`, `checklistProgress`, `commentCount`, `attachmentCount`.
- `PATCH /boards/:id` `{title?,description?,visibility?,background?,starred?,archived?,settingsJson?}` → `{board}`. `starred` é pessoal para cada usuário.
- `GET /boards/:id/activity`; `GET /boards/:id/members`; `POST /boards/:id/members` `{email,role}`; `DELETE /boards/:id/members/:userId`.
- `POST /boards/:id/lists` `{title,position?,color?}` → `{list}`.
- `PATCH /lists/:id` `{title?,position?,color?,collapsed?,archived?}` → `{list}`; `POST /lists/:id/copy` `{title?}` → `{list}`.
- `GET /lists/:id/cards`; `POST /lists/:id/cards` `{title,description?,position?,startAt?,dueAt?,template?,cover?}` → `{card}`.
- `POST` ou `DELETE /boards/:id/watch` e `/lists/:id/watch` observa ou deixa de observar.

Cartões:

- `GET /cards/:id` → `{card,checklists,comments,attachments,fieldValues,activity}`. Esses arrays também estão em `card`; `card` contém `members`, `labels`, `memberIds`, `labelIds`, `watching`.
- `PATCH /cards/:id` aceita `title`, `description`, `listId`, `position`, `cover`, `coverColor`, `startAt`, `dueAt`, `dueComplete`, `reminderMinutes`, `recurrence`, `template`, `completed`, `archived`, `location`; retorna `{card}`.
- `POST /cards/:id/move` `{listId,position?}` → `{card}`; aceita mudança entre quadros com permissão nos dois. Etiquetas e campos do quadro de origem são removidos nessa mudança.
- `POST /cards/:id/copy` `{listId?,title?}` → `{card}` com etiquetas, responsáveis, checklists e campos copiados.
- `POST /cards/:id/members` `{userId}`; `DELETE /cards/:id/members/:userId`.
- `POST /cards/:id/labels` `{labelId}`; `DELETE /cards/:id/labels/:labelId`.
- `POST /cards/:id/comments` `{body}` → `{comment}`; `PATCH /comments/:id` `{body}`; `DELETE /comments/:id`.
- `POST /cards/:id/checklists` `{title}`; `PATCH /checklists/:id` `{title?,position?}`; `DELETE /checklists/:id`.
- `POST /checklists/:id/items` `{text,dueAt?,assigneeId?}`; `PATCH /checklist-items/:id` `{text?,completed?,position?,dueAt?,assigneeId?}`; `DELETE /checklist-items/:id`.
- `POST /cards/:id/attachments` `{name,url}` ou `{name,mime,dataBase64}` (máximo 8 MB); `GET /attachments/:id/download`; `DELETE /attachments/:id`.
- `PUT /cards/:id/custom-values/:fieldId` `{value}`.
- `POST` ou `DELETE /cards/:id/watch`.
- `GET /cards/:id/activity`.

Metadados e produtividade:

- `POST /boards/:id/labels` `{name,color}`; `PATCH /labels/:id`; `DELETE /labels/:id`.
- `POST /boards/:id/custom-fields` `{name,type,options?}`; `PATCH /custom-fields/:id`; `DELETE /custom-fields/:id`. Tipos: `text`, `number`, `date`, `checkbox`, `select`.
- `GET /boards/:id/templates` lista cartões marcados como modelo.
- `GET /search?q=...` → `{boards,cards}`; `GET /planner?from=ISO&to=ISO` → `{cards,from,to}`.
- `GET /inbox`; `POST /inbox` `{title,notes?,cardId?}`; `PATCH /inbox/:id`; `DELETE /inbox/:id`.
- `GET /notifications`; `PATCH /notifications/:id` `{read:true|false}`; `POST /notifications/read-all`.
- `GET /saved-filters`; `POST /saved-filters` `{name,boardId?,query}`; `PATCH` e `DELETE /saved-filters/:id`.
- `GET /workspaces/:id/collections`; `POST /workspaces/:id/collections` `{name}`; `PATCH`/`DELETE /collections/:id`; `POST /collections/:id/boards` `{boardId}`; `DELETE /collections/:id/boards/:boardId`.

Tempo real e automação:

- `GET /events` mantém conexão SSE autenticada. Cada alteração envia `data: {type,boardId,workspaceId,entityId}` aos usuários autorizados. Notificações enviam `{type:"notification"}`. O cliente pode atualizar os recursos afetados ao receber eventos.
- `POST /boards/:id/automations` `{name,trigger,condition?,actions,enabled?}`; `PATCH` e `DELETE /automations/:id`; `POST /automations/:id/run` `{cardId}` para botão.
- Gatilhos: `card_created`, `card_moved`, `due`, `scheduled`, `button`. Condições podem usar `listId`, `labelId`; agendamento usa `cardId`, `at` e opcional `everyMinutes`.
- Ações: `{type:"move_card",listId}`, `{type:"add_label",labelId}`, `{type:"set_due",daysFromNow}`, `{type:"post_comment",body}`, `{type:"archive_card"}`, `{type:"mark_complete"}`.
- O agendador em processo verifica vencimentos, horários e lembretes a cada minuto. Para produção com várias réplicas, é necessário um worker único ou fila distribuída.
- `GET /integrations/:workspaceId`; `POST /integrations/:workspaceId` são restritos a administradores. A configuração inativa retorna `status:"requires_external_credentials"`; chaves de credenciais são rejeitadas e as respostas não expõem `configJson`. Nenhum conector de terceiros é simulado.

## Limites atuais

O backend implementa autorização, persistência e eventos para os recursos acima. Envio de e-mails, OAuth, integrações de terceiros, Web Push, arquivos em nuvem, restauração dos binários de anexos no JSON exportado, trilhas de auditoria imutáveis e suporte a múltiplas réplicas de agendador não estão implementados. Geocodificação/mapas depende de provedor externo; o servidor persiste coordenadas em `location`.
