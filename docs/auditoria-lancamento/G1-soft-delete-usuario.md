# G1 — Exclusão de usuário por soft delete

Branch: `fix/lancamento` (repo `vetequus-api`). Nada foi commitado.

## O problema (reproduzido)

`DELETE /user/:userId` fazia hard delete (`prisma.user.delete`). Como `users` é
referenciada por 54 FKs `ON DELETE RESTRICT` (appointments, notes, reminders e
todas as fichas), qualquer veterinário que já tivesse atendido derrubava a rota
em 500. Prova direta no banco, com o veterinário do teste (que tinha 1
atendimento):

```
$ docker exec vetequus-local psql -U postgres -d vetequus \
    -c "DELETE FROM users WHERE id='24d3319e-8d87-49f5-b5ec-48f3c44fc82c';"
ERROR:  update or delete on table "users" violates foreign key constraint
        "appointments_userId_fkey" on table "appointments"
DETAIL:  Key (id)=(24d3319e-...) is still referenced from table "appointments".
```

Consequência: a vaga do plano nunca liberava e o acesso do usuário continuava
válido.

## Decisão do dono

"Revoga acesso e deixa em soft delete, com um toglezinho para mostrar nos
deletados e não aparecer nas outras partes do sistema."

## O que mudou

A coluna `users.deletedAt` já existia (FASE 1 — ver `SEGUNDA-LEVA-SCHEMA.md`).
Nenhuma mudança de banco foi necessária nesta frente.

### `src/domain/enterprise/entities/user.ts`
- Nova prop `deletedAt?: Date | null` com getter/setter e o atalho `isDeleted`.

### `src/infra/shared/database/prisma/mappers/PrismaUserMapper.ts`
- `toDomain` e `toPrisma` passam `deletedAt`. Ir também no `toPrisma` impede
  que um `save()` qualquer "ressuscite" um usuário excluído.

### `src/domain/application/repositories/user.repository.ts` (contrato)
- `delete(id)` virou `softDelete(id)` — **não existe mais caminho de hard
  delete** no contrato, então ninguém reintroduz o 500 por descuido.
- `findById`, `findByEmail`, `fetchByCompanyId` e `fetchAll` ganharam
  `includeDeleted?: boolean` — mesmo nome de parâmetro que a leva anterior usou
  em cliente, propriedade, animal e atendimento (confirmado em
  `client.repository.ts`, `animal.repository.ts`, `studFarm.repository.ts`,
  `appointment.repository.ts`).

### `src/infra/shared/database/prisma/repositories/prismaUser.repository.ts`
- Helper `deletedScope(includeDeleted)` — idêntico ao de
  `prismaClient.repository.ts` / `prismaAnimal.repository.ts`.
- **Todos** os caminhos de leitura filtram `deletedAt: null` por padrão:
  `findById`, `findByEmail`, `fetchByCompanyId`, `fetchAll` e
  `findInactiveToNotify` (este último sempre exclui — não se manda e-mail de
  inatividade para quem perdeu o acesso).
- `findById`/`findByEmail` passaram de `findUnique` para `findFirst`, porque
  `findUnique` não aceita filtro extra no `where`.
- `softDelete` grava `deletedAt: new Date()`.

Como toda leitura de usuário no sistema passa por este repositório (varredura
`grep -rn "userRepository\.\|prisma\.user\."`), o filtro pega junto, sem tocar
em outros módulos:

| Consumidor | Efeito |
| --- | --- |
| `GET /user` (listagem e combo de responsável) | excluído some |
| `companyUserLimit.getLimitInfo` → `GET /user/limit-info` | excluído não conta |
| `companyUserLimit.checkCanAddUser` | vaga liberada de verdade |
| `adminSignature.service` / `expireTrialSignatures.scheduler` | contam só ativos |
| `adminUserManagement.fetchAll` (painel) | excluído não aparece |
| `appointment.service` (validação do responsável) | excluído não pode ser atribuído |
| `role.guard`, `Company.service`, `client.service` | excluído não passa |
| `inactiveUsers.scheduler` | excluído não recebe e-mail |

O único ponto onde `prisma.user` é lido fora deste repositório é
`src/infra/shared/auth/session-validity.ts` — ver "Pendência" abaixo.

### `src/domain/application/services/account/services/User.service.ts`
- `deleteUser` chama `softDelete`. Regras anteriores intactas (só ADMIN, mesma
  empresa, não pode excluir a si mesmo). Excluir de novo dá 404.
- `fetch` recebe e repassa `includeDeleted`.
- `authenticate` usa `findByEmail` **sem** `includeDeleted`: o excluído cai no
  mesmo `AuthenticationError` de credencial inválida. Escolha deliberada — dizer
  "sua conta foi excluída" na tela de login é enumeração de e-mail.
- As quatro checagens de e-mail duplicado (`create`, `register`, `edit`,
  `adminEdit`) passaram a usar `findByEmail(email, true)`. Motivo: `users.email`
  é UNIQUE; o e-mail de um excluído continua ocupado. Sem isso, reaproveitar o
  e-mail estouraria a constraint e viraria 500 sem explicação — agora dá 409 com
  mensagem clara.

### `src/domain/application/services/account/interfaces/userProps.ts`
- `FetchUsersServiceRequest.includeDeleted?: boolean`.

### `src/infra/http/controllers/account/dto/User.dto.ts`
- Novo `FetchUsersDto` com `includeDeleted`, com o mesmo
  `@Transform(value === true || 'true' || '1')` do `FetchClientDto`.

### `src/infra/http/controllers/account/user.controller.ts`
- `GET /user` aceita `?includeDeleted=true`.
- `DELETE /user/:userId` responde **200** com:
  "Usuário excluído. O acesso dele foi encerrado e a vaga do plano foi liberada;
  o histórico de atendimentos foi preservado. Para vê-lo, use o filtro de
  excluídos."

### `src/infra/http/presenters/user.presenter.ts`
- Passa a devolver `deletedAt` e `isDeleted`, para o front marcar a linha
  quando o toggle de excluídos estiver ligado.

### `test/repositories/inMemoryUser.repository.ts`
- Espelha o comportamento (filtro por `isDeleted`, `softDelete`).

## Verificação (curl real, códigos vistos)

Empresa própria: `g1admin1785699220@teste.com` / company
`567c20de-db0e-4572-8ee9-28ae7f6c5497`. Veterinário alvo:
`g1vet1785699240@teste.com` / `24d3319e-8d87-49f5-b5ec-48f3c44fc82c`, com 1
atendimento criado por ele (`POST /appointment` → **201**).

| Passo | Resultado |
| --- | --- |
| `DELETE FROM users` direto no banco (o que a rota fazia antes) | **ERROR** FK `appointments_userId_fkey` |
| `DELETE /user/24d3319e-...` | **200** + mensagem |
| SQL `SELECT id,email,"deletedAt" FROM users WHERE id=...` | 1 linha, `deletedAt = 2026-08-02 19:34:58.615` |
| `GET /user` | **200**, só o admin (1 usuário) |
| `GET /user?includeDeleted=true` | **200**, 2 usuários; o vet com `"isDeleted":true` |
| `GET /user/limit-info` antes | `{"currentUsers":2,...}` |
| `GET /user/limit-info` depois | **200** `{"currentUsers":1,...}` — vaga liberada |
| `POST /user/signin` com o e-mail do excluído | **401** "E-mail ou senha incorretos..." |
| `PATCH /user/token` com o token antigo dele | **404** (não renova) |
| `POST /appointment` com `userId` do excluído | **404** (some do combo de responsável) |
| `POST /user` reusando o e-mail do excluído | **409** com `field:"email"` (não 500) |
| `PUT /user/:id` do excluído | **404** |
| `DELETE /user/:id` de novo | **404** |
| `GET /appointment/fetch` | **200**, atendimento intacto, com `user.isDeleted:true` |

`npx tsc --noEmit` na API: **exit 0**.

(Os testes unitários não rodam neste checkout — `ts-jest` não está instalado,
falha pré-existente e alheia a esta frente.)

## PENDÊNCIA — token antigo do excluído ainda passa (arquivo de outra frente)

Item 4 da frente: verificado, **não barra**.

```
$ curl -H "Authorization: Bearer <token do vet excluído>" \
       "http://localhost:3333/client?page=1"
HTTP:200   # devolveu a lista de clientes da empresa
```

Causa exata, em `src/infra/shared/auth/session-validity.ts` (frente B —
revogação de token, fora dos meus arquivos):

```ts
const user = await prisma.user.findUnique({
  where: { id: subjectId },
  select: { id: true },
});

return user !== null;
```

A checagem só confirma **existência**. Fazia sentido quando a exclusão de
usuário era hard delete (comentário do próprio arquivo: "user -> a linha em
`users` precisa existir (exclusão é hard delete)"). Com soft delete a linha
continua lá, então o token de 90 dias segue lendo e escrevendo.

Correção de uma linha, no mesmo padrão que o arquivo já usa para `client`:

```ts
const user = await prisma.user.findUnique({
  where: { id: subjectId },
  select: { deletedAt: true },
});

return user !== null && user.deletedAt === null;
```

O comentário do bloco `- user ->` também precisa ser atualizado. Enquanto isso
não for feito, o acesso do usuário excluído só cai de fato quando o token
expira; login novo, renovação de token e todas as rotas do módulo user já
barram.
