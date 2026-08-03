# B7 — Segurança e isolamento multi-tenant

Auditoria de código, sem execução. Nenhum arquivo de produção foi alterado.
Repos na versão auditada: API `4dc4607`, WEB `2f6fea6`, ADM `9d90c5d`.

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado (li o arquivo)

**API — autenticação e guards**
- `auth.guard.ts` (global, `APP_GUARD` em `app.module.ts:28`), `admin-auth.guard.ts`,
  `admin-super-admin.guard.ts`, `role.guard.ts`, `vet-only.guard.ts`.
- Decorators `CurrentCompanyId`, `CurrentUserId`, `CurrentTokenType`, `IsPublic`.
- `main.ts` (pipes, filtro global, CORS, Swagger/Scalar), `app.module.ts`
  (Throttler não é global).
- Emissão de token: `client.service.ts` (auth/register/token), `auth.module.ts`
  (expiração).

**API — os 95 controllers**
- Varri **todos** os `*.controller.ts` extraindo guards de classe/rota e
  `@IsPublic()`. A tabela de guards está na seção (d).
- Li integralmente: `animal`, `animalNote`, `ownerNote`, `clientPortal`, `client`,
  `user`, `payment`, `clientPayment`, `clientInvoice`, `invoice`, `transaction`,
  `creditCard`, `appointment`, `appointmentAnimal`, `studFarm`, `sanitaryProtocol`,
  `file`, `generalTest`, `dentistryOdontogram`, `companySignature`,
  `publicAds`/`publicCoupon`/`publicTutorials`, `recoverPasswordCode`,
  `recoverClientPasswordCode`, `fieldStock`, `productUsage`.

**API — services (checagem de posse em edit/delete/fetch, não só create)**
- Rodei um levantamento em **todos os 51 services de `animal/services/**`**
  contando ocorrências de checagem de posse por CRUD, e abri manualmente os 8
  que destoaram (`vaccine`, `deworming`, `exam`, `shoeing`, `animalNote`,
  `sanitaryProtocol`, `dentistryOdontogram`, `reproductionDonorOvulation`).
- Abri `invoice`, `payment`, `transaction`, `transactionCategory`, `bankAccount`,
  `product`, `productCategory`, `productUsage`, `fieldStock`, `board`, `lead`,
  `note/animal`, `Tag`, `appointment`, `appointmentAnimal`, `studFarm`, `client`,
  `User`, `companySignature`, `clientPortal`, `clinicalRecordOwnership`.
- Repositórios: `prismaPayment` (`whereFilter` completo), `prismaRecoverPasswordCode`.

**WEB**
- `middleware.ts` (matcher inteiro), todas as rotas de `app/` (incluindo
  `app/api/**` e as páginas de demo), `lib/invoice-share.ts`, `lib/auth-cookies.ts`.

**ADM**
- `src/middleware.ts`, `src/lib/auth-cookies.ts`, `.env.example`.

**Segredos**
- `git ls-files` por arquivos `.env` nos 4 repos; conteúdo do que está versionado.
- Varredura de padrões de chave (`sk-`, `AKIA`, `$aact_`, `eyJ...`) em `src/`
  dos 4 repos.

### NÃO verificado (declarado, não presumido)

- **APP (Expo)**: não auditei o consumo das rotas no app do proprietário nesta
  passagem. Cobri o **lado servidor** das rotas que o app usa (`/client-portal`,
  `/client-payment`, `/client-invoice`, `/invoice/:id/pay/*`, `/transaction/*`,
  `/stud-farm/client`, `/animal`), que é onde a autorização acontece.
- **ADM (front)**: só o middleware e cookies. As ~30 telas do painel interno não
  foram revisadas para vazamento de dado entre empresas na renderização.
- **Odontograma v2 / anotações do proprietário / tabela de anexos / voz** — cobri
  o **backend** (`dentistryOdontogram.service`, `ownerNote.service`,
  `clientPortal.service`, `attachmentSync`, rotas `app/api/audio/*`). O front do
  odontograma v2 (~29 mil linhas novas) **não** foi lido.
- **Nada foi executado.** Não emiti um token de cliente real, não bati em
  endpoint, não confirmei se as credenciais vazadas ainda são válidas, nem se o
  repositório GitHub `EquinologySistemas/vetequus-api` é público ou privado.
  Os passos de exploração abaixo são derivados do código, não reproduzidos.
- Não auditei configuração de infra (WAF, bucket policy do R2, security group
  do RDS). O que digo sobre o R2 vem da URL `pub-*.r2.dev` no `.env` versionado.

---

## Veredito — **funciona_com_ressalva**, e a ressalva é grave

O trabalho de isolamento feito depois da auditoria anterior **fechou de fato** o
buraco maior (S1): as ~40 fichas clínicas agora validam posse no create, no edit,
no delete **e** no fetch; o token de cliente é barrado por `VetOnlyGuard`; o
código de reset não volta mais no corpo; cancel/refound de assinatura têm
checagem de empresa. Verifiquei um a um — não é declaração de documento, é o
código atual.

**Mas o sistema não está seguro para lançar**, por um motivo que nenhuma
auditoria anterior registrou: **o arquivo `.env.backup-antes-local` com as
credenciais de produção está versionado no Git**, incluindo o `JWT_SECRET`. Com
esse segredo, todo o isolamento multi-tenant acima vira decoração: qualquer
pessoa com acesso ao repositório assina um token com o `companyId` que quiser.

Além disso há três rotas Next públicas que gastam a chave de IA do dono e uma
delas é um SSRF de leitura arbitrária.

---

## Achados

### (a) AuthGuard — o que popula e o que NÃO garante

`src/infra/shared/auth/auth.guard.ts:38-40`
```ts
request.userId    = payload.sub;
request.companyId = payload.companyId;
request.tokenType = payload.type;
```

O guard **só valida a assinatura do JWT**. Ele não sabe se o `sub` é um usuário
de clínica ou um cliente, não consulta o banco, não verifica se a conta ainda
existe ou está ativa, e não valida se o `companyId` do token corresponde a
alguma empresa real. Tudo isso fica a cargo de cada service.

Fluxo de um request qualquer: `AuthGuard` (global) → guard de classe/rota
(`VetOnlyGuard` / `RoleGuard` / nenhum) → controller lê `@CurrentCompanyId()` →
service compara com o dono do registro → repositório.

Ponto positivo verificado: `AdminAuthGuard:41` **realmente** testa
`payload.type !== 'admin'` — não é mais a comparação morta com `'company'` que
existia antes. `CreditCardController:24` também foi corrigido (`tokenType === 'client'`).

---

### ACHADO 1 — `.env` de produção versionado no Git, com o `JWT_SECRET`
**Severidade: BLOQUEIA_LANCAMENTO · CONFIRMADO · NOVO** (nenhuma auditoria anterior cita)

`vetequus-api/.env.backup-antes-local` está **rastreado pelo Git** e foi
commitado em `17dc8d9` ("isolamento multi-tenant nos modulos restantes"), ou
seja, entrou junto com as correções de segurança.

```
$ git -C vetequus-api ls-files | grep env
.env.backup-antes-local
.env.example
.env.test.local.example
```

Conteúdo (redigido aqui, íntegro no repositório):
```
DATABASE_URL="postgresql://postgres:***@database-1.c5ci8gu88rnd.us-east-2.rds.amazonaws.com/dados"
JWT_SECRET="eyJhb…"
SMTP_HOST=smtp.zeptomail.com   SMTP_USER=…   SMTP_KEY=wSsVR6…
CLOUDFLARE_ACCOUNT_ID=251c32…  AWS_ACCESS_KEY_ID=5c4774…  AWS_SECRET_ACCESS_KEY_ID=c72ffc…
ASAAS_KEY = $aact_YTU5YTE0M2M2N2I4MTliNzk0YTI…   ASAAS_WEBHOOK_TOKEN=…
```

O `.gitignore:39` ignora `.env`, mas **não** `.env.backup-antes-local`.

**Exploração, passo a passo:**
1. Obter o repositório (colaborador atual ou antigo, fork, CI, ou o repo ser público).
2. Ler `JWT_SECRET`.
3. Assinar `{ sub: "<qualquer-uuid>", companyId: "<companyId-da-clínica-alvo>", type: "user" }`
   com esse segredo, HS256, e mandar como `Bearer`. `auth.guard.ts:34` valida a
   assinatura, popula `request.companyId` com o valor forjado, e **todas** as
   checagens de posse (`registro.companyId !== companyId`) passam.
4. Alternativa mais direta: conectar no `database-1.…rds.amazonaws.com` com a
   senha do arquivo (se o security group permitir) e ler o banco inteiro.
5. Ou: usar `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY_ID` para ler/apagar todo
   o bucket R2 de anexos clínicos.

**Impacto nas personas:** todas. Prontuário, financeiro e dado pessoal de todas
as clínicas ficam legíveis e alteráveis por quem tiver o repo. É o único achado
deste bloco que anula sozinho todo o resto do trabalho de isolamento.

**Correção:** rotacionar **todos** os segredos (JWT, senha do RDS, chaves R2,
SMTP, Asaas, webhook token) — rotacionar o `JWT_SECRET` invalida as sessões, o
que é o efeito desejado. Remover o arquivo do índice, adicionar `.env*` ao
`.gitignore` e **reescrever o histórico** (`git filter-repo`) ou tratar o repo
como comprometido. Rotacionar não basta se o histórico permanecer.

---

### ACHADO 2 — `/api/image-proxy` é um SSRF de leitura arbitrária, sem autenticação
**Severidade: BLOQUEIA_LANCAMENTO · CONFIRMADO · NOVO**

`equinology-web-v2/app/api/image-proxy/route.ts:11-45`
```ts
const url = req.nextUrl.searchParams.get("url");
if (!url || !/^https?:\/\//i.test(url)) return new Response(..., { status: 400 });
upstream = await fetch(url, { cache: "no-store" });
...
const looksLikeImageUrl = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i
  .test(url.split("?")[0] ?? "");
if (!contentType.startsWith("image/") && !looksLikeImageUrl) return 415;
const buffer = await upstream.arrayBuffer();
return new Response(buffer, { status: 200, ... });
```

`middleware.ts` (config.matcher) **não inclui `/api`** — a rota não passa por
autenticação nenhuma. Não há allowlist de host: o único filtro é o
`content-type` **ou** a extensão aparente da URL.

**Exploração, passo a passo:**
1. `GET https://app.equinology.com.br/api/image-proxy?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/`
   → o filtro rejeita (415), porque não há extensão nem content-type de imagem.
2. Contornar com fragmento: `?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/%23.png`.
   `url.split("?")[0]` mantém o `#.png`, o regex casa, `looksLikeImageUrl = true`.
   O `fetch` descarta o fragmento e busca a URL real. **O corpo é devolvido ao atacante.**
3. Mesmo truque para varrer a rede interna (`http://10.0.0.5:8080/#.png`),
   ler o próprio backend por loopback, ou o endpoint de metadados do provedor.

**Impacto:** dependendo de onde o WEB está hospedado, isso vaza credencial de
infra. No mínimo é varredura de porta interna a partir do servidor da clínica.

**Correção:** exigir sessão; allowlist do host do R2 (`pub-*.r2.dev`); bloquear
IP privado/link-local; comparar a extensão contra a URL já normalizada
(`new URL(url).pathname`), não contra a string crua.

---

### ACHADO 3 — 4 rotas Next públicas gastam a chave de IA do dono
**Severidade: GRAVE · CONFIRMADO · NOVO**

Nenhuma delas está no matcher do middleware, nenhuma checa token, nenhuma tem
rate limit:

| Rota | Evidência |
|---|---|
| `POST /api/chat` | `app/api/chat/route.ts:12` `const apiKey = process.env.OPENROUTER_API_KEY;` — aceita `messages` **e `systemPrompt` arbitrário** do corpo |
| `POST /api/audio/transcribe` | `app/api/audio/transcribe/route.ts:9` mesma chave; limite só de 15 MB de corpo |
| `POST /api/audio/transcribe-to-form` | mesma chave, modelo `google/gemini-2.5-flash` |
| `POST /api/audio/transcribe-to-odontogram` | mesma chave |

`middleware.ts` (config.matcher): a lista tem `/`, `/login`, `/calendar`,
`/clients-equines/:path*`, … e **nenhuma entrada `/api`**.

**Exploração:** `curl -X POST https://app.equinology.com.br/api/chat -d
'{"messages":[{"role":"user","content":"..."}],"systemPrompt":"..."}'` em loop.
Quem paga é o dono, e o `systemPrompt` livre transforma o endpoint num
proxy de LLM genérico para terceiros.

**Correção:** ler o cookie de sessão nessas rotas (ou incluir `/api/:path*` no
matcher) e aplicar limite por usuário.

---

### ACHADO 4 — Anexos clínicos em bucket público, chave previsível e sem revogação
**Severidade: GRAVE · CONFIRMADO · parcialmente novo** (X1/S3 da auditoria anterior tratavam de tipo/tamanho; a URL não)

`src/infra/shared/storage/r2-storage.ts:44-66`
```ts
const shortId = randomUUID().split('-')[0];              // 8 hex = 32 bits
const finalName = ext ? `${trimmedBase}-${shortId}.${ext}` : `${trimmedBase}-${shortId}`;
await this.client.send(new PutObjectCommand({ Bucket, Key: finalName, ... }));
return { url: finalName };
```
`file.controller.ts:72` devolve `${CLOUDFLARE_URL}/${url}`, e `CLOUDFLARE_URL`
(no `.env` versionado) é `https://pub-a4f3763969d34f86b87fd3d880941bfc.r2.dev`
— **bucket público de leitura**.

Consequências verificadas no código:
- Quem tiver a URL lê o arquivo para sempre. Não há assinatura, expiração, nem
  qualquer amarração ao `companyId`. Um cliente que trocou de clínica, ou um
  ex-funcionário, continua abrindo o ultrassom.
- O nome de arquivo original vai na chave (`sanitizeFileName`), então a URL é
  semanticamente adivinhável: `hemograma-<8 hex>.pdf`. 2^32 por nome conhecido
  não é enumerável por HTTP na prática, mas o desenho não é aleatório o
  suficiente para ser a única defesa.
- Não há verificação de posse **em lugar nenhum** para leitura: o R2 serve
  direto, a API não participa.
- Colisão de chave sobrescreve (PutObject sem `IfNoneMatch`): mesmo nome +
  mesmo `shortId` apaga o arquivo anterior.

O que **está** correto: `POST /file` exige token (guard global) e valida mimetype
e tamanho por tipo (`upload.constraints.ts`) — o S3 da auditoria anterior foi
corrigido. Mas o upload não é associado a nenhuma empresa nem a nenhum registro.

**Correção:** bucket privado + URL assinada com expiração emitida pela API depois
de checar posse; chave com UUID completo; e vincular `Attachment.uploadedBy` a
uma verificação de leitura.

---

### ACHADO 5 — Swagger e Scalar servidos em produção sem autenticação
**Severidade: GRAVE · CONFIRMADO · NOVO**

`src/infra/main.ts:47-57`
```ts
SwaggerModule.setup('api', app, document);
app.use('/reference', apiReference({ spec: { content: document } }));
```
Sem `if (process.env.NODE_ENV !== 'production')` e sem guard. Como são
middlewares Express montados no app, o `APP_GUARD` (AuthGuard) **não** os cobre.

`GET https://<api>/api` e `GET https://<api>/reference` entregam o mapa completo
da API — todos os endpoints, DTOs, campos, enums. É o insumo que transforma
qualquer um dos achados de IDOR abaixo em exploração dirigida em minutos.

---

### ACHADO 6 — Token de 90 dias, sem revogação, e `.env` vazado (ver Achado 1)
**Severidade: GRAVE · CONFIRMADO · NOVO**

`src/infra/shared/auth/auth.module.ts:16` → `signOptions: { expiresIn: '90d' }`.

Não existe blacklist, refresh token, nem campo de invalidação. Consequências:
- Excluir um colaborador (`DELETE /user/:userId`) **não** derruba a sessão dele:
  o token continua válido por até 90 dias. `auth.guard.ts` não consulta o banco.
- Desativar um admin do painel só bloqueia rotas com `AdminSuperAdminGuard`
  (`admin-super-admin.guard.ts:23` checa `admin.active`). O `AdminAuthGuard`
  **não** checa `active` — o admin desativado continua operando todas as rotas
  administrativas normais até o token expirar.
- O cookie do token é gravado por JavaScript (`lib/auth-cookies.ts`, sem
  `httpOnly`) com 90 dias de vida.

---

### (b) Token de cliente (`companyId: 'no-company'`) — mapa completo

O token é assinado em `client.service.ts:265-269` (login), `:317-321` (registro)
e `:337-341` (impersonação pela clínica) sempre com
`{ companyId: 'no-company', type: 'client' }`.

**Rotas que o token de cliente alcança e o que devolve:**

| Rota | Autoriza por | Verificado |
|---|---|---|
| `GET /client-portal/appointment/:id`, `/animal/:id/owner-note`, `/animal/:id/animal-note`; `POST/PUT/DELETE /client-portal/animal-note` | `clientId` do token, via `assertOwnsAnimal` (`clientPortal.service.ts:56-63`) e `animalNote.clientId !== clientId` (`:164`, `:183`) | OK — nada de outra empresa sai |
| `GET /client-payment` | `clientId = userId` forçado no controller (`clientPayment.controller.ts:32`) | OK |
| `GET /client-invoice` | `where.clientId = userId` (`clientInvoice.controller.ts:52`) | OK |
| `GET /credit-card` | `clientId: isClient ? userId : undefined` (`creditCard.controller.ts:26-29`) | OK |
| `GET/POST/PUT /animal`, `/animal/register/:code` | `tokenType === 'client' ? userId : …` (`animal.controller.ts:75-76, 109, 147-148, 211-212`); `animal.service.edit:154-158` recusa animal de outro dono | OK |
| `GET /stud-farm`, `/stud-farm/client`, `POST /stud-farm/:id/link` | `clientId` do token; o link exige o `code` (`studFarm.service.ts:211`) | OK |
| `GET/POST/PUT /sanitary-protocol` | `canReadStudFarm` trata `tokenType === 'client'` por `belongsToClient` (`sanitaryProtocol.service.ts:58-66`) | OK |
| `POST /invoice/:id/pay/*`, `POST /transaction/pix\|credit/*` | ver Achado 7 | **falha parcial** |
| `DELETE /client/me`, `GET /client/profile`, `PUT /client/:id` | `requesterId !== clientId` recusa (`client.service.ts:135-139`) | OK |
| Fichas clínicas (~40 controllers), `/animal-note`, `/owner-note`, `/user/**`, `/company/**` | `VetOnlyGuard` / `VetOnlyGuardWithMessage` recusam antes do banco | OK |
| `/deworming`, `/exam`, `/shoeing`, `/vaccine` (sem VetOnlyGuard) | `isAnimalFromCompany(animalId, 'no-company')` → `false` → `NotAllowedError` | fecha por acidente, mas fecha |
| `/payment`, `/transaction` (fetch/create/edit), `/bank-account`, `/transaction-category` | `RoleGuard` busca o `userId` em `UserRepository`; para um clientId retorna `null` → 403 (`role.guard.ts:32-36`) | fecha, mas por efeito colateral |
| `/note`, `/reminder`, `/tag`, `/board`, `/lead`, `/product*`, `/stock*`, `/invoice` (CRUD), `/appointment*`, `/crm` | filtram por `companyId = 'no-company'`, que não existe | lista vazia |

**Um ponto que merece atenção mesmo sem ser furo hoje** — `payment.service.ts:218-236`
é o único lugar do sistema que trata `'no-company'` como valor especial:
```ts
if (companyId === 'no-company') {
  if (animalId) { const animal = …; validCompanyId = animal.companyId; }
  else if (clientId) { validCompanyId = undefined; }
  else return left(new NotAllowedError());
}
```
Ou seja: passar um `animalId` faz o serviço **assumir a empresa do animal**. Hoje
isso não vaza porque `GET /payment` está atrás do `RoleGuard` e o
`/client-payment` sempre força `clientId = userId` (o `AND` no `whereFilter`
mantém o escopo). Mas a proteção depende de duas coisas fora do serviço; tirar o
`RoleGuard` do `PaymentController` reabre o caminho. Não é achado — é dívida.

---

### ACHADO 7 — Pagar movimentação/fatura de terceiro: falta checagem de posse
**Severidade: GRAVE · CONFIRMADO · NOVO**

Três rotas aceitam qualquer `transactionId` sem verificar que a parcela é do
cliente do token:

`transaction.controller.ts:148-192` → `transaction.service.ts`
```ts
async pix({ clientId, transactionId }) {
  [transaction, client, company] = await Promise.all([
    this.transactionRepository.findById(transactionId),   // <- id vindo da URL
    this.clientRepository.findById(clientId),
    this.companyRepository.findByTransactionId(transactionId),
  ]);
  if (!transaction || !client || !company) return left(new ResourceNotFoundError());
  // nenhuma comparação entre transaction e clientId
```
Idem `existingCreditCard` (`:317-378`) e `newCreditCard` (`:383-455`), que ainda
gravam `transaction.status = 'PAID'`.

O mesmo padrão, mais brando, em `invoice.service.ts:381`, `:436`, `:492`:
```ts
if (invoice.clientId && invoice.clientId !== clientId) return left(new ResourceNotFoundError());
```
— quando `invoice.clientId` é `NULL`, **qualquer cliente autenticado pode pagar
a fatura**.

**Exploração:** com um `transactionId` (UUID v4 — precisa ser obtido, não
adivinhado: sai em resposta de API, log, print, PDF, suporte), um cliente
autenticado chama `POST /transaction/credit/existing` com o próprio cartão e a
parcela de outra pessoa vira `PAID`, com o dinheiro indo para a clínica dona da
parcela. O crédito é lançado no lugar errado e a conciliação da clínica quebra.

Positivo verificado no mesmo trecho: `creditCard.clientId !== clientId`
(`transaction.service.ts:348`) **existe** e está correto — não dá para cobrar no
cartão salvo de outro.

**Correção:** resolver o cliente dono da parcela (`transaction → payment →
clientId/animal.clientId`) e comparar com o `clientId` do token, nas três rotas;
recusar fatura com `clientId` nulo.

---

### (c) IDOR nos recursos com id na URL — resultado da varredura

Este era o item mais crítico da auditoria anterior (S1, "122 endpoints"). **Está
fechado**, e verifiquei além do create.

**Fichas clínicas (~46 services):** todos têm posse no `create` (via
`ClinicalRecordOwnershipService.canWrite`, que valida animal **e**
appointmentAnimal contra o `companyId` — `clinicalRecordOwnership.service.ts:62-76`)
e **também** no `delete`, `edit` e `fetch`. Exemplo integral verificado em
`generalTest.service.ts:104-113` (delete), `:135-153` (edit, incluindo
revalidação do `animalId` do corpo), `:200+` (fetch).

Mass assignment de tenant foi neutralizado na ordem dos spreads:
`generalTest.controller.ts:39-43` → `{ generalTestId: id, ...body, companyId }`
— o `companyId` do decorator vem **depois** do body e sobrescreve o valor
injetado. Confirmei o mesmo padrão nos demais controllers de ficha.

Os que não guardam `companyId` próprio resolvem a posse subindo na hierarquia,
e isso foi verificado arquivo a arquivo:
- `vaccine` / `deworming` / `exam` / `shoeing` → `isAnimalFromCompany(animal)`
  em create/edit/delete/fetch/fetchSoon (ex.: `vaccine.service.ts:32-35, 49, 98-104, 144, 160, 178`).
- `animalNote` → `isAnimalFromCompany` + `authorType !== 'VET'`
  (`animalNote.service.ts:71, 73, 93, 95, 105`).
- `appointmentAnimal` → `ownsAppointment` (`appointmentAnimal.service.ts:27-30, 60, 88`).
- `sanitaryProtocol` → `ownsStudFarm` / `ownsProtocol` nos 8 métodos.
- `productUsage` → `ownsAppointmentAnimal` + `product.companyId` (`:56, 60, 125`).
- `transaction` → `assertOwnedRefs` pela categoria (`transactionCategoryId` é
  NOT NULL no schema, `prisma/schema.prisma:625` — a checagem sempre dispara).

Financeiro, estoque, CRM, notas, tags, faturas, atendimentos, clientes, usuários:
`edit` e `delete` comparam `registro.companyId !== companyId` **antes** da
escrita. `GET /appointment/details/:id` compara no controller
(`appointment.controller.ts:126-129`). `PUT /user/:id` e `DELETE /user/:id`
exigem `requester.isAdmin` **e** `targetUser.companyId === companyId`
(`User.service.ts:389-395`, `:419-425`).

`PUT /signature/cancel/:id` e `/refound/:id` — o IDOR crítico da auditoria
anterior está **corrigido**: `companySignature.service.ts:558` e `:531` fazem
`signature.companyId !== companyId → NotAllowedError`, e os controllers usam
`@CurrentCompanyId()` (não mais `@CurrentUserId()`).

#### 7.1 — Resíduo: `getById` do animal libera animal sem empresa
**Severidade: MENOR · CONFIRMADO · NOVO**

`animal.service.ts:265-280`
```ts
if (companyId && animal.companyId && animal.companyId !== companyId)
  return left(new ResourceNotFoundError());
```
Se `animal.companyId` for `NULL` — o caso de um animal cadastrado pelo próprio
proprietário no app (`animal.controller.ts:75` passa `companyId: undefined`) —
a condição não dispara e **qualquer clínica** que saiba o UUID lê o animal por
`GET /animal/by-id/:id`. Exploração exige adivinhar um UUID v4, o que na prática
não acontece; por isso MENOR. Mas o padrão "se o dono é nulo, libera" é o mesmo
do Achado 7, e vale corrigir junto.

#### 7.2 — Código de propriedade gerado com `Math.random()`
**Severidade: GRAVE · CONFIRMADO · NOVO**

`studFarm.service.ts:221-226`
```ts
function generateRandomString(length: number): string {
  const chars = 'ABC…xyz0123456789';
  result += chars.charAt(Math.floor(Math.random() * chars.length));
```
usado em `:81` → `code: generateRandomString(10)`.

Esse `code` **é a credencial**: `GET /stud-farm/code/:code` devolve a
propriedade de qualquer tenant, e `POST /stud-farm/:id/link` só aceita o vínculo
se o `code` conferir (`:211`). O `utils/generateRandomString.ts` do projeto usa
`crypto.randomInt` justamente por isso — e o `studFarm.service` redefine a função
localmente com `Math.random()`, que não é criptográfico (o estado do
xorshift128+ do V8 é recuperável a partir de saídas consecutivas).

Mitigação existente: `@Throttle({ limit: 5, ttl: 60_000 })` em
`studFarm.controller.ts:182-184`. O código de **animal** está correto
(`animal.service.ts:99` usa a versão de `utils`).

**Correção:** apagar a função local e importar `@/utils/generateRandomString`.

---

### (d) Rotas públicas — lista completa

**API (`@IsPublic()`, guard global não roda):**

| Rota | Expõe | Proteção |
|---|---|---|
| `POST /user/signin` | token de clínica | Throttle 5/min |
| `POST /user/register` | cria empresa+usuário, devolve token | Throttle 5/min |
| `PUT /user/password` | troca senha por código | Throttle 5/min |
| `POST /password-code` · `GET /password-code/:code` | dispara/valida código de recuperação (usuário) | Throttle 5/min na classe |
| `POST /client/auth` | token de cliente | Throttle 10/min |
| `POST /client/register` | cria cliente, devolve token | Throttle 5/min |
| `POST/GET/PUT /client/password-code` | código de recuperação do cliente | Throttle 5/min na classe |
| `POST /admin/auth/signin` | token de admin | Throttle |
| `POST /signature/webhook` | ativa assinatura | compara header `asaas-access-token` com `ASAAS_WEBHOOK_TOKEN` (`companySignature.controller.ts:126`) — **e esse token está no `.env` versionado** |
| `GET /signature-plan` | catálogo de planos | nenhuma (aceitável) |
| `GET /ads/sponsors` | anúncios ativos | nenhuma (aceitável) |
| `GET /tutorials` | tutoriais ativos | nenhuma (aceitável) |
| `GET /coupons/validate/:code` | **valida cupom** | **nenhuma** — ver abaixo |
| `GET /api` · `GET /reference` | Swagger/Scalar completos | **nenhuma** — Achado 5 |

Verifiquei que o S2 da auditoria anterior está **corrigido**: o código de
recuperação nunca volta no corpo (`RecoverClientPasswordCode.service.ts:69-72`,
comentário e código batem), o `generateRandomString` agora usa `crypto.randomInt`
e gera exatamente 6 caracteres incluindo `'a'`, e o código expira em 30 min
(`recoverPasswordCode.ts:29`) com corte adicional de 1 h no repositório.

#### 7.3 — `GET /coupons/validate/:code` sem limite: enumeração de cupom
**Severidade: GRAVE · CONFIRMADO · NOVO**

`publicCoupon.controller.ts:13-27` — `@IsPublic()`, sem `ThrottlerGuard`, e
devolve `isValid`, `discountType`, `discountPercentage`, `discountFixedAmount` e
o cupom inteiro. Códigos de cupom são cadastrados à mão pela equipe (ADM), logo
são curtos e humanos (`PROMO10`, `LANCAMENTO`). Um script de dicionário acha
todos em minutos e o desconto vira público.

**Impacto na persona EQUIPE EQUINOLOGY:** receita de assinatura perdida em
descontos não autorizados.
**Correção:** `@UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 60_000 } })`.

**WEB — páginas fora do matcher do middleware (acessíveis sem login):**

`middleware.ts` (config.matcher) lista `/`, `/login`, `/register`,
`/recover-password`, `/mail-code`, `/plans`, `/checkout/:path*`, `/calendar`,
`/clients-equines/:path*`, `/services/:path*`, `/financial`, `/stock`, `/crm`,
`/subscription`, `/clinic`, `/notes*`, `/reminders*`.

Ficam de fora:

| Rota | O que expõe | Severidade |
|---|---|---|
| `/api/image-proxy` | SSRF (Achado 2) | BLOQUEIA |
| `/api/chat`, `/api/audio/*` (3) | chave de IA (Achado 3) | GRAVE |
| `/fatura/[token]` | fatura pública — ver 7.4 | GRAVE |
| `/odontograma-novo`, `/odontograma-novo-v2` | telas de demonstração do odontograma; **li os `page.tsx` e os `_components`: não fazem nenhuma chamada de API** (grep por `GetAPI`/`PostAPI`/`fetch` vazio) — expõem só a UI | MENOR |
| `/odontograma-pdf-check` (366 linhas) | página de verificação de PDF com dados fixos (`:210` `clinic={{ name: "Clínica de verificação — Equinology" }}`) — sem chamada de API | MENOR |
| `/logo-pdf-check` (579 linhas) | idem, sem chamada de API | MENOR |
| `/clinic/odontograma` | é tela de dashboard, mas o matcher tem `/clinic` **sem** `:path*` — o gate de assinatura não roda ali; o dado depende do token, então não vaza, mas o controle não se aplica | MENOR |

Resíduos cosméticos que confirmei continuarem: `/stock2` e `/cooperators` no
matcher não existem em `app/(dashboard)/`; `/financial` e `/stock` não cobrem
subrotas (hoje não há nenhuma).

#### 7.4 — Fatura pública: payload base64 sem assinatura
**Severidade: GRAVE · CONFIRMADO · JÁ CONSTAVA** (STATUS-VERIFICADO, "nao_corrigido" — reverifiquei, continua idêntico)

`lib/invoice-share.ts:56-68`
```ts
export function encodeInvoicePayload(p) { return toBase64Url(JSON.stringify(p)); }
export function decodeInvoicePayload(token) {
  const parsed = JSON.parse(fromBase64Url(token));
  if (parsed?.v !== 1 || !Array.isArray(parsed.it)) return null;
  return parsed;
}
```
Nenhum HMAC, nenhuma consulta ao backend, nenhuma expiração.
`app/fatura/[token]/page.tsx:22` renderiza direto o que veio na URL: nome e CNPJ
da clínica, logo, **chave PIX** (`data.k`, com botão "copiar"), dados do cliente,
do animal e os itens.

**Exploração:** montar o JSON com o nome, CNPJ e logo de uma clínica real e a
**chave PIX do atacante**, codificar em base64url e enviar o link
`https://app.equinology.com.br/fatura/<token>` ao cliente final. A página é
servida no domínio legítimo do produto, com HTTPS válido. É uma página de
cobrança falsa hospedada pelo próprio SaaS.

Ressalva honesta: **não há vazamento de dado de outro tenant** — o payload é
gerado no navegador de quem compartilha. O risco é de forjar, não de ler.

**Correção:** assinar o payload (HMAC com segredo de servidor) e validar no
render; ou trocar o link por um id opaco resolvido pelo backend.

---

### (e) Upload e anexos — quem lê o arquivo de quem

Coberto no Achado 4. Resumindo a cadeia que rastreei fim a fim:
`MultiFileUpload` (web) → `POST /file` (autenticado, valida mimetype e tamanho,
**não** valida empresa nem vincula a registro) → `R2Storage.upload` (chave
`nome-8hex.ext`) → resposta `{ url, fullUrl }` → o front grava a URL na coluna
`fileUrl` / na tabela `Attachment` → `attachmentSync.hydrate` devolve a URL nas
leituras (que **são** filtradas por posse) → o navegador/app busca o arquivo
**direto no `pub-*.r2.dev`, sem passar pela API**.

Ou seja: a autorização protege a *referência*, nunca o *arquivo*. Não encontrei
nenhum controller de leitura de anexo — não há caminho para "baixar anexo por
id", o que é bom; mas também não há como revogar uma URL já emitida.

---

### (f) Segredos, chaves e logs

- **Achado 1** (o `.env` versionado) é o item central.
- Varredura por chave hardcoded em `src/` dos 4 repos: **nada encontrado**
  (`sk-`, `AKIA`, `$aact_`, `eyJhbGciOi` fora dos `.env`). O código lê tudo de
  env, o que está certo. O problema é o env estar no Git.
- `equinology-app-v2/.env` também está versionado, mas só contém
  `EXPO_PUBLIC_API_URL` — sem segredo. `equinology-adm-v2/.env.example` tem
  apenas placeholders.
- **Logs com dado de pagamento continuam em produção** (JÁ CONSTAVA, e
  reverifiquei): `transaction.service.ts:212, 217, 227, 265, 284, 293, 322, 340,
  404` — `console.log('[PIX BACK DEBUG] …')` logando `transactionId`, `clientId`,
  `customer` (id Asaas), `walletId` e `value`. O comentário na linha 210 ainda
  diz "Logs temporários — remover depois que o bug for resolvido". Severidade
  MENOR isoladamente (não há senha nem cartão), mas é dado financeiro de cliente
  em log de servidor.
- `main.ts:11` — `NestFactory.create(AppModule, { cors: true })`: CORS liberado
  para qualquer origem. Como a autenticação é `Bearer` (não cookie), o impacto é
  baixo; mas remove a barreira contra scripts de terceiros usarem a API.
  Severidade MENOR.
- `main.ts:14-31` — `ValidationPipe` **sem `whitelist: true`**. Campos não
  declarados no DTO chegam ao service. Isso já causou bugs funcionais
  documentados (`scope`, `clientId` descartados) e é a superfície que torna o
  mass assignment de `companyId` possível — hoje contida só pela ordem dos
  spreads nos controllers, que é uma defesa frágil. Severidade MENOR
  isoladamente, GRAVE como padrão sistêmico.

---

## Dúvidas em aberto

1. **O repositório `EquinologySistemas/vetequus-api` é público ou privado?**
   Não consigo determinar sem consultar o GitHub. Se for público, o Achado 1
   deixa de ser risco e passa a ser incidente consumado — as credenciais devem
   ser consideradas comprometidas e rotacionadas hoje, e o banco auditado.
2. **As credenciais do `.env.backup-antes-local` ainda são válidas?** O
   `ASAAS_URL` ali é `sandbox.asaas.com`, o que sugere que o arquivo é uma cópia
   de ambiente de teste — mas o `DATABASE_URL` aponta para um RDS na AWS
   (`database-1.…us-east-2.rds.amazonaws.com/dados`) e o SMTP é ZeptoMail de
   produção. **Não testei nenhuma delas.** Precisa ser confirmado por quem tem
   acesso ao servidor. Independentemente disso, o `JWT_SECRET` só vale se for o
   mesmo do servidor — verificar comparando com o `.env` de produção.
3. **Onde o WEB está hospedado?** O impacto do SSRF (Achado 2) varia de "varredura
   de rede interna" a "roubo de credencial de instância" conforme o provedor.
   Não consegui determinar pelo repositório.
4. **O front do odontograma v2 (~29 mil linhas novas) não foi lido.** Auditei o
   `dentistryOdontogram.service.ts` no backend e ele está correto (posse no
   create/edit/delete e filtro por `companyId` no fetch, `:41, 81, 104, 144-146`).
   Se houver problema de isolamento nessa feature, ele estaria no front, que
   ficou fora desta amostra.
5. **ADM (front) e APP (Expo)** não foram auditados quanto ao consumo. Cobri o
   lado servidor de todas as rotas que eles chamam, que é onde a autorização
   mora — mas não posso afirmar que nenhuma tela do ADM renderiza dado de uma
   empresa no contexto de outra.
6. **Não reproduzi nenhuma exploração.** Todos os passos descritos são derivados
   da leitura do código. Onde não consegui fechar o caminho (7.1, 7.2), a
   inviabilidade prática está declarada no próprio achado.
