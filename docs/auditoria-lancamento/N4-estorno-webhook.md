# N4 — Estorno, vencimento e exclusão no gateway

Fecha a pendência 2 do relatório M4: `PAYMENT_REFUNDED`, `PAYMENT_OVERDUE` e
`PAYMENT_DELETED` não eram tratados nem para fatura nem para movimentação.

Os três defeitos foram **reproduzidos ao vivo antes de qualquer alteração**, com
o estorno e a exclusão feitos **de verdade no sandbox do Asaas** (não só
simulados no webhook), e reprovados depois.

`npx tsc --noEmit` em `vetequus-api`: **exit 0**. Nada commitado, branch
`fix/lancamento` intacta.

## Arquivos alterados (API)

```
src/domain/application/services/finance/services/asaasPaymentReconciliation.service.ts
src/domain/application/services/finance/services/transaction.service.ts
src/domain/application/services/invoice/invoice.service.ts
```

Não toquei em `companySignature.service.ts`. A regra de decisão-por-pagamento da
M1, as guardas de idempotência (`alreadyProcessed`) e de assinatura encerrada
(`wasTerminated`) continuam exatamente como estavam — o handler dela roda
primeiro e não sabe que estes eventos existem. O que mudou foi só o segundo
passo do controller, `asaasPaymentReconciliation.handle(...)`, que antes saía na
primeira linha se o evento não fosse de pagamento recebido.

---

## Resumo

| Evento | Fatura | Movimentação | Status |
|---|---|---|---|
| `PAYMENT_REFUNDED` | `PAID` → `CANCELED`, `paidAt` limpo, caixa revertido | `PAID` → `CANCELLED`, `paymentDate` limpo | CORRIGIDO |
| `PAYMENT_OVERDUE` | não grava nada (por decisão) + alerta de divergência | idem | CORRIGIDO |
| `PAYMENT_DELETED` | continua `PENDING`, `bankPaymentId` limpo | idem | CORRIGIDO |
| evento desconhecido | nada | nada | 200, provado |

---

## A pergunta obrigatória: em que estado fica o banco, em que estado fica o Asaas

### `PAYMENT_REFUNDED` — o sistema NÃO tem estado de "estornado"

É a pergunta central desta frente e a resposta honesta é: **não existe**.

```
InvoiceStatus  = PENDING | PAID | CANCELED
PaymentStatus  = PENDING | CANCELLED | PAID     (parcela de movimentação)
```

Nenhum dos dois enums tem `REFUNDED`. Das três opções disponíveis:

- **`PAID` mente.** O dinheiro voltou para o cliente. É o estado atual, e é o
  defeito.
- **`PENDING` mente de outro jeito.** Reabriria a fatura como "a receber" e,
  passado o vencimento, como "Vencida" — tanto na listagem da clínica quanto no
  app do proprietário. E apontando para uma cobrança que no Asaas está
  `REFUNDED`, que é **estado terminal**: aquele QR Code não recebe mais nada.
  Seria cobrar de novo, no mesmo instante, quem acabou de ser reembolsado.
- **`CANCELED` / `CANCELLED` não mente.** Sai do "a receber" e do "recebido", o
  documento continua no histórico (a aba "Canceladas" já existe na UI da
  clínica) e nada some. Se o caso for recobrar, a clínica emite outra fatura.

Escolhi `CANCELED` e **declaro que é uma aproximação**, não o estado certo. O
certo é um status `REFUNDED` próprio, com data e valor estornado — exige
migration, mudança nos dois frontends e tratamento de estorno parcial. Está nas
pendências abaixo. Preferi dizer isso a forçar um estado que minta.

**A outra metade do estorno: o caixa.** Quando a fatura é recebida, o
`ensureInvoicePaymentExists` cria automaticamente uma Movimentação de ENTRADA
com uma parcela `PAID`. Marcar só a fatura como cancelada deixaria o dinheiro
estornado somando no faturamento e no gráfico. Por isso o estorno também
**cancela as parcelas dessa Movimentação** — não apaga: `CANCELLED` é
exatamente o status que o `PrismaTransactionStatisticsMapper` pula
(`if (transaction.status === 'CANCELLED') continue;`), então o valor sai das
estatísticas e o rastro fica.

| | Asaas | Banco (antes) | Banco (agora) |
|---|---|---|---|
| Fatura estornada | `REFUNDED` | **`PAID` + caixa somando** | `CANCELED`, `paidAt` NULL, caixa `CANCELLED` |
| Parcela estornada | `REFUNDED` | **`PAID`** | `CANCELLED`, `paymentDate` NULL |

**Podem divergir?** Sim, em duas janelas declaradas:

1. Se o webhook não for entregue (endpoint fora do ar, evento não habilitado no
   painel do Asaas), o registro fica `PAID` com o dinheiro devolvido. É a mesma
   janela da M4 e continua sem varredura ativa.
2. Se a fatura for marcada como cancelada mas o cancelamento da Movimentação de
   caixa falhar (erro de banco no meio), fica fatura cancelada + caixa somando.
   Escolhi essa ordem de propósito e o caso vira `logger.error` explícito
   ("...o caixa está somando um valor que voltou para o cliente"). Não há
   transação distribuída aqui e não inventei uma.

O `bankPaymentId` **fica** no registro estornado: é o rastro para bater com o
extrato do Asaas, e a coluna é `UNIQUE` (migration de outra frente) — apagá-la
perderia a ligação.

### `PAYMENT_OVERDUE` — o estado certo é NÃO gravar nada

Também não existe status "Vencida". E não precisa existir: **"Vencida" é
derivado**, não armazenado. Na listagem da clínica:

```ts
// equinology-web-v2/app/(dashboard)/financial/_components/InvoicesTable.tsx
function isOverdue(inv) { return inv.status === "PENDING" && isPastDueDay(inv.dueDate); }
```

e no `summary` do repositório (`overdueCount` = `status PENDING` + `dueDate <
corte`). O vencimento que o Asaas usa é o mesmo `dueDate` que este sistema
mandou para lá. Ou seja, o banco **já sabe** — não havia divergência para
corrigir aqui, havia um evento não reconhecido.

Forçar um estado seria pior: `CANCELED` apagaria uma dívida que continua de pé
(o Asaas segue aceitando pagamento de cobrança `OVERDUE` — é inclusive um dos
`REUSABLE_STATUSES` do `existingPixCharge` de outra frente).

O que o tratamento faz de útil é **denunciar divergência**: cobrança vencida no
gateway com o registro `PAID` aqui significa baixa manual em cima de dinheiro
que nunca compensou. Vira `logger.error` com o id dos dois lados.

| | Asaas | Banco |
|---|---|---|
| Cobrança vence, registro pendente | `OVERDUE` | `PENDING` (inalterado, já aparece "Vencida") |
| Cobrança vence, registro pago | `OVERDUE` | `PAID` intacto + `ERROR DIVERGÊNCIA` no log |

### `PAYMENT_DELETED` — a dívida não some junto com a cobrança

Apagar a cobrança no painel do Asaas desfaz o **meio de pagamento**, não o
serviço prestado. Então a fatura/parcela continua `PENDING`. O que morre é o
vínculo com o gateway, e é isso que passou a ser gravado: **`bankPaymentId` vai
para NULL**.

Por que isso importa e não é cosmético:

- o registro deixava de apontar para uma cobrança inexistente;
- o `resolveExistingPixCharge` (idempotência do PIX, frente N2) gastava uma
  chamada ao gateway a cada nova tentativa só para descobrir que a cobrança
  sumiu;
- a coluna é `UNIQUE`: um id morto ocupando a linha atrapalha;
- um evento tardio daquele id não casa mais com o registro errado (e é o que dá
  a idempotência de graça — ver o teste de reentrega).

**Registro `PAID` não é tocado.** O Asaas não deixa apagar cobrança recebida; se
o evento vier assim mesmo, desfazer uma baixa (que pode ter sido em dinheiro,
lançada à mão) é pior do que ignorar. Vira `logger.error` de divergência.

| | Asaas | Banco (antes) | Banco (agora) |
|---|---|---|---|
| Cobrança apagada, registro pendente | `deleted=true` | `PENDING` + id órfão | `PENDING`, `bankPaymentId` NULL |
| Cobrança apagada, registro pago | `deleted=true` | `PAID` | `PAID` intacto + `ERROR DIVERGÊNCIA` |

---

## Cenário montado (do zero, para esta frente)

| Papel | Id |
|---|---|
| Clínica | `381433c1-e627-4bc5-846c-485b5d943cbf` ("Clinica N4", walletId `9f80e4ea-...`) |
| Proprietário | `c771bc70-e8cd-4d48-bb5d-1c92688e66f0` |

Três faturas e três movimentações, cada par cobrado de verdade pelo app do
proprietário (cartão para os que precisavam ficar pagos, PIX para os demais):

```
N4-INV-REFUND    111,11  cartao  -> PAID    pay_qiv3ba1lb2lan6ag
N4-INV-OVERDUE   222,22  pix     -> PENDING pay_q6fjjfay7vh0rngt
N4-INV-DELETED   333,33  pix     -> PENDING pay_axoew12ixbyaywi0
N4-TRX-REFUND    444,44  cartao  -> PAID    pay_xyv5smz19k97zrzy
N4-TRX-OVERDUE   555,55  pix     -> PENDING pay_8pd8hfirfw1sx6jk
N4-TRX-DELETED   666,66  pix     -> PENDING pay_dfwb8mmfzgyebfsr
```

Depois, **no gateway de verdade** (`POST /payments/{id}/refund` e
`DELETE /payments/{id}` no sandbox):

```
pay_qiv3ba1lb2lan6ag -> REFUNDED     (fatura de 111,11 devolvida ao cliente)
pay_xyv5smz19k97zrzy -> REFUNDED     (parcela de 444,44 devolvida)
pay_axoew12ixbyaywi0 -> deleted=true
pay_dfwb8mmfzgyebfsr -> deleted=true
```

## 1. Reprodução do defeito (código antigo)

Os seis eventos disparados contra o webhook, com o gateway já nos estados acima:

```
POST /signature/webhook PAYMENT_REFUNDED pay_qiv3ba1lb2lan6ag -> {"received":true} 200
POST /signature/webhook PAYMENT_REFUNDED pay_xyv5smz19k97zrzy -> {"received":true} 200
POST /signature/webhook PAYMENT_OVERDUE  pay_q6fjjfay7vh0rngt -> {"received":true} 200
POST /signature/webhook PAYMENT_OVERDUE  pay_8pd8hfirfw1sx6jk -> {"received":true} 200
POST /signature/webhook PAYMENT_DELETED  pay_axoew12ixbyaywi0 -> {"received":true} 200
POST /signature/webhook PAYMENT_DELETED  pay_dfwb8mmfzgyebfsr -> {"received":true} 200
```

Banco **antes e depois, idêntico**:

```
N4-INV-REFUND  | PAID    | paidAt 2026-08-03 15:50:00 | pay_qiv3ba1lb2lan6ag
N4-TRX-REFUND  | PAID    | pagto  2026-08-03 15:50:04 | pay_xyv5smz19k97zrzy
caixa da fatura: "Fatura N4-INV-REFUND" | PAID | 111.11
N4-INV-DELETED | PENDING | pay_axoew12ixbyaywi0   (cobranca ja apagada no Asaas)
N4-TRX-DELETED | PENDING | pay_dfwb8mmfzgyebfsr   (idem)
```

Ou seja: R$ 555,55 estornados no gateway continuavam "recebidos" no sistema,
somando no caixa e no gráfico da clínica.

## 2. Prova depois da correção

### `PAYMENT_REFUNDED`

```
ANTES
  N4-INV-REFUND | PAID      | paidAt 2026-08-03 15:50:00 | pay_qiv3ba1lb2lan6ag
  N4-TRX-REFUND | PAID      | pagto  2026-08-03 15:50:04 | pay_xyv5smz19k97zrzy
  caixa         | Fatura N4-INV-REFUND | PAID | 111.11 | pagto 15:50:00

evento -> 200

DEPOIS
  N4-INV-REFUND | CANCELED  | paidAt (vazio) | pay_qiv3ba1lb2lan6ag
  N4-TRX-REFUND | CANCELLED | pagto  (vazio) | pay_xyv5smz19k97zrzy
  caixa         | Fatura N4-INV-REFUND | CANCELLED | 111.11 | pagto (vazio)
```

### `PAYMENT_OVERDUE`

Não grava nada — e isso foi **provado, não presumido**. Subi uma segunda
instância da API em `PORT=3344` (mesmo banco) só para capturar o log e mostrar
que o evento chega ao registro certo em vez de cair no "não corresponde a
nada":

```
LOG [InvoiceService]     Cobrança pay_toshbek0isd13yks da fatura 93832761-... venceu
                         no gateway. A fatura segue Pendente e o vencimento
                         (2026-09-10) já a mostra como vencida.
LOG [TransactionService] Cobrança pay_ui8mmoorav2pekf3 do lançamento c3ce78e3-...
                         venceu no gateway. O lançamento segue Pendente com o
                         mesmo vencimento.

banco: N4B-INV-OVERDUE PENDING pay_toshbek0isd13yks   (inalterado, correto)
       N4B-TRX-OVERDUE PENDING pay_ui8mmoorav2pekf3   (inalterado, correto)
```

### `PAYMENT_DELETED`

```
ANTES  N4-INV-DELETED | PENDING | pay_axoew12ixbyaywi0
       N4-TRX-DELETED | PENDING | pay_dfwb8mmfzgyebfsr

evento -> 200

DEPOIS N4-INV-DELETED | PENDING | (bankPaymentId vazio)
       N4-TRX-DELETED | PENDING | (bankPaymentId vazio)
```

## 3. Teste de regressão que importa: o fluxo normal continua funcionando

Fatura e movimentação novas, PIX emitido pelo app, compensadas no sandbox
(`receiveInCash`), evento `PAYMENT_RECEIVED`:

```
ANTES   N4B-INV-REGRESSAO | PENDING |
        N4B-TRX-REGRESSAO | PENDING |

POST /signature/webhook PAYMENT_RECEIVED pay_9xpsefjrf1fqzned -> 200
POST /signature/webhook PAYMENT_RECEIVED pay_iaukm88a6kugr0d2 -> 200

DEPOIS  N4B-INV-REGRESSAO | PAID | paidAt 2026-08-03 15:55:34
        N4B-TRX-REGRESSAO | PAID | pagto  2026-08-03 15:55:34
        caixa: Fatura N4B-INV-REGRESSAO | PAID | 22.22

LOG Fatura 6e27c0c0-... recebida — Movimentação 91b0abb9-... criada (R$ 22.22).
LOG Fatura 6e27c0c0-... confirmada pelo webhook do Asaas (pagamento pay_9xpsefjrf1fqzned).
```

**Assinatura (frente M1) intacta**, com assinatura `INACTIVE` + renovação ligada:

```
ANTES  44440000-...-4401 | INACTIVE | pay_N4_REGRESSAO_SIG | 2026-08-03
PAYMENT_CONFIRMED pay_N4_REGRESSAO_SIG -> 200
DEPOIS 44440000-...-4401 | ACTIVE   | expiração 2026-09-03 | refoundDateLimit 2026-08-10
reentrega do MESMO evento               -> ACTIVE, 2026-09-03 (data não se moveu)
PAYMENT_REFUNDED no pagamento da assinatura -> ACTIVE, 2026-09-03 (não mexeu em nada)
```

Esse último caso é proposital: `PAYMENT_REFUNDED` de **assinatura** não é tratado
por esta frente. Estorno de assinatura é o `refoundSignature` da M1, que já
cancela a recorrência e encerra o acesso pela rota do painel. Fazer o webhook
mexer na assinatura aqui atropelaria a M1 — declarado nas pendências.

## 4. Evento desconhecido responde 200 e não grava nada

```
PAYMENT_CHARGEBACK_REQUESTED pay_toshbek0isd13yks -> {"received":true} 200
PAYMENT_PARTIALLY_REFUNDED   pay_qiv3ba1lb2lan6ag -> {"received":true} 200
PAYMENT_UPDATED              pay_toshbek0isd13yks -> {"received":true} 200
EVENTO_QUE_NAO_EXISTE        pay_toshbek0isd13yks -> {"received":true} 200

banco: N4B-INV-OVERDUE PENDING pay_toshbek0isd13yks   (intacta, com o id)
```

Nenhum `throw` novo foi introduzido no caminho do webhook: o `handle` inteiro
segue dentro de um `try/catch` que só loga. O Asaas nunca recebe 5xx nosso.

## 5. Idempotência (o Asaas reentrega o que não recebe 2xx)

```
PAYMENT_REFUNDED pay_qiv3ba1lb2lan6ag (2a vez) -> CANCELED, caixa CANCELLED (nada muda)
PAYMENT_REFUNDED pay_xyv5smz19k97zrzy (2a vez) -> CANCELLED (nada muda)
PAYMENT_OVERDUE  pay_toshbek0isd13yks (2a vez) -> PENDING (nada muda)
PAYMENT_DELETED  pay_axoew12ixbyaywi0 (2a vez) -> DEBUG "não corresponde a fatura
                                                  nem a lançamento"
```

A reentrega do `DELETED` é idempotente por construção: o `bankPaymentId` já foi
limpo na primeira, então a segunda não acha registro nenhum.

## 6. Negativos (não afrouxei nada)

| Teste | Resultado |
|---|---|
| Webhook sem header `asaas-access-token` | **401** |
| Webhook com token errado | **401** |
| `PAYMENT_OVERDUE` em registro PAGO | nada alterado + `ERROR DIVERGÊNCIA` |
| `PAYMENT_DELETED` em registro PAGO | nada alterado + `ERROR DIVERGÊNCIA` |
| `PAYMENT_REFUNDED` em pagamento de assinatura | assinatura intacta |
| Registros de outras empresas após os 20+ eventos | intactos (`N2-001`, `M4-CICLO`, `M3-*`, `F3-ORFA` com o mesmo status e `paidAt`; **0** parcelas CANCELLED fora da minha empresa) |

Não existe atravessamento de tenant possível por este caminho: a chave é o
`payment.id` do Asaas, que é `UNIQUE` no banco e não vem do usuário — o webhook
não recebe `companyId` nem consulta por ele.

---

## Pendências (declaradas, fora do que foi pedido)

1. **Não existe status "Estornado".** `CANCELED`/`CANCELLED` é a aproximação
   honesta, mas some a distinção entre "a clínica cancelou a fatura" e "o
   dinheiro entrou e voltou". Um `REFUNDED` próprio (com `refundedAt` e
   `refundedValue`) precisa de migration + UI nos dois frontends.
2. **`PAYMENT_PARTIALLY_REFUNDED` não é tratado** — de propósito. Estorno
   parcial não cabe em `PENDING|PAID|CANCELED`: tratar como total apagaria do
   caixa dinheiro que a clínica ficou. Hoje responde 200 e não grava. Depende do
   item 1.
3. **`PAYMENT_CHARGEBACK_REQUESTED` / `PAYMENT_CHARGEBACK_DISPUTE` /
   `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` não são tratados.** Contestação de
   cartão é um fluxo com ida e volta (pode ser revertida a favor da clínica) e
   merece frente própria. Hoje responde 200 e não grava — o `PAYMENT_REFUNDED`
   final, quando o chargeback é perdido, é que dá a baixa.
4. **Estorno de ASSINATURA por webhook continua sem tratamento.** Só a rota
   `PUT /signature/refound` (M1) encerra o acesso. Se o estorno for feito
   direto no painel do Asaas, a assinatura fica `ACTIVE` no banco com o dinheiro
   devolvido. É o mesmo defeito desta frente, um andar acima, e está no arquivo
   da M1 — não entrei nele.
5. **Continua sem varredura ativa contra o Asaas** (pendência 1 da M4). Tudo
   aqui é reativo ao webhook. `PAYMENT_REFUNDED`, `PAYMENT_OVERDUE` e
   `PAYMENT_DELETED` **precisam estar habilitados no painel do Asaas em
   produção** — a correção não funciona sem isso, exatamente como o
   `PAYMENT_RECEIVED` da M4.
6. **A reversão do caixa não é transacional com a fatura.** Descrito acima; o
   caso vira `logger.error`, sem retentativa automática.
7. Um estorno não avisa ninguém. Não há notificação para a clínica nem para o
   proprietário — a clínica descobre olhando a listagem.

## Sujeira de teste deixada

Empresa `381433c1-...` ("Clinica N4", `n4-clinica-1785772108@teste.com`), o
proprietário `n4-dono-1785772108@teste.com` (senha `Senha@12345`), a categoria
"N4 Servicos", as faturas `N4-INV-*` / `N4B-INV-*` e as movimentações `N4-TRX-*`
/ `N4B-TRX-*`. No sandbox ficam as cobranças estornadas e apagadas listadas
acima. A assinatura `44440000-0000-4000-8000-000000004401` foi inserida por SQL
só para o teste de regressão da M1. Tudo teste interno, pode apagar.

A segunda instância da API na porta 3344 (usada para capturar log) foi
encerrada; a de `3333` continua rodando normalmente.
