# F2-financeiro

Auditoria executada contra a API rodando em `http://localhost:3333`, com empresa
própria criada para isolamento.

Fixture usada (empresa isolada, criada por mim):

- company `786bdedd-9a1e-42ff-b9e5-e15d63d03bfd` ("Clinica F2")
- user `a365e0e8-1513-4592-99cd-2831deef254a`
- client A `40c45f21-7df7-41ab-b2e8-dd49f14a29c1`, client B `54d2d1e1-601e-4135-abcc-792bbe400560`
- studFarm `e9415d5f-...`, animal `7407398a-...`
- categoria INCOME `ca5fdf6d-...`, categoria OUTCOME `82d154bd-...`
- bankAccount `a5c0d78c-...`
- Para exercitar PIX/cartão foi criada uma subconta no **sandbox** do Asaas e o
  `walletId` `9f80e4ea-0dea-47dd-960a-0ceadd6426a3` foi gravado na MINHA empresa
  via SQL (a API não expõe rota não-admin para isso). Nenhum código foi alterado.

---

## Cobertura: 26 / 26 rotas do meu conjunto

| Rota | Testada |
|---|---|
| POST /transaction | sim |
| PUT /transaction/:id | sim |
| GET /transaction | sim |
| GET /transaction/statistics | sim |
| POST /transaction/pix/:id | sim (sandbox, PIX gerado de verdade) |
| POST /transaction/credit/new | sim (sandbox, cobrança aprovada) |
| POST /transaction/credit/existing | sim (sandbox, cobrança aprovada) |
| POST /transaction-category | sim |
| PUT /transaction-category/:id | sim |
| GET /transaction-category | sim |
| GET /transaction-category/with-value | sim |
| POST /bank-account | sim |
| PUT /bank-account/:id | sim |
| GET /bank-account | sim |
| GET /bank-account/balance | sim |
| POST /payment | sim |
| PUT /payment/:id | sim |
| GET /payment | sim |
| POST /invoice | sim |
| PUT /invoice/:id | sim |
| DELETE /invoice/:id | sim |
| GET /invoice/:id | sim |
| GET /invoice | sim |
| POST /invoice/:id/pay/pix | sim (sandbox) |
| POST /invoice/:id/pay/credit/new | sim (sandbox) |
| POST /invoice/:id/pay/credit/existing | sim (sandbox) |

**Não testadas: nenhuma.**

Limites honestos do que NÃO foi coberto dentro das rotas testadas:

- Webhook do Asaas (`payment.received`) não foi disparado — a conclusão sobre
  `bankPaymentId` é baseada no estado gravado no banco depois de pagar, não em
  um webhook real chegando.
- O vazamento cross-tenant do achado #4 foi provado por SQL replicando
  exatamente a query do `fetchWithValue`; não obtive token da empresa vítima
  para não interferir com outros agentes.
- `GET /transaction-category/with-value` não foi testado com volume/paginação
  (a rota não pagina).
- Concorrência (dois PIX simultâneos na mesma fatura) não foi testada.

---

## Achados

### 1. BLOQUEIA — PUT /payment altera a movimentação mas NÃO altera nenhuma parcela

`PaymentService.edit` grava `name`, `amount`, `quantity`, `type` e `categoryId`
no registro pai e nunca toca nas `transactions` filhas. O cabeçalho da
movimentação e o caixa passam a contar histórias diferentes.

Reprodução (confirmada):

```
POST /payment {"name":"Edit3x F2","amount":300,"quantity":3,"isTotalValue":true,
               "type":"INCOME","categoryId":<CATI>,"firstDueDate":"2026-03-05",
               "status":"PENDING"}            -> 201, 3 parcelas de 100
PUT  /payment/<id> {"quantity":6,"amount":600,"name":"Edit6x F2"}   -> 200
SQL: select count(*), sum(value) from transactions where "paymentId"=<id>
     -> 3 | 300        (deveria ser 6 | 600)
SQL: select name, amount, quantity from sheduled_payments where id=<id>
     -> Edit6x F2 | 600 | 6

PUT  /payment/<id> {"type":"OUTCOME","categoryId":<CATO>}           -> 200
SQL: select name, type, "transactionCategoryId" from transactions ...
     -> Edit3x F2 | INCOME | <CATI>   (nome, tipo e categoria antigos)
```

Impacto: uma despesa editada para receita (ou vice-versa) continua entrando no
caixa com o sinal errado; o relatório por categoria continua na categoria
antiga; o valor total exibido não bate com a soma das parcelas. Evidência extra
em `GET /transaction/statistics?startDate=2026-01-01&endDate=2026-12-31`: a
movimentação já marcada como `OUTCOME` aparece como `incoming` de R$100 em
março, abril e maio.

### 2. BLOQUEIA — Rotas de pagamento de /transaction não verificam se o lançamento é do cliente do token

`POST /transaction/pix/:id`, `POST /transaction/credit/existing` e
`POST /transaction/credit/new` não têm a guarda de posse que a fatura tem
(`InvoiceService.payPix` faz `if (invoice.clientId !== clientId) return 404`).
Também não têm o `assertClientToken` do `InvoiceController`.

Reprodução (confirmada, sandbox):

```
Movimentação "Conta do Cliente B", R$333, clientId = Cliente B
Token do Cliente A:
  POST /transaction/pix/<parcelaDoClienteB>          -> 201, QR Code emitido
  POST /transaction/credit/existing
       {"transactionId":"<parcelaDoClienteB>",
        "creditCardId":"<cartão do Cliente A>","installmentCount":1}  -> 201
SQL: select name,status,"paymentDate" from transactions where id=<parcelaB>
     -> Conta do Cliente B | PAID | 2026-08-02 17:47:52
```

Impacto: qualquer cliente autenticado que descubra/adivinhe o id de uma parcela
paga (ou emite cobrança de) qualquer lançamento da clínica — inclusive despesas
internas da clínica, que também são `transactions`. Dá baixa em conta alheia.

### 3. BLOQUEIA — `bankPaymentId` NUNCA é gravado em `transactions`

Duas falhas somadas:

- `PrismaTransactionMapper` (toDomain e toPrisma) simplesmente não inclui o
  campo `bankPaymentId`, então nenhum `save()` o persiste.
- Em `transaction.service.ts:302-303` o `save()` acontece ANTES da atribuição:

```ts
await this.transactionRepository.save(transaction);
transaction.bankPaymentId = payment.value.paymentId;
```

Reprodução (confirmada):

```
POST /transaction/pix/6ae17ce0-... (token de cliente) -> 201, QR Code retornado
SQL: select status,"bankPaymentId" from transactions where id='6ae17ce0-...'
     -> PENDING | (vazio)
POST /transaction/credit/new (aprovado no sandbox)    -> 201
SQL: select status,"bankPaymentId" from transactions where id='bcb6d5b2-...'
     -> PAID | (vazio)
SQL: select count(*) filter (where "bankPaymentId" is not null), count(*)
     from transactions   ->  0 | 63     (base inteira, nenhuma linha preenchida)
```

Impacto: não existe chave para casar o retorno do Asaas com a parcela. Cliente
paga o PIX, o dinheiro entra na carteira e o lançamento fica `PENDING` para
sempre. Contraste: em `invoices` o campo é gravado corretamente
(`1 | 53` na mesma consulta, com `pay_i6eak0g802b5ifmh` gravado após meu PIX de
fatura).

### 4. BLOQUEIA — POST /payment aceita `categoryId` de outra empresa

`PaymentService.ownsLinks` valida `animalId`, `clientId` e `appointmentAnimalId`
mas **não valida `categoryId`**. O `TransactionService.assertOwnedRefs` valida.

Reprodução (confirmada):

```
POST /payment {"name":"CrossCatPay","amount":100,"type":"INCOME","quantity":1,
               "isTotalValue":true,"firstDueDate":"2026-08-10","status":"PENDING",
               "categoryId":"6acaa024-..."}      <- categoria da empresa f4e2f01e
  -> 201
SQL: select "transactionCategoryId" from sheduled_payments where name='CrossCatPay'
  -> 6acaa024-a785-407a-8d75-77ab68a6c26b   (categoria da OUTRA empresa)
GET /payment?query=CrossCatPay
  -> category.name = "Faturas recebidas"    (nome da categoria da outra clínica)
```

Dois efeitos:

a) A parcela gerada fica **permanentemente ineditável**: `PUT /transaction/:id`
   valida a posse da categoria ATUAL, então devolve 403 para o próprio dono.
   `PUT /transaction/<txCrossCatPay> {"status":"PAID","paymentDate":"2026-08-10"}`
   -> `403 NOT_ALLOWED`. Não dá para dar baixa nem corrigir pela API.

b) O lançamento entra no relatório da OUTRA empresa. `fetchWithValue`
   (prismaTransactionCategory.repository.ts:55-72) filtra a categoria por
   `companyId` mas não filtra a transação. Query equivalente, com a parcela
   marcada como paga:

```sql
select c.name, c."companyId" as dona_categoria, t.name, t.value,
       p."companyId" as dona_lancamento
from transaction_categories c
join transactions t on t."transactionCategoryId"=c.id
join sheduled_payments p on p.id=t."paymentId"
where c."companyId"='f4e2f01e-...' and t."paymentDate" between '2026-08-01' and '2026-08-31';
-- Faturas recebidas | f4e2f01e-... | CrossCatPay | 100 | 786bdedd-... (MINHA empresa)
```

### 5. BLOQUEIA — `GET /transaction?clientId=` não retorna nada

`prismaTransaction.repository.ts:143-151` monta o filtro só pelo caminho legado
`Payment.appointmentAnimal.animal.clientId`. Ignora `Payment.clientId` (o campo
escolhido no formulário de movimentação) e `Payment.animal.clientId`. O
`PrismaPaymentRepository` trata os três caminhos — só o de transaction ficou pela
metade.

Reprodução (confirmada):

```
GET /transaction?page=1&clientId=40c45f21-...   -> {"transactions":[], "pages":0}
SQL: select count(*) from transactions t
     join sheduled_payments p on p.id=t."paymentId"
     where p."clientId"='40c45f21-...'   -> 14
```

### 6. BLOQUEIA — `GET /transaction/statistics?animalId=` sempre zera

Mesmo defeito do #5: `getStatistics` (prismaTransaction.repository.ts:99-107) só
casa por `Payment.appointmentAnimal.animal.id`, ignorando `Payment.animalId`.

Reprodução (confirmada):

```
GET /transaction/statistics?startDate=2026-01-01&endDate=2026-12-31&animalId=7407398a-...
-> totalIncome 0, totalOutcome 0, totalIncoming 0, totalOutgoing 0
```
Sendo que a movimentação "Parcelado 12x F2" (12 parcelas, 1 já paga de R$100)
tem `animalId = 7407398a-...`. A tela de custo por animal fica sempre zerada.

### 7. GRAVE — UUID malformado no path devolve 500 em quatro rotas

Reprodução (confirmada), todas com `"abc"` no path:

```
PUT /transaction/abc            -> 500 INTERNAL_SERVER_ERROR
PUT /payment/abc                -> 500
PUT /bank-account/abc           -> 500
PUT /transaction-category/abc   -> 500
```
Nenhuma tem `ParseUUIDPipe`. `/invoice` valida corretamente e devolve 400/404.

### 8. GRAVE — `page=0` e `page=-1` devolvem 500 em /transaction e /payment

```
GET /transaction?page=0   -> 500      GET /transaction?page=-1  -> 500
GET /payment?page=0       -> 500      GET /payment?page=-1      -> 500
GET /invoice?page=0       -> 400 "O campo page deve ser no mínimo 1."  (correto)
```
`FetchTransactionDto`/`FetchPaymentDto` só usam `@IsNumberString()`, sem `@Min(1)`,
e o `skip: (page-1)*10` negativo estoura no Prisma.

### 9. GRAVE — `PUT /invoice/:id` com `paidAt` não-data devolve 500

`EditInvoiceDto.paidAt` é validado só com `@IsString()`; o controller faz
`new Date(body.paidAt)` e passa `Invalid Date` para o Prisma.

```
PUT /invoice/<id> {"paidAt":"nao-e-data"}  -> 500 INTERNAL_SERVER_ERROR
SQL: status ainda PENDING, paidAt NULL (não corrompeu, mas 500 cru)
```

### 10. GRAVE — A busca por texto de `GET /transaction` é ignorada

O repositório implementa a busca (`normalizedLikeSql('name', data.query)`), mas
o `TransactionController.fetch` não desestrutura nem repassa `query`; e o DTO
declara o campo como `Query` (Q maiúsculo). Resultado: a caixa de busca do
extrato não filtra nada.

```
GET /transaction?page=1                   -> 10 itens, pages 2
GET /transaction?page=1&query=Avulsa2     -> 10 itens, pages 2 (lista inteira)
GET /transaction?page=1&Query=Avulsa2     -> 10 itens, pages 2 (lista inteira)
```
Os demais filtros (`type`, `categoryId`, `bankAccountId`, `paymentId`) funcionam.

### 11. GRAVE — `POST /invoice` aceita valor negativo e zero, e a fatura negativa vira receita negativa no caixa

```
POST /invoice {"amount":-500,"dueDate":"2026-09-01"}  -> 201  (amount -500)
POST /invoice {"amount":0,"dueDate":"2026-09-01"}     -> 201
PUT  /invoice/<id -500> {"paidAt":"2026-08-02T12:00:00.000Z"} -> 200, status PAID
SQL: select p.name,p.amount,p.type,t.value,t.status from sheduled_payments p
     join transactions t on t."paymentId"=p.id where p."invoiceId"='<id -500>'
  -> Fatura recebida | -500 | INCOME | -500 | PAID
```
`CreateInvoiceDto.amount` só tem `@IsNumber()`, sem `@Min`. `CreatePaymentDto`
tem `@Min(0.01)` — a regra existe no financeiro e falta na fatura.

### 12. GRAVE — `POST /transaction` aceita valor negativo (POST /payment não)

```
POST /transaction {"name":"NegTx","value":-99,"type":"INCOME","dueDate":"2026-08-10",
                   "status":"PENDING","categoryId":<CATO>,"paymentId":<PAY>}  -> 201
SQL: select name,value from transactions where name='NegTx'  -> NegTx | -99
POST /payment {... "amount":-10 ...} -> 400 "O valor deve ser maior que zero"
```
Uma receita de -99 é uma despesa disfarçada, que não aparece nos totais de
`totalOutcome`.

### 13. GRAVE — `DELETE /invoice/:id` apaga fatura JÁ PAGA e deixa a movimentação órfã

Não há bloqueio por status nem por `bankPaymentId`. A `Payment`/`Transaction`
gerada no recebimento sobrevive com `invoiceId` NULL (FK é `ON DELETE SET NULL`)
e passa a existir no caixa sem nenhuma origem rastreável.

```
Fatura F2-001-B: status PAID, amount 9999, bankPaymentId pay_i6eak0g802b5ifmh
DELETE /invoice/d28419d1-...    -> 200 (sem aviso)
SQL: select count(*) from invoices where id='d28419d1-...'  -> 0
SQL: select id,name,amount,"invoiceId" from sheduled_payments where name like 'Fatura F2%'
  -> 6315a12a-... | Fatura F2-001-B | 399.99 | (NULL)
GET /payment?page=1  -> "Fatura F2-001-B" continua listada, invoiceNumber null
```
O documento fiscal e o `bankPaymentId` do Asaas somem; o dinheiro fica no caixa
sem lastro.

### 14. GRAVE — Editar o valor de uma fatura já PAGA não reflete na movimentação gerada

```
Fatura PAID, amount 399.99, com movimentação gerada de 399.99
PUT /invoice/<id> {"amount":9999}   -> 200, invoice.amount = 9999
SQL: select p.amount, t.value, t.status from sheduled_payments p
     join transactions t on t."paymentId"=p.id where p."invoiceId"='<id>'
  -> 399.99 | 399.99 | PAID
GET /invoice?page=1&status=PAID -> summary.paidAmount = 9999
```
Relatório de faturas diz 9.999 recebidos, o caixa diz 399,99. Nem o valor é
travado após o pagamento, nem a movimentação é sincronizada.

### 15. GRAVE (SUSPEITO na intenção, CONFIRMADO no payload) — Filtro de período muda o "status geral" da movimentação parcelada

`GET /payment` com `startDate`/`endDate` filtra o array `transactions` incluído,
mas continua devolvendo `quantity` e `amount` do total. O payload fica
internamente contraditório e qualquer status derivado das parcelas ("todas
pagas") fica errado.

Reprodução (confirmada): movimentação 12x de R$1.200, só a parcela de janeiro
paga.

```
GET /payment?page=1
  -> quantity 12, amount 1200, transactions 12, soma 1200,
     status [PENDING x11, PAID x1]
GET /payment?page=1&startDate=2026-01-01&endDate=2026-01-31
  -> quantity 12, amount 1200, transactions 1, soma 100, status [PAID]
```

O comentário em `prismaPayment.repository.ts` diz que isso é intencional para o
KPI do mês. O problema não é o recorte das parcelas, é que `quantity`/`amount`
não acompanham: o consumidor não tem como saber que está vendo 1 de 12. Marco
como GRAVE porque a linha da lista, filtrada por janeiro, se apresenta como uma
movimentação de 12x integralmente paga.

### 16. MENOR — Gráfico de `GET /transaction/statistics` traz um mês a mais no início

```
GET /transaction/statistics?startDate=2026-01-01&endDate=2026-03-31
  -> chartData.labels = ["dezembro","janeiro","fevereiro","março"]  (4 rótulos p/ 3 meses)
GET /transaction/statistics?startDate=2026-01-01&endDate=2026-12-31
  -> 13 rótulos, começando e terminando em "dezembro"
```
O bucket extra serve de baseline (`lastMonthBalance`), mas está dentro de
`chartData`, que é o que o gráfico plota.
Range invertido (`startDate` > `endDate`) devolve 200 com tudo vazio, sem erro.

### 17. MENOR — /bank-account sem validações e sem exclusão

```
POST /bank-account {"name":"Neg","initialBalance":-500}   -> 201 (saldo negativo aceito)
POST /bank-account {"name":"<5000 chars>","initialBalance":1} -> 201
POST /bank-account {"name":"Conta F2",...} (nome já existente) -> 201 (duplicado)
DELETE /bank-account/<id>  -> 404 "Cannot DELETE /bank-account/<id>" (rota não existe)
```
Conta criada por engano não tem como ser removida pela API.
Observação sobre `walletId`: o campo **não pertence a bank-account** — mora em
`companies` e só é gravável pelas rotas admin (`adminCompanyCreate/Update`), que
apenas fazem `trim()`. A base já tem `walletId = 'wlt_teste'` gravado
(company `7f5174fb-...`), ou seja, não há validação nenhuma contra o Asaas. Fora
do meu conjunto de 26 rotas, mas registro porque o PIX inteiro depende dele.

### 18. MENOR — /transaction-category sem exclusão e com PUT tudo-ou-nada

```
PUT /transaction-category/<id> {"name":"So nome"}
  -> 400 ["Insira um tipo de categoria válido","Insira um tipo de categoria válido"]
POST /transaction-category {"name":"Cat Receita F2","type":"INCOME"} (já existe) -> 201
POST /transaction-category {"name":"<5000 chars>","type":"INCOME"} -> 201
DELETE /transaction-category/<id> -> 404 (rota não existe)
```
`EditTransactionCategoryDto` não marca nada como opcional: renomear exige
reenviar o tipo. Trocar o `type` da categoria não toca no `type` dos lançamentos
já classificados (categoria OUTCOME com 4 transações INCOME dentro).

### 19. MENOR — Mensagens de validação duplicadas e uma em inglês/vazia

```
POST /transaction sem paymentId
  -> ["Insira um pagamento agendado valido","Insira um pagamento agendado valido"]
GET /transaction-category/with-value sem datas
  -> 4 mensagens, cada uma repetida 2x
GET /invoice?page=1&orderBy=xxx
  -> ["orderBy must be one of the following values: "]   (em inglês, lista vazia)
```

### 20. MENOR — `quantity` sem teto em POST /payment

```
POST /payment {... "quantity":1000 ...} -> 201, 1000 linhas em transactions
```
Confirmado por `select count(*)` = 1000. Uma requisição gera 1000 inserts.

### 21. MENOR — Código morto em `PaymentController.fetch`

O bloco `if (tokenType === 'client') clientId = userId` nunca executa: o
controller inteiro está sob `@Roles('ADMIN','GESTOR')` e token de cliente é
barrado antes.

```
GET /payment?page=1 com token de cliente
  -> 403 {"message":"Usuário não encontrado","code":"FORBIDDEN"}
```
(Não é vazamento — é uma proteção redundante que dá a impressão de que a rota
serve o app do proprietário, quando não serve.)

---

## O que passou (não precisa reauditoria)

**Isolamento multi-tenant (com token da minha empresa, contra recursos da
empresa `f4e2f01e-...`), todos 403 e nada alterado no banco:**

- `PUT /payment/<id de outra empresa>` -> 403, `name`/`amount` inalterados (SQL)
- `PUT /transaction/<id de outra empresa>` -> 403, inalterado (SQL)
- `PUT /bank-account/<id de outra empresa>` -> 403, inalterado (SQL)
- `PUT /transaction-category/<id de outra empresa>` -> 403, inalterado (SQL)
- `POST /transaction` com `paymentId` / `categoryId` / `bankAccountId` de outra
  empresa -> 403 nos três casos
- `PUT /transaction` repontando para categoria ou conta bancária de outra
  empresa -> 403 nos dois casos
- `GET /invoice?clientId=<cliente de outra empresa>` -> lista vazia e summary
  zerado
- `GET /payment?clientId=<cliente de outra empresa>` -> lista vazia
- Fatura: `create`/`edit` recusam `clientId`/`animalId` de outra empresa

**Faturas:**

- Ida e volta completo do `POST /invoice`: `amount`, `dueDate`, `number`,
  `description`, `notes`, `pixKey`, `clientId`, `animalId` — todos voltaram
  iguais no `GET /invoice/:id`. Nenhum campo silenciosamente descartado.
- `PUT /invoice` alterando os 6 campos de uma vez: todos persistiram (verificado
  por `GET` subsequente).
- `paidAt` preenchido marca `status=PAID` e dispara a criação automática da
  movimentação (1 parcela PAID, categoria "Faturas recebidas" criada sob
  demanda, `clientId` e `animalId` preservados). Idempotente: editar de novo não
  duplica.
- `status: "CANCELED"` funciona.
- `DELETE` de fatura pendente: 200, `GET` posterior devolve **404 limpo**
  ("Registro não encontrado..."), sem 500.
- Paginação: 12 faturas -> page 1 com 10, page 2 com 2, `pages` = 2. Correto.
- Filtros `status`, `clientId`, `overdue`, `orderBy` funcionam na listagem.
- `summary` ignorar `status`/`overdue` **é intencional e documentado**
  (`prismaInvoice.repository.ts:87-89`): alimenta os contadores das abas. Não é
  bug — confirmei que respeita `clientId`/`animalId`/período.
- Validações boas: `dueDate: "2026-02-31"` -> 400 "Data de vencimento inválida";
  `clientId: "abc"` -> 400 "O campo clientId deve ser um identificador válido.";
  `page=0` -> 400; `amount` ausente -> 400.

**Pagamento de fatura (sandbox Asaas):**

- `POST /invoice/:id/pay/pix` com token de USUÁRIO -> 403 com mensagem clara
  ("O pagamento da fatura é exclusivo do aplicativo do proprietário..."). A
  guarda `assertClientToken` dispara de verdade.
- `POST /invoice/:id/pay/pix` com token de cliente -> 201, QR Code retornado e
  **`bankPaymentId` persistido** (`pay_i6eak0g802b5ifmh` confirmado por SQL).
  Aqui a ordem `atribui -> save` está correta.
- `POST /invoice/:id/pay/credit/new` -> 201, fatura vira `PAID`, `paidAt`
  preenchido, `bankPaymentId` = `pay_60zp4oy4gh956zc1`, cartão tokenizado e
  salvo para o cliente, movimentação "Fatura CC-1" gerada.
- `POST /invoice/:id/pay/credit/existing` (2x) -> 201, `PAID`,
  `bankPaymentId` = `pay_n6pbxj4gai75v2me`, movimentação "Fatura CC-2" gerada.
- Empresa sem `walletId` -> 400 com mensagem em português compreensível.
- Split para a carteira do próprio dono da API key -> 400 "Não é permitido split
  para sua própria carteira." (mensagem do Asaas repassada limpa).

**Movimentações e lançamentos:**

- `POST /payment` 12x com `isTotalValue: true` -> 12 parcelas de R$100,
  vencimentos mensais corretos (10/01 a 10/12), tudo `PENDING`.
- Baixa de parcela via `PUT /transaction/:id`
  (`status`, `paymentDate`, `bankAccountId`) -> 200 e persiste corretamente.
- Saldo da conta bancária reage à baixa: `initialBalance` 1000 ->
  `currentBalance` 900. `GET /bank-account/balance` bate com `GET /bank-account`.
- `PUT /bank-account/:id` ida e volta: `name` e `initialBalance` alterados e
  confirmados no `GET`.
- Filtro `scope` em `GET /payment` funciona: `PERSONAL` traz só a movimentação
  pessoal, `PROFESSIONAL` traz as outras 4. `scope=X` -> 400.
- `clientId` na movimentação é gravado e volta no `GET` junto com `clientName`.
- Filtro `clientId` do `GET /payment` funciona nos três caminhos (direto,
  por animal, por atendimento).
- Filtro `query` do `GET /payment` funciona e ignora caixa ("parcelado" acha
  "Parcelado 12x F2").
- Filtro de período aberto do `GET /payment` funciona (só `startDate` filtra
  daquela data em diante).
- Filtros `type` / `categoryId` / `bankAccountId` / `paymentId` do
  `GET /transaction` funcionam e a paginação é consistente
  (`categoryId=<CATO>` -> pages 2; `categoryId=<CATI>` -> pages 1 com 4 itens).
- Validações que disparam de verdade: `amount: -10` -> 400;
  `quantity: 0` -> 400; `firstDueDate: "2026-02-31"` -> 400;
  `dueDate: "2026-02-31"` em transaction -> 400; `value: "9"` (string) -> 400;
  `page=abc` -> 400; `name: ""` em bank-account -> 400;
  `initialBalance: "100"` -> 400; `type: "FOO"` em categoria -> 400.
- `GET /payment?page=999` e `GET /transaction?page=999` -> 200 com lista vazia,
  sem erro.
- `GET /transaction-category` e `GET /bank-account` listam corretamente e
  respeitam a empresa.
- `GET /transaction-category/with-value` soma apenas transações com
  `paymentDate` no período e apenas categorias da própria empresa (o único
  contaminante é o do achado #4, que entra pelo lado da outra empresa).
