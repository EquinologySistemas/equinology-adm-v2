# Frente H2 — Nenhuma entrada malformada pode virar 500

Repositório tocado: `vetequus-api` (branch `fix/lancamento`).
Verificação: API rodando em `http://localhost:3333`, chamadas reais via curl.
`npx tsc --noEmit` → exit 0.

Regra do dono: **o usuário nunca pode ver "500 internal server error"**. Entrada
malformada é 4xx com mensagem em português dizendo o que fazer.

---

## Resumo

| # | Caso medido | Antes | Depois |
|---|---|---|---|
| 1 | UUID malformado em parâmetro de rota | **500** em 13 GET + 69 DELETE | 400 `INVALID_UUID` |
| 2 | `GET /appointment/monthly` com mês fora de 1..12 | **500** | 400 com faixa |
| 3 | `GET /appointment-animal` com `startDate` texto livre | **500** | 400 |
| 4 | `page=0` / negativa nas listagens | **500** em 8 rotas | 400 |
| 5 | Enum inválido em shoeing e sanitary-protocol | **500** | 400 listando os valores |
| 6 | `POST /client/link` com código inexistente | **500**, sem rate limit | 400 / 404 + ThrottlerGuard |
| extra | UUID malformado chegando por **query/body** (fora do DTO) | **500** | 400 `INVALID_UUID` (rede de segurança) |
| extra | 429 do ThrottlerGuard em inglês | `ThrottlerException: Too Many Requests` | mensagem em português |

Varredura final: **0 respostas 500** em 185 rotas com parâmetro (GET/PUT/DELETE),
62 rotas POST com parâmetro, 144 rotas POST/PUT com parâmetro válido e corpo
lixo, e 104 rotas GET × 7 conjuntos de query malformada (≈ 1.100 chamadas).

---

## A solução sistêmica

Não foram 8 remendos. Três peças cobrem a base inteira, incluindo as rotas que
ainda vão nascer.

### 1. `UuidParamPipe` — pipe **global**

`src/infra/shared/validation/uuid-param.pipe.ts`, registrado em
`src/infra/main.ts` antes do `ValidationPipe`.

Todas as 91 tabelas do schema usam `id String @id @default(uuid()) @db.Uuid`.
Os controllers recebiam `@Param('id') id: string` **cru** e entregavam ao
Prisma; o Postgres recusava comparar texto com coluna `uuid`, o Prisma estourava
`P2023` e o filtro global devolvia 500.

Não era um bug de 8 lugares — era o padrão da base: **13 rotas GET e 69 rotas
DELETE** medidas com 500. Espalhar `ParseUUIDPipe` por ~250 assinaturas de
controller resolveria hoje e seria esquecido na próxima rota.

Escopo do pipe, deliberadamente estreito — só age quando **todas** valem:

- a origem é parâmetro de **rota** (`metadata.type === 'param'`), nunca body nem
  query (esses já passam pelo `ValidationPipe`/DTO);
- o parâmetro se chama `id` ou termina em `Id`.

Inventário real dos `@Param(...)` da base: `id` (143), `appointmentId` (46),
`animalId` (10), `appointmentAnimalId`, `animalNoteId`, `protocolId`,
`productId`, `planId`, `clientId`, `boardId`, `userId`, `transactionId`,
`tagId`, `signatureId`, `productCategoryId`, `ownerNoteId`, `leadId`, `itemId`,
`fieldStockId`, `paymentId`, `companyId`, `categoryId`, `accountId` — todos
uuid no schema. Os únicos fora do padrão são **`code`** (6 ocorrências) e
**`cpf`** (1), que **não** são uuid e continuam intactos. Comprovado abaixo.

Aceita UUID de qualquer versão (não trava em v4) para não recusar registro
legado.

### 2. `translatePrismaError` — rede de segurança no filtro global

`src/infra/shared/handler/prisma-error.translator.ts`, chamado por
`AllExceptionsFilter`.

O pipe cobre parâmetro de rota e os DTOs cobrem body/query declarados. Sobra o
identificador que chega por um campo ainda validado só como `@IsString()` (ex.:
`animalId` em várias fichas) e vai cru para o Prisma.

Traduz erro **conhecido** do Prisma causado por dado do cliente:

| Código | Situação | Vira |
|---|---|---|
| `P2023` | texto em coluna `uuid` | 400 `INVALID_UUID` |
| `P2000` | valor maior que a coluna | 400 `VALUE_TOO_LONG` |
| `P2002` | índice único violado | 409 `ALREADY_EXISTS` |
| `P2003` | FK apontando para inexistente | 400 `RELATED_NOT_FOUND` |
| `P2025` | update/delete em registro inexistente | 404 `RESOURCE_NOT_FOUND` |
| `PrismaClientValidationError` | enum fora da lista, `skip` negativo | 400 `INVALID_DATA` |

O que **não** é traduzido continua caindo no 500 genérico: falha de conexão,
timeout, bug de código. Isso é proposital. E o erro real continua sendo logado
com stack pelo filtro — nenhum sinal se perde para o dev.

### 3. Decorators compartilhados de DTO

- `PageNumber.decorator.ts` — converte a query em inteiro e exige `>= 1`.
  Aplicado nos **64 DTOs de listagem** que usavam `@IsNumberString()`, que
  validava o formato e não a faixa: `"0"` e `"-5"` passavam, viravam
  `skip: -10` / `skip: -60` e o Prisma recusava.
- `IntegerInRange.decorator.ts` — inteiro dentro de faixa fechada. Usado em
  `month` (1..12) e `year` (1900..2999).

---

## Caso a caso, com a prova

### Caso 1 — UUID malformado em parâmetro de rota

**Antes** (13 GET):

```
/animal-note/animal/abc         500  {"statusCode":500,"message":"Não foi possível concluir a operação..."}
/animal/by-id/abc               500
/appointment-animal/details/abc 500
/appointment/details/abc        500
/deworming/soon/abc             500
/field-stock/abc                500
/invoice/abc                    500
/owner-note/abc                 500
/product-usage/appointment/abc  500
/product/abc                    500
/sanitary-protocol/abc          500
/shoeing/soon/abc               500
/vaccine/soon/abc               500
```

**Antes** (DELETE — 69 rotas com 500): `/animal/abc`, `/client/abc`,
`/shoeing/abc`, `/user/abc`, `/stud-farm/abc`, todas as `dentistry-*`,
`general-*`, `orthopedic-*` e as 29 `reproduction-*`, etc.

**Depois** — as 13 GET:

```
/animal-note/animal/abc  400  {"statusCode":400,"message":["O identificador informado no endereço é
                              inválido. Volte à listagem e abra o registro novamente."],
                              "error":"Bad Request","code":"INVALID_UUID"}
... (idêntico nas 13)
```

**Depois** — DELETE, contagem por código nas 73 rotas varridas:

```
69 x 400   (era 500)
 4 x 401   (rotas /admin/*, sem token de admin — igual a antes)
```

**Parâmetro que NÃO é uuid segue funcionando** (o pipe não toca em `code`/`cpf`):

```
GET /stud-farm/code/ieMxetk9y0    200  {"studFarm":{"id":"e86f683a-...","name":"Haras H2",...}}
GET /client/cpf/20045145822       200  {"client":{"id":"e676f44c-...","name":"Cli H2",...}}
GET /animal/0ngzlyka              200  {"animal":{"name":"Cavalo H2","breed":"Mangalarga",...}}
```

**Caminho feliz com uuid válido:**

```
GET /animal/by-id/f42a8047-3cfa-48bd-950c-449bceda3d34   200
GET /shoeing/f42a8047-...?page=1                          200  {"shoeings":[{...}]}
GET /shoeing/soon/f42a8047-...                            200
```

### Caso 2 — `GET /appointment/monthly` com mês fora de 1..12

Arquivo: `appointment/dto/appointment.dto.ts` → `FetchMonthlyAppointmentsServiceDto`.

Antes: `@IsNumberString()` — validava formato, não faixa.

```
ANTES  ?month=99&year=2025   500
DEPOIS ?month=99&year=2025   400  {"message":["O mês deve ser um número entre 1 e 12"]}
DEPOIS ?month=0&year=2025    400  {"message":["O mês deve ser um número entre 1 e 12"]}
DEPOIS ?month=-1&year=2025   400  {"message":["O mês deve ser um número entre 1 e 12"]}
DEPOIS ?month=1&year=99999   400  {"message":["O ano deve ter 4 dígitos, entre 1900 e 2999"]}
FELIZ  ?month=12&year=2025   200  {"appointments":[]}
FELIZ  ?month=8&year=2026    200  {"appointments":[]}
```

### Caso 3 — `GET /appointment-animal` com `startDate` de texto livre

A rota recebia **todos** os filtros como `@Query('x') x?: string` cru — sem DTO
o `ValidationPipe` nunca rodava. Criado `FetchAppointmentAnimalsDto` em
`appointment/dto/appointmentAnimal.dto.ts` e ligado no controller. Os nomes dos
filtros são exatamente os que a tela já envia; nenhum filtro novo, nenhuma regra
de negócio alterada.

```
ANTES  ?startDate=banana&endDate=banana&page=1  500
DEPOIS ?startDate=banana&endDate=banana&page=1  400 {"message":["Informe uma data inicial válida",
                                                                "Informe uma data final válida"]}
DEPOIS ?gender=BANANA&page=1  400 {"message":["Categoria inválida. Use STALLION, CASTRATED, MATRIX,
                                               DONOR, RECEPTOR ou BREEDING"]}
DEPOIS ?state=BANANA&page=1   400 {"message":["O parâmetro \"state\" é o status do atendimento, não a
                                               UF. Use PENDING, IN_PROGRESS, FINISHED ou RESCHEDULED..."]}
DEPOIS ?animalId=abc&page=1   400 {"message":["Selecione um animal válido"]}
FELIZ  ?page=1                                            200 {"animals":[],"pages":0}
FELIZ  ?startDate=2025-01-01&endDate=2025-12-31&page=1    200 {"animals":[],"pages":0}
FELIZ  ?page=1&animalId=<uuid>&state=PENDING&gender=STALLION 200 {"animals":[],"pages":0}
```

### Caso 4 — `page = 0` ou negativa

64 DTOs migrados de `@IsNumberString()` para `@PageNumber()`.

```
                          ANTES        DEPOIS
/animal?page=0             500    →     400  ["A página deve ser maior ou igual a 1"]
/client?page=0             500    →     400
/stud-farm?page=0          500    →     400
/note?page=0               500    →     400
/payment?page=0            500    →     400
/reminder?page=0           500    →     400
/appointment/fetch?page=0  500    →     400
/product?page=0            500    →     400

/animal?page=-5            500    →     400  ["A página deve ser maior ou igual a 1"]
/animal?page=abc           400    →     400  ["A página deve ser um número inteiro."]
/animal?page=1.5           200*   →     400  ["A página deve ser um número inteiro."]
```

Caminho feliz de todas as listagens com `page=1` → **200**, conteúdo inalterado.

Nota: `/product/fetch` e `/client/fetch` **não existem** — caem em
`GET /product/:productId` com `productId="fetch"`. Antes davam 500; hoje dão
400 `INVALID_UUID`, que é o correto. A listagem real é `GET /product?page=1`
(200, verificado).

### Caso 5 — Enum inválido em shoeing e sanitary-protocol

Os campos eram `@IsString()`: "BANANA" passava pela validação, o Prisma recusava
o valor do enum e o usuário levava 500.

`animal/dto/shoeing.dto.ts` — novo `ShoeingTypeDto` (TRIMMING | SHOEING |
ORTHOPEDIC) aplicado em Create, Edit e no filtro do Fetch. `animalId` passou de
`@IsString()` para `@IsUUID()`.

`controllers/dto/sanitaryProtocol.dto.ts` — novos `ProtocolItemTypeDto`
(VACCINE | DEWORMING | EXAM) e `ProtocolTargetCategoryDto` (FOAL | MARE |
STALLION). `studFarmId` e `protocolId` passaram para `@IsUUID()`.

```
POST /shoeing  type=BANANA            ANTES 500  →  400 ["Tipo inválido. Use TRIMMING (casqueamento),
                                                          SHOEING (ferrageamento) ou ORTHOPEDIC (ortopédico)"]
POST /shoeing  animalId=abc                      →  400 ["Escolha um Animal válido"]
POST /shoeing  type=SHOEING (válido)             →  201
GET  /shoeing/<uuid>?page=1&type=BANANA          →  400 (mesma mensagem)
GET  /shoeing/<uuid>?page=1&type=SHOEING         →  200 {"shoeings":[{...}]}

POST /sanitary-protocol targetCategory=BANANA  ANTES 500 → 400 ["Categoria inválida. Use FOAL (potro),
                                                                 MARE (égua) ou STALLION (garanhão)"]
POST /sanitary-protocol items[].type=BANANA    ANTES 500 → 400 ["Tipo inválido. Use VACCINE (vacina),
                                                                 DEWORMING (vermifugação) ou EXAM (exame)"]
POST /sanitary-protocol studFarmId=abc                   → 400 ["Escolha um Haras válido"]
POST /sanitary-protocol tudo válido                      → 201
GET  /sanitary-protocol?page=1&studFarmId=<uuid>         → 200 {"protocols":[{...}]}
```

### Caso 6 — `POST /client/link`: 500 e sem rate limit

`clients.code` é `String @unique @default(uuid()) @db.Uuid`. Com só
`@IsString()`, um código errado ("NAOEXISTE123") ia cru para
`findFirst({ where: { code } })` → P2023 → 500. E a rota **não tinha limite**:
com token de qualquer clínica dava para varrer códigos e anexar proprietários
de terceiros.

Correções: `@IsUUID()` em `LinkClientToCompanyDto.clientCode` e `ThrottlerGuard`
no mesmo padrão de `/user/signin` e `/user/register`
(`@Throttle({ default: { limit: 10, ttl: 60_000 } })`).

```
ANTES  {"clientCode":"NAOEXISTE123"}   500
DEPOIS {"clientCode":"NAOEXISTE123"}   400 {"message":["Código de convite inválido. Confira o código
                                                        informado pelo proprietário."]}
DEPOIS {"clientCode":"<uuid inexistente>"}  404 {"message":"Registro não encontrado..."}
```

Rate limit disparando (varredura de 14 códigos seguidos):

```
 1..8  -> 404 Registro não encontrado
 9..14 -> 429 {"statusCode":429,"message":"Muitas tentativas seguidas. Aguarde cerca de
                um minuto e tente novamente.","code":"TOO_MANY_REQUESTS"}
```

Caminho feliz preservado: `POST /client/link` com o código real do proprietário
→ **201**.

### Extra — 429 do ThrottlerGuard em inglês

Era a única mensagem de guard ainda crua: `"ThrottlerException: Too Many
Requests"`. Traduzida num único ponto no `AllExceptionsFilter`, valendo para
todas as rotas com limite (`/user/signin`, `/user/register`, `/client/auth`,
`/client/link`, códigos de recuperação).

---

## Varredura: outros pontos blindados

Além dos 6 casos da lista, a varredura encontrou e a correção cobriu:

1. **69 rotas DELETE** com uuid malformado (todo o CRUD de fichas: `dentistry-*`,
   `general-*`, `orthopedic-*`, 29 `reproduction-*`, `animal`, `client`, `user`,
   `stud-farm`, `product`, `note`, `lead`, `board`, `tag`, `reminder`, `exam`,
   `deworming`, `vaccine`, `shoeing`, `invoice`, `sanitary-protocol`,
   `product-category`, `owner-note`, `animal-note`).
2. **UUID malformado chegando por query** em fichas cujo `animalId` ainda é
   `@IsString()` — pego pela rede de segurança `P2023`:
   ```
   /reproduction-donor-gyno?page=1&animalId=abc          400 INVALID_UUID
   /reproduction-stallion-collection?page=1&animalId=abc 400 INVALID_UUID
   /general-info?page=1&animalId=abc                     400 INVALID_UUID
   /dentistry-exam?page=1&animalId=abc                   400 INVALID_UUID
   ```
3. **`gender` e `state`** de `GET /appointment-animal`, que eram convertidos com
   `as AnimalGender` / `as AppointmentStatus` sem validação.
4. **`animalId`, `studFarmId`, `protocolId`** em shoeing e sanitary-protocol,
   promovidos de `@IsString()` para `@IsUUID()`.

---

## Segurança: nada foi afrouxado

Empresa B (token próprio, cadastro novo) tentando tocar dados da empresa A com
**uuid válido** — continua barrada exatamente como antes:

```
GET    /animal/by-id/<uuid da empresa A>   404 {"message":"Registro não encontrado..."}
DELETE /animal/<uuid da empresa A>         404 {"message":"Registro não encontrado..."}
GET    /shoeing/<uuid da empresa A>?page=1 403 {"message":"Você não tem permissão para realizar esta ação."}
DELETE /stud-farm/<uuid da empresa A>      403 {"message":"Você não tem permissão para realizar esta ação."}
GET    /sanitary-protocol?page=1&studFarmId=<uuid da empresa A>  403
GET    /appointment-animal?page=1&animalId=<uuid da empresa A>   200 {"animals":[],"pages":0}  (escopo por empresa)
```

Todas as mudanças desta frente **só recusam** entrada; nenhuma libera acesso.
O `ThrottlerGuard` em `/client/link` aperta, não afrouxa.

---

## Arquivos alterados

Novos:

- `src/infra/shared/validation/uuid-param.pipe.ts`
- `src/infra/shared/handler/prisma-error.translator.ts`
- `src/infra/shared/decorators/PageNumber.decorator.ts`
- `src/infra/shared/decorators/IntegerInRange.decorator.ts`

Editados:

- `src/infra/main.ts` — registra o `UuidParamPipe` como pipe global.
- `src/infra/shared/handler/all-exceptions.filter.ts` — chama
  `translatePrismaError`; traduz o 429.
- `src/infra/http/controllers/appointment/dto/appointment.dto.ts` — `month`/`year`.
- `src/infra/http/controllers/appointment/dto/appointmentAnimal.dto.ts` —
  `FetchAppointmentAnimalsDto`, `AppointmentStatusFilter`,
  `AppointmentAnimalGenderFilter`.
- `src/infra/http/controllers/appointment/appointmentAnimal.controller.ts` —
  `GET ''` passa a usar o DTO.
- `src/infra/http/controllers/animal/dto/shoeing.dto.ts` — `ShoeingTypeDto`.
- `src/infra/http/controllers/dto/sanitaryProtocol.dto.ts` —
  `ProtocolItemTypeDto`, `ProtocolTargetCategoryDto`.
- `src/infra/http/controllers/client/dto/client.dto.ts` — `clientCode` uuid.
- `src/infra/http/controllers/client/client.controller.ts` — throttle no `/link`.
- **64 DTOs de listagem** — `@IsNumberString()` → `@PageNumber()` (mais a
  remoção dos imports que ficaram sem uso).

`npx tsc --noEmit` → **exit 0**.

---

## Observação fora do escopo (não corrigida)

`POST /client/auth` com o CPF como senha passou a devolver **401** durante a
sessão (login com senha explícita funciona normalmente). Há trabalho paralelo de
política de senha em `client.dto.ts`/`client.service.ts` nesta mesma branch —
provavelmente é isso. Não é 500, não é desta frente, e não foi tocado. Vale
confirmar com a frente de autenticação antes do lançamento.
