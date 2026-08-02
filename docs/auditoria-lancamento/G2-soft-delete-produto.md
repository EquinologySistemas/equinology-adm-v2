# G2 — Exclusão de produto por soft delete

Decisão do dono: "Delete do produto soft delete também."

Estado anterior: a leva passada tinha trocado o delete físico (que apagava em
cascata `product_stocks`, `field_stocks` e `product_usages`) por uma RECUSA
quando existia histórico. Resolveu o estrago, mas não era o que o dono queria.

Agora: `DELETE /product/:id` grava `products.deletedAt` e responde **200**. A
linha continua no banco, o histórico continua inteiro, e o produto some das
telas.

Repo tocado: `vetequus-api` (branch `fix/lancamento`). `npx tsc --noEmit` = 0.
Nenhuma migration nova — a coluna `products.deletedAt` já veio da FASE 1.

---

## Arquivos alterados

| Arquivo | O que mudou |
| --- | --- |
| `src/domain/enterprise/entities/product.ts` | prop/getter/setter `deletedAt` (default `null`) |
| `src/domain/enterprise/entities/valueObject/productDetails.ts` | campo `deletedAt` |
| `src/infra/shared/database/prisma/mappers/PrismaProductMapper.ts` | lê e grava `deletedAt` |
| `src/infra/shared/database/prisma/mappers/PrismaProductDetailsMapper.ts` | leva `deletedAt` ao detail |
| `src/infra/http/presenters/product.presenter.ts` | expõe `deletedAt` |
| `src/infra/http/presenters/productDetails.presenter.ts` | expõe `deletedAt` |
| `src/domain/application/repositories/product.repository.ts` | `includeDeleted` no `ProductWhereFilter`; `findById`/`findDetailsById` ganham `includeDeleted?`; **`delete` e `countHistory` removidos**, entra `softDelete(productId)` |
| `src/infra/shared/database/prisma/repositories/prismaProduct.repository.ts` | helper `deletedScope()`; escopo aplicado em `findById`, `findDetailsById` e `whereFilter` (logo em `fetch` e `count`); delete físico substituído por `softDelete` |
| `src/domain/application/services/stock/services/product.service.ts` | `delete` agora chama `softDelete`; `findById` aceita `includeDeleted` |
| `src/domain/application/services/stock/interfaces/productProps.ts` | `includeDeleted?` em `FindProductByIdServiceRequest` |
| `src/infra/http/controllers/stock/dto/product.dto.ts` | `includeDeleted` em `ProductWhereDto` e na raiz de `FetchProductsDto`; nova `FindProductDto` |
| `src/infra/http/controllers/stock/product.controller.ts` | DELETE responde 200 com mensagem; GET `:id` aceita `includeDeleted`; fetch repassa o filtro |
| `src/domain/application/services/stock/services/productStock.service.ts` | recusa entrada em produto excluído |
| `src/domain/application/services/stock/services/productUsage.service.ts` | recusa consumo em produto excluído |
| `src/domain/application/services/stock/services/fieldStock.service.ts` | recusa transferência para o volante; **devolução (`returnToStock`) continua liberada** |
| `src/infra/shared/database/prisma/repositories/prismaProductStock.repository.ts` | `fetch` (só o /stock-statistics usa) ignora produto excluído |
| `src/infra/shared/database/prisma/repositories/prismaProductUsage.repository.ts` | idem |
| `src/infra/shared/database/prisma/repositories/prismaFieldStock.repository.ts` | `fetchByCompany` (só o /stock-statistics usa) ignora produto excluído |

## Contrato

- `DELETE /product/:productId` → **200** com
  `{"message":"Produto excluído. Ele não aparece mais nas listagens nem nos lançamentos de entrada e consumo; o histórico de estoque e o consumo já lançado nos atendimentos foram preservados. Para vê-lo, use o filtro de excluídos."}`
  Antes o corpo era vazio; agora tem `message`. Front que ignora o corpo não quebra.
- `GET /product?page=1&includeDeleted=true` → inclui os excluídos.
  Também aceito como `where[includeDeleted]=true` (mesmo nome usado em
  cliente/animal/atendimento/propriedade).
- `GET /product/:id` → **404** se o produto estiver excluído;
  `GET /product/:id?includeDeleted=true` → 200.
- `PUT /product/:id` e um segundo `DELETE` em produto já excluído → **404**.
- Presenters passaram a devolver `deletedAt` (fica `null` no produto vivo).

## Regra de estoque — decisão do item 6

Recomendação do briefing seguida à risca, **concordo com ela**:

- **`/stock-statistics` IGNORA o produto excluído.** Saldo de produto que sumiu
  das telas não pode entrar no "estoque atual da clínica" — o número que o dono
  usa para saber o que tem em casa.
- **`/stock-movements` MANTÉM tudo.** É o extrato: entrada e consumo do produto
  excluído continuam listados, com o nome do produto.

Detalhe que exigiu cuidado: nas estatísticas o consumo (`product_usages`) teve
que sair **junto** com as entradas. `currentStock` é `entradas − consumo −
volante`; se as entradas do excluído saíssem da conta e o consumo dele ficasse,
o estoque da clínica ficaria negativo por diferença. Por isso os três repos
(`productStock.fetch`, `productUsage.fetch`, `fieldStock.fetchByCompany` — todos
usados exclusivamente pelo `/stock-statistics`) filtram `deletedAt: null`.

Exceção consciente: **devolução do volante continua funcionando em produto
excluído** (`fieldStock.returnToStock` usa `findById(..., true)`). O veterinário
precisa conseguir zerar o que já carregava; a devolução não cria nada novo. Se
essa saída fosse bloqueada, o saldo ficaria preso no volante para sempre.

A listagem do estoque volante (`GET /field-stock`) NÃO foi filtrada: ela mostra
o que o veterinário fisicamente carrega, e esconder um saldo real seria pior do
que exibi-lo. Ele só não consegue mais consumir nem receber mais desse produto.

---

## Verificação por curl (empresa própria, token próprio)

Cenário: produto `Vermifugo G2` com 1 entrada (50 un a R$ 10) e 1 consumo
lançado no atendimento do animal `Trovao G2` (5 un).
`productId=295f05bb-b6c7-439c-bd0b-8084dd758270`,
`appointmentAnimalId=9107e62d-30e1-4dd3-9d57-38da01184a4f`.

### ANTES do delete

```
GET /product?page=1&where[query]=Vermifugo        -> 200  1 produto, deletedAt:null, currentStock:45
GET /product-usage/appointment/<aa>               -> 200  Vermifugo G2, quantity 5
GET /stock-statistics                             -> 200  {currentStock:45, totalUsageQuantity:5, currentValue:450, totalUsageValue:50}
GET /stock-movements?page=1                       -> 200  exit 5 + entry 50
```

### DELETE

```
DELETE /product/295f05bb-...  -> 200
{"message":"Produto excluído. Ele não aparece mais nas listagens nem nos lançamentos de entrada e consumo; o histórico de estoque e o consumo já lançado nos atendimentos foram preservados. Para vê-lo, use o filtro de excluídos."}
```

### SQL — a linha está viva e o histórico também

```
SELECT id, name, "deletedAt", "currentStockQuantity" FROM products WHERE id='295f05bb-...';
 295f05bb-... | Vermifugo G2 | 2026-08-02 19:37:09.303 | 45

 entradas | consumos
        1 |        1
```

### DEPOIS do delete

```
GET /product?page=1&where[query]=Vermifugo                        -> 200  {"products":[],"pages":0}     (sumiu da busca)
GET /product?page=1&where[unity]=un                               -> 200  só "Soro G2 vivo"             (sumiu da listagem/combo)
GET /product?page=1&where[query]=Vermifugo&includeDeleted=true    -> 200  aparece, deletedAt preenchido
GET /product?page=1&where[query]=Vermifugo&where[includeDeleted]=true -> 200  idem
GET /product/295f05bb-...                                         -> 404  RESOURCE_NOT_FOUND
GET /product/295f05bb-...?includeDeleted=true                     -> 200

GET /product-usage/appointment/<aa>                               -> 200  Vermifugo G2, quantity 5   << o ponto que o dono mais liga
GET /stock-movements?page=1                                       -> 200  exit Vermifugo G2 5 / entry Vermifugo G2 50 / entry Soro G2 vivo 20
GET /stock-statistics                                             -> 200  {currentStock:0, ... } e depois, com o produto vivo criado, {currentStock:20, currentValue:60}
                                                                          (o excluído saiu do estoque atual; o vivo continua contando)

POST /product-stock       (excluído)  -> 400 "Este produto foi excluído e não recebe mais entrada de estoque. Cadastre o produto novamente para voltar a comprar."
POST /product-usage/usage (excluído)  -> 400 "Este produto foi excluído e não pode mais ser lançado como consumo no atendimento. Escolha outro produto na lista."
POST /field-stock         (excluído)  -> 400 "Este produto foi excluído e não pode mais ser levado para o estoque volante. Escolha outro produto na lista."

PUT /product/295f05bb-...             -> 404
DELETE /product/295f05bb-... (2ª vez) -> 404
```

## Pendências para o front (fora do meu escopo)

- ADM/WEB: o botão de excluir produto pode voltar a existir sem medo — o
  endpoint não recusa mais. A mensagem de sucesso pode vir do `message` do 200.
- Se quiserem uma tela "ver excluídos" de produto, o parâmetro é
  `includeDeleted=true` na listagem, igual às outras entidades.
