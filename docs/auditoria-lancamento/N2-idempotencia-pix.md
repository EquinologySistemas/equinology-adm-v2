# N2 — Idempotência do PIX em fatura e parcela

Frente: fechar a pendência 3 e a pendência 4 do relatório M4 — gerar PIX duas
vezes no mesmo registro criava cobrança órfã, e `bankPaymentId` não tinha índice
nem UNIQUE nas duas tabelas que o webhook concilia.

Tudo abaixo foi reproduzido antes de corrigir e provado depois contra o sandbox
(`https://sandbox.asaas.com/api/v3`).

Ambiente criado do zero para esta frente:

| Papel | Id |
|---|---|
| Clínica (company) | `b00243f1-440c-41a2-b828-5a2df9fcfe4f` — "Clinica N2 1785770601" (walletId `9f80e4ea-...`) |
| Proprietário A (client) | `6833b83a-658f-4556-94d2-9dc2edec6449` — `cus_000008557345` |
| Proprietário B (client) | `9024422c-f1e0-4206-89c9-38e2496218ba` — `cus_000008557346` |

---

## Resumo

| # | Item | Status |
|---|---|---|
| 1 | PIX repetido em FATURA cria cobrança órfã | CORRIGIDO |
| 2 | PIX repetido em PARCELA cria cobrança órfã | CORRIGIDO |
| 3 | Cobrança já paga no gateway + nova tentativa = cobrança em duplicidade | CORRIGIDO |
| 4 | `bankPaymentId` sem índice nem UNIQUE | CORRIGIDO (índice UNIQUE nas duas tabelas) |

---

## 1. A decisão: reaproveitar, não cancelar

As duas opções pedidas:

**(a) reaproveitar a cobrança enquanto ela estiver PENDING** — devolver o MESMO
QR Code.
**(b) cancelar a anterior no Asaas antes de criar a nova.**

Escolhi **(a)**. Os motivos, na ordem em que pesaram:

1. **O QR antigo é o cenário do problema.** O caso relatado é exatamente
   "o proprietário paga o QR que já tinha no WhatsApp". Com (a), qualquer cópia
   antiga que ele tenha guardado aponta para o MESMO `bankPaymentId` que está no
   banco — não existe QR válido que o banco não conheça. Com (b), o QR que ele
   guardou vira uma cobrança cancelada: no melhor caso ele descobre na hora de
   pagar e volta ao app; no pior, o Asaas ainda aceita e o dinheiro entra sem
   contrapartida.
2. **(b) falha justamente no cenário perigoso.** Se o cliente pagou entre uma
   geração e outra, a cobrança está `RECEIVED` e o Asaas não deixa cancelar. O
   fluxo teria que decidir o que fazer com o erro — e a saída errada (ignorar e
   criar outra) é cobrança em duplicidade. Com (a), esse mesmo estado é detectado
   na consulta e vira baixa imediata (item 3).
3. **(b) não é implementável sem invadir arquivo de outra frente.** Cancelar
   exige `DELETE /payments/{id}`, que não existe como porta no domínio; abrir
   essa porta significa editar `asaas.ts`, que é da frente N1.

O que a correção usa são duas portas que **já existiam** e são só de leitura:
`UndefinedPayment.getPaymentInfo` (status e valor da cobrança) e
`Subscription.getPixQrCode` (QR de uma cobrança existente). Nenhum arquivo de
outra frente foi tocado.

Regra implementada (`src/domain/application/services/shared/existingPixCharge.ts`):

| Estado da cobrança anterior no Asaas | O que acontece |
|---|---|
| `PENDING` / `OVERDUE` / `AWAITING_RISK_ANALYSIS`, mesmo valor | devolve o MESMO QR, não cria nada |
| `RECEIVED` / `CONFIRMED` / `RECEIVED_IN_CASH` / `DUNNING_RECEIVED` | dá a baixa na hora e recusa a nova cobrança |
| valor divergente (registro foi editado depois) | cria cobrança nova, com WARN no log |
| `REFUNDED`, `CHARGEBACK*`, cobrança apagada, gateway fora do ar | cria cobrança nova (comportamento antigo) |

O pior caso da função é o sistema voltar a ser o que era. Ela nunca deixa o
cliente sem conseguir pagar por causa de uma falha de consulta.

---

## 2. Fatura — reprodução e prova

### Estado anterior (reproduzido ao vivo)

Fatura `N2-REPRO` (R$ 50, proprietário A). Desabilitei temporariamente o
reaproveitamento para reproduzir o comportamento antigo:

```
geracao 1 -> 201   banco: N2-REPRO | PENDING | pay_4nnbh6h02bxsh9li
geracao 2 -> 201   banco: N2-REPRO | PENDING | pay_o2pj1ki8p0lh6wjd   <- sobrescreveu

ASAAS:  pay_4nnbh6h02bxsh9li  PENDING  50  PIX    <- órfã, viva, pagável
        pay_o2pj1ki8p0lh6wjd  PENDING  50  PIX

o cliente paga o QR ANTIGO no sandbox:
        pay_4nnbh6h02bxsh9li -> RECEIVED_IN_CASH

webhook: POST /signature/webhook {"event":"PAYMENT_RECEIVED",
         "payment":{"id":"pay_4nnbh6h02bxsh9li"}}  -> 200 {"received":true}

banco depois:  N2-REPRO | PENDING | (paidAt vazio) | pay_o2pj1ki8p0lh6wjd
```

Dinheiro na carteira da clínica, fatura "Pendente" para sempre. É exatamente o
que a M4 descreveu. Duas cobranças de R$ 50 vivas ao mesmo tempo também
significam que o cliente conseguiria pagar a mesma fatura duas vezes.

### Depois da correção

Fatura `N2-001` (R$ 123,45, proprietário A), **três** gerações de PIX:

```
geracao 1: HTTP 201  payload sha1 c16271f4496c522c  banco: N2-001 | PENDING | pay_78loc3o2un8xa1rs
geracao 2: HTTP 201  payload sha1 c16271f4496c522c  banco: N2-001 | PENDING | pay_78loc3o2un8xa1rs
geracao 3: HTTP 201  payload sha1 c16271f4496c522c  banco: N2-001 | PENDING | pay_78loc3o2un8xa1rs

ASAAS (cobranças do cus_000008557345 referentes a esta fatura):
        pay_78loc3o2un8xa1rs  PENDING  123.45  PIX     <- uma só
```

Mesmo QR Code (mesmo hash do payload) nas três, um único `bankPaymentId`, uma
única cobrança no gateway.

Pagando o QR e conciliando:

```
sandbox: pay_78loc3o2un8xa1rs -> RECEIVED_IN_CASH
webhook PAYMENT_RECEIVED  -> 200
webhook PAYMENT_CONFIRMED -> 200   (reentrega)

banco:  N2-001 | PAID | paidAt 2026-08-03 15:26:48 | pay_78loc3o2un8xa1rs
caixa:  Fatura N2-001 | 123.45 | INCOME | PAID     (UMA linha, não duplicou)
```

---

## 3. Parcela de movimentação — prova

Movimentação "Conta N2 do Cliente B" (R$ 88,90, proprietário B), parcela
`a1fdedd2-b077-4c21-bc0a-4f9a6b65dfe7`:

```
geracao 1: HTTP 201  payload sha1 598a0e101bc543ab  banco: PENDING | pay_2vnhjtasyat01y95
geracao 2: HTTP 201  payload sha1 598a0e101bc543ab  banco: PENDING | pay_2vnhjtasyat01y95
geracao 3: HTTP 201  payload sha1 598a0e101bc543ab  banco: PENDING | pay_2vnhjtasyat01y95

ASAAS (cobranças do cus_000008557346):
        pay_2vnhjtasyat01y95  PENDING  88.9  PIX      <- uma só

sandbox: pay_2vnhjtasyat01y95 -> RECEIVED_IN_CASH
webhook PAYMENT_RECEIVED -> 200

banco:  Conta N2 do Cliente B | PAID | paymentDate 2026-08-03 15:28:02 | pay_2vnhjtasyat01y95
```

---

## 4. Cobrança já paga entre uma geração e outra

Este é o caso que a opção (b) não resolveria. O cliente paga o PIX, o webhook
ainda não chegou (ou se perdeu), e ele volta ao app e tenta pagar de novo.

**PIX de novo, na fatura N2-001 já paga no gateway e ainda PENDING no banco:**

```
POST /invoice/06575d3a-.../pay/pix
  -> 400 {"message":"Esta fatura já foi paga.","code":"PAYMENT_ERROR"}
  banco IMEDIATAMENTE depois, SEM webhook nenhum:
       N2-001 | PAID | 2026-08-03 15:26:48 | pay_78loc3o2un8xa1rs
```

Ou seja: além de recusar a segunda cobrança, a tentativa **conciliou sozinha**.
Isso fecha parte da pendência 1 da M4 (webhook perdido) pelo caminho do próprio
cliente.

**Cartão depois de PIX pago** — sem isto o cliente seria cobrado duas vezes.
Parcela "Conta N2 cartao-apos-pix" (R$ 40), PIX gerado e pago no gateway,
webhook ainda não disparado:

```
POST /transaction/credit/new  (cartão novo, R$ 40)
  -> 400 {"message":"Este lançamento já foi pago.","code":"PAYMENT_ERROR"}
  banco:  Conta N2 cartao-apos-pix | PAID | 15:29 | pay_c1o09ulrhv4an2jo
  ASAAS:  pay_c1o09ulrhv4an2jo  PIX  40.0  RECEIVED_IN_CASH
          nenhuma cobrança CREDIT_CARD criada — a rota para antes do gateway
```

A mesma guarda foi aplicada nas quatro rotas de cartão (fatura e parcela,
cartão salvo e cartão novo).

---

## 5. Índice e UNIQUE em `bankPaymentId`

Migration `prisma/migrations/20260803120000_unique_bank_payment_id`:

```sql
CREATE UNIQUE INDEX "invoices_bankPaymentId_key"     ON "invoices"("bankPaymentId");
CREATE UNIQUE INDEX "transactions_bankPaymentId_key" ON "transactions"("bankPaymentId");
```

**UNIQUE é seguro?** Verifiquei os três riscos antes de decidir:

- **Colisão entre as duas tabelas** — não existe. Índice único é por tabela, e um
  `payment.id` do Asaas pertence a no máximo uma fatura OU uma parcela (o
  `AsaasPaymentReconciliationService` já faz curto-circuito nessa premissa).
- **Valor nulo** — o Postgres permite NULL repetido em índice único. É o caso da
  maioria das linhas (67 faturas e ~1090 parcelas com NULL hoje) e o índice foi
  criado sem erro justamente por isso.
- **Algum caminho de código escreve o mesmo id em duas linhas?** Auditei os
  quatro: `payPix`/`pix` e as rotas de cartão sempre escrevem um id novo do
  gateway na própria linha; o reaproveitamento reescreve o mesmo id na MESMA
  linha; `ensureInvoicePaymentExists` cria a Movimentação da fatura **sem**
  copiar o `bankPaymentId`; e `PUT /payment`, que reescreve as parcelas, cria as
  novas sem a coluna. Base atual: zero grupos duplicados nas duas tabelas.

Provas:

```
-- a constraint dispara de verdade
update invoices set "bankPaymentId"='pay_78loc3o2un8xa1rs' where number='N2-REPRO';
ERROR: duplicate key value violates unique constraint "invoices_bankPaymentId_key"

-- NULL repetido continua permitido
select count(*) from invoices where "bankPaymentId" is null;  -> 67

-- o webhook deixou de fazer seq scan
explain select * from transactions where "bankPaymentId"='pay_2vnhjtasyat01y95';
Index Scan using "transactions_bankPaymentId_key" on transactions
```

Ganho real do UNIQUE: com a idempotência no lugar, sobrescrita virou exceção. Se
alguma alteração futura reintroduzir o problema, o banco recusa a gravação em vez
de silenciosamente conciliar na linha errada — falha alto em vez de perder
dinheiro.

---

## 6. Banco x Asaas, por cenário

| Cenário | Asaas | Banco (antes) | Banco (agora) | Podem divergir? |
|---|---|---|---|---|
| PIX gerado 1x | 1 cobrança PENDING | PENDING + id | igual | não |
| PIX gerado 3x | **3 cobranças PENDING** | PENDING + id **da última** | 1 cobrança, mesmo id | não |
| Paga o QR antigo | RECEIVED | **PENDING para sempre** | não existe QR antigo diferente | não |
| Paga e gera PIX de novo | RECEIVED | PENDING + 2ª cobrança criada | PAID na hora, nada criado | não |
| Paga PIX e tenta cartão | RECEIVED | RECEIVED **+ cobrança no cartão** | PAID, cartão recusado | não |
| Valor editado depois do PIX | cobrança antiga fica aberta | id sobrescrito | id sobrescrito, com WARN | **sim** (ver pendência 1) |
| Dois cliques simultâneos | 2 cobranças | id da última | id da última | **sim** (ver pendência 2) |
| Webhook nunca entregue | RECEIVED | PENDING | PENDING até o cliente reabrir a tela | sim, mas se resolve sozinho |

---

## 7. Não relaxei acesso

Todo o reaproveitamento roda **depois** das guardas de posse da M4. Lado
negativo testado com os tokens reais:

```
A -> PIX na parcela de B                404 RESOURCE_NOT_FOUND
B -> PIX na fatura N2-001 (do A)        404 RESOURCE_NOT_FOUND
B -> PIX na própria parcela JÁ PAGA     400 "Este lançamento já foi pago."
webhook sem asaas-access-token          401 "Invalid webhook token"
```

Lado positivo (as três gerações de cada dono) continua 201.

---

## Arquivos tocados (API)

```
prisma/schema.prisma                                                        (@unique nas 2 colunas)
prisma/migrations/20260803120000_unique_bank_payment_id/migration.sql       (novo)
src/domain/application/services/shared/existingPixCharge.ts                 (novo)
src/domain/application/services/invoice/invoice.service.ts
src/domain/application/services/finance/services/transaction.service.ts
src/infra/shared/database/prisma/repositories/prismaInvoice.repository.ts   (só comentário)
src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts (só comentário)
```

Não toquei em `companySignature.service.ts` nem em `asaas.ts`. Nenhum módulo
precisou mudar: `BankModule.register()` já exporta `Subscription` e
`UndefinedPayment`, e os três módulos que provêem estes services
(`invoice.module`, `finance.module`, `signature.module`) já o importam.

`npx tsc --noEmit` → exit 0. `npx prisma migrate status` → "Database schema is up
to date". Nada commitado, branch `fix/lancamento` inalterada.

---

## Pendências

1. **Valor editado depois do PIX gerado.** Se a clínica muda o valor da fatura ou
   da parcela com PIX pendente, a cobrança antiga continua aberta no Asaas pelo
   valor antigo e o registro passa a apontar para uma nova. Hoje isso gera um
   WARN no log. Fechar de verdade exige expor `DELETE /payments/{id}` em
   `asaas.ts` (frente N1) e cancelar a anterior — ou bloquear a edição de valor
   enquanto houver cobrança pendente.
2. **Dois cliques simultâneos** no botão de gerar PIX ainda criam duas cobranças:
   as duas requisições leem `bankPaymentId` vazio antes de qualquer uma gravar.
   Precisa de lock por registro (`SELECT ... FOR UPDATE` ou índice de
   idempotência na requisição). Fora do alcance desta frente.
3. As pendências 1, 2, 5 e 6 do relatório M4 continuam abertas — em especial a
   **1** (não existe varredura ativa contra o Asaas) e o **cadastro do webhook no
   painel de produção**, que é pré-requisito de lançamento.

## Sujeira de teste deixada no banco

Empresa `b00243f1-...` ("Clinica N2 1785770601"), os dois proprietários, as
faturas `N2-001` (paga) e `N2-REPRO` (o estrago reproduzido, deixado como
evidência: R$ 50 recebidos no Asaas em `pay_4nnbh6h02bxsh9li` sem contrapartida
no banco) e as movimentações "Conta N2 do Cliente B" e "Conta N2
cartao-apos-pix". Tudo teste interno, pode ser apagado.
