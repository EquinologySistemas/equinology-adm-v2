# Frente C — Falhas silenciosas de gravação

Classe de defeito: a API responde **200** e o dado **não muda** (ou muda pela metade).
O usuário lê "salvo com sucesso" e o registro não existe.

Tudo verificado com curl real contra `http://localhost:3333` e leitura de volta no
Postgres (`docker exec vetequus-local psql -U postgres -d vetequus`).

Repo: `vetequus-api`, branch `fix/lancamento`. Nada commitado.

---

## 1. PUT /reproduction-donor-ovulation/:id respondia 200 e não gravava nenhum campo

**Arquivo:** `src/domain/application/services/animal/services/reproduction/reproductionDonorOvulation.service.ts`

O `edit` desestruturava `date, time, hormones, dosage, administration, observation,
animalId, userId` e **não fazia uma única atribuição** antes do `save`. Só o
anexo (`fileUrl`/`attachments`) passava pelo `attachmentSync`. Era o único dos 24
módulos de reprodução com esse defeito — varredura automática confirmou que os
outros 23 aplicam todos os campos.

Correção: bloco de atribuições no mesmo padrão do `reproductionDonorHeat.service.ts`
(`undefined` = não enviado; `null` não limpa porque as colunas são NOT NULL) e
guarda de posse ao repontar `animalId` para outro animal.

| | HTTP | Banco depois do PUT |
|---|---|---|
| ANTES | 200 | `2026-03-10 / T1 / H1 / D1 / Intravenoso / OV1` (inalterado) |
| DEPOIS | 200 | `2026-09-09 / T2 / H2 / D2 / Intramuscular / OV2` |

Extra verificado: `PUT {"animalId": <animal de outra empresa>}` -> **403**
(antes o campo era descartado; agora existe a checagem e ela dispara).

---

## 2. `nextDate: null` não limpava a próxima dose em /vaccine, /deworming, /exam, /shoeing

**Causa raiz (a checagem existia e nunca disparava):**
`src/infra/shared/decorators/StrictDate.decorator.ts` normaliza
`null | undefined | ''` para `undefined`. Os services checavam
`if (nextDate !== undefined)` — escrito e comentado justamente para permitir
limpar a data — e a condição nunca era verdadeira, porque o `null` do corpo já
tinha virado `undefined` no transform do DTO. `shoeing.service` nem tentava:
usava `nextDate ?? shoeing.nextDate`.

**Correção:**
- Novo `src/infra/shared/decorators/StrictNullableDate.decorator.ts`: preserva
  `null` (= limpar), mantém `undefined` (= não altera) e continua barrando data
  de calendário inexistente. `StrictDate` **não foi alterado** (é usado por
  dezenas de DTOs de outras frentes).
- Aplicado no campo `nextDate` de `vaccine.dto.ts`, `deworming.dto.ts`,
  `exam.dto.ts`, `shoeing.dto.ts` (Create e Edit).
- `shoeing.service.ts`: `nextDate ?? shoeing.nextDate` -> `if (nextDate !== undefined) shoeing.nextDate = nextDate;`
- `shoeingProps.ts`: `nextDate?: Date` -> `Date | null`.

`PUT {"nextDate":null}` em registros criados com `nextDate=2026-07-10`:

| Rota | ANTES (HTTP / banco) | DEPOIS (HTTP / banco) |
|---|---|---|
| PUT /vaccine/:id | 200 / `2026-07-10` | 200 / `NULL` |
| PUT /deworming/:id | **400** / `2026-07-10` | 200 / `NULL` |
| PUT /exam/:id | 200 / `2026-07-10` | 200 / `NULL` |
| PUT /shoeing/:id | 200 / `2026-07-10` | 200 / `NULL` |

Não-regressão (vaccine): `{"nextDate":"2027-02-28..."}` -> 200 e grava;
`{"name":"..."}` sem `nextDate` -> 200 e mantém `2027-02-28`;
`{"nextDate":"2027-02-30"}` (dia inexistente) -> **400** "Informe uma data válida".

---

## 3. PUT /deworming/:id exigia `dewormingId` no corpo (achado novo, mesma assinatura do /product-category)

**Arquivo:** `src/infra/http/controllers/animal/dto/deworming.dto.ts`

`EditDewormingDto` declarava `dewormingId!` com `@IsNotEmpty`, mas o controller
usa o `:id` da rota e nunca lê o campo. Descoberto ao reproduzir o item 2: o
`PUT {"nextDate":null}` devolvia **400 `["O campo Vermifugação é obrigatório",
"Escolha uma Vermifugação válida"]`** enquanto vaccine/exam/shoeing devolviam 200.
É a mesma assinatura do bug do `cpf` em PUT /client e do `productCategoryId`.

Correção: campo virou opcional e marcado como deprecated (o id que vale é o da URL).

ANTES 400 -> DEPOIS 200 (mesma requisição, comprovado na tabela do item 2).

---

## 4. PUT /product-category/:id exigia `productCategoryId` no corpo

**Arquivo:** `src/infra/http/controllers/stock/dto/productCategory.dto.ts`

`EditProductCategoryDto.productCategoryId` era obrigatório (`@IsUUID`), mas o
controller usa o `:productCategoryId` da rota. Quem mandava `{name, color}`
levava 400; quem mandava o id de OUTRA categoria tinha o campo descartado em
silêncio e a categoria da URL era editada com 200.

Correção: campo opcional e deprecated. O front não envia esse campo em lugar
nenhum (verificado em `equinology-web-v2` e `equinology-adm-v2`), então nada quebra.

DEPOIS: `PUT /product-category/1023ae78-...` com `{"name":"Cat FC Edit","color":"#000000"}`
-> **200**; banco: `Cat FC Edit | #000000`.

---

## 5. GET de 6 módulos de reprodução ignorava o filtro de atendimento

**Arquivos** (`src/infra/shared/database/prisma/repositories/reproduction/`):
`prismaReproductionBreedingIntermediate`, `prismaReproductionBreedingPregnancy`,
`prismaReproductionDonorInsemination`, `prismaReproductionReceptorInovulation`,
`prismaReproductionReceptorMonitoring`, `prismaReproductionStallionCollection`.

O `where` do `findMany` (fetchByAnimalId) filtrava só `animalId`; o `where` do
`count` filtrava `animalId + appointmentAnimalId`. Resultado: a ficha do
atendimento A listava registros do atendimento B (mistura de prontuários) e o
`pages` saía incoerente com a lista.

Correção: `appointmentAnimalId: data.appointmentId` no `findMany`, igualando ao
`count`. Varredura pós-correção nos 24 repositórios de reprodução: **0 divergências**.

Verificado em /reproduction-breedingPregnancy (dois appointmentAnimals do mesmo animal):

| Filtro | ANTES | DEPOIS |
|---|---|---|
| `appointmentId=AA1` | `[PREG-AA2, PREG-AA1]` pages=1 | `[PREG-AA1]` pages=1 |
| `appointmentId=AA2` | `[PREG-AA2, PREG-AA1]` pages=0 | `[PREG-AA2]` pages=1 |
| sem filtro | — | `[PREG-AA1, PREG-AA2]` pages=1 |

Conferido também em /reproduction-stallion-collection: 1 registro por atendimento, pages=1.

---

## 6. PUT /payment/:paymentId alterava a movimentação e não atualizava nenhuma parcela

**Arquivos:**
- `src/domain/application/services/finance/services/payment.service.ts`
- `src/domain/application/repositories/transaction.repository.ts` (+2 métodos)
- `src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts`
- `src/infra/http/controllers/finance/dto/payment.dto.ts` e `payment.controller.ts`

O `edit` salvava só o cabeçalho (`sheduled_payments`). As parcelas
(`transactions`) — que são o que aparece no caixa, no extrato e no
`GET /transaction/statistics` — ficavam com nome, valor, quantidade, tipo e
categoria antigos. Despesa editada para receita continuava entrando no caixa com
o sinal errado.

Evidência do ANTES ainda viva no banco, deixada pela auditoria:

```
cabeçalho:  Edit6x F2 | 600 | 6 parcelas | OUTCOME
parcelas:   Edit3x F2 | 300 total | 3 parcelas | INCOME
```

**Correção:** após salvar o cabeçalho, o service sincroniza as parcelas:
1. atualiza nome, tipo e categoria de todas as parcelas mantidas (e o valor,
   quando valor/quantidade/isTotalValue mudaram);
2. apaga as parcelas excedentes quando a quantidade diminui;
3. cria as que faltam quando a quantidade aumenta, mantendo a cadência mensal a
   partir de `firstDueDate`.

**Guarda contra apagar dinheiro:** se a movimentação já tem parcela `PAID` e o
usuário tenta mudar valor/quantidade/isTotalValue, a API devolve **400** com
mensagem em português dizendo o que fazer ("estorne (volte para pendente) as
parcelas pagas antes de editar"). Mudança só de nome/tipo/categoria continua
permitida.

Bônus: `isTotalValue` existia em `EditPaymentRequest` e **não existia no
`EditPaymentDto`** — era impossível trocar entre "valor total" e "valor por
parcela" na edição. Campo exposto no DTO e repassado pelo controller.

Verificação (movimentação nova `Edit3x FC`, 300 em 3x INCOME):

| Passo | HTTP | Cabeçalho | Parcelas |
|---|---|---|---|
| POST | 201 | `Edit3x FC / 300 / 3 / INCOME` | 3 parcelas, soma 300 |
| PUT `{quantity:6, amount:600, name:"Edit6x FC"}` | 200 | `Edit6x FC / 600 / 6 / INCOME` | **6 parcelas, soma 600, nome Edit6x FC** (antes: 3 / 300 / nome antigo) |
| PUT `{type:"OUTCOME", categoryId:<CATO>}` | 200 | `OUTCOME / CATO` | **6 parcelas OUTCOME na categoria CATO** (antes: INCOME / CATI) |
| PUT `{quantity:2}` | 200 | `2 parcelas / 600` | **2 parcelas, soma 600 (300 cada)** |
| parcela marcada PAID + PUT `{amount:1000}` | **400** | inalterado | inalterado |
| parcela PAID + PUT `{name:"Edit2x FC ren"}` | 200 | renomeado | **as 2 parcelas renomeadas, PAID preservado** |

Datas geradas na expansão para 6x: 05/03, 05/04, 05/05, 05/06, 05/07, 05/08 de 2026.

---

## Varredura do padrão "campo no DTO que o controller descarta"

Script varreu todos os `*.dto.ts` + `*.controller.ts` de `src/infra/http/controllers`
(handlers `@Post/@Put/@Patch`, ignorando os que usam spread `...body`) comparando
propriedades do DTO com o que o handler referencia. Também varreu os `Edit*Dto`
atrás de campo obrigatório de id no corpo, e os `edit()` dos services de
animal/stock/finance atrás de parâmetro desestruturado e nunca atribuído.

**Na minha área, achados e corrigidos:**
- `EditDewormingDto.dewormingId` obrigatório e ignorado (item 3).
- `EditProductCategoryDto.productCategoryId` obrigatório e ignorado (item 4).
- `reproductionDonorOvulation.service.edit` — 8 parâmetros nunca atribuídos (item 1).
- `EditPaymentDto` sem `isTotalValue` (item 6, direção inversa: o service aceitava,
  o DTO não expunha).

**Fora da minha área (NÃO editei, relatando):**
- `client.controller.ts` PUT — `EditClientDto.cpf` não é desestruturado (é o caso
  conhecido, frente A).
- `user.controller.ts` PUT — `EditUserDto.role` não é desestruturado. Efeito:
  trocar o papel do usuário responde 200 e não muda nada.
- `adminCompany.controller.ts` PUT — `EditCompanyDto.logoUrl`, `phone`, `pixKey`,
  `signatureUrl` não são desestruturados. Painel admin salva e descarta 4 campos.
- `product.service.edit` — `newTags`/`oldTags` desestruturados e não usados no
  corpo do método (módulo product, frente D). Vale confirmar.

## Arquivos alterados

```
src/domain/application/services/animal/services/reproduction/reproductionDonorOvulation.service.ts
src/domain/application/services/animal/services/shoeing.service.ts
src/domain/application/services/animal/interfaces/shoeingProps.ts
src/domain/application/services/finance/services/payment.service.ts
src/domain/application/repositories/transaction.repository.ts
src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts
src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionBreedingIntermediate.repository.ts
src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionBreedingPregnancy.repository.ts
src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionDonorInsemination.repository.ts
src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionReceptorInovulation.repository.ts
src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionReceptorMonitoring.repository.ts
src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionStallionCollection.repository.ts
src/infra/shared/decorators/StrictNullableDate.decorator.ts   (novo)
src/infra/http/controllers/animal/dto/vaccine.dto.ts
src/infra/http/controllers/animal/dto/deworming.dto.ts
src/infra/http/controllers/animal/dto/exam.dto.ts
src/infra/http/controllers/animal/dto/shoeing.dto.ts
src/infra/http/controllers/stock/dto/productCategory.dto.ts
src/infra/http/controllers/finance/dto/payment.dto.ts
src/infra/http/controllers/finance/payment.controller.ts
```

Sem migration. Nada no front foi alterado.

## `npx tsc --noEmit`

Zero erros nos arquivos desta frente. A última execução acusou 3 erros, todos em
arquivos de outra frente em edição simultânea (`animal.service.ts`,
`appointment.service.ts`, `studFarm.service.ts` — `Property 'delete' does not
exist on ...Repository`, do trabalho de soft delete em andamento). Não são meus e
não foram tocados.
