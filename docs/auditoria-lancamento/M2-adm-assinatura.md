# M2 — Rotas de assinatura do painel ADM

Frente: rotas operadas pela equipe interna (`/admin/signature/*`,
`/admin/financial/*`) e a tela Financeiro do ADM.

Ambiente da verificação: API local em `http://localhost:3333`, Asaas em
**sandbox**, banco `vetequus-local`. Cliente de teste no gateway:
`cus_000008556141` (empresa "M2 Clinica Um", criada por `POST /user/register`)
e `cus_000008556307` (empresa "M2 Empresa Painel", criada por
`POST /admin/companies`). Planos de teste M2-Basico (R$100) e M2-Pro (R$200).

Todos os itens abaixo foram **reproduzidos antes** de qualquer alteração.

---

## Resumo

| # | Item | Status |
|---|------|--------|
| 1 | change-plan cancela e não cria outra | CORRIGIDO |
| 2 | reactivate / renew-yearly multiplicam o faturamento | CORRIGIDO |
| 3 | Coluna "Pago em" mostra o vencimento | CORRIGIDO (parte da API depende de M3) |
| 4 | "Receita do mês" soma vencimentos de assinaturas ativas | CORRIGIDO (mesma dependência de M3) |
| 5 | Financeiro nunca mostra mais de 10 transações | CORRIGIDO |
| 6 | Empresa criada pelo painel não assina / charge 404 | CORRIGIDO |
| extra | PATCH/change-plan devolviam a entidade crua (`_id`/`props`) | CORRIGIDO |
| extra | `GET /admin/signature` devolvia 500 para query inválida | CORRIGIDO |

---

## 1. change-plan cancelava a recorrência e não criava outra

**Reprodução (código antigo).** Assinatura mensal M2-Basico, ACTIVE,
`sub_6vb30om8x96ldpn3` (R$100) no gateway.

```
POST /admin/signature/change-plan/1daa6a91-... {"planId":"<M2-Pro>","yearly":false} -> 201
banco : status=ACTIVE, asaasSubscriptionId=NULL, isAutoRenewActivated=f, plano=M2-Pro
asaas : sub_6vb30om8x96ldpn3 -> deleted=true. Assinaturas ATIVAS do cliente: 0
```

Empresa com acesso liberado e nenhuma cobrança recorrente. Confirmado.

**Correção.** `changePlan` agora abre a recorrência do plano novo **antes** de
cancelar a antiga (`swapRecurrence`), grava `asaasSubscriptionId`, `paymentId` e
`isAutoRenewActivated`, e recusa troca para o mesmo plano/ciclo.

**Verificação (código novo).**

```
antes            : ASAAS ativas 1 — sub_ck4ut39k21qavjmh R$100 (M2-Basico)
change-plan ->201: {"signature":{"id":"e619d5e0-...","signaturePlanId":"<M2-Pro>",...}}
banco            : asaasSubscriptionId=sub_0wrw7j6pspcrw98p, isAutoRenewActivated=t
depois           : ASAAS ativas 1 — sub_0wrw7j6pspcrw98p R$200 (M2-Pro)
repetir a troca  : 400 "A assinatura já está neste plano e neste ciclo de cobrança."
                   ASAAS ativas continua 1
```

**Banco x Asaas.** Banco: uma linha apontando para `sub_0wrw7...`. Asaas: uma
recorrência ativa, com esse mesmo id, no valor do plano novo. Divergência
possível: se o cancelamento da antiga falhar depois da nova ter sido criada, a
nova é cancelada em compensação e a rota devolve erro — o cliente fica com a
recorrência antiga, o banco não muda de plano, e nunca com duas. Coberto pelo
teste `se o cancelamento da antiga falhar, desfaz a nova em vez de deixar duas`.

## 2. reactivate e renew-yearly multiplicavam o faturamento

**Reprodução (código antigo).**

```
reactivate #1 -> 201 nova linha 3408cad9 / sub_dwo8dkawf6fdwjmj
reactivate #2 -> 201 nova linha 63c63a5d / sub_ie2jmm35lu3kr4it
renew-yearly  -> 201 nova linha 56e90dea / pay_ix8cnwv2iru3rn0q (R$2160)
banco : 4 linhas para a mesma empresa; a "reativada" ficou INACTIVE
asaas : 2 assinaturas ATIVAS de R$200 simultâneas + 1 cobrança anual de R$2160
```

Confirmado: dois cliques = duas mensalidades recorrentes contra o mesmo cliente.

**Correção.**
- `reactivate` opera na **mesma linha**: recusa se já estiver ACTIVE, recusa se
  a empresa tiver outra assinatura vigente (ACTIVE/TRIAL), troca a recorrência
  via `swapRecurrence` e devolve o acesso (`status=ACTIVE`, expiração +1 ciclo).
- `renewYearly` opera na mesma linha, recusa se já existir cobrança em aberto
  no gateway (`PENDING`/`OVERDUE`/`AWAITING_RISK_ANALYSIS`), emite a cobrança
  anual e cancela a recorrência mensal.

**Verificação (código novo).**

```
reactivate numa assinatura ACTIVE -> 400 "Esta assinatura já está ativa..."
cancel                            -> banco INACTIVE, ASAAS ativas 0
reactivate #1 -> 201  banco: status=ACTIVE, sub_22p0fieepdswibkq, expiração 03/09
reactivate #2 -> 400 "Esta assinatura já está ativa..."
reactivate #3 -> 400 idem
banco : 1 linha.  asaas : 1 assinatura ativa (R$200)

renew-yearly #1 -> 201 invoiceUrl .../i/cfcnrdbkoxy6dqd1
renew-yearly #2 -> 400 "Já existe uma cobrança em aberto para esta assinatura
                        (pay_cfcnrdbkoxy6dqd1)..."
renew-yearly #3 -> 400 idem
banco : 1 linha, yearly=t, paymentId=pay_cfcnrdbkoxy6dqd1, asaasSubscriptionId=NULL
asaas : 0 recorrências mensais, 1 cobrança anual em aberto
```

Guarda de empresa (outra assinatura vigente):

```
POST /admin/signature/reactivate/9cf5f4bb-... (empresa com TRIAL vigente)
-> 400 "Esta empresa já possui outra assinatura vigente. Cancele a assinatura
   vigente antes de reativar esta."  Banco inalterado (TRIAL + INACTIVE).
```

**Banco x Asaas.** Reativação: banco ACTIVE apontando para a única recorrência
viva; Asaas com exatamente uma. Renovação anual: banco com `paymentId` da nova
cobrança — que é a chave que o webhook usa para achar a assinatura — e Asaas com
uma única cobrança em aberto.

**Decisão explícita a revisar com o dono:** `reactivate` marca `ACTIVE` e
estende a expiração **antes** de o pagamento confirmar. É ação manual de equipe
interna atrás do `AdminAuthGuard` (o mesmo operador já podia fazer
`PATCH {status:'ACTIVE'}`), e o relatório apontava justamente que a rota
"reativar" não reativava. Se a política for "só ativa com dinheiro na conta",
basta remover as duas linhas de `status`/`expirationDate` em `reactivate` — a
cobrança já é gerada e o webhook ativa sozinho.

## 3. Coluna "Pago em" mostrava o vencimento

**Reprodução.** `adminFinancial.service.ts` fazia
`paymentDate = status PAID|RECEIVED ? dueDate : null`. A data confirmada pelo
gateway nunca era lida.

**Correção.**
- `AdminSignatureService.history` passou a devolver `paymentDate` com a data
  real do provedor (`paymentDate ?? clientPaymentDate ?? confirmedDate`), e
  `null` quando nenhuma delas vier.
- `adminFinancial` nunca mais preenche `paymentDate` com `dueDate`. Sem data
  real, o campo vai vazio e o ADM já renderiza `—`.
- O ramo de cobrança avulsa do `history` também passou a devolver `dueDate` de
  verdade (era `''` fixo, o que fazia PIX anual sumir do financeiro).

**Verificação.**

```
GET /admin/signature/<id>/history
-> {"payments":[{"id":"pay_ix8cnwv2iru3rn0q","value":2160,"dueDate":"",
                 "status":"CONFIRMED","paymentDate":null}]}
GET /admin/financial/transactions?companyId=...
-> pay_ix8cnwv2iru3rn0q CONFIRMED 2160 due= paymentDate=undefined
```

Antes esse mesmo pagamento apareceria com "Pago em" = vencimento.

**PENDÊNCIA QUE NÃO É MINHA (M3).** A data real existe no gateway — conferido
direto no sandbox:

```
GET /payments/pay_ix8cnwv2iru3rn0q
{ status:'CONFIRMED', dueDate:'2026-08-03', paymentDate:null,
  confirmedDate:'2026-08-03', clientPaymentDate:'2026-08-03' }
```

Quem descarta é o mapper de `src/infra/shared/bank/asaas.ts` (arquivo da frente
M3), em `getSubscriptionPayments` (linha ~367) e em `getPaymentInfo`, que só
copiam `id/value/dueDate/status`. Já deixei os campos declarados como opcionais
nos contratos compartilhados (`shared/payment/subscription.ts` e
`shared/payment/undefinedPayment.ts`) — **M3 só precisa acrescentar ao mapper**:

```ts
// getSubscriptionPayments
paymentDate: payment.paymentDate,
clientPaymentDate: payment.clientPaymentDate,
confirmedDate: payment.confirmedDate,
// getPaymentInfo (além do que já devolve)
dueDate, paymentDate, clientPaymentDate, confirmedDate
```

Enquanto isso não entrar, a coluna mostra `—` para tudo e a receita fica em
zero — que é o comportamento pedido ("melhor vazio que errado"). Que a cadeia
funciona assim que o campo chegar está provado no teste
`history usa a data real do provedor e nunca o vencimento`
(`adminSignature.service.spec.ts`), que injeta um gateway devolvendo
`confirmedDate: '2026-08-09'` e recebe `paymentDate: '2026-08-09'` com
`dueDate: '2026-07-20'` intacto.

## 4. "Receita do mês" somava vencimentos de assinaturas hoje ativas

**Reprodução.** `getPaymentsForPeriod` iterava só `fetchActiveWithPlans()`,
filtrava por `dueDate`, ignorava pagamento sem `dueDate` (PIX anual) e só
aceitava status `PAID`/`RECEIVED` — `CONFIRMED`, que é o estado do cartão
aprovado no sandbox, ficava de fora.

**Correção.** O cálculo agora:
- percorre assinaturas de **todos os status** (quem pagou e cancelou continua
  contando);
- conta `PAID`, `RECEIVED`, `CONFIRMED` e `RECEIVED_IN_CASH`;
- separa por **data de liquidação**, não por vencimento;
- deixa de fora o que estiver liquidado sem data e devolve a contagem em
  `settledWithoutDate`, exibida como aviso no card — em vez de chutar o mês.

**Verificação.**

```
GET /admin/financial/summary
{"revenueMonth":0,"revenuePreviousMonth":0,"activeSubscriptions":10,
 "trialSubscriptions":16,"settledWithoutDate":6}
```

Os 6 são os pagamentos liquidados do banco de testes cuja data o mapper de M3
ainda não entrega. A regra em si está coberta por 7 testes em
`adminFinancial.service.spec.ts`, entre eles:
- vencimento em julho + pagamento em agosto → receita de **agosto**;
- pagamento de assinatura já `INACTIVE` → **conta**;
- `CONFIRMED` conta, `PENDING` não;
- liquidado sem data → fora da receita e somado em `settledWithoutDate`.

**Banco x Asaas.** Este número não é gravado em lugar nenhum: é lido do gateway
a cada chamada. Não há como divergir do Asaas — o risco aqui é o inverso, de
performance (uma chamada por assinatura, o N+1 já apontado no relatório
original, que segue de pé).

## 5. O financeiro nunca mostrava mais de 10 transações

**Reprodução.** A tela chamava `GET /admin/financial/transactions` sem nenhum
parâmetro; o service usava `pageSize = 10` como padrão e a `Pagination` do ADM
paginava só essas 10 no navegador.

```
GET /admin/financial/transactions  ->  total 31, pageSize 10, itens 10
```

**Correção.**
- API: padrão de `pageSize` de 10 para 20, `@Max(200)` no DTO, e o recorte de
  período agora usa a data de pagamento quando existe (só cai para vencimento
  em cobrança não paga). Cobrança sem nenhuma data é excluída quando há filtro
  de período, em vez de furar o filtro como antes.
- ADM (`src/app/(private)/financial/page.tsx`): paginação **no servidor**,
  filtros de período (de/até), status e itens por página (20/50/100), botão
  "Limpar filtros", e a busca textual agora se anuncia como refino da página
  atual (a API não tem busca por texto).

**Verificação.**

```
?page=1&pageSize=3 -> total 33, 3 itens [pay_q1afrw03..., pay_9y92o4o0..., pay_nbdqneui...]
?page=2&pageSize=3 -> 3 itens diferentes [pay_ars2pp6u..., pay_r91sz3et..., pay_sby0bwpm...]
?pageSize=99999    -> 400 "A quantidade de itens por página deve ser no máximo 200"
?startDate=xx      -> 400 "Informe uma data inicial válida"
```

Paginação de servidor também coberta em teste (25 pagamentos → página 1 com 20,
página 2 com 5, `total` 25).

## 6. Empresa criada pelo painel não conseguia assinar / charge devolvia 404

**Reprodução.** `AdminCompanyCreateService` grava `paymentId = 'admin-<uuid>'`,
que não existe no gateway. `charge` devolvia `ResourceNotFoundError` nesse caso
("Registro não encontrado", para um cadastro que está na tela), e `adminCreate`
mandava para o Asaas telefone `11999999999` e CNPJ `00000000000000` fixos,
produzindo erros sobre campos que o painel nem mostra.

```
empresa 6d23e3aa (paymentId admin-39b666dc-...), assinatura trial 099f26dd
POST /admin/signature/charge/099f26dd-... -> 404 "Registro não encontrado."
```

**Correção.** Um único `resolveAsaasCustomerId(company)` usado por
`adminCreate`, `charge`, `changePlan`, `reactivate` e `renewYearly`: cria o
cliente no gateway quando o `paymentId` é `admin-*` ou está vazio, e **checa
antes** o que falta, com mensagem em português dizendo o que fazer. Os
fallbacks inventados (`11999999999`, `00000000000000`) foram removidos.

**Verificação.**

```
empresa do painel com ZERO usuários, assinatura paga:
-> 400 "A empresa não possui nenhum usuário cadastrado. Cadastre o responsável
        (com e-mail e celular) antes de gerar a cobrança."

empresa do painel COM usuário responsável:
POST /admin/signature/charge/099f26dd-... -> 201 {"invoiceUrl":".../i/da4l22m8s6r46dmj"}
banco: companies.paymentId  admin-39b666dc-...  ->  cus_000008556307
       law_firm_signatures.paymentId  trial_admin_...  ->  pay_da4l22m8s6r46dmj
POST /admin/signature/create/<mesma empresa>/<plano> -> 201 (antes 400 sobre celular)
```

**Banco x Asaas.** O cliente é criado no gateway e o `paymentId` só é salvo no
banco depois do retorno com sucesso. Se a gravação falhasse, sobraria um cliente
órfão no Asaas (sem cobrança) e a próxima chamada criaria outro — desperdício de
cadastro, nunca cobrança perdida ou duplicada.

## Extras corrigidos (mesmos arquivos, defeitos do relatório)

- `PATCH /admin/signature/:id` e `change-plan` devolviam a entidade crua
  (`_id`, `props`, `_attachments`), deixando `signature.id` undefined no front e
  expondo `asaasSubscriptionId`/`creditCardId`/`invoiceId`. Agora as cinco rotas
  usam o mesmo contrato. Verificado: `{"signature":{"id":"e619d5e0-...", ...}}`.
- `GET /admin/signature` estourava 500 para qualquer query param inválido.
  Ganhou DTO. Verificado:

```
?status=BANANA  -> 400 "Status inválido. Use ACTIVE, INACTIVE ou TRIAL."
?page=abc       -> 400 "Informe um número de página válido"
?page=-1        -> 400 "A página deve ser no mínimo 1"
?companyId=abc  -> 400 "Informe um identificador de empresa válido"
```

## Lado negativo (nada foi afrouxado)

Com token de usuário de clínica (não admin) e sem token:

```
GET  /admin/signature                    -> 401
GET  /admin/financial/transactions       -> 401
GET  /admin/financial/summary            -> 401
POST /admin/signature/reactivate/<id>    -> 401
POST /admin/signature/renew-yearly/<id>  -> 401
POST /admin/signature/charge/<id>        -> 401
POST /admin/signature/change-plan/<id>   -> 401
sem token, /admin/financial/summary      -> 401
banco após a bateria: assinatura e619d5e0 intacta (ACTIVE, mesmo plano)
```

Nenhuma guarda foi removida ou relaxada; as guardas novas são todas
restritivas.

## Arquivos alterados

API (`vetequus-api`):
- `src/domain/application/services/admin/services/adminSignature.service.ts`
- `src/domain/application/services/admin/services/adminFinancial.service.ts`
- `src/domain/application/services/admin/services/adminSignature.service.spec.ts` (novo)
- `src/domain/application/services/admin/services/adminFinancial.service.spec.ts` (novo)
- `src/infra/http/controllers/admin/adminSignature.controller.ts`
- `src/infra/http/controllers/admin/dto/adminSignature.dto.ts`
- `src/infra/http/controllers/admin/dto/adminFinancial.dto.ts`
- `src/infra/http/presenters/adminFinancial.presenter.ts`
- `src/domain/application/shared/payment/subscription.ts` (campos opcionais)
- `src/domain/application/shared/payment/undefinedPayment.ts` (campos opcionais)

ADM (`equinology-adm-v2`):
- `src/app/(private)/financial/page.tsx`
- `src/app/(private)/page.tsx` (texto do card)
- `src/lib/financial-api.ts`
- `src/types/admin.ts`

`npx tsc --noEmit` sai 0 nos dois repos. `npx vitest run`: 21 testes passam,
13 deles novos. As 6 falhas de "No test suite found" são pré-existentes —
arquivos de spec inteiramente comentados (tag, file, bankAccount, payment,
transaction, transactionCategory), sem relação com esta frente.

## Pendências / repasses

1. **M3 (asaas.ts)** — mapear `paymentDate`, `clientPaymentDate`, `confirmedDate`
   (e `dueDate` no `getPaymentInfo`). Sem isso, "Pago em" fica `—` e a receita
   do mês fica R$0 para sempre. É o item mais importante desta lista.
2. **N+1 no financeiro** — `summary` e `transactions` fazem uma chamada ao
   gateway por assinatura. Com a base crescendo, o dashboard vai estourar
   timeout. Precisa de cache ou de persistir os pagamentos localmente.
3. **`reactivate` concede acesso antes do pagamento** — decisão descrita no
   item 2; confirmar com o dono.
4. **Não mexido, fora do escopo:** `POST /admin/companies` continua aceitando
   CNPJ inválido/duplicado e nome de 5000 caracteres, e
   `AdminCompanyUpdateService` continua descartando phone/logoUrl/pixKey/
   signatureUrl em silêncio (o phone é justamente o que trava a assinatura).
   `POST/PUT /admin/plans` continua aceitando preço negativo e
   `yearlyDiscount` de 500%.
5. **Cupom no painel** — `adminCreate` aplica o desconto do cupom no `value` da
   recorrência, ou seja, vira desconto vitalício (mesmo defeito já relatado no
   fluxo da clínica, frente M1). Não corrigi para não conflitar com M1.

## Dados de teste

Removidos ao final: assinaturas das empresas de teste, planos `M2-*`, o admin
`m2agent@teste.com` e as recorrências do sandbox
(`sub_22p0fieepdswibkq`, `sub_7sb9sxkvc4nebc86`, `sub_dwo8dkawf6fdwjmj`,
`sub_ie2jmm35lu3kr4it`). Conferido: `0` assinaturas ativas no gateway para
`cus_000008556141` e `cus_000008556307`. As empresas e usuários de teste
continuam no banco (inertes, sem assinatura).
