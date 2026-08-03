# F1-atendimento

Data: 2026-08-02. API `http://localhost:3333` rodando. Nenhum arquivo `.ts` foi alterado.

Fixture isolada (empresa própria):
- companyId `07961877-b95d-4208-b367-61995fc18629`, userId `79b4903f-e68d-4600-b300-10fd43447de9`
- ClienteA `2c18f415-...`, ClienteB `91b65eca-...`
- animais: Trovao `74a9fca3` (A), Estrela `be4202f9` (A), Relampago `b4fd2bfa` (B)
- empresa 2 (intrusa) criada só para teste de isolamento.
- Scripts usados: `C:\Users\mayco\AppData\Local\Temp\claude\c--Users-mayco-OneDrive-Documentos-Projetos-New-Equinollogy-equinology-adm-v2\5a3c015e-a464-40a0-bd9b-16adcb55f147\scratchpad\f1\`

## Cobertura: 13 / 13 rotas

| Rota | Testado |
|---|---|
| POST /appointment | sim |
| GET /appointment/fetch | sim |
| GET /appointment/daily | sim |
| GET /appointment/monthly | sim |
| GET /appointment/details/:id | sim |
| GET /appointment/client | sim (com token de cliente real via POST /client/token) |
| PUT /appointment/:id | sim |
| DELETE /appointment/:id | sim |
| POST /appointment/:id/reschedule | sim |
| GET /appointment-animal | sim |
| GET /appointment-animal/details/:id | sim |
| PUT /appointment-animal/:id | sim |
| PUT /appointment-animal/details/:id | sim |

Nao testadas: nenhuma.

Lacunas reconhecidas (nao deu tempo / fora do conjunto):
- DELETE de atendimento com Payment/ProductUsage pendurado nao foi isolado: o DELETE ja falha antes disso, com qualquer vinculo animal (achado #2).
- `orderBy=animalName` foi exercitado (200, pagina certa) mas nao validei a ordem alfabetica item a item.
- Nao testei concorrencia (dois PUT simultaneos no mesmo atendimento).

---

## Achados

### 1. BLOQUEIA - GET /appointment/client vaza CPF, e-mail e telefone de OUTROS clientes (CONFIRMADO)

A rota do app do cliente filtra por "atendimento que tenha ao menos UM animal meu", mas devolve o
atendimento INTEIRO, com todos os animais e o objeto `client` completo de cada um.

Reproducao:
1. `POST /client/token {"clientId": <ClienteB>}` -> token de cliente.
2. `GET /appointment/client?page=1` com esse token.

Evidencia (token do ClienteB):
```
1997524e | Trovao   | dono: ClienteA | cpf: 01855225131 | email: clienteaf11477334@t.com | tel: 11977776666
1997524e | Estrela  | dono: ClienteA | cpf: 01855225131 | email: clienteaf11477334@t.com | tel: 11977776666
3099e505 | Trovao   | dono: ClienteA | cpf: 01855225131 | email: clienteaf11477334@t.com | tel: 11977776666
```
O ClienteB nunca deveria ver nada do ClienteA. Basta um atendimento compartilhado (rotina em haras
com varios donos) para expor CPF de terceiro. Origem: `appointment.controller.ts:216` chama
`fetchAppointments({ companyId: undefined, clientId })`, e o `whereFilter` usa
`animals: { some: { animal: { clientId } } }` — filtra o atendimento, nunca poda a lista de animais.

### 2. BLOQUEIA - DELETE /appointment/:id devolve 500 sempre que o atendimento tem algum animal (CONFIRMADO)

`AppointmentAnimal.appointment` nao tem `onDelete: Cascade` (schema.prisma:1707) e o service so
chama `prisma.appointment.delete` (appointment.service.ts:354). Qualquer atendimento SERVICE tem
animal, entao excluir atendimento simplesmente nao funciona.

Reproducao:
- `DELETE /appointment/3099e505-dd27-4962-8e8a-4d226599c973` (3 animais) -> **500** "Nao foi possivel concluir a operacao..."
- `DELETE /appointment/13b6ec7d-...` (1 animal, sem ficha) -> **500**
- `DELETE /appointment/babe560d-...` (ACTIVITY sem animais) -> **200**, some corretamente (GET details -> 404).

Nao deixa orfao (`SELECT count(*) FROM appointment_animals aa LEFT JOIN appointments a ON a.id=aa."appointmentId" WHERE a.id IS NULL` = 0),
mas o usuario recebe erro generico sem saber que precisa remover os animais primeiro.

### 3. BLOQUEIA - PUT /appointment/:id com `animals` apaga o historico de status e troca os ids dos vinculos, com 200 OK (CONFIRMADO)

O service faz `deleteMany` + `createMany` com `status: 'PENDING'` fixo (appointment.service.ts:228-238).
Enviar a MESMA lista de animais (o que o front faz ao salvar o formulario) destroi o progresso.

Reproducao:
1. AP2 `4ae92b3b-91d5-4017-971d-9d34a92128d9` com Trovao + Estrela.
2. `PUT /appointment-animal/8f49b2b7-...` `{"status":"IN_PROGRESS"}` -> 200.
3. `PUT /appointment/4ae92b3b-...` com o mesmo array `animals` -> **200**.
4. `GET /appointment/details/4ae92b3b-...`:
```
antes:  8f49b2b7|Trovao|IN_PROGRESS   5dd459c9|Estrela|PENDING
depois: ac4406ed|Trovao|PENDING       7c06c977|Estrela|PENDING
```
Ids novos, status resetado, `rescheduledTo` zerado. Como o `appointmentAnimalId` e a chave que as
fichas/pagamentos/produtos usam, qualquer registro anterior fica orfao de tela.

### 4. BLOQUEIA - PUT /appointment/:id com `animals` num atendimento COM ficha: 500 e gravacao PARCIAL (CONFIRMADO)

Nao ha transacao: `appointmentRepository.save` roda ANTES do `deleteMany`, que estoura FK contra a
ficha. Resultado: 500 para o usuario, mas as datas/descricao ja foram persistidas.

Reproducao:
1. AP1 `3099e505-...` com 3 animais; `POST /general-info/539740e5-...` -> 201 (ficha do Trovao).
2. `PUT /appointment/3099e505-...` `{"description":"Descricao editada F1", "animals":[...3 animais...]}` -> **500**.
3. Banco:
```
SELECT description FROM appointments WHERE id='3099e505-...';  -->  "Descricao editada F1"
```
A descricao mudou apesar do 500. A ficha sobreviveu (a FK protegeu), mas o efeito pratico e:
**depois que existe qualquer ficha, o atendimento nao pode mais ser editado pelo formulario** — todo
salvamento retorna erro generico e deixa o registro meio-editado.

### 5. BLOQUEIA - Filtro de data de GET /appointment-animal usa a data de CADASTRO, nao a data do atendimento (CONFIRMADO)

`prismaAppointmentAnimal.repository.ts:87` monta `dateFilter.createdAt`. O usuario filtra "atendimentos
de julho" e recebe zero; filtra "hoje" e recebe todos.

Reproducao (registros criados em 2026-08-02, atendimentos agendados para 15/07 e 10/09/2026):
```
GET /appointment-animal?page=1&startDate=2026-07-15&endDate=2026-07-15  -> 200, n=0   (existem 10)
GET /appointment-animal?page=1&startDate=2026-09-10&endDate=2026-09-10  -> 200, n=0   (existe 1)
GET /appointment-animal?page=1&startDate=2026-08-02&endDate=2026-08-02  -> 200, n=10  (todos)
```

### 6. GRAVE - UUID malformado devolve 500 cru em 7 rotas do conjunto (CONFIRMADO)

Nenhum `ParseUUIDPipe` nos `@Param('id')`. O erro do Prisma vaza como 500.

```
GET    /appointment/details/abc                -> 500
PUT    /appointment/abc                        -> 500
DELETE /appointment/abc                        -> 500
POST   /appointment/abc/reschedule             -> 500
GET    /appointment-animal/details/abc         -> 500
PUT    /appointment-animal/abc                 -> 500
PUT    /appointment-animal/details/abc         -> 500
GET    /appointment-animal?page=1&animalId=abc -> 500
```
Com UUID valido inexistente todas devolvem 404 limpo — a checagem existe, so nao cobre o formato.

### 7. GRAVE - PUT /appointment-animal/:id e /details/:id nao validam NADA no corpo (CONFIRMADO)

`appointmentAnimal.controller.ts:19` usa `@Body() body: EditBodyProps` — um `type` TypeScript, que
some em runtime. O DTO `AnimalAppointmentDto` de `appointmentAnimal.dto.ts` existe e nao e usado.

```
PUT /appointment-animal/539740e5-... {"status":"BANANA"}                 -> 500
PUT /appointment-animal/539740e5-... {"status":123}                      -> 500
PUT /appointment-animal/539740e5-... {"appointmentType":999}             -> 500
PUT /appointment-animal/539740e5-... {"appointmentType":"x".repeat(300)} -> 200 e GRAVA 300 chars
```
O `MaxLength(100)` do DTO nunca dispara. O mesmo `appointmentType` no POST /appointment (que usa DTO
de verdade) corta em 100 com 400 correto — as duas portas gravam a mesma coluna com regras diferentes.

Extra: `PUT /appointment-animal/details/:id` aceita `{"status":"RESCHEDULED"}` (200, grava) — marca o
animal como reagendado sem existir reagendamento nenhum, e sem `rescheduledTo`.

### 8. GRAVE - Query param `state` de GET /appointment-animal e status disfarcado; UF derruba a rota (CONFIRMADO)

`prismaAppointmentAnimal.repository.ts:118` faz `status: data.state as AppointmentStatus`.
```
GET /appointment-animal?page=1&state=SP        -> 500
GET /appointment-animal?page=1&state=PENDING   -> 200, n=10
GET /appointment-animal?page=1&state=RESCHEDULED -> 200, n=4
```
O nome `state`, ao lado de `city`/`breed`/`gender` (todos atributos do animal/propriedade), induz o
front a mandar a UF. Qualquer tela que mande `state=SP` cai com 500.

### 9. GRAVE - Paginacao com page <= 0 vira skip negativo e derruba (CONFIRMADO)

```
GET /appointment/fetch?page=0      -> 500
GET /appointment/fetch?page=-1     -> 500
GET /appointment-animal?page=-1    -> 500
GET /appointment/fetch?page=99     -> 200, n=0, pages=2   (ok)
```
`@IsNumberString` aceita "0" e "-1"; nao ha `Min(1)`.

### 10. GRAVE - GET /appointment/monthly aceita mes fora de 1..12 e devolve 500 (CONFIRMADO)

```
GET /appointment/monthly?month=13&year=2026 -> 500
GET /appointment/monthly?month=0&year=2026  -> 500
GET /appointment/monthly?month=abc&year=2026 -> 400 (mensagem clara)
```
O `moment.utc("2026-13-01")` fica invalido e a query estoura. Sem `Min(1)/Max(12)` no DTO.

### 11. GRAVE - endDate anterior ao startDate e aceito e gravado em POST, PUT e reschedule (CONFIRMADO)

```
POST /appointment {"startDate":"2026-10-10T13:00Z","endDate":"2026-10-01T14:00Z"} -> 201
POST /appointment/:id/reschedule {"startDate":"2026-11-20T13:00Z","endDate":"2026-11-01T14:00Z"} -> 201
```
Banco:
```
13b6ec7d | 2026-10-10 13:00 | 2026-10-01 14:00 | AP invertido
28cc18f1 | 2026-11-20 13:00 | 2026-11-01 14:00 | AP3 reschedule
```
Atendimento com duracao negativa entra na agenda e nas views daily/monthly.

### 12. GRAVE - Token de cliente derruba as listagens da clinica com 500 em vez de 403 (CONFIRMADO)

O JWT de cliente traz `companyId: "no-company"`, que vai direto para o `where` como uuid.
```
GET /appointment/fetch?page=1            (token cliente) -> 500
GET /appointment/daily?day=2026-07-15    (token cliente) -> 500
GET /appointment/monthly?month=7&year=2026 (token cliente) -> 500
GET /appointment-animal?page=1           (token cliente) -> 500
```
As rotas por id, em contraste, respondem 403 corretamente. Nao ha vazamento (a query nao casa), mas
o comportamento e 500 em uso previsivel do app do cliente.

### 13. GRAVE - Filtros `city` e `breed` de GET /appointment-animal sao case-sensitive e exact match (CONFIRMADO)

```
GET /appointment-animal?page=1&city=Campinas   -> n=3
GET /appointment-animal?page=1&city=campinas   -> n=0
GET /appointment-animal?page=1&breed=Mangalarga -> n=10
GET /appointment-animal?page=1&breed=mangalarga -> n=0
```
Sem `mode: 'insensitive'` (repositorio linha ~100). O filtro de `appointmentType` em
/appointment/fetch, em comparacao, usa insensitive e funciona nos dois casos.

### 14. GRAVE - GET /appointment-animal nao valida query: `startDate` texto livre -> 500 (CONFIRMADO)

O controller usa `@Query('startDate') startDate?: string` sem DTO.
```
GET /appointment-animal?page=1&startDate=abc -> 500
```
Em /appointment/fetch (que tem DTO) o mesmo caso devolve `400 "Informe uma data valida no campo startDate."`.

### 15. GRAVE - PUT /appointment/:id aceita `animals: []` e descarta em silencio (CONFIRMADO)

```
PUT /appointment/4ae92b3b-... {"animals": []} -> 200
GET /appointment/details/4ae92b3b-...          -> os 2 animais continuam la
```
`if (animals && animals.length > 0)` (appointment.service.ts:227). Nao ha como remover todos os
animais de um atendimento, e a API responde sucesso.

### 16. GRAVE - Nao da para filtrar por RESCHEDULED em GET /appointment/fetch, mas o status existe no banco (CONFIRMADO)

```
GET /appointment/fetch?page=1&status=RESCHEDULED -> 400 "O campo status deve ser um destes valores: PENDING, IN_PROGRESS, FINISHED."
SELECT status, count(*) ... -> PENDING 21, RESCHEDULED 4
```
O enum do Prisma tem 4 valores, o DTO de filtro tem 3. Atendimentos reagendados sao invisiveis para
esse filtro, e `GET /appointment-animal?state=RESCHEDULED` (o outro caminho) devolve os 4 — as duas
listagens divergem.

### 17. GRAVE - Propriedade "orfa" de outra empresa pode ser vinculada ao atendimento (CONFIRMADO)

```
E2: POST /stud-farm {"name":"Haras Intruso","clientId":null,...} -> 201 (69bc3d5e-...)
E1: PUT /appointment/97d76f7d-... {"studFarmId":"69bc3d5e-..."} -> 200, GRAVOU
```
Com propriedade que TEM cliente dono, a guarda funciona: `PUT ... {"studFarmId":"4d74f9e3-..."} -> 403`.
Raiz: `prismaStudFarm.repository.ts` `companyScope` trata propriedade sem cliente/animal/atendimento
como pertencente a qualquer empresa. O impacto aqui e que o nome/endereco da propriedade de outra
empresa aparece no atendimento.

### 18. MENOR - Status do animal nao tem maquina de estados: pula etapa, volta e refinaliza (CONFIRMADO)

Todas as transicoes abaixo retornaram 200 e persistiram:
```
PENDING -> FINISHED    (pulou IN_PROGRESS)
FINISHED -> FINISHED   (finalizou duas vezes)
FINISHED -> PENDING    (voltou)
FINISHED -> IN_PROGRESS
```
Pode ser intencional (permitir correcao), mas hoje nada impede reabrir um atendimento faturado.

### 19. MENOR - `page` e obrigatorio em /appointment/fetch e opcional em /appointment-animal (CONFIRMADO)

```
GET /appointment/fetch          -> 400 "O campo page e obrigatorio."
GET /appointment-animal         -> 200 (assume 1)
GET /appointment-animal?page=abc -> 200 (assume 1, sem avisar)
GET /appointment/fetch?page=abc  -> 400
```

---

## O que passou (nao precisa reauditoria)

**Isolamento entre empresas: 100% correto.** Com o token da empresa 2, contra recursos da empresa 1:
```
GET    /appointment/details/:id        -> 403
PUT    /appointment/:id                -> 403
DELETE /appointment/:id                -> 403
POST   /appointment/:id/reschedule     -> 404
GET    /appointment-animal/details/:id -> 403
PUT    /appointment-animal/:id         -> 403
PUT    /appointment-animal/details/:id -> 403
GET    /appointment/fetch|daily|monthly -> 200 com 0 resultados
GET    /appointment-animal             -> 200 com 0 resultados
POST   /appointment vinculando animal da E1 -> 404
PUT    /appointment {"userId": <user da E1>} -> 403, e o userId NAO mudou (verificado por GET)
PUT    /appointment {"studFarmId": <sf da E1 com dono>} -> 403
```
Banco conferido apos cada tentativa: nada foi alterado.

**Round-trip de POST /appointment**: `startDate`, `endDate`, `type`, `description`, `studFarmId`,
`userId` e o par `animalId`/`appointmentType` de cada animal voltam identicos no
`GET /appointment/details/:id`. Nenhum campo silenciosamente descartado.

**Round-trip de PUT /appointment/:id (sem `animals`)**: `description`, `startDate`, `endDate`, `type`,
`studFarmId` — cada um alterado isoladamente e relido; todos persistiram. `studFarmId: ""` e
`studFarmId: null` desvinculam corretamente (studFarm = null no GET). Os vinculos de animais ficam
intactos quando `animals` nao e enviado.

**POST /appointment/:id/reschedule (split) funciona como documentado**, inclusive com multiplos animais
e acoes mistas:
- `MOVE` move o vinculo (mesmo id) para o novo atendimento e deixa um fantasma `RESCHEDULED` +
  `rescheduledTo` no original. A ficha clinica salva naquele vinculo acompanha o animal (permanece
  legivel via `GET /general-info?animalId=...`).
- `NEW` marca o original como `RESCHEDULED` com `rescheduledTo` e cria um vinculo novo `PENDING` no
  atendimento destino.
- Os animais NAO selecionados ficam parados no atendimento original com status intacto — reagendar um
  animal **nao** arrasta os outros.

**Validacao de entrada do POST/PUT /appointment (que usam DTO) esta boa e em portugues:**
```
sem userId              -> 400 "O campo userId e obrigatorio."
type invalido           -> 400 "O campo type deve ser um destes valores: SERVICE, ACTIVITY."
SERVICE sem animals     -> 400 "Selecione pelo menos um animal para atividades."
animalId "abc"          -> 400 "O campo animalId deve ser um identificador valido."
animalId inexistente    -> 404
appointmentType 300 ch  -> 400 "deve ter no maximo 100 caracteres."
data 31/02              -> 400 "Informe uma data valida"
startDate numerico      -> 400 "Informe uma data valida"
description 2000 ch     -> 400 "deve ter no maximo 1000 caracteres."
clientId incoerente     -> 400 'O animal "Trovao ..." nao pertence ao cliente selecionado.'  (a guarda dispara mesmo)
```
Reschedule: `items: []` -> 400 com texto claro; `action:"XPTO"` -> 400; `appointmentAnimalId:"abc"` ->
400; vinculo de outro atendimento -> 404; data 31/02 -> 400.

**Paginacao de GET /appointment/fetch**: com 17 atendimentos, p1=10 / p2=7 / pages=2, zero sobreposicao
entre paginas, p99 = lista vazia limpa. `GET /appointment-animal` com 22 vinculos: 10/10/2, 22 ids unicos.

**Filtros que funcionam** em /appointment/fetch: `clientId`, `animalId`, `status=FINISHED`,
`appointmentType` (case-insensitive: "Vacinacao" e "vacinacao" dao os mesmos 5), `query` (acha por nome
de animal), `startDate`+`endDate`, lista vazia responde `n=0, pages=0` sem erro.
Em /appointment-animal: `query`, `animalId`, `city` (respeitando o case), `gender`, `breed`, `userId`.

**daily / monthly / fetch mostram o mesmo dado.** Para 2026-07-15: daily=10, monthly(mes 7)=10,
fetch com janela do dia=10, e todos os ids do daily aparecem no fetch. Borda de fuso correta: um
atendimento em `2026-07-21T02:30Z` (23:30 BRT do dia 20) aparece em `daily?day=2026-07-20` e nao em
`daily?day=2026-07-21`.

**Erros de "nao encontrado" com UUID valido** sao 404 limpo e em portugues em todas as rotas:
`GET/PUT/DELETE /appointment/:id`, `GET/PUT /appointment-animal(/details)/:id`.

**DELETE de atendimento sem animais funciona de verdade**: 200 e o `GET /appointment/details/:id`
seguinte devolve 404. Nenhuma linha orfa em `appointment_animals` foi criada por nenhum teste (0).

**GET /appointment/client rejeita token de clinica**: 403 "Esta rota e exclusiva para clientes".
