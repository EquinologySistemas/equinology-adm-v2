# Bloco 4 — Persona CLÍNICA: o dinheiro dela (conta bancária, split/repasse, faturas, movimentações, conciliação, KPIs)

Auditoria de código, sem execução. Nenhum arquivo de produção foi alterado.
Repos lidos: `vetequus-api`, `equinology-web-v2`, `equinology-app-v2`.

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado linha a linha (arquivo aberto e lido inteiro)
- `vetequus-api/src/infra/shared/bank/asaas.ts` — **os 12 métodos**, comparados entre si quanto ao envio de `split`.
- `vetequus-api/src/domain/application/shared/payment/creditCardPayment.ts` (contrato de split).
- `vetequus-api/src/domain/application/services/finance/services/transaction.service.ts` (integral).
- `vetequus-api/src/domain/application/services/invoice/invoice.service.ts` (integral).
- `vetequus-api/src/domain/application/services/finance/services/payment.service.ts` (create/edit/fetch).
- `vetequus-api/src/domain/application/services/account/services/Company.service.ts` (gravação do walletId).
- `vetequus-api/src/infra/http/controllers/invoice/invoice.controller.ts` (integral).
- `vetequus-api/src/infra/http/controllers/invoice/dto/invoice.dto.ts` (Create/Edit).
- `vetequus-api/src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts` (fetch/count/filtros de data).
- `vetequus-api/src/infra/shared/database/prisma/repositories/prismaInvoice.repository.ts` (summary/where/overdue).
- `vetequus-api/…/signature/service/companySignature.service.ts` → `signatureValidation` (o **único** handler de webhook do sistema).
- `equinology-web-v2/app/(dashboard)/clinic/_components/WalletCard.tsx` (integral).
- `equinology-web-v2/lib/invoice-share.ts` + `app/fatura/[token]/page.tsx` (link público).
- `equinology-web-v2/app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx` (geração do link, chave PIX).
- `equinology-web-v2/app/(dashboard)/financial/page.tsx`, `_utils/useFinancialData.ts`, `_utils/financialSummary.ts`.
- `equinology-web-v2/app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx` (submit), `PayTransactionSheet.tsx` (submit), `UpdatePaymentSheet.tsx` (campos + submit).
- `equinology-web-v2/lib/invoice-items.ts`, `lib/format.ts`.
- Buscas exaustivas de `walletId`, `split`, `bankPaymentId`, `webhook`, `@Cron` em toda a API.

### NÃO verificado (declaro explicitamente)
- **Não executei nada.** Nenhuma chamada real ao Asaas, nenhum banco consultado. Tudo abaixo é leitura de código.
- **Não conferi o painel Asaas** (conta sandbox/produção, se os splits já liquidados existem, se o webhook está configurado). Itens que dependem disso estão marcados.
- **`equinology-app-v2/components/sheets/InvoicePaymentSheet.tsx`**: li só os pontos de chamada HTTP (linhas 316-322, 422-424, 519-521) e a condição de cartão salvo (`:732`). **Não auditei a UX de pagamento do app inteira** — isso é bloco de outra persona.
- **ADM (financeiro da Equinology)** — fora deste bloco, que é o dinheiro da clínica.
- `BankAccountSheet` / `TransactionCategorySheet` — abri só o suficiente para confirmar que `currentBalance` é derivado (`PrismaBankAccountDetailsMapper.ts:20`), não auditei os formulários.
- Telas de financeiro dentro do Atendimento (`ServicePayments.tsx`) — não abertas.
- Estatísticas de transação (`getTransactionStatistics`) — vi a assinatura, não rastreei o SQL do `getStatistics`.

---

## Veredito

**QUEBRADO** para a promessa central do bloco: *"a clínica cobra os clientes dela e o dinheiro cai na conta dela"*.

Há **dois furos independentes**, cada um suficiente para o dono perder dinheiro ou a clínica perder confiança no produto:

1. **Cartão salvo não repassa nada** — 2 dos 6 caminhos de dinheiro entregam 100% do valor à conta da plataforma. (B4-01)
2. **PIX de fatura/movimentação nunca é conciliado** — o cliente paga, o dinheiro cai na conta da clínica, e o sistema segue mostrando "Pendente" para sempre. Ninguém marca como pago: não há webhook, não há job, não há nada. (B4-02, B4-03)

Some-se a isso que **não existe nenhum onboarding para a clínica obter o `walletId`** (B4-04): ela precisa abrir conta no Asaas por fora e colar um UUID num campo livre, sem validação contra o gateway.

---

## Mapa dos caminhos de dinheiro (PAGADOR → GATEWAY → CONTA DE DESTINO)

Os 6 pontos do código que movem dinheiro **do cliente final para a clínica**:

| # | Origem | Método Asaas | Envia split? | Conta de destino |
|---|---|---|---|---|
| 1 | `transaction.service.ts:273` PIX de movimentação | `pixPayment` | **SIM** (`:277-282`) | Carteira da clínica (`company.walletId`) |
| 2 | `transaction.service.ts:416` cartão NOVO | `newCreditCartPayment` | **SIM** (`:425-430`) | Carteira da clínica |
| 3 | `transaction.service.ts:357` **cartão SALVO** | `existsCreditCartPayment` | **enviado pelo service, DESCARTADO pelo Asaas client** | **CONTA DA PLATAFORMA** |
| 4 | `invoice.service.ts:397` PIX de fatura | `pixPayment` | **SIM** (`:401`) | Carteira da clínica |
| 5 | `invoice.service.ts:502` cartão NOVO | `newCreditCartPayment` | **SIM** (`:511`) | Carteira da clínica |
| 6 | `invoice.service.ts:446` **cartão SALVO** | `existsCreditCartPayment` | **enviado pelo service, DESCARTADO** | **CONTA DA PLATAFORMA** |

E o caminho **da clínica para a Equinology** (assinatura), para contraste — corretamente sem split:
`companySignature.service.ts:128, 247, 353, 862, 980` e `adminSignature.service.ts:184` → todos `split: []`. Aqui o dinheiro fica na plataforma **por projeto**, e está certo.

---

## Achados

### B4-01 · BLOQUEIA_LANCAMENTO — Pagamento com cartão SALVO liquida 100% na conta da plataforma, e o sistema diz à clínica que ela recebeu

**Novo?** Não — já constava como **D2** na auditoria anterior. **Reverifiquei no código atual: continua exatamente igual, não foi corrigido.**

**Evidência** — `vetequus-api/src/infra/shared/bank/asaas.ts:157-179`:

```ts
async existsCreditCartPayment(
  data: ExistsCreditCartPaymentProps
): Promise<ExistsCreditCardPaymentResponseInterface> {
  const { billingType, value, creditCardToken, customer, installmentCount, dueDate, totalValue } =
    data;                                   // <-- `split` NÃO é desestruturado

  const fullPaymentData = {
    billingType, value, creditCardToken, customer, dueDate, totalValue,
  };                                        // <-- `split` NÃO está no corpo

  const installMentPaymentData = {
    billingType, creditCardToken, customer, installmentCount, dueDate, totalValue,
  };                                        // <-- idem
```

Compare com o irmão `newCreditCartPayment` (`asaas.ts:106-141`), que desestrutura `split` (`:118`) e o inclui nos dois corpos (`:129`, `:140`), e com `pixPayment` (`:195, 201`).

Não é campo morto:
- o contrato **exige**: `creditCardPayment.ts:38-42` declara `split` como obrigatório em `ExistsCreditCartPaymentProps`;
- os dois chamadores reais **passam** repasse de 100%: `transaction.service.ts:365-370` e `invoice.service.ts:454`.

O TypeScript não pega porque o objeto extra é simplesmente ignorado dentro do método.

**O que a clínica vive na prática:**
1. O proprietário paga uma consulta de R$ 500 pelo app usando o cartão que **já estava salvo**.
2. O Asaas cobra os R$ 500 e credita **integralmente na conta da Equinology**.
3. `transaction.service.ts:376-377` (e `invoice.service.ts:460-461`) marcam `status = 'PAID'` e `paymentDate = new Date()`.
4. O financeiro da clínica exibe **"Recebido R$ 500,00"**. Ela dá baixa, considera quitado, e **nunca vai ver esse dinheiro**.

**Impacto financeiro por transação: 100% do valor cobrado.** Numa cobrança de R$ 500, R$ 500 (menos a taxa do gateway) ficam retidos na plataforma; R$ 0 chegam à clínica.

**Agravante de frequência:** o primeiro pagamento com cartão de cada cliente passa por `newCreditCard`, que **salva o token** (`transaction.service.ts:435-443`, `invoice.service.ts:516-523`). E o app, quando existe cartão salvo, **só oferece o cartão salvo** (`equinology-app-v2/components/sheets/InvoicePaymentSheet.tsx:732` — o bloco "Adicionar cartão e pagar" fica exclusivamente no `else`). Ou seja: **do 2º pagamento com cartão em diante, 100% dos clientes caem no caminho quebrado.**

**Correção:** desestruturar `split` em `asaas.ts:160` e incluí-lo nos dois objetos (`:163-179`). Uma linha e meia. Mas antes do lançamento é preciso **apurar no painel Asaas** quais cobranças `CREDIT_CARD` já foram liquidadas sem split e regularizar o repasse — é dinheiro de terceiros retido.

---

### B4-02 · BLOQUEIA_LANCAMENTO — Ninguém marca fatura/movimentação como paga no PIX: não há webhook, job nem processo

**Novo?** Parcialmente. A auditoria anterior mencionou o "buraco de cobertura" do webhook em uma linha dentro do D5. **Aqui está rastreado de ponta a ponta e é pior do que aparentava.**

**Rastreamento completo, respondendo "quem marca como pago":**

- **Existe um único endpoint de webhook em toda a API:** `POST /signature/webhook` (`companySignature.controller.ts:114-118`). Busca por `webhook` em `src/` não retorna nenhum outro controller.
- Esse handler chama `companySignature.service.ts → signatureValidation`. Li o método inteiro (`:414-518`): ele só consulta `companySignatureRepository.findBySubscriptionId` e `findByPaymentId`. **Não existe nenhuma consulta a `Invoice` nem a `Transaction`.**
- Busca por `bankPaymentId` em toda a API retorna **apenas escritas** (`transaction.service.ts:303, 375, 446`; `invoice.service.ts:406, 459, 526`) e os getters/setters da entidade. **Não existe nenhum `findByBankPaymentId`** em repositório algum — logo, mesmo que um evento do Asaas chegasse, não haveria como achar a fatura correspondente.
- Busca por `@Cron` retorna só dois schedulers, ambos de assinatura/usuário inativo (`expireTrialSignatures.scheduler.ts`, `inactiveUsers.scheduler.ts`). **Nenhum job de conciliação.**

**Resposta direta à pergunta do escopo:** quem marca uma fatura como paga é **exclusivamente uma pessoa clicando no botão "Receber"** na web (`InvoicesTable.tsx:301` → `PUT /invoice/:id { paidAt }`), ou o próprio fluxo de **cartão** (`invoice.service.ts:460-461, 527-528`). **O PIX não tem nenhum caminho automático.**

**O que a clínica vive na prática:**
1. Ela emite a fatura. O proprietário abre o app e paga por PIX.
2. `invoice.service.ts:397-407` gera o QR com split correto, grava `bankPaymentId` e **retorna**. `invoice.status` continua `PENDING`.
3. O dinheiro **cai de verdade** na carteira da clínica no Asaas.
4. No sistema, a fatura fica **"Pendente"** e, passado o vencimento, migra para a aba **"Vencidas"** (`prismaInvoice.repository.ts` — `overdue` = `status:'PENDING' AND dueDate < cutoff`).
5. A clínica cobra o cliente de novo. O cliente mostra o comprovante. **A clínica perde a confiança no financeiro do produto no primeiro mês.**

Idêntico para movimentação: `transaction.service.ts:206-316` (`pix()`) nunca toca `transaction.status`.

**Isto não se resolve configurando o webhook no painel do Asaas.** O handler existente responde `right(null)` silenciosamente para qualquer pagamento que não seja de assinatura (`companySignature.service.ts:440-442`). É preciso **escrever** o tratamento de fatura/movimentação e o `findByBankPaymentId`.

---

### B4-03 · BLOQUEIA_LANCAMENTO — O `bankPaymentId` do PIX de movimentação nem chega a ser gravado (save antes da atribuição)

**Novo? SIM.** Nenhuma auditoria anterior pegou isto.

**Evidência** — `vetequus-api/src/domain/application/services/finance/services/transaction.service.ts:300-303`:

```ts
if (payment.isLeft()) return left(new PaymentError(payment.value.message));

await this.transactionRepository.save(transaction);      // <-- salva PRIMEIRO
transaction.bankPaymentId = payment.value.paymentId;     // <-- atribui DEPOIS, em memória
```

As duas linhas estão invertidas. O `save` persiste a entidade **antes** de receber o id do Asaas; a atribuição seguinte morre no fim do escopo da função. Compare com o caminho correto do cartão, no mesmo arquivo (`:375-379` e `:446-450`): atribui, **depois** salva. E com `invoice.service.ts:406-407`, que faz na ordem certa.

**Consequência:** a coluna `bankPaymentId` da movimentação paga por PIX fica **sempre NULL**. Mesmo que o B4-02 seja corrigido e o webhook passe a existir, **não haverá como amarrar o evento do Asaas de volta à parcela** — a chave de conciliação nunca foi salva. É o pré-requisito silencioso do B4-02.

**Correção:** trocar a ordem das duas linhas.

---

### B4-04 · BLOQUEIA_LANCAMENTO — A clínica não tem como obter o `walletId`, e o sistema aceita qualquer UUID

**Novo? SIM** (o walletId não foi auditado nos documentos anteriores).

**a) Onde é cadastrado:** um único campo de texto livre na tela Clínica — `equinology-web-v2/app/(dashboard)/clinic/_components/WalletCard.tsx:112-118`, rotulado apenas *"Wallet ID — Identificador da carteira de pagamentos"*. **Sem nenhuma instrução de onde tirar esse valor, sem link, sem ajuda.**

**b) Como é validado:** só formato. `WalletCard.tsx:19` e `:45`:
```ts
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (trimmedValue && !UUID_REGEX.test(trimmedValue)) { toast.error(...); return; }
```
No backend, `EditCompanyDto.walletId` (`company.dto.ts:39-43`) tem apenas `@IsOptional() @IsString()`. **Nenhuma chamada ao Asaas para verificar se a carteira existe ou pertence à clínica.**

**c) De onde deveria vir:** li os 12 métodos de `asaas.ts`. **Não existe nenhuma criação de subconta/wallet** — `createPaymentId` (`:76-104`) cria um `/customers`, que é *pagador*, não *recebedor*. Ou seja: **o produto não cria a conta de recebimento da clínica em lugar nenhum.** A clínica precisa abrir conta no Asaas por fora, achar o Wallet ID no painel e colar. Sem isso, ela não recebe nada.

**d) O que acontece com walletId vazio:** o sistema degrada de forma explícita — `invoice.service.ts:384-389` e `transaction.service.ts:247-254` devolvem *"A empresa ainda não possui PIX configurado"*, e o app esconde o botão de pagar (`clientInvoice.presenter.ts:24` → `payable = !!company?.walletId`). Isso está **correto**. O problema não é a ausência tratada — é que **não há caminho guiado para preencher**.

**e) O que acontece com walletId errado:** um UUID com formato válido mas de outra conta passa direto. O split do Asaas mandaria o dinheiro para a carteira daquele terceiro. **Não há como o sistema detectar.**

**Impacto na persona:** no dia do lançamento, a clínica assina, cadastra clientes, emite fatura — e descobre que o botão de pagar não aparece, sem nenhuma mensagem que a ensine a resolver.

---

### B4-05 · GRAVE — Editar o valor ou o número de parcelas de uma movimentação não altera as parcelas; a tela passa a mostrar dois números diferentes

**Novo? SIM.**

**Evidência** — `vetequus-api/src/domain/application/services/finance/services/payment.service.ts:191-203`:
```ts
if (amount !== undefined) paymentExists.amount = amount;
...
if (quantity !== undefined) paymentExists.quantity = quantity;
...
await this.paymentRepository.save(paymentExists);   // fim do método
```
`grep -n "transactionRepository" payment.service.ts` retorna **apenas** a injeção (`:28`) e o `createMany` do `create` (`:152`). O `edit` **nunca toca nas `Transaction`**.

O front expõe os dois campos para edição: `equinology-web-v2/app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx:130-134` (Valor) e `:155-161` (Parcelas), enviados em `PUT /payment/:id` (`:84-90`).

**O que a clínica vive:** ela corrige uma movimentação de R$ 1.000 para R$ 1.500 (ou de 1x para 3x). Depois:
- a **listagem** mostra R$ 1.500 (lê `payment.amount`);
- as **parcelas** dentro do detalhe continuam somando R$ 1.000;
- os **KPIs** "Recebido / A receber" mostram R$ 1.000 — porque `computeFinancialKpis` soma `p.transactions[].value` (`financialSummary.ts:38-47`);
- se mudou o número de parcelas, a nova contagem também é ignorada.

Resultado: o **total do topo da tela não bate com a listagem logo abaixo**, sem nenhum aviso. É o mesmo sintoma do antigo D7 (já corrigido), reintroduzido por outra causa.

---

### B4-06 · GRAVE — O link público da fatura é o próprio documento codificado na URL: qualquer um edita o valor

**Novo?** Não — já constava (`[ALTO] Fatura pública é payload base64 sem assinatura`). **Reverifiquei: intocado.**

**Evidência** — `equinology-web-v2/lib/invoice-share.ts:57-68`:
```ts
export function encodeInvoicePayload(p: PublicInvoicePayload): string {
  return toBase64Url(JSON.stringify(p));
}
export function decodeInvoicePayload(token: string): PublicInvoicePayload | null {
  ...
  if (parsed?.v !== 1 || !Array.isArray(parsed.it)) return null;
```
Sem HMAC, sem assinatura, sem consulta ao backend. A página `app/fatura/[token]/page.tsx:20-21` chama `decodeInvoicePayload(token)` e renderiza o que vier. O total exibido (`:38`) é `data.it.reduce(...)` — soma do que está **na URL**.

**Sim, dá para editar o valor na URL.** É base64url puro: decodifica, muda `"tt"` e os itens, recodifica, e a página exibe o novo valor com a logo, o CNPJ e a chave PIX da clínica. Um cliente mal-intencionado gera um "comprovante de fatura" de R$ 50 para uma cobrança de R$ 5.000.

**Ressalva honesta:** a chave PIX vai no payload (`ViewPaymentSheet.tsx:143`), então o dinheiro continua indo para a clínica. O dano é de **prova documental** — a página tem cara de documento oficial da clínica e não é verificável.

**Nota positiva:** o antigo D8 (*"fatura pública nunca exibe a chave PIX"*) **foi corrigido** — `ViewPaymentSheet.tsx:143` agora usa `clinic.pixKey` (de `clinicFromCompany`) e não mais o `localStorage`.

**Ressalva de escopo:** este link é gerado a partir da **Movimentação** (`ViewPaymentSheet`), não da Fatura. Não encontrei nenhum gerador de link público na `InvoicesTable`. A "fatura" que a clínica compartilha e a "Fatura" do módulo de faturas são coisas diferentes no produto — vale conferir com o dono se é intencional.

---

### B4-07 · GRAVE — Pagar uma movimentação de terceiro: falta a guarda de posse que a fatura tem

**Novo? SIM.**

`invoice.controller.ts:117-121` tem `assertClientToken(tokenType)`, e `invoice.service.ts:381, 436, 492` verificam `invoice.clientId !== clientId`. **O equivalente de transação não tem nada disso:**

- `transaction.controller.ts:148-153` (`POST /transaction/pix/:transactionId`), `:162-175` (`credit/new`) e `:180-191` (`credit/existing`) usam `@CurrentUserId()` como `clientId` **sem checar `tokenType`**.
- `transaction.service.ts:206-316` (`pix`) e `:318-382` (`existingCreditCard`) **nunca comparam a transação com o `clientId`**. O único guard existente é sobre o cartão (`:348 creditCard.clientId !== clientId`), não sobre a transação.

**O que acontece:** um cliente autenticado que conheça (ou adivinhe) o id de uma transação de **outra clínica** consegue: (a) descobrir o valor dela via QR PIX gerado, e (b) em `existingCreditCard`, pagar com o próprio cartão e **marcar a transação alheia como `PAID`** (`:376-379`). O dano financeiro é baixo (ele paga do próprio bolso), mas **o financeiro de uma clínica que ele nem conhece passa a mostrar uma baixa que ela não recebeu** — e, por causa do B4-01, o dinheiro nem chega a essa clínica.

Marcado GRAVE e não BLOQUEIA porque exige conhecer um UUID v4.

---

### B4-08 · GRAVE — "Todo período": os KPIs cobrem uma janela, a tabela cobre outra

**Novo? SIM** (o antigo D7, de página única, **foi corrigido** — ver abaixo).

**Correção anterior confirmada:** `useFinancialData.ts:100-125` agora percorre todas as páginas em lotes (`MAX_PAGES = 200`, `PAGE_BATCH_SIZE = 5`) e respeita o `pages` da API. **D7 está resolvido.**

**Mas sobrou uma divergência:** `financial/page.tsx:50` — o preset `"all"` devolve `{ start: "", end: "" }`. Com strings vazias, `useFinancialData.ts:64` avalia `hasCustom = false` e cai no **default de −12/+3 meses** (`:78-80`):
```ts
const start = startOfMonth(subMonths(new Date(), DEFAULT_MONTHS_BACK));  // 12 meses atrás
const end   = endOfMonth(addMonths(new Date(), DEFAULT_MONTHS_FORWARD)); // 3 meses à frente
```
Enquanto a `PaymentsTable` recebe as mesmas strings vazias como `startDateOverride`/`endDateOverride` (`page.tsx:242-243`) e, sem filtro de data, a API devolve **tudo** (`prismaPayment.repository.ts` → `getTransactionDateFilter` retorna `undefined` quando não há datas).

**Na prática:** com "Todo período" selecionado, qualquer movimentação de mais de 12 meses atrás (ou de mais de 3 meses à frente — parcelamento longo é comum) **aparece na tabela e não entra nos KPIs**. Os quatro cards e o gráfico ficam menores que a listagem, sem aviso. Nos demais presets ("Este mês" é o default) os dois lados batem.

---

### B4-09 · GRAVE — Erro do Asaas lido sem proteção: faturas e movimentações viram 500 genérico

**Novo?** Não — era o **D6**. **Reverifiquei: continua aberto nos caminhos de fatura/movimentação.**

**Evidência** — `asaas.ts` linhas **99, 148, 186, 206, 214, 230, 239**, todas no padrão:
```ts
if (payment.status !== 200) {
  return left(new PaymentError(payment.data.errors[0].description));
}
```
Sem `?.`, sem try/catch. E o cliente é `new Axios({...})` (`:65`) **sem `validateStatus`** — respostas 4xx/5xx não rejeitam a promise e caem direto nesse acesso. Corpo HTML (proxy/WAF) ou JSON sem `errors` vira `TypeError` → 500.

Os métodos de assinatura já foram blindados (`:316, 328, 340, 348, 361, 392, 404, 427, 438, 449, 460` usam `?.` dentro de try/catch). **Os métodos que a clínica usa — `createPaymentId`, `newCreditCartPayment`, `existsCreditCartPayment`, `pixPayment`, `cancelInvoice`, `refound` — não.** Exatamente os do dinheiro dela.

---

### B4-10 · MENOR — Não dá para apagar o Wallet ID: o "??" preserva o valor antigo e o toast diz sucesso

**Novo? SIM.**

**Evidência** — `vetequus-api/src/domain/application/services/account/services/Company.service.ts:57`:
```ts
company.walletId = walletId ?? company.walletId;
```
O `WalletCard.tsx:52` envia `walletId: trimmedValue || null` quando o campo é esvaziado. Como `@IsOptional()` deixa o `null` passar, `null ?? company.walletId` **devolve o valor antigo**. O front então mostra `toast.success("Wallet ID atualizado.")` (`:54`) e recarrega — trazendo o valor que ela acabou de "apagar".

Compare com os campos vizinhos do mesmo método (`:58-72`), que usam corretamente `if (campo !== undefined)`.

**Impacto:** se a clínica trocar de conta Asaas e quiser limpar o campo antes de recolar, não consegue. Menor porque ela pode sobrescrever direto.

---

### B4-11 · MENOR — Itens da fatura são texto serializado dentro da `description`, com parser por regex

**Novo?** Não é bug, é dívida assumida — o próprio arquivo documenta (`equinology-web-v2/lib/invoice-items.ts:1-16`: *"Zero mudança no schema/migration… Quando precisarmos de relatórios financeiros por serviço, aí vale criar tabela InvoiceItem"*).

Registro aqui porque toca o bloco: **não existe modelo `InvoiceItem`**. Os itens vivem em `Invoice.description` no formato `"1 x Nome — R$ 150,00 · Animal: Thor"` (`:33-43`) e são reparseados por regex (`:79-92`) para gerar PDF e reabrir a fatura. Consequências reais:
- **relatório por serviço é impossível** — a clínica não consegue saber quanto faturou de cada procedimento;
- se um item tiver o nome com o padrão `" - R$ "` embutido, o parser o classifica errado e ele cai em `freeform`, sumindo do PDF de itens.

Não bloqueia o lançamento; é o teto do módulo.

---

### B4-12 · MENOR — Fatura paga é contada duas vezes se a clínica somar os dois blocos da tela

**Novo? SIM.**

`invoice.service.ts:465-471` e `:532-538` chamam `ensureInvoicePaymentExists`, que cria uma **Movimentação de entrada** (`:177-205`) espelhando a fatura. Idem quando a clínica clica "Receber" (`:300-310`).

Isso alimenta os KPIs "Recebido" no topo. Ao mesmo tempo, o bloco de Faturas logo abaixo mostra seu próprio `paidAmount` (`prismaInvoice.repository.ts:98-102`). **O mesmo dinheiro aparece nos dois lugares.** Não é erro de cálculo — cada bloco está certo isolado — mas a tela não sinaliza que um é reflexo do outro. Vale um rótulo ("já incluído no Recebido").

---

## Itens da auditoria anterior que EU REVERIFIQUEI e estão de fato CORRIGIDOS

Registro para o dono não gastar tempo com eles:

- **D7 — KPIs só com a 1ª página:** corrigido. `useFinancialData.ts:100-125` busca todas as páginas.
- **D8 — chave PIX ausente na fatura pública:** corrigido. `ViewPaymentSheet.tsx:143` usa `clinic.pixKey`.
- **F11 — não existe onde cancelar fatura:** corrigido. `InvoicesTable.tsx:406-432` (`PUT /invoice/:id { status: "CANCELED" }`), botão em `:835-839`.
- **E2 — 500 ao pagar parcelas:** corrigido. `PayTransactionSheet.tsx:90-96` converte via `apiDateToIsoString` antes do PUT.
- **"Só uma ponta do filtro de data é ignorada":** corrigido. `prismaPayment.repository.ts` → `getTransactionDateFilter` agora aceita intervalo aberto.
- **"Fatura marcada Vencida no dia do vencimento":** corrigido nos dois lados. `prismaInvoice.repository.ts` usa `overdueCutoff()` no `summary` e no `buildWhere`.
- **F3 — `clientId`/`scope` descartados na movimentação:** corrigido. Ambos existem no `Payment` e são filtráveis (`payment.service.ts:98-100, 201`; `prismaPayment.repository.ts` `whereFilter`).
- **Isolamento multi-tenant no financeiro:** corrigido e bem-feito. `transaction.service.ts:52-79` (`assertOwnedRefs`), `payment.service.ts:39-68` (`ownsLinks`), `invoice.service.ts:219-229, 253-269` e `invoice.controller.ts` (todo endpoint com `@CurrentCompanyId()`). **Confirmei que essas checagens realmente comparam `companyId` com `companyId`** — não repetem o erro histórico de comparar com `userId`.

---

## Dúvidas em aberto

1. **Já existe passivo de repasse?** Não tenho acesso ao painel Asaas. Precisa de uma consulta às cobranças `CREDIT_CARD` liquidadas para saber quanto dinheiro de clínica está retido na conta da plataforma pelo B4-01. Sem isso não dá para dimensionar o problema — só afirmar que ele existe.

2. **O webhook está sequer configurado no painel?** O endpoint existe e exige `ASAAS_WEBHOOK_TOKEN` (`env.ts:27`), mas se está registrado no Asaas é dado de runtime. Não muda o B4-02 (o handler não trata fatura de qualquer forma), mas muda o esforço de correção.

3. **`pixPayment` envia `dueDate: new Date()`** (`asaas.ts:200`), que serializa como ISO completo, enquanto `createUndefinedPayment` (`:419`) e `createSubscription` (`:298`) usam `moment(...).format('YYYY-MM-DD')`. Não sei se o Asaas aceita o ISO nesse campo. Os logs de debug do código (`transaction.service.ts:284`) sugerem que o PIX funciona, mas **não consegui fechar**. Sinalizo como suspeita, não como achado.

4. **Fluxo de obtenção do walletId fora do produto:** não sei se a Equinology cria as subcontas Asaas manualmente para cada clínica (processo comercial) ou se espera que a clínica faça. Se for processo manual, o B4-04 vira operacional em vez de bloqueio de produto — mas continua sem validação e sem instrução na tela.

5. **O link `/fatura/[token]` é intencionalmente da Movimentação e não da Fatura?** Não achei gerador na `InvoicesTable`. Pode ser decisão de produto ou lacuna.

6. **Não verifiquei** se algum script fora de `src/` (migrations, seeds, ferramentas de operação) faz conciliação manual. Busquei só em `src/`.
