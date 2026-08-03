# Frente B — Revogação de token

Status: **CORRIGIDO** e verificado com curl real contra `http://localhost:3333`.

## O problema

O JWT vale 90 dias (`signOptions: { expiresIn: '90d' }` em `auth.module.ts`) e é
auto-contido. Nenhum guard olhava para o banco: bastava a assinatura ser válida.

Reproduzido antes da correção, com o usuário **apagado do banco** e o token antigo:

| Chamada | HTTP ANTES |
|---|---|
| `GET /client?page=1` (leitura) | **200** |
| `PUT /client/:clientId` (escrita) | **200** — e o banco gravou: `select name from clients` devolveu `GRAVOU MESMO APAGADO` |

E no painel, com o admin `active=false`:

| Chamada | HTTP ANTES |
|---|---|
| `GET /admin/users` | **200** |
| `POST /admin/users` | **200** (criava admin) |
| `GET /admin/auth/me` | 401 — única rota que já consultava o banco |

## O que mudou

### Arquivo novo: `src/infra/shared/auth/session-validity.ts`

Ponto único de checagem, chamado pelos guards:

- `assertSessionIsStillValid(prisma, type, sub)` — lança `UnauthorizedException`
  com a mensagem `Sua sessão não é mais válida. Faça login novamente.`
- Regra por tipo de token:
  - `user` → a linha em `users` precisa existir (exclusão de usuário é hard delete).
  - `client` → a linha em `clients` precisa existir **e** ter `deletedAt` nulo
    (cliente é soft delete: os dados ficam para a clínica, o acesso pelo app cai).
  - `admin` → a linha em `admin_users` precisa existir **e** ter `active = true`.
- `sub` que não é UUID é rejeitado com 401 antes de ir ao Prisma (evita P2023 → 500).
- Token sem `type` (emitido antes do campo existir) é tratado como `user`, que é
  como o `AuthGuard` sempre tratou.

### `src/infra/shared/auth/auth.guard.ts` (APP_GUARD global)

- O `verifyAsync` foi isolado no `try/catch`; a checagem de revogação ficou
  **fora** dele. Se ficasse dentro, o `catch` engoliria o 401 de sessão revogada
  e devolveria "sua sessão expirou" — o tipo de armadilha que já apareceu seis
  vezes nesta base.
- Depois de popular `request.userId/companyId/tokenType`, chama
  `assertSessionIsStillValid` e marca o request como já checado.

### `src/infra/shared/auth/admin-auth.guard.ts`

- Mesma reestruturação do `try/catch` (o `catch` antigo também podia mascarar erro).
- Depois de exigir `payload.type === 'admin'`, valida existência + `active`.
- Se o `AuthGuard` global já validou o **mesmo** sub **neste request**, não repete
  a query. É memoização dentro do request (o objeto morre com ele), não cache
  entre requests — não existe janela de revogação.

### Nada mais foi tocado

Nenhum controller, nenhum service de domínio, nenhuma migration.
`AdminSuperAdminGuard` e `RoleGuard` ficaram como estavam: o 403 de "conta de
administrador inativa" do `AdminSuperAdminGuard` agora é inalcançável, porque o
401 vem antes — que é exatamente o comportamento pedido.

## Consulta direta, sem cache — justificativa

Escolhi **consulta direta ao banco a cada request**, sem cache com TTL:

1. Cache com TTL reintroduz, em escala menor, o bug que estamos corrigindo: uma
   janela em que a conta já foi apagada/desativada e o token ainda passa.
   Revogação com atraso não é revogação.
2. O cache seria por processo. Com mais de uma instância da API, a janela vira
   não determinística ("às vezes ainda entra") — o pior cenário para suporte.
3. O custo é desprezível. `EXPLAIN ANALYZE` do lookup por chave primária:
   `Execution Time: 0.102 ms`. O tempo total de `GET /client?page=1` medido com
   `curl -w %{time_total}` ficou entre **7 e 25 ms**. A checagem é ~1% do request,
   e as rotas já fazem queries muito mais pesadas (listagens com joins, contagem
   de paginação).
4. Cache exigiria invalidação em logout, exclusão de usuário, desativação de
   admin e troca de senha — quatro pontos a mais para errar na véspera do
   lançamento, todos fora dos arquivos desta frente.

Se um dia o volume justificar cache, o lugar é dentro de `session-validity.ts`,
sem mexer nos guards.

## Verificação (HTTP que eu vi)

Cenário montado: usuário `qa.frenteb@teste.local` (empresa
`24d31ce9-…`), admin `qa.frenteb.admin@teste.local` (`super_admin`, `active=true`),
cliente `qa.cli.frenteb@teste.local`. Tokens emitidos por `/user/signin`,
`/admin/auth/signin` e `/client/auth`.

### Usuário APAGADO (`DELETE FROM users WHERE id=…`), token antigo

| Chamada | ANTES | DEPOIS |
|---|---|---|
| `GET /client?page=1` (leitura) | 200 | **401** |
| `PUT /client/:clientId` (escrita) | 200 + gravou | **401** |

Confirmação de que a escrita não passou: depois do PUT com payload
`{"name":"NAO PODE GRAVAR"}`, o `select name from clients` continuou devolvendo
`GRAVOU MESMO APAGADO` (o valor gravado no teste ANTES). Nada foi escrito.

Corpo da resposta:
`{"message":"Sua sessão não é mais válida. Faça login novamente.","error":"Unauthorized","statusCode":401,"code":"UNAUTHORIZED"}`

### Admin `active=false`, token antigo

| Chamada | ANTES | DEPOIS |
|---|---|---|
| `GET /admin/auth/me` | 401 | **401** |
| `GET /admin/users` (leitura) | 200 | **401** |
| `POST /admin/users` (escrita) | 200 | **401** |

### Admin APAGADO (`DELETE FROM admin_users`), token antigo

| `GET /admin/users` | **401** |

### Cliente soft-deletado (`deletedAt = now()`), token antigo

| Chamada | DEPOIS |
|---|---|
| `GET /animal?page=1` (leitura) | **401** |
| `PUT /client/:clientId` (escrita) | **401** |

### Regressão — contas vivas continuam funcionando

| Chamada | HTTP |
|---|---|
| user `GET /client?page=1` | 200 |
| user `PUT /client/:clientId` | 200 |
| admin `GET /admin/users` | 200 |
| admin `GET /admin/auth/me` | 200 |
| client `GET /animal?page=1` | 200 |
| sem token `GET /client` | 401 |
| token lixo `GET /client` | 401 |

`npx tsc --noEmit` na API: **exit 0**.

## Ponto de atenção para outra frente

A revogação **não** depende de como o usuário é desativado — ela checa existência
da linha. Mas vale registrar: `DELETE /user/:userId` hoje dá 500 quando o usuário
já atendeu (54 FKs `RESTRICT`). Ou seja, na prática **hoje não dá para revogar um
veterinário que já trabalhou**, porque não dá para apagá-lo. Não mexi nisso (é de
outra frente), mas recomendo: adicionar um campo `active`/`deletedAt` em `users` e
fazer o `DELETE` virar soft delete. Quando isso existir, basta acrescentar a
condição em `subjectIsActive()` no `session-validity.ts` — uma linha — e a
revogação passa a valer também para o desligamento sem exclusão.
