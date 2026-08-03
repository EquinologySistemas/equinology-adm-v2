# F3-portal-cliente-app

Auditoria executada contra a API rodando em `http://localhost:3333`, com fixture
próprio (empresa isolada). Nenhum arquivo `.ts` foi alterado.

## Fixture usado (para reproduzir)

| Item | Valor |
|---|---|
| Empresa | `3108f8b8-888e-4de7-92fd-1ed77d896891` (Clinica F3 1785693423905) |
| Vet | `f3vet1785693423905@teste.com` / `Senha@12345` |
| Dono A | `a68e8724-a555-40f3-ab40-8e9c8e06480d` — login `f3donoA1785693423905@teste.com`, senha = CPF `56774007503` |
| Dono B | `72648a45-680b-4859-994f-126846925779` — login `f3donoB1785693423905@teste.com`, senha = CPF `75561435540` |
| Animal A (dono A) | `41aecd32-a37d-4810-8ca5-e2094c549e23` |
| Animal B (dono B) | `4176aebe-d38c-4d0f-9b17-9729d7a8bdd0` |
| Atendimento com os 2 animais | `fb620119-5d63-4e65-9d92-56af89a5eaa8` |
| appointmentAnimal A / B | `7b8785d4-…7cafa` / `e2896ce5-…3b08c` |
| Fatura A / B | `50a08728-…070f5d` / `5ab755ca-…3ded4` |

Observação: para conseguir exercitar o pagamento de fatura de ponta a ponta,
o `walletId` da empresa de teste foi preenchido por SQL
(`update companies set "walletId"='9f80e4ea-0dea-47dd-960a-0ceadd6426a3'`),
porque o registro da empresa nasce sem subconta Asaas. Sem isso o fluxo de
pagamento é inalcançável.

## Cobertura: 10 / 10 rotas do meu conjunto

| # | Rota | Status |
|---|---|---|
| 1 | `GET /client-portal/appointment/:appointmentAnimalId` | testada |
| 2 | `GET /client-portal/animal/:animalId/owner-note` | testada |
| 3 | `GET /client-portal/animal/:animalId/animal-note` | testada |
| 4 | `POST /client-portal/animal-note` | testada |
| 5 | `PUT /client-portal/animal-note/:animalNoteId` | testada |
| 6 | `DELETE /client-portal/animal-note/:animalNoteId` | testada |
| 7 | `GET /client-invoice` | testada |
| 8 | `GET /client-payment` | testada |
| 9 | `GET /appointment/client` | testada |
| 10 | `GET /client/profile` | testada |

Cruzamentos também exercitados (fora do conjunto, mas necessários ao fluxo do
proprietário): `POST /client/auth`, `PUT /client/:clientId`, `DELETE /client/me`,
`POST /invoice/:id/pay/pix`, `POST /invoice/:id/pay/credit/new`,
`POST /invoice/:id/pay/credit/existing`, e ~40 rotas de escrita/leitura da
clínica sondadas com token de cliente.

### O que NÃO deu para cobrir (honestidade de cobertura)

- **Anexos (`attachments`)** em owner-note e prescrições compartilhadas: não
  subi arquivo, então o `AttachmentSyncService.hydrate` e as URLs assinadas que
  o app do dono receberia não foram validados. Todas as respostas voltaram
  `"attachments": []`.
- **Cliente vinculado a DUAS clínicas**: o comentário do
  `ClientInvoiceController` diz que o cliente pode ter faturas de várias
  empresas (`companyId` fica `undefined` de propósito). Só testei com uma
  clínica — o comportamento multi-clínica de `/client-invoice`,
  `/client-payment` e `/appointment/client` não foi verificado.
- **`POST /client/register`** (cadastro público do dono, sem clínica) e o fluxo
  `POST /client/link` por `clientCode`.
- Recuperação de senha do cliente (`/client-password-code`).

---

## Achados

### 1. BLOQUEIA — `GET /appointment/client` entrega nome, e-mail, telefone, CPF e valores do OUTRO proprietário (LGPD). CONFIRMADO

Num atendimento que reúne animais de dois donos, a rota filtra o **atendimento**
(`animals: { some: { animal: { clientId } } }`) mas o presenter serializa
**todos** os `appointmentAnimals` — inclusive os do outro dono, com o objeto
`client` completo e o `payment` inteiro.

Origem no código:
`src/infra/shared/database/prisma/repositories/prismaAppointment.repository.ts`
(`whereFilter`, uso de `some`) + `appointmentDetails.presenter.ts` →
`appointmentAnimalDetails.presenter.ts` → `animalDetails.presenter.ts`
(`client: animal.client && ClientPresenter.toHTTP(...)`, que expõe `cpf`,
`email`, `phone`) e `PaymentDetails.presenter.ts` (`amount`, `transactions`).

**Reprodução**

```
POST /appointment  (token da clínica)
  animals: [{animalId: <animal do dono A>}, {animalId: <animal do dono B>}]
POST /client/auth  {email: <dono A>, password: <CPF do dono A>}
GET  /appointment/client?page=1   (token do dono A)
```

**Evidência — trecho literal da resposta 200 recebida pelo Dono A:**

```json
{
  "id": "4176aebe-d38c-4d0f-9b17-9729d7a8bdd0",
  "name": "Cavalo B",
  "studFarm": { "name": "Haras B", "address": "Rua B", "city": "SP",
                "clientId": "72648a45-680b-4859-994f-126846925779" },
  "client": {
    "id": "72648a45-680b-4859-994f-126846925779",
    "name": "Dono B SEGREDO",
    "email": "f3donoB1785693423905@teste.com",
    "phone": "11922222222",
    "cpf": "75561435540",
    "code": "20af249d-f72c-472d-8661-925db62c6778"
  }
}
```

e, no mesmo item:

```json
"payment": {
  "name": "PAG-B-SEGREDO", "amount": 7777,
  "clientId": "72648a45-680b-4859-994f-126846925779",
  "transactions": [ { "name": "PAG-B-SEGREDO", "value": 7777, "status": "PENDING" } ],
  "companyName": "Clinica F3 1785693423905"
}
```

O vazamento é simétrico: o token do Dono B devolve os mesmos campos do Dono A.
Também vaza o `code` do outro cliente — que é o código usado por
`POST /client/link` para vincular cliente a empresa.

Contraste: `/client-portal/*`, `/client-invoice` e `/client-payment` estão
corretos. O buraco é exclusivo do `/appointment/client`.

---

### 2. GRAVE — 500 cru em UUID malformado nas rotas do proprietário. CONFIRMADO

Qualquer id não-UUID no path/query estoura no Prisma e sai como 500 genérico.
Todas com token de cliente válido:

| Requisição | HTTP observado |
|---|---|
| `GET /client-portal/appointment/abc` | 500 |
| `GET /client-portal/animal/abc/owner-note` | 500 |
| `GET /client-portal/animal/abc/animal-note` | 500 |
| `PUT /client-portal/animal-note/abc` | 500 |
| `DELETE /client-portal/animal-note/abc` | 500 |
| `GET /client-payment?page=1&animalId=abc` | 500 |
| `GET /appointment/client?page=-1` | 500 |
| `POST /invoice/abc/pay/pix` | 500 |

Corpo em todos: `{"statusCode":500,"message":"Não foi possível concluir a
operação...","code":"INTERNAL_SERVER_ERROR"}`.

Nenhum `@Param` do `ClientPortalController` tem `ParseUUIDPipe`/DTO — só o
`POST /client-portal/animal-note` valida (`animalId: 'abc'` → 400 "ID do animal
inválido"), o que prova que a validação existe no projeto e simplesmente não
está aplicada nos params. `page=-1` também escapa (o `FetchAppointmentsByClientDto`
não tem `@Min(1)`), enquanto `page=abc` é pego (400).

---

### 3. GRAVE — token de cliente cria e edita cadastro da clínica. CONFIRMADO

Com o token do Dono A (`companyId: "no-company"`):

| Requisição | HTTP observado | Efeito confirmado no banco |
|---|---|---|
| `POST /stud-farm {name:"Haras Hack", clientId:<próprio>}` | **201** | criado `1fd15bd7-b22e-4dba-8bb5-74dec5bdd90f` |
| `PUT /stud-farm/<haras próprio> {name:"Haras Hackeado"}` | **200** | `select name from stud_farms` → `Haras Hackeado` |
| `PUT /animal/<animal próprio> {name:"Cavalo Hackeado"}` | **200** | `select name from animals` → `Cavalo Hackeado` |

O animal e o haras são registros da base clínica (`animals."companyId"` continua
sendo o da clínica). O proprietário renomeia o prontuário do veterinário pelo
app, sem nenhum vínculo de empresa no token.

O isolamento *entre clientes* está OK (o A não escreve no recurso do B):
`PUT /animal/<animal do B>` → 404 e `PUT /stud-farm/<haras do B>` → 403, ambos
confirmados sem alteração no banco (`Cavalo B` e `Haras B` intactos).

Também vale registrar que `DELETE /animal/:id` e `DELETE /stud-farm/:id` **não
existem** (404 "Cannot DELETE") — a exclusão não está exposta para ninguém.

---

### 4. GRAVE — fatura sem `clientId` pode ser paga por qualquer cliente autenticado. CONFIRMADO

`InvoiceService.payPix/payNewCreditCard/payExistingCreditCard` guardam com
`if (invoice.clientId && invoice.clientId !== clientId)`. Quando a fatura foi
criada sem cliente vinculado (`clientId` é opcional no `CreateInvoiceDto`), a
guarda não dispara.

**Reprodução**

```
POST /invoice (clínica) {amount:55, dueDate:"2026-10-05", number:"F3-ORFA"}   -> 201, clientId null
POST /invoice/<id>/pay/pix           (token do Dono A) -> 201  (QR gerado)
POST /invoice/<id>/pay/credit/new    (token do Dono B) -> 201  (cobrança criada)
```

Banco depois:

```
 number  | status | clientId |    bankPaymentId
---------+--------+----------+----------------------
 F3-ORFA | PAID   |          | pay_y14zqy9xhq0hkld2
```

A fatura fica `PAID` com `clientId` NULL: a clínica não tem como saber quem
pagou, e quem pagou foi cobrado por uma fatura que não é dele. Exige adivinhar
o UUID da fatura, por isso GRAVE e não BLOQUEIA.

A guarda funciona quando o `clientId` existe: `POST /invoice/<fatura do B>/pay/pix`
com token do A → 404 limpo, fatura B intacta.

---

### 5. GRAVE — "excluir minha conta" não invalida a sessão. CONFIRMADO

```
DELETE /client/me                    (token do Dono B) -> 200
POST   /client/auth {dono B}                            -> 401 "E-mail ou senha incorretos"
GET    /client/profile               (MESMO token B)    -> 200 (dados completos)
GET    /appointment/client?page=1    (MESMO token B)    -> 200
GET    /client-invoice?page=1        (MESMO token B)    -> 200 (fatura F3-002, R$ 999,99)
```

O soft delete só bloqueia login novo. O JWT já emitido continua válido até
expirar (`exp` observado ≈ 90 dias). Quem pediu exclusão continua com acesso
total pelo app já logado.

---

### 6. GRAVE — rotas da clínica devolvem 500 (não 403) para token de cliente. CONFIRMADO

O `companyId` do token de cliente é a string `"no-company"`, que não é UUID; as
rotas sem `VetOnlyGuard` levam isso direto ao Prisma:

| Requisição (token de cliente) | HTTP observado |
|---|---|
| `GET /client?page=1` | 500 |
| `GET /client/cpf/:cpf` | 500 |
| `POST /client/token` | 500 |
| `DELETE /client/:clientId` | 500 |
| `POST /invoice` | 500 |
| `GET /invoice?page=1` | 500 |
| `GET /board` | 500 |

Fecha o acesso (nenhum dado voltou), mas por acidente e com 500. Compare com as
rotas que têm guarda e respondem certo: `GET /user` → 403 com mensagem clara,
`GET /company` → 403, `/animal-note` → 403, `/owner-note` → 403,
`/general-prescription` → 403, `/transaction*` e `/payment` → 403.

---

### 7. GRAVE — mensagem de validação quebrada em `/client-invoice?status=`. CONFIRMADO

```
GET /client-invoice?page=1&status=XX
-> 400 {"statusCode":400,
        "message":["status must be one of the following values: "],
        "error":"Bad Request","code":"VALIDATION_ERROR"}
```

Em inglês e com a lista de valores permitidos **vazia**. O `@IsEnum(['PENDING',
'PAID','CANCELED'])` do `FetchClientInvoiceDto` usa um array literal (não um
enum TS), então o class-validator não consegue imprimir os valores. O usuário do
app não tem como saber o que enviar. Nas rotas irmãs a mensagem está em
português (`/client-payment?page=abc` → "Insira uma página válida").

---

### 8. GRAVE — pagar por cartão quando a clínica não tem conta Asaas devolve "Registro não encontrado". CONFIRMADO

Com a empresa sem `walletId` (estado em que ela nasce):

```
POST /invoice/<id>/pay/pix           -> 400 "A empresa ainda não possui PIX configurado. Entre em contato com o estabelecimento."   (bom)
POST /invoice/<id>/pay/credit/new    -> 404 "Registro não encontrado. Confira os dados informados e tente novamente."               (ruim)
POST /invoice/<id>/pay/credit/existing -> 404 idem
```

Em `invoice.service.ts:489`, `!company.walletId` cai no mesmo
`ResourceNotFoundError` de "fatura não existe". O dono vê "registro não
encontrado" para uma fatura que ele está olhando na tela, e vai abrir chamado.

---

### 9. MENOR — `page` obrigatório só em `/client-invoice`. CONFIRMADO

```
GET /client-invoice           -> 400 ["O campo page deve ser no mínimo 1.", "O campo page deve ser um número inteiro."]
GET /client-payment           -> 200
GET /appointment/client       -> 200
```

O controller já faz `page: query.page || 1`, ou seja, o código foi escrito
esperando `page` opcional — mas o DTO marca como obrigatório. Inconsistência
entre três rotas que o app consome na mesma tela.

---

### 10. MENOR — `content` da anotação do proprietário sem limite de tamanho. CONFIRMADO

```
POST /client-portal/animal-note {animalId:<próprio>, content:"x".repeat(200000)}
-> 201, gravado inteiro
```

Sem `@MaxLength`. Aceita 200 mil caracteres por nota, sem teto de quantidade.

---

### 11. MENOR — `POST /appointment` com token de cliente devolve 404. CONFIRMADO

```
POST /appointment (token de cliente) -> 404 "Registro não encontrado. Confira os dados informados e tente novamente."
```

Fecha o acesso (o atendimento não é criado), mas o código correto seria 403 —
as rotas irmãs `PUT /appointment/:id` e `DELETE /appointment/:id` respondem
403 "Você não tem permissão para realizar esta ação."

---

### Observação lateral (fora do meu conjunto, mas apareceu no caminho)

`POST /animal` com `gender` fora do enum (ex.: `"MARE"`) devolve **404
"Registro não encontrado"** em vez de 400 explicando os valores aceitos. O DTO
valida `gender` só com `@IsString()`, então o valor inválido só quebra lá na
frente. Reprodução: `POST /animal {name, breed, gender:"MARE", sex:"FEMALE",
birthDate, clientId, studFarmId, color}` → 404. Vale para o agente do módulo de
animal confirmar.

---

## O que passou (não precisa reauditar)

**Isolamento entre proprietários no `/client-portal` — sólido, testado nos dois sentidos.**

- `GET /client-portal/appointment/<appointmentAnimal do dono B>` com token do
  Dono A → **403** `{"message":"Você não tem permissão para realizar esta ação.","code":"NOT_ALLOWED"}`
- `GET /client-portal/animal/<animal do B>/owner-note` com token do A → **403**
- `GET /client-portal/appointment/<appointmentAnimal do A>` com token do B → **403**
- `PUT` e `DELETE /client-portal/animal-note/<nota do A>` com token do B → **403**,
  e a nota continuou com o conteúdo original (verificado por GET logo depois).
- `GET /client-invoice?page=1&animalId=<animal do A>` com token do B → 200 `{"payments":[],"pages":0}`
- `GET /client-payment?page=1&animalId=<animal do A>` com token do B → 200 `{"payments":[],"pages":0}`
- Injeção de `clientId` na query (`/client-invoice?clientId=<outro>`,
  `/client-payment?clientId=<outro>`, `/appointment/client?clientId=<outro>`)
  é **ignorada** — sempre volta o que é do `sub` do token. Correto.

**A prescrição não compartilhada não vaza — e a checagem realmente dispara
(provei nos dois sentidos, nas três seções).**

- Criei duas prescrições general no mesmo atendimento: `sharedWithOwner:true` e
  `false`. O portal devolveu só a compartilhada.
- `PUT /general-prescription/<id> {sharedWithOwner:false}` → o portal passou a
  devolver `"prescriptions": []`.
- `PUT /general-prescription/<id da privada> {sharedWithOwner:true}` → passou a
  aparecer. Ou seja, o filtro é real, não um campo decorativo.
- Repeti com `orthopedic-prescription` e `dentistry-prescription`: o portal
  devolveu exatamente `["general:PRESC-A-PRIVADA-SEGREDO",
  "orthopedic:ORTO-COMPARTILHADA","dentistry:DENT-COMPARTILHADA"]` — as duas
  privadas (`ORTO-PRIVADA-SEGREDO`, `DENT-PRIVADA-SEGREDO`) ficaram de fora.
- O `SharedPrescriptionPresenter` não expõe `userId`, `companyId` nem
  `sharedWithOwner` — só `id`, `section`, `animalId`, `appointmentAnimalId`,
  `observation`, `createdAt`, `attachments`.

**A anotação privada do veterinário não vaza.**

- Criei `POST /animal-note {content:"VETNOTE-PRIVADA-SEGREDO"}` (authorType VET)
  no animal do Dono A. `GET /client-portal/animal/<animalA>/animal-note` com o
  token dele devolveu `{"animalNotes":[]}`.
- `GET /animal-note/animal/:animalId` com token de cliente → 403 com mensagem
  boa: "Estas anotações são do veterinário. No aplicativo, use as suas próprias
  anotações do animal."
- `POST /animal-note` com token de cliente → 403 (mesma mensagem).

**CRUD da anotação do proprietário — ida e volta campo a campo, sem campo silenciosamente descartado.**

- `POST` → 201 devolvendo `{id, content, animalId, authorType:"OWNER",
  userId:null, clientId:<do token>, createdAt}`. `clientId` veio do token, não
  do corpo.
- `GET` da lista traz a nota com o mesmo `content`.
- `PUT {content:"NOTA EDITADA"}` → 200 e o `GET` seguinte mostra
  `"content":"NOTA EDITADA"` com `updatedAt` novo.
- `DELETE` → 200, o `GET` seguinte não traz mais a nota, e o `DELETE` repetido
  devolve **404 limpo** (não 500).
- Entradas ruins no corpo são pegas com mensagem em português:
  `animalId:"abc"` → 400 "ID do animal inválido"; sem `content` → 400
  "O conteúdo é obrigatório"; `content:123` → 400 "Insira um conteúdo válido".

**`GET /client/profile` — correto.**
Devolve só o próprio cliente (`id/name/email/phone/cpf/code`), do `sub` do token.
`PUT /client/<próprio id>` com token de cliente atualizou `name` e `phone`, e o
`GET /client/profile` seguinte refletiu (`"Dono A Editado"`, `"11933333333"`).
`PUT /client/<id de outro cliente>` → 403 sem alterar nada.

**Guarda `tokenType !== 'client'` — dispara em todas as 10 rotas.**
Com token de veterinário: `/client-portal/appointment/:id`, `/client-invoice`,
`/client-payment`, `/client/profile` e `/appointment/client` respondem
**403 "Esta rota é exclusiva para clientes"**. Sem token: **401**.

**Paginação e filtros de `/client-invoice` e `/client-payment` — batem.**
`page=2` → `{"payments":[],"pages":1}` (lista vazia respondida bem, sem 500).
`status=PENDING` traz a fatura, `status=PAID` volta vazio; depois do pagamento
a mesma fatura aparece em `status=PAID` e some de `PENDING`, com
`transactions[0].status: "PAID"` e `date` preenchida. `type=OUTCOME` em
`/client-payment` volta vazio (o pagamento é INCOME). `page=0`, `page=-1` e
`page=abc` no `/client-invoice` → 400 em português.

**Pagamento de fatura pelo app — funciona e grava certo** (com o `walletId`
preenchido conforme nota do fixture).

- `POST /invoice/<fatura própria>/pay/pix` → 201 com `{payment:{encodedImage, payload}}`.
- `POST /invoice/<fatura própria>/pay/credit/new` → 201.
- Banco depois: `status=PAID`, `paidAt=2026-08-02 18:02:10.69`,
  `bankPaymentId=pay_6yzg01aivujs4fho`. O cartão ficou salvo em `credit_cards`
  (`MASTERCARD`, final `8829`, vinculado ao `clientId` certo) — o app consegue
  reusar em `pay/credit/existing`.
- Pagar de novo a mesma fatura (pix ou cartão) → **400 "Esta fatura já foi
  paga."** Sem duplicidade.
- `installmentCount: 0` → 400 "O campo installmentCount deve ser no mínimo 1."
- Fatura inexistente (UUID válido) → 404 limpo.
- `POST /invoice/<fatura do outro dono>/pay/pix` → 404, fatura do outro intacta.

**Escrita bloqueada corretamente para token de cliente** (além do que já se
sabia): `POST /owner-note/:id` → 403 com mensagem boa; `POST /general-prescription/:id`
→ 403; `POST /animal-note` → 403; `PUT`/`DELETE /appointment/:id` → 403;
`POST /payment` → 403; `POST /transaction-category` → 403;
`GET /appointment/details/:id` → 403; `GET /animal/<animal do outro dono>` → 404.
`GET /animal?page=1` e `GET /stud-farm?page=1` respondem 200 mas devolvem
**apenas** os registros do próprio cliente — verificado item a item.
