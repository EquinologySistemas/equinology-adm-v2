# B1 — Persona "Equipe Equinology" (painel ADM)

Auditoria de leitura de código, ADM ↔ API (controllers `admin/*`). Nenhum arquivo de produção foi alterado.
Data: 02/08/2026 · ADM em `main`, HEAD `9d90c5d`.

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado, arquivo por arquivo (lido, não inferido)

**ADM (10 telas, todas as do menu):**
`src/middleware.ts`, `src/lib/auth-cookies.ts`, `src/context/ApiContext.tsx`, `src/lib/utils.ts`,
`src/lib/plans-api.ts`, `src/lib/coupons-api.ts`, `src/components/ui/Pagination.tsx`,
`src/components/layout/Header.tsx`, `src/components/layout/Sidebar.tsx`, `src/app/login/page.tsx`,
`(private)/page.tsx` (dashboard), `(private)/companies/page.tsx` + `CompanyCreateModal` + `CompanyDetailModal`,
`(private)/users/page.tsx` + `UserCreateModal`, `(private)/plans/page.tsx` + `PlansForm` + `PlanCreateModal` + `PlanDetailModal`,
`(private)/coupons/page.tsx` + `CouponsForm`, `(private)/subscriptions/page.tsx` + `SubscriptionCreateModal` + `SubscriptionDetailModal`,
`(private)/financial/page.tsx`, `(private)/admins/page.tsx`, `(private)/ads/page.tsx`, `(private)/tutorials/page.tsx`.

**API (lado admin):**
todos os 12 controllers de `src/infra/http/controllers/admin/` (guards, rotas, DTOs),
`admin-auth.guard.ts`, `admin-super-admin.guard.ts`, `auth.module.ts`,
`adminAuth.service.ts`, `adminSignature.service.ts`, `adminFinancial.service.ts`,
`adminUserManagement.service.ts`, `adminCompanyCreate.service.ts`, `adminCompanyUpdate.service.ts`,
`coupon.service.ts`, `signaturePlan.service.ts`, `companyUserLimit.service.ts`, `signatureAccess.ts`,
`error.handler.ts`, `main.ts` (ValidationPipe/ExceptionFilter),
`prismaCompanySignature.repository.ts` (listForAdmin / fetchActiveWithPlans / fetchByStatusWithPlans),
`companySignature.service.ts` (trecho do webhook `signatureValidation`), presenters de plano/anúncio/empresa/financeiro.

### NÃO verificado (declarado, não presumido)

- **Não executei nada.** Sem build, sem chamada HTTP, sem banco. Tudo é leitura de código.
- **`AdsForm.tsx` e `LocationTargeting.tsx`** — li só a página `ads/page.tsx`. Os achados de anúncio abaixo se limitam ao que está na página.
- **`TutorialsForm.tsx`**, `AdminCreateModal`, `AdminDetailModal`, `UserDetailModal`, `CouponCreateModal`, `CouponEditModal`, `TransactionDetailModal` — li apenas os pontos de chamada (grep de `PostAPI/PutAPI/PatchAPI/status`), não o JSX completo.
- **Camada Asaas** (`asaas.ts`, `subscription.ts`, `undefinedPayment.ts`) — não abri. Onde cito comportamento do gateway (ordem de `getSubscriptionPayments`, formato de `dueDate`) está marcado como SUSPEITO.
- **Estado do banco de produção** — quantas empresas/assinaturas existem hoje. Isso decide se os tetos de 10/20 registros já estão doendo ou vão doer semana que vem.
- **DataTable.tsx** (ordenação) e componentes de UI puros.
- **Odontograma v2 / anotações / anexos / voz** — não tocam este bloco.

---

## Veredito

**funciona_com_ressalva, tendendo a "não confie no Financeiro".**

A equipe **consegue** operar uma venda de ponta a ponta hoje: criar empresa → criar usuário → criar assinatura → obter link de pagamento → o webhook ativa. Mas com três pedras no caminho:

1. Na assinatura **mensal** o link de pagamento **não é devolvido** pela API e a modal não mostra nada. O caminho que funciona é clicar no botão **"Recibo"** (nome errado) ou em "Gerar cobrança" — e "Gerar cobrança" cria uma **segunda cobrança avulsa** fora da recorrência.
2. A tela **Financeiro é factualmente errada**: "Pago em" mostra o vencimento, "Receita do mês" soma vencimentos de assinaturas hoje ativas (não o que o gateway confirmou), e a tabela **nunca mostra mais de 10 linhas**.
3. **Nenhuma** correção da auditoria anterior foi aplicada no repo ADM — confirmado abaixo.

### Tamanho do buraco do ADM (pergunta explícita do briefing)

Confirmado: **o repo ADM não recebeu nenhuma correção**. `git log --oneline` (HEAD `9d90c5d`) mostra que o último commit funcional do ADM é `9647fb5` (`refactor(LocationTargeting)`), anterior à auditoria; depois só entraram `1d8189d` (tutoriais, feature nova) e commits de merge/documentação. Reverifiquei um a um os 14 itens que o `STATUS-VERIFICADO.md` listava como abertos no ADM: **13 continuam exatamente como descritos** (ApiContext sem optional chaining, "Pago em", datas UTC, expirationDate, cupom com 0, preço em centavos, plano sem preço, empresa/plano pré-selecionados, `defaultMessage` nos anúncios, sem validação de imagem, sem olhinho, `confirm()` nativo, `<button>` aninhado). O único que mudou é o **plano sem preço**: o zod do ADM continua opcional (`PlansForm.tsx:13-14`), mas a API passou a exigir (`adminPlan.dto.ts:29-36`), então hoje o efeito é um 400 e não um plano de graça.

O que **melhorou** foi do lado da API, não do ADM: limite de usuários agora é validado no `POST /admin/users` e na troca de empresa (`adminUserManagement.service.ts:43,75`), há `ExceptionFilter` global e tradução do ValidationPipe (`main.ts:20-36`), mensagens dos guards em PT, e `expirationDate` com `@IsDateString({strict:true})`.

---

## Achados

### (a) Autenticação e permissão

#### A1 · GRAVE · Admin desativado continua operando o painel até o token vencer (90 dias)
`AdminAuthGuard` valida assinatura e `payload.type === 'admin'` e **nunca consulta o banco** — não checa `admin.active`:
```ts
// api:src/infra/shared/auth/admin-auth.guard.ts:40-46
if (payload.type !== 'admin') { throw new UnauthorizedException(...) }
request.adminUserId = payload.sub;
```
O login recusa inativo (`adminAuth.service.ts:29`) e o `AdminSuperAdminGuard` checa `admin?.active` (`admin-super-admin.guard.ts:20`) — mas quem já está logado não passa mais por nenhum dos dois. O token é emitido com `expiresIn: '90d'` (`auth.module.ts:14`). **Desativar um administrador não o expulsa: ele segue criando empresas, assinaturas, cupons e cancelando assinaturas por até 90 dias.** Não há revogação/blacklist no projeto.
*Novo (não constava na auditoria anterior).*

#### A2 · GRAVE · "Admin comum" e "super admin" são a mesma coisa em tudo que importa comercialmente
`AdminSuperAdminGuard` está aplicado em **exatamente dois handlers**: `adminPanelAccounts.controller.ts:30` (criar admin) e `:47` (editar admin). Todos os outros controllers usam só `AdminAuthGuard`: empresas (`adminCompany.controller.ts:15`), usuários (`adminUser.controller.ts:11`), planos (`adminPlan.controller.ts:10`), cupons (`adminCoupon.controller.ts:11`), assinaturas (`adminSignature.controller.ts:16`), financeiro (`adminFinancial.controller.ts:18`), anúncios, tutoriais. Um admin de "suporte" **cria e apaga plano, cria e cancela assinatura, altera validade, gera cobrança, muda o walletId de qualquer clínica e lê todo o financeiro**. O ADM sequer esconde os botões: só a tela de Administradores consulta `role` (`admins/page.tsx:77`).
Se isso é intencional ("todo mundo do time é operador"), então o papel `support` é decorativo — mas o dono precisa saber que ele não protege nada.
*Novo.*

#### A3 · MENOR · Login do ADM sem olhinho na senha
`adm:src/app/login/page.tsx:94-104` — `type="password"` fixo; `AuthInput.tsx` não tem `Eye/EyeOff`. *Já constava (STATUS-VERIFICADO, "ADM: login sem olhinho") — permanece.*

#### A4 · MENOR · Cookie de token gravado no client, sem httpOnly, 90 dias
`adm:src/lib/auth-cookies.ts:8-23` — `cookies.set(...)` no client, `secure` só em produção, expiração 90 dias com "Lembrar de mim" (7 sem). Qualquer XSS no painel entrega uma sessão administrativa de 90 dias. É o padrão do projeto inteiro; registro aqui como risco, não como regressão.

---

### (b) Empresas e usuários

#### B1 · GRAVE · Tela de Usuários inventa 4 clientes falsos quando a API falha — sem nenhum aviso
```ts
// adm:src/app/(private)/users/page.tsx:98-101
} else {
  setUsers(FALLBACK_USERS);
}
```
`FALLBACK_USERS` (linhas 16-57) são "Maria Silva / Haras Silva", "João Santos / EquiClinic", "Ana Oliveira / VetEquus", "Carlos Mendes". A tela de Administradores faz o mesmo mas **acende o `MockIndicator`** (`admins/page.tsx:92,200`); a de Usuários **não tem MockIndicator nenhum** (grep: o componente só é importado em `admins/page.tsx`). Resultado: com a API fora do ar ou um 500, o painel exibe clientes fictícios como se fossem base real.
*Novo.*

#### B2 · MENOR · Não dá para limpar walletId, CNPJ vazio à parte, nem endereço da empresa
`adm:CompanyDetailModal.tsx:88-93` envia `walletId: data.walletId?.trim() || undefined` (idem address/number/postalCode), e o service só aplica o que não é `undefined`:
```ts
// api:adminCompanyUpdate.service.ts:41
if (walletId !== undefined) company.walletId = walletId;
```
Apagar o campo e salvar mostra sucesso e **mantém o valor antigo**. Para o walletId isso é dinheiro: é a carteira que recebe o repasse da clínica; um walletId errado só pode ser sobrescrito, nunca removido. O CNPJ é a única exceção tratada (envia `null` explícito).
*Novo.* — o walletId também não tem validação de formato em lugar nenhum do ADM nem do DTO.

#### B3 · MENOR · O `code` da empresa nunca aparece no painel
`CompanyPresenter.toHTTP` devolve `code` (`api:company.presenter.ts:8`) e `companies/page.tsx:20` até normaliza o campo, mas nem a tabela nem o `CompanyDetailModal` o exibem (grep por "code" no modal: zero). É o código que a clínica usa para convidar colaboradores — a equipe não consegue passá-lo por telefone.

#### B4 · (verificado, OK) Limite de plano é respeitado na criação e na movimentação de usuário
`adminUserManagement.service.ts:43` (`checkCanAddUser`) e `:75` (troca de empresa, com `ignoreUserId`). `companyUserLimit.service.ts:44-66` escolhe a assinatura vigente de forma determinística. **Corrigido desde a auditoria anterior.** Ressalva honesta: `checkCanAddUser` retorna `null` quando não há assinatura vigente (`:110`) — empresa recém-criada pelo ADM, que ainda não tem assinatura, aceita usuários sem limite. Está documentado como decisão no próprio código.

---

### (c) Planos

#### C1 · MENOR · Criar plano sem preço: hoje dá 400 (não cria plano de graça)
O zod do ADM segue com preço opcional (`PlansForm.tsx:12-14`: `priceCardCents/pricePixCents .optional()`), mas o DTO da API exige (`adminPlan.dto.ts:29-36`: `@IsNumber() @IsNotEmpty()`). Então o formulário deixa submeter e o usuário leva um 400. O erro chega como **array de strings** (`main.ts:23-29` devolve `message: string[]`) e o `PlanCreateModal.tsx:52-55` faz `res.body?.message`, jogando o array direto num `<p>` e num `toast.error` → as mensagens saem coladas, sem separador ("O campo X é obrigatórioO campo Y..."). *Status anterior ("permite criar plano sem preço") está desatualizado: a API fechou o buraco; falta o zod e o tratamento do array.*

#### C2 · MENOR · Preço em centavos e backspace preso em "0,00"
`PlansForm.tsx:157-168` (cartão) e `:185-198` (PIX) usam `parsePriceToCents` (`lib/utils.ts:65-68`: só dígitos, interpretados como centavos). Digitar `150` vira **R$ 1,50** — o campo mostra o valor formatado enquanto digita, então é visível, mas contra-intuitivo. Backspace em "0,00" → "0,0" → dígitos "00" → 0 → volta a "0,00": só sai com select-all + delete. *Já constava — permanece intocado.*

#### C3 · MENOR · Editar plano não permite zerar/limpar preço, e não há checagem de nome duplicado
`PlansForm.tsx:92-99` só inclui `priceCard/pricePix` no payload quando o campo tem valor; o service ignora `undefined` (`signaturePlan.service.ts:83-84`). E `create`/`edit` não checam nome repetido; `schema.prisma` não tem `@unique` em `SignaturePlan.name`. Dois planos "Profissional" com preços diferentes convivem, e a tela de Assinaturas mostra só o nome.

#### C4 · MENOR · Dashboard conta "Planos ativos" errado — conta todos
```ts
// adm:src/app/(private)/page.tsx:225-227
const activePlans = plansList.filter((p: { active?: boolean }) => p.active !== false);
```
A API devolve `isActive`, não `active` (`api:signaturePlan.presenter.ts:14`) — `p.active` é sempre `undefined`, `undefined !== false` é `true`, **todo plano conta como ativo**. O mesmo padrão para anúncios funciona por acaso, porque o presenter de anúncio expõe um alias `active` (`advertisement.presenter.ts:11`).
*Novo.*

#### C5 · (verificado, OK) Excluir plano com assinatura vinculada
`signaturePlan.service.ts:105-114` conta assinaturas e devolve `ValidationError` em PT com o número. Não gera mais 500.

---

### (d) Assinaturas

#### D1 · BLOQUEIA_LANCAMENTO · A validade que o admin escolhe é gravada e exibida um dia antes
```ts
// adm:SubscriptionDetailModal.tsx:222-223
if (editExpiration) payload.expirationDate = new Date(editExpiration).toISOString();
```
`new Date("2026-08-10")` = `2026-08-10T00:00:00.000Z` = **09/08 às 21:00 BRT**. E a exibição na mesma modal (`:296-299`, `new Date(...).toLocaleDateString("pt-BR")`) converte de volta para o fuso local → mostra **09/08**, enquanto o `<input type="date">` logo abaixo (`:208-211`, `toISOString().slice(0,10)`) mostra **10/08**. A mesma modal se contradiz.
Efeito prático: o gate de acesso usa `isSignatureValidForAccess` comparando `now <= expirationDate` (`api:signatureAccess.ts:53`) — a clínica **perde o acesso às 21h do dia anterior ao combinado**. Em cima disso, `saveUpdate` reenvia `expirationDate` **sempre que o campo está preenchido** (`:222`), mesmo sem o admin ter mexido nele: abrir a modal, trocar só o status e salvar já reescreve a validade com o corte deslocado.
*Já constava (dois itens do STATUS-VERIFICADO) — 100% intocado.*

#### D2 · GRAVE · Assinatura mensal criada pelo admin não devolve link de pagamento
```ts
// api:adminSignature.service.ts:209
return right({ signature: companySignature });   // ramo mensal: sem invoiceUrl
```
O ramo anual devolve `invoiceUrl` (`:160-163`); o mensal, não. A modal do ADM só mostra o painel de link quando `res.body?.invoiceUrl` existe (`SubscriptionCreateModal.tsx:100-106`) — no mensal ela fecha com "Assinatura criada." e **o admin fica sem nada para mandar ao cliente**. A assinatura nasce `INACTIVE` com `paymentId: 'sub_pending'` (`:193-194`).
Saídas existentes, ambas ruins: (a) o botão **"Recibo"** (`SubscriptionDetailModal.tsx:416-422`) é que busca o pagamento da recorrência e abre a URL (`adminSignature.service.ts:340-348`) — nome errado para a função certa; (b) **"Gerar cobrança"** (`charge`, `:275-299`) cria uma **cobrança avulsa nova no Asaas, fora da assinatura**, e sobrescreve `signature.paymentId` — o cliente pode receber duas cobranças pelo mesmo mês.
*Novo.*

#### D3 · GRAVE · "Trocar plano" cancela a recorrência e não cria outra — o cliente para de ser cobrado
```ts
// api:adminSignature.service.ts:261-271
if (subId) { const cancelResult = await this.subscription.cancelSubscription(subId); ... }
signature.signaturePlanId = planId;
signature.asaasSubscriptionId = null;
signature.paymentId = 'sub_pending';
signature.isAutoRenewActivated = false;
```
Nenhum `createSubscription` depois. O status e a `expirationDate` ficam como estavam — então a clínica continua com acesso até a data antiga e **nunca mais é cobrada**, silenciosamente. O ADM mostra "Plano alterado." (`SubscriptionDetailModal.tsx:153`).
*Novo.*

#### D4 · GRAVE · "Reativar" e "Renovar anual" criam uma assinatura NOVA; a antiga fica no banco e na lista
`reactivate` (`:234-243`) e `renewYearly` (`:245-254`) chamam `adminCreate`, que sempre faz `CompanySignature.create(...)`. Não há atualização da linha existente nem checagem de assinatura vigente em `adminCreate` (`:52-96`). Consequências:
- a lista de Assinaturas do ADM passa a mostrar **várias linhas da mesma clínica** com status diferentes, sem indicar qual vale (`subscriptions/page.tsx` não agrupa nem filtra);
- criar trial pelo ADM não bloqueia trial repetido — dá para encadear trials pela modal (`isTrial` em `adminCreate:78-96` não consulta histórico);
- qual assinatura governa o acesso e o limite de usuários é resolvido depois, por heurística, em `companyUserLimit.service.ts:60-65`.
*Novo (relacionado ao L1 antigo, mas a causa aqui é o admin criando duplicatas).*

#### D5 · GRAVE · Cupom marcado na criação de trial é validado e depois jogado fora
Em `adminCreate`, o cupom é buscado e validado antes do `if (isTrial)` (`:64-76`), mas o ramo do trial (`:78-96`) **não aplica desconto nenhum e não chama `incrementUsage()`**. O admin escolhe o cupom na modal (`SubscriptionCreateModal.tsx:231-245`), recebe "Assinatura criada" e o cupom simplesmente não existiu — nem no valor, nem na contagem de usos.
*Novo.*

#### D6 · GRAVE · A lista de Assinaturas mostra no máximo 20, sem paginação e sem aviso
`subscriptions/page.tsx:49` chama `GetAPI("/admin/signature")` sem `page`/`pageSize`; o controller assume `pageSize = 20` (`adminSignature.controller.ts:32`); o campo `total` devolvido (`:46`) **é descartado** — `normalizeSubscription` não o lê e a página pagina em cima do array local (`:80-83`) com `PAGE_SIZE = 20`. Como `Pagination` some quando há uma página só (`Pagination.tsx:25`: `if (totalPages <= 1) return null`), a partir da 21ª assinatura o painel **esconde as demais sem nenhum indício**. A busca (`:67-77`) filtra apenas as 20 baixadas. Não há filtro por status nem por empresa na tela, embora a API aceite ambos.
*Novo.*

#### D7 · MENOR · Modal "Nova assinatura" pré-seleciona a primeira empresa e o primeiro plano
`SubscriptionCreateModal.tsx:57` (`if (arr.length) setCompanyId(arr[0].id)`) e `:66` (idem plano). O `<option value="">Selecione</option>` existe mas nunca fica selecionado: abrir e submeter cria assinatura para a primeira empresa da lista. *Já constava — intocado.*

#### D8 · MENOR · `status` da assinatura não é validado por enum no PATCH
`adminSignature.dto.ts:30-33` — `@IsOptional() @IsString() status?: 'ACTIVE' | 'INACTIVE'`. O tipo é só TypeScript; qualquer string passa e vai direto para `signature.status = data.status` (`adminSignature.service.ts:216`). Hoje o ADM só manda ACTIVE/INACTIVE, então não dispara pela tela — mas a defesa não existe. Também não há como o admin devolver uma assinatura para `TRIAL` (o `<select>` só tem duas opções, `:334-336`, e o estado inicial converte TRIAL em ACTIVE, `:203-207`).

#### D9 · SUSPEITO · Ação de assinatura copia o link para a área de transferência e nunca o mostra
`SubscriptionDetailModal.tsx:92-96` e `:133-135`: `navigator.clipboard.writeText(...)` + toast "Link copiado", sem exibir a URL nem tratar rejeição. Fora de contexto seguro (HTTP) ou sem permissão, a `Promise` rejeita sem `catch` e **o link se perde** — o toast de sucesso já apareceu. Marco SUSPEITO porque depende do ambiente de deploy (HTTPS resolve).

---

### (e) Financeiro do ADM — de onde vem cada número

Rastreamento completo: `financial/page.tsx` → `GET /admin/financial/{summary,transactions}` → `adminFinancial.controller.ts` → `adminFinancial.service.ts` → `adminSignatureService.history()` → Asaas → presenter → tabela.

#### E1 · BLOQUEIA_LANCAMENTO · A coluna "Pago em" mostra a data de VENCIMENTO, não a de pagamento
```ts
// api:adminFinancial.service.ts:126-128
const dueDate = payment.dueDate ? moment(payment.dueDate) : null;
const paymentDate = payment.status === 'PAID' || payment.status === 'RECEIVED' ? dueDate : null;
```
`paymentDate` é literalmente `dueDate`. O presenter repassa (`adminFinancial.presenter.ts:26`) e a tela imprime sob o rótulo **"Pago em"** (`financial/page.tsx:204-215`). A interface `PaymentHistoryItem` (`:6-11`) nem tem campo de data real de pagamento, e `history()` (`adminSignature.service.ts:308-314`) só copia `id/value/dueDate/status` do Asaas — o `paymentDate`/`confirmedDate` do gateway **nunca é lido**. Cliente que pagou com 20 dias de atraso aparece como pago no dia do vencimento. *Já constava — intocado.*

#### E2 · BLOQUEIA_LANCAMENTO · A tabela do Financeiro nunca mostra mais de 10 transações
`financial/page.tsx:60` chama `GetAPI("/admin/financial/transactions")` **sem `page` nem `pageSize`**; o service assume `pageSize = 10` (`adminFinancial.service.ts:94` — note que o DTO documenta `default: 20`, `adminFinancial.dto.ts:47`). O `total` devolvido é ignorado; a página pagina localmente com `PAGE_SIZE = 20` sobre os 10 itens (`:122-125`), e `Pagination` não renderiza com uma página só. Não existe nenhum filtro de período na tela — só um campo de busca que filtra as 10 linhas já baixadas (`:109-119`). **O admin não tem como auditar o que foi recebido.**
*Novo.*

#### E3 · BLOQUEIA_LANCAMENTO · "Receita do mês" não é receita: é soma de vencimentos de quem está ativo agora
`getPaymentsForPeriod` (`adminFinancial.service.ts:175-210`) itera **só** `fetchActiveWithPlans()`, que no Prisma é `status: 'ACTIVE'` **e** `expirationDate >= now` (`prismaCompanySignature.repository.ts:203-215`). Depois filtra por `dueDate` dentro do mês (`:198-199`) e soma o que está `PAID/RECEIVED` (`:66-68`). Consequências, todas confirmadas no código:
- **cliente que pagou este mês e depois cancelou (INACTIVE) some da receita**;
- **assinatura vencida some**, mesmo tendo pago dentro do mês;
- o recorte é por **vencimento**, não por data de pagamento — pagamento atrasado cai no mês errado;
- **pagamento anual/PIX avulso nunca entra**: nesse caminho `history()` devolve `dueDate: ''` (`adminSignature.service.ts:325-332`) e o laço descarta com `if (!payment.dueDate) continue` (`:196`).
O card ainda vem rotulado "Pagamentos confirmados no mês corrente" (`adm:(private)/page.tsx:316-318`), o que é falso.
*Novo.*

#### E4 · GRAVE · "Em Trial" conta trials expirados; "Assinaturas ativas" não conta ACTIVE expiradas — os dois cards discordam da lista
`getFinancialSummary` usa `fetchByStatusWithPlans('TRIAL')` (`:58`), que **não filtra expiração** (`repository:227-247`), enquanto `activeSubscriptions` usa `fetchActiveWithPlans()`, que filtra. Já a tela de Assinaturas lista tudo por status cru (`listForAdmin`, sem filtro de data). Mesmo cliente, três números diferentes em três lugares.
*Novo.*

#### E5 · GRAVE · Cada carga do Financeiro dispara uma chamada ao Asaas por assinatura, em série
`getSubscriptionTransactions` busca até **10 000** assinaturas (`:107-111`, `pageSize: 10000`) e faz `await this.adminSignatureService.history(signature.id)` **dentro do `for`** (`:120`) — cada `history()` é um GET no Asaas (`adminSignature.service.ts:306`). `getFinancialSummary` repete o padrão duas vezes (mês atual e anterior, `:62` e `:72`, cada um percorrendo todas as ativas). O dashboard (`adm:(private)/page.tsx:149-159`) chama summary + transactions juntos, no `Promise.all` com mais 7 requisições. Com N clínicas, são ~3N chamadas HTTP sequenciais ao gateway por abertura de tela. *O custo em segundos é inferência (SUSPEITO); o N+1 sequencial é CONFIRMADO no código.*

---

### (f) Cupons e anúncios

#### F1 · MENOR · Cupom abre com valor 0, que o próprio schema rejeita
`CouponsForm.tsx:63-73` (`defaultValuesFromCoupon` no ramo de criação) devolve `value: 0`, e o `superRefine` (`:44-58`) exige `> 0`. O default oferecido é inválido por construção. *Já constava — intocado.*

#### F2 · MENOR · Validade do cupom desliza 3 horas
O ADM manda `"YYYY-MM-DD"` (`coupons-api.ts:92-93`) e a API monta `new Date(\`${d}T00:00:00.000Z\`)` / `T23:59:59.999Z` (`coupon.service.ts:50-51`). Em BRT o cupom passa a valer às 21h do dia anterior e expira às 20h59 do dia final. Não impede a venda; distorce campanhas de 1 dia.

#### F3 · GRAVE · Erro de validação em Anúncios vira toast "undefined, undefined"
```ts
// adm:src/app/(private)/ads/page.tsx:105 e :143
: Array.isArray(res.body?.message)
  ? res.body.message.map((m: { defaultMessage?: string }) => m.defaultMessage).join(", ")
```
`main.ts:23-29` devolve `message` como **array de strings**; mapear `.defaultMessage` sobre string dá `undefined`. Toda falha de validação de anúncio some e vira "undefined, undefined". *Já constava — intocado.* **Novo agravante:** a mesma função em Tutoriais (`tutorials/page.tsx:24-35`) tem `.filter(Boolean)`, então o resultado é string vazia — `toast.error("")`, um toast em branco.

#### F4 · MENOR · Anúncio sem validação de tamanho de imagem no ADM
`AdsForm.tsx:127-145` só checa `file.type.startsWith("image/")`. A API tem `MaxFileSizeValidator` (`adminAds.controller.ts:30`) e checa mimetype (`:53-55`), então o upload grande falha lá — com mensagem que cai no F3 acima. *Já constava.*

---

### (g) Tratamento de erro do ADM

#### G1 · GRAVE · Backend fora do ar trava a tela em "carregando", para sempre
```ts
// adm:src/context/ApiContext.tsx:118-122 (GetAPI; idêntico em PutAPI :141-145, PatchAPI :164-168, DeleteAPI :187-191)
.catch((err) => {
  const message = err.response.data;
  const status = err.response.status;
```
Em erro de rede/CORS/timeout o axios não popula `err.response` → `TypeError` **dentro do catch** → a promise de `GetAPI` rejeita. Quase nenhum chamador tem `try/catch`: `subscriptions/page.tsx:47-61`, `companies/page.tsx:43-57`, `plans/page.tsx:35-48`, `coupons`, `ads`, `admins/page.tsx:69-95` chamam `setLoading(false)` **depois** do `await` — a linha nunca roda e a tela fica em esqueleto/spinner indefinidamente, sem toast. Só o `PostAPI` (`:93-99`) tem o optional chaining e o fallback "Não foi possível conectar ao servidor.", e só o dashboard (`(private)/page.tsx:241`) tem `catch`. *Já constava — intocado.*

#### G2 · GRAVE · Erros de validação (array) chegam colados ou como toast vazio
Herança do formato `message: string[]` do `ValidationPipe` (`api:main.ts:23-29`). Os pontos que fazem `res.body?.message` direto num `<p>`/`toast`: `PlanCreateModal.tsx:52-55`, `PlanDetailModal.tsx:55-58`, `CompanyCreateModal.tsx:103-107`, `CompanyDetailModal.tsx:107-111`, `UserCreateModal.tsx:109-113`, `SubscriptionDetailModal.tsx:98,138,158`, `subscriptions`/`coupons` pages. Não existe no ADM nada equivalente ao `lib/api-error.ts` do WEB. O `login/page.tsx:45-50` é a única tela que trata (`body?.message?.[0]`).

#### G3 · MENOR · Toda exclusão usa `confirm()` nativo e algumas criações não dão feedback
`coupons/page.tsx:70`, `plans/page.tsx:55`, `ads/page.tsx:148`, `tutorials/page.tsx:108`, `admins/AdminDetailModal.tsx`, `subscriptions/SubscriptionDetailModal.tsx:106`. *Já constava.*

#### G4 · MENOR · Datas puras exibidas um dia antes em todo o painel
Não existe helper de data no ADM (grep por `formatDate` só acha `formatDateInput` local do AdsForm). Todos os pontos fazem `new Date(x).toLocaleDateString("pt-BR")` sobre ISO em meia-noite UTC: `financial/page.tsx:140,210`, `subscriptions/page.tsx:135,145`, `SubscriptionDetailModal.tsx:297,307,490`, `coupons-api.ts:66,69`, `companies/page.tsx:126`, `admins/page.tsx:166`. *Já constava — intocado.*

---

## Dúvidas em aberto

1. **Quantas empresas/assinaturas existem hoje em produção?** Decide se E2 (teto de 10 no Financeiro) e D6 (teto de 20 em Assinaturas) já estão escondendo cliente **hoje** ou daqui a algumas semanas. Não tenho acesso ao banco.
2. **Ordem de `getSubscriptionPayments` no Asaas.** O botão "Recibo" pega `payments.value[0]` (`adminSignature.service.ts:342`). Se o Asaas devolver do mais antigo para o mais novo, o "recibo" da 5ª mensalidade abre o link da 1ª. Não abri o cliente Asaas — SUSPEITO.
3. **`dueDate` vazio no ramo avulso.** `history()` devolve `dueDate: ''` porque `getPaymentInfo` aparentemente não expõe vencimento. Não confirmei a interface `UndefinedPayment`; se ela expuser, E3 tem correção barata.
4. **O webhook está configurado em produção?** Toda ativação de assinatura criada pelo ADM depende dele (`companySignature.service.ts:414+`). O checklist de runtime da auditoria anterior deixou isso em aberto e eu não tenho como verificar por código.
5. **O papel `support` deveria restringir alguma coisa?** (A2). É decisão de produto, não bug — mas hoje ele não restringe nada além de criar/editar outros admins.
6. **`SUBSCRIPTION_CREATED` ativa a assinatura antes do pagamento** (`companySignature.service.ts:484-493`: acha por `subscriptionId` e seta `ACTIVE`). Para a assinatura mensal criada pelo ADM isso significa acesso liberado assim que a recorrência é criada no Asaas, sem pagamento. Não classifiquei como achado do bloco 1 porque não consegui confirmar se esse evento está habilitado no painel do Asaas — mas se estiver, é dinheiro.
