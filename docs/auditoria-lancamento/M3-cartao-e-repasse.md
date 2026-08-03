# M3 — Cartão: salvar e repassar

Frente M3 da auditoria de dinheiro. Arquivos tocados: `asaas.ts` (API), o
caminho de Wallet ID do cadastro da clínica e o componente de Wallet ID do web.
Nada de `companySignature.service.ts` (M1), `adminSignature` (M2) ou
`transaction`/`invoice` (M4).

Ambiente: Asaas SANDBOX (`https://sandbox.asaas.com/api/v3`), API em
`localhost:3333`, banco `vetequus-local`.

## Resumo

| # | Item | Status |
|---|---|---|
| 1 | Cartão nunca é salvo | PARCIAL — app do proprietário funciona ponta a ponta; assinatura da clínica continua quebrada (é M1) |
| 2 | Pagamento com cartão salvo não repassa nada | CORRIGIDO |
| 3 | Leitura insegura do erro do Asaas vira 500 | CORRIGIDO |
| 4 | Clínica não tem como obter o walletId | CORRIGIDO no mínimo pedido (validação no gateway + texto na tela). Criação de subconta no onboarding NÃO foi feita — ver "O que ficou de fora" |

`npx tsc --noEmit` = 0 erros nos dois repositórios tocados
(`vetequus-api` e `equinology-web-v2`).

---

## Item 2 — cartão salvo saía sem split (o pior dos quatro)

**Causa.** `existsCreditCartPayment` (`src/infra/shared/bank/asaas.ts`) não
desestruturava `split` e os dois payloads (`fullPaymentData` e
`installMentPaymentData`) iam sem a chave. `newCreditCartPayment` e `pixPayment`
enviavam. Os dois chamadores reais (`transaction.service.ts` e
`invoice.service.ts`) sempre montam `split: [{percentualValue: 100, walletId:
company.walletId}]` — o dado chegava e era descartado na borda.

**Correção.** `split` desestruturado e incluído nos dois payloads.

### Payload que sai hoje para `POST /payments`

Capturado interceptando a chamada real do método (servidor local no lugar do
gateway):

```
--- existsCreditCartPayment, 1x ---
POST /payments
{
  "billingType": "CREDIT_CARD",
  "value": 80.25,
  "creditCardToken": "1587a166-ae3a-44ec-b13b-7063a7095668",
  "customer": "cus_000008556173",
  "dueDate": "2026-08-03T00:00:00.000Z",
  "totalValue": 80.25,
  "split": [ { "percentualValue": 100, "walletId": "c47ccf5e-a3e8-41e0-a04c-94d3626fff6d" } ]
}

--- existsCreditCartPayment, 3x (parcelado) ---
POST /payments
{
  "billingType": "CREDIT_CARD",
  "creditCardToken": "1587a166-ae3a-44ec-b13b-7063a7095668",
  "customer": "cus_000008556173",
  "installmentCount": 3,
  "dueDate": "2026-08-03T00:00:00.000Z",
  "totalValue": 240.75,
  "split": [ { "percentualValue": 100, "walletId": "c47ccf5e-a3e8-41e0-a04c-94d3626fff6d" } ]
}
```

### Confirmação no gateway (não no nosso log)

Pagamento real de fatura feito pelo app com **cartão salvo**
(`pay_x0qusphdlqgz3ehf`, fatura `M3-1785765288133-2`, R$ 80,25):

```
GET /payments/pay_x0qusphdlqgz3ehf -> split:
[{"id":"6eba2690-5cc8-48cb-9c3e-4e3901e21d0b",
  "walletId":"c47ccf5e-a3e8-41e0-a04c-94d3626fff6d",
  "percentualValue":100,"totalValue":77.37,"status":"AWAITING_CREDIT"}]
```

Controle, pagamento com **cartão novo** (`pay_m7h68px4g0vmwcq2`, R$ 120,50) —
o caminho que já estava certo:

```
split: [{"walletId":"c47ccf5e-...","percentualValue":100,"totalValue":116.41,"status":"AWAITING_CREDIT"}]
```

### Contraprova do comportamento antigo

Enviando ao sandbox exatamente o payload que o código produzia antes (mesmo
token de cartão, mesmo cliente, **sem** `split`):

```
POST /payments {"billingType":"CREDIT_CARD","value":80.25,"totalValue":80.25,
                "creditCardToken":"1587a166-...","customer":"cus_000008556173","dueDate":"2026-08-03"}
-> {"id":"pay_8xojojki74nsfbeh","status":"CONFIRMED","value":80.25,"netValue":77.37}  (split ausente)
```

Ou seja: cobrança aprovada, `netValue` inteiro retido na conta da plataforma e
zero para a clínica — enquanto a fatura ficaria PAID. Essa cobrança de
demonstração foi estornada em seguida (`status: REFUNDED`).

---

## Item 1 — cartão salvo

Duas metades independentes. **Só uma era do meu escopo e ela está fechada.**

### App do proprietário (fatura/movimentação) — funciona ponta a ponta

A persistência já existia (`invoice.service.ts` e `transaction.service.ts`
gravam `CreditCard.create({... clientId})` quando o gateway devolve o token) e a
leitura foi consertada numa leva anterior (o controller comparava
`tokenType === 'company'`, valor que o sistema nunca emite). Rodei o ciclo
completo pedido:

```
8.  POST /invoice/<inv1>/pay/credit/new   (token do Dono A, cartão novo)  -> 201
9.  GET /credit-card                      (token do Dono A) -> 200
    {"data":[{"id":"8f416395-f23c-40b5-aae3-665a9d7d60bc",
              "creditCardNumber":"8829","creditCardBrand":"MASTERCARD",
              "creditCardToken":"1587a166-ae3a-44ec-b13b-7063a7095668"}]}
12. POST /invoice/<inv2>/pay/credit/existing {creditCardId:"8f416395-..."} -> 201
13. GET /invoice/<inv2> -> status PAID; banco: bankPaymentId = pay_x0qusphdlqgz3ehf
```

Lado negativo (acesso continua barrado):

```
10. GET /credit-card com o token do Dono B                        -> 200 {"data":[]}
11. POST /invoice/<inv2>/pay/credit/existing com o cartão do A,
    usando o token do Dono B                                      -> 404 RESOURCE_NOT_FOUND
```

### Assinatura da clínica — CONTINUA QUEBRADO (é do M1)

Não toquei porque o defeito está em `companySignature.service.ts`:
`newCreditCard` cria a assinatura com `creditCardId: null` (linha 387) e
descarta `payment.value.creditCard`; `processUpgradeWithCreditCard` faz o mesmo
(linha 882). Nada em toda a base cria `CreditCard` com `companyId` — só com
`clientId`:

```
grep -rn "CreditCard.create" src -> transaction.service.ts:436, invoice.service.ts:517 (ambos clientId)
SQL: select count(*) filter (where "companyId" is not null),
            count(*) filter (where "clientId" is not null), count(*) from credit_cards
     -> 0 | 6 | 6
```

Estado ao vivo, com token de clínica:

```
GET /credit-card                     -> 200 {"data":[]}
POST /signature/credit/existing      -> 404 RESOURCE_NOT_FOUND
```

**Para o M1:** basta espelhar o que `invoice.service.ts:517` já faz — quando
`newCreditCartPayment` voltar com `payment.value.creditCard`, gravar
`CreditCard.create({..., companyId})` e usar esse id em vez de
`creditCardId: null`. A guarda de posse já existe do outro lado
(`companySignature.service.ts:227`, `creditCard.companyId !== companyId`).

---

## Item 3 — erro do Asaas virava 500

**Causa.** `data.errors[0].description` em 7 pontos, com cliente
`new Axios(...)` que não rejeita resposta 4xx. Corpo HTML de proxy, JSON sem
`errors` ou 204 sem corpo estouravam `TypeError` e viravam 500 genérico.

**Correção.** Helper `describeError(data, fallback)` — lê `errors[0].description`
quando existe, cai para `message` e, por fim, para uma frase em português que
diz o que fazer. Aplicado nos 7 pontos e também nos métodos que usavam apenas
`?.` com mensagem técnica ("Erro ao criar assinatura"). `validateStatus: () => true`
foi explicitado no construtor para o comportamento não depender da versão do axios.

Prova (cliente Asaas apontado para servidores que devolvem lixo):

```
ANTES (data.errors[0].description sobre HTML): TypeError: Cannot read properties of undefined (reading '0')

===== 502 + HTML de proxy =====
createPaymentId          -> LEFT PaymentError | Não foi possível criar o cadastro de pagamento. Confira nome, CPF/CNPJ, telefone e CEP e tente novamente.
pixPayment               -> LEFT PaymentError | Não foi possível gerar a cobrança PIX. Tente novamente em alguns instantes.
newCreditCartPayment     -> LEFT PaymentError | Não foi possível processar o pagamento no cartão. ...
existsCreditCartPayment  -> LEFT PaymentError | Não foi possível processar o pagamento no cartão salvo. ...
cancelInvoice            -> LEFT PaymentError | Não foi possível cancelar a nota fiscal no provedor. ...
refound                  -> LEFT PaymentError | Não foi possível estornar o pagamento no provedor. ...

===== 401 JSON sem a chave errors =====
... todos LEFT PaymentError | <fallback> Detalhe do provedor: Unauthorized

===== 204 sem corpo =====
... todos LEFT PaymentError | <fallback>
```

`PaymentError` é mapeado para **400** no `ErrorHandler`, então nenhum desses
casos vira 500.

Prova ao vivo, com erro real do gateway (fatura de R$ 1,00 paga no cartão
salvo, abaixo do mínimo do Asaas):

```
POST /invoice/<M3-ERRO-2>/pay/credit/existing
-> HTTP 400 {"message":"O valor mínimo para cobranças via Cartão de Crédito é R$ 5,00.","code":"PAYMENT_ERROR"}
SQL: select number,status,"bankPaymentId" from invoices where number='M3-ERRO-2'
     -> M3-ERRO-2 | PENDING | (vazio)     <- banco não mexeu, nada divergiu
```

---

## Item 4 — Wallet ID

**Mínimo pedido, entregue:** validação server-side contra o gateway antes de
gravar + texto na tela ensinando onde obter o código.

### API

Nova porta `WalletValidation`
(`src/domain/application/shared/payment/walletValidation.ts`), implementada por
`Asaas.validateWalletId(walletId, customerId)` e registrada no `BankModule`.
Chamada em `CompanyService.edit` (`PUT /company`) antes de gravar.

Ordem da checagem:

1. formato UUID (mensagem já ensina onde copiar);
2. `GET /accounts?walletId=` — resolve subcontas sem nenhum efeito colateral;
3. cobrança de teste `UNDEFINED` de R$ 5,00 (mínimo aceito pelo Asaas nesse
   tipo) com split de 100% para a carteira, **removida em seguida** — é o único
   jeito de validar a carteira de uma conta Asaas independente.

`PUT /company {"walletId": null}` agora limpa o campo (antes o `??` impedia:
`walletId ?? company.walletId` ignorava `null`).

Ao vivo:

```
PUT /company {"walletId":"wlt_teste"}
-> 400 "Wallet ID inválido: o formato esperado é 00000000-0000-0000-0000-000000000000.
        Copie o Wallet ID no painel do Asaas em Minha Conta > Integrações > Wallet ID."

PUT /company {"walletId":"00000000-0000-4000-8000-000000000000"}
-> 400 "Wallet ID não encontrado no Asaas. Copie o Wallet ID no painel do Asaas em
        Minha Conta > Integrações > Wallet ID. (retorno do provedor: Wallet [000...] inexistente.)"

PUT /company {"walletId":"c47ccf5e-a3e8-41e0-a04c-94d3626fff6d"}   -> 200, gravado
PUT /company {"walletId":null}                                     -> 200, campo limpo
```

Branch 3 (cobrança de teste) exercitado com o gateway simulado, mostrando que a
cobrança é criada e **apagada**, e que empresa sem cadastro Asaas é recusada com
mensagem em vez de gravar lixo:

```
GET /accounts?walletId=c47ccf5e-...&limit=1
POST /payments {"billingType":"UNDEFINED","customer":"cus_1","value":5,...,
                "split":[{"walletId":"c47ccf5e-...","percentualValue":100}]}
DELETE /payments/pay_probe_1
resultado: RIGHT (aceito)

customerId "admin-123" -> LEFT "Não foi possível validar o Wallet ID porque esta empresa
   ainda não tem cadastro de pagamento no Asaas. Conclua o cadastro da empresa
   (CNPJ, telefone e endereço) e tente de novo."   (nenhuma cobrança criada)
```

### Web

`app/(dashboard)/clinic/_components/WalletCard.tsx`: título passou a dizer o que
o campo é ("Wallet ID (conta que recebe)"), aviso explícito de que sem ele o
botão de pagar não aparece no app do proprietário, passo a passo de onde copiar
(Asaas > Minha Conta > Integrações) e link para a página de integrações. O erro
da API já sobe como toast, então a mensagem do gateway chega à tela.

---

## Estado do BANCO x estado do ASAAS (exigência da frente)

| Momento | Asaas | Banco | Divergem? |
|---|---|---|---|
| Pagamento com cartão salvo aceito | cobrança CONFIRMED **com split 100% para a clínica** | fatura/parcela PAID + `bankPaymentId` gravado | Não |
| Pagamento com cartão salvo recusado | nada criado (4xx) | fatura PENDING, sem `bankPaymentId` (comprovado no M3-ERRO-2) | Não |
| Gateway devolve HTML/401/204 | nada criado | nada alterado, API responde 400 | Não |
| Validação de Wallet ID aceita via `/accounts` | nenhuma escrita | `walletId` gravado | Não |
| Validação de Wallet ID via cobrança de teste | cobrança criada e apagada no mesmo fluxo | `walletId` gravado | Não |
| Validação de Wallet ID recusada | nada persistido | `walletId` **não** é gravado | Não |

Risco residual que **não** é meu e continua de pé: em `invoice.service.ts` e
`transaction.service.ts` a cobrança é criada no gateway e só depois o registro é
salvo no banco. Se o processo cair entre as duas coisas, o Asaas fica com
pagamento confirmado e o banco com fatura PENDING — pagamento no gateway sem
registro local. Não há transação nem reconciliação por webhook para
fatura/parcela (o `bankPaymentId` agora existe, então dá para reconciliar).
Isso é do M4.

Resíduo teórico da validação de Wallet ID: se o processo morrer entre criar e
apagar a cobrança de teste, sobra uma cobrança PENDING de R$ 5,00 "Validação de
Wallet ID" no cliente Asaas **da própria clínica** — que é criado com
`notificationDisabled: true`, então não dispara e-mail nem cobrança ao
proprietário. Nunca é paga e pode ser removida no painel.

---

## O que ficou de fora / pendências

1. **Cartão salvo da assinatura da clínica (M1).** `newCreditCard` e
   `processUpgradeWithCreditCard` continuam descartando o token do cartão e
   gravando `creditCardId: null`. `POST /signature/credit/existing` segue 404 e
   a tela de cartões da clínica segue vazia.
2. **Criação de subconta no onboarding (o "ideal" do item 4).** Não fiz. Criar
   subconta Asaas (`POST /accounts`) exige um bloco de dados que hoje não é
   coletado nem validado em lugar nenhum (razão social, CPF/CNPJ conferido,
   data de nascimento/`companyType`, renda/faturamento, endereço completo,
   e-mail e telefone próprios da clínica) e transforma a plataforma em
   responsável pelo cadastro da conta de terceiro no gateway — inclusive com
   documentação e aprovação. Metade desses campos hoje é opcional ou não
   validada (`PUT /company` grava CNPJ lixo, telefone da empresa nem existe no
   painel admin). Entregar isso agora seria fluxo de onboarding novo em cima de
   cadastro que não sustenta, sem tempo de teste com dinheiro real. O mínimo
   entregue já impede o pior: gravar carteira inexistente e descobrir na hora
   do pagamento.
3. **Wallet ID pelas rotas admin.** `AdminCompanyUpdateService` e
   `AdminCompanyCreateService` gravam `walletId` só com `trim()`, sem passar
   pela validação. Não mexi para não colidir com quem está no módulo admin — é
   uma linha em cada service chamando a mesma porta `WalletValidation`. A base
   ainda tem `walletId='wlt_teste'` gravado por esse caminho (company
   `7f5174fb-...`).
4. **Sandbox aceita número de cartão inválido.** `POST /invoice/<id>/pay/credit/new`
   com `number: "1111111111111111"` voltou 201 e o Asaas sandbox confirmou o
   pagamento (`pay_ztq19sy5cg64wle5`). É comportamento do sandbox, não do nosso
   código — mas significa que teste de cartão recusado não pode ser feito por
   número inválido aqui; usei valor abaixo do mínimo.
5. **`createInvoice` (nota fiscal) segue sem checar status** — devolve
   `connect.data.id` direto. Não estoura (acesso a propriedade de string vira
   `undefined`), mas grava `undefined` como id de nota em caso de erro. É o
   único método de `asaas.ts` que não segue o padrão `Either`; mudar a
   assinatura mexe no chamador, que é do M4.

## Dados de teste deixados no banco (sandbox)

Empresa `5afe11df-3c95-4e2e-835f-e6ea0031f0ec` ("Clinica M3 1785765288133"),
clientes `0f0fa6ac-...` (Dono A) e `fe2b6509-...` (Dono B), faturas
`M3-1785765288133-1/2`, `M3-ERRO-1/2`. Servem de evidência; podem ser apagados.
