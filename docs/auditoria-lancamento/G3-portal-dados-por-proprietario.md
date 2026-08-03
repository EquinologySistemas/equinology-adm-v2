# G3 — Portal do cliente: cada proprietário só vê o que é dele

Frente G3 da auditoria de lançamento. Repositório afetado: **vetequus-api**
(branch `fix/lancamento`). Nenhum arquivo de web/app/adm foi alterado.

## O problema

`GET /appointment/client` é a listagem do portal do proprietário. Ela filtrava
**qual atendimento** aparece, mas não **o que vem dentro dele**.

No repositório (`prismaAppointment.repository.ts`) o filtro por cliente era:

```ts
animals: { some: { animal: { clientId } } }
```

`some` é um predicado sobre o atendimento: "traga o atendimento se pelo menos um
animal for deste cliente". Passado esse teste, o `include` carregava a lista
inteira de `appointment_animals` — cada uma com `animal.client` (nome, CPF/CNPJ,
e-mail, telefone) e `Payment` (valor, parcelas, transações).

Resultado: em um atendimento com animais de dois proprietários, o proprietário A
recebia o animal do B com os dados pessoais e os valores cobrados do B.

Agravante: `appointment.controller.ts` chamava `fetchAppointments` com
`companyId: undefined` quando o token era de cliente — de propósito (o cliente
pode ser atendido por mais de uma clínica, `client_companies` é n:n), mas isso
deixava a posse inteiramente por conta do filtro por cliente, que era o filtro
quebrado.

## O que foi feito

Novo parâmetro **`restrictToClientId`**, preenchido **somente** pela rota
`GET /appointment/client` (token de cliente). Ele recorta a lista de animais na
própria consulta:

```ts
animals: {
  where: { animal: { clientId: restrictToClientId } },
  include: { ... }
}
```

### Por que no include e não no presenter

Podar no presenter também esconderia o dado, mas o dado teria saído do banco e
trafegado dentro do processo — qualquer log, qualquer novo campo no presenter,
qualquer rota que reaproveitasse o mesmo objeto voltaria a vazar. Cortar no
`where` do include faz o Postgres nunca devolver a linha do terceiro. É a opção
que não traz o dado do banco, conforme pedido.

### Efeito colateral vigiado: o veterinário

`restrictToClientId` **nunca** é preenchido pelo token de usuário. O
veterinário continua vendo o atendimento inteiro em `fetch`, `daily`, `monthly`
e `details/:id` — inclusive quando ele filtra a listagem por um cliente
(`/appointment/fetch?clientId=...`), caso em que o recorte de conteúdo seria
errado: ali ele está usando o cliente como filtro de busca, não como identidade.
Por isso o parâmetro é separado de `clientId` em vez de reaproveitá-lo.

`restrictToClientId` também vale como filtro de atendimento (em
`whereFilter`, `clientId ?? restrictToClientId`), para não sobrar atendimento
com lista de animais vazia.

## Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `src/infra/shared/database/prisma/repositories/prismaAppointment.repository.ts` | `appointmentDetailsInclude` virou `buildAppointmentDetailsInclude(restrictToClientId?)`, que aplica `where` na relação `animals`. Aplicado nos dois caminhos do `fetch` (o normal e o `orderBy=animalName`). `whereFilter` passou a considerar `restrictToClientId`. As três cópias literais do mesmo include (`getDetailsById`, `monthly`, `daily`) passaram a usar a constante — eram idênticas e divergiriam na próxima mudança. |
| `src/domain/application/repositories/appointment.repository.ts` | `restrictToClientId?: string` no contrato de `fetch`. |
| `src/domain/application/services/appointment/interfaces/appointmentProps.ts` | `restrictToClientId?: string` em `FetchAppointmentsService`. |
| `src/domain/application/services/appointment/services/appointment.service.ts` | Repassa `restrictToClientId` ao `fetch`. Não vai ao `count`: a paginação continua contando atendimentos do cliente, o recorte é só de conteúdo. |
| `src/infra/http/controllers/appointment/appointment.controller.ts` | `GET /appointment/client` passa `restrictToClientId: clientId`. Documentado por que `companyId` fica indefinido. |

Não foi alterado nenhum presenter — a poda acontece antes.

## Verificação com curl

Cenário montado na API local (`http://localhost:3333`), empresa própria
"Clinica G3 Portal":

- 2 clientes: **Alice** (CPF 32085417167) e **Bruno** (CPF 30618062882)
- 1 animal de cada: "Estrela de Alice" e "Trovao de Bruno"
- **1 atendimento com os dois animais** (`POST /appointment` → HTTP 201)
- 1 cobrança para cada: Alice R$ 111,11 e Bruno R$ 999,99 (`POST /payment` → HTTP 201)
- login do proprietário: `POST /client/auth` com senha = CPF → HTTP 201

O ANTES foi medido no **mesmo cenário**, desligando temporariamente só a linha
`restrictToClientId` do controller e esperando o watch recompilar.

### ANTES — `GET /appointment/client` com o token da Alice → HTTP 200

```
animais no atendimento: 2
 - Estrela de Alice | clientCpf= 32085417167 | clientEmail= g3-alice-...@teste.com | clientPhone= 11911111111 | payment= 111.11
 - Trovao de Bruno  | clientCpf= 30618062882 | clientEmail= g3-bruno-...@teste.com | clientPhone= 11922222222 | payment= 999.99
VAZA "Trovao de Bruno"?    true
VAZA "Bruno Proprietario"? true
VAZA CPF de B?             true
VAZA valor 999.99 de B?    true
```

### DEPOIS — `GET /appointment/client` com o token da Alice → HTTP 200

```
animais no atendimento: 1
 - Estrela de Alice | clientCpf= 32085417167 | clientEmail= g3-alice-...@teste.com | clientPhone= 11911111111 | payment= 111.11
VAZA "Trovao de Bruno"?    false
VAZA "Bruno Proprietario"? false
VAZA CPF de B?             false
VAZA valor 999.99 de B?    false
```

O simétrico também vale: autenticado como Bruno, `GET /appointment/client`
(HTTP 200) traz 1 animal ("Trovao de Bruno", payment 999.99) e nada de Alice —
nem o nome do animal, nem o CPF, nem o valor 111.11. `pages: 1` nos dois casos.

### Veterinário continua vendo os dois (mesmo atendimento, token de usuário)

| Rota | HTTP | Animais no atendimento |
| --- | --- | --- |
| `GET /appointment/fetch?page=1` | 200 | **2** — Estrela de Alice (111.11) e Trovao de Bruno (999.99) |
| `GET /appointment/daily?day=2026-08-10` | 200 | **2** |
| `GET /appointment/monthly?month=8&year=2026` | 200 | **2** |
| `GET /appointment/details/{id}` | 200 | **2** |
| `GET /appointment/fetch?page=1&clientId={id do Bruno}` | 200 | **2** — Estrela de Alice e Trovao de Bruno |

A última linha é a que confirma que o recorte não vazou para o lado da clínica:
filtrar a listagem por cliente continua devolvendo o atendimento completo.

## Build

`npx tsc --noEmit` na **vetequus-api**: exit 0.

## Não regride nada da leva anterior

`includeDeleted` e o soft delete de atendimento continuam intactos — o
`deletedScope` segue aplicado em todos os caminhos do `fetch`, inclusive na
segunda consulta do `orderBy=animalName`.
