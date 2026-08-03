# BLOCO 2 — Persona CLÍNICA: criar conta, pagar, entrar

Auditoria de código, sem execução. Nenhum arquivo de produção foi alterado.
Data: 02/08/2026. Repos lidos no estado atual do working tree (WEB, API, ADM).

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verifiquei (li o arquivo inteiro ou o trecho relevante ponta a ponta)

**WEB (`equinology-web-v2`)**
- `middleware.ts` (integral)
- `app/(auth)/register/page.tsx` (integral, 379 linhas)
- `app/(auth)/login/page.tsx` (integral)
- `app/(auth)/recover-password/page.tsx` (integral)
- `app/(auth)/mail-code/page.tsx` (integral)
- `app/(auth)/plans/page.tsx` (integral, 471 linhas)
- `app/(auth)/checkout/[id]/page.tsx` (integral, 765 linhas)
- `app/(dashboard)/subscription/page.tsx` (integral)
- `lib/api-error.ts`, `lib/money.ts`, `lib/auth.ts`, `context/ApiContext.tsx`, `components/ui/input.tsx`
- `app/api/audio/transcribe/route.ts`, `app/api/chat/route.ts` (cabeçalho e checagem de auth)
- Listagem completa de `app/` e `app/(dashboard)/` para conferir o matcher do middleware

**API (`vetequus-api`)**
- `signature/service/companySignature.service.ts` (integral, 1043 linhas)
- `signature/companySignature.controller.ts` e `dto/companySignature.dto.ts` (integrais)
- `signature/signatureAccess.ts`, `expireTrialSignatures.scheduler.ts` (integrais)
- `prismaCompanySignature.repository.ts` e `prismaCompanySignatureMapper.ts` (integrais)
- `account/user.controller.ts` (register/signin), `account/services/User.service.ts` (método `register` completo), `dto/User.dto.ts`
- `account/services/RecoverPasswordCode.service.ts`, `account/services/companyUserLimit.service.ts` (integrais)
- `shared/handler/error.handler.ts`, `shared/auth/auth.guard.ts`, `infra/main.ts`, `infra/app.module.ts`
- `shared/bank/asaas.ts` (integral, 465 linhas)
- `prisma/schema.prisma`: models `SignaturePlan`, `CompanySignature`, `Coupon`
- Código-fonte de `class-validator` em `node_modules` para provar o comportamento de `@ValidateNested` sem `@IsOptional` (achado D5 da auditoria anterior)

**ADM** — só o mapeamento preço-em-centavos do `PlansForm`/`PlanCreateModal`, para confirmar que o valor do plano que a clínica vê não está 100x errado. O resto do ADM é do Bloco 1.

### NÃO verifiquei (declarado, não inferido)

- **Runtime / Asaas.** Não tenho acesso ao painel Asaas nem ao `.env` de produção. Não sei **quais eventos de webhook estão configurados**, se `ASAAS_WEBHOOK_TOKEN` está setado, nem se o ambiente é sandbox ou produção. Dois achados abaixo (o do `SUBSCRIPTION_CREATED` e o da cobertura de eventos) dependem dessa configuração para se materializar — está dito em cada um.
- **APP mobile.** Cadastro/login do proprietário é o Bloco 3. Só toquei no token de cliente para provar que ele não alcança as rotas de assinatura.
- **Fluxo de faturas da clínica para os clientes dela** (invoice/transaction) — Bloco 3. Só registrei o buraco de webhook porque cai na pergunta (f).
- **Envio real de e-mail** (SMTP/ZeptoMail). Li o service, não testei entrega.
- **Módulo de cupons completo** (`coupon.service`/`controller`). Li só o consumo no checkout e em `companySignature.service.ts`.
- **Não executei nada**: sem browser, sem chamada HTTP, sem banco. Tudo abaixo é leitura de código.

---

## Veredito

**funciona_com_ressalva — mas com três buracos que eu classifico como bloqueio de lançamento.**

O caminho feliz existe e fecha: registrar → cair em `/plans` → ativar trial (o botão A3 foi de fato implementado) → usar o sistema → ir ao checkout → gerar PIX ou pagar no cartão → entrar.

O que quebra:

1. **Quem paga por PIX é bloqueado no segundo mês, tendo pago.** A renovação PIX nunca estende a validade da assinatura. É o pior achado deste bloco e é novo.
2. **Quem está em trial vira ACTIVE por um mês (ou um ano) só de clicar em "Gerar PIX", sem pagar.** O D1 da auditoria anterior continua aberto, palavra por palavra.
3. **Quem faz upgrade por PIX perde o acesso ao sistema no instante em que gera o QR Code**, e só recupera pagando. O D3 continua aberto.

Somado a isso: nenhum ponto do checkout é idempotente — cada clique gera uma assinatura recorrente nova no Asaas.

---

## Achados

Ordem: bloqueio primeiro.

---

### B2-01 · BLOQUEIA_LANCAMENTO · Renovação por PIX nunca estende a assinatura — o cliente paga o 2º mês e é barrado

**Novo.** Não consta em nenhum dos dois documentos anteriores.

**O que quebra na prática:** a clínica assina por PIX, paga, entra e trabalha. No mês seguinte o Asaas gera a segunda cobrança da recorrência, ela paga, o webhook `PAYMENT_RECEIVED` chega — e **a data de validade não se mexe**. Cinco dias depois do vencimento (a tolerância do `signatureAccessDeadline`) o scheduler marca a assinatura como `INACTIVE` e o middleware passa a jogar a clínica em `/plans`. Ela pagou e está fora do sistema.

**Evidência:** `vetequus-api/src/domain/application/services/signature/service/companySignature.service.ts:444-477`

```ts
// Se for uma assinatura com PIX (incl. UNDEFINED no Asaas), ativar quando o pagamento for confirmado
if (signature.paymentType === 'PIX' && signature.status === 'INACTIVE') {
  ...
  signature.status = 'ACTIVE';
  signature.expirationDate = moment().add(1, signature.yearly ? 'year' : 'month').toDate();
  ...
} else if (signature.paymentType === 'CREDIT_CARD' && signature.paymentId !== paymentId) {
  signature.expirationDate = moment().add(1, signature.yearly ? 'year' : 'month').toDate();
  signature.status = 'ACTIVE';
}
```

O primeiro ramo exige `status === 'INACTIVE'` — depois da primeira ativação a assinatura está `ACTIVE`, então ele nunca mais entra. O segundo ramo exige `paymentType === 'CREDIT_CARD'`. **Uma assinatura PIX já ativa não casa com nenhum dos dois.** A única coisa que acontece é `signature.paymentId = paymentId` (linha 480) e o `save`.

Corte do acesso confirmado em `signatureAccess.ts:29-33` (tolerância de 5 dias só) e `prismaCompanySignature.repository.ts:141-158` (`deactivateExpiredPaidSignatures`), acionado de hora em hora por `expireTrialSignatures.scheduler.ts:48-63`.

**Estado do banco vs. estado do Asaas:** Asaas = assinatura ativa, pagamento recebido. Banco = `INACTIVE`, expirada. **Divergem, e a divergência sempre penaliza o cliente que pagou.**

**Correção:** trocar a condição por algo do tipo "se o `paymentId` é novo, estende a expiração, qualquer que seja o `paymentType`" — a mesma lógica de idempotência que já existe no ramo do cartão.

---

### B2-02 · BLOQUEIA_LANCAMENTO · Trial vira assinatura paga sem pagamento (D1 da auditoria anterior, intacto)

**Já constava** (D1). **Continua exatamente como estava.**

**O que quebra na prática:** a clínica ativa o teste grátis em `/plans`, vai em `/checkout/<mesmo plano>`, marca "Assinatura anual" e clica "Gerar PIX". No mesmo request, antes de qualquer confirmação de pagamento, o registro TRIAL vira `ACTIVE` com validade de **um ano**. Ela fecha a aba e nunca paga. Receita perdida por cliente que souber disso.

**Evidência:** `companySignature.service.ts:155-170`

```ts
const existingTrial = existingSignatures.find(
  (s) => s.status === 'TRIAL' && s.signaturePlanId === planId
);

if (existingTrial) {
  existingTrial.status = 'ACTIVE';
  existingTrial.expirationDate = moment()
    .add(1, yearly ? 'year' : 'month')
    .toDate();
  ...
  await this.companySignatureRepository.save(existingTrial);
} else {
  const companySignature = CompanySignature.create({ ... status: 'INACTIVE', ... });
```

O ramo `else` (linha 171-190) faz o certo — nasce `INACTIVE` e espera o webhook. Isso prova que a promoção do trial é um desvio, não um projeto.

Agravante já apontado antes e ainda válido: com a assinatura já `ACTIVE`, o webhook do pagamento real cai no vazio (mesma condição do B2-01), então **nem a nota fiscal é emitida quando o cliente honesto paga**.

**Estado do banco vs. Asaas:** Banco = `ACTIVE`, válida por 1 ano. Asaas = assinatura com a primeira cobrança em aberto/vencida. Divergem por design.

O mesmo padrão está nos ramos de cartão (`:273-285` e `:373-384`), mas ali o Asaas de fato autoriza o cartão na criação da assinatura, então o risco é menor.

---

### B2-03 · BLOQUEIA_LANCAMENTO · O evento `SUBSCRIPTION_CREATED` ativa a assinatura PIX sem nenhum pagamento

**Novo.** Nenhum documento anterior tocou nisso — e o runbook da auditoria anterior manda justamente **habilitar** esse evento no painel (`AUDITORIA-FINAL-CONSOLIDADA.md`, passo 6 do webhook).

**O que quebra na prática:** o fluxo PIX sem trial cria a assinatura no banco como `INACTIVE` mas **com `expirationDate` já em +1 mês/+1 ano** (`companySignature.service.ts:172-187`). Logo em seguida o Asaas emite `SUBSCRIPTION_CREATED` para a assinatura recém-criada. O handler pega esse evento e faz:

**Evidência:** `companySignature.service.ts:486-496`

```ts
if (status === 'SUBSCRIPTION_CREATED') {
  // Assinatura criada - pode atualizar status se necessário
  if (subscriptionId) {
    const signature = await this.companySignatureRepository.findBySubscriptionId(subscriptionId);
    if (signature) {
      signature.status = 'ACTIVE';
      await this.companySignatureRepository.save(signature);
    }
  }
}
```

Sem checar pagamento, sem checar valor, sem checar nada. **Gerar o QR Code passa a valer um mês (ou um ano) de sistema de graça, para qualquer conta, com ou sem trial.**

**Ressalva honesta (é por isso que classifico como CONFIRMADO no código e condicionado no runtime):** isso só dispara se o evento `SUBSCRIPTION_CREATED` estiver habilitado no painel do Asaas. Além disso há uma corrida — se o webhook chegar antes de `companySignatureRepository.create()` (linha 189), o `findBySubscriptionId` volta `null` e nada acontece. Em produção, com fila de webhook do Asaas, a entrega costuma vir depois. **Recomendação imediata: não habilitar `SUBSCRIPTION_CREATED` no painel enquanto esse trecho existir.**

---

### B2-04 · BLOQUEIA_LANCAMENTO · Upgrade por PIX derruba o acesso da clínica no instante em que o QR é gerado (D3, intacto)

**Já constava** (D3). **Continua.**

**O que quebra na prática:** clínica ativa, em dia, clica em "Pagar upgrade com PIX" na tela `/subscription`. O backend marca a assinatura antiga como `INACTIVE` e cria a nova também `INACTIVE`. Como `isSignatureValidForAccess` só aceita `ACTIVE` ou `TRIAL`, na navegação seguinte o middleware manda a clínica para `/plans`. **Cliente pagante, em dia, fora do sistema, sem ter feito nada de errado.**

**Evidência:** `companySignature.service.ts:1008-1029`

```ts
// 9. Marcar assinatura antiga como INACTIVE
activeSignature.status = 'INACTIVE';
await this.companySignatureRepository.save(activeSignature);

// 10. Criar nova assinatura (INACTIVE até pagar o PIX)
const newSignature = CompanySignature.create({ ... status: 'INACTIVE', ... });
```

e `signatureAccess.ts:51`

```ts
if (signature.status !== 'ACTIVE' && signature.status !== 'TRIAL') return false;
```

**Três agravantes que fecham o cerco:**

1. Em `/plans` o botão "Voltar" some (`plans/page.tsx:201`, `hasValidSignature === true &&`) e o "Começar teste grátis" também não aparece (a empresa já usou o trial → `startTrial` recusa em `companySignature.service.ts:613-620`). Sobram "Assinar" e "Sair".
2. Uma segunda tentativa de upgrade retorna 403: `processUpgradeWithPix` procura `signatures.find(sig => sig.status === 'ACTIVE')` (`:916`) e agora não existe nenhuma → `NotAllowedError`.
3. A assinatura antiga já foi cancelada no Asaas **antes** de qualquer coisa (`:962-970`), e a falha do cancelamento é só logada (`console.error`, sem rollback). Se o `createSubscription` seguinte falhar, a rota devolve erro com a recorrência do cliente já destruída no gateway e nada no banco registrando isso.

**Estado do banco vs. Asaas na janela:** Asaas = recorrência antiga cancelada + recorrência nova com cobrança em aberto. Banco = duas assinaturas `INACTIVE`. Coerentes entre si, mas ambos representam um cliente sem acesso que estava em dia.

---

### B2-05 · BLOQUEIA_LANCAMENTO · Nenhum ponto do checkout é idempotente — cada clique cria uma assinatura recorrente nova no Asaas

**Novo.**

**O que quebra na prática:** nem o front nem o back verificam se a empresa já tem assinatura vigente ou já tem recorrência aberta no Asaas.

- No PIX, depois do primeiro envio o botão passa a se chamar **"Gerar novo PIX"** (`app/(auth)/checkout/[id]/page.tsx:610-612`) e continua habilitado. Cada clique = um `POST /subscriptions` novo no Asaas.
- No cartão, `handleCardSubmit` só desabilita o botão durante o `submitting`; nada impede pagar duas vezes ao voltar à tela. Cada envio = uma assinatura de cartão nova, **cobrada de verdade**.

**Evidência:** `companySignature.service.ts:121-129` (o `createSubscription` do PIX é a primeira coisa do método, sem nenhuma checagem prévia de assinatura existente) e `:344-354` (idem no cartão novo). Nos três métodos de pagamento não existe uma única consulta a `fetchByCompanyId` **antes** de chamar o Asaas — a consulta só aparece depois, e serve apenas para procurar o trial (`:155`, `:268`, `:368`).

**Estado do banco vs. Asaas:** Banco = N registros de `CompanySignature` para a mesma empresa. Asaas = N recorrências ativas, cobrando N vezes por mês. **Divergem em quantidade e em dinheiro.** No cartão isso é cobrança duplicada real do cliente.

**Correção mínima antes de lançar:** recusar `pix`/`credit/new`/`credit/existing` quando `fetchByCompanyId` já devolver uma assinatura válida por `isSignatureValidForAccess`, ou reaproveitar a `asaasSubscriptionId` existente em vez de criar outra.

---

### B2-06 · GRAVE · Cadastro de clínica nova: campos obrigatórios no back são opcionais no front, e a falha vira "Registro não encontrado. Ele pode ter sido removido."

**Novo nesta forma.** O requisito explícito do dono ("precisa dizer *não foi possível criar conta por XYZ*") não está atendido neste caminho.

**O que quebra na prática:** o formulário de "Nova clínica" mostra CPF/CNPJ, Nome da clínica, CEP, Endereço e Número **sem `required` e sem asterisco**. Só Nome, Email, Senha e Telefone são obrigatórios na tela. A API, porém, exige CPF-ou-CNPJ **e** endereço **e** número **e** CEP — e quando falta qualquer um devolve `ResourceNotFoundError`.

**Evidência — front:** `equinology-web-v2/app/(auth)/register/page.tsx:258-313` — os cinco campos são renderizados sem `required`; e `:96-102`:

```ts
if (payload.newCompany) {
  if (payload.cpfCnpj) body.cpfCnpj = payload.cpfCnpj;
  if (payload.address) body.address = payload.address;
  if (payload.number) body.number = payload.number;
  if (payload.postalCode) body.postalCode = payload.postalCode;
  ...
```

**Evidência — API:** `vetequus-api/src/domain/application/services/account/services/User.service.ts:254-259`

```ts
if (newCompany) {
  if (!cpf && !companyCnpj) return left(new ResourceNotFoundError());
  if (!paymentType || !address || !number || !postalCode) {
    return left(new ResourceNotFoundError());
  }
```

**Evidência — a mensagem que o usuário lê:** `error.handler.ts:50` mapeia `ResourceNotFoundError` para 404 com `code: 'RESOURCE_NOT_FOUND'`; `equinology-web-v2/lib/api-error.ts:88` traduz esse code para **"Registro não encontrado. Ele pode ter sido removido."**, e `:202` faz o code ganhar da mensagem da API. É essa frase que aparece embaixo do botão "Criar conta".

O mesmo texto aparece quando o **código da clínica está errado** no cadastro por vínculo (`User.service.ts:343-346`) — outro lugar em que a mensagem certa seria "código da clínica não encontrado".

Nota de precisão: a instrumentação de erro **existe e funciona** para duplicidade — e-mail repetido devolve 409 com `field: 'email'` e o front mostra "Já existe um cadastro com este e-mail…" (`api-error.ts:135-139`). O problema é específico do `ResourceNotFoundError` sendo usado como "faltou campo".

**Correção:** trocar esses `ResourceNotFoundError` por `ValidationError` com texto próprio ("Informe CPF ou CNPJ", "Informe o CEP…") e marcar os campos como obrigatórios na tela.

---

### B2-07 · GRAVE · Checkout PIX não confirma nada: sem polling, sem botão "verificar", e o texto contradiz o que o código faz (D4, intacto)

**Já constava** (D4). **Continua.**

**O que quebra na prática:** o cliente gera o QR, paga no banco e a tela **não muda nunca**. Nenhum `setInterval`, nenhum refetch de `/signature/current`, nenhum redirect. Se ele fechar a aba, não recebe e-mail nem qualquer aviso — a única forma de descobrir se funcionou é tentar navegar no sistema e ver se o middleware o rebate.

**Evidência:** `app/(auth)/checkout/[id]/page.tsx:601-615` — o bloco do PIX é um `<form>` com um único `<Button type="submit">`. Não existe `setInterval`/`setTimeout` de polling em nenhum ponto do arquivo (o único `setTimeout` é o do "Copiado!" em `:329` e o do redirect do cartão em `:387`).

**Agravante de honestidade da mensagem:** `:314-316` diz

```
"PIX gerado. Escaneie o QR Code ou copie o código para pagar no app do seu banco.
 A assinatura será ativada após a confirmação do pagamento."
```

que é **falso** quando existe trial (B2-02: já foi ativada) e **impossível de acompanhar** quando não existe.

**Correção:** polling em `GET /signature/current` a cada ~5 s enquanto a tela estiver aberta, mais um botão "Já paguei / Verificar pagamento".

---

### B2-08 · GRAVE · Assinatura paga com cartão novo (o único caminho de cartão do web) não emite nota fiscal

**Novo.**

**O que quebra na prática:** o checkout do web só oferece cartão **novo** (`POST /signature/credit/new`). Esse método cria a assinatura com `invoiceId: null` e **nunca chama `scheduleInvoice.createInvoice`**. O caminho irmão, de cartão salvo, chama. O resultado é que toda venda de assinatura por cartão feita pelo site fica sem nota fiscal agendada no Asaas.

**Evidência — cartão salvo (faz certo):** `companySignature.service.ts:262-266`

```ts
const invoice = await this.scheduleInvoice.createInvoice({
  paymentId: firstPaymentId,
  customerId: company.paymentId,
  value: annualValue,
});
```

**Evidência — cartão novo (não faz):** `companySignature.service.ts:373-404` — o ramo do trial grava `existingTrial.invoiceId = null` (`:379`) e o ramo de criação usa `invoiceId: null` (`:396`). Não há nenhuma chamada a `scheduleInvoice` no método `newCreditCard`.

No PIX a nota só é criada dentro do webhook (`:454-458`) — e, por causa do B2-02, **não é criada quando o pagamento veio de um trial promovido**.

**Estado do banco vs. Asaas:** Banco = assinatura `ACTIVE` com `invoiceId` nulo. Asaas = cobrança liquidada sem nota vinculada. Passivo fiscal silencioso.

---

### B2-09 · GRAVE · As rotas `/api/*` do Next ficam fora do middleware e sem autenticação — a chave da OpenRouter está aberta na internet

**Novo.**

**O que quebra na prática:** `POST /api/chat`, `POST /api/audio/transcribe`, `/api/audio/transcribe-to-form` e `/api/audio/transcribe-to-odontogram` são route handlers do Next que usam `process.env.OPENROUTER_API_KEY` e **não checam token nenhum**. Não estão no `config.matcher`, então o middleware nem roda. Qualquer pessoa que descubra a URL usa a conta de LLM da Equinology à vontade (até 15 MB de áudio por request).

**Evidência:** `equinology-web-v2/app/api/audio/transcribe/route.ts:7-14`

```ts
export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) { ... }
```

— a única checagem antes de gastar a chave é a existência da própria chave. Idem em `app/api/chat/route.ts:11-19`.

**Evidência do matcher:** `equinology-web-v2/middleware.ts` (bloco `config.matcher`) lista `/`, `/login`, `/register`, `/recover-password`, `/mail-code`, `/plans`, `/checkout/:path*`, `/calendar`, `/clients-equines/:path*`, `/services/:path*`, `/financial`, `/stock`, `/crm`, `/subscription`, `/clinic`, `/notes`, `/reminders` — nenhuma entrada `/api`.

**Nota positiva sobre o gate de assinatura em si:** conferi `ls app/(dashboard)/` e as dez rotas do dashboard (calendar, clients-equines, clinic, crm, financial, notes, reminders, services, stock, subscription) **estão todas no matcher**. O furo S5 (`/notes`, `/reminders`) está fechado. Sobram no matcher duas rotas mortas citadas no STATUS-VERIFICADO — só que agora nem elas: as entradas `/stock2` e `/cooperators` **não existem mais** no arquivo. Esse item do STATUS-VERIFICADO está defasado.

Pontos menores do gate, no mesmo arquivo: `/plans` e `/checkout` são explicitamente isentos da validação (`isCheckoutOrPlans`), o que é correto; e qualquer resposta não-OK de `/signature/validation` — inclusive um 401 de token expirado — manda o usuário para `/plans` em vez de `/login`.

---

### B2-10 · GRAVE · O cupom é consumido ao gerar o PIX, mesmo que o pagamento nunca aconteça

**Novo.**

**O que quebra na prática:** um cupom com `maxUsages` limitado tem uma unidade queimada a cada geração de QR Code. Como o botão vira "Gerar novo PIX" e continua clicável (ver B2-05), o mesmo usuário esgota uma campanha inteira sem pagar nada.

**Evidência:** `companySignature.service.ts:192-195`

```ts
if (couponResult.coupon) {
  couponResult.coupon.incrementUsage();
  await this.couponRepository.save(couponResult.coupon);
}
```

Isso está no fim do método `pix()`, incondicionalmente — o incremento não espera confirmação de pagamento. Mesma coisa em `existingCreditCard` (`:307-310`) e `newCreditCard` (`:406-409`), onde ao menos há cobrança de verdade.

**Correção:** mover o `incrementUsage` para o webhook, no ponto em que a assinatura passa a `ACTIVE`.

---

### B2-11 · GRAVE · O webhook trata 6 eventos; estorno, chargeback e inadimplência não estão entre eles

**Parcialmente já constava** (o D5 antigo falava de cobertura). Reconfirmado e detalhado.

**O que quebra na prática:** `signatureValidation` só reage a `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `SUBSCRIPTION_PAYMENT_RECEIVED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED` e `SUBSCRIPTION_CANCELLED`. Não existe tratamento para `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_DELETED` nem `PAYMENT_OVERDUE`. Consequência: **um cliente que pede estorno ou abre chargeback continua com o sistema liberado até a `expirationDate`**, e a Equinology fica sem o dinheiro e sem sinal no banco.

**Evidência:** `companySignature.service.ts:422-426`, `:486`, `:498` — são os três únicos `if` de evento no método. Qualquer outro `event` cai no `return right(null)` da linha 520 sem log.

**Buraco adjacente confirmado:** `grep -rn "webhook" src/` na API retorna **um único endpoint**, `POST /signature/webhook`. Pagamentos de faturas e movimentações da clínica para os clientes dela não têm handler nenhum (existe um `PaymentWebhookDto` órfão em `finance/dto/transaction.dto.ts:354`, sem rota). É Bloco 3, mas fecha a resposta da pergunta (f).

---

### B2-12 · MENOR · Correção de rumo: o DTO do webhook **não** rejeita o payload real do Asaas — o achado D5 está refutado

**Já constava como CRÍTICO (D5). Estou refutando com prova.**

A auditoria anterior afirmou que `payment` e `subscription` com `@ValidateNested()` sem `@IsOptional()` fariam **todo** webhook voltar 400. Fui ao código do `class-validator` instalado:

`vetequus-api/node_modules/class-validator/cjs/validation/ValidationExecutor.js:250-253`

```js
nestedValidations(value, metadatas, error) {
    if (value === void 0) {
        return;
    }
```

Propriedade ausente = `undefined` = validação aninhada **pulada**. O `ValidationPipe` global (`infra/main.ts:13-32`) não usa `whitelist`, `forbidNonWhitelisted` nem `skipMissingProperties`, então nada mais dispara. Um payload `{event, subscription:{id}}` sem `payment`, ou `{event, payment:{...}}` sem `subscription`, passa nos dois casos.

`companySignature.dto.ts:169-192` continua exatamente como descrito no relatório anterior — o que mudou é a leitura, não o código. **Não gaste tempo "corrigindo" isso antes do lançamento.** O que precisa de atenção no webhook é o B2-03 e o B2-11.

Ainda no webhook, o que está **certo**: a autenticação por `asaas-access-token` existe e dispara de verdade (`companySignature.controller.ts:125-127`), a env `ASAAS_WEBHOOK_TOKEN` é obrigatória no schema (`shared/env/env.ts:27`), o `ThrottlerGuard` **não** é global (`app.module.ts:15-21`), então a fila do Asaas não vai levar 429, e a leitura do `subscriptionId` cobre as duas formas do payload v3 (`controller:130-132`).

---

### B2-13 · MENOR · Cadastro não checa CPF/CNPJ duplicado; só e-mail

**Novo.** `User.service.ts:247-249` só faz `findByEmail`. Dá para cadastrar duas clínicas com o mesmo CNPJ, gerando dois `customers` no Asaas para o mesmo documento e duas bases separadas. Não impede ninguém de trabalhar; sujeira de cadastro e de conciliação financeira.

---

### B2-14 · MENOR · Logs de produção no caminho do dinheiro e da navegação

- `equinology-web-v2/context/ApiContext.tsx:41` — `console.log("[GET]", path, new Date().toISOString())` em **toda** requisição GET do sistema.
- `vetequus-api/src/infra/shared/bank/asaas.ts:275` — `console.log(connect.data)` despeja a resposta de criação de nota fiscal no log.

---

### B2-15 · MENOR · Leitura insegura do erro do Asaas (D6) — impacto rebaixado

`asaas.ts:99, 148, 186, 206, 214, 230, 240` continuam com `connect.data.errors[0].description` sem `?.`. **Mas** o `AllExceptionsFilter` global (`infra/main.ts:36`) agora captura o `TypeError` e devolve mensagem genérica em português — o usuário não vê mais "Internal server error" cru. Continua sendo um mascarador de diagnóstico (a causa real do erro Asaas se perde), não mais um vazamento. Os métodos de assinatura (`createSubscription`, `cancelSubscription`, `getSubscriptionPayments`, `getPixQrCode`) já usam `?.` e try/catch.

---

## O que verifiquei e está CORRETO (para não se gastar tempo aí)

Registro em ordem porque o STATUS-VERIFICADO está defasado em vários destes pontos:

- **A3 — trial órfão: resolvido.** `plans/page.tsx:145-170` chama `POST /signature/start-trial/:planId`, com estado de loading, erro inline e redirect. O botão "Voltar" só aparece quando há assinatura válida (`:201`). Não é mais um beco sem saída.
- **Trial encadeado: resolvido de verdade.** A coluna `wasTrial` existe no schema (`prisma/schema.prisma:286`), passa pelos dois lados do mapper e é checada em `companySignature.service.ts:613`. Sem ela dava para renovar o teste para sempre.
- **A1/A2 — autocapitalize e olhinho: resolvidos.** `components/ui/input.tsx:24-90` decide a isenção pelo papel semântico (`autoComplete`, `showPasswordToggle`, id/name com "password|senha"), não pelo `type` — que era exatamente a causa do bug. Login (`login/page.tsx:116`), registro (`register/page.tsx:192`) e recuperação (`recover-password/page.tsx:145,158`) usam `showPasswordToggle`; o campo "Código da clínica" tem `noAutoCapitalize` (`register/page.tsx:247`).
- **E1 — 500 no recuperar senha: resolvido.** `RecoverPasswordCode.service.ts` envolve o `sendMail` em try/catch e devolve `EmailDeliveryError` com texto em PT. E o e-mail inexistente agora devolve **sucesso genérico** (`:33-41`), fechando a enumeração de e-mails — item que o STATUS-VERIFICADO ainda lista como "NÃO FEITO".
- **Rate limiting existe onde importa:** `POST /user/signin` 10/min e `POST /user/register` 5/min (`user.controller.ts:44-46, 62-64`).
- **IDOR de cancel/refound: resolvido.** `companySignature.controller.ts:152-173` usa `@CurrentCompanyId()` (não mais `@CurrentUserId`) e o service compara `signature.companyId !== companyId` (`:531` e `:558`).
- **Cancelamento não derruba mais na hora:** `cancelSignature:571-580` só desliga a renovação; o acesso vai até a `expirationDate`. E o webhook `SUBSCRIPTION_DELETED` foi ajustado para não desfazer isso (`:498-518`).
- **Assinatura ACTIVE não é mais eterna:** `signatureAccess.ts` + `handleExpirePaidSignatures` fecham o buraco, com 5 dias de tolerância só para quem tem renovação ligada.
- **Preço exibido bate com o cobrado:** `lib/money.ts:11-18` replica a fórmula do backend (`companySignature.service.ts:112-114` e `:230-232`), e o cupom usa a mesma regra dos dois lados. O ADM converte centavos→reais antes de enviar (`PlansForm.tsx:92-98`), então o preço na vitrine não está 100x errado.
- **Token de cliente (app) não alcança as rotas de assinatura:** o JWT de cliente carrega `companyId: 'no-company'` (`client.service.ts:266`), que não é UUID.
- **Limite de usuários no cadastro por código funciona e é determinístico:** `User.service.ts:351-353` → `companyUserLimit.service.ts:102-126`, com a seleção de assinatura ordenada e respeitando expiração.

---

## Dúvidas em aberto

1. **Quais eventos estão habilitados no painel do Asaas?** Sem isso não consigo dizer se o B2-03 (`SUBSCRIPTION_CREATED` ativando sem pagamento) está acontecendo hoje ou é uma bomba armada. Preciso da tela de configuração do webhook. Enquanto não se souber, o mais seguro é **desabilitar** esse evento.
2. **Existe algum cliente PIX já no segundo ciclo?** O B2-01 só se manifesta a partir do segundo pagamento. Uma query `SELECT id, companyId, status, expirationDate, paymentType FROM law_firm_signatures WHERE paymentType='PIX'` responde se já há gente prestes a ser bloqueada pagando.
3. **Quantas empresas têm mais de uma `CompanySignature` com `asaasSubscriptionId` não nulo?** Mede o estrago do B2-05 (cobrança duplicada) que já pode ter acontecido. Não consigo responder lendo código.
4. **O ambiente é sandbox ou produção no Asaas?** `ASAAS_URL` vem do `.env`, que não li. Muda a leitura de "o cartão foi mesmo autorizado na criação da assinatura".
5. **Confirmação de que o Asaas autoriza o cartão dentro do `POST /subscriptions`.** Assumi que sim (é o comportamento documentado), e é essa premissa que segura o `status: 'ACTIVE'` imediato de `newCreditCard` (`:394`). Se o Asaas apenas agenda a cobrança, esse caminho vira o mesmo problema do B2-02 e sobe para BLOQUEIA. Não consegui fechar sem acesso ao painel.
6. **Não consegui determinar se algum e-mail é enviado ao cliente na confirmação de pagamento.** Procurei em `signatureValidation` e não há nenhum `sendEmail`; mas não varri os templates todos nem os schedulers de e-mail fora do escopo de assinatura.
