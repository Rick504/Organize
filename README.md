# Organize

Estrutura deste repositório:

- [Backend](backend_organize/README.md): API, banco SQLite, autenticação e testes.
- [Frontend](front_organize/frontend/README.md): aplicação React e PWA.
- [Guia local e de publicação](front_organize/README.md): execução, configuração e links entre os serviços.
- [Matriz de paridade](front_organize/docs/PARIDADE.md): estado dos recursos.

O Git continua único. Na Railway, use `/backend_organize` como Root Directory e `/backend_organize/**` como Watch Path. Na Vercel, use `front_organize/frontend` como Root Directory e configure o Ignored Build Step para observar somente essa pasta. Assim, cada serviço publica apenas as próprias alterações. As chamadas `/api/*` do frontend são encaminhadas ao backend por [vercel.json](front_organize/frontend/vercel.json). Veja o [passo a passo dos deploys separados](front_organize/docs/RAILWAY.md).
