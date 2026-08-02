# F2-saude-animal

Data: 2026-08-02 | API: http://localhost:3333 (rodando) | Banco: vetequus-local
Empresa de teste criada do zero (isolamento total): companyId `152488b6-0ff4-4b5a-8041-b55fefb5d607`
Animal: `bc0abb33-69b6-41ad-9b14-0e9571f7895d` | Haras: `ba4efa04-fe26-4a2f-b0d4-f3ea778ad8d8` | Cliente: `84786150-ade3-47c7-866f-f0c13d111e6d`

## Cobertura: 27 / 27 rotas testadas

| Rota | Testada |
|---|---|
| POST /vaccine | sim |
| PUT /vaccine/:id | sim |
| DELETE /vaccine/:id | sim |
| GET /vaccine/:animalId | sim |
| GET /vaccine/soon/:animalId | sim |
| POST /deworming | sim |
| PUT /deworming/:id | sim |
| DELETE /deworming/:id | sim |
| GET /deworming/:animalId | sim |
| GET /deworming/soon/:animalId | sim |
| POST /exam | sim |
| PUT /exam/:id | sim |
| DELETE /exam/:id | sim |
| GET /exam/:animalId | sim |
| POST /sanitary-protocol | sim |
| POST /sanitary-protocol/item | sim |
| PUT /sanitary-protocol/:protocolId | sim |
| PUT /sanitary-protocol/item/:itemId | sim |
| DELETE /sanitary-protocol/:protocolId | sim |
| DELETE /sanitary-protocol/item/:itemId | sim |
| GET /sanitary-protocol | sim |
| GET /sanitary-protocol/:protocolId | sim |
| POST /shoeing | sim |
| PUT /shoeing/:id | sim |
| DELETE /shoeing/:id | sim |
| GET /shoeing/:animalId | sim |
| GET /shoeing/soon/:animalId | sim |

**Nenhuma rota ficou de fora.** O que NÃO foi coberto dentro das rotas testadas:
concorrência/corrida (dois PUTs simultâneos), upload real de arquivo (só URL string),
e o comportamento após deletar o animal pai (fora do meu conjunto).

---

## Achados

### 1. BLOQUEIA — App do proprietário recebe 403 em todas as telas de saúde (Vacinas, Vermifugação, Exames, Ferrageamento)
**Confiança: CONFIRMADO.** A suspeita da tarefa está confirmada.

`vaccine.service`, `deworming.service`, `exam.service` e `shoeing.service` resolvem a posse
por `isAnimalFromCompany(animalId, companyId)`. O token de cliente traz `companyId: "no-company"`
(payload real: `{"sub":"<clientId>","companyId":"no-company","type":"client"}`), então a
comparação nunca casa e a leitura é sempre negada. Não há tratamento de `tokenType === 'client'`
em nenhum desses quatro services — só `sanitaryProtocol.service` tem.

Reprodução:
```
POST /client/token {"clientId":"<meu cliente>"}   -> accessToken de cliente
GET /vaccine/bc0abb33-69b6-41ad-9b14-0e9571f7895d?page=1   -> 403 NOT_ALLOWED
GET /vaccine/soon/<animalId>                               -> 403
GET /deworming/<animalId>?page=1                           -> 403
GET /exam/<animalId>?page=1                                -> 403
GET /shoeing/<animalId>?page=1                             -> 403
GET /shoeing/soon/<animalId>                               -> 403
```
O animal É do cliente dono do token (criado por mim com esse `clientId`).

Impacto real (não é teórico): o app do proprietário chama exatamente essas rotas —
`equinology-app-v2/lib/api-routes.ts` linhas 25-49, consumidas em
`app/(animal)/health/vaccines.tsx:32`, `health/dewormings.tsx:32`, `health/shoeing.tsx:44`
e `health/index.tsx:46-49`. As quatro telas de saúde e o resumo de saúde do app do
proprietário estão 100% quebrados no lançamento.

### 2. BLOQUEIA — Tela de Protocolos do app do proprietário sempre dá 400 (falta studFarmId)
**Confiança: CONFIRMADO.**

`GET /sanitary-protocol` exige `studFarmId` obrigatório (`FetchSanitaryProtocolDto`, `@IsNotEmpty`).
O app chama sem ele: `ApiRoutes.SanitaryProtocol.list + "?page=1"` em
`app/(animal)/health/protocols.tsx:34` e `app/(animal)/health/index.tsx:50`.

Reprodução (token de cliente):
```
GET /sanitary-protocol?page=1
-> 400 {"message":["O campo Haras é obrigatório","Escolha um Haras válido"]}
```
Com `studFarmId` correto o cliente lê normalmente (200). O suporte a token de cliente existe
e funciona nesse endpoint — o que quebra é o contrato exigido pelo app.

### 3. BLOQUEIA — `nextDate: null` não limpa a próxima dose em nenhuma ficha; API responde 200 mentindo
**Confiança: CONFIRMADO.** Sétimo caso de "a checagem existe e nunca funciona" desta base.

`vaccine.service`, `deworming.service` e `exam.service` têm o código explícito
`if (nextDate !== undefined) x.nextDate = nextDate;` — com comentário dizendo que serve
para limpar a próxima dose. Nunca dispara: o `StrictDate` decorator
(`src/infra/shared/decorators/StrictDate.decorator.ts`) converte `null` em `undefined`
antes de chegar no service:
```ts
if (value === null || value === undefined || value === '') return undefined;
```
`shoeing.service` nem tenta: usa `nextDate ?? shoeing.nextDate`.

Reprodução:
```
POST /vaccine {...,"nextDate":"2026-07-10"}            -> 201
PUT  /vaccine/<id> {"nextDate":null}                   -> 200
GET  /vaccine/<animalId>?page=1  -> nextDate ainda "2026-07-10T00:00:00.000Z"
```
Confirmado no banco:
`select "nextDate" from vaccines where id='56b33d6b-...'` -> `2026-09-01 00:00:00`

Mesmo comportamento reproduzido em `PUT /deworming/:id`, `PUT /exam/:id` e `PUT /shoeing/:id`.
O usuário que quiser remover um reforço agendado errado não consegue por nenhuma via —
a API diz "salvo" e o lembrete continua disparando.

### 4. GRAVE — PUT /deworming/:id devolve 400 se o front não repetir o id no corpo
**Confiança: CONFIRMADO.**

`EditDewormingDto.dewormingId` é `@IsNotEmpty` (todos os irmãos — `EditVaccineDto.vaccineId`,
`EditExamDto.examId` — são `@IsOptional`, e o controller ignora o campo do corpo de qualquer jeito,
usando `@Param('id')`).

Reprodução:
```
PUT /deworming/8cb3c660-04bb-4212-92a6-41a014765209 {"name":"Verm B"}
-> 400 {"message":["O campo Vermifugação é obrigatório","Escolha uma Vermifugação válida"]}
```
Com `{"dewormingId":"<mesmo id>","name":"Verm B"}` -> 200. A edição de vermifugação só funciona
para quem descobrir essa exigência não documentada.

### 5. GRAVE — Valor de enum inválido derruba a rota com 500 (POST/PUT/GET)
**Confiança: CONFIRMADO.** Atinge 6 rotas.

Os DTOs validam esses campos só com `@IsString()`, mas as colunas são enums Prisma
(`ShoeingType`, `ProtocolItemType`, `ProtocolTargetCategory`). Qualquer valor fora da lista
estoura no driver.

Reprodução:
```
POST /shoeing {"type":"BANANA","animalId":"<id>","date":"2026-01-15"}     -> 500
POST /shoeing {"type":"trimming",...}  (só o caixa errado)                -> 500
PUT  /shoeing/<id> {"type":"XPTO"}                                        -> 500
GET  /shoeing/<animalId>?page=1&type=BANANA                               -> 500
POST /sanitary-protocol/item {"protocolId":"<id>","name":"X","type":"BANANA","isRecurrent":true} -> 500
PUT  /sanitary-protocol/<id> {"targetCategory":"BANANA"}                  -> 500
```
Mensagem devolvida: "Não foi possível concluir a operação... entre em contato com o suporte".
O filtro `type` na listagem é o mais perigoso: um link salvo com typo derruba a tela de ferrageamento.

### 6. GRAVE — `page=0` e `page=-1` devolvem 500 em todas as listagens do módulo
**Confiança: CONFIRMADO.**

`skip: (page - 1) * 10` vira negativo e o Prisma rejeita. `page=abc` e `page` ausente são
tratados corretamente (400), mas o zero/negativo passa pelo `@IsNumberString` e explode.

Reprodução:
```
GET /vaccine/<animalId>?page=0                       -> 500
GET /vaccine/<animalId>?page=-1                      -> 500
GET /deworming/<animalId>?page=0                     -> 500
GET /exam/<animalId>?page=0                          -> 500
GET /shoeing/<animalId>?page=0                       -> 500
GET /sanitary-protocol?page=0&studFarmId=<id>        -> 500
```

### 7. GRAVE — UUID malformado devolve 500 cru em todas as 27 rotas
**Confiança: CONFIRMADO.**

Nenhum `ParseUUIDPipe` em nenhuma rota do conjunto. Qualquer id não-UUID chega ao Postgres
e vira `invalid input syntax for type uuid`.

Reprodução (amostra, o padrão se repete em todas):
```
GET    /vaccine/abc?page=1                            -> 500
GET    /vaccine/soon/abc                              -> 500
PUT    /vaccine/abc {"name":"Z"}                      -> 500
DELETE /vaccine/abc                                   -> 500
POST   /vaccine {...,"animalId":"abc"}                -> 500
GET    /deworming/abc?page=1                          -> 500
GET    /exam/abc?page=1                               -> 500
GET    /sanitary-protocol/abc                         -> 500
GET    /sanitary-protocol?page=1&studFarmId=abc       -> 500
```
Com UUID válido inexistente a resposta é limpa (404 ou 403). O problema é só o formato.

### 8. GRAVE — Aceita usuário de OUTRA empresa como responsável pela ficha
**Confiança: CONFIRMADO.**

Nenhum service valida que o `userId` informado pertence à empresa do token. O vínculo
cross-tenant é gravado sem erro.

Reprodução:
```
# usuário 74c8c4ca-a401-4a6d-8b28-c2898c194e41 pertence à empresa f4e2f01e-...
POST /vaccine   {"name":"UserCross","date":"2026-01-01","location":"L","animalId":"<meu animal>","userId":"74c8c4ca-..."} -> 201
POST /exam      {...,"userId":"74c8c4ca-..."}      -> 201
POST /shoeing   {...,"userId":"74c8c4ca-..."}      -> 201
POST /deworming {...,"userId":"74c8c4ca-..."}      -> 201
```
Confirmado no banco (empresa do usuário ≠ empresa do animal):
```
 UserCross | 74c8c4ca-... | user_company f4e2f01e-... | animal_company 152488b6-...
```
Grava dado errado permanentemente e cria referência entre tenants. Qualquer tela ou
relatório futuro que resolva o nome do responsável vai exibir o nome de um funcionário
de outra clínica.

### 9. GRAVE — `userId` inexistente derruba a rota com 500 (violação de FK não tratada)
**Confiança: CONFIRMADO.**

```
POST /vaccine {...,"userId":"00000000-0000-0000-0000-000000000000"}  -> 500
POST /shoeing {...,"userId":"00000000-0000-0000-0000-000000000000"}  -> 500
```
O UUID é válido, o registro não existe. Deveria ser 404/400 com mensagem, é 500.

### 10. MENOR — `periodDays` negativo aceito no item de protocolo sanitário
**Confiança: CONFIRMADO.**

```
POST /sanitary-protocol/item {"protocolId":"<id>","name":"Neg","type":"EXAM","periodDays":-500,"isRecurrent":false} -> 201
PUT  /sanitary-protocol/item/<id> {"periodDays":0}  -> 200, persiste 0
```
Sem `@Min(1)` no DTO. Um protocolo com período negativo/zero gera agendamento sem sentido.

### 11. MENOR — /exam não tem rota `soon`, apesar de ter `nextDate`
**Confiança: CONFIRMADO.**

`vaccine`, `deworming` e `shoeing` têm `GET /<recurso>/soon/:animalId`. `exam` grava e devolve
`nextDate` mas não tem a rota equivalente — `GET /exam/soon/<animalId>` retorna
`404 Cannot GET /exam/soon/...`. Exame com renovação vencendo não aparece em nenhum alerta.
`equinology-app-v2/lib/api-routes.ts` confirma: o bloco `Exam` não tem `soon`.

### 12. MENOR (observação de escopo) — Nenhuma ficha de saúde tem vínculo com atendimento
**Confiança: CONFIRMADO por leitura de schema.**

Os modelos `Vaccine`, `Deworming`, `Exam` e `Shoeing` (`prisma/schema.prisma` linhas 1849-1946)
só têm FK para `animal` e `user`. Não existe `appointmentId` nem `appointmentAnimalId`.
O foco "vínculo com atendimento" da auditoria não tem o que testar: a funcionalidade não existe.
Registrar a vacina aplicada durante um atendimento não deixa rastro do atendimento.

---

## O que passou (não precisa reauditar)

**Isolamento entre empresas — sólido nas 27 rotas.** Com o token da minha empresa, contra
recursos da empresa `f4e2f01e-49fb-4ccd-b02c-df1d645aeca5`:
- Ler / editar / apagar vacina, vermifugação, exame e ferrageamento de outra empresa: 403 em todos.
- Criar ficha em animal de outra empresa: 403.
- Mover ficha minha para animal de outra empresa via `PUT {"animalId":"<outra>"}`: 403, banco inalterado.
- Protocolo sanitário: listar, ler por id, criar, editar, apagar, criar item, editar item e
  apagar item em haras de outra empresa: 403 nas 8 rotas. Confirmado no banco que
  `Protocolo Anual de Éguas` e seus 3 itens continuam intactos.
- Token de cliente lendo protocolo de haras de outro cliente: 403.

**Próxima dose opcional — sem injeção de data falsa.** `POST` sem `nextDate` grava `null`
(não inventa data). Confirmado em vaccine, deworming, exam e shoeing. O bug histórico não voltou.
(O que não funciona é *limpar* uma data já gravada — achado 3.)

**Ida e volta campo a campo.** Todo campo enviado voltou com o mesmo valor, em criação e edição:
- vaccine: name, date, nextDate, location, description, fileUrl, animalId, attachments
- deworming: name, date, nextDate, description, fileUrl, attachments
- exam: name, date, nextDate, laboratory, result, resultFileUrl, attachments
- shoeing: type, date, nextDate, farrierName, description, photoUrl
- protocolo: name, description, targetCategory | item: name, type, periodDays, isRecurrent, observation
Nenhum campo aceito e descartado em silêncio (fora do `nextDate: null`).
`isRecurrent: false` e `periodDays: 0` persistem corretamente (não são engolidos pelo `??`).

**Anexos.** `attachments[]` substitui a lista inteira, mantém `order`, e a coluna legada
`fileUrl` é reescrita no formato multi-linha coerente. `{"url":""}`, `{"foo":"bar"}` e
`attachments:"string"` devolvem 400 com mensagem clara em português.
DELETE da ficha apaga os anexos junto (verificado por SQL: 2 -> 0 em vaccine, 1 -> 0 em deworming,
1 -> 0 em exam). Não deixa órfão.

**DELETE.** Todas as 6 rotas de exclusão: 200 no primeiro, 404 limpo no segundo, registro
some do GET e do banco. `DELETE /sanitary-protocol/:id` faz cascade correto nos itens
(3 itens -> 0, confirmado por SQL).

**Paginação e filtros (page >= 1).** 11+ registros: page=1 traz 10, page=2 traz o resto,
`pages` bate com o total, page além do fim devolve lista vazia com `pages` correto,
lista vazia responde `{"...":[],"pages":0}`. Ordenação estável (`createdAt desc, id desc`).
Testado em vaccine, exam e sanitary-protocol. Filtro `query` casa por substring ignorando
acento/caixa e o `count` acompanha o filtro. Filtros do shoeing (`type` válido, `startDate`,
`endDate`) retornam o recorte certo.

**Datas impossíveis.** `2026-02-30` e `2026-02-31` (corpo e query string) devolvem
400 "Informe uma data válida". O `StrictDate` funciona para isso.

**Validação de obrigatórios.** Campo ausente ou tipo errado devolve 400 com mensagem em
português legível ("O campo Nome é obrigatório", "O campo Laboratório é obrigatório",
"O campo Haras é obrigatório", "Insira uma página válida").

**Escrita bloqueada para token de cliente.** `POST /sanitary-protocol` e `/sanitary-protocol/item`
com token de cliente: 403 "Esta rota é exclusiva para usuários da clínica". As demais rotas
de escrita também barram (por efeito colateral do achado 1, mas barram).

**`soon` (janela de 15 dias).** Registro com `nextDate` a 8 dias aparece; a 30 dias não aparece.
Comportamento correto e consistente em vaccine, deworming e shoeing.

**String de 20.000 caracteres em `name`:** 201, sem 500 (colunas são `text`).
