# F1-conta-usuario-empresa

Data: 2026-08-02 | API: http://localhost:3333 (rodando) | Banco: vetequus-local
Nenhum arquivo da API foi alterado. Apenas leitura de codigo + chamadas HTTP + SQL.

## Fixture usada (isolada)

| item | valor |
| --- | --- |
| Empresa A (com trial) | `7f5174fb-6c85-406f-8a5a-8a481ce998dd` "Clinica F1" |
| Admin A | `729ee652-94a2-484b-b782-b8357574646f` / `f1a.1785691444@teste.com` |
| Plano | Plano Demo, `userQuantity=10`, trial 7 dias |
| Empresa B (SEM assinatura) | `24d31ce9-76e6-4d65-a79f-1f70f2a913ae` "Clinica Sem Plano" |
| Cliente A | `23e0a56a-9a29-415a-9f06-0418156df5b9` |
| Cliente autocadastrado | `490e3e48-5805-467d-b516-e17f50fd6117` |
| Empresa alheia usada nos testes de isolamento | `f4e2f01e-49fb-4ccd-b02c-df1d645aeca5` |

## Cobertura: 24 / 24 rotas do conjunto

Todas exercitadas. Nao ficou nada de fora.

- `/user` (10): `POST /user/register`, `POST /user/signin`, `POST /user`, `GET /user`,
  `GET /user/limit-info`, `PUT /user/:userId`, `PUT /user/password`, `PUT /user/profile`,
  `PATCH /user/token`, `DELETE /user/:userId`
- `/company` (2): `GET /company`, `PUT /company`
- `/password-code` (2): `POST /password-code`, `GET /password-code/:code`
- `/client/password-code` (3): `POST`, `GET /:code`, `PUT`
- Cliente (8 - 7 rotas distintas + 1 do conjunto): `POST /client/auth`, `POST /client/register`,
  `POST /client/link`, `POST /client/token`, `DELETE /client/me`,
  `DELETE /client/:clientId/unlink`, `GET /client/cpf/:cpf`, `GET /client/profile`

Fora do meu conjunto e NAO testado (de outro agente): `POST /client`, `PUT /client/:clientId`,
`GET /client`, `DELETE /client/:clientId` (usei so como apoio para montar fixture).

---

## Achados

### 1. BLOQUEIA - Usuario excluido continua com acesso TOTAL a API por ate 90 dias (CONFIRMADO)

O JWT nao tem revogacao nem checagem de existencia do usuario no guard. Depois do
`DELETE /user/:userId`, o token que aquele usuario ja tinha em maos continua lendo E
ESCREVENDO dados da empresa. Demitir/desligar alguem no painel nao corta o acesso dele.

Reproducao:
```
POST /user/signin  {"email":"f1u4...@teste.com","password":"Senha@12345"}  -> 201, token T4
DELETE /user/5e072d97-8ad7-42f6-8597-31e33e19e08f  (Bearer admin)          -> 200 (some do banco)
POST /user/signin  (mesmo email/senha)                                     -> 401 (ok)
GET  /user            (Bearer T4)                                          -> 200 + lista da equipe
GET  /client?page=1   (Bearer T4)                                          -> 200 + lista de clientes
PUT  /client/23e0a56a-9a29-415a-9f06-0418156df5b9 (Bearer T4) {"name":"Alterado Por Excluido"} -> 200
GET  /client/cpf/14026245225 (Bearer admin) -> name == "Alterado Por Excluido"  <-- gravou
```
Validade do token: `iat 1785691807 / exp 1793467807` = 90 dias. So `GET /company` e
`PATCH /user/token` devolvem 404 (esses dois batem no banco); o resto do sistema nao.

Impacto: ex-funcionario mantem leitura e escrita de clientes, animais, fichas e financeiro
por 3 meses. Nao existe logout forcado nem blacklist.

---

### 2. BLOQUEIA - `DELETE /user/:userId` de veterinario que ja atendeu devolve 500 (CONFIRMADO)

Todas as FKs de ficha/atendimento para `users` sao `ON DELETE RESTRICT` (54 FKs; `appointments`,
`general_*`, `orthopedic_*`, `reproduction_*`, `dentistry_*`, `notes`, `reminders`...).
O service `deleteUser` chama `userRepository.delete` direto, sem checar vinculo, e a violacao
de FK vira 500 generico. Ou seja: na pratica so da para excluir usuario que nunca fez nada.

Reproducao:
```
POST /appointment {"type":"SERVICE","startDate":"2026-08-05T13:00:00.000Z",
  "endDate":"2026-08-05T14:00:00.000Z","userId":"<U2>","studFarmId":"<SF>",
  "animals":[{"animalId":"<A>","appointmentType":"Consulta"}]}      -> 201
DELETE /user/76c0e458-0ab9-403b-97c5-b1812cd53794 (Bearer admin)    -> 500
   {"code":"INTERNAL_SERVER_ERROR","message":"Nao foi possivel concluir a operacao..."}
SQL: SELECT COUNT(*) FROM users WHERE id='76c0e458-...'  -> 1  (nada foi excluido)
```
Impacto: o botao "excluir usuario" simplesmente nao funciona para o caso real, e a mensagem
nao diz o motivo. O admin fica sem saber que precisa reatribuir os atendimentos. Pior: como
a vaga do plano nao libera, ele tambem nao consegue trocar um colaborador por outro.

---

### 3. GRAVE - Sete rotas devolvem 500 para id/uuid malformado (CONFIRMADO)

O `where: { id }` do Prisma estoura com uuid invalido e nao ha `ParseUUIDPipe` nem validacao
no DTO. Entrada malformada tem que dar 400/404, nao 500.

| chamada | observado |
| --- | --- |
| `PUT /user/abc` (Bearer admin) `{"name":"X"}` | **500** |
| `DELETE /user/abc` (Bearer admin) | **500** |
| `POST /user/register` `{"newCompany":false,"companyCode":"nao-existe",...}` | **500** |
| `POST /client/token` `{"clientId":"abc"}` | **500** |
| `POST /client/token` `{}` (sem clientId) | **500** |
| `POST /client/link` `{"clientCode":"abc"}` | **500** |
| `DELETE /client/abc/unlink` | **500** |

Com uuid bem formado porem inexistente todas devolvem 404 limpo — o problema e so o formato.
O caso do `companyCode` e o mais visivel: qualquer pessoa que digitar errado o codigo de
convite no cadastro publico recebe "erro interno, contate o suporte".

Causa adicional em `POST /client/token`: o corpo esta tipado inline como
`@Body() body: { clientId: string }` (client.controller.ts), sem DTO, entao nao passa pelo
ValidationPipe — por isso `{}` vira 500 em vez de 400.

---

### 4. GRAVE - Codigo de recuperacao de senha e reutilizavel a vontade (CONFIRMADO)

Nem `PUT /user/password` nem `PUT /client/password-code` invalidam/apagam o codigo depois de
usar. O registro fica na tabela e vale por 30 min (entidade) / 1 h (query do repositorio),
podendo trocar a senha N vezes.

Reproducao (usuario):
```
POST /password-code {"email":"f1a...@teste.com"}   -> 201
SQL: SELECT code FROM recover_password_codes WHERE "userId"='729ee652-...'  -> ke5xr0
PUT /user/password {"code":"ke5xr0","password":"NovaSenha@999"}  -> 200
SQL: o registro ke5xr0 CONTINUA na tabela
PUT /user/password {"code":"ke5xr0","password":"Reuso@12345"}    -> 200
POST /user/signin  {"password":"Reuso@12345"}                    -> 201  (funcionou)
```
Mesmo comportamento em `PUT /client/password-code` com o codigo `qwif45`: reusei e o
`POST /client/auth` com a segunda senha voltou 201.

Impacto: quem interceptar o e-mail (ou ler o codigo em log — `MAIL_DRIVER=log`) pode retomar
a conta repetidas vezes na janela; a vitima trocar a senha de novo nao expulsa o atacante,
porque o codigo dele continua valendo.

---

### 5. GRAVE - Empresa sem assinatura vigente = usuarios ILIMITADOS (CONFIRMADO)

`CompanyUserLimitService.checkCanAddUser` retorna `null` (libera) quando nao ha assinatura
vigente. Como "sem assinatura vigente" inclui **trial expirado e plano cancelado/vencido**,
o limite do plano deixa de existir exatamente quando deveria apertar.

Reproducao:
```
POST /user/register (nova empresa, SEM start-trial)  -> 201
GET  /user/limit-info -> {"currentUsers":1,"maxUsers":0,"planName":"Sem plano ativo","hasActiveSignature":false}
POST /user x15 (Bearer admin da empresa B)           -> 15x 201
GET  /user/limit-info -> {"currentUsers":16,"maxUsers":0,...}
```
Impacto duplo: (a) burla comercial — deixa o plano vencer e cadastra equipe infinita;
(b) o payload devolvido e incoerente (`currentUsers: 16` com `maxUsers: 0`), a tela de plano
vai mostrar "16 de 0 usuarios".

---

### 6. GRAVE - Nenhuma politica de senha; senha de 1 caractere e aceita em todos os caminhos (CONFIRMADO)

`AuthenticateUserDto`, `CreateUserDto`, `RegisterUserDto` e `RecoverPasswordDto` so tem
`@IsString` + `@IsNotEmpty`. Sem tamanho minimo, sem complexidade.

```
PUT  /user/password {"code":"ke5xr0","password":"a"}  -> 200
POST /user/signin   {"email":"f1a...","password":"a"} -> 201 (token emitido)
POST /user          {...,"password":"1"}              -> 201 (colaborador criado com senha "1")
```
Combinado com o throttle de 10 tentativas/min no login, uma senha de 1 digito e quebravel
em segundos. Vale para o app do proprietario tambem.

---

### 7. GRAVE - `PUT /company` grava CNPJ sem nenhuma validacao (CONFIRMADO)

`EditCompanyDto.cnpj` e apenas `@IsString`. O CNPJ da clinica aparece em fatura/PDF e e o
documento usado no cadastro de pagamento.

```
PUT /company {"cnpj":"nao-eh-cnpj-123456789"}  -> 200
SQL: SELECT cnpj FROM companies WHERE id='7f5174fb-...' -> nao-eh-cnpj-123456789
```
Contraste: no `POST /user/register` o CNPJ e validado (o Asaas recusa e a API devolve 400).
A edicao passa batido. Mesmo caso para `postalCode` e `phone` (sem formato) e para `name`,
que aceitou 5.000 caracteres (`SELECT length(name)` = 5000) e volta inteiro no `GET /company`.

---

### 8. GRAVE - Conta de cliente "excluida" (soft delete) mantem a sessao viva (CONFIRMADO)

`DELETE /client/me` marca `deletedAt` e o `POST /client/auth` passa a devolver 401 — mas o
token que o app ja tem continua funcionando.

```
DELETE /client/me       (Bearer token do cliente)  -> 200
POST   /client/auth     (email+senha do cliente)   -> 401  (ok)
GET    /client/profile  (mesmo token de antes)     -> 200 + dados completos do cliente
```
Impacto: "excluir minha conta" no app nao encerra a sessao; quem estiver com o aparelho segue
acessando os dados ate o token expirar (90 dias). Mesma raiz do achado 1.

---

### 9. MENOR - `updatedAt` da empresa nunca e atualizado (CONFIRMADO)

Depois de 4 `PUT /company` bem-sucedidos, `updatedAt` continua igual ao `createdAt`
(`2026-08-02 17:24:05.534`). Qualquer tela/relatorio de "ultima alteracao" fica errado.

---

### 10. MENOR - Mensagens de validacao repetidas 2-3x para o mesmo campo (CONFIRMADO)

```
POST /password-code {} ->
  ["Insira um email valido","Insira um email valido","Insira um email valido"]
PUT /user/password {"password":"x"} ->
  ["Informe um codigo valido","Informe um codigo valido"]
```
Todos os decorators do campo usam a mesma string, entao o front exibe o erro triplicado.

---

### 11. MENOR - Campo enviado vazio e descartado em silencio no perfil (CONFIRMADO)

`PUT /user/profile {"name":""}` -> 200, mas o nome nao muda (`if (name)` no service).
A API responde sucesso para uma operacao que nao aconteceu. O front que limpar o campo por
engano recebe "salvo" sem nada salvo. (Comportamento e intencional no codigo — o problema e
responder 200 em vez de 400.)

---

### 12. MENOR - `POST /user` devolve 201 com corpo vazio (CONFIRMADO)

Nao retorna o usuario criado nem o id — o front precisa refazer `GET /user` para descobrir
quem foi criado. `POST /client` ja foi corrigido para devolver o recurso; `POST /user` nao.
Mesmo caso em `PUT /user/profile`, `PUT /user/:userId`, `PUT /company`, `POST /client/link`
(todos 200/201 vazios).

---

## O que passou (nao precisa reauditoria)

**Limite de usuarios do plano — funciona e a mensagem e clara.**
Com Plano Demo (`userQuantity=10`), criei ate o 10o usuario (201) e o 11o devolveu:
```
403 {"code":"COMPANY_USER_LIMIT_EXCEEDED",
     "message":"Voce atingiu o limite de usuarios do seu plano. Remova um usuario existente
                ou faca upgrade do plano para incluir mais."}
```
`GET /user/limit-info` acompanhou corretamente: 1 -> 10 -> (apos deletar 1) 9.
O mesmo bloqueio dispara no cadastro publico por `companyCode` (`POST /user/register`
com `newCompany:false`) — testado, 403 com a mesma mensagem. **Ressalva: so vale se houver
assinatura vigente (achado 5).**

**`POST /client/token` — o furo antigo esta fechado.** Confirmei:
- cliente da propria empresa -> 201 + token `type:"client"`, `companyId:"no-company"`
- cliente de OUTRA empresa (`6112858d-...`, empresa `f4e2f01e-...`) -> **403 NOT_ALLOWED**
- clientId inexistente (uuid valido) -> 404

**Isolamento entre empresas (todos verificados no banco depois da tentativa):**
- `PUT /user/<id de outra empresa>` -> 403, `SELECT name,role` inalterado
- `DELETE /user/<id de outra empresa>` -> 403, usuario continua no banco
- `GET /client/cpf/390.533.447-05` (cpf de cliente de outra clinica, com e sem mascara) -> 404
- `DELETE /client/<id de outra empresa>/unlink` -> 404, `client_companies` continua com 1 linha
- `GET`/`PUT /company` nao aceitam id por parametro — companyId vem sempre do token

**Papeis (RBAC) — o guard de admin dispara de verdade.** Com token de um GESTOR:
`POST /user` 403, `PUT /user/:id` 403, `DELETE /user/:id` 403, `PUT /company` 403.
`DELETE /user/<eu mesmo>` -> 403 (nao da para se autoexcluir).
`PUT /user/profile {"role":"COLABORADOR"}` -> 200 mas o role **nao muda** (o controller nao
repassa `role` ao service) — escalada de privilegio por auto-edicao esta bloqueada.

**Separacao app do proprietario x web da clinica:**
- token `type:"client"` em `GET /user` -> 403 com mensagem propria da area
- token `type:"client"` em `GET`/`PUT /company` -> 403 com mensagem propria
- token de vet em `GET /client/profile` e `DELETE /client/me` -> 403 "Esta rota e exclusiva para clientes"

**Ida-e-volta de edicao (campo a campo, confirmado por GET):**
- `PUT /user/profile` -> `name`, `phone`, `crmv` persistiram. `email` tambem (testado a parte).
- `PUT /user/:userId` -> `name`, `phone`, `role`, `crmv`, `email` persistiram todos.
  Trocar o email realmente troca o login (`POST /user/signin` com o novo email -> 201).
- `PUT /company` -> `name`, `address`, `number`, `postalCode`, `phone`, `cnpj`, `walletId`,
  `logoUrl`, `pixKey`, `signatureUrl` persistiram todos. `paymentId` e `code` enviados no
  corpo foram **ignorados** (whitelist do DTO funciona) — nao da para sequestrar o cadastro
  de pagamento nem o codigo de convite.

**Unicidade de e-mail:** `POST /user`, `PUT /user/profile` e `PUT /user/:userId` com e-mail ja
usado -> 409 `RESOURCE_ALREADY_EXISTS` com `field:"email"`. `POST /client/register` idem.
Nenhum caiu em 500 por constraint do banco.

**Autenticacao:**
- `POST /user/signin` senha errada e e-mail inexistente devolvem **a mesma** 401
  ("E-mail ou senha incorretos") — nao da para enumerar contas. Idem `POST /client/auth`.
- Sem token -> 401 "Voce precisa estar autenticado..."; token corrompido -> 401 "Sua sessao expirou".
- `PATCH /user/token` renova e o `companyId` vem do banco (usuario excluido -> 404).

**Recuperacao de senha (fluxo feliz):**
`POST /password-code` -> 201 com mensagem generica identica para e-mail cadastrado e nao
cadastrado (nao vaza quem e cliente). `GET /password-code/<codigo>` -> 200; codigo invalido
-> 404. `PUT /user/password` -> 200, senha antiga passa a dar 401 e a nova loga.
Codigo de CLIENTE usado em `PUT /user/password` -> 403; codigo de USUARIO usado em
`PUT /client/password-code` -> 403. Os dois dominios nao se cruzam.

**Throttling ativo (confirmado disparando):** `POST /user/register` devolveu
`429 ThrottlerException` na 6a chamada dentro de 1 min. Limites lidos no codigo:
register 5/min, signin 10/min, `/password-code` 5/min, `/client/password-code` 5/min,
`/client/auth` 10/min, `/client/register` 5/min.

**Vinculo de cliente:** `POST /client/link` com `clientCode` -> 201 e o cliente aparece em
`GET /client?page=1`; link repetido -> 409; `DELETE /client/:id/unlink` -> 200, some da lista
e `client_companies` fica com 0 linhas, **mas o registro em `clients` e preservado** (1 linha) —
desvincular nao apaga o cliente, correto.

**Validacao de DTO (400 limpo, mensagem em portugues):** role fora do enum, e-mail invalido,
`name` numerico, corpo vazio em `POST /user`, `POST /client/auth` e `POST /client/link`,
`GET /client` sem `page`. Todos 400 `VALIDATION_ERROR`.
