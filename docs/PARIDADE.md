# Matriz de paridade: Trello × Organize

Levantamento em fontes oficiais consultadas em **8 de outubro de 2026**. Estado do Organize revisado em **11 de outubro de 2026** com testes automatizados da API, compilação TypeScript e fluxos reais no navegador. **O produto ainda não atingiu paridade completa.** "Funciona" indica que o recorte descrito na linha foi implementado e validado; "Parcial" indica as lacunas exatas.

## Legenda de estado

- **A validar:** não há evidência de teste suficiente.
- **Funciona:** implementação real, com evidência reproduzível na última coluna.
- **Parcial:** descrever exatamente o que funciona e o que falta.
- **Depende de integração:** indicar serviço, credenciais e comportamento sem elas.
- **Falta:** recurso não implementado; a interface não deve apresentar um botão inerte.
- **Não se aplica:** diferença intencional, justificada.

A presença de interface, dados de demonstração ou resposta simulada não constitui paridade.

## Planos Trello usados como referência

| Plano | Funções distintivas |
| --- | --- |
| Free | Até 10 quadros e 10 colaboradores por área de trabalho; cartões ilimitados; Inbox; Power-Ups ilimitados; anexos até 10 MB/arquivo; 250 execuções de automação/mês; 2FA. |
| Standard | Quadros/colaboradores ilimitados; anexos até 250 MB; checklists avançadas; campos personalizados; espelhamento de cartões; listas coloridas/recolhíveis; buscas salvas; Planner completo; IA; 1.000 execuções de automação/mês. |
| Premium | Visualizações Calendário, Tabela, Linha do tempo, Painel e Mapa; Tabela/Calendário entre quadros da área; observadores; coleções; modelos de área; exportação CSV/área; controles administrativos; automação sem limite de execuções. |
| Enterprise | Administração de organização, quadros visíveis na organização, controle de convidados/anexos/Power-Ups, SSO, provisionamento e auditoria. |

Fontes: [planos atuais](https://trello.com/pricing), [cotas de automação](https://support.atlassian.com/trello/docs/butler-quotas-and-limits/).

## Etapa 1 — fluxo essencial de duas pessoas

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| E01 | Registrar, entrar, sair e recuperar conta; sessão protegida | Todos | Parcial | Registro, login, logout, cookie HttpOnly e invalidação após troca de senha testados na API e no navegador; recuperação de conta por email falta. |
| E02 | Criar área de trabalho e administrar nome e membros | Todos | Parcial | Criação pela UI, edição e papéis pela API; administração completa da área ainda não tem tela própria. |
| E03 | Criar quadro em área com nome e visibilidade | Todos | Funciona | Quadro “QA Fluxo” criado pela UI; API testa visibilidade e autorização. |
| E04 | Criar, renomear, ordenar e arquivar listas | Todos | Parcial | Criação, edição, arraste e arquivo disponíveis; ordem e restauração visual ainda precisam de teste de regressão. |
| E05 | Criar, editar, ordenar, copiar, mover e arquivar cartões | Todos | Parcial | Criação, edição, cópia, movimento, conclusão e arquivo reais; ordenação/restituição de todos os casos ainda não testadas na UI. |
| E06 | Mover cartões entre listas por arrastar/soltar, teclado e toque | Todos | Parcial | Mouse para lista vazia e Alt + seta testados no navegador; gesto táctil real não verificado. |
| E07 | Convidar outra pessoa e aceitar convite | Todos | Funciona | Link criado na UI, conta Camila cadastrada e convite aceito; comentário de Camila apareceu para Ana. Envio de email exige serviço externo. |
| E08 | Duas sessões observam alterações sem recarregar | Colaboração em quadros | Parcial | Eventos SSE e duas contas testados na API; atualização simultânea em dois navegadores não foi verificada visualmente. |
| E09 | API nega leitura/escrita indevida entre usuários | Todos | Funciona | `npm test`: quadro privado, busca/exportação, observador, origem externa, download e ações administrativas negados. |
| E10 | Dados persistem após reiniciar servidor e navegador | Todos | Funciona | SQLite preservou cartões, checklist e comentários após reinício de `npm start`; anexo persistiu após recarga do navegador. |

Fontes: [criar quadro](https://support.atlassian.com/trello/docs/creating-a-new-board/), [convidar pessoas](https://support.atlassian.com/trello/docs/adding-people-to-a-board/), [permissões](https://support.atlassian.com/trello/docs/changing-permissions-on-a-board/).

## Identidade, área de trabalho e segurança

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| S01 | Perfil, avatar, tema, fuso e preferências de notificação | Todos | Parcial | Nome e senha pela UI; temas claro/escuro/sistema na conta, persistidos em SQLite e verificados após recarga. Avatar, fuso e configuração de notificações na UI faltam. |
| S02 | Autenticação de dois fatores | Todos | Falta | Não implementada. |
| S03 | Visibilidade Privado, Área de trabalho e Público | Todos | Parcial | Três opções e controle no servidor; quadro público ainda exige conta e link público anônimo falta. |
| S04 | Visibilidade de Organização | Enterprise | Falta | Não há modelo de organização. |
| S05 | Papéis admin, membro, convidado e observador | Observador Premium+ | Parcial | Admin, membro e observador testados; tratamento completo de convidados externos falta. |
| S06 | Permissões para comentar, convidar, ingressar e criar quadros | Opções conforme plano | Parcial | Papéis básicos aplicados no servidor; opções granulares por ação não existem. |
| S07 | Configurações da área e do quadro, inclusive acesso administrativo | Todos; controles avançados Premium+ | Parcial | Quadro editável na UI e administração bloqueada para membros; área de trabalho ainda depende da API para parte das opções. |
| S08 | Favoritos, recentes, coleções e troca rápida de quadros | Coleções Premium+ | Parcial | Favoritos, recentes e alternador funcionam; coleções existem na API, sem interface. |
| S09 | Restrições por domínio, SSO e provisionamento | Enterprise | Falta | Sem controles de domínio nem provedor de identidade; SSO exigiria integração externa. |
| S10 | Auditoria, política de anexos e de Power-Ups | Enterprise | Falta | Há atividade de cartão e limite local de 8 MB, mas não trilha administrativa nem políticas por organização. |

Fontes: [visibilidade](https://support.atlassian.com/trello/docs/changing-the-visibility-of-a-board/), [administração da área](https://support.atlassian.com/trello/docs/workspace-admin-capabilities/), [Enterprise](https://support.atlassian.com/trello/docs/enterprise-admin-dashboard/).

## Quadros, listas e cartões

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| C01 | Descrição formatada, membros, etiquetas e capas de cor/imagem | Todos | Parcial | Descrição simples, responsáveis, etiquetas e capas coloridas funcionam; formatação rica e imagem de capa faltam. |
| C02 | Anexo de arquivo com download autorizado e link | Todos | Funciona | Upload local de `anexo-qa.txt` validado na UI; teste da API confirma download autorizado e 401 sem sessão. Limite atual: 8 MB. |
| C03 | Comentários, menções e histórico de atividade | Todos | Parcial | Comentário entre Ana e Camila e histórico persistido; detecção de menções falta. |
| C04 | Checklists múltiplas, progresso, ordem e conversão em cartão | Todos | Parcial | Criação, itens e progresso testados; conversão de item em cartão e reordenação visual faltam. |
| C05 | Responsável e prazo por item de checklist | Standard+ | Funciona | Edição no painel de checklist validada no navegador em desktop e 390 px; responsável e prazo persistiram após recarga e no SQLite. Teste da API cobre autorização, edição e importação do responsável que tem acesso ao novo quadro. |
| C06 | Campos personalizados: texto, número, data, seleção e checkbox | Standard+ | Parcial | Definição dos cinco tipos na UI e valores persistidos na API; seleção “Prioridade QA” apareceu com “Alta” após recarga. Outros tipos ainda precisam de teste visual. |
| C07 | Início, entrega, hora, lembrete e marcar concluído | Todos | Parcial | Edição de datas e conclusão disponível; lembrete interno pelo agendador, sem teste temporal completo. |
| C08 | Recorrência de entrega e de cartão | Prazo nativo; cartão via automação/Power-Up | Parcial | Recorrência simples de cartão ao concluir; regras de prazo flexíveis e exceções faltam. |
| C09 | Modelos de cartão, quadro e área de trabalho | Modelo de área Premium+ | Parcial | Cartão modelo pode ser marcado, listado e copiado como cartão comum; modelos de quadro/área faltam. |
| C10 | Copiar/mover listas e quadros; restaurar arquivo/quadro fechado | Todos | Parcial | Cópia de lista na API e restauração de cartões/listas na UI; cópia de quadro, movimento de lista entre quadros e restauração de quadro faltam. |
| C11 | Cartão de link, quadro, separador e espelho entre quadros | Espelho Standard+ | Falta | Links podem ser anexados, mas tipos especiais de cartão e espelhamento não existem. |
| C12 | Localização de cartão para Mapa | Mapa Premium+ | Parcial | Localização livre/coordenadas persistidas; mapa online usa OpenStreetMap. Geocodificação e marcador sincronizado faltam. |
| C13 | Lista colorida/recolhível, fundos e adesivos próprios | Listas Standard+ | Parcial | Cor/recolhimento da lista e cor de fundo do quadro; adesivos e biblioteca de fundos faltam. |
| C14 | Seleção múltipla, ações em lote e desfazer/refazer | Web/desktop | Falta | Não implementados. |
| C15 | Acompanhar cartão, lista ou quadro para notificações | Todos | Parcial | Acompanhar cartão e quadro pela UI; acompanhar lista na API, sem botão na interface. |

Fontes: [catálogo de cartões/listas](https://support.atlassian.com/trello/docs/add-and-customize-cards-and-lists/), [tipos](https://support.atlassian.com/trello/docs/card-types/), [espelho](https://support.atlassian.com/trello/docs/mirroring-cards/), [datas](https://support.atlassian.com/trello/docs/adding-dates-to-cards/), [campos](https://support.atlassian.com/trello/docs/using-custom-fields/), [acompanhar](https://support.atlassian.com/trello/docs/watching-cards-lists-and-boards/).

## Navegação, busca, Inbox, Planner e notificações

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| N01 | Cabeçalho global, cabeçalho do quadro e alternador fixável | Todos | Parcial | Cabeçalhos, lateral e troca de quadros responsivos; não há preferência para fixar/ocultar alternador. |
| N02 | Inbox, Planner e quadro lado a lado com largura ajustável | Planner completo Standard+ | Falta | São páginas próprias, sem painéis simultâneos redimensionáveis. |
| N03 | Inbox pessoal: capturar, editar, filtrar, ordenar, arquivar e mover | Todos | Parcial | Captura, arquivo e movimento para quadro testados; edição, filtro e ordenação pela UI faltam. |
| N04 | Captura por email, Slack e Microsoft Teams | Todos; IA no pago | Depende de integração | Sem conectores ativos; exigem contas, credenciais e APIs externas. Captura manual funciona. |
| N05 | Planner Google/Outlook com eventos e tempo de foco | Ver Free; agendar Standard+ | Depende de integração | Calendário interno de prazos funciona; OAuth, eventos externos e blocos de foco não implementados. |
| N06 | Busca global, operadores e filtragem com controle de acesso | Todos | Parcial | Busca de “celular” retornou cartão na UI; API restringe acesso. Operadores avançados faltam. |
| N07 | Filtro por texto, etiqueta, pessoa e prazo em quadro | Todos | Parcial | Quatro controles disponíveis; texto com prazo “Hoje” ocultou os cartões e limpeza restaurou os dois no navegador. Combinações com etiqueta e pessoa ainda não foram verificadas visualmente. |
| N08 | Buscas salvas | Standard+ | Funciona | Filtro “Validação QA” criado e aplicado na UI; continuou disponível após recarga. API testa isolamento por usuário, persistência e exclusão. |
| N09 | Notificações por convite, menção, comentário, prazo e mudanças acompanhadas | Todos | Parcial | Convite, comentário, prazo e acompanhamento geram notificações internas; menções e cobertura de todas as mudanças faltam. |
| N10 | Preferências de email, desktop e push | Todos | Parcial | Preferências genéricas na API; sem UI nem canais email/push. |
| N11 | Atalhos de teclado e opção para desativar | Todos | Parcial | `/`, `b`, `f`, `n`, Esc e Alt + seta disponíveis; opção de desativar, desfazer e conjunto completo faltam. |

Fontes: [navegação atual](https://support.atlassian.com/trello/docs/navigation-in-trello/), [Inbox](https://support.atlassian.com/trello/docs/trello-inbox/), [Planner](https://support.atlassian.com/trello/docs/trello-planner/), [busca](https://support.atlassian.com/trello/docs/searching-for-cards-all-boards/), [notificações](https://support.atlassian.com/trello/docs/receiving-trello-notifications/), [atalhos](https://support.atlassian.com/trello/docs/keyboard-shortcuts-in-trello/).

## Visualizações e relatórios

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| V01 | Quadro horizontal com cartões, listas e filtros | Todos | Funciona | Layout desktop/tablet/celular, filtros, lista vazia e arraste testados no navegador. Modo de foco recolhe menus e barras, amplia a área dos cartões e persiste neste navegador. |
| V02 | Calendário com datas de cartões e checklist avançada | Premium+ | Parcial | Mostrou quatro cartões do quadro por entrega; prazos de checklist não aparecem. |
| V03 | Tabela editável, ordenável e filtrável | Premium+ | Parcial | Tabela mostrou cartões e edita lista/conclusão; ordenação e colunas configuráveis faltam. |
| V04 | Linha do tempo com intervalos e edição | Premium+ | Parcial | Intervalos desenhados a partir de início/entrega; edição por arraste da barra falta. |
| V05 | Painel com gráficos por lista, pessoa, etiqueta e prazo, inclusive histórico | Premium+ | Parcial | Métricas atuais e gráficos por lista/etiqueta testados; pessoa, prazo e série histórica faltam. |
| V06 | Mapa interativo com cartões geolocalizados | Premium+ | Parcial | Interface aceita coordenadas e exibe mapa OpenStreetMap online; geocodificação e edição no mapa faltam. |
| V07 | Tabela/Calendário de vários quadros na mesma área | Premium+ | Parcial | Planner reúne prazos de vários quadros; tabela e calendário de área configuráveis faltam. |
| V08 | Visões salvas com filtros, quadros e visibilidade | Premium+ | Falta | Não há interface de visões salvas. |

Fontes: [visões](https://trello.com/views), [guia de visões](https://trello.com/en/guide/activate-views), [visões da área](https://support.atlassian.com/trello/docs/workspace-views/).

## Automações e extensibilidade

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| A01 | Regras acionadas por evento com ações reais | Todos, com cota | Funciona | Regra “Concluir novos cartões QA” criada na UI; novo cartão foi concluído no servidor. |
| A02 | Agendamento recorrente por horário | Todos, com cota | Parcial | Agendador e gatilho `scheduled` na API; criação e inspeção pela UI faltam, sem teste temporal. |
| A03 | Gatilho relativo ao vencimento | Todos, com cota | Parcial | Gatilho `due` e verificação por minuto; sem escolha de antecedência relativa na UI. |
| A04 | Botões de cartão e quadro que executam ações | Todos, com cota | Parcial | API executa regra `button` em cartão; botão contextual na UI e botão de quadro faltam. |
| A05 | Condições, variáveis, ações em cascata e log | Todos, com cota | Parcial | Condições simples por lista/etiqueta, várias ações e atividade; variáveis e log operacional completo faltam. |
| A06 | Relatório programado por email | Todos, com cota | Depende de integração | Não implementado; requer serviço de email e gerador de relatório. |
| A07 | Catálogo/estrutura de integrações com habilitar, desabilitar e permissões | Power-Ups em todos | Parcial | API de configuração restrita a administradores, sem segredos e com estado explícito; catálogo/UI/ativação de conectores faltam. |
| A08 | API e webhooks autenticados para integração | Plataforma Trello | Parcial | API com sessão e controle de origem; chaves de API e webhooks externos faltam. |
| A09 | Integração com calendários, nuvem de arquivos, Slack, Teams, Jira etc. | Via integrações/Power-Ups | Depende de integração | Nenhum provedor conectado; exigem OAuth/credenciais e implementação por serviço. |
| A10 | Acesso por assistentes via MCP | Todos no Trello atual | Falta | Sem servidor MCP ou autenticação específica. |
| A11 | IA para quadro, checklist, capa, texto, mescla e agendamento | Standard+; vários fluxos web/desktop | Depende de integração | Sem provedor de modelo configurado nem ações de IA implementadas. |

Fontes: [automação](https://support.atlassian.com/trello/docs/automation-overview/), [construtor](https://support.atlassian.com/trello/docs/create-and-manage-automations/), [Power-Ups](https://support.atlassian.com/trello/docs/what-are-power-ups/), [IA](https://support.atlassian.com/organization-administration/docs/atlassian-intelligence-features-in-trello/), [MCP](https://support.atlassian.com/trello/docs/connect-trello-to-ai-assistants-with-trello-mcp/).

## Dados, plataforma e entrega

| ID | Critério de aceite | Trello | Organize | Evidência / dependência |
| --- | --- | --- | --- | --- |
| D01 | Exportar quadro JSON | Todos | Parcial | Exportação JSON da área com quadros testada na API e exposta na UI; arquivo JSON exclusivo de um quadro falta. |
| D02 | Exportar quadro CSV e área com anexos | Premium+ | Falta | CSV e binários de anexos no pacote de exportação não implementados. |
| D03 | Importar dados com mapeamento, validação e erros | Sem importador JSON/CSV nativo | Parcial | Round trip JSON de listas, cartões, comentários e checklist, incluindo prazo e responsável autorizado, testado na API; mapeamento interativo, membresia do quadro e importação dos binários faltam. |
| D04 | PWA instalável com manifesto, ícones próprios e service worker | Apps móveis/desktop no Trello | Parcial | Manifesto, PNG 192/512, Apple touch icon, Service Worker versionado, shell e página offline respondem HTTP 200. Botão de instalação e instruções foram conferidos no navegador em largura de celular. Servidor aceita HTTPS local mediante certificado confiável; a instalação real em Android/iPhone ainda depende de validação no aparelho e da configuração do certificado nele. Edição offline não existe. |
| D05 | Experiência responsiva com teclado, mouse e toque | Web/apps móveis | Parcial | Navegador em 1440×900, 768×1024 e 390×844, teclado e arraste de mouse testados; gesto táctil físico pendente. |
| D06 | Ambiente documentado, seed demonstrativa e testes principais | Requisito da entrega | Funciona | `README.md`, `.env.example`, seed Ana/Bruno, `npm run build` e `npm test` passam. |
| D07 | Dependências externas claramente identificadas na UI e documentação | Requisito da entrega | Parcial | UI informa limites de Inbox, Planner e mapa; README lista serviços externos. Catálogo de integrações na UI falta. |

Fontes: [exportação](https://support.atlassian.com/trello/docs/exporting-data-from-trello/), [importação](https://support.atlassian.com/trello/docs/importing-data-into-trello/), [plataformas](https://support.atlassian.com/trello/docs/what-browsers-and-mobile-platforms-does-trello-support/).

## Referência visual atual

O redesenho do [Trello anunciado em maio de 2025](https://www.atlassian.com/blog/trello/new-trello-is-here) reúne Inbox, Planner e quadro em painéis combináveis. A [navegação documentada](https://support.atlassian.com/trello/docs/navigation-in-trello/) apresenta cabeçalho global, cabeçalho do quadro, alternador fixável na lateral e barra para abrir Inbox/Planner/Board. O [novo detalhe do cartão](https://support.atlassian.com/trello/docs/new-card-back/) coloca ações comuns em **Add** sob o título, copiar/mover/espelhar em **Actions** no canto superior e Power-Ups, botões e atividade em uma barra inferior.

Essas fontes embasam a arquitetura de interação. A interface do Organize foi conferida em desktop, tablet e celular no navegador local. A validação de gesto táctil físico e uma comparação pixel a pixel com a versão atual do Trello ainda faltam. A marca, os textos, os ícones e as imagens do Organize são próprios.

