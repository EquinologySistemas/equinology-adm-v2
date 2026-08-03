# F2-assinatura

Testado contra a API rodando em `http://localhost:3333`, Asaas SANDBOX, banco `vetequus-local`.
Nenhum arquivo `.ts` foi alterado. Foram inseridos via SQL um plano de teste (`QA-F2-Pro`,
id `aaaaaaaa-0000-4000-8000-00000000f201`) e 3 cupons de teste — todos deixados com
`isActive=false` ao final. Não puderam ser deletados: FK `law_firm_signatures.signaturePlanId`
é RESTRICT e já existem assinaturas vinculadas.

Empresas de teste criadas:
- A: company `998a9830-b2ad-47c1-9368-032c9510684c` (Clinica F2)
- B: company `b97deaeb-0277-4d89-b6d4-77a95bdc6876` (Clinica F2B)

## Cobertura: 15 / 15 rotas do meu conjunto

| # | Rota | Testada |
|---|------|---------|
| 1 | `POST /signature/start-trial/:planId` | sim |
| 2 | `POST /signature/pix/:planId` | sim |
| 3 | `POST /signature/credit/new` | sim (cartão sandbox aprovado 5162306219378829) |
| 4 | `POST /signature/credit/existing` | sim (só caminho de erro — ver A-04) |
| 5 | `POST /signature/webhook` | sim (PAYMENT_CONFIRMED, SUBSCRIPTION_CREATED, SUBSCRIPTION_DELETED, auth, payload inválido) |
| 6 | `GET /signature/validation` | sim |
| 7 | `PUT /signature/cancel/:signatureId` | sim |
| 8 | `PUT /signature/refound/:signatureId` | sim (dentro e fora da janela, e em trial) |
| 9 | `GET /signature/current` | sim |
| 10 | `GET /signature/calculate-upgrade` | sim |
| 11 | `POST /signature/upgrade/credit` | sim |
| 12 | `POST /signature/upgrade/pix` | sim |
| 13 | `GET /signature-plan` | sim |
| 14 | `GET /credit-card` | sim (só retorna lista vazia — ver A-04) |
| 15 | `GET /coupons/validate/:code` | sim (válido, expirado, inexistente) |

### Não testado / limites da varredura
- `POST /signature/credit/existing` no caminho FELIZ: **impossível hoje** — a tabela
  `credit_cards` está vazia no banco inteiro (`select count(*) from credit_cards` = 0) e
  nenhuma rota de assinatura grava cartão. Ver A-04.
- Renovação automática real do Asaas (só simulei via webhook, que é como ela chega).
- Cupom aplicado em `upgrade/credit` e `upgrade/pix`: os DTOs não têm campo `couponId`,
  então a rota não aceita cupom (ver A-11).
- Parcelamento: `installmentCount` é aceito no DTO mas **nunca chega ao Asaas** — não
  consegui exercitar parcelamento de verdade (ver A-12).
- Expiração natural do período (scheduler `ExpireTrialSignatures`) não foi aguardada.

---

## Achados

### A-01 — BLOQUEIA — `upgrade/pix` derruba o acesso da clínica na hora, antes de pagar
`POST /signature/upgrade/pix` marca a assinatura vigente (paga) como `INACTIVE` e cria a nova
já `INACTIVE` (só ativa quando o PIX for pago). Resultado: a clínica clica em "fazer upgrade
via PIX", ainda não pagou nada, e perde o sistema no ato — inclusive o período que ela já
tinha pago.

Reprodução (empresa B):
```
POST /signature/credit/new  -> assinatura ACTIVE, expira 2026-09-02
GET  /signature/validation  -> 200 (tem acesso)
POST /signature/upgrade/pix {"newPlanId":"<pro>","yearly":false} -> 201, devolve QR code
GET  /signature/validation  -> 403 NOT_ALLOWED
GET  /signature/current     -> {"hasActiveSignature":false,...}
```
Banco confirma: todas as 3 linhas de `law_firm_signatures` da empresa B ficaram `INACTIVE`.
Código: `companySignature.service.ts` linhas 1009 (`activeSignature.status = 'INACTIVE'`) e
1021 (`status: 'INACTIVE'` na nova). Confiança: CONFIRMADO.

### A-02 — BLOQUEIA — Reembolso não cancela a recorrência: cliente reembolsado continua sendo cobrado todo mês
`PUT /signature/refound/:id` estorna o pagamento e corta o acesso, mas **não** chama
`cancelSubscription` no Asaas. A assinatura recorrente fica ativa e cobra de novo no próximo
ciclo — de um cliente que já foi reembolsado e já perdeu o acesso.

Reprodução (empresa B, assinatura `1beeaa55-efda-4e70-b400-b4474d5cbc61`):
```
PUT /signature/refound/1beeaa55-... -> 200
GET /signature/validation -> 403 (acesso cortado, correto)
Asaas GET /payments/pay_4vnehh5oub7eea9t      -> status REFUNDED
Asaas GET /subscriptions/sub_qlwwkowe08r8sn62 -> status ACTIVE, deleted:false,
                                                  nextDueDate 2026-09-02, value 124.95
```
Código: `refoundSignature` (linhas 523-548) só faz `refound` + `cancelInvoice`; nunca toca em
`this.subscription.cancelSubscription`. Confiança: CONFIRMADO.

### A-03 — BLOQUEIA — Pagar o trial no cartão deixa `paymentType` como PIX e a renovação nunca estende a validade
Quando existe trial e a clínica paga com cartão, o ramo `existingTrial` de `newCreditCard` /
`existingCreditCard` atualiza status, datas e `asaasSubscriptionId`, mas **esquece de trocar
`paymentType` de `'PIX'` para `'CREDIT_CARD'`**. Consequência em cadeia no webhook: em
`signatureValidation` o ramo PIX não roda (exige `status === 'INACTIVE'`) e o ramo
`CREDIT_CARD` também não (o `paymentType` está errado) — a renovação chega, o `paymentId` é
atualizado, e a `expirationDate` **fica parada**. O cliente pagante perde o acesso no fim do
mês mesmo tendo pago.

Reprodução (empresa A, assinatura `0dbc57cb-4bfa-41b8-bd7c-e33416851005`):
```
POST /signature/start-trial/<demo>  -> TRIAL, paymentType PIX
POST /signature/credit/new {...}    -> 201
banco: status=ACTIVE, paymentType=PIX (!), asaasSubscriptionId=sub_5010wpyfxzviiv3p
GET /signature/current -> "paymentType":"PIX" (o cliente pagou no cartão)

# renovação:
POST /signature/webhook  {"event":"PAYMENT_CONFIRMED",
   "payment":{"id":"pay_RENOVACAO_TESTE_1","subscription":"sub_5010wpyfxzviiv3p"}} -> 200
banco: paymentId=pay_RENOVACAO_TESTE_1  |  expirationDate=2026-09-02 17:39:13 (NÃO MUDOU)
```
Contraprova: a mesma renovação numa assinatura criada já como `CREDIT_CARD`
(`4f80ff37-...`, sub `sub_wpkehsor34agdte9`) **estendeu** a expiração de 17:40:12 para
17:40:27 (+1 mês). Ou seja, o defeito é exclusivo do trial convertido.
Código: linhas 273-285 e 373-384 de `companySignature.service.ts`. Confiança: CONFIRMADO.

### A-04 — BLOQUEIA — Cartão salvo não existe: `GET /credit-card` sempre vazio e `credit/existing` inutilizável
Nenhuma rota de assinatura grava o cartão tokenizado. Depois de dois pagamentos bem-sucedidos
com `POST /signature/credit/new`, `GET /credit-card` devolveu `{"data":[]}` e
`select count(*) from credit_cards` = **0 em todo o banco**. Com isso `POST
/signature/credit/existing` nunca encontra cartão e responde 404 para qualquer id — o fluxo
"pagar com o cartão salvo" não funciona para nenhum cliente.
```
POST /signature/credit/new (aprovado) -> 201; banco: creditCardId = NULL
GET  /credit-card -> 200 {"data":[]}
POST /signature/credit/existing {"creditCardId":"<qualquer>"} -> 404 RESOURCE_NOT_FOUND
```
Código: em `newCreditCard` a assinatura é criada com `creditCardId: null` (linha 387) e o
token devolvido pelo Asaas é descartado. Confiança: CONFIRMADO.

### A-05 — BLOQUEIA — Webhook `SUBSCRIPTION_CREATED` ativa a assinatura sem nenhum pagamento
`signatureValidation` trata `SUBSCRIPTION_CREATED` marcando `status = 'ACTIVE'` sem checar
pagamento algum. O Asaas dispara esse evento no instante em que a recorrência é criada — ou
seja, ao gerar o QR code PIX. Assinatura PIX nunca paga vira ACTIVE e libera o sistema.
```
POST /signature/pix/<pro> {"yearly":false} -> 201 (assinatura 448722f7..., status INACTIVE)
POST /signature/webhook {"event":"SUBSCRIPTION_CREATED","subscription":{"id":"sub_ug3icgfgfzvtmycj"}} -> 200
banco: 448722f7... status = ACTIVE   (paymentId nunca pago)
GET /signature/current -> hasActiveSignature:true, plano QA-F2-Pro
```
Código: linhas 486-496. É uma causa **distinta** do bug já mapeado do trial — atinge qualquer
assinatura PIX nova, com ou sem trial. Confiança: CONFIRMADO.

### A-06 — BLOQUEIA — Duplo clique em "pagar" cria duas assinaturas recorrentes no Asaas
Não há nenhuma trava de idempotência nem checagem de assinatura vigente. Duas chamadas
seguidas de `POST /signature/pix/:planId` criaram dois registros e **duas recorrências
distintas** no Asaas — o cliente pode acabar com duas cobranças mensais permanentes.
```
POST /signature/pix/<pro> -> 201  (sig 448722f7..., sub_ug3icgfgfzvtmycj)
POST /signature/pix/<pro> -> 201  (sig 13c0da97..., sub_20me2axwe0inqdzp)
banco: empresa A com 4 assinaturas, 4 asaasSubscriptionId diferentes
```
Pior: as duas foram criadas **enquanto já existia uma assinatura ACTIVE** (`4f80ff37...`) —
a rota não bloqueia contratar por cima de assinatura vigente. Confiança: CONFIRMADO.

### A-07 — BLOQUEIA — Upgrade grava o preço promocional como valor RECORRENTE eterno
O upgrade cria no Asaas uma recorrência cujo `value` é o preço já descontado do crédito
proporcional. Esse desconto é de uma vez só, mas vira o valor de **todos** os meses seguintes.
```
POST /signature/upgrade/credit -> {"creditApplied":237.56,"finalPrice":262.34}
Asaas GET /subscriptions/sub_wpkehsor34agdte9
   -> {value: 262.34, cycle:'MONTHLY', desc:'Upgrade ... (Crédito aplicado: R$ 237.56)'}
```
O plano QA-F2-Pro custa R$ 499,90/mês no cartão; a clínica passa a pagar R$ 262,34/mês para
sempre. Mesmo padrão em `upgrade/pix` (recorrência de R$ 222,34 contra R$ 459,90 do plano).
Código: linhas 853-863 e 973-981. Confiança: CONFIRMADO.

### A-08 — GRAVE — `calculate-upgrade` mostra um preço e a cobrança é outra
A tela de upgrade calcula o novo plano por `pixPrice`, mas `processUpgradeWithCreditCard`
cobra por `creditCardPrice`. Diferença observada de R$ 40,00 no mesmo plano.
```
GET  /signature/calculate-upgrade?planId=<pro>&yearly=false
     -> newPlan.price 459.90 ... "finalPrice":222.34
POST /signature/upgrade/credit (mesmo plano, mesmo instante)
     -> {"finalPrice":262.34}   (confirmado no Asaas: value 262.34)
```
Confiança: CONFIRMADO.

### A-09 — GRAVE — Crédito proporcional maior do que o cliente pagou (`remainingRatio` > 1)
`totalDays` é fixo em 30 (mensal) / 365 (anual) e `daysRemaining` usa `Math.ceil`. Numa
assinatura mensal recém-paga o resultado é `remainingRatio = 1.0333`, gerando um crédito de
R$ 237,56 sobre um plano de R$ 229,90 — a clínica recebe de volta mais do que pagou.
```
GET /signature/calculate-upgrade?planId=<pro>&yearly=false
 -> "daysRemaining":31,"totalDays":30,"remainingRatio":1.0333,"currentPlanCredit":237.56
```
O mesmo cálculo é reusado nos dois `processUpgrade*`, então o erro vai para a cobrança real.
Confiança: CONFIRMADO.

### A-10 — GRAVE — Crédito do plano atual sempre calculado por PIX, mesmo para quem pagou no cartão
`calculateUpgrade`, `processUpgradeWithCreditCard` e `processUpgradeWithPix` usam
`currentPlan.pixPrice` para valorizar o período restante, ignorando `paymentType`. Quem pagou
R$ 249,90 no cartão recebe crédito calculado sobre R$ 229,90 — perde dinheiro no upgrade.
Linhas 743-746, 829-832 e 950-953. Confiança: CONFIRMADO (por leitura + evidência de A-08:
`currentPlan.price` voltou 229.90 numa assinatura paga com cartão).

### A-11 — GRAVE — Cupom vira desconto vitalício na recorrência (e não é devolvido no reembolso)
O desconto é aplicado ao `value` da recorrência, não a uma cobrança única.
```
POST /signature/credit/new {..., "couponId":"<QAF2PCT50 = 50%>"} -> 201
Asaas GET /subscriptions/sub_qlwwkowe08r8sn62 -> {value: 124.95, cycle: 'MONTHLY'}
```
Plano de R$ 249,90 vira R$ 124,95 **todo mês, para sempre**. Além disso, ao reembolsar essa
mesma assinatura o `currentUsages` do cupom permaneceu em 1 (uso não é estornado), e o cupom
já é incrementado no PIX **antes** de o pagamento existir. `upgrade/credit` e `upgrade/pix`
não aceitam cupom (não há campo no DTO). Confiança: CONFIRMADO.

### A-12 — GRAVE — `installmentCount` é validado e depois descartado em silêncio
O DTO exige `installmentCount >= 1` e o service recebe o campo, mas ele **não é usado em
lugar nenhum** — `createSubscription` é chamado sem parcelamento. O cliente escolhe 12x, a
API responde 201 e a cobrança sai à vista. Ida-e-volta: nada no banco nem no Asaas registra
o número de parcelas. Confiança: CONFIRMADO (leitura de `newCreditCard`/`existingCreditCard`
+ subscription no Asaas sem `installment`).

### A-13 — GRAVE — UUID malformado devolve 500 cru em 6 rotas
Qualquer id/param que não seja UUID estoura no Prisma e volta INTERNAL_SERVER_ERROR:
```
POST /signature/start-trial/abc                       -> 500
PUT  /signature/cancel/abc                            -> 500
PUT  /signature/refound/abc                           -> 500
POST /signature/pix/<plano> {"couponId":"abc"}        -> 500
POST /signature/upgrade/pix {"newPlanId":"abc",...}   -> 500
GET  /signature/calculate-upgrade?planId=abc&yearly=false -> 500
GET  /signature/calculate-upgrade?yearly=false  (sem planId) -> 500
```
`couponId` com string de 5000 caracteres também dá 500. Confiança: CONFIRMADO.

### A-14 — GRAVE — Reembolso de trial: a janela de reembolso não barra quando `refoundDateLimit` é NULL, e a rota dá 500
Trial e assinatura PIX não paga nascem com `refoundDateLimit = NULL`. A checagem
`moment(null).isBefore(new Date())` devolve `false`, então **a guarda não dispara** e o fluxo
segue até tentar estornar o `paymentId` literal `'trial'` no Asaas, estourando 500.
```
POST /signature/start-trial/<demo>   -> 201 (paymentId='trial', refoundDateLimit=NULL)
PUT  /signature/refound/<trialId>    -> 500 INTERNAL_SERVER_ERROR
```
O dado não foi corrompido (nada mudou no banco), mas é 500 em uso normal e a única barreira
de janela de reembolso não existe para esse caso. Código: linha 533. Confiança: CONFIRMADO.

### A-15 — GRAVE — Plano com `isActive = false` continua sendo vendido e listado
`GET /signature-plan` devolve planos inativos sem qualquer filtro, e `POST
/signature/credit/new` / `pix` / `start-trial` aceitam plano inativo normalmente. Todo o
fluxo desta auditoria foi contratado sobre o "Plano Demo", que está com `isActive=false` no
banco. Desativar um plano hoje não impede nada.
```
GET /signature-plan -> {"plans":[{"name":"Plano Demo",..., "isActive":false}]}
POST /signature/credit/new {"planId":"33231be6-..."} -> 201 (assinatura criada)
```
Confiança: CONFIRMADO.

### A-16 — GRAVE — Reembolso duplo é aceito e o erro do provedor é ignorado
`refoundPayment.refound()` tem o retorno descartado (não há `isLeft()`), então falha de
estorno no provedor não vira erro para o usuário: a assinatura é marcada INACTIVE de qualquer
jeito. Chamar `PUT /signature/refound/<mesmo id>` duas vezes devolve **200 nas duas**, mesmo
com o pagamento já em `REFUNDED` no Asaas. A clínica não tem como saber se o estorno saiu.
Confiança: CONFIRMADO.

### A-17 — MENOR — Mensagem genérica quando a janela de reembolso venceu
Com `refoundDateLimit` no passado a API responde 403 "Você não tem permissão para realizar
esta ação." — não diz que o prazo de 7 dias expirou. Mesma mensagem usada para "assinatura de
outra empresa", o que confunde suporte. Confiança: CONFIRMADO.

### A-18 — MENOR — Erro do Asaas vazando quando o cupom zera o valor
Cupom FIXED maior que o preço zera o valor (`Math.max(0, ...)`) e o Asaas rejeita; a API
repassa a mensagem do provedor:
```
POST /signature/pix/<pro> {"yearly":false,"couponId":"<FIXED 9999>"}
 -> 400 {"message":"O parâmetro value deve ser informado","code":"PAYMENT_ERROR"}
```
Não deixou lixo no banco (contagem de assinaturas inalterada), mas a mensagem não faz sentido
para a clínica. Confiança: CONFIRMADO.

### A-19 — MENOR — Renovação encurta o período em vez de somar ao saldo
`signatureValidation` faz `expirationDate = agora + 1 mês`, não `expiração anterior + 1 mês`.
Se a cobrança confirmar antes do vencimento, os dias restantes são perdidos.
Observado: expiração passou de `17:40:12` para `17:40:27` (+1 mês contado de agora) após
`PAYMENT_CONFIRMED`. Impacto baixo enquanto a cobrança cair exatamente no vencimento.
Confiança: CONFIRMADO (comportamento), SUSPEITO (impacto real depende do calendário do Asaas).

---

## O que passou (não precisa reauditar)

- **Isolamento entre empresas**: `PUT /signature/cancel/<id de outra empresa>` e
  `PUT /signature/refound/<id de outra empresa>` devolvem **403 NOT_ALLOWED** e o banco
  confirma que a assinatura alheia (`a4d5ab78-...`, company `f4e2f01e-...`) não foi alterada.
  `current`, `validation`, `calculate-upgrade` e os dois `upgrade/*` derivam a empresa do
  token, sem parâmetro manipulável.
- **Autenticação do webhook**: sem header e com token errado → **401** com mensagem clara.
  Só passa com o `ASAAS_WEBHOOK_TOKEN` correto.
- **Idempotência do webhook de pagamento**: reentregar o mesmo `PAYMENT_CONFIRMED`
  (`pay_RENOV_CC_2`) não re-estendeu a expiração — o guard `paymentId !== paymentId` funciona
  de verdade.
- **`PUT /signature/cancel`**: comporta-se como prometido — `isAutoRenewActivated` vai a
  `false`, `status` continua `ACTIVE` e `GET /signature/validation` segue 200 até a
  `expirationDate`. Cancelar duas vezes é seguro (200, estado idêntico).
- **`SUBSCRIPTION_DELETED` no webhook** não derruba o acesso de quem ainda tem período pago
  (assinatura seguiu ACTIVE com `isAutoRenewActivated=false`).
- **Trial é uma vez só**: segunda chamada de `start-trial` → 400 "Esta empresa já utilizou o
  período de teste gratuito." Plano com `trialDays = 0` → 400 "Este plano não oferece período
  de teste gratuito." Ambas as validações **disparam de fato**.
- **Reembolso dentro da janela** corta o acesso na hora (`validation` → 403,
  `current` → `hasActiveSignature:false`) e o estorno realmente sai no Asaas
  (`status: REFUNDED`). Fora da janela (data limite no passado) é bloqueado e nada muda.
- **Cálculo do cupom PERCENT** chega correto ao provedor: 50% sobre R$ 249,90 → R$ 124,95 na
  cobrança do Asaas (o problema é ser recorrente, não o cálculo — ver A-11).
- **`GET /coupons/validate/:code`**: válido → `isValid:true` com o payload completo; expirado
  → `isValid:false` sem vazar o cupom; inexistente → 404 com mensagem em português.
- **Validação dos DTOs** (`pix`, `credit/new`, `credit/existing`, `upgrade/credit`,
  `upgrade/pix`, `webhook`): corpo vazio, tipo errado (`yearly:"sim"`) e valor negativo
  (`installmentCount:-5`) devolvem 400 com lista de mensagens em português.
- **Webhook PIX pago** (`PAYMENT_CONFIRMED` numa assinatura PIX INACTIVE) ativa corretamente:
  status ACTIVE, `refoundDateLimit` preenchido, `validation` → 200.
- **`calculate-upgrade` para o mesmo plano ou plano menor** → 403 (não deixa "upgrade" para
  baixo). Sem assinatura ativa → 403.
- **Rotas protegidas sem token** → 401 com mensagem em português.
- **`GET /signature/current` sem assinatura** → 200 `{"hasActiveSignature":false,...}`,
  sem quebrar.
