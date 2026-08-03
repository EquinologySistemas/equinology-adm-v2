# R4 — Regras que deixam o dado incoerente

Frente R4 da auditoria de lançamento. Seis casos medidos: cinco corrigidos e
provados com curl + conferência no banco, um devolvido como dúvida ao dono
(item 6) porque bloquear quebraria um caso legítimo do negócio.

**Ambiente de teste desta frente** (empresa própria, para não atropelar as
outras sessões):

| | |
|---|---|
| Empresa | `b8ce2a4a-cd42-491a-97b8-ac99c3871d2b` — "Clinica R4" |
| Usuário/vet | `e9c11d5e-ea46-49ab-a32d-3fe3540df469` — "R4 Tester" |
| Cliente A | `7d36d049-f564-45e1-81fc-4fe3daffe269` |
| Cliente B | `a3b7604d-d747-4ed2-ba63-db858c90c69d` |
| Propriedade | `1e37eba5-88ce-48fc-8713-95b0ea05358f` — "Haras R4", do cliente A |
| Animal | `924e1ce2-adcb-47e1-b416-b830aeb06160` — "Trovao R4" |
| Empresa rival | "Clinica Rival R4" — usada só nos testes de lado negativo |

`npx tsc --noEmit` → **exit 0** na API e no web. `npm run build` no web →
**Compiled successfully**.

---

## 1. Atendimento que termina antes de começar — CORRIGIDO

`endDate` anterior ao `startDate` era aceito e gravado em `POST /appointment`,
`PUT /appointment/:id` e `POST /appointment/:id/reschedule`. Não havia nenhuma
comparação entre as duas datas em lugar nenhum: o DTO valida o formato de cada
uma isoladamente e o service nunca as confronta.

**Antes**

```
POST /appointment  {"startDate":"2026-09-23T11:00:00Z","endDate":"2026-09-23T10:00:00Z", ...}
HTTP=201
```
```sql
SELECT "startDate", "endDate" FROM appointments WHERE "companyId"='b8ce...';
 2026-09-23 11:00:00 | 2026-09-23 10:00:00
```

**A correção** — `AppointmentService.assertDateRange`, chamada em `create`,
`edit` e `rescheduleSplit`
(`src/domain/application/services/appointment/services/appointment.service.ts`).

A guarda ficou no service e não no DTO por um motivo concreto: no `PUT` quase
sempre vem **só uma das pontas** no corpo. Validar apenas o que chegou deixaria
passar "mando só o `endDate`, para as 09:00, num atendimento que começa às
10:00". A comparação é feita sobre os valores **efetivos**, já mesclados com o
que está gravado:

```ts
this.assertDateRange(startDate ?? appointment.startDate, endDate ?? appointment.endDate);
```

Duração zero (`início == fim`) continua permitida — o caso medido é o fim
**anterior** ao início, e barrar o igual quebraria marcação de ponto único.

**Depois**

| Cenário | HTTP | Corpo |
|---|---|---|
| `POST` com fim < início | **400** | *A data de término não pode ser anterior à data de início. Ajuste o término do atendimento para depois do começo.* |
| `PUT` só com `endDate` anterior ao `startDate` gravado | **400** | mesma mensagem |
| `POST /:id/reschedule` com fim < início | **400** | mesma mensagem |
| `POST` com fim > início (positivo) | **201** | gravado `10:00 → 11:00` |
| `PUT` válido (positivo) | **200** | banco passou a `12:00 → 13:00` |

Depois do `PUT` recusado o banco continuava em `10:00 → 11:00` (nada gravado
pela metade), e depois do reagendamento recusado a empresa continuava com 2
atendimentos — o novo não chegou a ser criado.

## 2. `PUT /animal` gravando string vazia — CORRIGIDO (com uma segunda causa escondida)

**Antes**: `PUT /animal/:id` com `{"name":"","breed":"","color":"","photoUrl":""}`
devolvia 200 e gravava os quatro campos como string vazia — animal sem nome na
listagem, na busca e no laudo.

```sql
 [] | [] | [] | []
```

O contrato de "campo em branco" passou a ser o **mesmo** de cliente e
propriedade (`client.service.ts`), que já era o certo:

- coluna **NOT NULL** (`name`, `breed`, `gender`, `sex`) → vazio é **ignorado**;
- coluna **nullable** (`color`, `photoUrl`) → vazio vira **NULL**, nunca `''`;
- `undefined` (campo não enviado) → não mexe.

A mesma normalização foi aplicada no `create` (`color || null`,
`photoUrl || null`), que gravava `''` do mesmo jeito.

**Segunda causa — o oitavo "a checagem existe e nunca funciona".** Com a
correção no service, `photoUrl` passou a limpar e `color` **continuou com o
valor antigo**, respondendo 200. O motivo estava duas camadas abaixo, em
`PrismaAnimalMapper.toPrisma`:

```ts
birthDate: animal.birthDate ?? undefined,
sex:       animal.sex ?? undefined,
color:     animal.color ?? undefined,
```

No `update` do Prisma, `undefined` significa **"não mexa nesta coluna"**. O
service normalizava para `null`, o mapper transformava esse `null` em
`undefined` e o Prisma descartava a alteração. Efeito colateral que ninguém
tinha medido: **era impossível limpar pelagem, sexo ou data de nascimento** de
um animal — a API respondia 200 e o valor antigo ficava lá. As três colunas são
nullable no schema, então passaram a ir como `null`.

**Depois**

```
PUT /animal/:id {"name":"","breed":"","color":"","photoUrl":""}   HTTP=200
 [Trovao R4] | [Mangalarga] | NULL | NULL
```

Nome e raça preservados, pelagem e foto zeradas de verdade. O mesmo payload em
`PUT /client/:id` produz o mesmo comportamento (`name` vazio ignorado, `phone`
vazio → NULL) — os três módulos agora respondem igual. O caminho positivo segue
gravando: reenviar os valores reais devolve `[Trovao R4] | [Alazao] | [https://x.com/p.jpg]`.

## 3. `updatedAt` da empresa nunca atualizado — CORRIGIDO

**Antes**: `PUT /company` trocava o nome e a coluna continuava idêntica ao
`createdAt`. Não dava para saber quando os dados da clínica mudaram.

```
PUT /company {"name":"Clinica R4 Renomeada"}   HTTP=200
 Clinica R4 Renomeada | 2026-08-03 13:47:15.162 | 2026-08-03 13:47:15.162
```

A entidade `Company` não tinha `touch()` — nenhum dos 13 setters mexia em
`updatedAt`, e o mapper grava o que a entidade tem. Foi adicionado o mesmo
`touch()` privado que `note`, `reminder` e `animalNote` já usam, chamado em
todos os setters de dado da empresa.

**Depois**

```
PUT /company {"name":"Clinica R4 v3","phone":"1133334444"}   HTTP=200
 Clinica R4 v3 | 1133334444 | 2026-08-03 13:47:15.162 | 2026-08-03 14:02:03.358
```

`createdAt` intacto, `updatedAt` avançou.

## 4. Transferência geral↔volante fora do extrato — CORRIGIDO (com migration)

**Antes**: transferir 30 unidades para o volante baixava o estoque geral de 100
para 70, subia o volante para 30 — e o relatório de movimentações mostrava
**só a entrada de 100**. O produto sumia da clínica sem deixar rastro.

```
POST /field-stock {"productId":"...","quantity":30}   HTTP=201
GET  /stock-movements?page=1  →  1 movimentação: entry 100
 geral: 70 | volante: 30
```

A causa é estrutural: `field_stocks` guarda apenas o **saldo atual** do volante,
e o extrato é montado de `product_stocks` (entradas) + `product_usages`
(saídas). A transferência não escrevia em nenhuma das três.

**A correção** exigiu uma trilha de auditoria nova —
migration `20260803135449_add_stock_transfer_audit`:

```prisma
enum StockTransferDirection { TO_FIELD  TO_GENERAL }

model StockTransfer {
  id        String @id @default(uuid()) @db.Uuid
  productId String @db.Uuid
  userId    String @db.Uuid
  quantity  Int
  direction StockTransferDirection
  createdAt DateTime @default(now())
  ...
  @@map("stock_transfers")
}
```

Só cria tabela e enum — nenhuma coluna existente foi tocada, nada de
`db push` nem `reset`. `FieldStockService.create` e `.returnToStock` gravam a
linha, e `StockMovementService` passou a ler a tabela junto com as outras duas.

O contrato do extrato ganhou dois tipos e um campo:

- `type`: `entry` | `exit` | **`transfer_out`** (geral→volante) |
  **`transfer_in`** (volante→geral);
- `responsibleName`: o veterinário que levou/devolveu — preenchido só nas
  transferências. É a resposta para "para onde foi o produto".

No web (`StockMovementsTable.tsx`): duas opções novas no filtro
("Somente envios ao volante" / "Somente voltas do volante"), coluna
**Responsável** e badges próprias (âmbar para a ida, azul para a volta) em vez
do `if entry ... else saída` que pintava tudo de vermelho.

**Depois**

```
POST /field-stock  {"quantity":20}          HTTP=201
PUT  /field-stock/:id {"quantity":5}        HTTP=200

GET /stock-movements?page=1
2026-08-03T14:03:14Z  transfer_in    5 un  resp: R4 Tester
2026-08-03T14:03:05Z  transfer_out  20 un  resp: R4 Tester
2026-08-01T10:00:00Z  entry        100 un  resp: null

GET /stock-movements?page=1&type=transfer_in  → só a linha de 5

 geral: 55 | volante: 45      (100 − 30 − 20 + 5  e  30 + 20 − 5)
```

## 5. Fases do CRM com posição duplicada e duas "últimas" — CORRIGIDO

**Antes**: dois `POST /board` com `position: 1, isLast: true` devolviam 201 e
201.

```
 Fase 1 | 1 | t
 Fase 2 | 1 | t
```

A ordenação do kanban é `ORDER BY position ASC, id ASC` — com duas fases na
mesma posição, a ordem entre elas passa a depender do uuid e muda sem ninguém
mexer em nada. E `isLast` marca a fase de fechamento: com duas marcadas, não
existe "a última".

**A correção** — `BoardService.assertCoherentOrder`, chamada no `create` e no
`edit`. A recusa é **explícita e diz qual fase ocupa o lugar**, em vez de
remanejar as outras em silêncio: mexer na fase alheia sem avisar é exatamente o
padrão de gravação silenciosa que esta base já pagou caro. No `edit` a própria
fase é excluída da checagem, senão reenviar os próprios valores viraria erro.

Precisou de um método novo no repositório (`fetchByCompany`), que lista as fases
da empresa sem os leads.

**Depois**

| Cenário | HTTP | Corpo |
|---|---|---|
| `POST` em posição ocupada | **400** | *A posição 1 já é da fase "Fase 2". Escolha outra posição para esta fase.* |
| `POST` com `isLast` já existindo | **400** | *A fase "Fase 2" já está marcada como última. Desmarque-a antes de marcar esta.* |
| `PUT` movendo para posição ocupada | **400** | *A posição 1 já é da fase "Fase 1"...* |
| `PUT` marcando segunda última | **400** | *A fase "Fase 1" já está marcada como última...* |
| `PUT` reenviando os próprios valores | **200** | — |
| `POST` em posição livre | **201** | — |

Estado final do kanban, coerente: `Fase 1 (1, última) → Fase 2 (2) → Fase 3 (3)`.

## 6. Animal em propriedade de outro cliente — **NÃO BLOQUEADO, dúvida para o dono**

Reproduzido: o animal do **Cliente B** foi criado na propriedade do
**Cliente A** e passou (201), e `client_stud_farms` ficou com os dois clientes
apontando para o mesmo haras.

O enunciado pedia para bloquear **só se não existisse caso legítimo**. Existe, e
o próprio modelo de dados foi feito para ele:

1. a tabela **`ClientStudFarm` é N:N** — uma propriedade tem vários clientes por
   construção; se um haras só pudesse ter animais de um dono, essa tabela não
   precisaria existir;
2. `AnimalService.create`/`edit` chamam `linkClientToStudFarm` justamente para
   **criar** esse vínculo quando o dono do animal é diferente do dono do haras.
   O comportamento é deliberado, não um vazamento;
3. hospedagem/pensão é rotina no meio equino: cavalo de um proprietário morando
   no haras de outro;
4. no banco de teste já há **4 animais** nessa situação (de 64 com propriedade) e
   **4 propriedades com mais de um cliente**. Bloquear invalidaria cadastro que
   já existe.

A posse de empresa **continua barrada** (`ownsLinks` exige que a propriedade
seja da empresa do token) — o que não é barrado é a combinação
cliente-diferente-do-dono-da-propriedade **dentro da mesma clínica**.

**Fica a pergunta para o dono**, sem impor nada: o vínculo automático faz o
Cliente B aparecer como vinculado ao Haras do Cliente A em `client_stud_farms`.
Se o app do proprietário lista propriedades por esse vínculo, o Cliente B passa
a **enxergar o haras do Cliente A**. Se isso não for desejado, o conserto certo
não é bloquear o cadastro do animal — é separar "hospedado em" de "é dono de",
o que é mudança de modelo e precisa de decisão do produto.

---

## Lado negativo (nada foi relaxado)

Com o token da "Clinica Rival R4":

| Tentativa | HTTP |
|---|---|
| `GET /stock-movements` (ver as transferências da Clinica R4) | 200 com `movements: []` |
| `PUT /board/:id` numa fase da Clinica R4 | **403** |
| `PUT /animal/:id` num animal da Clinica R4 | **404** |
| `PUT /appointment/:id` num atendimento da Clinica R4 | **403** |

No `edit` do board a checagem de posse roda **antes** da checagem de
posição/última — o 403 sai sem revelar o nome das fases da outra clínica.

## Dado legado (não corrigido de propósito)

As guardas valem de agora em diante; as linhas já gravadas continuam como
estavam. Levantamento no banco de desenvolvimento:

| Resíduo | Linhas |
|---|---|
| `appointments` com `endDate < startDate` | 3 |
| `animals` com `name`/`breed`/`color`/`photoUrl` vazios | 1 (`eb124b3f…`, de outra empresa de teste) |
| Empresas com posição de fase duplicada | 1 (`143b32a1…`) |
| Empresas com mais de uma fase `isLast` | 1 |
| `companies` com `updatedAt == createdAt` | 80 (esperado: nunca foram editadas depois do cadastro) |

Nenhuma dessas linhas é da empresa desta frente. Um backfill só faz sentido com
decisão do dono sobre o que fazer com atendimento invertido (inverter as datas?
zerar o fim?) — não dá para adivinhar.

## Arquivos tocados

**API** (`vetequus-api`)

- `prisma/schema.prisma` + `prisma/migrations/20260803135449_add_stock_transfer_audit/`
- `src/domain/application/services/appointment/services/appointment.service.ts`
- `src/domain/application/services/animal/services/animal.service.ts`
- `src/infra/shared/database/prisma/mappers/PrismaAnimalMapper.ts`
- `src/domain/enterprise/entities/company.ts`
- `src/domain/application/services/crm/services/board.service.ts`
- `src/domain/application/repositories/board.repository.ts`
- `src/infra/shared/database/prisma/repositories/prismaBoard.repository.ts`
- `src/domain/application/services/stock/services/fieldStock.service.ts`
- `src/domain/application/services/stock/services/stockMovement.service.ts`
- `src/domain/application/services/stock/interfaces/stockMovementProps.ts`
- `src/infra/http/controllers/stock/dto/stockMovement.dto.ts`
- `src/domain/application/repositories/stockTransfer.repository.ts` *(novo)*
- `src/infra/shared/database/prisma/repositories/prismaStockTransfer.repository.ts` *(novo)*
- `src/infra/shared/database/database.module.ts`

**Web** (`equinology-web-v2`)

- `types/dashboard.ts`
- `app/(dashboard)/stock/_components/StockMovementsTable.tsx`

Nada de `payment`, `signature`, `asaas`, `invoice`, `transaction`,
`credit-card`, `coupon`, `plan`, `billing`, `checkout` ou `webhook` foi tocado.
Nenhum commit, nenhuma troca de branch, nenhum `git stash`.
