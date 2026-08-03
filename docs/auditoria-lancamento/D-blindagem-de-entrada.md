# Frente D — Blindagem de entrada (negativos e valores impossíveis)

Escopo: módulos `product`, `product-stock`, `product-usage`, `field-stock`,
`stock-statistics`, `transaction`. Nada de `payment` (frente C).

Repo: `vetequus-api`, branch `fix/lancamento`. Sem commit.

Verificação: curl real contra `http://localhost:3333`, cenário reproduzido
ANTES e DEPOIS, mais conferência por SQL no `vetequus-local`.

Ambiente de teste criado só para isso (empresas novas, nada de dado de
outra frente):

- Empresa 1: `37678d5a-513d-4ee4-b1b5-24cdcd71f826` (reprodução dos bugs)
- Empresa 2: `5e9a9b02-48a9-4109-bb40-26e04a372634` (cenário limpo das estatísticas)

---

## 1. POST /product-usage/usage com quantidade negativa criava estoque do nada

**Antes**

```
POST /product-usage/usage {"productId":P,"quantity":-15,"stockType":"general"}  -> HTTP 201
GET  /product/P  -> currentStock passou de 60 para 75   (o "consumo" SOMOU)
POST /product-usage/usage {"quantity":0}                                        -> HTTP 201
GET  /stock-statistics -> totalUsageQuantity: -15, totalUsageValue: -100
```

**Depois**

```
POST /product-usage/usage {"quantity":-15} -> HTTP 400
  "A quantidade utilizada deve ser no mínimo 1. Informe quanto foi consumido."
POST /product-usage/usage {"quantity":0}   -> HTTP 400  (mesma mensagem)
POST /product-usage/usage {"quantity":1}   -> HTTP 201  (caminho feliz intacto)
```

**O que mudou**

- `src/infra/http/controllers/stock/dto/productUsage.dto.ts`: `quantity` passou
  de `@IsNumber()` solto para `@IsInt` + `@Min(1)`.
- `src/domain/application/services/stock/services/productUsage.service.ts`:
  guarda de domínio no início do `create` — `!Number.isInteger(quantity) || quantity <= 0`
  devolve `ValidationError` (HTTP 400). A guarda **não** depende do DTO.

## 2. POST /product-stock aceitava quantidade negativa e deixava saldo negativo

**Antes**

```
POST /product-stock {"quantity":-50,"unitValue":1,...}  -> HTTP 201
GET  /product/P -> currentStock: -50
POST /product-stock {"quantity":0}                      -> HTTP 201
POST /product-stock {"quantity":10,"unitValue":-5}      -> HTTP 201
```

**Depois**

```
POST /product-stock {"quantity":-50} -> HTTP 400 "A quantidade da entrada deve ser no mínimo 1. Informe quanto entrou."
POST /product-stock {"quantity":0}   -> HTTP 400 (mesma)
POST /product-stock {"unitValue":-5} -> HTTP 400 "O valor unitário não pode ser negativo. Informe 0 ou mais."
POST /product-stock {"totalValue":-5}-> HTTP 400 "O valor total não pode ser negativo. Informe 0 ou mais."
POST /product-stock {"quantity":5,"unitValue":2} -> HTTP 201
```

**O que mudou**

- `dto/productStock.dto.ts`: `quantity` → `@IsInt` + `@Min(1)`;
  `unitValue` e `totalValue` → `@Min(0)`.
- `services/stock/services/productStock.service.ts`: guarda de domínio para os
  três campos, com `ValidationError` e mensagem específica de cada um.

## 3. GET /stock-statistics nunca descontava o consumo

Causa: `currentStock = totalStock - currentFieldStock`, sem subtrair
`productUsage` — enquanto `currentValue`, na mesma resposta, já usava
`stockQty - usageQty - fieldQty`. Quantidade e valor se contradiziam na mesma tela.

**Cenário mínimo pedido (entrada 10, consumo 3), empresa limpa**

| | antes (fórmula antiga) | depois |
|---|---|---|
| currentStock | 10 | **7** |
| GET /product/:id currentStock | 7 | 7 |
| currentValue (R$ 5/un) | 35 | 35 |

Resposta real depois da correção:

```
GET /stock-statistics
{"currentStock":7,"currentFieldStock":0,"totalUsageQuantity":3,
 "currentValue":35,"fieldStockValue":0,"totalUsageValue":15}
SQL: SELECT "currentStockQuantity" FROM products WHERE id=P -> 7
```

**Cenário completo do relatório** (entrada 100, transfere 30 pro volante,
devolve 10, consome 5 do volante e 7 do geral):

```
GET /product/P          -> currentStock 73, currentFieldStock 15
GET /stock-statistics   -> currentStock 73, currentFieldStock 15, currentValue 365
SQL: entradas 100 | consumo 12 | volante 15 | geral 73
```

Antes o relatório media 85 nesse mesmo cenário, com currentValue 365 (= 73 × 5).
Agora quantidade e valor batem.

**O que mudou**

- `services/stock/services/stockStatistics.service.ts`:
  `const currentStock = totalStock - totalUsage - currentFieldStock;`

## 4. DELETE /product apagava em cascata o histórico de estoque e o consumo

`prismaProduct.repository.delete` faz `deleteMany` em `product_tags`,
`product_usages`, `field_stocks` e `product_stocks` antes de apagar o produto.
As FKs no banco são RESTRICT — quem cascateia é o próprio repositório.

**Antes**

```
Produto com 1 entrada, 1 saldo no volante e 1 consumo:
DELETE /product/P2 -> HTTP 200
SQL: products 0 | product_stocks 0 | field_stocks 0 | product_usages 0
```

**Depois**

```
DELETE /product/<com histórico> -> HTTP 400
  "Este produto não pode ser excluído porque tem histórico: 2 entrada(s) de
   estoque, 1 saldo(s) no estoque volante, 3 lançamento(s) de consumo.
   Excluir apagaria o histórico de estoque e o consumo já lançado nos
   atendimentos dos animais. Se o produto saiu de linha, pare de usá-lo: ele
   continua no cadastro para manter o histórico. Se precisar mesmo remover,
   acione o suporte."
SQL depois da recusa: products 1 | product_stocks 2 | field_stocks 1 | product_usages 3

DELETE /product/<sem nenhum histórico> -> HTTP 200
SQL: products 0   (produto criado errado continua podendo ser apagado)
```

### Decisão: recusar a exclusão, não marcar como inativo. Justificativa

- Soft delete exigiria coluna nova em `products` **e** filtro em todas as
  consultas que leem produto: `fetch`, `count`, `findById`, `findDetailsById`,
  `/stock-movements`, `/stock-statistics` e as telas de volante. Qualquer
  ponto esquecido volta o produto "excluído" para a tela — falha silenciosa,
  na véspera do lançamento.
- A frente A está aplicando soft delete em outras entidades. Fazer o mesmo
  aqui criaria dependência entre as frentes; a instrução era resolver dentro
  do módulo.
- A recusa é completa e provável em uma chamada. E não tira nada do usuário:
  produto sem histórico continua sendo apagável, que é o caso real de
  "cadastrei errado".

**O que mudou**

- `src/domain/application/repositories/product.repository.ts`: novo
  `countHistory(productId)` devolvendo `{ stockEntries, fieldStocks, usages }`.
- `prismaProduct.repository.ts`: implementação com três `count`.
- `services/stock/services/product.service.ts`: `delete` recusa com
  `ValidationError` quando `countHistory` soma > 0, listando quantos vínculos
  existem de cada tipo.

---

## Varredura: campos numéricos que ganharam piso

| Rota | Campo | Antes | Depois | HTTP com valor negativo |
|---|---|---|---|---|
| POST /product-stock | quantity | `@IsNumber()` | `@IsInt` + `@Min(1)` + guarda no service | 400 |
| POST /product-stock | unitValue | `@IsNumber()` | `@Min(0)` + guarda no service | 400 |
| POST /product-stock | totalValue | `@IsNumber()` | `@Min(0)` + guarda no service | 400 |
| POST /product-usage/usage | quantity | `@IsNumber()` | `@IsInt` + `@Min(1)` + guarda no service | 400 |
| POST /field-stock | quantity | `@IsNumber()` | `@IsInt` + `@Min(1)` + guarda no service | 400 |
| PUT /field-stock/:id | quantity | `@IsNumber()` | `@IsInt` + `@Min(1)` + guarda no service | 400 |
| GET /field-stock | page | `@IsNumberString()` | `@Type(Number)` + `@IsInt` + `@Min(1)` | 400 (era 500) |
| POST /product | minimumStock | `@IsNumber()` | `@IsInt` + `@Min(0)` | 400 |
| POST /product | minimumFieldStock | `@IsNumber()` | `@IsInt` + `@Min(0)` | 400 |
| PUT /product/:id | minimumStock | `@IsNumber()` | `@IsInt` + `@Min(0)` | 400 |
| PUT /product/:id | minimumFieldStock | `@IsNumber()` | `@IsInt` + `@Min(0)` | 400 |
| POST/PUT /product | name | sem limite | `@MaxLength(120)` | 400 com 5000 chars |
| POST/PUT /product | unity | sem limite | `@MaxLength(20)` | 400 |
| POST/PUT /product | observation | sem limite | `@MaxLength(500)` | 400 |
| GET /stock-movements | page | `@IsNumberString()` | `@Type(Number)` + `@IsInt` + `@Min(1)` | 400 (era 500) |
| POST /transaction | value | `@IsNumber()` | `@Min(0.01)` | 400 |
| PUT /transaction/:id | value | `@IsNumber()` | `@Min(0.01)` | 400 |
| GET /transaction | page | `@IsNumberString()` | `@Type(Number)` + `@IsInt` + `@Min(1)` | 400 (era 500) |

`@Min(0.01)` em `transaction.value` é o mesmo piso que `CreatePaymentDto.amount`
já tinha — as duas rotas gravam a mesma tabela e agora validam igual.

### Mensagens de erro de estoque insuficiente (bônus da mesma varredura)

`fieldStock.service` usava `NotAllowedError` (403 "Você não tem permissão para
realizar esta ação") tanto para quantidade inválida quanto para saldo
insuficiente. Trocado:

```
POST /field-stock {"quantity":100000}   -> 400 INSUFFICIENT_STOCK
  "Quantidade insuficiente em estoque. Reduza a quantidade ou reponha o item no estoque."
PUT  /field-stock/:id {"quantity":99999} -> 400 INSUFFICIENT_STOCK  (mesma)
```

Igual ao que `/product-usage` já fazia certo.

---

## Prova de que a guarda dispara (ceticismo)

O DTO barra antes do service, então HTTP sozinho não prova que a guarda de
domínio existe de verdade. Rodei um spec temporário instanciando os três
services direto, com repositórios stub que **lançam exceção se forem tocados** —
se a guarda não disparasse, o teste quebraria com outro erro. Os três passaram:

```
productUsage  -15 / 0 / 1.5 -> ValidationError "A quantidade utilizada deve ser um número inteiro maior que zero..."
productStock  -50 / 0       -> ValidationError "A quantidade da entrada deve ser um número inteiro maior que zero..."
productStock  unitValue -5  -> ValidationError "O valor unitário não pode ser negativo..."
productStock  totalValue -5 -> ValidationError "O valor total não pode ser negativo..."
fieldStock.create      -5/0 -> ValidationError "A quantidade a transferir deve ser um número inteiro maior que zero..."
fieldStock.returnToStock -5/0 -> ValidationError "A quantidade a devolver deve ser um número inteiro maior que zero..."
```

O spec era temporário e foi removido — não ficou arquivo novo no repo.

---

## Conferência final por SQL

```sql
SELECT 'products' t, count(*) FROM products WHERE "currentStockQuantity"<0
UNION ALL SELECT 'product_stocks', count(*) FROM product_stocks WHERE quantity<=0 OR "unitValue"<0 OR "totalValue"<0
UNION ALL SELECT 'product_usages', count(*) FROM product_usages WHERE quantity<=0
UNION ALL SELECT 'field_stocks',  count(*) FROM field_stocks  WHERE quantity<0
UNION ALL SELECT 'transactions',  count(*) FROM transactions  WHERE value<=0;
```

Depois da correção, nenhuma linha nova negativa foi gravada. Limpei as linhas
que eu mesmo criei nos testes ANTES. Sobraram só linhas antigas, anteriores à
correção:

| tabela | linhas | origem |
|---|---|---|
| products | 1 | `P1` (-46) da empresa `143b32a1-...`, da varredura original |
| product_stocks | 2 | mesma empresa `143b32a1-...` (quantity -50, unitValue -99) |
| product_usages | 0 | — |
| field_stocks | 0 | — |
| transactions | 2 | `NegTx` (-99) da varredura e `Fatura recebida` (-500), originada de `POST /invoice` com valor negativo — **rota da frente C** |

Essas linhas precisam de limpeza de dados antes do lançamento; não são
regressão da correção.

---

## Regressão (caminho feliz continua funcionando)

```
POST /product-stock  {quantity:5, unitValue:2}   -> 201
POST /field-stock    {quantity:2}                -> 201
POST /product-usage/usage {quantity:1,"field"}   -> 201
PUT  /field-stock/:id {quantity:10}              -> 200
GET  /product/:id                                -> 200
GET  /product?page=1                             -> 200   (page=0 -> 400)
GET  /field-stock?page=1                         -> 200
GET  /stock-movements?page=1 e sem page          -> 200
GET  /stock-statistics                           -> 200, currentStock bate com GET /product
POST /transaction {value:10}                     -> 201
PUT  /transaction/:id {value:50}                 -> 200
GET  /transaction?page=1                         -> 200
POST /product {minimumStock:0}                   -> 201
DELETE /product/<sem histórico>                  -> 200
```

O front (`equinology-web-v2`) já enviava `min={1}` nos inputs de quantidade e
bloqueava `<= 0` antes do POST, então o piso novo não quebra fluxo existente.

---

## Arquivos alterados

```
src/infra/http/controllers/stock/dto/productStock.dto.ts
src/infra/http/controllers/stock/dto/productUsage.dto.ts
src/infra/http/controllers/stock/dto/fieldStock.dto.ts
src/infra/http/controllers/stock/dto/product.dto.ts
src/infra/http/controllers/stock/dto/stockMovement.dto.ts
src/infra/http/controllers/stock/stockMovement.controller.ts
src/infra/http/controllers/finance/dto/transaction.dto.ts
src/domain/application/services/stock/services/productStock.service.ts
src/domain/application/services/stock/services/productUsage.service.ts
src/domain/application/services/stock/services/fieldStock.service.ts
src/domain/application/services/stock/services/stockStatistics.service.ts
src/domain/application/services/stock/services/product.service.ts
src/domain/application/repositories/product.repository.ts
src/infra/shared/database/prisma/repositories/prismaProduct.repository.ts
```

Sem migration. Sem alteração de schema.

## Estado do `npx tsc --noEmit`

Exit 2, mas **nenhum erro em arquivo da frente D**. Os três erros restantes são
de arquivos que outras frentes estão editando em paralelo neste momento:

```
src/domain/application/services/animal/services/animal.service.ts(225,33)   AnimalRepository.delete
src/domain/application/services/appointment/services/appointment.service.ts(354,38) AppointmentRepository.delete
src/domain/application/services/studFarm/services/studFarm.service.ts(163,35) StudFarmRepository.delete
```

## Fora do meu escopo, encontrado no caminho

- `POST /invoice` com `amount` negativo gera `transactions.value = -500`
  (a linha `Fatura recebida` acima). Rota da frente C.
- `CreateTransactionDto.paymentId` é declarado obrigatório (`@IsNotEmpty`,
  sem `@IsOptional`) apesar do `ApiProperty` dizer `required: false`. Não
  mexi: mudar isso altera contrato de rota, não é blindagem de valor.
- UUID malformado em `GET/PUT/DELETE /product/:id`, `GET/PUT /field-stock/:id`
  e `PUT /transaction/:id` ainda devolve 500 (falta `ParseUUIDPipe`). É outro
  achado do relatório, não estava na minha lista.
