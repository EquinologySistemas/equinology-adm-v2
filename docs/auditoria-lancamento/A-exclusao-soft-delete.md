# Frente A — Exclusão por soft delete + posse do animal

Branch: `fix/lancamento` (API). Nada foi commitado.
Verificação: curl real contra `http://localhost:3333` + SQL no `vetequus-local`.
`npx tsc --noEmit` na API: **exit 0**.

---

## 1. Decisão do dono

> "Preciso ter a exclusão de clientes, propriedades, animais e appointments.
> Coisas que quebrariam em cascata, só de soft delete, mudando o status dele
> para deletado, e não faça puxar nos filtros. Em telas específicas, como a de
> appointments, ele não mostra, a menos que a pessoa selecione o filtro de
> deletados."

> "Sequestro de animal deve ser resolvido com um aviso: esse animal (nome do
> animal) já está em uso, se ele for seu, entre em contato com um administrador."

---

## 2. O que estava quebrado (reproduzido ANTES da correção)

| Rota | Antes |
|---|---|
| `DELETE /appointment/:id` | **500** — `appointment_animals.appointmentId` é RESTRICT; todo atendimento tem animal, então falhava 100% das vezes |
| `DELETE /client/:clientId` | **500** — cliente com animal estoura FK |
| `DELETE /stud-farm/:id` | **404** — a rota simplesmente não existia |
| `DELETE /animal/:id` | **404** — a rota simplesmente não existia |
| `clients.deletedAt` | coluna existia e **nenhum** fetch/count/find a usava: cliente "excluído" continuava listado, pesquisável e selecionável nos combos |
| `PUT /animal/:id` (corpo vazio) | code `2akhi3nc` → `mj7g2ozt` — regenerava o convite a cada edição |
| `POST /animal/register/:code` | **201** — token da empresa B tomou o animal da empresa A (`companyId` 2e129a8b → a308b3f6) |
| `GET /animal/:code` | **200** com a ficha inteira de outra clínica: id, foto, `companyId`, `clientId`, `clientName`, `studFarmName` |
| `GET /stud-farm` | propriedade órfã (sem cliente) criada por A aparecia na lista de B e `PUT` de B respondia **200**, renomeando-a |

---

## 3. Migration

`prisma/migrations/20260802184137_soft_delete_stud_farm_animal_appointment/migration.sql`

Aditiva, só colunas nullable — nada é apagado nem alterado de tipo:

- `animals.deletedAt TIMESTAMP(3)`
- `appointments.deletedAt TIMESTAMP(3)`
- `stud_farms.deletedAt TIMESTAMP(3)`
- `stud_farms.companyId UUID` **+ backfill**

`clients.deletedAt` já existia (rodada anterior) — foi apenas **ligado**.

### Por que `stud_farms.companyId`

`stud_farms` não tinha dono próprio: a posse era 100% derivada
(cliente → empresa, animal, atendimento). O último ramo do `companyScope` era
"sem cliente E sem animal E sem atendimento" — **sem nenhuma amarração com a
empresa**. Consequência: toda propriedade órfã ficava visível *e editável* por
todas as empresas, e `belongsToCompany` usa esse mesmo escopo. Pior: excluir o
cliente deixaria a propriedade órfã e a jogaria nesse ramo.

Backfill (na própria migration), na mesma ordem de derivação que já existia:
1. empresa dos animais da propriedade (quando única);
2. empresa dos atendimentos da propriedade (quando única);
3. empresa do cliente dono (quando ele pertence a exatamente uma).

Resultado no banco local: **35 de 42** propriedades ganharam dono.
As **7 restantes** não têm nenhum vínculo do qual derivar a empresa — são
exatamente as linhas que hoje vazavam para todo mundo. Elas ficam com
`companyId = NULL` e passam a **não aparecer para ninguém** (nem editáveis).
É a direção segura: dado inatribuível deixa de ser dado de todo mundo.

---

## 4. Nome do parâmetro de filtro: `includeDeleted`

Um nome só, igual nas 4 entidades. Ausente ou qualquer valor diferente de
`true`/`1` = comportamento padrão (**não mostra excluído**).

- `GET /client?page=1&includeDeleted=true`
- `GET /stud-farm?page=1&includeDeleted=true`
- `GET /animal?page=1&includeDeleted=true`
- `GET /appointment/fetch?page=1&includeDeleted=true`

Os presenters passaram a devolver `deletedAt` (client, animal, animalDetails,
studFarm, appointmentDetails) para o front conseguir marcar a linha como
excluída.

**A agenda não tem o parâmetro de propósito:** `GET /appointment/monthly` e
`GET /appointment/daily` sempre escondem o excluído.

---

## 5. Arquivos alterados

### Schema / migration
- `prisma/schema.prisma` — `deletedAt` em `StudFarm`, `Animal`, `Appointment`; `companyId` em `StudFarm`
- `prisma/migrations/20260802184137_soft_delete_stud_farm_animal_appointment/migration.sql`

### Domínio
- `src/domain/enterprise/entities/animal.ts`, `studFarm.ts`, `appointment.ts` — `deletedAt` (e `companyId` no studFarm)
- `src/domain/enterprise/entities/valueObject/animalDetails.ts`, `appointmentDetails.ts` — `deletedAt`
- `src/domain/application/repositories/{client,studFarm,animal,appointment}.repository.ts` — `delete()` virou `softDelete(id)`; `includeDeleted` nos filtros; `findById(id, includeDeleted?)`
- `src/domain/application/services/client/{interfaces/clientProps.ts,services/client.service.ts}`
- `src/domain/application/services/studFarm/{interfaces/studFarmProps.ts,services/studFarm.service.ts}`
- `src/domain/application/services/animal/{interfaces/animalProps.ts,services/animal.service.ts}`
- `src/domain/application/services/appointment/{interfaces/appointmentProps.ts,services/appointment.service.ts}`

### Infra
- `src/infra/shared/database/prisma/repositories/prisma{Client,StudFarm,Animal,Appointment}.repository.ts`
- `src/infra/shared/database/prisma/mappers/Prisma{Animal,StudFarm,Appointment,AnimalDetails,AppointmentDetails}Mapper.ts`
- `src/infra/http/presenters/{client,animal,animalDetails,studFarm,appointmentDetails}.presenter.ts`
- `src/infra/http/controllers/{client,studFarm,animal,appointment}/*.controller.ts` e seus `dto/`

---

## 6. Varredura dos caminhos de leitura (o ponto que faz a correção valer)

Todo caminho que lê essas 4 tabelas agora filtra `deletedAt IS NULL` por padrão:

**Cliente** — `fetch`, `count`, `fetchByCompanyId`, `countByCompanyId`,
`findById`, `findByCode`, **`isLinkedToCompany`**.
`isLinkedToCompany` é o mais importante: é a guarda de posse usada por animal,
propriedade e atendimento. Sem ela um cliente excluído continuaria sendo aceito
como dono em toda criação. `findByEmail`/`findByCpf` continuam sem filtro **de
propósito** — são a checagem de duplicidade contra os índices `@unique`;
filtrar ali faria o cadastro passar da validação e estourar 500 na constraint.

**Propriedade** — `fetch`, `count`, `findById`, `findByCode`,
`fetchByClientId`, `belongsToCompany`, `belongsToClient`.

**Animal** — `fetch`, `count` (via `whereFilter`), `findById`,
`findDetailsById`, `findByCode`, `findByCompanyIdAndCode`.
A busca textual em SQL cru (`searchIdsByText`) é sempre interseccionada com o
`whereFilter`, então herda o filtro.

**Atendimento** — `fetch` (inclusive o ramo de ordenação por nome de animal,
que faz uma segunda consulta por ids), `count`, `findById`, `getDetailsById`,
`monthly`, `daily`.

`src/infra/shared/auth/session-validity.ts` já derrubava o token do cliente com
`deletedAt` — o app do proprietário excluído recebe 401 na hora. Não precisou
de mudança.

---

## 7. Posse do animal

### 7.1 `POST /animal/register/:code` — sequestro
Não havia **nenhuma** checagem: quem chamasse com um code válido reatribuía
`clientId`/`companyId` para si e o dono original perdia o animal em silêncio.

Agora o vínculo só acontece sobre um lado **vago**:
- `animals.clientId` é NOT NULL — se não é o solicitante, é de outra pessoa: recusa;
- `companyId` vago → vincula (é o fluxo legítimo: animal criado no app sendo
  puxado por uma clínica);
- `companyId` de outra empresa → recusa.

Recusa = **409** com a mensagem do dono, incluindo o nome do animal:

```
Esse animal (Estrela do Norte II) já está em uso, se ele for seu, entre em
contato com um administrador.
```

O 409 "já vinculado a você / a esta clínica" (`AnimalAlreadyRegisteredError`)
continua igual, para o front seguir mandando o usuário para a lista.

### 7.2 `PUT /animal/:id` — regeneração do code
`animal.service.ts` regerava `code` a cada edição em que houvesse `companyId`,
inclusive num PUT vazio, invalidando convites já entregues. **Removido.**
O code só nasce no `create`.

### 7.3 `GET /animal/:code` — vazamento
A rota responde para qualquer token autenticado e devolvia a ficha inteira de
outra clínica. Agora devolve só o mínimo para a pessoa reconhecer o animal
antes de aceitar o vínculo:

```json
{ "animal": { "name": "...", "breed": "...", "alreadyLinked": true } }
```

`alreadyLinked` deixa o front avisar antes do POST. O throttle de 5/min por IP
continua. **Nenhum front consome essa rota hoje** (confere: só
`equinology-app-v2/components/sheets/AnimalRegistrationSheet.tsx:188` usa
`/animal/register/:code`), então a redução de payload não quebra tela.

---

## 8. Guardas de posse adicionadas nos novos DELETEs

`DELETE /animal/:id` e `DELETE /stud-farm/:id` são rotas novas: nasceram já com
a mesma guarda do respectivo `edit`.
- animal: token de cliente só exclui animal dele; empresa só exclui animal dela;
- propriedade: token de cliente só exclui propriedade dele; empresa só exclui
  o que está no `companyScope` corrigido.

`DELETE /client/:clientId` e `DELETE /appointment/:id` já tinham guarda; foi
mantida.

---

## 9. Verificação (códigos HTTP e SQL que eu vi)

### 9.1 As 4 entidades — excluir, sumir, reaparecer com o filtro

| | ANTES | DEPOIS | linha no banco | listagem padrão | `includeDeleted=true` |
|---|---|---|---|---|---|
| `DELETE /animal/:id` | 404 (rota inexistente) | **200** + mensagem | continua, `deletedAt=2026-08-02 18:51:19` | `n=0` | `n=1` |
| `DELETE /appointment/:id` | **500** | **200** + mensagem | continua, `deletedAt=2026-08-02 18:51:30`; `appointment_animals` intactos (1 linha) | `fetch n=0`, `monthly n=0`, `daily n=0` | `n=1` |
| `DELETE /stud-farm/:id` | 404 (rota inexistente) | **200** + mensagem | continua, `deletedAt=2026-08-02 18:51:41` | `n=0` | `n=1` |
| `DELETE /client/:clientId` | **500** | **200** + mensagem | continua, `deletedAt=2026-08-02 18:51:41` | `n=0` | `n=1` |

Efeitos colaterais checados no registro excluído:
`GET /appointment/details/:id` → 404 · `GET /animal/by-id/:id` → 404 ·
`GET /stud-farm/code/:code` → 404 · `PUT /stud-farm/:id` → 404 ·
segundo DELETE das 4 rotas → 404 (não ressuscita, não dá 500).
`POST /appointment` com animal excluído → **404**.
`POST /animal` com cliente excluído → **404**.

### 9.2 Furo da propriedade órfã — dois tokens de empresas diferentes

Empresa A `2e129a8b-…`, empresa B `a308b3f6-…`.

ANTES: propriedade sem cliente criada por A →
`GET /stud-farm?query=Orfa` com token de B: **200, aparece** ·
`PUT /stud-farm/:id` com token de B: **200**, banco passou a `SEQUESTRADA POR B`.

DEPOIS (`de867dc6-…`, `companyId=2e129a8b-…` gravado no create):
- A lista → `n=1`
- **B lista → `n=0`**
- **B `PUT` → 403** `Você não tem permissão para realizar esta ação.`
- **B `DELETE` → 403**; banco continua `Orfa Pos Fix FA`, `deletedAt` vazio

Cenário do efeito colateral (excluir cliente deixa a propriedade órfã):
cliente `1fe8fe98-…` com propriedade `3b266943-…`, cliente excluído →
B lista `n=0`, B `PUT` **403**, A continua vendo `n=1`.

### 9.3 Posse do animal

- **PUT não regenera mais o code**: `l00jnuh4` antes → PUT vazio 200 → PUT com
  nome 200 → `l00jnuh4` depois.
- **Sequestro por outra empresa (token de empresa B)**: antes **201** e o
  `companyId` mudava; agora **409**
  `Esse animal (Estrela do Norte II) já está em uso, se ele for seu, entre em
  contato com um administrador.` e o `companyId` continua `2e129a8b-…`.
- **Sequestro pelo app (token de cliente de outra empresa)**: **409**, mesma
  mensagem.
- **Fluxo legítimo preservado**: animal criado no app (`companyId=null`) →
  clínica B vincula pelo code → **201**; clínica A tentando depois → **409**
  `Esse animal (Potro do App) já está em uso…`.
- **`GET /animal/:code`**: `{"animal":{"name":"Estrela do Norte
  II","breed":"Mangalarga","alreadyLinked":true}}` — sem id, foto, companyId,
  clientId, nome do cliente ou da propriedade.
- **Isolamento no DELETE**: B excluindo animal de A → **404**.

### 9.4 Compilação

`npx tsc --noEmit` na API → **exit 0**.

---

## 10. Pendência conhecida — NÃO é da minha frente

`GET /appointment-animal` **continua devolvendo o atendimento e o animal
excluídos**. Verificado depois da correção: a resposta trouxe o animal
`efd8e7c7-…` (`deletedAt` preenchido) com o atendimento e a propriedade
excluídos junto.

Arquivo: `src/infra/shared/database/prisma/repositories/prismaAppointmentAnimal.repository.ts`,
método privado `buildWhere`. **Não editei**: outro agente está mexendo nessa
mesma função (o achado do filtro de data que usa `createdAt` em vez de
`appointment.startDate`, linha ~87), e a orientação é não cruzar frentes.

Patch necessário (2 linhas), dentro do `return` do `buildWhere`:

```ts
appointment: {
  companyId: data.companyId,
  deletedAt: null,          // <— adicionar
},
```

e no `animalFilter`:

```ts
const animalFilter: Prisma.AnimalWhereInput = {
  deletedAt: null,          // <— adicionar
  gender: ...,
};
```

Sem isso, a tela que consome `/appointment-animal` volta a mostrar atendimento
e animal excluídos.
