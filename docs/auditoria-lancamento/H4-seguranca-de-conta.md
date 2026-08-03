# H4 — Senha e código de recuperação

Frente H4 da auditoria de lançamento. Escopo: módulos `account`
(`recoverPasswordCode`) e `client` (`RecoverClientPasswordCode`) da API, mais os
DTOs de senha. Guards e demais módulos não foram tocados.

Ambiente da verificação: API em `http://localhost:3333` (watch do Nest), banco
`vetequus-local`, `MAIL_DRIVER=log`, Asaas sandbox. Todos os resultados abaixo
foram medidos com curl contra a API rodando, e o estado do banco conferido com
`psql`.

---

## Item 1 — Código de recuperação reutilizável indefinidamente

**Status: CORRIGIDO (era bug real, confirmado ao vivo, nos DOIS fluxos).**

### O que estava errado

`RecoverPasswordCode` não tinha nenhuma noção de "código consumido". As duas
rotas de troca de senha —

- `PUT /user/password` → `UserService.recoverPassword`
- `PUT /client/password-code` → `ClientService.recoverPassword`

— buscavam o código, trocavam a senha e **iam embora sem marcar nada**. A linha
em `recover_password_codes` ficava exatamente como antes. Quem visse o código
uma única vez (e-mail encaminhado, print, log de e-mail, alguém olhando a tela)
trocava a senha da conta quantas vezes quisesse dentro da janela de validade.

### Reprodução ANTES da correção

Usuário da clínica:

```
POST /password-code {"email":"h4user...@teste.com"}          -> 201
codigo no banco: yqlixe

PUT /user/password {"code":"yqlixe","password":"x"}          -> 200   (1a troca)
PUT /user/password {"code":"yqlixe","password":"y"}          -> 200   (2a troca, MESMO codigo)

SELECT id, code FROM recover_password_codes WHERE code='yqlixe';
 c9161eb2-2cdf-42de-9a9a-fac833559a34 | yqlixe      <- linha intacta
```

Proprietário (cliente):

```
POST /client/password-code {"email":...,"cpf":...}                    -> 201
codigo no banco: xxww36

PUT /client/password-code {"code":"xxww36","password":"senha123"}     -> 200
PUT /client/password-code {"code":"xxww36","password":"outra456"}     -> 200   (MESMO codigo)

SELECT id, code FROM recover_password_codes WHERE code='xxww36';
 e4967981-f2e8-4150-a00e-a4aa964d874d | xxww36      <- linha intacta

POST /client/auth {"email":...,"password":"outra456"}                 -> 201
```

O login com a senha da SEGUNDA troca funcionava — prova de que a segunda troca
com o código já usado tinha efeito real.

### O que foi feito

1. **Coluna nova `usedAt`** em `recover_password_codes`
   (migration `20260802211930_add_used_at_to_recover_password_code`,
   `prisma/schema.prisma`). Nula enquanto o código está de pé; preenchida no
   instante do consumo.

2. **Entidade** `src/domain/enterprise/entities/recoverPasswordCode.ts`:
   `usedAt` na props, getter `usedAt`, `isUsed()` e `markAsUsed(date?)`.

3. **Contrato do repositório**
   `src/domain/application/repositories/recoverPasswordCode.repository.ts`:
   novo `markAsUsed(recoverPasswordCode)`. O `findByCode` passa a ser
   documentado como "só devolve código NÃO consumido".

4. **Implementação Prisma**
   `src/infra/shared/database/prisma/repositories/prismaRecoverPasswordCode.repository.ts`:
   - `findByCode` ganhou `usedAt: null` no `where`. Código queimado deixa de ser
     encontrado — a segunda tentativa cai no mesmo 404 de código inexistente.
   - `markAsUsed` queima o código usado **e todos os outros códigos pendentes do
     mesmo dono** (mesmo `userId` ou mesmo `clientId`). Sem isso um pedido de
     recuperação antigo continuaria valendo depois da troca de senha.

5. **Mapper** `PrismaRecoverPasswordCodeMapper`: carrega e persiste `usedAt`.

6. **Serviços que consomem o código** (`UserService.recoverPassword` e
   `ClientService.recoverPassword`): chamam `markAsUsed` depois de gravar a
   senha nova, e checam `isUsed()` junto com `isExpired()`. A checagem no
   serviço é **redundante de propósito** com o filtro do repositório — esta base
   já teve vários casos de checagem que existia num único ponto e parou de
   pegar quando aquele ponto mudou.

7. **Validação do código** (`RecoverPasswordCodeService.validate` e
   `RecoverClientPasswordCodeService.validate`): também rejeitam código usado,
   para a tela não deixar o usuário avançar com um código morto.

8. **Repositório em memória dos testes**
   (`test/repositories/inMemoryRecoverPasswordCode.repository.ts`) segue a mesma
   semântica.

### Prova DEPOIS da correção

Usuário da clínica:

```
POST /password-code                                            -> 201
codigo novo: 24hpx0

GET  /password-code/24hpx0                                     -> 200  (valido)
PUT  /user/password {"code":"24hpx0","password":"SenhaBoa8"}   -> 200  (1a troca)

SELECT code, "usedAt" FROM recover_password_codes WHERE code='24hpx0';
 24hpx0 | 2026-08-02 21:22:34.457        <- QUEIMADO

PUT  /user/password {"code":"24hpx0","password":"OutraSenha9"} -> 404
     "Registro não encontrado. Confira os dados informados e tente novamente."
GET  /password-code/24hpx0                                     -> 404

POST /user/signin  password=SenhaBoa8    -> 201   (a 1a troca valeu)
POST /user/signin  password=OutraSenha9  -> 401   (a 2a NAO teve efeito)
```

Códigos irmãos também morrem (o antigo `yqlixe`, pendente, foi queimado no mesmo
instante):

```
 yqlixe | 2026-08-02 21:22:34.457
 24hpx0 | 2026-08-02 21:22:34.457

PUT /user/password {"code":"yqlixe", ...}  -> 404
```

Proprietário (cliente):

```
codigo novo: 77hkrl
PUT /client/password-code {"code":"77hkrl","password":"ClienteOk8"}  -> 200
PUT /client/password-code {"code":"77hkrl","password":"Invasor123"}  -> 404

 xxww36 | 2026-08-02 21:22:54.999
 77hkrl | 2026-08-02 21:22:54.999

POST /client/auth  password=ClienteOk8  -> 201
POST /client/auth  password=Invasor123  -> 401
```

### Expiração (continua valendo)

O código já expirava em 30 minutos (`RecoverPasswordCode.isExpired()`); isso não
foi alterado, só reconferido:

```
UPDATE recover_password_codes SET "createdAt"=now()-interval '31 minutes' ...
PUT /user/password {"code":"0ie2jj", ...}  -> 403
     "Você não tem permissão para realizar esta ação."
```

---

## Item 2 — Nenhuma política de senha

**Status: CORRIGIDO nos três pontos (era bug real no cadastro e no colaborador;
no fluxo do cliente o mínimo existia mas era 6 e sem mensagem em português).**

### O que estava errado

`RegisterUserDto`, `CreateUserDto` e `RecoverPasswordDto` só exigiam
`@IsString` + `@IsNotEmpty`. Senha de **1 caractere** era aceita:

```
POST /user/register  password="a"            -> 201  (cadastro da clinica)
POST /user           password="a"            -> 201  (criacao de colaborador)
PUT  /user/password  password="x"            -> 200  (troca por codigo)
```

Os DTOs de cliente já tinham `@MinLength(6)`, mas com a mensagem padrão em
inglês do class-validator traduzida genericamente.

### O que foi feito

Constante única em `src/infra/http/controllers/account/dto/User.dto.ts`:

```ts
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_PASSWORD_MESSAGE = 'A senha deve ter no mínimo 8 caracteres.';
```

Aplicada com `@MinLength` em **toda escrita de senha**:

| Ponto | DTO | Rota |
| --- | --- | --- |
| Cadastro da clínica | `RegisterUserDto.password` | `POST /user/register` |
| Criação de colaborador | `CreateUserDto.password` | `POST /user` |
| Troca por código (usuário) | `RecoverPasswordDto.password` | `PUT /user/password` |
| Cadastro de cliente pela clínica | `CreateClientDto.password` | `POST /client` |
| Auto-cadastro do proprietário | `RegisterClientDto.password` | `POST /client/register` |
| Troca por código (cliente) | `EditClientPasswordDto.password` | `PUT /client/password-code` |

**Os DTOs de autenticação não foram tocados.** `AuthenticateUserDto` e
`AuthenticateClientDto` continuam sem `@MinLength` — a regra é para escrita de
senha nova, nunca para login. Quem já tem senha curta cadastrada continua
entrando.

Frontends alinhados para não prometer 6 e o servidor exigir 8:

- `equinology-web-v2/app/(auth)/recover-password/page.tsx`
- `equinology-app-v2/app/(auth)/forgot-password.tsx` (validação + placeholder)
- `equinology-app-v2/app/(auth)/signup.tsx` (schema zod + placeholder)

### Prova DEPOIS da correção

Recusa nos três pontos, com a mensagem certa:

```
POST /user/register  password="a"         -> 400  ["A senha deve ter no mínimo 8 caracteres."]
POST /user/register  password="1234567"   -> 400  (7 caracteres: ainda recusa)
POST /user           password="a"         -> 400  ["A senha deve ter no mínimo 8 caracteres."]
PUT  /user/password  password="a"         -> 400  ["A senha deve ter no mínimo 8 caracteres."]
PUT  /client/password-code password="a"        -> 400
PUT  /client/password-code password="1234567"  -> 400
POST /client         password="12345"     -> 400
```

Senha válida passa:

```
POST /user/register  password="SenhaBoa8"  -> 201
POST /user           password="SenhaBoa8"  -> 201
POST /client         password="SenhaBoa8"  -> 201
PUT  /user/password  password="SenhaBoa8"  -> 200
PUT  /client/password-code password="ClienteOk8" -> 200
```

Login de quem já tem senha curta **não quebrou**:

```
POST /user/signin   email=<colaborador antigo>  password="a"  -> 201
POST /client/auth   email=<cliente antigo>      password="a"  -> 201
```

(o cliente antigo foi montado gravando na mão um hash bcrypt de `"a"` em
`clients.passwordHash`, para simular base legada).

---

## Lado negativo (segurança não foi relaxada)

| Cenário | Resultado |
| --- | --- |
| Código de CLIENTE usado em `PUT /user/password` | 403 `NOT_ALLOWED` |
| Código de USUÁRIO usado em `PUT /client/password-code` | 403 `NOT_ALLOWED` |
| Código inexistente | 404 `RESOURCE_NOT_FOUND` |
| Código expirado (31 min) | 403 `NOT_ALLOWED` |
| Código já consumido | 404 `RESOURCE_NOT_FOUND` |
| Código pendente de outro dono após tentativa cruzada | **não** é queimado — continua valendo para o dono legítimo |

A tentativa cruzada não consome o código da vítima: confirmado no banco
(`usedAt` continuou nulo depois do 403).

---

## Arquivos alterados

API (`vetequus-api`):

- `prisma/schema.prisma`
- `prisma/migrations/20260802211930_add_used_at_to_recover_password_code/migration.sql`
- `src/domain/enterprise/entities/recoverPasswordCode.ts`
- `src/domain/application/repositories/recoverPasswordCode.repository.ts`
- `src/infra/shared/database/prisma/repositories/prismaRecoverPasswordCode.repository.ts`
- `src/infra/shared/database/prisma/mappers/PrismaRecoverPasswordCodeMapper.ts`
- `src/domain/application/services/account/services/User.service.ts`
- `src/domain/application/services/account/services/RecoverPasswordCode.service.ts`
- `src/domain/application/services/client/services/client.service.ts`
- `src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts`
- `src/infra/http/controllers/account/dto/User.dto.ts`
- `src/infra/http/controllers/client/dto/client.dto.ts`
- `test/repositories/inMemoryRecoverPasswordCode.repository.ts`

Front:

- `equinology-web-v2/app/(auth)/recover-password/page.tsx`
- `equinology-app-v2/app/(auth)/forgot-password.tsx`
- `equinology-app-v2/app/(auth)/signup.tsx`

`npx tsc --noEmit`: 0 erros em `equinology-web-v2` e `equinology-app-v2`; em
`vetequus-api`, 0 erros nos arquivos desta frente (os erros restantes no repo
são de uma refatoração de paginação em curso de outra frente, em DTOs de
`animal`, `stock`, `finance` etc.).

---

## Pendências / recomendações

1. **Painel administrativo continua com mínimo 6.**
   `src/infra/http/controllers/admin/dto/adminPanelAccount.dto.ts` e
   `adminUser.dto.ts` ainda usam `@MinLength(6)`, e o ADM
   (`equinology-adm-v2/src/app/(private)/{admins,users}/_components/*CreateModal.tsx`)
   acompanha. Fora do escopo desta frente (módulo `admin`), mas é a mesma regra
   e deveria subir para 8 junto.

2. **Nenhuma validação de senha no cliente em duas telas do web**
   (`app/(auth)/register/page.tsx` e
   `app/(dashboard)/clinic/_components/AddCollaboratorModal.tsx`): a senha curta
   é barrada pelo servidor com 400 e mensagem clara, então não é falha de
   segurança — é só uma validação que poderia ser inline.

3. **Não há limite de tentativas por código.** O throttle é por rota
   (5 req/min em `POST /password-code` e `POST /client/password-code`), mas
   `PUT /user/password` e `PUT /client/password-code` não têm `ThrottlerGuard`.
   Com código de 6 caracteres alfanuméricos e janela de 30 minutos o risco de
   força bruta é baixo, mas colocar throttle nessas duas rotas de troca é
   barato.

4. **Códigos velhos ficam no banco para sempre.** `usedAt` marca o consumo, mas
   ninguém limpa linhas antigas. Vale um job de expurgo do que já passou da
   janela.
