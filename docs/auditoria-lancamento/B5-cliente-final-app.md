# B5 — Persona "Cliente final / Proprietário" (app mobile)

Auditoria fim a fim APP (`equinology-app-v2`) ↔ API (`vetequus-api`), feita contra o
código atual em disco (ADM na branch `main`, HEAD `9d90c5d`). Nenhum arquivo de
produção foi alterado.

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado lendo o código (app + API + Prisma), fim a fim

**App — 24 arquivos de tela/componente/lib (o repo inteiro, exceto assets):**
`(auth)/login.tsx`, `(auth)/signup.tsx`, `(auth)/forgot-password.tsx`,
`(tabs)/index.tsx`, `(tabs)/animals.tsx`, `(tabs)/agenda.tsx`, `(tabs)/finances.tsx`,
`(tabs)/profile.tsx`, `(animal)/[id].tsx`, `(animal)/notes.tsx`, `(animal)/payments.tsx`,
`(animal)/health/{index,vaccines,dewormings,exams,shoeing,protocols}.tsx`,
`(animal)/vet/{index,[appointmentAnimalId]}.tsx`,
`components/sheets/{InvoicePaymentSheet,AnimalRegistrationSheet}.tsx`,
`components/ui/{AttachmentChip,InvoiceItems}.tsx`,
`contexts/{ApiContext,SessionContext,ActionSheetContext,AnimalContext}.tsx`,
`lib/{api-error,api-mappers,api-routes,client-finances,payment-utils,card-validation}.ts`,
`babel.config.js`, `app.json`, `eas.json`, `.env`.

**API — cada rota que o app chama, até o repositório e o schema:**
`client.controller` + `client.service` (auth, register, profile, edit, soft delete, token),
`recoverClientPasswordCode.controller` + service, `clientPortal.controller` + service,
`animal.controller` + `animal.service` (fetch/getByCode/getById/registerByCode),
`vaccine/deworming/exam/shoeing.controller` + services (`isAnimalFromCompany`),
`appointment.controller` (`GET /appointment/client`) + `prismaAppointment.repository`
(`whereFilter`, `appointmentDetailsInclude`) + presenters da cadeia,
`clientPayment.controller` + `payment.service` + `prismaPayment.repository`,
`clientInvoice.controller` + `invoice.service` (`fetch`, `payPix`,
`payExistingCreditCard`, `payNewCreditCard`) + `ClientInvoicePresenter`,
`transaction.controller` + `transaction.service` (pix / credit new / credit existing),
`creditCard.controller`, `auth.guard`, `error.handler`, `asaas.ts`,
`companySignature.controller` (webhook), `schema.prisma` (Payment, Invoice, Client).

### NÃO verificado
- **Runtime.** Não rodei o app nem a API. Tudo abaixo é leitura de código; onde o
  comportamento depende de dado de produção eu digo explicitamente.
- **Anúncios (`/ads/client`)** e o `AdsCarousel` — só confirmei que a rota existe.
- **Protocolos sanitários** (`GET /sanitary-protocol`) — não rastreei o filtro por
  empresa até o repositório (a tela existe e é chamada pelo hub de Saúde).
- **Cadastro de animal pelo app** (`AnimalRegistrationSheet`) — li o fluxo, mas não
  auditei validações campo a campo (isso é território do B3).
- **Upload de foto** (`POST /file`) — fora do escopo do bloco.
- **Push/notificações** — não existem no projeto.
- **Comportamento do Asaas** (se o split é de fato aplicado do lado deles, se o
  QR expira) — não tenho acesso ao painel.

---

## Veredito

**Um proprietário real NÃO consegue completar o fluxo hoje.**

- **Ver os animais:** funciona (lista e ficha).
- **Ver o histórico de saúde (vacinas, vermífugos, exames):** **não funciona** — a API
  devolve 403 para 100% das chamadas do app (achado 1).
- **Ver o que deve:** funciona, mas os **totais na tela estão errados** em qualquer
  fatura parcelada com parcela paga (achado 6).
- **Pagar:** o cartão funciona tecnicamente, mas **o dinheiro não chega na clínica**
  quando o cartão é salvo (achado 5), e o **PIX nunca é confirmado** — o proprietário
  paga e continua vendo "Pendente" para sempre (achado 3).
- Além disso, **um proprietário enxerga o animal, o CPF, o e-mail, o telefone e a
  cobrança de OUTRO proprietário** sempre que os dois animais estiverem no mesmo
  atendimento (achado 2).

E, no estado atual do repositório, **o build aponta para um IP de rede local**
(achado 4): se ninguém trocar a linha antes de gerar o APK/IPA, o app não abre nada.

---

## Achados

### 1. [BLOQUEIA] Toda a seção "Saúde" do animal devolve 403 para o proprietário
**Novo — nenhuma auditoria anterior cita isso.** · CONFIRMADO

O token de cliente é assinado com `companyId: 'no-company'`
(`vetequus-api/src/domain/application/services/client/services/client.service.ts:265-269`):

```ts
const token = await this.encrypter.encrypt({
  sub: client.id.toString(), companyId: 'no-company', type: 'client',
});
```

Os quatro controllers de saúde repassam esse valor sem olhar o `tokenType`
(`vaccine.controller.ts:68-73`):

```ts
@Get(':animalId')
async fetch(@Query() queryParams: FetchVaccineDto, @Param('animalId') animalId: string,
            @CurrentCompanyId() companyId: string) {
  const result = await this.vaccineService.fetch({ page, query, animalId, companyId });
```

E o service compara com a empresa dona do animal
(`vaccine.service.ts:32-36` e `:166-168`):

```ts
private async isAnimalFromCompany(animalId: string, companyId: string) {
  const animal = await this.animalRepository.findById(animalId);
  return !!animal && animal.companyId === companyId;   // 'no-company' nunca bate
}
...
if (!(await this.isAnimalFromCompany(animalId, companyId))) return left(new NotAllowedError());
```

Mesmo código, mesma linha lógica, em `deworming.service.ts:32-35,162,180`,
`exam.service.ts:30-33,154` e `shoeing.service.ts:29-32,126,142`.
`NotAllowedError` vira **403** (`error.handler.ts:59-60`).

**Na prática:** o hub de Saúde (`app/(animal)/health/index.tsx:44-67`) mostra
"0 registros" em Vacinas, Vermífugos e Exames para todo animal de todo
proprietário, e abrir qualquer uma delas mostra
*"Não foi possível carregar as vacinas. Verifique sua conexão e tente novamente."*
(`health/vaccines.tsx:35-39`) — mensagem que culpa a internet do usuário por um 403.
Não existe caminho em que funcione: mesmo um animal cadastrado pelo próprio app
nasce com `companyId` nulo (`animal.controller.ts:75`), que também não é `'no-company'`.

**Correção:** ou os controllers passam `clientId` quando `tokenType === 'client'` e o
service autoriza por dono do animal (padrão que o `ClientPortalService.assertOwnsAnimal`
já usa corretamente), ou essas telas saem do app.

---

### 2. [BLOQUEIA] O proprietário vê animal, CPF, e-mail e telefone de outro proprietário
**Novo.** · CONFIRMADO

`GET /appointment/client` filtra o **atendimento** (não os animais dele) por
`some: { animal: { clientId } }` — `prismaAppointment.repository.ts:487-504`:

```ts
if (clientId) { animalWhereInput.clientId = clientId; hasAnimalFilter = true; }
...
andFilter.push({ animals: { some: animalFilter } });  // filtra o appointment, não a lista
```

O `include` traz **todos** os animais daquele atendimento, cada um com o cliente
completo (`prismaAppointment.repository.ts:13-48`):

```ts
animals: { include: { animal: { include: { client: true, studFarm: true } },
                      Payment: { include: { category: true, transactions: {...} } } } }
```

E o presenter serializa isso inteiro:
`appointmentDetails.presenter.ts:14` → `appointmentAnimalDetails.presenter.ts:9,14` →
`animalDetails.presenter.ts:19` → `client.presenter.ts:5-12`:

```ts
return { id, name: client.name, email: client.email, phone: client.phone,
         cpf: client.cpf, code: client.code };
```

**Na prática:** um atendimento com dois cavalos de donos diferentes (visita a um haras,
o caso mais comum do produto) faz o app do dono A receber o nome do cavalo do dono B,
o **CPF, e-mail e telefone** do dono B e, via `PaymentDetailsPresenter`
(`appointmentAnimalDetails.presenter.ts:14-16`), o **valor e as parcelas da cobrança**
do dono B. Na tela, `agenda.tsx` já exibe os nomes dos animais
(`lib/api-mappers.ts:209-233`); o resto vaza no payload e está a um print do
DevTools/proxy de distância. É violação de LGPD, não só de UX.

**Correção:** filtrar `animals` no próprio `include`
(`animals: { where: { animal: { clientId } } }`) ou podar no presenter quando o token
for de cliente.

---

### 3. [BLOQUEIA] Pagou no PIX e continua devendo: nada confirma o pagamento
**Novo (a auditoria anterior apontava o buraco no webhook, mas não fechou a cadeia).**
· CONFIRMADO

O único webhook do sistema é o de assinatura da clínica
(`companySignature.controller.ts:114-141`) e ele só chama
`companySignatureService.signatureValidation` — que procura em `CompanySignature`
por `subscriptionId`/`paymentId` e **nada mais** (`companySignature.service.ts:414-483`).
Não existe nenhum handler que procure `Invoice` ou `Transaction` pelo id do Asaas:
`grep bankPaymentId` retorna só **escritas**, nenhuma leitura
(`invoice.service.ts:406,459,526`, `transaction.service.ts:303,375,446`).

Pior, na movimentação o id nem é gravado — o `save` acontece **antes** da atribuição
(`transaction.service.ts:302-303`):

```ts
await this.transactionRepository.save(transaction);
transaction.bankPaymentId = payment.value.paymentId;   // depois do save: nunca persiste
```

**Na prática:** o proprietário gera o QR, paga no banco, e a fatura continua
`PENDING` no app e no financeiro da clínica **para sempre**, até alguém dar baixa
manual. Ele não tem nenhuma confirmação e a clínica não tem como saber que entrou —
o rastro para conciliar (o `paymentId` do Asaas) só existe na Invoice, nunca na
movimentação. Nem pull existe: a tela de finanças só carrega no mount
(`finances.tsx:53-55`), sem polling e sem refetch.

**Correção:** registrar os eventos `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` para
`Invoice.bankPaymentId` e `Transaction.bankPaymentId`, inverter as duas linhas do
`transaction.service.ts`, e dar refetch na tela após fechar o sheet.

---

### 4. [BLOQUEIA] O `.env` versionado aponta o app para um IP de rede local
**Novo.** · CONFIRMADO no arquivo; o impacto depende de como o build é gerado.

`equinology-app-v2/.env` está **commitado** (`git check-ignore .env` não casa;
`git log -- .env` mostra commits) e tem uma única linha ativa:

```
# ===== API LOCAL (ATIVO) =====
EXPO_PUBLIC_API_URL="http://192.168.1.9:3333"
# ===== PRODUCAO — COMENTADO =====
# EXPO_PUBLIC_API_URL="https://api.equinology.com.br"
```

`eas.json` **não define nenhuma variável de ambiente** em `build.production`, então
o build usa o `.env` do repositório. `EXPO_PUBLIC_*` é inlinado no bundle em tempo
de build.

**Na prática:** se o APK/IPA de lançamento sair desta árvore sem alguém trocar a
linha, todo proprietário abre o app, digita a senha e recebe "Não foi possível
conectar ao servidor" — nada funciona. Agravante: `http://` puro é bloqueado por
padrão pelo ATS do iOS.

**Correção:** mover a URL de produção para `eas.json` (`build.production.env`) ou
descomentar a linha certa antes do build, e tirar o `.env` do versionamento.

---

### 5. [BLOQUEIA] Pagamento com cartão SALVO não repassa nada para a clínica
**Já constava (D2 da auditoria consolidada) — continua aberto.** · CONFIRMADO

O contrato exige `split` (`shared/payment/creditCardPayment.ts:32-44`) e os dois
chamadores passam 100% para a carteira da clínica
(`invoice.service.ts:454`, `transaction.service.ts:365-370`). A implementação
**não desestrutura e não envia** (`infra/shared/bank/asaas.ts:157-179`):

```ts
const { billingType, value, creditCardToken, customer, installmentCount, dueDate, totalValue } = data;
const fullPaymentData = { billingType, value, creditCardToken, customer, dueDate, totalValue };
```

Compare com `newCreditCartPayment` (`asaas.ts:106-141`), que envia `split` nos dois
formatos de payload.

**Na prática:** o proprietário paga; o dinheiro é liquidado 100% na conta da
plataforma, sem repasse à clínica. PIX e cartão novo repassam certo. É uma linha de
correção — mas o que já foi cobrado assim precisa ser apurado no painel do Asaas.

---

### 6. [GRAVE] Os totais "Pendente" e "Pago" da tela de Finanças estão errados
**Novo (a paginação, que era o achado antigo, foi corrigida).** · CONFIRMADO

`app/(tabs)/finances.tsx:70-71`:

```ts
const totalPending = enriched.filter((p) => p.calculatedStatus !== "PAID").reduce((s, p) => s + p.amount, 0);
const totalPaid    = enriched.filter((p) => p.calculatedStatus === "PAID").reduce((s, p) => s + p.amount, 0);
```

Dois erros somados:

1. `calculatedStatus` só é `PAID` quando **todas** as parcelas estão pagas
   (`lib/payment-utils.ts:8-9`). Uma movimentação de R$ 1.200 em 12×, com 6 parcelas
   já pagas, entra **inteira** em "Pendente" e **zero** em "Pago". O proprietário
   vê que deve R$ 1.200 quando deve R$ 600.
2. `amount` nem sempre é o total: quando a clínica desmarca "valor total" no web
   (`NewPaymentSheet.tsx:299-301`), `amount` passa a ser o valor **por parcela**
   (`payment.service.ts:144`: `value: isTotalValue ? amount / quantity : amount`).
   O app nunca lê `isTotalValue` (`grep` no repo do app: zero ocorrências) e ainda
   rotula o número como **"Valor total"** no sheet de pagamento
   (`InvoicePaymentSheet.tsx:609-612`).

**Correção:** somar as parcelas (`transactions`), não o `amount` do pai.

---

### 7. [GRAVE] Quem já tem um cartão salvo não consegue pagar com outro cartão
**Já constava — continua aberto.** · CONFIRMADO

`components/sheets/InvoicePaymentSheet.tsx:811` e `:843-855`:

```tsx
{creditCards.length > 0 ? (
  <> {creditCards.map(...)} <Button title="Pagar com cartão selecionado" ... /> </>
) : (
  <> {/* "Adicionar cartão e pagar" — só existe aqui dentro */} </>
)}
```

**Na prática:** cartão salvo vencido, cancelado ou sem limite = o proprietário não
tem nenhum caminho de cartão. Sobra só o PIX — que, pelo achado 3, nunca confirma.

---

### 8. [GRAVE] Depois de pagar com cartão, a fatura continua aparecendo como pendente
**Novo.** · CONFIRMADO

`InvoicePaymentSheet.tsx:436-438` e `:541-546` mostram o toast de sucesso e chamam
`closeInvoiceSheet()`. O `ActionSheetContext` não expõe nenhum callback de sucesso
(`contexts/ActionSheetContext.tsx:44-51`) e `finances.tsx` só carrega no mount
(`:53-55`, sem `useFocusEffect`, sem pull-to-refresh).

**Na prática:** o pagamento foi processado e a fatura já está `PAID` no banco
(`invoice.service.ts:460-461`), mas a lista atrás do modal continua com o badge
"Pendente" até o app ser reaberto. É exatamente o gatilho para o cliente pagar duas
vezes ou ligar para a clínica.

---

### 9. [GRAVE] A agenda do proprietário só carrega 10 atendimentos
**Novo (a tela de Finanças foi corrigida; a agenda não).** · CONFIRMADO

`app/(tabs)/agenda.tsx:74`:

```ts
const res = await GetAPI(ApiRoutes.Appointment.fetchByClient + "?page=1");
```

A API pagina de 10 em 10 com `orderBy: [{ startDate: 'desc' }]`
(`appointment.controller.ts:216-222`, `prismaAppointment.repository.ts:336-338`).
O campo `pages` da resposta é ignorado e não há segunda chamada — diferente da tela
de atendimentos do animal, que pagina certo (`(animal)/vet/index.tsx:86-121`) e do
`lib/client-finances.ts`, que resolveu isso para o financeiro.

**Na prática:** o calendário mostra só os 10 agendamentos mais recentes; qualquer mês
anterior aparece vazio, sem aviso.

---

### 10. [GRAVE] Senha inicial do proprietário é o CPF dele
**Já constava — continua aberto.** · CONFIRMADO

`client.service.ts:76` (e idêntico em `:291`):

```ts
const passwordHash = await this.hash.hash(password ?? cpf ?? email);
```

Não existe flag de "primeiro acesso obrigatório" no schema (`grep mustChangePassword`
volta vazio) e o login aceita essa senha normalmente (`client.service.ts:246-272`).

**Na prática:** quem souber o e-mail e o CPF de um proprietário — dado que circula em
contrato, nota e cadastro de haras — entra na conta dele e vê os animais, o histórico
compartilhado e as cobranças. O fluxo de "Primeiro Acesso" por código
(`app/(auth)/login.tsx:104-156`) existe e é bom, mas é **opcional**: a credencial
previsível continua válida.

---

### 11. [GRAVE] `/transaction/pix|credit/*` não checa dono da transação nem tipo do token
**Novo.** · CONFIRMADO

`transaction.controller.ts:148-195` — os três handlers só fazem
`clientId: userId`, sem `assertClientToken` (que existe e é usado no controller de
fatura, `invoice.controller.ts:120-126`) e sem verificar que a transação é do
cliente. No service, `pix()` (`transaction.service.ts:206-316`),
`existingCreditCard()` (`:318-382`) e `newCreditCard()` (`:384-453`) validam o dono
**do cartão** (`:348`) mas **nunca** o dono da transação.

**Na prática:** com um `transactionId` qualquer, um cliente autenticado gera PIX de
cobrança alheia e, pagando, marca a movimentação de outro como `PAID`
(`:376-379`). Não é roubo de dinheiro, é corrupção do financeiro da clínica por
qualquer usuário do app. O caminho de fatura tem a guarda certa
(`invoice.service.ts:381-382, 436-437, 492-493`) — o de movimentação não.

Adjacente, na mesma família: a guarda da fatura é
`if (invoice.clientId && invoice.clientId !== clientId)` — fatura **sem** cliente
vinculado (o campo é opcional) pode ser paga e marcada como paga por qualquer cliente.

---

### 12. [GRAVE] Logs de debug de pagamento em produção (app e API)
**Já constava — continua aberto.** · CONFIRMADO

App: `InvoicePaymentSheet.tsx:271-277, 300-306, 323-328, 333-337, 340-347, 353,
356-359, 375-380, 390-394, 402, 752-771` — inclusive `body: res.body` (linha 336),
que carrega o payload PIX copia-e-cola, e o preview do QR em base64.
`babel.config.js` **não** tem `transform-remove-console`, então tudo isso sobrevive
no build de release e sai no logcat/Console do dispositivo.

API: `transaction.service.ts:212, 221-228, 239-243, 248, 257, 265-269, 284-290,
292-296, 305-308` e `:332-341, 398-405` — logam `clientId`, `transactionId`,
`walletId` da clínica e o `paymentId` do Asaas em `console.log` de produção. Os
próprios comentários ainda dizem "remover depois que o bug for resolvido".

---

### 13. [MENOR] A tela de pagamento é a única sem a camada de tradução de erro
CONFIRMADO

O app **tem** `lib/api-error.ts` (`getApiErrorMessage`, com máscara de 5xx e mapa por
`code`) e todas as telas o usam — login, signup, forgot-password, profile, notes,
cadastro de animal. A exceção é justamente o sheet de pagamento:
`InvoicePaymentSheet.tsx:369, 441, 549`

```ts
const msg = (res.body as { message?: string })?.message ?? "Erro ao processar pagamento";
```

Mensagem crua da API direto no toast. Hoje o risco é baixo (a API responde em PT e
mascara 500 via `all-exceptions.filter.ts`), mas um erro de `class-validator` chega
como **array** e o texto sai emendado.

---

### 14. [MENOR] Ficha do animal aberta por deep link mostra "Animal não encontrado"
**Novo.** · CONFIRMADO

`app/(animal)/[id].tsx:63` chama `GetAPI(ApiRoutes.Animal.byId(id))`, que é
`/animal/{uuid}` — e no Nest essa rota casa com `@Get(':code')`
(`animal.controller.ts:193-200`), que busca por `findByCode`, não por id. Um uuid
nunca é um `code`, então volta 404. Além disso o corpo é `{ animal: {...} }` e a tela
faz `mapAnimal(res.body)` (lê `body.id`, que não existe).

Não aparece no uso normal porque a lista grava o animal no `AnimalContext` antes de
navegar (`(tabs)/animals.tsx:100`, `(tabs)/index.tsx:176`) e a tela usa esse atalho
(`[id].tsx:56-60`). Quebra em deep link, em reabertura da rota e se o contexto for
perdido. A rota certa existe e não é usada: `GET /animal/by-id/:id`.

---

### 15. [MENOR] Fatura cancelada aparece como "Pendente"
CONFIRMADO

`ClientInvoicePresenter.toHTTP` (`clientInvoice.presenter.ts:51-59`) monta a parcela
sintética com `status: invoice.status === 'PAID' ? 'PAID' : 'PENDING'` — uma fatura
`CANCELED` chega ao app como pendente, com `payable: false` (`:23-25`), então o
proprietário vê uma dívida cancelada com o aviso "O pagamento ainda não está
disponível. Entre em contato com o estabelecimento."
(`InvoicePaymentSheet.tsx:658-664`).

---

### O que verifiquei e está CERTO (para não gerar retrabalho)

- **Isolamento do portal do proprietário** (`clientPortal.service.ts:56-63`):
  `assertOwnsAnimal` por `clientId` em toda leitura e escrita — anotações e
  prescrições compartilhadas estão corretamente isoladas, inclusive na edição
  (`:164`) e exclusão (`:183`).
- **Ficha clínica não é exposta ao app** — o comentário em `api-routes.ts:110-117`
  bate com o código.
- **Recuperação de senha:** o código **não volta mais** no corpo da resposta
  (`RecoverClientPasswordCode.service.ts:69-73`), é gerado com CSPRNG
  (`generateRandomString.ts:14-22`), tem throttle de 5/min no controller inteiro
  (`recoverClientPasswordCode.controller.ts:18-19`) e falha de e-mail vira 503 com
  mensagem em PT (`:83-88`). O S2 da auditoria antiga está fechado.
- **Login** tem throttle de 10/min e resposta idêntica para e-mail inexistente e
  senha errada (`client.controller.ts:139-140`, `client.service.ts:255-257`).
- **Paginação do financeiro** foi resolvida de verdade em `lib/client-finances.ts`,
  com teto de páginas e aviso de truncamento na tela (`finances.tsx:92-99`).
- **Isolamento de `/client-payment` e `/client-invoice`:** filtram por `clientId` do
  token (`prismaPayment.repository.ts:197-207`, `clientInvoice.controller.ts:51-55`)
  e barram token que não seja de cliente.
- **Cartões salvos** são isolados por cliente (`creditCard.controller.ts:24-29`) e o
  pagamento valida o dono do cartão (`invoice.service.ts:433`,
  `transaction.service.ts:348`).
- **Validação do formulário de cartão novo** foi implementada (mês, ano, combinação
  mês/ano, comprimento do PAN, e-mail, CPF/CNPJ com dígito verificador) —
  `InvoicePaymentSheet.tsx:155-196, 494-516` + `lib/card-validation.ts`.
- **Descrição/itens da fatura** chegam e são exibidos (`InvoiceItems.tsx` +
  `clientInvoice.presenter.ts:31`). *Ressalva:* isso só vale para **faturas**; o
  model `Payment` não tem coluna `description` (`schema.prisma:569-609`) e o
  `PaymentDetailsPresenter` não expõe nenhuma — para movimentações o proprietário vê
  só o nome e a categoria.
- **Anexos** foram corrigidos no app: `pickAttachments` faz `split("\n")` no formato
  legado e `openAttachment` não tem mais catch vazio (`AttachmentChip.tsx:53-59,
  231-269`).

---

## Dúvidas em aberto

1. **Quantos atendimentos reais misturam animais de proprietários diferentes?**
   O achado 2 é certo no código; o volume do vazamento depende do dado de produção.
   Uma query em `AppointmentAnimal` agrupada por `appointmentId` com `count(distinct
   animal.clientId) > 1` responde em um minuto.
2. **O build de produção realmente usa o `.env` do repositório?** Não sei como o APK
   atual foi gerado (pode ter sido com a linha de produção descomentada localmente).
   Precisa ser confirmado com quem faz o build — é a diferença entre "app morto" e
   "nada a fazer".
3. **Quanto já foi cobrado com cartão salvo sem split?** Só o painel do Asaas responde
   (filtrar `billingType: CREDIT_CARD` e conferir os repasses).
4. **Proprietário sem CPF consegue pagar?** No código, não: sem `cpf` o cliente nasce
   sem `paymentId` (`client.service.ts:79-89`) e todo pagamento morre em
   *"Cliente não possui cadastro de pagamento"* (`invoice.service.ts:390-395`).
   Não sei que fração da base está nessa situação.
5. **Protocolos sanitários** (`GET /sanitary-protocol`, chamado pelo hub de Saúde):
   não rastreei o filtro por empresa. Se seguir o padrão dos outros, provavelmente
   cai no mesmo 403 do achado 1 — mas não fechei o caminho, então não afirmo.
