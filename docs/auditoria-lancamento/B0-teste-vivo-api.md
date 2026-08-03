# B0 — Teste vivo contra a API real

Diferente dos outros blocos, este não é leitura de código: é a API rodando de
verdade, com banco de verdade, recebendo requisições de verdade. Vários destes
achados **não aparecem na leitura estática** — só quando a request é feita.

## Ambiente

| Item | Valor |
|---|---|
| API | `localhost:3333`, `npm run start:dev`, branch `main` pós-merge |
| Banco | container `vetequus-local`, PostgreSQL, porta 5442, 76 migrations aplicadas |
| Asaas | `https://sandbox.asaas.com` — nenhuma cobrança real foi criada |
| E-mail | `MAIL_DRIVER=log` — nenhum e-mail real foi enviado |

Conta de teste criada do zero: `Clinica Equina 1785683647`, empresa
`2518b1ad-…`, usuário `dc9a3120-…`.

## Cobertura

**Verificado ao vivo:** registro (sucesso e 4 modos de falha), login (3 modos),
criação de cliente, propriedade, animal (com e sem cliente), atendimento com
animal vinculado, persistência no banco, fatura, visão do cliente final,
tentativa de pagamento, login do proprietário, isolamento multi-tenant (GET/PUT
sobre recurso de outra empresa), superfície do token de cliente (16 rotas),
integridade UTF-8 ponta a ponta.

**Não verificado aqui:** checkout de assinatura com cartão, webhook do Asaas
(precisa de evento do gateway), fichas clínicas individuais, estoque, CRM,
telas do web/ADM em navegador. Esses estão nos blocos B1–B8 ou pendentes.

---

## BLOQUEIA — Proprietário consegue criar cliente e animal no sistema

**Confirmado ao vivo.** Com o token do app (persona 3, `type: client`,
`companyId: 'no-company'`):

```
POST /client  -> 201   (criou o cliente "Injetado")
POST /animal  -> 201   (criou o animal "X")
```

O animal foi gravado com **`companyId` vazio** — um registro órfão que não
pertence a clínica nenhuma:

```
id                                   | name | companyId | clientId
24674a7e-1a12-44b2-953c-efb60c893e0d | X    |  (null)   | e3cedbd4-…
```

As duas rotas não checam o tipo do token. Qualquer proprietário com o app
instalado injeta linhas na base — sem limite, sem dono, sem rastro de clínica.

**Contraste:** as demais rotas de clínica reagem certo ao mesmo token —
`/transaction`, `/payment`, `/user`, `/company` devolvem 403; `/animal` (GET),
`/client` (GET), `/invoice`, `/product` devolvem 400. Só os **POST** passaram.

**Correção:** exigir `tokenType === 'user'` no `POST /client` e no `POST
/animal`. Cuidado ao implementar: esta base já teve seis casos de checagem que
existe e nunca dispara — teste com token de cliente depois de corrigir.

---

## BLOQUEIA — Código de clínica errado derruba a API com 500

**Confirmado ao vivo.** Entrar numa clínica existente com código inválido:

```
POST /user/register  {"companyCode":"NAOEXISTE999","newCompany":false}
-> HTTP 500 {"message":"Não foi possível concluir a operação…"}
```

Causa raiz no log: `companies.code` é coluna **UUID**, e o Prisma estoura ao
comparar com texto livre.

```
PrismaClientKnownRequestError: Inconsistent column data:
Error creating UUID, invalid character: … found `N` at 1
  at PrismaCompanyRepository.findByCode (prismaCompany.repository.ts:83)
  at UserService.register (User.service.ts:341)
```

É exatamente o caso que o dono citou: erro 500 em vez de "código de clínica não
encontrado". E derruba o fluxo de **adicionar veterinário à equipe** — que é
como uma clínica cresce.

Agrava: sendo o código um UUID de 36 caracteres, o veterinário precisa digitar
ou colar isso. Qualquer erro de digitação cai no 500.

**Correção:** validar o formato UUID antes da consulta e devolver mensagem
clara. Vale reavaliar se o código da clínica deveria ser um UUID.

---

## BLOQUEIA — Cadastro sem endereço responde "Registro não encontrado"

**Confirmado ao vivo.**

```
POST /user/register  (sem address/number/postalCode, newCompany=true)
-> HTTP 404 {"message":"Registro não encontrado. Confira os dados informados…"}
```

`user.service.ts` devolve `ResourceNotFoundError` quando falta endereço. O
usuário lê "registro não encontrado" para um problema de campo obrigatório.

Pior: no `RegisterUserDto` esses campos estão `@IsOptional()`, então a
validação passa e o erro só aparece depois — sem dizer qual campo faltou.

**Correção:** validar no DTO (condicional a `newCompany=true`) e devolver 400
nomeando o campo.

**Positivo:** com o payload completo a mensagem fica correta —
`"O CPF/CNPJ informado é inválido."` E os erros de formato já saem em português
com o nome do campo: `"O email deve ser válido"`, `"O campo Telefone é
obrigatório"`.

---

## BLOQUEIA — Criar animal sem cliente responde "Registro não encontrado"

**Confirmado ao vivo**, exatamente como a auditoria anterior previa:

```
POST /animal  (sem clientId)
-> HTTP 404 {"message":"Registro não encontrado…"}
```

O veterinário que esquece de escolher o proprietário não faz ideia do que fazer.

---

## GRAVE — Proprietário loga com o próprio CPF como senha

**Confirmado ao vivo.** Cliente criado pela clínica, sem senha definida:

```
POST /client/auth  {"email":"prop…@teste.com","password":"32684848084"}
-> HTTP 201 + accessToken
```

A senha é o CPF. Não há convite, não há troca obrigatória no primeiro acesso.
Quem souber o CPF e o e-mail entra na conta e vê o histórico clínico e
financeiro daquele proprietário.

Token emitido: `{sub: <clientId>, companyId: 'no-company', type: 'client'}`.

---

## GRAVE — Conta nova nasce sem assinatura e sem trial

**Confirmado ao vivo.** Logo após o registro bem-sucedido:

```
GET /signature/current -> {"hasActiveSignature":false,"currentPlan":null,"signature":null}
```

Nenhum trial é iniciado automaticamente. Precisa ser confirmado no web se a
clínica recém-cadastrada consegue efetivamente entrar no sistema ou se cai
direto no paywall — se cair, o funil de entrada morre no primeiro passo.

---

## MENOR — POST /appointment devolve 201 com corpo vazio

Mesmo padrão já conhecido de `/animal` e `/stud-farm`: quem cria não recebe o
recurso criado, então o front não consegue auto-selecionar nem navegar para o
item. O atendimento **persistiu corretamente** (confirmado no banco e via
`GET /appointment/fetch`) — o problema é só o retorno vazio.

---

## MENOR — Mensagem de validação com nome técnico em inglês

```
POST /invoice {"value":350}  ->  ["amount deve ser um número"]
```

Frase em português com o nome interno do campo. O usuário não sabe o que é
"amount". Padrão já catalogado na auditoria anterior; confirmado que persiste.

---

## O que passou no teste

Registrado aqui de propósito — serve para não gastar tempo reauditando:

- **Isolamento entre clínicas está segurando.** Com o token da clínica A sobre
  recursos da clínica B: `GET /animal/:id` → 404, `PUT /animal/:id` → 404 (o
  nome no banco permaneceu inalterado), `GET /appointment-animal/details/:id`
  → 403. As correções de multi-tenant funcionaram.
- **UTF-8 íntegro ponta a ponta.** Testado com escapes ASCII puros para
  eliminar interferência do shell: traço longo, ponto médio e acentuação
  gravaram corretos no banco (`e28094`, `c2b7`, `c3a7c3a3`) e voltaram
  corretos pela API. **Não há bug de encoding** — uma corrupção observada em
  teste anterior era do terminal Windows, não do sistema.
- **Login trata falhas bem.** Senha errada e e-mail inexistente devolvem a
  mesma mensagem em português (`"E-mail ou senha incorretos"`), sem permitir
  enumerar quem tem conta.
- **Pagamento sem walletId avisa direito:** `"A empresa ainda não possui PIX
  configurado. Entre em contato com o estabelecimento."`
- **Fatura chega ao cliente final** com valor, vencimento, animal e descrição
  via `GET /client-invoice`.
- **Persistência confere.** Cliente, propriedade, animal, atendimento e fatura
  foram lidos de volta do banco após a criação.

---

# Segunda rodada de teste vivo

Após a correção das fichas. Mesmo ambiente (API local, banco local, Asaas sandbox).

## BLOQUEIA — Trial vira um ano pago sem pagamento (D1 provado)

Não é mais leitura de código. Sequência real:

```
antes:  status=TRIAL   expirationDate=2026-08-09
POST /signature/pix/33231be6-…  {"yearly": true}
depois: status=ACTIVE  expirationDate=2027-08-02
```

Um ano de sistema por pedir o QR Code. Nenhum pagamento ocorreu.

**Como isso aparece para a equipe Equinology:** o `GET /admin/financial/summary`
devolveu `activeSubscriptions: 2` enquanto a única transação da conta estava
`PENDING`. A equipe vê dois clientes ativos e um deles nunca pagou.

## BLOQUEIA — Renovação por PIX nunca estende a assinatura

Confirmado no código após teste inconclusivo. Em
`companySignature.service.ts:444`, o ramo PIX só age quando
`signature.status === 'INACTIVE'`. Uma assinatura já ACTIVE que recebe o
pagamento do ciclo seguinte não tem a validade estendida — o `paymentId` é
atualizado e nada mais. O ramo de CREDIT_CARD (`:466`) faz certo, comparando
`signature.paymentId !== paymentId`.

Resultado: a clínica paga o 2º mês e é bloqueada quando a data vence.

## BLOQUEIA — Validade definida pelo ADM vale um dia a menos

Teste real:

```
admin envia expirationDate = 2026-08-10T00:00:00.000Z
banco grava          2026-08-10 00:00:00
em horário de Brasília  2026-08-09 21:00:00
```

O admin escolhe 10/08 e o acesso da clínica cai às 21h do dia 09.

## GRAVE — PATCH /admin/signature devolve a entidade de domínio crua

A resposta vem como `{"signature":{"_id":"…","props":{…}}}` — o objeto interno
serializado, sem passar por presenter. Expõe a estrutura interna e obriga o ADM
a conhecer o formato `props`. Todos os outros endpoints do ADM usam presenter.

## GRAVE — 90 campos com a mesma mensagem de validação duplicada

O usuário vê o mesmo erro duas vezes. Causa: `@IsString` e `@IsNotEmpty` (ou
`@IsEnum` e `@IsNotEmpty`) do mesmo campo recebem texto idêntico, e quando o
campo vem ausente os dois disparam.

Exemplo real do CRM ao criar fase:
`["Insira uma ordem valida", "Insira uma ordem valida", "Escolha uma opção
válida", "Escolha uma opção válida", …]`

Atinge login, cadastro, recuperação de senha, pagamento, conta bancária e CRM.
Contagem por varredura dos DTOs: **90 campos**.

## GRAVE — Mensagem de validação com o texto de outro campo

`CreateLeadDto.animalQuantity` tem
`@IsNotEmpty({ message: 'Insira uma valor de crédito válida' })` — fala em valor
de crédito num campo de quantidade de animais. Erro de cópia; o usuário recebe
uma instrução sobre um campo que não existe no formulário.

## MENOR — POST /product-category devolve 201 com corpo vazio

Confirmado. É a causa do achado já mapeado de o front ter que localizar a
categoria recém-criada **pelo nome**. Note a inconsistência: `POST /product`
devolve `{product:{…}}` corretamente; `POST /product-category` e
`POST /appointment` devolvem vazio.

## O que passou nesta rodada

- **Fichas clínicas: 40 de 40 salvam** preenchendo apenas os campos que a tela
  marca. Antes eram 15 de 40.
- **Estoque funciona fim a fim**: categoria, produto, entrada de estoque e
  estatística (o saldo subiu para 10 corretamente).
- **CRM**: empresa nova nasce sem fases, mas o web tem modal de criar fase
  (`CreateBoardModal.tsx`) — não é bloqueio.
- **ADM lê tudo corretamente**: empresas, assinaturas, usuários, cupons,
  resumo e transações do financeiro respondem 200 com dado coerente.
