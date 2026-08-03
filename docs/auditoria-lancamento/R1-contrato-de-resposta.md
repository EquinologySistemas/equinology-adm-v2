# R1 — Contrato de resposta do POST

Frente R1 da auditoria de lançamento: **POST que respondia 201 com corpo
vazio**. Quem criava não recebia o id, então o front não conseguia
auto-selecionar o item recém-criado nem navegar para ele — e se virava
reencontrando o registro pelo nome ou comparando a listagem antes/depois.

Data: 03/08/2026. Branch `fix/lancamento`. Repos tocados: `vetequus-api` e
`equinology-web-v2`.

## O padrão adotado

Envelope com a chave do recurso, igual ao que `/product`, `/animal`, `/client` e
`/stud-farm` já faziam:

```json
{ "note": { "id": "...", "...": "..." } }
```

Regras seguidas:

- Sempre pelo **presenter** do módulo. Nenhuma entidade de domínio crua na
  resposta (nada de `_id`/`props`).
- Nenhuma ida extra ao banco: o corpo é montado a partir da entidade que o
  service acabou de gravar.
- Mudança **aditiva**: o status continua 201 e nenhum campo existente mudou de
  formato. Quem ignorava o retorno continua funcionando.

Cadeia alterada em cada módulo: `interfaces/*Props.ts` (o `Either` passou de
`null` para `{ recurso }`) → `*.service.ts` (`return right({ recurso })`) →
`*.controller.ts` (`return { recurso: Presenter.toHTTP(...) }`).

## As seis rotas

| Rota | Antes | Depois | Presenter |
|---|---|---|---|
| `POST /product-category` | 201, 0 bytes | `{ productCategory: {...} }` | `ProductCategoryPresenter` |
| `POST /note` | 201, 0 bytes | `{ note: {...} }` | `NotePresenter` |
| `POST /reminder` | 201, 0 bytes | `{ reminder: {...} }` | `ReminderPresenter` |
| `POST /animal-note` | 201, 0 bytes | `{ animalNote: {...} }` | `AnimalNotePresenter` |
| `POST /user` | 201, 0 bytes | `{ user: {...} }` | `UserPresenter` |
| `POST /appointment` | 201, 0 bytes | `{ appointment: {...} }` | `AppointmentPresenter` (novo) |

### `POST /appointment` — o caso especial

O front não precisa só do id do atendimento: precisa do **id do
AppointmentAnimal** (`appointmentAnimalId`), que é o que as fichas e o
`PUT /appointment-animal/:id` usam. O service agora devolve
`{ appointment, appointmentAnimals }` e o presenter novo
(`src/infra/http/presenters/appointment.presenter.ts`) expõe os dois:

```json
{
  "appointment": {
    "id": "647eaeb3-32b4-4c9b-9a29-a30fd3d8d3c0",
    "description": "", "startDate": "...", "endDate": "...",
    "type": "SERVICE", "userId": "...", "studFarmId": null,
    "companyId": "...", "deletedAt": null,
    "animals": [
      {
        "id": "8fdf78f8-2d5d-441f-8933-4ddff478146f",
        "animalId": "0726a5df-6c7e-40a6-bfe4-2d1cb19822a7",
        "appointmentId": "647eaeb3-32b4-4c9b-9a29-a30fd3d8d3c0",
        "appointmentType": "Consulta",
        "status": "PENDING"
      }
    ]
  }
}
```

`AppointmentPresenter` **não** é `AppointmentDetailsPresenter`. O de detalhes é a
leitura completa dos GET (animal, cliente, responsável, pagamento); este só
mostra o que acabou de ser gravado. Atendimento do tipo `ACTIVITY` sem animais
devolve `"animals": []` — verificado.

## Arquivos alterados

**API (`vetequus-api`)**

```
src/domain/application/services/stock/interfaces/productCategoryProps.ts
src/domain/application/services/stock/services/productCategory.service.ts
src/infra/http/controllers/stock/productCategory.controller.ts

src/domain/application/services/note/interfaces/noteProps.ts
src/domain/application/services/note/services/animal.service.ts   (é o NoteService)
src/infra/http/controllers/note/note.controller.ts

src/domain/application/services/reminder/interfaces/reminderProps.ts
src/domain/application/services/reminder/services/reminder.service.ts
src/infra/http/controllers/reminder/reminder.controller.ts

src/domain/application/services/animal/interfaces/animalNoteProps.ts
src/domain/application/services/animal/services/animalNote.service.ts
src/infra/http/controllers/animal/animalNote.controller.ts

src/domain/application/services/account/interfaces/userProps.ts
src/domain/application/services/account/services/User.service.ts
src/infra/http/controllers/account/user.controller.ts

src/domain/application/services/appointment/interfaces/appointmentProps.ts
src/domain/application/services/appointment/services/appointment.service.ts
src/infra/http/controllers/appointment/appointment.controller.ts
src/infra/http/presenters/appointment.presenter.ts                 (novo)
```

**WEB (`equinology-web-v2`)** — só onde existia remendo por causa do corpo vazio:

```
app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx
app/(dashboard)/_components/sheets/stock/EditProductSheet.tsx
app/(dashboard)/_components/sheets/QuickStartAppointmentSheet.tsx
```

- Nos dois sheets de produto, a categoria recém-criada era reencontrada na
  listagem **pelo nome** (`next.find(c => c.name === nameTrim)`). Com dois nomes
  iguais o front selecionava a categoria errada. Agora usa
  `res.productCategory.id`.
- Em `QuickStartAppointmentSheet`, o atendimento recém-criado era descoberto
  listando o histórico do animal **antes e depois** e comparando os ids. Agora
  usa `res.appointment.id` e `res.appointment.animals[].id` direto.

## Compatibilidade — quem consome estes POST

Verificado arquivo por arquivo antes de mudar. Todos os chamadores ignoravam o
retorno (`await PostAPI(...)` sem atribuição), então acrescentar corpo não
quebra nada:

| Rota | Chamadores no WEB | Chamadores no APP |
|---|---|---|
| `/user` | `services/clinicService.ts:70` | nenhum |
| `/note` | `services/noteService.ts:37`, `CreateNoteSheet.tsx:489` | nenhum |
| `/animal-note` | `services/animalNoteService.ts:52`, `CreateNoteSheet.tsx:482` | nenhum (o app usa `/client-portal/animal-note`) |
| `/reminder` | `services/reminderService.ts:50`, `CreateReminderSheet.tsx:89` | nenhum |
| `/product-category` | `AddProductSheet.tsx`, `EditProductSheet.tsx` | nenhum |
| `/appointment` | `NewAppointmentSheet`, `QuickStartAppointmentSheet`, `ReturnAppointmentSheet`, `ReturnAppointmentAnimalSheet` | só a rota está no `lib/api-routes.ts`; nenhuma chamada |

O `PostAPI` do web (`context/ApiContext.tsx`) só faz `res.json()` quando o
`content-type` é JSON e devolve `undefined` caso contrário — passar de vazio
para JSON é transparente para quem não usa o retorno.

## Verificação

Ambiente: API em `http://localhost:3333`, empresa própria criada para este teste
(`517bea04-5ba0-4512-9cf9-82a190b1b2dd`).

**Antes** — as seis rotas, 201 com zero byte:

```
=== POST /product-category   [HTTP 201 | bytes=0]
=== POST /note               [HTTP 201 | bytes=0]
=== POST /reminder           [HTTP 201 | bytes=0]
=== POST /animal-note        [HTTP 201 | bytes=0]
=== POST /user               [HTTP 201 | bytes=0]
=== POST /appointment        [HTTP 201 | bytes=0]
```

**Depois** — corpo com o recurso (trechos reais):

```
POST /product-category  201  {"productCategory":{"id":"6e24b8d6-d1aa-4214-86fe-ff4c5da7a9ef","name":"Categoria R1 599314","color":"#123456"}}
POST /note              201  {"note":{"id":"1ded1f6c-50e1-42cd-a8e8-5a6a32c51709","name":"Nota R1",...}}
POST /reminder          201  {"reminder":{"id":"7d346bb9-d81a-4dae-9b5c-322ba8018b09","title":"Lembrete R1",...}}
POST /animal-note       201  {"animalNote":{"id":"ec08fc91-9179-4509-b890-9243ac5fecc9","authorType":"VET",...}}
POST /user              201  {"user":{"id":"b2bea69d-2bdb-40f3-ae76-67ccdde4b9a0","role":"COLABORADOR","isAdmin":false,...}}
POST /appointment       201  {"appointment":{"id":"647eaeb3-...","animals":[{"id":"8fdf78f8-...","status":"PENDING"}]}}
```

**Os ids devolvidos existem no banco** (`docker exec vetequus-local psql`):

```
 product_category   | 1
 note               | 1
 reminder           | 1
 animal_note        | 1
 user               | 1
 appointment        | 1
 appointment_animal | 1
```

**O `animals[0].id` é mesmo o `appointmentAnimalId`**: o id devolvido pelo POST
(`8fdf78f8-2d5d-441f-8933-4ddff478146f`) é exatamente o que aparece em
`GET /appointment/fetch?page=1` no atendimento `647eaeb3-…`.

**Lado negativo (nada foi afrouxado)** — mesmas guardas, agora com uma segunda
empresa (`dbff285e-…`):

```
POST /animal-note  com animal de outra empresa      403 NOT_ALLOWED
POST /appointment  com animal/responsável de outra  404 RESOURCE_NOT_FOUND
POST /user         com token de COLABORADOR         403 NOT_ALLOWED
```

Nenhuma das respostas de erro passou a vazar dados do recurso. O `UserPresenter`
não expõe `passwordHash`.

Regressão: `GET /note`, `/reminder`, `/product-category`, `/user`,
`/animal-note/animal/:id`, `/appointment/fetch` e `PUT /product-category/:id`
seguem 200.

## Estado de build

- `equinology-web-v2`: `npx tsc --noEmit` exit 0 e `npm run build` exit 0.
- `vetequus-api`: **não fecha em exit 0 no momento**, mas **nenhum erro está em
  arquivo desta frente**. Os erros são de trabalho em andamento de outras
  sessões no mesmo working tree:
  `adminSignature.service.ts` / `adminSignature.controller.ts` (frente de
  pagamento/assinatura), `account/dto/User.dto.ts` (frente R2 — validação) e
  `prismaAnimalNote.repository.ts` (frente R3 — repositório). O build de watch
  do Nest compilou e serviu as mudanças desta frente normalmente, e os `curl`
  acima foram feitos contra esse processo.

## O que sobrou

- Outros POST fora da lista podem ter o mesmo defeito (`/tag`,
  `/sanitary-protocol`, fichas de saúde etc.) — não foram auditados nesta
  frente.
- `NewAppointmentSheet`, `ReturnAppointmentSheet` e `ReturnAppointmentAnimalSheet`
  ainda ignoram o retorno do `POST /appointment`. Não é bug (recarregam a lista),
  mas agora dá para navegar direto para o atendimento criado.
