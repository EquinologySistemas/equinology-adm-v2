# M1 — Ciclo de vida da assinatura

Frente M1 do bucket dinheiro. Oito itens recebidos, **oito reproduzidos ao vivo
antes de qualquer alteração** e **oito corrigidos e reprovados ao vivo** contra o
sandbox real do Asaas (`https://sandbox.asaas.com/api/v3`) e o Postgres local.

`npx tsc --noEmit` em `vetequus-api`: **exit 0**.

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/domain/application/services/signature/service/companySignature.service.ts` | Núcleo de todas as correções |
| `src/domain/application/services/signature/interfaces/companySignatureProps.ts` | `RefoundSignatureResponse` passou a admitir `ValidationError` e `PaymentError` |
| `src/domain/enterprise/entities/companySignature.ts` | Novo `set paymentType` (não existia — era a causa do item 4) |

Não toquei em `asaas.ts` (M3), `adminSignature*` (M2) nem `transaction/invoice` (M4).
Nenhuma migration, nenhuma coluna nova.

---

## A pergunta obrigatória: banco x Asaas

A regra que passou a valer no webhook é **uma só**, e é a mesma para PIX e cartão:

```
alreadyProcessed = status === 'ACTIVE' && paymentId === <pagamento do evento>   -> ignora
wasTerminated    = status === 'INACTIVE' && !isAutoRenewActivated               -> ignora
caso contrário   -> ACTIVE, expiração += 1 ciclo, paymentId = <pagamento do evento>
```

O critério antigo era **status atual**; o novo é **pagamento**. Consequência
direta para a divergência banco/gateway:

- **Asaas diz "pago" e banco diz "expirada"** — era o item 3, o pior cenário de
  divergência. Não é mais possível: qualquer `PAYMENT_RECEIVED` /
  `PAYMENT_CONFIRMED` / `SUBSCRIPTION_PAYMENT_RECEIVED` com `paymentId` que o
  banco ainda não registrou estende a validade, independente do status local.
- **Banco diz "ativa" e Asaas não recebeu nada** — eram os itens 1, 2 e 5.
  Nenhum caminho promove assinatura a ACTIVE sem confirmação de pagamento. A
  única exceção declarada é o upgrade cuja diferença proporcional dá menos de
  R$ 5,00 (mínimo do Asaas): aí não há o que cobrar e o upgrade vale na hora,
  sustentado pelo período que a clínica já pagou.
- **Duas verdades ao mesmo tempo** — uma empresa só pode ter UMA assinatura
  dando acesso. Quando um pagamento ativa uma assinatura, as demais são
  encerradas no banco **e** têm a recorrência cancelada no Asaas
  (`supersedeOtherSignatures`). Antes dava para acumular linhas ACTIVE e
  recorrências vivas sem relação com o que a empresa usava.
- **Reentrega de webhook** — o Asaas reentrega evento. `alreadyProcessed`
  garante idempotência: reenviei o mesmo `PAYMENT_CONFIRMED` duas vezes e a data
  não se moveu (prova no item 3).

Ponto que ainda pode divergir, declarado: o processo de upgrade faz duas
chamadas ao Asaas (criar recorrência + cobrar a diferença). Se a segunda falhar,
a primeira é cancelada (`cancelSubscription`) e nada muda no banco — testei o
caminho feliz; o caminho de falha depende do cancelamento dar certo. Se a API
cair exatamente entre as duas, sobra uma recorrência órfã no Asaas sem linha no
banco. Não há transação distribuída aqui e não inventei uma.

---

## Item a item

### 1. Trial virava assinatura paga sem pagamento — CORRIGIDO

`pix()` achava o TRIAL do mesmo plano e o promovia a ACTIVE com data de um ano
antes de qualquer confirmação. Agora a linha do trial só **passa a carregar a
recorrência criada** (`asaasSubscriptionId`, `paymentId`, `yearly`,
`paymentType`), mantendo `status=TRIAL` e a data do trial. Quem ativa é o
webhook.

**Antes** (reproduzido, empresa `e8027820`, plano Demo, `{"yearly": true}`):

```
antes do POST /signature/pix : TRIAL   2026-08-10
depois                       : ACTIVE  2027-08-03   <- um ano, zero pagamento
```

**Depois** (empresa `8fca9ebb`, mesmo payload):

```
POST /signature/pix/33231be6... {"yearly":true} -> 201, QR gerado
banco: 286de434 | TRIAL | 2026-08-10 | pay_1szlwk2o7s46dk6n | sub_a4gxet0lyl8qfl5b
```

**E vira ACTIVE quando o pagamento é confirmado:**

```
POST /signature/webhook {"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_1szlwk2o7s46dk6n",...}}
banco: ACTIVE | 2027-08-03 | refoundDateLimit 2026-08-10 | invoiceId inv_000000497523
GET /signature/current -> hasActiveSignature:true, isTrial:false
```

A nota fiscal (`invoiceId`) agora sai — antes não saía, porque a assinatura já
estava ACTIVE quando o webhook chegava e o ramo de emissão nunca era alcançado.

- **Banco:** TRIAL até o pagamento; ACTIVE + 1 ciclo + janela de reembolso depois.
- **Asaas:** recorrência criada no momento do QR (como já era), primeira cobrança PENDING até o cliente pagar.

### 2. `SUBSCRIPTION_CREATED` ativava sem pagamento — CORRIGIDO

O bloco que marcava `ACTIVE` nesse evento foi removido; ficou o comentário
explicando por quê. `SUBSCRIPTION_CREATED` é disparado quando a recorrência é
criada, ou seja, ao gerar o QR Code.

**Antes:** `sub_f65ig3k75dzdz844` INACTIVE → evento → **ACTIVE**, `GET /signature/validation` 200.

**Depois:**

```
(status resetado para INACTIVE por SQL)
POST /signature/webhook {"event":"SUBSCRIPTION_CREATED","subscription":{"id":"sub_f65ig3k75dzdz844"}}
banco: INACTIVE     <- não ativou

POST /signature/webhook {"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_M1_PAGO_1",...}}
banco: ACTIVE | 2026-09-03 | refoundDateLimit 2026-08-10
GET /signature/validation -> 200
```

Com isso o evento pode ser habilitado no painel do Asaas sem risco — ele
simplesmente não faz nada.

### 3. Renovação por PIX nunca estendia a validade — CORRIGIDO

Era o ramo `signature.paymentType === 'PIX' && signature.status === 'INACTIVE'`.
Substituído pela regra única de "pagamento novo" descrita acima.

**Antes** (`bbfb12ac`, PIX ACTIVE): webhook com `pay_M1_CICLO2` →
`paymentId` atualizado, `expirationDate` **parada** em 2027-08-03.

**Depois** (`478cd3b0`, PIX ACTIVE, segundo ciclo com paymentId novo):

```
antes : ACTIVE | 2026-09-03 | pay_M1_PAGO_1
webhook PAYMENT_CONFIRMED pay_M1_CICLO2_NOVO
depois: ACTIVE | 2026-10-03 | pay_M1_CICLO2_NOVO      <- estendeu

reentrega do MESMO pagamento:
depois: ACTIVE | 2026-10-03 | pay_M1_CICLO2_NOVO      <- idempotente
```

Note que somou ao saldo restante (03/09 → 03/10) em vez de reiniciar a partir de
hoje. Isso resolve de brinde o item MENOR "renovação encurta o período" do
relatório original: a base agora é `max(hoje, expiração atual)`.

### 4. Trial pago no cartão mantinha `paymentType=PIX` — CORRIGIDO

Faltava setter na entidade. Adicionei `set paymentType` e as duas ramificações
`existingTrial` (credit/new e credit/existing) passam a gravar `CREDIT_CARD`.

**Antes** (`a7c1f6af`): trial → `POST /signature/credit/new` → `ACTIVE | PIX`.

**Depois** (`43ec058f`, mesmo fluxo):

```
banco: ACTIVE | CREDIT_CARD | 2026-09-03 | sub_n649l4k2ubacoe2w
renovação (webhook pay_M1_F_CICLO2): ACTIVE | 2026-10-03   <- estendeu
```

### 5. Upgrade por PIX derrubava o acesso antes do pagamento — CORRIGIDO

A antiga **não é mais tocada** no `processUpgradeWithPix`. Ela é encerrada
(banco + recorrência no Asaas) só quando o pagamento do upgrade é confirmado,
pelo `supersedeOtherSignatures` chamado no webhook.

**Antes** (`bf9bca7f`): `validation` 200 → upgrade/pix → `validation` **403**,
as duas linhas INACTIVE, recorrência antiga já cancelada no Asaas.

**Depois** (`d112c8b9`, plano Demo ACTIVE → QA-F2-Pro):

```
antes do upgrade : validation=200
POST /signature/upgrade/pix -> {"success":true,"creditApplied":237.56,"finalPrice":222.34, QR ok}
depois do upgrade: validation=200          <- acesso NUNCA caiu
banco: 43ec058f | ACTIVE   | Plano Demo   | sub_n649l4k2ubacoe2w
       c05577fb | INACTIVE | QA-F2-Pro    | sub_cs58fu5efrd6y0zw
Asaas: sub_n649l4k2ubacoe2w ACTIVE deleted=false     <- antiga viva

POST /signature/webhook PAYMENT_CONFIRMED pay_am2p3n1kci54m2lz
banco: 43ec058f | INACTIVE | isAutoRenewActivated=f
       c05577fb | ACTIVE   | QA-F2-Pro
GET /signature/current -> QA-F2-Pro, 50 usuários
Asaas: sub_n649l4k2ubacoe2w INACTIVE deleted=true    <- só agora
```

- **Banco:** durante todo o intervalo existe exatamente uma assinatura dando acesso.
- **Asaas:** a recorrência antiga só morre depois que a nova é paga. Se a clínica nunca pagar o QR, ela fica no plano antigo, pagando o plano antigo — que é o certo.

### 6. Upgrade gravava o preço promocional como valor recorrente — CORRIGIDO

O crédito proporcional deixou de ir para o `value` da recorrência. Agora:

- a **recorrência** é criada pelo **preço cheio** do plano, com `nextDueDate` no
  fim do ciclo atual;
- a **diferença proporcional** vira uma **cobrança avulsa única**, cobrada hoje
  (`PixPayment.pixPayment` no PIX, `CreditCardPayment.newCreditCartPayment` no
  cartão — ambos já provisionados pelo `BankModule`).

**PIX — antes:** `sub_...` MONTHLY **222,34** contra plano de 459,90 (−51,7% eterno).

**PIX — depois** (`sub_cs58fu5efrd6y0zw`):

```
recorrência : ACTIVE  value=459.90  MONTHLY   1a cobrança PENDING 459.90 due 2026-09-03
avulsa      : pay_am2p3n1kci54m2lz  PENDING  value=222.34  due 2026-08-03  subscription=undefined
```

**Cartão — antes:** `sub_wpkehsor34agdte9` MONTHLY 262,34 contra plano de 499,90.

**Cartão — depois** (empresa `7955c867`, `sub_tb5zg5983n0snhyl`):

```
resposta    : {"creditApplied":237.56,"finalPrice":262.34}
recorrência : ACTIVE  value=499.90  MONTHLY   1a cobrança PENDING 499.90 due 2026-09-03
avulsa      : pay_vdo3d8cg6fcpgnah  CONFIRMED  value=262.34  CREDIT_CARD  subscription=undefined
Asaas: recorrência antiga (249,90) cancelada
```

No cartão a cobrança é síncrona, então a ordem é: cria recorrência → cobra a
avulsa → **se a avulsa for recusada, cancela a recorrência e devolve
`PAYMENT_ERROR` sem mexer em nada**. Antes a antiga já tinha sido cancelada
quando a cobrança sequer havia sido tentada.

### 7. Reembolso não cancelava a recorrência — CORRIGIDO

`refoundSignature` agora cancela a recorrência **antes** de estornar, e verifica
os dois retornos.

**Antes** (`a7c1f6af` / `sub_d0yoka6skam703is`): `refound` 200, acesso cortado,
pagamento REFUNDED, e **`SUB ACTIVE deleted=false nextDueDate=2026-09-03
value=249.90`** — o cliente estornado seria cobrado de novo.

**Depois** (`b95078f4` / `sub_tb5zg5983n0snhyl`):

```
PUT /signature/refound/b95078f4... -> 200
validation=403
banco: INACTIVE | isAutoRenewActivated=f
Asaas: PAY pay_vdo3d8cg6fcpgnah REFUNDED
       SUB sub_tb5zg5983n0snhyl INACTIVE deleted=true
```

Ordem escolhida de propósito: se o cancelamento da recorrência falhar, **nada é
estornado** e o erro volta. É melhor não mexer no dinheiro do que estornar
deixando a cobrança de pé.

Dois efeitos colaterais úteis, no mesmo método (declarados, não pedidos):
o retorno de `refound()` deixou de ser descartado (estorno recusado virava 200),
e `refoundDateLimit` NULL agora dá erro em português em vez de 500:

```
PUT /signature/refound/<trial> -> 400
"Esta assinatura não possui pagamento a ser reembolsado (período de teste ou
 cobrança ainda não confirmada). Para encerrar, use o cancelamento da assinatura."
```

### 8. Nenhuma idempotência no checkout — CORRIGIDO

Duas travas em `pix()`, `newCreditCard()` e `existingCreditCard()`:

1. **Recusa** se já existe assinatura ACTIVE, vigente e com renovação ligada.
2. No PIX, **reaproveita** o checkout aberto: mesmo plano + mesmo ciclo devolve o
   **mesmo QR Code**, sem criar outra recorrência.

**Antes:** dois `POST /signature/pix` seguidos → 201 nos dois, 2 linhas, 2
`asaasSubscriptionId` (`sub_f65ig3k75dzdz844` e `sub_lt2imya456l2rjbo`), ambas
criadas com uma assinatura já ACTIVE na empresa.

**Depois:**

```
2 cliques em POST /signature/pix (empresa 8fca9ebb): QR ok / QR ok
banco: linhas=1  recorrências=1

com assinatura ACTIVE (empresa d112c8b9):
POST /signature/credit/new -> 400 VALIDATION_ERROR
POST /signature/pix        -> 400 VALIDATION_ERROR
"Sua empresa já possui uma assinatura ativa. Para trocar de plano use a opção de
 upgrade; para contratar outro plano, cancele a renovação atual antes."
banco: linhas=1
```

E a trava **não aprisiona** — testei o caminho de saída:

```
PUT /signature/cancel/478cd3b0... -> 200
POST /signature/pix -> QR OK              <- liberado após cancelar a renovação
GET /signature/validation -> 200          <- acesso do período pago preservado
```

---

## Achado extra encontrado na revisão (corrigido)

Com o `supersede` no lugar, apareceu um caminho de ressurreição: assinatura
encerrada (reembolsada, cancelada ou substituída por upgrade) que recebesse um
evento tardio do Asaas voltaria a ACTIVE — e derrubaria a vigente pelo caminho.
Guard adicionado: `status === 'INACTIVE' && !isAutoRenewActivated` = encerrada,
evento ignorado.

```
webhook PAYMENT_RECEIVED em sub_tb5zg5983n0snhyl (reembolsada)
banco: b95078f4 INACTIVE (inalterada) | validation=403

contraprova — checkout PIX pendente (INACTIVE, renovação ligada) segue ativando:
webhook PAYMENT_CONFIRMED em sub_lt2imya456l2rjbo
banco: 48097c33 ACTIVE | 2026-09-03
```

## Negativos (nada foi afrouxado)

| Teste | Resultado |
|---|---|
| Empresa E reembolsando assinatura da empresa G | 403 `NOT_ALLOWED` |
| Empresa E cancelando assinatura da empresa G | 403 `NOT_ALLOWED` |
| Webhook sem header `asaas-access-token` | 401 |
| Webhook com token errado | 401 |
| Webhook com `paymentId` inexistente | 200, nada gravado |
| Trial vencido | `validation` 403 |
| Assinatura de outra empresa após todas as operações de F e G | intacta (ACTIVE, mesma data) |

`supersedeOtherSignatures` filtra por `companyId` e pula a própria assinatura —
nenhuma operação atravessou tenant em nenhum dos testes acima.

## Pendências (fora do escopo M1, não mexi)

1. `remainingRatio` chega a 1.0333 — `totalDays` fixo em 30/365 e `Math.ceil` nos
   dias restantes. O crédito sai maior do que o cliente pagou. Está nos três
   pontos de cálculo (`calculateUpgrade` e os dois `processUpgrade*`). Continua
   errado; minha mudança só impediu que esse erro virasse preço recorrente.
2. Crédito do plano atual sempre calculado por `pixPrice`, mesmo para quem pagou
   no cartão. Mesma região de código.
3. `GET /signature/calculate-upgrade` usa `pixPrice` do plano novo mesmo no
   cartão — a tela ainda promete um valor e a avulsa sai outro (222,34 x 262,34).
4. Cupom continua entrando no `value` da recorrência (desconto vitalício) e é
   consumido antes do pagamento PIX. Não toquei.
5. `installmentCount` continua validado no DTO e descartado no service.
6. Plano com `isActive=false` continua vendável — todos os meus testes rodaram
   sobre planos inativos.
7. Cartão nunca é salvo (`creditCardId: null` em `newCreditCard`), então
   `credit/existing` segue inutilizável. O `newCreditCartPayment` da avulsa de
   upgrade devolve `creditCardToken` e não é persistido — é o gancho natural
   para quem for pegar esse item.
8. UUID malformado ainda dá 500 em `start-trial`, `cancel`, `refound`,
   `couponId`, `upgrade/pix` e `calculate-upgrade` (falta `ParseUUIDPipe`).
9. Corrida real de duplo clique simultâneo no cartão (dois POSTs no mesmo
   milissegundo) não é impedida — a trava é leitura-depois-escrita, sem lock. A
   sequência humana de dois cliques está barrada; a concorrência exata precisaria
   de índice único parcial ou lock, o que exige migration.
10. A recorrência PIX continua sendo criada no momento do QR Code (comportamento
    pré-existente). Checkout abandonado deixa recorrência viva no Asaas gerando
    cobranças PENDING; o `supersede` limpa isso quando outra assinatura é paga,
    mas não há varredura de abandonados.

## Dados de teste deixados no sandbox

Empresas `M1 Ciclo A` a `M1 Ciclo H` (`m1-ciclo-{a..h}@teste.com`, senha
`Senha@12345`). Recorrências órfãs em sandbox criadas **antes** das correções
(duplo clique do item 8) permanecem: `sub_lt2imya456l2rjbo`,
`sub_7q951ku8tn9hup21`, `sub_0hxj6mifhvxxny9x`. Sandbox, sem dinheiro real, e
não há cliente pagante — não montei processo de regularização, conforme a
orientação.
