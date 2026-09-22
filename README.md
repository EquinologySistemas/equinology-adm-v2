# Equinology — painel administrativo

Painel da equipe Equinology, em Next.js 16 e React 19.

## Documentação

- [Guia do painel](https://github.com/EquinologySistemas/equinology-docs/blob/main/systems/admin.md)
- [Setup local](https://github.com/EquinologySistemas/equinology-docs/blob/main/guides/developer/setup.md)
- [Publicação](https://github.com/EquinologySistemas/equinology-docs/blob/main/guides/operations/deploy.md)

Após configurar `.env.local`, use `yarn install --frozen-lockfile` e `yarn dev -p 3001`. O usuário do painel é um `AdminUser`, distinto do profissional da clínica.

As páginas ficam em `src/app/(private)/`. A integração HTTP fica em `src/context/ApiContext.tsx`.
