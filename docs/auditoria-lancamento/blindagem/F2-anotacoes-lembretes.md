# F2-anotacoes-lembretes

Data: 2026-08-02. API em `http://localhost:3333`, banco `vetequus-local`.
Fixtures proprias: empresa A `5811c210-9f9e-4480-8fb5-40dadd606b82`, empresa B
`1cfb5c4c-1cea-4223-b482-ea55e6172c2d` (criada para provar isolamento entre empresas).
Nenhum arquivo `.ts` foi alterado.

## Cobertura: 21 / 21 rotas

| Rota | Metodo | Testada |
|---|---|---|
| `/note` | POST | sim |
| `/note/:id` | PUT | sim |
| `/note/:id` | DELETE | sim |
| `/note/by-date` | GET | sim |
| `/note` | GET | sim |
| `/animal-note` | POST | sim |
| `/animal-note/:animalNoteId` | PUT | sim |
| `/animal-note/:animalNoteId` | DELETE | sim |
| `/animal-note/animal/:animalId` | GET | sim |
| `/animal-note/company` | GET | sim |
| `/animal-note/by-date` | GET | sim |
| `/owner-note/:appointmentAnimalId` | POST (upsert) | sim |
| `/owner-note/record/:ownerNoteId` | PUT | sim |
| `/owner-note/record/:ownerNoteId` | DELETE | sim |
| `/owner-note/:appointmentAnimalId` | GET | sim |
| `/reminder` | POST | sim |
| `/reminder/:id` | PUT | sim |
| `/reminder/:id` | DELETE | sim |
| `/reminder/health-due` | GET | sim |
| `/reminder/by-date` | GET | sim |
| `/reminder` | GET | sim |

**Nao testadas: nenhuma.** Ficou de fora do escopo (usado so como apoio):
anexos reais em owner-note (`attachments` foi sempre enviado vazio — o upload de
arquivo em si nao foi exercitado), e o efeito de cascade ao deletar o
`Appointment` inteiro.

---

## Achados

### 1. BLOQUEIA — `POST /owner-note/:appointmentAnimalId` nao valida o atendimento: escrita cross-tenant, vazamento para o app do proprietario de outra clinica e bloqueio permanente do registro

CONFIRMADO.

`OwnerNoteService.upsert` (`src/domain/application/services/animal/services/ownerNote.service.ts`)
valida **apenas** o `animalId` do body contra o `companyId` do token. O
`appointmentAnimalId`, que vem na URL e e a chave unica do registro, nunca e
verificado: nao se checa se aquele `AppointmentAnimal` pertence a empresa do
token nem se o animal do body e o animal daquele atendimento.

Reproducao (empresa A ataca empresa B):

```
# A cria a anotacao no atendimento da empresa B, passando um animal proprio
POST /owner-note/bf8b6789-37a0-439f-8ba4-15c482532b47   (appointmentAnimal da empresa B)
Authorization: <token empresa A>
{"animalId":"4a8c28dd-...","userId":"b0a3a051-...","description":"TEXTO DA EMPRESA A INJETADO NO ATENDIMENTO DA B"}
-> 201
   ownerNote.companyId = 5811c210-...  (empresa A)  em atendimento da empresa B
```

Consequencias, todas reproduzidas:

1. **Vazamento para o proprietario errado.** O cliente da empresa B abre o card
   do proprio atendimento no app e le o texto da empresa A:
   ```
   GET /client-portal/appointment/bf8b6789-37a0-439f-8ba4-15c482532b47
   Authorization: <token do cliente da empresa B>
   -> 200 {"ownerNote":{"description":"TEXTO DA EMPRESA A INJETADO NO ATENDIMENTO DA B", ...},"hasContent":true}
   ```
   (`ClientPortalService.fetchAppointmentContent` busca a owner note por
   `appointmentAnimalId` e nao confere `companyId`.)
2. **Negacao de servico permanente.** `appointmentAnimalId` e `@unique`. A
   empresa B nunca mais consegue gravar nem ler a anotacao do proprio atendimento:
   ```
   POST /owner-note/bf8b6789-...  <token B>  -> 403 NOT_ALLOWED
   GET  /owner-note/bf8b6789-...  <token B>  -> 403 NOT_ALLOWED
   ```
   Nao ha rota que permita a B remover o registro intruso.

Evidencia no banco:
```sql
select "companyId", description from owner_notes
where "appointmentAnimalId"='bf8b6789-37a0-439f-8ba4-15c482532b47';
-- 5811c210-9f9e-4480-8fb5-40dadd606b82 | TEXTO DA EMPRESA A INJETADO NO ATENDIMENTO DA B
```

O mesmo funcionou contra a empresa de demonstracao (`f4e2f01e-...`,
appointmentAnimal `e93b966f-...`) — esse registro foi removido apos o teste.

### 2. BLOQUEIA — `/note` e `/reminder`: qualquer usuario da empresa apaga/edita anotacao e lembrete de um colega que ele nem consegue listar

CONFIRMADO.

A leitura (`fetch`, `count`, `fetchByDate`) filtra por `userId` **e** `companyId`
— cada usuario so ve o que e dele. Mas `edit` e `delete`
(`note/services/animal.service.ts`, `reminder/services/reminder.service.ts`)
autorizam **so por `companyId`**. Resultado: um segundo veterinario da mesma
clinica sobrescreve e apaga anotacoes/lembretes privados de outro, sem rastro e
sem que o dono perceba.

Reproducao:
```
# vet1 cria nota -> id 6d1c5618-2fd4-46ac-b4c1-a229d7ee4b13
# vet2 (mesma empresa, criado via POST /user)
GET    /note?page=1                       <token vet2> -> 200 {"notes":[],"pages":0}   (nao ve nada)
PUT    /note/6d1c5618-...                 <token vet2> {"name":"EDITADA POR OUTRO USUARIO"} -> 200
DELETE /note/6d1c5618-...                 <token vet2> -> 200
select count(*) from notes where id='6d1c5618-...';  -- 0
```
Identico em `/reminder`:
```
GET    /reminder?page=1  <token vet3> -> {"reminders":[],"pages":0}
DELETE /reminder/478fcfb1-d3a0-4091-b3fa-df2bd050c9a5  <token vet3> -> 200
select count(*) from reminders where id='478fcfb1-...';  -- 0
```
Perde dado de forma silenciosa; a resposta e 200 "sucesso".

### 3. GRAVE — `POST /owner-note/:appointmentAnimalId` grava a anotacao no animal errado (dentro da mesma empresa) e ela aparece para o cliente errado

CONFIRMADO.

O `animalId` do body nao e comparado com `appointmentAnimal.animalId`. Basta
mandar outro animal da propria empresa:

```
POST /owner-note/3685c813-...   (atendimento do animal 4a8c28dd "Cavalo F2")
{"animalId":"1bff551e-...","userId":"b0a3a051-...","description":"nota do atendimento do Cavalo F2, gravada no Cavalo SEGUNDO"}
-> 201  ownerNote.animalId = 1bff551e-...
```
```sql
select o."animalId" as nota, aa."animalId" as atendimento
from owner_notes o join appointment_animals aa on aa.id=o."appointmentAnimalId"
where o."appointmentAnimalId"='3685c813-7930-4709-b116-22df6c693acf';
-- 1bff551e-00d9-4fee-bf91-f33cd72f4ca9 | 4a8c28dd-9454-44d7-b6c2-20a113ca9578
```
A nota entra no historico do animal errado no app:
```
GET /client-portal/animal/1bff551e-.../owner-note  <token do cliente>
-> 200, devolve a nota — animal que nunca teve atendimento
```
Se os dois animais tiverem donos diferentes, o dono errado recebe a orientacao
clinica. Nao consegui produzir esse caso com donos distintos por falta de tempo,
mas o codigo (`fetchOwnerNotesByAnimal` autoriza pelo dono do `animalId` da nota)
nao tem nada que impeca.

### 4. GRAVE — `POST /owner-note` aceita `userId` (responsavel) de outra empresa

CONFIRMADO. `upsert`/`edit` gravam `userId` sem nenhuma checagem de empresa.

```
POST /owner-note/3685c813-...
{"animalId":"4a8c28dd-...","userId":"80b4b1b4-98aa-4c9e-a11a-0ea79fe9ea50","description":"userId de outra empresa"}
-> 201
select "userId" from owner_notes where id='06e274fa-...';
-- 80b4b1b4-98aa-4c9e-a11a-0ea79fe9ea50   (usuario da empresa B)
```
O registro clinico fica assinado por um veterinario de outra clinica.

### 5. GRAVE — UUID malformado no path devolve 500 cru em 8 rotas

CONFIRMADO. Nenhum `ParseUUIDPipe` nos parametros; o erro do Prisma vaza como
INTERNAL_SERVER_ERROR.

| Chamada | Observado |
|---|---|
| `PUT /note/abc` | 500 |
| `DELETE /note/abc` | 500 |
| `PUT /reminder/abc` | 500 |
| `DELETE /reminder/abc` | 500 |
| `PUT /animal-note/abc` | 500 |
| `DELETE /animal-note/abc` | 500 |
| `GET /animal-note/animal/abc` | 500 |
| `PUT /owner-note/record/abc` | 500 |
| `DELETE /owner-note/record/abc` | 500 |
| `GET /owner-note/abc` | 500 |
| `POST /owner-note/abc` | 500 |

Com UUID valido porem inexistente a resposta e 404 limpa — o problema e so o
formato.

### 6. GRAVE — `?page=0` e `?page=-1` derrubam a listagem com 500

CONFIRMADO. `skip: (page-1)*10` vira negativo e o Prisma explode.

```
GET /note?page=0      -> 500 INTERNAL_SERVER_ERROR
GET /note?page=-1     -> 500
GET /reminder?page=0  -> 500
GET /reminder?page=-1 -> 500
```
`page=abc` e `page` ausente respondem 400 com mensagem correta; so o zero/negativo
escapa do `@IsNumberString()`.

### 7. GRAVE — `POST /owner-note/<uuid-inexistente>` devolve 500 (violacao de FK)

CONFIRMADO.
```
POST /owner-note/00000000-0000-4000-8000-000000000000
{"animalId":"4a8c28dd-...","userId":"b0a3a051-...","description":"x"}
-> 500 INTERNAL_SERVER_ERROR
```
Deveria ser 404 "atendimento nao encontrado". Mesma causa raiz do achado 1: o
`appointmentAnimalId` nunca e carregado antes do insert.

### 8. MENOR — `animalId` aceito e descartado em silencio no upsert de owner-note existente

CONFIRMADO. No ramo `existing` do `upsert` so `description` e `userId` sao
atualizados; `animalId` e validado e jogado fora. A API responde 201 com o
`animalId` **antigo**, sem avisar que ignorou o valor enviado.
```
POST /owner-note/3685c813-...  {"animalId":"1bff551e-...", ...}
-> 201  "animalId":"4a8c28dd-..."   (o que foi enviado nao foi gravado)
```

### 9. MENOR — `POST /animal-note` com animal inexistente responde 403 "sem permissao" em vez de 404

CONFIRMADO.
```
POST /animal-note {"content":"x","animalId":"00000000-0000-4000-8000-000000000000"}
-> 403 {"message":"Você não tem permissão para realizar esta ação."}
```
`isAnimalFromCompany` colapsa "nao existe" e "e de outra empresa" no mesmo
`NotAllowedError`. Para o usuario a mensagem nao explica nada.

### 10. MENOR — POST devolve 201 com corpo vazio em `/note`, `/animal-note` e `/reminder`

CONFIRMADO. Os tres controllers so tratam o ramo `isLeft()` e nao retornam nada
no sucesso. O front nao recebe o `id` do registro criado e precisa refazer a
listagem. `/owner-note` (mesmo modulo, mesmo padrao de anotacao) devolve o objeto
— e `/client-portal/animal-note` tambem. Inconsistente dentro do proprio conjunto.

### 11. MENOR — recorrencia MONTHLY/YEARLY em dia 29, 30 ou 31 some nos meses curtos

CONFIRMADO. `PrismaReminderRepository.fetchByDate` compara `startBrt.date() === queryDom`.
Lembrete mensal criado em 2026-01-31:
```
GET /reminder/by-date?date=2026-07-31 -> aparece
GET /reminder/by-date?date=2026-09-30 -> nao aparece (setembro nao tem dia 31)
GET /reminder/by-date?date=2026-02-28 -> nao aparece
```
O lembrete simplesmente nao ocorre nesses meses, sem fallback para o ultimo dia.

### 12. MENOR — `/animal-note/company` e `/animal-note/by-date` nao tem paginacao

CONFIRMADO por leitura de codigo e resposta. Devolvem todas as anotacoes de
animais da empresa de uma vez (`findManyByCompanyId`). Numa clinica com anos de
historico isso vira um payload sem teto.

### 13. MENOR (SUSPEITO) — `/reminder` nao notifica nada

SUSPEITO. Procurei por scheduler/push/e-mail ligado a lembrete: os unicos `@Cron`
do projeto sao `inactiveUsers.scheduler.ts` e `expireTrialSignatures.scheduler.ts`.
Nao existe job, push nem e-mail que dispare um lembrete na data marcada — o
recurso e uma lista consultada sob demanda (`/reminder/by-date`). Se a promessa
de produto for "lembrete que avisa", a funcionalidade nao existe.

### 14. MENOR (SUSPEITO) — `GET /note/by-date` ignora o campo `date` da anotacao e filtra por `createdAt`

CONFIRMADO no comportamento, intencional segundo o comentario do repositorio.
A anotacao tem um campo `date` escolhido pelo usuario, mas o card "anotacoes do
dia" filtra por `createdAt`:
```
POST /note {"name":"...","date":"2026-08-05T14:00:00.000Z","description":"..."}  (criada em 2026-08-02)
GET /note/by-date?date=2026-08-05 -> {"notes":[]}
GET /note/by-date?date=2026-08-02 -> 13 notas
```
Se o usuario entende `date` como "quando isso acontece", a tela mostra o dia errado.

---

## O que passou (nao precisa reauditar)

**Separacao VET x OWNER — solida.** Testei nos dois sentidos com token de
veterinario e token de cliente (`POST /client/token`):
- Anotacao criada em `/animal-note` nasce `authorType=VET`; criada em
  `/client-portal/animal-note` nasce `OWNER` (confirmado no banco).
- `GET /animal-note/animal/:id`, `/animal-note/company` e `/animal-note/by-date`
  devolvem **so** VET; `GET /client-portal/animal/:id/animal-note` devolve **so**
  OWNER. Uma anotacao privada do veterinario **nao** aparece para o proprietario.
- Token de cliente em qualquer rota `/animal-note` -> 403 com a mensagem
  dedicada ("Estas anotações são do veterinário..."); em `/owner-note` -> 403 com
  a mensagem de ficha clinica. O `VetOnlyGuard` dispara de fato.
- Veterinario tentando editar/apagar anotacao OWNER -> 403; cliente tentando
  editar/apagar anotacao VET via `/client-portal/animal-note/:id` -> 403. Banco
  conferido: nada mudou nos dois casos.

**owner-note e mesmo unica por atendimento.** O segundo `POST` no mesmo
`appointmentAnimalId` **atualiza** (mesmo `id`, mesmo `createdAt`, `updatedAt`
novo) — nao duplica e nao estoura o unique com 500.

**Isolamento entre empresas nas rotas por id (fora o achado 1).** Com token da
empresa A contra recursos da empresa B/demo:
- `PUT`/`DELETE /note/:id` -> 403, banco inalterado.
- `PUT`/`DELETE /reminder/:id` -> 403, banco inalterado.
- `PUT`/`DELETE /animal-note/:id` e `GET /animal-note/animal/:id` -> 403, banco inalterado.
- `PUT`/`DELETE /owner-note/record/:id` e `GET /owner-note/:aaId` -> 403.

**Ida e volta dos campos.**
- `/note`: `name`, `date`, `description` voltam identicos no `GET`; `PUT` parcial
  (so `name`) preserva os demais; nenhum campo silenciosamente ignorado.
- `/reminder`: `title`, `date`, `description`, `recurrence` gravam e voltam
  corretos; `PUT` parcial preserva o resto; `description:""` limpa de verdade.
- `/animal-note`: `content` grava, edita e volta correto.
- `/owner-note`: `description` e `userId` gravam e voltam (ressalvas nos achados 4 e 8).

**Recorrencia de lembrete.** Verificada dia a dia contra `GET /reminder/by-date`:
`DAILY` aparece em todos os dias a partir do inicial e nao antes; `WEEKLY` so no
mesmo dia da semana; `MONTHLY` so no mesmo dia do mes; `YEARLY` so no mesmo
dia+mes; `NONE` so no dia exato. Recorrencia nunca "olha para tras" (nada aparece
antes da data de criacao).

**Fuso horario dos filtros por data.** Lembrete gravado em
`2026-08-01T01:00:00Z` (= 31/07 22h em Brasilia) aparece em
`by-date?date=2026-07-31` e nao em `2026-08-01`. O ajuste UTC-3 funciona.

**Paginacao de `/note` e `/reminder`.** Com 13 registros: `page=1` -> 10 itens,
`page=2` -> 3 itens, `pages=2` (bate com o `count` no banco); `page=99` -> lista
vazia com 200; lista vazia responde bem.

**`/reminder/health-due`.** Janela padrao de 7 dias, `days=30` amplia, `days`
invalido/negativo cai no padrao, `days=99999` fica limitado a 90. Escopo por
empresa confirmado: existia vacina com `nextDate` na janela na empresa
`152488b6-...` e ela **nao** apareceu na minha listagem.

**Validacao de entrada (mensagens em portugues, 400).** Corpo vazio, tipo errado
(`name: 123`), data impossivel (`2026-02-31`), data lixo (`"abc"`), `content`
vazio, `animalId` nao-UUID, `recurrence` fora do enum
(`"O campo recurrence deve ser um destes valores: NONE, DAILY, WEEKLY, MONTHLY, YEARLY."`),
`date` ausente/invalido no `by-date` — todos 400 com texto claro.

**DELETE limpo.** `DELETE /note/:id`, `/animal-note/:id`, `/owner-note/record/:id`
somem do `GET` seguinte, o segundo `DELETE` devolve 404 com mensagem, e o banco
confirma `count = 0`.

**String gigante.** `name` com 20.000 caracteres em `POST /note` -> 201, sem erro.
