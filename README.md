# Organize

Plataforma de quadros e tarefas com frontend React/TypeScript, API Node.js/TypeScript e dados persistidos em SQLite. O projeto inclui autenticação, áreas de trabalho, quadros, listas, cartões, colaboração em tempo real e uma PWA. A identidade visual e os arquivos de marca são próprios do Organize.

**Estado:** desenvolvimento ativo. A [matriz de paridade](docs/PARIDADE.md) informa, recurso por recurso, o que funciona, o que é parcial e o que ainda falta. Uma tela visível não implica que seu fluxo esteja completo.

## Requisitos

- Windows, Linux ou macOS. O build usa o esbuild da plataforma instalada pelo npm.
- Node.js **24 ou superior** e npm.
- Navegador atual com suporte a Service Worker para instalar a PWA.

Execute os comandos **na raiz deste projeto**. Os caminhos padrão do banco, dos uploads e dos arquivos compilados são relativos à pasta de execução.

## Início rápido

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize'
npm ci
node server/seed.ts
npm run dev
```

Abra [http://localhost:3001](http://localhost:3001). `npm run dev` compila a aplicação e inicia o servidor. Para executar uma compilação já pronta, use `npm start`; após alterar o frontend, execute `npm run build` antes de `npm start`.

O seed é idempotente e cria uma área chamada **Equipe Aurora**, um quadro com listas e cartões e estas contas de demonstração:

| Conta | Senha | Papel no exemplo |
| --- | --- | --- |
| `ana@organize.local` | `Organize123!` | Proprietária |
| `bruno@organize.local` | `Organize123!` | Membro |

Use essas credenciais somente para desenvolvimento local. Também é possível criar contas pela tela inicial; cada nova conta recebe uma área de trabalho pessoal.

## Comandos

```powershell
npm run check   # tipos do frontend e do servidor
npm test        # integração da API com banco temporário
npm run build   # verifica tipos e compila o frontend em dist/
npm start       # serve a API e dist/ na porta 3001
```

Para hospedar na Railway, siga o [guia de publicação](docs/RAILWAY.md). O build é compatível com o Linux da plataforma; banco e anexos exigem um volume persistente.

O teste da API cria seu próprio banco temporário e cobre registro, quadro privado, listas, cartões, movimentação, convite, duas contas, SSE, comentários, checklist, permissões, anexo, automação e exportação/importação. Execute `npm run build` e teste os fluxos visuais no navegador após mudanças na interface. Consulte a matriz para a evidência de cada recurso e os pontos pendentes de teste em desktop, tablet, celular, teclado e toque.

## Dados e configuração

Por padrão, o servidor grava `server/data/organize.sqlite` e arquivos enviados em `server/data/uploads/`. Essas pastas e `dist/` estão no `.gitignore`. Faça backup **do banco e da pasta de uploads juntos**. O serviço mantém os dados entre reinicializações; o seed não apaga dados existentes.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `3001` | Porta HTTP |
| `ORGANIZE_DATA_DIR` | `server/data` | Pasta do banco e dos uploads |
| `ORGANIZE_DB_PATH` | `server/data/organize.sqlite` | Caminho específico do SQLite |
| `ORGANIZE_DIST_DIR` | `dist` | Frontend compilado servido pela API |
| `NODE_ENV` | não definido | `production` ativa `Secure` no cookie de sessão |
| `ORGANIZE_TLS_CERT_PATH` | não definido | Certificado HTTPS para acesso pelo celular |
| `ORGANIZE_TLS_KEY_PATH` | não definido | Chave privada do certificado HTTPS |

Copie [.env.example](.env.example) para `.env` se quiser registrar valores locais. Os scripts npm **não carregam `.env` automaticamente**. No Node 24, depois de compilar, execute `node --env-file=.env server/index.ts`, ou defina as variáveis no PowerShell antes de `npm run dev`/`npm start`:

```powershell
$env:PORT = '3001'
$env:ORGANIZE_DATA_DIR = 'D:\Dados\Organize'
npm start
```

O arquivo `.env` está ignorado pelo Git. Se definir `ORGANIZE_DB_PATH` fora de `ORGANIZE_DATA_DIR`, mantenha o backup desse arquivo também.

## Organização do projeto

- `src/`: interface React, telas, visualizações, comunicação com a API e estilos responsivos.
- `server/index.ts`: rotas HTTP, autorização, notificações, eventos SSE, uploads e automações.
- `server/db.ts`: esquema e acesso ao SQLite via `node:sqlite`.
- `server/seed.ts`: dados de demonstração.
- `public/`: manifest, ícone e Service Worker da PWA.
- `docs/PARIDADE.md`: levantamento das funções atuais do Trello, estado e evidências de paridade.
- `server/README.md`: contrato detalhado da API.

Frontend e backend ficam no **mesmo projeto**. O servidor entrega o frontend compilado e a API sob a mesma origem; alterações enviadas por uma pessoa chegam às outras sessões conectadas por Server Sent Events (SSE).

## Fluxo de colaboração

Entre como Ana, crie uma área/quadro ou use o quadro de exemplo, adicione listas e cartões e abra um cartão para descrição, checklist, comentários, datas e responsáveis. No painel **Checklist**, cada item pode receber responsável e prazo. No quadro, abra **Filtro** para combinar critérios e salvar filtros na sua conta. Use **Compartilhar**, informe o email da outra conta e compartilhe o link de convite gerado. A pessoa precisa criar/entrar na conta com o mesmo email e aceitar o convite. Depois, alterações autorizadas aparecem nas sessões conectadas sem recarregar a página.

No menu da conta, alterne rapidamente entre modo claro e escuro. Em **Configurações → Aparência**, escolha **Claro**, **Escuro** ou **Sistema**. A preferência é salva no banco para a conta e aplicada antes da interface carregar nas visitas seguintes.

No quadro, use o botão **Foco** na barra superior, à esquerda da busca, para recolher a navegação lateral, a barra superior, as abas de visualização e a navegação inferior. **Mostrar menus** restaura tudo. A escolha fica salva neste navegador, inclusive após recarregar o quadro.

Convites geram um link e notificações internas. **Não há envio de email** no projeto atual. O envio automático exigirá um serviço externo configurado.

## Instalar no celular (PWA)

O Organize já inclui manifesto, ícones próprios, Service Worker e um botão **Instalar Organize** na tela de entrada e no menu da conta. Em navegadores Android compatíveis, o botão abre o prompt nativo quando ele estiver disponível; se não estiver, mostra as instruções do navegador. No iPhone/iPad, a instalação é feita no Safari por **Compartilhar → Adicionar à Tela de Início → Abrir como App → Adicionar**.

O celular precisa acessar o **mesmo servidor** do computador. `http://localhost:3001` no celular aponta para o próprio celular, não para o PC. Para instalar a PWA via rede local, sirva-a por **HTTPS com um certificado confiável no telefone** e abra `https://IP-DO-PC:3001` (ou um nome local presente no certificado). O computador e o telefone devem estar na mesma rede; permita o acesso à porta 3001 na rede privada do firewall, se necessário.

Exemplo de desenvolvimento local com [`mkcert`](https://github.com/FiloSottile/mkcert), instalado separadamente:

```powershell
cd 'C:\Users\Rick\Documents\Projetos\Organize'
mkcert -install
mkcert -cert-file .\organize-local.pem -key-file .\organize-local-key.pem 192.168.1.42 localhost
$env:ORGANIZE_TLS_CERT_PATH = (Resolve-Path .\organize-local.pem).Path
$env:ORGANIZE_TLS_KEY_PATH = (Resolve-Path .\organize-local-key.pem).Path
npm run build
npm start
```

Substitua `192.168.1.42` pelo IPv4 real do computador. O `mkcert -install` confia no certificado **no PC**; o telefone também precisa confiar na CA local (`rootCA.pem` em `mkcert -CAROOT`). Instale **somente** o certificado da CA no telefone, nunca `rootCA-key.pem`. Se o navegador exibir aviso de certificado, a origem ainda não é confiável e a instalação pode não estar disponível. Mantenha chave privada e CA apenas no seu ambiente de desenvolvimento. Os arquivos `.pem` e `.key` são ignorados pelo Git.

O Service Worker guarda apenas os arquivos estáticos da interface e apresenta uma página de reconexão quando o servidor não responde. **Quadros, cartões, autenticação e anexos dependem do servidor**; não há edição offline ou sincronização posterior. Para usar o app instalado fora da rede local, será necessário disponibilizar o servidor em um endereço HTTPS alcançável pelo celular. O mapa do OpenStreetMap também depende de internet.

## Integrações e limites atuais

Os fluxos principais locais não exigem contas externas. As seguintes funções dependem de serviços ainda não conectados:

- Email de convite e notificações por email: serviço de entrega de mensagens.
- Google Calendar e Outlook: OAuth e APIs desses provedores.
- Captura por email, Slack e Microsoft Teams: contas e webhooks/APIs dos canais.
- Push remoto e SSO/provisionamento: provedores de push e identidade.
- Geocodificação de endereços: provedor de mapas; cartões aceitam coordenadas e a visualização usa OpenStreetMap online.

A API mantém uma estrutura de registro de integrações, mas não ativa conectores sem implementação e credenciais. Não salve segredos nessa estrutura: ela rejeita chaves de configuração com nomes de credenciais. A exportação JSON recria dados e referências a links, mas **não inclui os binários dos anexos locais**; preserve a pasta de uploads separadamente.

Recursos amplos do Trello ainda estão ausentes ou parciais, incluindo espelhamento de cartões, ações em lote, SSO, auditoria de organização e integrações de calendário. Algumas operações expostas pela API têm interface limitada. O estado preciso de cada item está em `docs/PARIDADE.md`; o produto não deve ser tratado como equivalente completo ao Trello enquanto houver itens parciais ou faltantes.

## Cuidados ao publicar

Use HTTPS e `NODE_ENV=production`; nessa condição o cookie de sessão recebe `Secure`. Mantenha o processo atrás de um proxy que preserve a mesma origem para frontend e API. Restrinja acesso aos backups, ao SQLite e a `server/data/uploads/`. O agendador de automações e lembretes roda no processo Node a cada minuto; para várias réplicas, é necessário um worker único ou fila distribuída. Esta base ainda precisa de endurecimento operacional antes de ser exposta publicamente, inclusive recuperação de conta, proteção contra abuso e política de retenção/backup.
#   O r g a n i z e  
 