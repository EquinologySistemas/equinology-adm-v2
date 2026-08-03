# F1-cadastros-cliente-propriedade-animal

Auditoria contra a API rodando em `http://localhost:3333`, com empresa própria
(isolada) criada para o teste. Nenhum arquivo `.ts` foi alterado.

Fixture usada:
- Empresa A: `b6cf7eee-ca90-4515-a100-82bbf3606049` (Clinica F1)
- Empresa B: `32711d70-3c56-4fae-b708-7973f3e1afce` (Clinica F1B) — usada só para provar tenant
- Clientes A: `f8b452dc…` (Cliente Um), `9b2c01f3…` (Cliente Dois)
- Propriedades A: `bebb891d…` (Haras Um), `843dca09…` (Haras Dois)
- Animal A: `cee34143…` (Trovao), code `9imrh6yv`

---

## Cobertura: 27 / 27 rotas do meu conjunto

### /client — 15/15 testadas
| # | Rota | Testada |
|---|---|---|
| 1 | `POST /client` | sim |
| 2 | `PUT /client/:clientId` | sim |
| 3 | `DELETE /client/:clientId` | sim |
| 4 | `DELETE /client/me` | sim (token de cliente + token de user) |
| 5 | `GET /client` | sim (paginação real com 12 registros, query, studFarmId) |
| 6 | `GET /client/cpf/:cpf` | sim |
| 7 | `GET /client/profile` | sim (token de cliente + token de user) |
| 8 | `POST /client/auth` | sim |
| 9 | `POST /client/register` | sim |
| 10 | `POST /client/link` | sim |
| 11 | `DELETE /client/:clientId/unlink` | sim |
| 12 | `POST /client/token` | sim |
| 13 | `POST /client/password-code` | sim |
| 14 | `GET /client/password-code/:code` | sim (code real lido do banco) |
| 15 | `PUT /client/password-code` | sim (fluxo feliz + reuso) |

### /stud-farm — 6/6 testadas
`POST /stud-farm`, `PUT /stud-farm/:id`, `GET /stud-farm`, `GET /stud-farm/client`,
`GET /stud-farm/code/:code`, `POST /stud-farm/:id/link` — todas com token de empresa
E com token de cliente onde aplicável.

### /animal — 6/6 testadas
`POST /animal`, `PUT /animal/:id`, `GET /animal`, `GET /animal/by-id/:id`,
`GET /animal/:code`, `POST /animal/register/:code`.

### Não testado / fora do conjunto
- Não existe `DELETE /stud-farm/:id` nem `DELETE /animal/:id` na API (ver achado A11).
  O enunciado falava em "CRUD completo"; o D não existe. Confirmado por `404 Cannot DELETE`
  e por leitura dos controllers.
- `client-portal/*` (7 rotas) tem prefixo próprio e não faz parte deste conjunto.
- Não exercitei o upload físico de foto (`photoUrl` é só uma string no DTO; não há
  rota de upload neste módulo). Testei a persistência do campo e a ausência de validação.
- Não medi comportamento sob concorrência (dois PUTs simultâneos no mesmo registro).

---

## Achados

### A1 — BLOQUEIA — Qualquer empresa sequestra o animal de outra com `POST /animal/register/:code` (CONFIRMADO)

A rota **substitui** `companyId` e `clientId` do animal em vez de criar um vínculo.
Não há nenhuma verificação de autorização: basta acertar o `code` (8 caracteres
alfanuméricos). A empresa/cliente original **perde o animal por completo**.

Reprodução:
1. Empresa A cria o animal Trovao → `code: 9imrh6yv`, `companyId: b6cf7eee…`
2. Empresa B (token totalmente alheio): `POST /animal/register/9imrh6yv` → **201**
3. Empresa A: `GET /animal?page=1&query=Trovao` → **200 `{"animals":[],"pages":0}`**
4. Empresa A: `GET /animal/by-id/cee34143…` → **404**
5. Empresa B: `GET /animal?page=1` → o Trovao aparece com `companyId: 32711d70…`

Depois o cliente "Cli App" (sem qualquer relação com A) repetiu o mesmo com token de
cliente e virou o **dono** do animal.

Evidência no banco (estado final, após A perder o animal duas vezes):
```
 id       | cee34143-7f35-4e3e-aabc-0471f35ca3e6
 name     | Trovao
 companyId| 32711d70-3c56-4fae-b708-7973f3e1afce   <- empresa B
 clientId | 1ec297e4-b9d7-4263-8e9e-9e4d287ab309   <- cliente alheio
```

Código: `src/domain/application/services/animal/services/animal.service.ts`, `registerByCode` —
`animal.companyId = companyId` / `animal.clientId = clientId` sem checar posse anterior.
Agrava: `GET /animal/:code` devolve o animal completo de qualquer tenant (200, provado),
então o code pode ser confirmado antes do roubo.

---

### A2 — BLOQUEIA — `PUT /animal/:id` regenera o `code` do animal a cada edição (CONFIRMADO)

Qualquer edição — inclusive **PUT com corpo vazio** — troca o código de vínculo do animal.
Todo código já entregue a um proprietário deixa de funcionar em `GET /animal/:code` e
`POST /animal/register/:code`.

Reprodução:
```
POST /animal            -> code: wet2hv0u
PUT /animal/:id {name}  -> code: lxeg724z
PUT /animal/:id {name}  -> code: cfuqqnge
PUT /animal/:id {name}  -> code: x2usowxo
PUT /animal/:id {}      -> code: tbztgsiq
```
`stud-farm` e `client` mantêm o code corretamente sob PUT — o defeito é só do animal.

Código: `animal.service.ts:193-195` — `if (safeCompanyId) { animal.code = generateRandomString(8); }`
dentro do `edit`.

---

### A3 — BLOQUEIA — Propriedade sem cliente é visível E editável por TODAS as empresas (CONFIRMADO)

`stud_farms` não tem coluna `companyId`; a posse é derivada por vínculos. O último ramo
do `companyScope` libera qualquer propriedade sem cliente/animal/atendimento para
**todo tenant**. Isso não é teórico: acontece em dois caminhos normais de uso.

**Caminho 1 — cadastro sem cliente** (o cliente é opcional no formulário):
```
A: POST /stud-farm {"name":"Haras Sem Dono F1"}   -> 201
B: GET /stud-farm?page=1                          -> 200, a propriedade de A aparece
B: PUT /stud-farm/<id> {"name":"ORFA SEQUESTRADA POR B","city":"HackCity"} -> 200
```

**Caminho 2 — excluir o cliente** (a FK é `ON DELETE SET NULL`, então a propriedade
vira órfã e cai no mesmo buraco). Este é o pior, porque a propriedade já tem dados reais:
```
A: cria cliente + POST /stud-farm {"name":"CADEIA HARAS SIGILOSO","city":"Bauru",
     "address":"Fazenda secreta","responsibleName":"Fulano","responsiblePhone":"11988112233"}
B: GET /stud-farm?page=1&query=CADEIA  -> {"studFarms":[],"pages":0}   (ok, ainda isolado)
A: DELETE /client/<id>                 -> 200
B: GET /stud-farm?page=1&query=CADEIA  -> 200, retorna a propriedade INTEIRA:
   endereço "Fazenda secreta", cidade Bauru, responsável Fulano, telefone 11988112233
B: PUT /stud-farm/<id> {"name":"ROUBADA","responsiblePhone":"00000000000"} -> 200
```
Confirmado no banco:
```
 97519ddd-3f63-4773-8225-6b9d910b94f3 | ROUBADA | 00000000000 | clientId NULL
 38ab51e0-c09e-4640-a4c4-3e4a6c323f51 | ORFA SEQUESTRADA POR B |  | clientId NULL
```
Vaza dado cadastral de cliente entre tenants e permite escrita cruzada.

Código: `src/infra/shared/database/prisma/repositories/prismaStudFarm.repository.ts`,
método `companyScope`, ramo `AND: [{clientId: null}, {ClientStudFarm: none}, {Animal: none}, {Appointment: none}]`.

---

### A4 — BLOQUEIA — Código de recuperação de senha do cliente é reutilizável para sempre (CONFIRMADO)

`PUT /client/password-code` não invalida o código depois de usado. O mesmo código de
**6 caracteres** troca a senha quantas vezes quiser, sem limite de tempo.

Reprodução (código `942bnd` lido do banco):
```
PUT /client/password-code {code:"942bnd", password:"SenhaAAA111"} -> 200
POST /client/auth SenhaAAA111 -> 201
PUT /client/password-code {code:"942bnd", password:"SenhaBBB222"} -> 200   <- mesmo code
POST /client/auth SenhaBBB222 -> 201
POST /client/auth SenhaAAA111 -> 401  (a senha realmente mudou de novo)
SELECT count(*) recover_password_codes -> 1  (a linha continua lá, intacta)
```
Quem vir o código uma vez (e-mail encaminhado, print, log) mantém acesso permanente à conta.

---

### A5 — BLOQUEIA — `DELETE /client/:clientId` devolve 500 quando o cliente tem animal (CONFIRMADO)

A FK `animals_clientId_fkey` é `ON DELETE RESTRICT`. O service não checa o vínculo antes,
então o erro do Prisma vaza como 500 genérico. Excluir cliente com animal simplesmente
não funciona, e o usuário não descobre o porquê.

Reprodução:
```
POST /client {"name":"DelAN", ...}
POST /animal {clientId: <DelAN>, ...}
DELETE /client/<DelAN>  -> 500 "Não foi possível concluir a operação..."
GET /client?page=1&query=DelAN -> 200, o cliente continua lá
```
Comparativo que isola a causa:
- cliente sem nenhum vínculo → `DELETE` **200**, some da lista
- cliente só com propriedade → `DELETE` **200** (mas ver A3: a propriedade vira órfã e vaza)
- cliente com animal → **500**

Se a exclusão deve mesmo ser bloqueada, precisa ser 409 com mensagem dizendo
"este cliente tem N animais cadastrados".

---

### A6 — GRAVE — `PUT /client/:clientId` aceita `cpf` e nunca grava (CONFIRMADO — alcance mapeado)

Bug já conhecido; medi o alcance porque o impacto é maior do que parece. O controller
desestrutura só `{ name, phone, email }` e não repassa `cpf` ao service, embora o
`EditClientDto` aceite o campo e o service tenha toda a lógica (checagem de duplicidade,
limpar com string vazia) pronta e **inalcançável**.

Alcance medido:
- **Vale para os dois caminhos**: token de empresa (web do veterinário) E token do
  próprio cliente (app do proprietário). Nenhum consegue gravar o CPF.
- **Cliente cadastrado sem CPF fica irrecuperável.** Como `paymentId` do Asaas só é
  criado no `POST /client` quando há CPF, esse cliente nunca ganha `paymentId` e não
  pode ser cobrado. Não há rota alternativa para corrigir.

Reprodução:
```
POST /client {"name":"SemCpf","email":"...","phone":"11911112222"}  -> cpf: null
PUT  /client/<id> {"cpf":"<cpf válido>"}                            -> 200 (sem corpo)
GET  /client?page=1&query=SemCpf                                    -> cpf: null
SQL: SELECT cpf, "paymentId" FROM clients WHERE id='8361d4b3…'      -> "|"  (ambos NULL)
```

**Varredura do mesmo padrão nos outros dois módulos: nada.**
Testei os 11 campos de `stud-farm` e os 9 de `animal`, um a um, com POST + GET e
PUT + GET. Todos gravaram e voltaram com o valor correto. `cpf` no `PUT /client` é o
único caso deste tipo no módulo.

---

### A7 — GRAVE — Filtro `color` de `GET /animal` é aceito e descartado em silêncio (CONFIRMADO)

`FetchAnimalsDto` declara e valida `color`, mas o controller não o desestrutura nem o
repassa ao service. A API responde 200 e ignora o filtro — a tela mostra "filtrado por
pelagem" com a lista inteira.

Reprodução:
```
GET /animal?page=1&color=ZZZNAOEXISTE -> 200, devolve TODOS os animais (Baio e Alazao)
GET /animal?page=1&color=Baio         -> 200, devolve TODOS os animais
```
Comparar com `breed`, que é repassado e funciona (`?breed=Crioulo` devolve 1).

Código: `animal.controller.ts`, método `fetch` — `color` ausente do destructuring de `queryParams`.

---

### A8 — GRAVE — `page=0` e `page` negativo devolvem 500 nas três listagens (CONFIRMADO)

O `page` é validado como `@IsNumberString` mas não como inteiro ≥ 1, então
`skip: (page-1)*10` vira negativo e o Prisma estoura.

```
GET /client?page=0     -> 500      GET /client?page=-1   -> 500
GET /stud-farm?page=0  -> 500      GET /stud-farm?page=-5 -> 500
GET /animal?page=0     -> 500
```
Um front que zere o contador de página derruba a tela com erro genérico.
Relacionado: `GET /client?page=1.5` retorna **200** e pula 5 registros (skip fracionário).

---

### A9 — GRAVE — UUID malformado devolve 500 cru em 6 rotas (CONFIRMADO)

Nenhum `ParseUUIDPipe` nos `@Param`, e vários filtros só validam `@IsString`.
Qualquer id inválido chega no Prisma e volta como erro interno.

| Requisição | Observado |
|---|---|
| `PUT /client/abc` | **500** |
| `DELETE /client/abc` | **500** |
| `PUT /stud-farm/abc` | **500** |
| `GET /stud-farm?page=1&clientId=abc` | **500** |
| `POST /stud-farm {"clientId":"abc"}` | **500** |
| `PUT /animal/abc` | **500** |
| `GET /animal/by-id/abc` | **500** |
| `POST /animal {"clientId":"abc"}` | **500** |

Para comparação, o mesmo id **inexistente** (mas com formato válido) devolve 404 limpo.
E `GET /client?page=1&studFarmId=abc` devolve 400 correto — a validação existe lá,
provando que é só falta de aplicar o mesmo padrão nas demais.

---

### A10 — GRAVE — `gender`/`sex` inválidos em `POST` e `PUT /animal` devolvem 404 "Registro não encontrado" (CONFIRMADO)

`CreateAnimalDto`/`EditAnimalDto` validam `gender` e `sex` apenas com `@IsString()`,
sem `@IsEnum`. O valor inválido passa a validação, quebra lá dentro e volta como 404
de recurso — mensagem que não tem nenhuma relação com o erro real.

```
POST /animal {"gender":"BANANA", ...}                -> 404 "Registro não encontrado."
POST /animal {"gender":"STALLION","sex":"BANANA"}    -> 404 "Registro não encontrado."
PUT  /animal/<id> {"gender":"BANANA"}                -> 404 "Registro não encontrado."
```
Compare com `GET /animal?page=1&gender=XPTO`, que devolve **400 "Cada gênero deve ser
um valor válido."** — o `FetchAnimalsDto` usa `@IsEnum` e acerta. Os DTOs de escrita não.

Nota: `gender: 123` (número) devolve 400 correto, porque aí o `@IsString` dispara.
Só o valor textual fora do enum escapa.

---

### A11 — GRAVE — Não existe exclusão de propriedade nem de animal (CONFIRMADO)

```
DELETE /stud-farm/<id> -> 404 {"message":"Cannot DELETE /stud-farm/ee4c86ed…"}
DELETE /animal/<id>    -> 404 {"message":"Cannot DELETE /animal/d4560528…"}
```
Confirmado por leitura: `studFarm.controller.ts` e `animal.controller.ts` não importam
`Delete` do `@nestjs/common`. Cadastro errado de propriedade ou animal é permanente —
o único jeito de sumir com um animal é o dono ser sequestrado por outra empresa (A1).

---

### A12 — GRAVE — `POST /client/link` com código inexistente devolve 500 (CONFIRMADO)

```
POST /client/link {"clientCode":"nao-existe"}  -> 500
```
Deveria ser 404. Como `clientCode` é UUID no banco, qualquer string não-UUID quebra.
Comparar: `POST /client/link` com um código válido já vinculado devolve 409 correto.

Observação de segurança na mesma rota: diferente de `GET /stud-farm/code/:code` e
`GET /animal/:code`, que têm `ThrottlerGuard` 5/min, `POST /client/link` não tem
nenhum limite — e acertar o código vincula um cliente de outro tenant à sua empresa
(provado: empresa B fez `POST /client/link` com o `code` do Cliente Dois de A e passou
a vê-lo em `GET /client`). O code é UUID v4, então o brute force é impraticável, mas a
inconsistência de proteção entre as três rotas de convite é real.

---

### A13 — GRAVE — Cliente com soft delete continua ativo na visão da clínica, sem nenhum sinal (CONFIRMADO)

`DELETE /client/me` grava `deletedAt` e bloqueia o login (401, verificado). O código
documenta que manter os dados é intencional. O problema é que **a API não expõe
`deletedAt` em lugar nenhum** — `ClientPresenter` não devolve o campo. A clínica continua
vendo o cliente na listagem e nos dropdowns, exatamente igual a um ativo, e ainda
consegue editá-lo.

Reprodução:
```
DELETE /client/me (token do cliente)     -> 200
POST /client/auth (mesmas credenciais)   -> 401  (login bloqueado, correto)
GET /client?page=1&query=SoftDel         -> 200, o cliente aparece normalmente
                                            e nenhum campo indica que foi excluído
PUT /client/<id> {"name":"Ressuscitado"} -> 200, e o nome muda de fato
GET /stud-farm?page=1&query=SoftDel      -> propriedade dele continua listada
GET /animal?page=1&query=SoftDel         -> animal dele continua listado
SQL: deletedAt = 2026-08-02 17:28:05.783, name = 'Ressuscitado'
```
A clínica agenda, fatura e manda mensagem para uma conta encerrada sem saber.
Se o comportamento é por design, falta o campo no presenter para o front sinalizar.

---

### A14 — MENOR — `photoUrl` do animal aceita qualquer string, sem validar URL (CONFIRMADO)

```
POST /animal {"name":"FotoLixo","photoUrl":"javascript:alert(1)"} -> 201, gravado literal
```
O DTO usa `@IsString()` em vez de `@IsUrl()`. Se o front renderizar isso em `<img src>`
ou num link, vira vetor de XSS. Idem `photoUrl: ""`, que grava string vazia em vez de null.

---

### A15 — MENOR — `PUT /animal` grava string vazia onde `client` e `stud-farm` normalizam para null (CONFIRMADO)

Inconsistência de dado entre os três módulos no mesmo cenário ("limpar o campo"):

| Módulo | Enviado | Gravado |
|---|---|---|
| `PUT /client` `{"phone":""}` | `""` | `null` (correto) |
| `PUT /stud-farm` `{"city":"","responsibleName":""}` | `""` | `null` (correto) |
| `PUT /animal` `{"color":"","photoUrl":""}` | `""` | **`""`** |
| `PUT /animal` `{"studFarmId":""}` | `""` | `null` (correto) |

O front vai ter que tratar dois "vazios" diferentes só no animal.

---

### A16 — MENOR — Sem limite de tamanho em nenhum campo de texto (CONFIRMADO)

```
POST /animal    {"name": "A"×10000} -> 201, gravado inteiro
POST /stud-farm {"name": "B"×10000} -> 201, gravado inteiro
PUT  /client    {"name": "A"×5000}  -> 200
```
As colunas são `text`, então não estoura, mas quebra qualquer listagem/relatório.
Falta `@MaxLength` nos DTOs.

---

### A17 — SUSPEITO — Animal aceita ser criado em propriedade de outro cliente sem aviso

```
POST /animal {"clientId": <Cliente Um>, "studFarmId": <propriedade do Cliente Dois>} -> 201
```
Pode ser intencional (animal hospedado em haras de terceiro). Não fechei porque não sei
a regra de negócio, mas vale confirmar com o dono: se não for intencional, é dado
inconsistente entrando sem barreira. Ambos os registros são da mesma empresa, então
não há vazamento de tenant aqui.

---

## O que passou (não precisa reauditar)

**Ida e volta campo a campo — o foco do pedido:**
- `stud-farm`: os **11** campos (`name`, `city`, `state`, `location`, `address`, `street`,
  `number`, `neighborhood`, `responsibleName`, `responsiblePhone`, `clientId`) gravaram e
  voltaram idênticos no POST **e** no PUT. Nenhum descartado em silêncio.
- `animal`: os **9** campos (`name`, `breed`, `gender`, `sex`, `color`, `birthDate`,
  `clientId`, `studFarmId`, `photoUrl`) gravaram e voltaram idênticos no POST **e** no PUT.
  **Trocar de dono e trocar de propriedade funcionam** — o `clientId` e o `studFarmId` mudam
  de fato e o `GET /animal/by-id` já traz o cliente e a propriedade novos embutidos.
  A foto (`photoUrl`) persiste e é atualizada corretamente (só falta validar o formato, A14).
- `client`: `name`, `phone` e `email` gravam corretamente no PUT. Só `cpf` falha (A6).

**Isolamento entre empresas (o que está certo):** com o token da empresa B, contra
recursos da empresa A —
`GET /client` (lista vazia), `GET /animal` (lista vazia), `GET /client/cpf/:cpf` (404),
`GET /animal/by-id/:id` (404), `PUT /client` (403), `PUT /stud-farm` (403), `PUT /animal` (404),
`DELETE /client` (403), `DELETE /client/:id/unlink` (404), `POST /client/token` (403),
`POST /animal` com clientId de A (404), `POST /stud-farm` com clientId de A (403).
Nos casos de escrita, confirmei no banco que nada mudou.
Os filtros `?clientId=` e `?studFarmId=` também respeitam o escopo (devolvem vazio para id de outro tenant).

**Isolamento entre clientes (token do app do proprietário):**
`PUT /client/<outro>` → 403; `PUT /stud-farm/<de outro>` → 403 (inclusive **depois** de se
vincular pelo code — o link dá leitura, não escrita); `PUT /animal/<de outro>` → 404;
`GET /animal/by-id/<de outro>` → 404. `POST /stud-farm` com `clientId` de outro no corpo
**ignora o corpo** e vincula ao próprio cliente do token (verificado). O parâmetro
`?clientId=` em `GET /stud-farm` é ignorado para token de cliente, como o comentário promete.

**Paginação:** conferida com 12 registros reais.
`GET /client?page=1` → 10 itens, `pages: 2`; `page=2` → 2 itens; 12 ids únicos, sem
sobreposição nem perda. `page` acima do total devolve lista vazia com `pages` correto.
Lista sem resultado devolve `{"clients":[],"pages":0}` — 200 limpo, sem erro.
`GET /animal` bateu exatamente com o `count(*)` do banco (9 = 9).

**Filtros que funcionam:** `client` → `query`, `studFarmId`. `stud-farm` → `query`, `city`,
`state`, `clientId`. `animal` → `query`, `clientId`, `studFarmId`, `gender` (inclusive
multivalorado `?gender=A&gender=B`), `breed`, `birthDateStart`/`birthDateEnd`.

**Validações que realmente disparam (provei que rejeitam):**
- e-mail duplicado no `POST /client` → 409 com `field: "email"`
- CPF duplicado no `POST /client` → 409 com `field: "cpf"`
- CPF matematicamente inválido → 400 "O CPF/CNPJ informado é inválido." (validado no Asaas)
- e-mail já usado por outro cliente no `PUT` → 409 (a checagem anti-constraint funciona)
- `birthDate` no futuro → 400; `birthDate: "banana"` → 400; `birthDate: "2020-02-31"` → 400
  (rejeita corretamente, mas a mensagem que vem junto — "não pode ser no futuro" — está errada;
   cosmético, o bloqueio funciona)
- campos obrigatórios ausentes (`name`, `breed`, `gender`, `email`) → 400 em português
- tipo errado (`name: 12345`, `phone: 11999999999` numérico, `studFarmId: 999`) → 400 em português
- `page=abc` → 400 em português nas três listagens
- senha < 6 caracteres no register → 400

**Rotas de guarda por tipo de token:** `GET /client/profile`, `DELETE /client/me` e
`GET /stud-farm/client` devolvem 403 "Esta rota é exclusiva para clientes" com token de
empresa; `POST /stud-farm/:id/link` devolve 403 "Apenas clientes podem vincular-se a fazendas".

**Recuperação de senha (fora o reuso do código, A4):** `POST /client/password-code` devolve
a mesma mensagem neutra para e-mail existente e inexistente (não enumera contas — correto);
`GET`/`PUT` com código inválido → 404; `PUT` sem senha → 400.
`POST /client/auth` com senha errada e com e-mail inexistente devolvem a **mesma** mensagem
401 (não enumera contas — correto).

**Não regenera código indevidamente:** `PUT /stud-farm` e `PUT /client` preservam o `code`
(só o animal tem o defeito A2).

**`DELETE /client/:id/unlink`** → 200 e o cliente some da listagem da empresa que desvinculou.
**`POST /client/token`** → 201 com JWT de cliente válido para o próprio tenant, 403 para outro.
