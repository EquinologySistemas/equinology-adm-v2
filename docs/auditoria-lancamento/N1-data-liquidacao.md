# N1 — Data de liquidação e a receita do ADM que mostrava zero

Frente N1. Arquivos: `src/infra/shared/bank/asaas.ts` (mappers), módulo
`admin/financial` da API e as telas do ADM (Financeiro, Início, Assinaturas).
Nada de `companySignature.service.ts`, `invoice.service.ts` ou
`transaction.service.ts`.

Ambiente: Asaas **sandbox**, API em `localhost:3333`, banco `vetequus-local`.
Admin de teste `n1agent@teste.com`. Empresa de teste
`N1 Clinica 1785770473` (`1101f499-…`, cliente `cus_000008557304`).

## Resumo

| # | Item | Status |
|---|---|---|
| 1 | Mapear a data de liquidação nos dois mappers de `asaas.ts` | CORRIGIDO |
| 2 | Propagar até `PaymentHistoryItem` e a coluna "Pago em" | CORRIGIDO (a ordem de precedência estava errada e foi trocada) |
| 3 | "Receita do mês" por data de liquidação real | CORRIGIDO — de R$ 0 para R$ 4.494,56, batendo item a item com o Asaas |
| 4 | Sem data do provedor, exibir "—" e nunca o vencimento | JÁ ESTAVA OK na API; front corrigido (bug de fuso mostrava o dia anterior) |
| extra | Faturamento encolhia em silêncio quando o gateway falhava | CORRIGIDO (`signaturesNotRead` + aviso na tela) |
| extra | N+1 do `/admin/financial/*` | PARCIAL — 4,3–5,5 s → 0,7–0,9 s com lotes; a solução definitiva exige persistir pagamento (relatada) |

`npx tsc --noEmit` = 0 nos dois repositórios. Nada foi comitado.

---

## 1. Qual campo é "o dinheiro entrou" — decisão medida, não escolhida no chute

O Asaas devolve três datas e elas **não** são sinônimos. Li 600 cobranças do
sandbox (`GET /payments?limit=100&offset=0..500`), das quais 122 liquidadas:

```
paymentDate != clientPaymentDate ......... 17 cobranças
liquidadas sem paymentDate ................ 96 (CONFIRMED/CREDIT_CARD)
liquidadas sem clientPaymentDate ........... 0
clientPaymentDate != confirmedDate ......... 0
pago com paymentDate mas sem clientPaymentDate . 0
```

Exemplos reais que decidem a questão:

```
pay_z445x28v1sk55mu0 CREDIT_CARD RECEIVED  due 2026-05-26
   clientPaymentDate 2026-05-26 | confirmedDate 2026-05-26 | paymentDate 2026-07-09
pay_q1lypfabcbk5tget CREDIT_CARD RECEIVED  due 2026-06-29
   clientPaymentDate 2026-04-29 | confirmedDate 2026-04-29 | paymentDate 2026-08-03
pay_ffdnnfr9md41hu6k CREDIT_CARD CONFIRMED due 2026-08-03
   clientPaymentDate 2026-08-03 | confirmedDate 2026-08-03 | paymentDate null
   creditDate 2026-09-04
```

Leitura:

- **`clientPaymentDate` = o dia em que o CLIENTE pagou.** Estava preenchida em
  122/122 das cobranças liquidadas. É o fato gerador da receita e é o que o
  operador quer ver em "Pago em". **Escolhida como primeira opção.**
- **`confirmedDate` = o dia em que o Asaas confirmou.** Igual à anterior em
  todas as amostras; fica como reserva porque em boleto pode chegar um dia
  depois.
- **`paymentDate` no cartão é a data do REPASSE (D+30), não do pagamento.**
  Venda de 26/05 com `paymentDate` 09/07; venda de 29/04 com `paymentDate`
  03/08. E vem `null` enquanto a cobrança está apenas CONFIRMED (92 das 122) —
  que é justamente o estado do cartão aprovado. Usá-la primeiro jogaria a venda
  de maio na receita de julho e deixaria o cartão aprovado sem data nenhuma.
  **Fica por último**, útil só em `RECEIVED_IN_CASH` (baixa manual), onde ela é
  a data informada pelo operador.
- **`creditDate` foi ignorada de propósito**: é o dia em que o dinheiro cai na
  conta Asaas (D+30 no cartão). É data de repasse, não de venda; usá-la deixaria
  o painel de vendas sempre um mês atrasado.

Ordem final: `clientPaymentDate || confirmedDate || paymentDate || null`.

Isso significa que a implementação parcial que estava no `history`
(`paymentDate || clientPaymentDate || confirmedDate`) estava com a precedência
**invertida** — ela funcionaria por acaso hoje (paymentDate quase sempre null)
e erraria o mês assim que o cartão fosse repassado. Corrigida em
`adminSignature.service.ts` (`settlementDateOf`), com o raciocínio no código.

## 2. Os mappers (o defeito de fato)

**Reprodução (código antigo).** `getSubscriptionPayments` (asaas.ts ~linha 367)
copiava só `id/value/dueDate/status`; `getPaymentInfo` só
`invoiceUrl/status/value` — sem nem o `dueDate`. Consequência medida antes da
correção:

```
GET /admin/financial/summary
{"revenueMonth":0,"revenuePreviousMonth":0,"activeSubscriptions":10,
 "trialSubscriptions":16,"settledWithoutDate":6}
```

Seis pagamentos liquidados no gateway, R$ 0 de receita na tela.

**Correção.** Os dois mappers passaram a devolver `paymentDate`,
`clientPaymentDate` e `confirmedDate` (e `dueDate` no `getPaymentInfo`), sempre
com `?? null` — cobrança em aberto não ganha data inventada.

**Verificação imediata (mesma base, nada mais mudou):**

```
GET /admin/financial/summary
{"revenueMonth":1511.84,...,"settledWithoutDate":0}
```

## 3. Ciclo completo no sandbox

Empresa criada por `POST /user/register`, assinatura paga criada pelo painel:

```
POST /admin/signature/create/1101f499-…/33231be6-…  -> 201
banco : f279a64c-… | INACTIVE | paymentId sub_pending | sub_c6x5wn1t7ig0wsgf | PIX
GET  /admin/signature/f279a64c-…/history
  -> {"id":"pay_4mthjmfm5ylur1n1","dueDate":"2026-08-03","status":"PENDING","paymentDate":null}
```

Para provar que o recorte é por liquidação e não por vencimento, o vencimento
foi empurrado para setembro **antes** do pagamento e a cobrança foi liquidada
hoje:

```
PUT  /payments/pay_4mthjmfm5ylur1n1 {"dueDate":"2026-09-20"} -> PENDING, due 2026-09-20
POST /payments/pay_4mthjmfm5ylur1n1/receiveInCash {"paymentDate":"2026-08-03"}
  -> RECEIVED_IN_CASH, due 2026-09-20, clientPaymentDate 2026-08-03

GET /admin/signature/f279a64c-…/history
  -> dueDate 2026-09-20 | status RECEIVED_IN_CASH | paymentDate 2026-08-03
GET /admin/financial/transactions?companyId=1101f499-…
  -> dueDate "2026-09-20", paymentDate "2026-08-03"
GET /admin/financial/summary
  -> revenueMonth 1511.84 -> 1741.74   (+229,90 em AGOSTO, com vencimento em SETEMBRO)
```

Com o código antigo esse pagamento entraria na receita de setembro e apareceria
como "Pago em 20/09".

Ramo de cobrança avulsa (`getPaymentInfo`), que é o do PIX/boleto anual:

```
POST /admin/signature/renew-yearly/f279a64c-…  -> pay_uzr824i7vpysoa93 (R$ 2.482,92)
history antes de pagar : dueDate "2026-08-03", status PENDING, paymentDate null
POST /payments/pay_uzr824i7vpysoa93/receiveInCash {"paymentDate":"2026-08-03"}
history depois         : dueDate "2026-08-03", RECEIVED_IN_CASH, paymentDate "2026-08-03"
```

O `dueDate` desse ramo vinha `""` antes (era o que fazia PIX anual sumir do
financeiro) porque o mapper não o devolvia.

## 4. Conferência item a item contra o Asaas

Nove pagamentos liquidados na base, painel × gateway:

```
painel                                    asaas
pay_y2xhh8uql6ici1ig 03/08 249,90         clientPaymentDate 2026-08-03  paymentDate null
pay_gk78y6zeg89fw9mp 03/08 249,90         clientPaymentDate 2026-08-03  paymentDate null
pay_uzr824i7vpysoa93 03/08 2.482,92       clientPaymentDate 2026-08-03  paymentDate 2026-08-03
pay_4kxi1w7783tgc3mt 03/08 249,90         clientPaymentDate 2026-08-03  paymentDate null
pay_ut5v6j745li5an7y 03/08 249,90         clientPaymentDate 2026-08-03  paymentDate null
pay_8uoptsddxbmugs7h 03/08 249,90         clientPaymentDate 2026-08-03  paymentDate null
pay_di0vpwtvuarc57ts 02/08 249,90         clientPaymentDate 2026-08-02  paymentDate null
pay_swg2bmw68s4hcsc3 02/08 262,34         clientPaymentDate 2026-08-02  paymentDate null
pay_ld16lypeabrhra4n 02/08 249,90         clientPaymentDate 2026-08-02  paymentDate null
```

Soma = 4.494,56 = `revenueMonth` devolvido pela API no mesmo instante. Nenhuma
divergência de data e nenhuma de valor.

## 5. "Melhor vazio que errado" — e o bug de fuso que a tela tinha

A API já não preenche `paymentDate` com o vencimento (isso veio do M2 e foi
conferido: cobranças PENDING vêm com `paymentDate` ausente). O **front**, porém,
formatava com `new Date("2026-08-03").toLocaleDateString("pt-BR")`, que
interpreta a data pura como meia-noite UTC e, em UTC-3, imprime o dia anterior:

```
"2026-08-03" -> antes 02/08/2026 | depois 03/08/2026
"2026-01-01" -> antes 31/12/2025 | depois 01/01/2026   (mês e ano errados)
null/""      -> "—" nos dois casos
```

Criado `src/lib/date.ts` (`formatDate`), que trata `YYYY-MM-DD` como data local
e só usa `new Date` para ISO com hora. Aplicado em "Data de vencimento",
"Pago em", no modal de detalhe da transação e no histórico do modal de
assinatura (que só mostrava o vencimento e agora mostra
`Venc. 20/09/2026 · Pago em 03/08/2026`).

Também alinhei o badge de status: `CONFIRMED` e `RECEIVED_IN_CASH` são contados
como liquidados pela API mas apareciam em cinza (e o modal mostrava o código
cru do provedor).

## 6. Extra que apareceu no teste: a receita encolhia em silêncio

Durante a medição de desempenho o Asaas bloqueou por excesso de requisições
(`403 "Seu acesso foi temporariamente bloqueado por exceder o limite de
requisições"`). Resultado no painel, sem nenhum aviso:

```
com 34 assinaturas bloqueadas : revenueMonth 2.482,92
minutos depois, sem bloqueio  : revenueMonth 3.994,76
```

O `collectPayments` fazia `if (historyResult.isLeft()) continue;` — falha do
gateway virava faturamento menor com cara de faturamento certo. É o pior tipo
de erro numa tela de dinheiro: o número não parece quebrado.

Agora o resumo devolve `signaturesNotRead` e a tela mostra, em vermelho,
"Total incompleto: N assinatura(s) não puderam ser consultadas no provedor de
pagamento agora." Ao vivo:

```
t+10s {"revenueMonth":2482.92,…,"signaturesNotRead":34}
t+20s {"revenueMonth":3994.76,…,"signaturesNotRead":0}
```

## 7. N+1 — o que dá para fazer sem atravessar outro módulo

`summary` e `transactions` continuam fazendo uma chamada ao gateway por
assinatura. O que fiz foi paralelizar em lotes (`CONCURRENCY = 4`), medido com
33 assinaturas:

```
em série (CONCURRENCY=1) : 4,52s  4,70s  5,50s  4,33s  4,70s
em lotes                 : 1,01s  0,85s  0,90s  0,71s  0,72s
```

O lote é pequeno **de propósito**: o Asaas bloqueia por excesso de requisições e
cada assinatura bloqueada some do faturamento (item 6). Aumentar a concorrência
troca lentidão por número errado.

Isso não resolve o N+1, só adia. Com 500 empresas são 500 chamadas por
carregamento de tela e o bloqueio do provedor passa a ser rotina. A solução é
guardar os pagamentos localmente (o webhook/reconciliação do M4 já grava
`bankPaymentId`) e ler do banco, deixando o gateway para conferência. Isso
atravessa o módulo de conciliação e não foi feito aqui.

## Estado do BANCO × estado do ASAAS

| Momento | Asaas | Banco | Divergem? |
|---|---|---|---|
| Consulta do financeiro | fonte da verdade das datas e valores | **nada é gravado** — `summary`/`transactions` são leitura pura | Não. O painel não tem estado próprio para divergir |
| Pagamento liquidado com data | `clientPaymentDate` preenchida | nada é gravado; a tela mostra a data do gateway | Não |
| Pagamento liquidado sem nenhuma data | improvável (0 em 122 amostras) | fora da receita, contado em `settledWithoutDate` | Não — o painel avisa que o total exclui esses |
| Gateway indisponível / 403 | pagamentos existem | painel não os soma | **Sim, temporariamente** — é exatamente o que `signaturesNotRead` denuncia na tela. Nada é persistido errado; basta recarregar |
| Cartão CONFIRMED (ainda não repassado) | `creditDate` no futuro (D+30) | conta como receita do mês da venda | Diferença **intencional**: receita de venda, não de repasse. Quem quiser caixa precisa de outro relatório (não existe) |

O risco de divergência real neste módulo é nulo porque ele não escreve nada. O
risco que sobra é de **exibição**: um número menor por falha do provedor — hoje
sinalizado.

## Lado negativo (nada foi afrouxado)

```
sem token            /admin/financial/summary        -> 401
sem token            /admin/financial/transactions   -> 401
token de CLÍNICA     /admin/financial/summary        -> 401
token de CLÍNICA     /admin/financial/transactions   -> 401
token de CLÍNICA     /admin/signature/<id>/history   -> 401
```

Nenhuma guarda tocada; nenhuma rota nova.

## Testes

```
npx vitest run src/domain/application/services/admin
 ✓ adminSignature.service.spec.ts (7 tests)
 ✓ adminFinancial.service.spec.ts (9 tests)
```

Novos nesta frente:

- `history ignora o paymentDate do cartão (data de repasse) e usa o dia em que o
  cliente pagou` — injeta o caso real (pago 26/05, repassado 09/07) e exige
  26/05;
- `conta as assinaturas que o provedor não respondeu em vez de encolher a
  receita em silêncio` — gateway devolvendo `left` para uma das assinaturas:
  receita da outra intacta e `signaturesNotRead = 1`;
- `sem falha do provedor, o painel não acusa total incompleto`.

`src/infra/shared/bank/asaas.spec.ts` (novo, 3 testes) trava os mappers: as três
datas atravessam, o vencimento não vira data de pagamento e cobrança em aberto
não ganha data. **Atenção:** o `vitest.config.ts` tem `root: './src/domain'`,
então specs em `src/infra` **não entram no `npm test`**. Rodei com config
temporária (`root: ./src/infra/shared/bank`), 3/3 passando. Ajustar o runner
(incluir `src/infra` sem arrastar os `*.e2e-spec.ts`) fica como pendência — não
mexi para não quebrar a suíte de outras frentes rodando agora.

## Arquivos alterados

API (`vetequus-api`):
- `src/infra/shared/bank/asaas.ts` — mappers `getSubscriptionPayments` e `getPaymentInfo`
- `src/infra/shared/bank/asaas.spec.ts` (novo)
- `src/domain/application/services/admin/services/adminSignature.service.ts` — ordem de `settlementDateOf`
- `src/domain/application/services/admin/services/adminSignature.service.spec.ts`
- `src/domain/application/services/admin/services/adminFinancial.service.ts` — lotes + `signaturesNotRead`
- `src/domain/application/services/admin/services/adminFinancial.service.spec.ts`
- `src/infra/http/presenters/adminFinancial.presenter.ts`
- `src/infra/http/controllers/admin/dto/adminFinancial.dto.ts`

ADM (`equinology-adm-v2`):
- `src/lib/date.ts` (novo)
- `src/lib/financial-api.ts`, `src/types/admin.ts`
- `src/app/(private)/financial/page.tsx`
- `src/app/(private)/financial/_components/TransactionDetailModal.tsx`
- `src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx`
- `src/app/(private)/page.tsx`

## Pendências

1. **N+1 de verdade**: persistir os pagamentos (via webhook/reconciliação do M4)
   e ler do banco. Sem isso, o dashboard bate no limite de requisições do Asaas
   conforme a base cresce — e, quando bater, mostra "total incompleto".
2. **Runner de testes não cobre `src/infra`** (`root: './src/domain'`). O spec
   dos mappers existe mas não roda em `npm test`.
3. **Não há relatório de caixa** (dinheiro efetivamente repassado). "Recebido no
   mês" é receita de venda; para conciliar com o extrato Asaas seria preciso um
   corte por `creditDate`. Decisão do dono.
4. **`/admin/financial/transactions` não informa falha do provedor** — o aviso
   de total incompleto vive só no resumo. Na mesma tela isso basta; consumidor
   que chame só a listagem não sabe que faltou linha.
5. A tela do ADM está apontada para `NEXT_PUBLIC_API_URL=http://localhost:3335`
   (fora do ar); a API local roda em 3333. Verificação feita por HTTP direto na
   API, não pelo navegador.

## Dados de teste

Empresa `N1 Clinica 1785770473` (`1101f499-…`), usuário `n1-1785770473@teste.com`,
assinatura `f279a64c-…` e cobranças `pay_4mthjmfm5ylur1n1` (R$ 229,90) e
`pay_uzr824i7vpysoa93` (R$ 2.482,92), ambas liquidadas em dinheiro no sandbox.
Nenhuma recorrência ativa sobrou no gateway para `cus_000008557304` (conferido:
0). Admin de teste `n1agent@teste.com` continua na tabela `admin_users`.
