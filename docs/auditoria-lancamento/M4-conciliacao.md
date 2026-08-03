# M4 — Conciliação de fatura e movimentação

Frente: pagamentos avulsos (fatura da clínica e parcela de movimentação) contra
o Asaas. Tudo abaixo foi reproduzido antes de corrigir e provado depois, ao vivo,
contra o sandbox (`https://sandbox.asaas.com/api/v3`).

Ambiente do teste (criado do zero para esta frente):

| Papel | Id |
|---|---|
| Clínica (company) | `ad4a6476-7d41-4786-9f92-87bde663366b` (walletId `9f80e4ea-...`) |
| Proprietário A (client) | `1e0d1b50-5de3-460a-88d0-5852f0447734` |
| Proprietário B (client) | `f53abcc1-d9c1-46e8-b20e-c3e5ce79d9ce` |

---

## Resumo

| # | Item | Status |
|---|---|---|
| 1 | Ninguém marca fatura/movimentação como paga | CORRIGIDO |
| 2 | `bankPaymentId` nunca gravado em transactions | CORRIGIDO |
| 3 | Rotas de pagamento de `/transaction` sem checagem de dono | CORRIGIDO |
| 4 | `DELETE /invoice` apaga fatura já paga | CORRIGIDO |
| 5 | Filtros `?clientId=` e `statistics?animalId=` | JÁ ESTAVA OK |

---

## 1. Conciliação: PAYMENT_RECEIVED / PAYMENT_CONFIRMED para fatura e movimentação

**Estado anterior (reproduzido).** Fatura `M4-001`, PIX gerado pelo app do
proprietário A, `bankPaymentId = pay_y3b2n37bpb9fszoh` gravado. Webhook
`PAYMENT_RECEIVED` com esse id → `{"received":true}` HTTP 200 e o banco
**inalterado**: `M4-001 | PENDING | (paidAt vazio)`. O único webhook da API
(`POST /signature/webhook`) só consultava `CompanySignature`; não existia
`findByBankPaymentId` em repositório nenhum.

**O que foi feito.**

- `InvoiceRepository.findByBankPaymentId` + implementação Prisma (`findFirst`,
  porque a coluna não é UNIQUE, desempatando pela mais recente).
- `TransactionRepository.findByBankPaymentId` idem.
- `InvoiceService.confirmByBankPaymentId` — marca `PAID`, grava `paidAt` e
  chama o `ensureInvoicePaymentExists` que já existia, alimentando o caixa.
- `TransactionService.confirmByBankPaymentId` — marca `PAID` e grava
  `paymentDate`.
- `AsaasPaymentReconciliationService` (novo,
  `src/domain/application/services/finance/services/asaasPaymentReconciliation.service.ts`)
  — coordena: dado o `payment.id`, tenta fatura, depois parcela. Não lança:
  o webhook precisa responder 200 mesmo se a conciliação falhar, senão o Asaas
  reentrega o evento da assinatura indefinidamente.
- Ligado no handler da M1, **depois** do `signatureValidation` e sem alterar o
  fluxo dela (mesma rota, mesma autenticação por `asaas-access-token`, mesmo
  formato de resposta).

**Ciclo completo provado no sandbox.**

```
1) clínica emite a fatura M4-CICLO (R$ 777,50, cliente A, animal Cavalo M4)
   banco:  M4-CICLO | PENDING | bankPaymentId vazio
2) proprietário A paga por PIX  -> HTTP 201
   banco:  bankPaymentId = pay_c3yy0vjxbfjj8vg2
3) ASAAS antes:  status=PENDING value=777.5
4) o pagamento compensa no gateway
   ASAAS depois: status=RECEIVED_IN_CASH
5) o evento chega: POST /signature/webhook {"event":"PAYMENT_RECEIVED",
   "payment":{"id":"pay_c3yy0vjxbfjj8vg2"}} -> 200
6) banco depois:
   M4-CICLO | PAID | paidAt 2026-08-03 14:21:07 | pay_c3yy0vjxbfjj8vg2
   caixa:  Fatura M4-CICLO | 777.5 | INCOME | clientId=A | animalId=Cavalo M4 | PAID
```

Movimentação, mesmo caminho: parcela `c61c4bc0-...` (R$ 333) do proprietário B,
`pay_qgwbm4zyjegm5s8z` recebido no Asaas, webhook → banco
`Conta do Cliente B M4 | PAID | paymentDate 2026-08-03 14:20:48 | pay_qgwbm4zyjegm5s8z`.

**Idempotência.** Reenviei o mesmo evento (e também `PAYMENT_CONFIRMED` depois
de `PAYMENT_RECEIVED`): a fatura continua com **1** movimentação no caixa e a
parcela com 1 linha PAID. Nada duplica.

**Autenticação preservada.** Mesmo webhook sem o header
`asaas-access-token` → HTTP 401. Não relaxei nada para o teste passar.

### Banco x Asaas

| Situação | Asaas | Banco (antes) | Banco (agora) |
|---|---|---|---|
| PIX de fatura gerado | PENDING | PENDING + bankPaymentId | igual |
| PIX compensado + webhook | RECEIVED | **PENDING para sempre** | PAID + paidAt + caixa |
| PIX de parcela compensado | RECEIVED | **PENDING para sempre** | PAID + paymentDate |
| Evento reentregue | RECEIVED | — | inalterado (idempotente) |

**Ainda podem divergir?** Sim, numa janela residual: se o Asaas não entregar o
webhook (endpoint fora do ar, fila do gateway travada, webhook não cadastrado no
painel), a fatura continua PENDING mesmo com o dinheiro na carteira. Não existe
job de varredura que pergunte ao Asaas "o que foi pago que eu não registrei" —
está listado nas pendências. A partir da correção a divergência é temporária e
se resolve sozinha na reentrega do Asaas; antes era permanente por construção.

## 2. `bankPaymentId` não era gravado em transactions

**Estado anterior (reproduzido).** Base inteira:
`count(*) filter (where "bankPaymentId" is not null) = 0` em **1092**
transactions (contra 7 de 74 em invoices). Duas causas somadas:

- `transaction.service.ts` (linhas 302-303): `await save(transaction);` vinha
  **antes** de `transaction.bankPaymentId = payment.value.paymentId;`.
- `PrismaTransactionMapper` não incluía a coluna nem em `toDomain` nem em
  `toPrisma` — então, mesmo com a ordem certa, o `save` gravaria NULL e a
  leitura devolveria `undefined`.

**Corrigido:** ordem invertida no service + coluna nos dois lados do mapper.
Confirmado em `invoice.service.ts`: lá a ordem já estava certa nos três métodos
de pagamento (por isso invoices tinha 7 linhas preenchidas). Não era bug.

**Prova.** PIX emitido pelo dono da parcela →
`Conta do Cliente B M4 | PENDING | pay_qgwbm4zyjegm5s8z`. Cartão novo →
`Conta do Cliente A M4 | PAID | pay_ffdnnfr9md41hu6k`.

**Efeito colateral positivo do mapper:** `PUT /payment` reescreve as parcelas
pelo mesmo mapper. Antes, editar a movimentação apagaria a chave de conciliação.
Testado: após `PUT /payment/<id>` mudando o nome, a parcela continua
`PAID | pay_ffdnnfr9md41hu6k`.

**Banco x Asaas:** o Asaas sempre teve a cobrança; o banco não tinha a chave
para reconhecê-la. Era o pré-requisito do item 1 — sem ele o webhook escrito não
acharia nada.

## 3. Rotas de pagamento de `/transaction` sem checagem de dono

**Estado anterior (reproduzido).** Com o token do proprietário **A**, na parcela
do proprietário **B** (`c61c4bc0-...`): `POST /transaction/pix/<id>` → **HTTP
201**, QR Code emitido, cobrança criada no Asaas na conta alheia.

**O que foi feito.**

- `TransactionRepository.isOwnedByClient(transactionId, clientId)` — reproduz os
  **três** caminhos que o `PrismaPaymentRepository` já usa (`Payment.clientId`,
  `Payment.animal.clientId` e o legado `appointmentAnimal.animal.clientId`).
  Despesa interna da clínica não casa com nenhum dos três, que é exatamente o
  que precisa continuar fora do alcance do app.
- Guarda aplicada nas três rotas (`pix`, `credit/existing`, `credit/new`),
  **antes** de qualquer chamada ao gateway — nenhuma cobrança órfã é criada na
  tentativa barrada. Responde `ResourceNotFoundError` (404) para não confirmar a
  existência do id a quem não é dono.
- Bloqueio de lançamento já `PAID` nas três (`'Este lançamento já foi pago.'`).
- `assertClientToken` no `TransactionController`, espelhando o
  `InvoiceController`: as três rotas leem o `sub` do token como `clientId`, então
  token de usuário da clínica não pode entrar.

**Prova (lado negativo).**

```
A -> parcela de B, pix               404 RESOURCE_NOT_FOUND
A -> parcela de B, credit/new        404 RESOURCE_NOT_FOUND
A -> parcela de B, credit/existing   404 RESOURCE_NOT_FOUND  (com o cartão do próprio A)
A -> despesa interna da clínica, pix               404
A -> despesa interna da clínica, credit/existing   404
token da CLÍNICA -> qualquer parcela, pix          403 "O pagamento de lançamentos
                                                       é exclusivo do aplicativo
                                                       do proprietário..."
banco: Conta B2 M4 | PENDING | (bankPaymentId vazio)
       Despesa interna M4 | PENDING | (bankPaymentId vazio)
```

**Prova (lado positivo — não relaxei acesso).**

```
B -> parcela do próprio B, pix        201 + pay_qgwbm4zyjegm5s8z
A -> parcela do próprio A, credit/new 201 + PAID + pay_ffdnnfr9md41hu6k
```

**Banco x Asaas:** antes o pior caso era cobrança criada no Asaas no cartão de
outra pessoa **e** baixa gravada no banco em conta alheia — os dois lados
errados e concordando entre si. Agora a requisição para antes do gateway: nada é
criado nos dois lados.

## 4. `DELETE /invoice` apagava fatura já paga

**Estado anterior (reproduzido).** Fatura `M4-001` marcada como paga →
`DELETE /invoice/<id>` → **HTTP 200**, `select count(*) ... = 0`. Sumiu o
documento e o `bankPaymentId`; a movimentação recebida ficou órfã (a FK
`invoiceId` é `ON DELETE SET NULL`).

**Corrigido:** `InvoiceService.delete` devolve `ValidationError` quando
`status === 'PAID'`.

```
DELETE fatura PAGA     -> 400 {"message":"Não é possível excluir uma fatura já
                                paga. Para removê-la da listagem, altere o
                                status para Cancelada.","code":"VALIDATION_ERROR"}
                          banco: M4-CICLO | PAID  (intacta)
DELETE fatura PENDENTE -> 200, count = 0  (continua funcionando)
```

**Banco x Asaas:** era o único caso da frente em que o Asaas ficava com um
pagamento RECEIVED sem nenhuma contrapartida no banco — dinheiro sem lastro.
Bloqueado.

## 5. Filtros do financeiro — JÁ ESTAVAM OK

Reproduzi os dois; ambos já haviam sido corrigidos por outra leva (o
`PrismaTransactionRepository` já trata os três caminhos, com comentário citando
o `PrismaPaymentRepository`). **Não mexi.**

```
GET /transaction?page=1&clientId=<A>
  -> 3 lançamentos: Conta do Cliente A M4 editada, Fatura M4-CICLO, Fatura M4-001

GET /transaction/statistics?startDate=2026-01-01&endDate=2026-12-31&animalId=<Cavalo M4>
  -> totalOutgoing=150  totalIncome=777.5  totalIncoming=777.5   (não zerado)
```

---

## Regressão na frente M1 (dona do webhook)

O handler dela roda primeiro e ficou intacto; só acrescentei uma chamada depois.
Refiz o ciclo dela ponta a ponta:

```
POST /signature/pix/<plano>   -> 201, assinatura INACTIVE, pay_cexgasdutsduejil
POST /signature/webhook {"event":"PAYMENT_RECEIVED","payment":{"id":"pay_cexgasdutsduejil"}}
  -> banco: ACTIVE | pay_cexgasdutsduejil | expirationDate 2026-09-03
```

---

## Arquivos tocados (API)

```
src/domain/application/repositories/invoice.repository.ts
src/domain/application/repositories/transaction.repository.ts
src/domain/application/services/finance/services/transaction.service.ts
src/domain/application/services/finance/services/asaasPaymentReconciliation.service.ts   (novo)
src/domain/application/services/invoice/invoice.service.ts
src/infra/http/controllers/finance/transaction.controller.ts
src/infra/http/controllers/signature/companySignature.controller.ts
src/infra/http/modules/signature.module.ts
src/infra/shared/database/prisma/mappers/PrismaTransactionMapper.ts
src/infra/shared/database/prisma/repositories/prismaInvoice.repository.ts
src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts
```

`npx tsc --noEmit` → exit 0. Sem migration: `transactions.bankPaymentId` e
`invoices.bankPaymentId` já existiam no schema. Nada commitado.

Aproveitei para remover os blocos `console.log('[PIX BACK DEBUG] ...')` e
`console.log('[CARTÃO NOVO/EXISTENTE] Resource not found: ...')` do
`transaction.service.ts` — eram logs marcados no próprio código como temporários
"até o bug ser resolvido", e despejavam `clientId`/`transactionId` no stdout a
cada chamada.

---

## Pendências (fora do que foi pedido nesta frente)

1. **Não existe varredura ativa contra o Asaas.** A conciliação é 100% reativa
   ao webhook. Se o endpoint não estiver cadastrado no painel do Asaas em
   produção, ou se um evento se perder de vez, a fatura fica PENDING com o
   dinheiro na carteira e ninguém percebe. Um job diário perguntando ao gateway
   o status dos `bankPaymentId` ainda PENDING fecharia o buraco. **Confirmar o
   cadastro do webhook no painel de produção é pré-requisito de lançamento** —
   a correção desta frente não funciona sem ele.
2. **PAYMENT_REFUNDED / PAYMENT_OVERDUE / PAYMENT_DELETED não são tratados** para
   fatura e movimentação. Estorno no gateway deixa o registro PAID no banco.
3. **Gerar PIX duas vezes na mesma fatura/parcela** sobrescreve o
   `bankPaymentId`: a primeira cobrança fica viva no Asaas e órfã no banco. Se o
   cliente pagar o QR Code antigo, o webhook não acha nada. Falta idempotência
   (reaproveitar a cobrança pendente em vez de criar outra).
4. `bankPaymentId` não tem índice nem UNIQUE em `transactions`/`invoices`. Hoje
   o volume é irrelevante, mas o webhook faz `findFirst` por essa coluna a cada
   evento.
5. Fatura sem `clientId` continua pagável por qualquer cliente autenticado
   (achado GRAVE do relatório original, guarda `if (invoice.clientId && ...)`).
   Está no `invoice.service.ts`, meu arquivo, mas não estava nos cinco itens
   desta frente — não mexi para não atropelar quem estiver nele.
6. Todos os `signature_plans` da base estão com `isActive=false` e a contratação
   agora barra plano inativo (correção de outra frente): `POST /signature/pix/<id>`
   devolve 404 para todos eles. Precisa de pelo menos um plano ativo antes do
   lançamento.

## Sujeira de teste deixada no banco

Empresa `ad4a6476-...` ("Clinica M4"), os dois proprietários, o animal, as
faturas `M4-CICLO`/`M4-001` e as movimentações `Conta do Cliente A/B M4`,
`Conta B2 M4` e `Despesa interna M4`. Tudo teste interno, pode ser apagado.
A movimentação órfã "Fatura M4-001" (`invoiceId` NULL) é justamente o estrago
que o item 4 passou a impedir — deixei como evidência. O plano
`44440000-0000-4000-8000-000000004401` ("M4 Regressao"), criado para o teste de
regressão da M1, já foi desativado.
