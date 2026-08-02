# Bloco 6 — Mensagens de erro e falhas silenciosas (4 repos)

Data da verificação: 02/08/2026
HEADs auditados: API `4dc4607` · WEB `2f6fea6` · APP `329e90f` · ADM `9d90c5d`

O STATUS-VERIFICADO está **defasado neste bloco**. Boa parte do que ele lista como
aberto foi corrigido depois (ExceptionFilter global, tradutor do ValidationPipe,
`lib/api-error.ts` no APP, throttler nos endpoints públicos). Tudo abaixo foi
reverificado no código atual.

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado (li o arquivo)

**API (`vetequus-api`)**
- `src/infra/main.ts` inteiro (ValidationPipe + registro do filtro global).
- `src/infra/shared/handler/all-exceptions.filter.ts` inteiro.
- `src/infra/shared/handler/error.handler.ts` inteiro (10 erros de domínio mapeados).
- `src/infra/shared/validation/validationMessage.translator.ts` inteiro (28 regras).
- As 10 classes de `src/core/errors/errors/`.
- Contagem programática de decorators class-validator em **todo** `src/` (2.080) e
  por DTO em `src/infra/http/controllers/**` (86 DTOs).
- Fluxo de registro fim a fim: `user.controller.ts:63-110` → `RegisterUserDto` →
  `User.service.ts:232-360` → `asaas.ts:76-102`.
- Rate limit: todos os `@Throttle` do projeto + mensagem real do `ThrottlerException`
  lida em `node_modules/@nestjs/throttler/dist/throttler.exception.js:5`.
- `file.controller.ts` (upload).
- Varredura programática de `catch` vazio / só-console em todo `src/`.

**WEB (`equinology-web-v2`)**
- `lib/api-error.ts` inteiro, `context/ApiContext.tsx` inteiro.
- `app/(auth)/login`, `register`, `recover-password` — os três `handleSubmit`.
- Varredura programática: `catch` vazio/só-console em todo o repo (1 ocorrência);
  59 arquivos com escrita Post/Put/Delete, cruzados com adoção de `getApiErrorMessage`;
  todos os `.catch(() => {})` / `.catch(() => null)` (18 ocorrências, todas lidas).
- `usePaginatedSelect.ts`, 5 cards do dashboard, 2 tabelas de estoque,
  `NewAppointmentSheet.tsx`, `lib/upload.ts`.

**APP (`equinology-app-v2`)**
- `lib/api-error.ts` inteiro, `contexts/ApiContext.tsx` (handleError).
- Adoção medida: 22 arquivos chamam a API, 6 usam `getApiErrorMessage`.
- `components/sheets/InvoicePaymentSheet.tsx` nos 3 pontos de erro.
- Varredura de catch vazio/só-console em `app/` e `components/`.

**ADM (`equinology-adm-v2`)**
- `src/context/ApiContext.tsx` inteiro.
- `src/app/login/page.tsx` (handleSubmit).
- Todas as 8 funções de carregamento das páginas privadas (users, companies, plans,
  coupons, subscriptions, admins, ads, tutorials, financial) e os 28 pontos de
  `body.message`.

### NÃO verificado (declarado)

- **APP:** as 16 telas restantes que chamam a API sem usar `getApiErrorMessage` não
  foram abertas uma a uma. Medi a adoção (6/22), não o efeito de cada uma.
- **API:** não abri os 58 DTOs individualmente — a contagem é programática por regex
  de linha (`@Decorator(` + presença da palavra `message` na mesma linha). Decorator
  com `message` quebrado em várias linhas pode ter sido contado como "sem message".
  Amostrei 7 DTOs manualmente e o padrão bateu.
- **Não executei nada.** Zero runtime, zero request real. Todo texto de tela abaixo é
  derivado da leitura do caminho de código.
- **Odontograma v2, anotações do proprietário, tabela de anexos, preenchimento por
  voz** — só entraram aqui pelo que aparece nas varreduras globais (catch/toast).
  Não fiz auditoria dedicada desses módulos.
- Não avaliei textos de *empty state*, tooltip ou copy fora de caminho de erro.

---

## Veredito — **funciona_com_ressalva**

A infraestrutura de mensagem de erro **existe e é boa** nos quatro repos — melhor do
que o STATUS-VERIFICADO indica. O 500 cru acabou: a API tem `@Catch()` global que loga
o stack e devolve PT genérico, e o ValidationPipe traduz as mensagens padrão do
class-validator num ponto único.

O que sobrou não é ausência de camada, são **três falhas de ligação**:

1. **O WEB joga fora a mensagem específica que a API acabou de traduzir.** Em todo
   erro 400 de validação o usuário lê "Confira os dados informados e tente novamente"
   em vez de "O campo Raça é obrigatório". O trabalho de tradução da API não chega à
   tela no repo mais usado.
2. **O ADM não tem camada nenhuma** e ainda quebra em erro de rede em 4 dos 5 verbos.
3. **Falha silenciosa continua viva em leitura**: o ADM mostra dados de demonstração
   como se fossem reais, e o WEB zera KPI e esvazia dropdown sem avisar.

A persona completa os fluxos no caminho feliz. No caminho de erro ela é mal informada
— e em dois casos é **desinformada** (dado falso na tela).

---

## Achados

### A1 — WEB descarta a mensagem específica de validação e mostra texto genérico
**Severidade: GRAVE** · **NOVO** (a auditoria anterior não podia ver: o
`code: VALIDATION_ERROR` só passou a existir depois) · CONFIRMADO

A API agora traduz e detalha o erro de validação. `main.ts:20-33`:

```ts
exceptionFactory: (errors: ValidationError[]) => {
  const messages = flattenValidationErrors(errors);
  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    message: messages,          // ex.: ["O campo Raça é obrigatório"]
    error: 'Bad Request',
    code: 'VALIDATION_ERROR',   // <- e aqui está o problema
  });
}
```

No WEB, `lib/api-error.ts:191-214` resolve **pelo `code` antes de olhar a mensagem**:

```ts
// 2. Code estável — é o contrato que não muda.
if (err.code && MESSAGE_BY_CODE[err.code]) return MESSAGE_BY_CODE[err.code];
```

e `MESSAGE_BY_CODE` (linha 95) contém:

```ts
VALIDATION_ERROR: "Confira os dados informados e tente novamente.",
```

**Prova de que dispara:** `ApiContext.tsx:16-18` → `apiErrorFromResponse` →
`toApiError` (`api-error.ts:58-68`) lê `parsed?.code` do corpo. O corpo do
ValidationPipe sempre traz `code: 'VALIDATION_ERROR'`. Logo, **100% dos 400 de
validação** caem no `return` da linha 202 e a lista de mensagens montada em
`flattenValidationErrors` nunca é lida.

**O que a clínica vive:** cria um animal sem preencher Raça → a API respondeu
"O campo Raça é obrigatório" → a tela mostra "Confira os dados informados e tente
novamente." Em formulário de ficha clínica com 20 campos, o veterinário não descobre
qual campo corrigir. Vale para animal, cliente, propriedade, atendimento, fatura,
pagamento — todos.

**Contraste que prova que é omissão, não decisão:** o APP faz na ordem certa.
`equinology-app-v2/lib/api-error.ts:165-173`:

```ts
// A API já traduziu as mensagens de domínio e elas são MAIS específicas do
// que o texto genérico do code (...). Por isso a mensagem em português vem
// antes do mapa por code
if (raw && looksPortuguese(raw)) return raw;
const code = getApiErrorCode(source);
if (code && MESSAGE_BY_CODE[code]) return MESSAGE_BY_CODE[code];
```

**Correção:** mover o bloco `looksPortuguese(raw)` (hoje na linha 212) para **antes**
do `MESSAGE_BY_CODE` na linha 202, exatamente como o APP faz. Uma movimentação de
bloco. Manter `MESSAGE_BY_CODE` como fallback para mensagem vazia ou em inglês.

**Dano colateral:** com isso, `NewAppointmentSheet.tsx:29-37` virou código morto — o
dicionário casa por `"userId should not be empty"`, string que a API **não emite
mais** (o tradutor devolve "O campo userId é obrigatório"). Confirmado em
`validationMessage.translator.ts:22`.

---

### A2 — Criar conta de clínica nova sem CPF/CNPJ: "Registro não encontrado. Ele pode ter sido removido."
**Severidade: BLOQUEIA_LANCAMENTO** · **NOVO** · CONFIRMADO
*(este é o caso concreto que o dono citou — item g)*

No formulário de registro, **nenhum** dos campos da clínica é obrigatório.
`equinology-web-v2/app/(auth)/register/page.tsx:258-315` — `cpfCnpj`, `companyName`,
`postalCode`, `address`, `number` são renderizados sem `required`. Só `name`, `email`,
`password` e `phone` têm.

O body só inclui o que estiver preenchido (`register/page.tsx:96-102`):

```ts
if (payload.newCompany) {
  if (payload.cpfCnpj) body.cpfCnpj = payload.cpfCnpj;
  if (payload.address) body.address = payload.address;
  ...
}
```

O DTO também não exige — `User.dto.ts:141-175`, todos `@IsOptional()`. A validação
real está no service, e ela lança o erro errado
(`User.service.ts:254-259`):

```ts
if (newCompany) {
  if (!cpf && !companyCnpj) return left(new ResourceNotFoundError());
  if (!paymentType || !address || !number || !postalCode) {
    return left(new ResourceNotFoundError());
  }
```

`ResourceNotFoundError` (`resourceNotFoundError.ts:7`) → `error.handler.ts:50` → 404
com `code: 'RESOURCE_NOT_FOUND'` → no WEB, `api-error.ts:88`:

```ts
RESOURCE_NOT_FOUND: "Registro não encontrado. Ele pode ter sido removido.",
```

**O que o cliente vive:** preenche nome, e-mail, senha, telefone, aceita os termos,
clica em **Criar conta** — e lê **"Registro não encontrado. Ele pode ter sido
removido."** Nada na tela indica que faltou o CPF/CNPJ, o CEP, o endereço ou o número.
Nenhum campo fica marcado. É exatamente o "falha ao criar conta sem explicação" que o
dono relatou. O usuário desiste ou liga no suporte.

**Correção mínima (não exige backend):** marcar os 5 campos como `required` no
formulário quando `newCompany === true`. **Correção certa:** trocar os dois
`ResourceNotFoundError` por `ValidationError` com a mensagem do campo faltante
(`ValidationError` já existe e já mapeia para 400 em `error.handler.ts:96`).

---

### A3 — Rate limit (429) exibido como "Email ou senha inválidos" no WEB e como texto em inglês no ADM
**Severidade: GRAVE** · **NOVO** · CONFIRMADO

O throttler foi adicionado nos endpoints públicos: signin 10/min
(`user.controller.ts:45-46`), register 5/min (`:63-64`), recuperação de senha 5/min
(`recoverPasswordCode.controller.ts:15-16`), login do ADM 10/min
(`adminAuth.controller.ts:19-20`).

A mensagem do `ThrottlerException` é literalmente
`'ThrottlerException: Too Many Requests'`
(`node_modules/@nestjs/throttler/dist/throttler.exception.js:5`), string, em inglês. É
uma `HttpException`, então o filtro global a repassa intacta pelo ramo de string
(`all-exceptions.filter.ts:57-61`) com `code: 'HTTP_ERROR'` (429 não está no
`CODE_BY_STATUS`, linhas 13-23).

**No WEB** — `api-error.ts:191-214`, passo a passo com esse corpo:
`code = 'HTTP_ERROR'` (fora dos dois mapas) → `raw` não está em `MESSAGE_BY_RAW`
(linhas 148-161, sem entrada para 429) → `status 429 < 500` → `looksPortuguese("ThrottlerException: Too Many Requests")`
= `false` → **retorna o `fallback` da tela**. E o fallback do login é
(`login/page.tsx:45`) `"Email ou senha inválidos."`

Resultado: quem erra a senha 10 vezes e depois digita a **certa** continua lendo
"Email ou senha inválidos." por até um minuto. No registro
(`register/page.tsx:118`) lê "Não foi possível criar a conta. Confira os dados e tente
novamente." e fica reeditando dados que estavam corretos. Na recuperação de senha
(`recover-password/page.tsx:44`), "Não foi possível enviar o código."

**No ADM é pior — o inglês aparece cru.** `adm:src/app/login/page.tsx:45-50`:

```ts
setError(
  typeof body?.message === "string"
    ? body.message
    : body?.message?.[0] || "E-mail ou senha inválidos. Tente novamente.",
);
```

`body.message` é string → exibe **"ThrottlerException: Too Many Requests"** na tela de
login do painel interno.

**O APP acerta**, o que confirma que é omissão do WEB/ADM:
`equinology-app-v2/lib/api-error.ts:90` tem
`429: "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente."`

**Correção:** adicionar `MESSAGE_BY_STATUS` (ou entrada 429 em `MESSAGE_BY_RAW`) no
`api-error.ts` do WEB, copiando do APP; e criar a camada no ADM (ver A5).

---

### A4 — ADM mostra usuários de demonstração como se fossem clientes reais
**Severidade: BLOQUEIA_LANCAMENTO** · **NOVO** · CONFIRMADO

`adm:src/app/(private)/users/page.tsx:89-102`:

```ts
async function loadUsers() {
  setLoading(true);
  const res = await GetAPI(API_USERS, true);
  setLoading(false);
  if (res.status === 200) { ... }
  else {
    setUsers(FALLBACK_USERS);   // <- sem toast, sem aviso
  }
}
```

`FALLBACK_USERS` (`:16-47`) é dado inventado: **"Maria Silva — maria.silva@haras.com.br
— Haras Silva — plano Profissional"**, "João Santos — EquiClinic — plano Empresarial",
"Ana Oliveira — VetEquus". Nenhum indicador na tela.

**O que a equipe Equinology vive:** a API cai ou o token expira num endpoint não-401
→ a tela "Usuários" mostra três clínicas fictícias com planos fictícios. A pessoa que
vende o sistema olha a base de usuários e **acredita no que está vendo**. Pode
reportar número errado ao dono, cobrar plano errado, procurar um cliente que não
existe.

Prova de que a própria equipe sabia que isso precisava de aviso: a página de
administradores faz o mesmo fallback **mas sinaliza** —
`adm:src/app/(private)/admins/page.tsx:62` (`isMockData`) e `:200`
(`{isMockData && <MockIndicator />}`). A página de usuários não tem nem o state nem o
componente.

**Correção:** remover `FALLBACK_USERS` e mostrar erro; ou, no mínimo, replicar o
`MockIndicator` do admins/page.

---

### A5 — ADM quebra em erro de rede em GET/PUT/PATCH/DELETE: tela presa em "carregando", sem mensagem
**Severidade: GRAVE** · **JÁ CONSTAVA** (STATUS-VERIFICADO, "ADM: ApiContext quebra
com erro de rede") · **REVERIFICADO: continua aberto, idêntico** · CONFIRMADO

`adm:src/context/ApiContext.tsx:118-122` (GetAPI), `:141-145` (Put), `:164-168`
(Patch), `:187-191` (Delete):

```ts
.catch((err) => {
  const message = err.response.data;   // sem ?. — TypeError se não há resposta
  const status = err.response.status;
  return { status, body: message };
});
```

Só o `PostAPI` (`:93-98`) tem `err.response?.status ?? 0`.

Em erro de rede (API fora, DNS, CORS, túnel caído) o axios rejeita com
`error.response === undefined`. O `err.response.data` lança `TypeError` **dentro** do
`.catch`, então a promise de `GetAPI` rejeita em vez de resolver.

**Isso importa porque quase ninguém tem try/catch.** Contei 30 chamadas a `GetAPI` no
`src/` contra 10 blocos `catch` no repo inteiro. Exemplo lido inteiro —
`adm:src/app/(private)/plans/page.tsx:35-48`:

```ts
async function loadPlans() {
  setLoading(true);
  const res = await GetAPI(API_PLANS, true);   // <- lança
  setLoading(false);                            // <- nunca executa
  ...
}
```

`setLoading(false)` está **depois** do await: a tela fica em "carregando" para sempre,
sem toast, sem erro, sem retry. Mesmo padrão em
`companies/page.tsx:43-57`, `coupons/page.tsx:31-47`, `subscriptions/page.tsx:47-61`,
`users/page.tsx:89-102`, `tutorials/page.tsx:61-73`, `ads/page.tsx:58`,
`admins/page.tsx:69-79`. Só `financial/page.tsx:55-102` tem try/catch/finally.

**Correção:** `err.response?.data` / `err.response?.status ?? 0` nos quatro verbos,
com o mesmo fallback do PostAPI. Quatro linhas.

---

### A6 — ADM não tem camada de tradução; 500 vira mensagem genérica errada e array de validação vira "undefined, undefined"
**Severidade: GRAVE** · **JÁ CONSTAVA** (parcialmente) · CONFIRMADO

Não existe `api-error.ts` nem equivalente no ADM (`grep` por `getApiErrorMessage` no
repo: zero). O tratamento é 28 ocorrências espalhadas de `res.body?.message`.

Três defeitos concretos:

1. **500 perde a mensagem.** `ApiContext.tsx:101-106` substitui o corpo inteiro pela
   **string** `"Ops! algo deu errado, tente novamente"`. As telas então fazem
   `res.body?.message` — que sobre uma string é `undefined` — e caem no fallback.
   Ex.: `plans/page.tsx:64` → "Erro ao excluir plano." O texto pronto do
   `ApiContext` nunca é exibido. Efeito prático: PT genérico, aceitável, mas o
   trabalho está sendo feito duas vezes e uma delas não serve pra nada.

2. **Erro de validação vira um blocão colado.** A API devolve `message` como **array**
   de strings PT. `plans/page.tsx:64`, `subscriptions/*:98,138,158,238`,
   `coupons/page.tsx:78` fazem `toast.error(res.body?.message ?? "...")` — passando um
   array para o toast. O React concatena os elementos sem separador:
   "O campo name é obrigatório.O campo priceCardCents deve ser um número." *(a
   concatenação é inferência do comportamento do React sobre children array —
   **SUSPEITO**, não executei; que o `message` é array está confirmado em
   `main.ts:29`.)*

3. **"undefined, undefined"** — `adm:src/app/(private)/ads/page.tsx:106` e `:144`:

   ```ts
   : res.body.message.map((m: { defaultMessage?: string }) => m.defaultMessage).join(", ")
   ```

   `message` é array de **strings**; `m.defaultMessage` é sempre `undefined`. Salvar um
   anúncio com campo inválido mostra literalmente **"undefined, undefined"**.
   CONFIRMADO — mesmo achado do STATUS-VERIFICADO, intocado.

**Correção:** portar `lib/api-error.ts` do WEB (ou do APP, que tem a ordem correta)
para o ADM e trocar os 28 pontos.

---

### A7 — Falha silenciosa de leitura no WEB: KPI zerado e dropdown vazio quando a API falha
**Severidade: GRAVE** · **NOVO** · CONFIRMADO

O WEB está limpo de `catch` vazio (varri o repo inteiro: **1 ocorrência**, o ViaCEP em
`register/page.tsx:63`, comentada e correta). Mas há um padrão pior, porque é
invisível: **degradar para zero/vazio sem avisar**.

`hooks/usePaginatedSelect.ts:81-86`:

```ts
.catch(() => {
  if (id !== reqId.current) return;
  setItems([]);
  setPage(0);
  setTotalPages(0);
});
```

Esse hook alimenta os selects de **8 telas**: `NewAppointmentSheet`,
`NewPaymentSheet`, `NewInvoiceSheet`, `CreateNoteSheet`, `NotesTable`,
`AddStockEntrySheet`, `SendGeneralToVolanteSheet`, `StockOutputSheet`. Se a busca de
clientes/animais/produtos falha, o dropdown mostra "nenhum resultado" — indistinguível
de "esta clínica não tem clientes cadastrados".

`app/(dashboard)/_components/DashboardEntryExit.tsx:118-122`:

```ts
.catch(() => {
  setTotalIncome(0);
  setTotalOutcome(0);
  setChartData([]);
})
```

Mesmo padrão em `DashboardCommercialSector.tsx:126-130` (leads e **lucro** viram 0),
`DashboardGeneralStockTable.tsx:98`, `DashboardVolanteStockTable.tsx:89`,
`DashboardStockAlertsCard.tsx:185`, `StockProductsTable.tsx:88`,
`StockMovementsTable.tsx:62`.

**O que a clínica vive:** a home mostra **R$ 0,00** de entradas e saídas do mês e
gráfico vazio quando a API falhou. Não é "carregando", não é erro — é um número, e o
número está errado. O card de alertas de estoque mostra "nenhum produto abaixo do
mínimo" quando na verdade não conseguiu perguntar.

Prova de que existe padrão melhor no próprio repo:
`services/_components/ServiceOverview.tsx:86-89` faz
`.catch(() => { toast.error("Erro ao carregar anotações."); setNotes([]); })`.

**Correção:** estado de erro por card ("Não foi possível carregar — tentar novamente")
em vez de zero. Nos selects, mensagem no lugar do "nenhum resultado".

---

### A8 — APP: a tela de pagamento de fatura não usa a camada de erro
**Severidade: GRAVE** · **PARCIALMENTE NOVO** (o STATUS dizia que o APP não tinha
camada nenhuma — ele tem agora; o que resta é adoção) · CONFIRMADO

`equinology-app-v2/lib/api-error.ts` existe, está completo e com a ordem de resolução
correta (melhor que a do WEB). Mas só **6 dos 22** arquivos que chamam a API o usam:
`login.tsx`, `signup.tsx`, `forgot-password.tsx`, `profile.tsx`, `notes.tsx`,
`AnimalRegistrationSheet.tsx`.

Ficou de fora justamente o fluxo onde o cliente final paga —
`components/sheets/InvoicePaymentSheet.tsx`, três pontos:

```
:369   const msg = (res.body as { message?: string })?.message ?? (isGatewayError ? ... )
:441   const msg = (res.body as { message?: string })?.message ?? "Erro ao processar pagamento";
:549   const msg = (res.body as { message?: string })?.message ?? "Erro ao processar pagamento";
```

Dois efeitos:
- Se a API responde erro de validação, `message` é **array**; o cast para `string` é
  mentira e o `Toast.show({ text1: msg })` recebe um array. *(Comportamento exato do
  toast com array — **SUSPEITO**, não executei.)*
- O texto do 502/504 (`:370-372`) fala em "peça para o suporte verificar os **logs do
  backend**" e cita "**Asaas**" pelo nome. Isso está na tela do **proprietário do
  cavalo**, não numa tela interna. É vazamento de linguagem técnica e de fornecedor
  para o cliente final.

Além disso continuam os 15 `console.log("[PIX DEBUG] ...")` do mesmo arquivo
(`:216,245,254,268,278,285,298,301,320,335,347,673,676,679,682`), já apontados antes e
intocados — inclusive `:278` logando o corpo da resposta de pagamento.

**Correção:** trocar os 3 pontos por `getApiErrorMessage(res, "...")` e reescrever o
texto do gateway em linguagem de usuário final.

---

### A9 — Mensagem de erro de CPF inválido no cadastro é substituída por "Não foi possível processar o pagamento"
**Severidade: GRAVE** · **NOVO** · CONFIRMADO

No registro de clínica nova, a API cria o cliente no Asaas antes de criar a conta
(`User.service.ts:263-291`). Se o CPF/CNPJ for inválido, o Asaas recusa e o service
devolve:

```ts
if (createPaymentId.isLeft()) return left(new PaymentError(createPaymentId.value.message));
```

`PaymentError` → `error.handler.ts:63` → 400 com `code: 'PAYMENT_ERROR'` e a **descrição
real do Asaas** ("CPF inválido", em PT) na `message`.

No WEB, pelo mesmo defeito do A1, o `code` ganha do texto:
`api-error.ts:98-99` → `PAYMENT_ERROR: "Não foi possível processar o pagamento. Confira os dados e tente novamente."`

**O que o cliente vive:** digita um CPF errado no cadastro e lê que houve problema com
um **pagamento** que ele nunca tentou fazer. Não sabe que o campo errado é o CPF.
Corrigir o A1 resolve este também.

**Risco adjacente (JÁ CONSTAVA — D6, continua aberto):**
`api:src/infra/shared/bank/asaas.ts:99` lê `connect.data.errors[0].description` sem
`?.` (idem `:148, 186, 206, 214, 230, 240`). Se o Asaas devolver HTML de proxy ou JSON
sem `errors` — cenário real com `ASAAS_KEY` inválida — dá `TypeError`. Hoje isso não
vaza mais stack (o filtro global captura), mas o cadastro morre com a mensagem
genérica e ninguém descobre a causa sem olhar o log do servidor.

---

### A10 — 736 decorators de validação sem `message`: nome do campo em inglês dentro de frase em português
**Severidade: MENOR** · **PARCIALMENTE JÁ CONSTAVA** (M2 falava em ~404; a base mudou)
· CONFIRMADO

**Contagem real** (`src/` inteiro, decorators class-validator excluindo `@IsOptional`):

| | |
|---|---|
| Total de decorators validadores | **2.080** |
| Com `message` customizado | **1.344 (64,6%)** |
| **Sem `message`** | **736 (35,4%)** |

Por DTO (`src/infra/http/controllers/**`, 86 arquivos):
- **58 de 86 DTOs** têm pelo menos um decorator sem `message`.
- **11 DTOs** não têm **nenhum**.

Isso **não** produz mais texto em inglês: `validationMessage.translator.ts` traduz os
28 templates padrão do class-validator num ponto só. O que sobra é o **nome técnico do
campo**, que o tradutor preserva de propósito (`:104-120`). Resultado real:
`"O campo animalId é obrigatório."`, `"O campo dueDate deve ser um texto."`

Os DTOs dos fluxos mais usados, medidos um a um:

| Fluxo | Arquivo | validadores | com `message` | sem |
|---|---|---|---|---|
| Atendimento | `appointment/dto/appointment.dto.ts` | 50 | **0** | 50 |
| Cliente | `client/dto/client.dto.ts` | 37 | **0** | 37 |
| Fatura | `invoice/dto/invoice.dto.ts` | 47 | 5 | 42 |
| Propriedade | `studFarm/dto/studFarm.dto.ts` | 31 | 16 | 15 |
| Animal | `animal/dto/animal.dto.ts` | 27 | 13 | 14 |
| Pagamento | `finance/dto/payment.dto.ts` | 50 | 41 | 9 |
| Transação | `finance/dto/transaction.dto.ts` | 78 | 73 | 5 |

**Atendimento e Cliente estão em 0%.** Não são fluxos de canto: são os dois mais
usados do produto.

Piores casos gerais: `appointment.dto.ts` (50 sem), `reproductionStallionPhysical.dto.ts`
(45), `invoice.dto.ts` (42), `reproductionReceptorGyno.dto.ts` (38),
`client.dto.ts` (37), `adminTutorials.dto.ts` (34), `adminAds.dto.ts` (29),
`adminPlan.dto.ts` (22), `adminCoupon.dto.ts` (21).

**Ressalva honesta:** enquanto o A1 não for corrigido, **nada disso chega à tela no
WEB** — todo 400 vira "Confira os dados informados". O impacto de A10 só aparece
depois de corrigir o A1. No APP e no ADM já aparece hoje.

**Correção:** priorizar `appointment.dto.ts` e `client.dto.ts` (87 decorators, os dois
fluxos mais usados), depois `invoice.dto.ts`. Alternativa mais barata: um mapa
`campo → rótulo PT` dentro do próprio `validationMessage.translator.ts`, resolvendo os
736 num arquivo só em vez de editar 58 DTOs.

---

### A11 — API: o 500 cru acabou (item (a) do escopo — corrigido, confirmado)
**Severidade: — (registro de estado)** · **JÁ CONSTAVA como parcial** · CONFIRMADO CORRIGIDO

Registro o que **funciona**, porque o STATUS-VERIFICADO lista isso como pendente:

- `main.ts:36` — `app.useGlobalFilters(new AllExceptionsFilter())` de fato registrado.
- `all-exceptions.filter.ts:35` — `@Catch()` sem argumento: pega tudo.
- `:65-76` — exceção não-HTTP loga `error.stack` no servidor e responde
  `{ statusCode: 500, message: GENERIC_ERROR_MESSAGE, code: 'INTERNAL_SERVER_ERROR' }`.
  `GENERIC_ERROR_MESSAGE` = *"Não foi possível concluir a operação. Tente novamente em
  alguns instantes e, se o problema continuar, entre em contato com o suporte."*
- `error.handler.ts:100-107` — `default` também loga e devolve o genérico, não
  `error.message`.
- As **10** classes de `src/core/errors/errors/` estão em PT (verifiquei uma a uma).
- Guards em PT (confirmado no STATUS e não regredido).
- Upload: `file.controller.ts:36-60` valida tamanho e mimetype com mensagens PT
  específicas ("Tipo de arquivo não permitido (x). Envie imagem, PDF ou vídeo.").

**Nenhum stack, nenhuma mensagem interna, nenhum "Internal server error" chega ao
corpo da resposta.** Isso está resolvido nos 4 repos no que depende da API.

---

### A12 — Falha silenciosa: varredura completa de `catch` vazio / só-console
**Severidade: MENOR** · **NOVO (a contagem)** · CONFIRMADO

Rodei uma varredura programática nos 4 repos procurando `catch` com corpo vazio ou só
`console.*`. **Resultado bem melhor do que a auditoria anterior sugeria:**

| Repo | `catch` vazio | só `console` |
|---|---|---|
| WEB | 1 | 0 |
| APP | 1 | 0 |
| ADM | 0 | 0 |
| API | 1 | 2 |

Ocorrências, uma a uma:
- `web:app/(auth)/register/page.tsx:63` — ViaCEP. Comentado (`// ignore`). Correto:
  CEP não encontrado não deve travar o cadastro.
- `app:components/ui/AttachmentChip.tsx:210` — `decodeURIComponent` de URL malformada.
  Comentado e com fallback ("Anexo N"). Correto.
- `api:client.service.ts:106` — **vazio e sem comentário.** Não determinei o que
  engole (ver Dúvidas).
- `api:animal.service.ts:116` e `:206` — só `console.log('[AnimalService] Vínculo
  automático com propriedade: ...')`. Log de produção sem `Logger`, e a falha do
  vínculo automático animal↔propriedade é engolida.

Complementar, `.catch(() => {})` inline: 18 no WEB (todos lidos, cobertos pelo A7),
2 no APP (`AdsCarousel.tsx:73` — abrir anúncio falha em silêncio; e
`SessionContext.tsx:144` — gravação no SecureStore), 0 no ADM.

---

## Dúvidas em aberto

1. **`api:client.service.ts:106` — `catch` vazio sem comentário.** Vi a ocorrência na
   varredura mas não abri o método completo para saber que operação ela engole
   (parece estar perto do fluxo de vínculo cliente↔propriedade). Se for uma escrita, é
   sucesso falso. Não classifiquei por falta de leitura — precisa de 5 minutos.

2. **Comportamento real do toast ao receber um array.** Três achados (A1 residual, A6.2,
   A8) dependem de o quê o `sonner` (ADM) e o `react-native-toast-message` (APP)
   fazem quando `message`/`text1` é um array de strings. Meu palpite é concatenação sem
   separador, mas **não executei**. Marcados como SUSPEITO onde isso é o ponto.

3. **Os 16 arquivos do APP que chamam a API sem `getApiErrorMessage`.** Medi a adoção
   (6/22) e abri só o `InvoicePaymentSheet`. Não sei quantos dos outros 15 exibem
   mensagem crua, quantos falham em silêncio e quantos já têm texto PT hardcoded
   adequado. É a maior lacuna de cobertura deste relatório.

4. **Cadastro de conta com senha fraca.** `RegisterUserDto` (`User.dto.ts:107-110`)
   **não tem `@MinLength`** — a API aceita senha de 1 caractere. O bloqueio existe só
   no HTML (`register/page.tsx:201`, `minLength={6}`). Não confirmei se o componente
   `Input` compartilhado repassa o atributo `minLength` ao `<input>` nativo; se não
   repassar, não há validação de senha em lugar nenhum. Não é bug de mensagem (por
   isso não virou achado), mas cai no mesmo fluxo e vale checar.

5. **SMTP fora no cadastro.** `User.service.ts:63-70` (`sendWelcomeSafe`) engole a
   falha e loga — a conta é criada e o login acontece normalmente. Está correto para o
   e-mail de boas-vindas. Não segui o mesmo caminho para os e-mails de recuperação de
   senha neste bloco (o STATUS diz que já viraram `EmailDeliveryError` com 503 e code
   `EMAIL_DELIVERY_FAILED`, mapeado nos três fronts — **não reverifiquei**).

6. **Banco fora.** Por leitura, o `PrismaClientInitializationError` não é
   `HttpException`, cai no ramo `:65-76` do filtro e vira o 500 genérico PT com stack
   só no log. Fecha no código; não testei.
