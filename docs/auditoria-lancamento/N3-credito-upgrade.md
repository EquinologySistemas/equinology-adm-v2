# N3 — O crédito do upgrade e o cupom vitalício

Cinco pendências herdadas de M1/M2. **Todas reproduzidas ao vivo antes de
qualquer alteração** contra o sandbox do Asaas e o Postgres local.
Resultado: **4 corrigidas e reprovadas ao vivo, 1 parcial** (a parte que falta
mora dentro do handler do webhook, que esta frente foi proibida de editar).

`npx tsc --noEmit` em `vetequus-api`: **exit 0**.

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/domain/application/services/signature/service/companySignature.service.ts` | Matemática do crédito, preço por meio de pagamento, cupom só na 1ª cobrança |
| `src/domain/application/services/signature/interfaces/companySignatureProps.ts` | `paymentType` no request/response de `calculateUpgrade`; `installmentCount` fora |
| `src/infra/http/controllers/signature/companySignature.controller.ts` | Query `paymentType` em `calculate-upgrade` |
| `src/infra/http/controllers/signature/dto/companySignature.dto.ts` | `installmentCount` removido dos dois DTOs de cartão |

**Não toquei** em `signatureValidation` (handler do webhook), `asaas.ts`,
`adminSignature.service.ts` nem em nada de fatura/movimentação. Nenhuma
migration, nenhuma coluna nova.

---

## A pergunta obrigatória: banco x Asaas

Todas as correções desta frente são de **cálculo de valor**. Nenhuma delas muda
quem grava o quê nem quando — a máquina de estados que M1 montou continua
intacta. Em consequência:

- **Onde o banco e o Asaas podem divergir:** em lugar nenhum que esta frente
  tenha criado. O crédito do upgrade nunca foi um registro; é um número
  calculado na hora e transformado em UMA cobrança avulsa no Asaas. O que mudou
  foi o valor dessa cobrança e o valor gravado na recorrência.
- **O que passou a bater:** o valor que a tela promete (`calculate-upgrade`) e o
  valor da avulsa que o Asaas emite. Eram 222,34 x 262,34; hoje são o mesmo
  número, com uma divergência residual de **até R$ 0,01** — ver "Divergência
  residual declarada", abaixo.
- **Cupom:** o desconto deixou de existir no `value` da recorrência do Asaas.
  Ele agora existe apenas como uma cobrança avulsa de valor menor. A recorrência
  no Asaas carrega o preço de tabela desde o primeiro dia; não há nada no banco
  que "lembre" do desconto e possa sair de sincronia com o gateway.
- **Divergência que continua existindo e NÃO é minha para consertar:** com
  cupom, a nota fiscal emitida na confirmação do pagamento sai pelo preço
  CHEIO, porque quem a emite é o handler do webhook e ele recalcula o valor a
  partir do plano. Está na lista de pendências como item bloqueante.

---

## Item a item

### 1. O crédito saía maior do que o cliente pagou — CORRIGIDO

`remainingRatio` usava `totalDays` fixo (30 ou 365) e `Math.ceil` nos dias
restantes. Mês de 31 dias devolvia `31/30 = 1.0333`.

**Antes** (empresa `N3 Credito a`, Plano Demo mensal pago no cartão hoje):

```
GET /signature/calculate-upgrade?planId=<QA-F2-Pro>&yearly=false
"calculation":{"daysRemaining":31,"totalDays":30,"remainingRatio":1.0333,
               "currentPlanCredit":237.56,"upgradeCost":222.34,"finalPrice":222.34}
```

237,56 de crédito sobre um `pixPrice` de 229,90 — 7,66 a mais do que o preço
inteiro do período, para quem tinha usado 40 minutos dele.

**Depois** (mesma empresa, mesma assinatura, minutos depois):

```
"calculation":{"daysRemaining":31,"totalDays":31,"remainingRatio":0.9998,
               "currentPlanCredit":249.86,"upgradeCost":210.04,"finalPrice":210.04,
               "paymentType":"PIX"}
```

O total agora é o tamanho REAL do período, obtido recuando um ciclo a partir da
expiração com `moment().subtract(1, 'month'|'year')` — a mesma conta que gerou a
expiração, então fecha exatamente. A proporção é medida em milissegundos e
travada em `[0, 1]`.

**Meses e anos de tamanhos diferentes, provados:**

```
ciclo anual atravessando 29/02/2028 : totalDays 366  ratio 1       credit 2698.92
ciclo anual sem 29/02               : totalDays 365  ratio 0.8256  credit 2228.31
ciclo mensal 03/08 -> 03/09         : totalDays 31
ciclo mensal 24/06 -> 24/07         : totalDays 30
```

2698,92 é exatamente `249,90 x 12 x 0,90`, o preço anual cheio: com o período
inteiro pela frente o crédito é igual ao pago, nunca maior.

**Assinatura já vencida** (expiração empurrada 10 dias para trás por SQL):

```
"calculation":{"daysRemaining":0,"totalDays":30,"remainingRatio":0,
               "currentPlanCredit":0,"upgradeCost":499.9,"finalPrice":499.9}
```

Zero, não crédito negativo. Antes o `Math.max(0, ...)` protegia só o
`daysRemaining`; a trava agora está na proporção, que é o que multiplica o
dinheiro.

- **Banco:** nada muda; a proporção não é persistida.
- **Asaas:** a cobrança avulsa do upgrade passou a sair pelo valor certo.

### 2. O crédito usava sempre o preço PIX — CORRIGIDO

Os três pontos de cálculo calculavam o crédito do plano ATUAL por `pixPrice`,
mesmo para quem pagou no cartão.

**Antes:** `currentPlan.price: 229.9` para uma assinatura `CREDIT_CARD` cujo
plano custa `creditCardPrice: 249.9`. Quem pagou 249,90 tinha 229,90 como base
de crédito — 20 reais a menos do que pagou, todo mês, em todo upgrade.

**Depois:**

```
"currentPlan":{"name":"Plano Demo","price":249.9}    <- creditCardPrice, que foi o pago
```

A base agora é `activeSignature.paymentType`. Extraí isso num único
`planPeriodPrice(plan, yearly, paymentType)` usado nos três pontos, para não
sobrar um quarto lugar com a regra antiga.

### 3. A tela prometia um valor e a cobrança saía outro — CORRIGIDO

`GET /signature/calculate-upgrade` não sabia em que meio de pagamento o cliente
ia pagar e assumia PIX; `processUpgradeWithCreditCard` cobrava por
`creditCardPrice`.

A rota passou a aceitar `paymentType` (`PIX` — padrão — ou `CREDIT_CARD`):

```
GET /signature/calculate-upgrade?planId=<QA-F2-Pro>&yearly=false&paymentType=CREDIT_CARD
"newPlan":{"price":499.9,"pixPrice":459.9,"creditCardPrice":499.9}
"calculation":{"currentPlanCredit":249.86,"finalPrice":250.04,"paymentType":"CREDIT_CARD"}
```

E a cobrança de verdade, no mesmo cliente, logo em seguida:

```
POST /signature/upgrade/credit
-> {"success":true,"creditApplied":249.86,"finalPrice":250.04}

Asaas: RECORRENCIA sub_0g9qxxlklzi94s3z  value 499.90  MONTHLY ACTIVE  next 2026-10-03
       AVULSA      pay_5apl50z4qyqoz48l  value 250.04  CONFIRMED CREDIT_CARD due 2026-08-03
                                                        subscription: (nenhuma)
banco: QA-F2-Pro ACTIVE | Plano Demo INACTIVE
```

**A conta fecha:** pagou 249,90 pelo mês → restavam 31 de 31 dias →
crédito 249,86 → avulsa 250,04. `249,86 + 250,04 = 499,90`, o preço cheio do
plano novo no cartão. O crédito (249,86) **não passa do que o cliente pagou**
(249,90). A recorrência ficou com **499,90, o preço cheio**.

Valor entregue à tela = valor cobrado. Sem `paymentType` a rota responde
exatamente como antes (PIX), então o front atual não quebra — mas ele precisa
passar o parâmetro para a tela do cartão parar de mostrar o preço do PIX. Ver
pendências.

### 4. O cupom virava desconto vitalício — CORRIGIDO / consumo antes do pagamento — PARCIAL

**4a. Vitalício — CORRIGIDO.**

O desconto ia direto no `value` da recorrência do Asaas. Um cupom de 50% custava
metade da receita daquele cliente **em todos os ciclos**, para sempre.

**Antes** (`N3 Credito b`, Plano Demo mensal, cupom `N3TESTE50` de 50%):

```
Asaas: RECORRENCIA sub_3381bh1l6pshjtty  value 114.95  MONTHLY ACTIVE
```

114,95 é metade de 229,90 — e era esse o valor de setembro, outubro, novembro...

**Depois** (`N3 Credito c`, mesmo plano, mesmo cupom):

```
Asaas: RECORRENCIA sub_hbk2amgyf9pu6ie2  value 229.90  MONTHLY ACTIVE  next 2026-10-03
       1a COBRANCA pay_2as0w2jfujvibdgr  value 114.95  PENDING PIX  due 2026-08-03
                                                        subscription: (nenhuma)
       cobranças da recorrência: pay_fx0339a3c9wkudpm  229.90  PENDING  due 2026-09-03
```

O desconto vale **só na primeira cobrança**; a segunda já é 229,90. É o mesmo
padrão que M1 usou no upgrade: recorrência pelo preço cheio vencendo no ciclo
seguinte + cobrança avulsa hoje pelo valor com desconto.

**No cartão** (`N3 Credito d`, mesmo cupom):

```
Asaas: RECORRENCIA sub_f3zzus34uq7tqt0p  value 249.90  MONTHLY ACTIVE
       1a COBRANCA pay_78qwzjhusznuun3d  value 124.95  CONFIRMED CREDIT_CARD
       cobranças da recorrência: pay_0rf6nzpnq4wc7y5g  249.90  PENDING  due 2026-09-03
```

Se a cobrança com desconto falhar, a recorrência recém-criada é cancelada e
nada é gravado — mesma ordem de segurança que M1 adotou no upgrade do cartão.

**Sem cupom nada mudou** (contraprova, `N3 Credito e`):

```
Asaas: RECORRENCIA sub_cyt04ckgzfjv3y50  value 229.90  MONTHLY  next 2026-09-03
       cobranças: pay_s1tmdnk99phcpb0i  229.90  PENDING  due 2026-08-03
```

A recorrência continua gerando a cobrança de hoje, como sempre. O caminho novo
só é acionado quando existe desconto.

**Cupom que zera a cobrança é recusado em português** (cupom `N3TESTE100`, 100%):

```
POST /signature/pix/... {"couponId":"<100%>"}  -> 400
"Este cupom deixa a primeira cobrança em R$ 0,00, abaixo do mínimo de R$ 5,00
 aceito pelo provedor de pagamento. Use um cupom de desconto menor ou contrate o
 plano sem cupom."
banco: nenhuma linha criada | Asaas: nenhuma recorrência criada | cupom: currentUsages 0
```

Sem isso o Asaas rejeitaria a cobrança com erro técnico em inglês depois de já
ter criado a recorrência.

**4b. Consumido antes do pagamento — PARCIAL. Reproduzido, NÃO corrigido.**

```
POST /signature/pix com cupom (sem pagar nada) -> 201
coupons: currentUsages 0 -> 1
```

Quem gera o QR e não paga continua queimando um uso do cupom. **O lugar certo de
consumir é a confirmação do pagamento, dentro de `signatureValidation` — o
handler do webhook, que esta frente foi explicitamente proibida de editar.**
Deixar de incrementar aqui sem incrementar lá seria trocar um incômodo por um
vazamento: um cupom com `maxUsages: 1` passaria a valer para todo mundo. Mantive
o comportamento atual de propósito. Instruções exatas na seção de pendências.

**O que consegui melhorar sem tocar no webhook:** cliques repetidos não queimam
mais o cupom de novo. A reutilização de checkout de M1 buscava o QR pela
RECORRÊNCIA; com cupom isso devolveria a cobrança do próximo ciclo, pelo preço
cheio. Agora ela busca pelo `paymentId` gravado, que é a avulsa com desconto:

```
3 cliques em POST /signature/pix com cupom (empresa c):
  banco : 1 linha, 1 recorrência
  QR do 3o clique == QR da avulsa de 114,95   (comparação byte a byte: igual)
  cupom : currentUsages parou em 1
```

### 5. `installmentCount` validado e descartado — CORRIGIDO (saiu do DTO)

O campo era obrigatório em `SignatureWithNewCreditCardDto` e
`SignatureWithExistingCreditCardDto`, tinha `@Min(1)`, e o service o
desestruturava sem nunca usar. **Escolhi remover em vez de fazer valer**:
assinatura no Asaas é recorrência (`MONTHLY`/`YEARLY`), não venda parcelada —
não existe campo de parcelas em `POST /subscriptions`. Fazer o campo "valer"
exigiria transformar a assinatura em cobrança parcelada, que é outro produto.

Removido do DTO, do controller, das interfaces e da assinatura dos dois métodos.
Compatibilidade dos dois lados, testada:

```
POST /signature/credit/new COM    installmentCount:1 (payload do front hoje) -> 201
POST /signature/credit/new SEM    installmentCount                            -> 201
```

O `ValidationPipe` do projeto não usa `whitelist`, então quem ainda manda o
campo não recebe erro — ele apenas é ignorado, como sempre foi. Antes, **omitir**
o campo dava 400.

---

## Divergência residual declarada (R$ 0,01)

`calculate-upgrade` e `processUpgrade*` calculam a proporção do tempo com
precisão de milissegundo. Entre a tela e o clique passam segundos, e a proporção
anda:

```
simulação (PIX, empresa f) : creditApplied 111.24  finalPrice 348.66
cobrança  (segundos depois): creditApplied 111.23  finalPrice 348.67
```

Um centavo, sempre nessa ordem de grandeza, causado pelo tempo passando — não
por preço diferente. Não arredondei para o dia inteiro de propósito: isso
devolveria o mesmo tipo de erro que o item 1 (dar ou tirar um dia inteiro de
crédito). Se o produto quiser valor travado, o caminho é a simulação devolver um
token com o valor congelado por N minutos — decisão de produto, não de bug.

## Verificação principal pedida: upgrade no meio do ciclo

Empresa `N3 Credito f`, Plano Demo mensal no PIX, 15 dias corridos do ciclo:

```
o que o cliente pagou pelo período : R$ 229,90   (pixPrice, mensal)
tamanho real do período            : 31 dias
dias restantes                     : 15
proporção não usada                : 0.4839      (<= 1)
crédito                            : R$ 111,23   (<= 229,90)
plano novo, PIX, mensal            : R$ 459,90
avulsa gerada agora                : R$ 348,67
                                     111,23 + 348,67 = 459,90
```

No Asaas:

```
RECORRENCIA NOVA sub_9aa5mocoplx00cn8  value 459.90  MONTHLY ACTIVE
  cobranças: pay_g8qx4atw91afkcv3  459.90  PENDING  due 2026-09-03   <- preço CHEIO
AVULSA           pay_jladwmd5qtagc4qo  value 348.67  PENDING PIX  due hoje
                                       subscription: (nenhuma)
RECORRENCIA ANTIGA sub_v0rfbbrkapfi5c9w  229.90 ACTIVE deleted=false <- viva até pagar
banco: Plano Demo ACTIVE (acesso preservado) | QA-F2-Pro INACTIVE
```

A recorrência nova **não gera cobrança hoje** — o ciclo corrente foi quitado
pela avulsa. O crédito não passa do valor pago em nenhum dos cenários testados.

## Negativos (nada foi afrouxado)

| Teste | Resultado |
|---|---|
| `calculate-upgrade` de empresa sem assinatura ACTIVE | 403 `NOT_ALLOWED` |
| `calculate-upgrade` para plano MENOR (downgrade disfarçado) | 403 `NOT_ALLOWED` |
| `paymentType=BOLETO` (valor fora do domínio) | 400 em português, sem cair para PIX em silêncio |
| Cupom de 100% | 400 em português, sem criar recorrência nem consumir uso |
| Upgrade da empresa `a` | não tocou nenhuma linha de `b`..`h` |
| 2 cliques em `POST /signature/pix` sem cupom (empresa e) | 1 linha, 1 recorrência (idempotência de M1 preservada) |
| 3 cliques em `POST /signature/pix` com cupom (empresa c) | 1 linha, 1 recorrência, 1 uso de cupom |

Estado final das 8 empresas de teste conferido linha a linha: cada uma com suas
próprias assinaturas, nenhuma operação atravessou empresa.

## Pendências

1. **BLOQUEANTE, no handler do webhook (`signatureValidation`) — não é meu
   arquivo.** Duas coisas, no mesmo bloco `if (!wasAlreadyActive)`:
   - **Nota fiscal com cupom sai pelo valor cheio.** O bloco recalcula
     `chargedValue` a partir do preço do plano. Com cupom, o que foi cobrado é
     menor. Precisa usar o valor real da cobrança do provedor (`paymentId` do
     evento), não o preço de tabela.
   - **Consumo do cupom (item 4b).** O caminho pronto: gravar `couponId` na
     assinatura (coluna nova em `CompanySignature`) no momento do checkout,
     trocar o `coupon.incrementUsage()` de `pix()`/`newCreditCard()`/
     `existingCreditCard()` por um consumo aqui, na primeira confirmação, e
     limpar o `couponId` depois de consumir para a reentrega do webhook não
     contar duas vezes. As duas pontas têm que ir juntas: mover só uma delas
     deixa o cupom sem limite ou sem uso.
2. **`adminCreate` (painel) continua com o cupom vitalício.** Está em
   `adminSignature.service.ts`, método privado `openRecurrence`. **Não corrigi
   porque o arquivo estava sendo editado por outra frente enquanto eu
   trabalhava** — o editor acusou modificação em disco no meio da minha
   alteração e eu a desfiz para não atropelar ninguém. O defeito é só no ramo
   MENSAL: `value: applyCoupon(plan.pixPrice)` vai para a recorrência. O ramo
   ANUAL já está certo por acidente (é `createUndefinedPayment`, cobrança única).
   A correção é a mesma daqui: `createSubscription` com `plan.pixPrice` cheio e
   `nextDueDate` em +1 mês, mais um `createUndefinedPayment` de hoje com o valor
   descontado, cancelando a recorrência se a cobrança falhar, e recusa em
   português quando o desconto derruba a cobrança abaixo de R$ 5,00.
3. **Front (`equinology-web-v2`).** `app/(dashboard)/subscription/page.tsx`
   monta a query sem `paymentType`, então a tela de upgrade continua mostrando o
   preço do PIX mesmo para quem escolheu cartão. Um parâmetro a mais resolve; a
   API já responde certo nos dois casos.
   `app/(auth)/checkout/[id]/page.tsx` ainda envia `installmentCount: 1` — não
   quebra nada, mas pode sair.
4. **`GET /signature/calculate-upgrade` não considera cupom.** Nunca considerou.
   Hoje isso é coerente: cupom não se aplica a upgrade em lugar nenhum do
   código. Se o produto quiser cupom no upgrade, é feature, não correção.
5. **Checkout PIX com cupom não guarda qual cupom foi usado.** Se a empresa gerar
   o QR sem cupom e depois com cupom (ou o contrário), a reutilização devolve o
   QR do primeiro. Resolve junto com o item 1 (coluna `couponId`).

## Dados de teste deixados no sandbox

Empresas `N3 Credito a` a `N3 Credito h` (`n3-{a..h}@teste.com`, senha
`Senha@12345`). Cupons `N3TESTE50` (50%, 3 usos) e `N3TESTE100` (100%, sem
limite) na tabela `coupons`. Sandbox, sem dinheiro real, e não há cliente
pagante — não montei processo de regularização, conforme a orientação.

**Aviso operacional:** o sandbox do Asaas bloqueou o IP duas vezes por excesso de
requisições durante os testes (`"Seu acesso foi temporariamente bloqueado por
exceder o limite de requisições"`), o que aparece na API como
`PAYMENT_ERROR - "Não foi possível criar a assinatura no provedor de pagamento"`.
Não é bug do código; é limite do sandbox com várias frentes batendo em paralelo.
Espere alguns minutos e repita.
