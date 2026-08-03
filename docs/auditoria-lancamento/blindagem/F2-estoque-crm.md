# F2-estoque-crm

Auditoria executada contra a API rodando em `http://localhost:3333`, com empresa
própria criada só para este teste (isolamento total).

- Empresa de teste: `143b32a1-dc6a-407e-b508-52467942098d`
- Usuário: `d383eae3-ea87-4ae3-beab-fff913acf19a`
- Empresa "vizinha" usada nos testes de isolamento: `f4e2f01e-49fb-4ccd-b02c-df1d645aeca5`
- Nenhum arquivo `.ts` foi alterado.

## Cobertura: 31 / 31 rotas do conjunto

| Grupo | Rotas exercitadas |
|---|---|
| /product (5) | `POST /product`, `PUT /product/:id`, `DELETE /product/:id`, `GET /product/:id`, `GET /product` |
| /product-category (4) | `POST`, `PUT /:id`, `DELETE /:id`, `GET` |
| /product-stock (1) | `POST /product-stock` |
| /field-stock (4) | `POST`, `GET`, `GET /:id`, `PUT /:id` |
| /stock-movements (1) | `GET /stock-movements` |
| /stock-statistics (1) | `GET /stock-statistics` |
| /product-usage (2) | `POST /product-usage/usage`, `GET /product-usage/appointment/:appointmentAnimalId` |
| /tag (4) | `POST`, `PUT /:id`, `DELETE /:id`, `GET` |
| /board (4) | `POST`, `PUT /:id`, `DELETE /:id`, `GET` |
| /lead (5) | `POST`, `PUT /:id`, `DELETE /:id`, `GET`, `GET /lead/board/:boardId` |

**Não testadas: nenhuma.**

Lacunas de profundidade (declaradas, não são "passou"):
- Concorrência (duas baixas simultâneas no mesmo produto) não foi testada — não há
  transação/lock visível no `fieldStock.service.ts` (read-modify-write em `currentStockQuantity`),
  é candidato a corrida, mas **não reproduzi**.
- Não testei token de usuário secundário da mesma empresa contra o estoque volante
  de outro usuário (só cross-company).

---

## Achados

### 1. BLOQUEIA — `POST /product-usage/usage` com quantidade negativa CRIA estoque do nada
**Confiança: CONFIRMADO**

Consumo com `quantity` negativo retorna **201** e *soma* no estoque em vez de baixar.
Não existe nenhuma guarda `quantity <= 0` no `productUsage.service.ts` (o `fieldStock.service.ts`
tem essa guarda; o de uso não).

Reprodução (produto com 73 no geral e 15 no volante):
```
POST /product-usage/usage {"productId":P,"quantity":-5,"stockType":"general","appointmentAnimalId":AA}
-> 201
GET /product/P  -> currentStock 73 => 78

POST /product-usage/usage {"productId":P,"quantity":-100,"stockType":"field","appointmentAnimalId":AA}
-> 201
GET /product/P  -> currentFieldStock 15 => 115
```
Evidência no banco:
```
SELECT id, quantity FROM product_usages WHERE "productId"='<P>';
  5 | 7 | -5 | -100      <- linhas negativas gravadas
SELECT "currentStockQuantity" FROM products WHERE id='<P>';  -> 78
```
Impacto: qualquer usuário logado inventa estoque e destrói o inventário e todo o
financeiro derivado (`/stock-statistics` passou a devolver `currentStock: -15`,
`totalUsageQuantity: -93`, `totalUsageValue: -465`).

---

### 2. BLOQUEIA — `POST /product-stock` aceita quantidade negativa e deixa o estoque negativo
**Confiança: CONFIRMADO**

Entrada de estoque com quantidade negativa retorna **201** e leva o saldo abaixo de zero.

```
GET /product/PX -> currentStock 3
POST /product-stock {"productId":PX,"quantity":-50,"unitValue":1,"date":"2026-08-01T00:00:00.000Z"} -> 201
GET /product/PX -> currentStock -47
```
`unitValue`/`totalValue` negativos também são aceitos (201), envenenando o preço médio
usado por `/stock-statistics`.

---

### 3. BLOQUEIA — `GET /stock-statistics` reporta estoque geral errado (nunca desconta o consumo)
**Confiança: CONFIRMADO**

`stockStatistics.service.ts` calcula `currentStock = totalStock - currentFieldStock`,
sem subtrair `productUsage`. Já o `currentValue` da MESMA resposta usa
`stockQty - usageQty - fieldQty`. Ou seja: a quantidade e o valor da mesma tela se contradizem.

Reprodução (entrada 100, transferiu 30 pro volante, devolveu 10, consumiu 5 do volante e 7 do geral):
```
GET /product/P        -> currentStock 73, currentFieldStock 15   (correto)
GET /stock-statistics -> currentStock 85, currentFieldStock 15, currentValue 365
                          (365 = 73 x 5 -> o VALOR usa 73, a QUANTIDADE mostra 85)
```
Impacto: o painel de estoque mostra sempre `estoque + tudo que já foi consumido`.
Quanto mais a clínica usa o sistema, mais errado fica.

---

### 4. BLOQUEIA — `DELETE /product/:id` apaga em cascata todo o histórico de estoque e o consumo lançado em atendimentos
**Confiança: CONFIRMADO**

Excluir um produto não é bloqueado nem avisado: apaga o produto e, junto, todas as
entradas, o estoque volante e os `product_usages` já vinculados a atendimentos
(histórico clínico de consumo do animal).

```
DELETE /product/<P> -> 200
GET  /product/<P>   -> 404
SELECT count(*) FROM product_usages WHERE "productId"='<P>';  -> 0
SELECT count(*) FROM product_stocks WHERE "productId"='<P>';  -> 0
SELECT count(*) FROM field_stocks   WHERE "productId"='<P>';  -> 0
SELECT id FROM products WHERE id='<P>';                        -> 0 linhas (hard delete)
GET /stock-movements?page=1 -> {"movements":[],"pages":0}   (extrato ficou vazio)
```
Não há soft delete. Um clique errado apaga o histórico do inventário sem retorno.

---

### 5. BLOQUEIA — `PUT /product-category/:id` está quebrado: exige no corpo um campo que o controller ignora
**Confiança: CONFIRMADO**

`EditProductCategoryDto` declara `productCategoryId` **obrigatório** com `@IsUUID`,
mas o controller usa o `:productCategoryId` da rota. Resultado: a chamada natural falha.

```
PUT /product-category/33dcd525-...  {"name":"Cat F2 Edit","color":"#000000"}
-> 400 {"message":["ID da categoria inválido"]}          <- edição impossível

PUT /product-category/33dcd525-...  {"productCategoryId":"33dcd525-...","name":"Cat F2 Edit","color":"#000000"}
-> 200 (funciona)
```
Além disso, o campo do corpo é **descartado em silêncio**: mandando
`productCategoryId` de OUTRA categoria, a API edita a da URL e responde 200.
Editar categoria de produto simplesmente não funciona pelo caminho óbvio.

---

### 6. BLOQUEIA — `POST /lead` aceita `boardId` de OUTRA empresa (e de fase inexistente dá 500)
**Confiança: CONFIRMADO**

`lead.service.ts::create` recebe o `BoardRepository` injetado e **nunca o usa**:
não valida existência nem dono da fase.

```
POST /lead {... "boardId":"9800ed86-..." (fase da empresa f4e2f01e...)}
-> 201 {"lead":{"id":"829fdfe5-...","boardId":"9800ed86-..."}}

SELECT id,name,"companyId" FROM leads WHERE "boardId"='9800ed86-...';
  91fa0a5a | Haras São Jorge     | f4e2f01e...
  835ad3fb | Sítio Recanto Feliz | f4e2f01e...
  829fdfe5 | Hack                | 143b32a1...   <- meu lead na fase do vizinho
```
Não houve vazamento de leitura (o `fetch` filtra por `companyId`), mas o lead criado
some do meu kanban para sempre: `GET /board` não devolve aquela fase e nenhuma coluna
mostra o lead, embora ele apareça em `GET /lead?filter=all`. Lead entra e desaparece do funil.

Mesmo caminho, com fase inexistente ou id malformado:
```
POST /lead {... "boardId":"00000000-0000-4000-8000-000000000000"} -> 500
POST /lead {... "boardId":"abc"}                                   -> 500
```
`PUT /lead/:id` faz a validação certa (403). Só o `POST` não faz.

---

### 7. GRAVE — Qualquer UUID malformado em parâmetro de rota devolve 500 (sistêmico neste conjunto)
**Confiança: CONFIRMADO**

Nenhuma dessas rotas usa `ParseUUIDPipe`; o erro do Prisma vaza como 500 genérico:

```
GET    /product/abc                        -> 500
PUT    /product/abc                        -> 500
DELETE /product/abc                        -> 500
DELETE /product-category/abc               -> 500
GET    /field-stock/abc                    -> 500
PUT    /field-stock/abc                    -> 500
PUT    /tag/abc                            -> 500
DELETE /tag/abc                            -> 500
GET    /product-usage/appointment/abc      -> 500
```
Mensagem: "Não foi possível concluir a operação... entre em contato com o suporte."
O correto seria 400/404. (Só `PUT /product-category/abc` devolve 400, e por acidente:
o 400 vem da validação do corpo descrita no achado 5.)

---

### 8. GRAVE — Exclusão bloqueada por vínculo devolve 500 cru em vez de mensagem explicando
**Confiança: CONFIRMADO**

Três casos, todos com id válido e da minha empresa:
```
DELETE /product-category/<cat com produto>  -> 500   (categoria continua no banco)
DELETE /tag/<tag vinculada a produto>       -> 500   (product_tags continua com 1 linha)
DELETE /board/<fase com 15 leads>           -> 500   (leads continuam no banco)
```
O bloqueio de fato acontece (nada é apagado, confirmado por SQL), mas o usuário recebe
"erro interno, procure o suporte" em vez de "não é possível excluir: existem N itens vinculados".
Na prática o operador vai achar que o sistema quebrou.

---

### 9. GRAVE — Estoque insuficiente no volante responde 403 "Você não tem permissão"
**Confiança: CONFIRMADO**

`fieldStock.service.ts` usa `NotAllowedError` para saldo insuficiente e para quantidade <= 0.
Bloqueia certo (saldo não muda), mas a mensagem não tem nada a ver com o problema.

```
(produto com 70 no geral)
POST /field-stock {"productId":P,"quantity":1000} -> 403 "Você não tem permissão para realizar esta ação."
POST /field-stock {"productId":P,"quantity":-50}  -> 403 (mesma mensagem)
POST /field-stock {"productId":P,"quantity":0}    -> 403 (mesma mensagem)

(volante com 20)
PUT /field-stock/<fs> {"quantity":500}            -> 403 (mesma mensagem)
```
Compare com `/product-usage`, que faz certo: `400 INSUFFICIENT_STOCK`
"Quantidade insuficiente em estoque. Reduza a quantidade ou reponha o item no estoque."

---

### 10. GRAVE — `leadQuantity` do kanban ignora o filtro aplicado (contador mente)
**Confiança: CONFIRMADO**

`GET /board` filtra os leads retornados por `query`/`startDate`/`endDate`, mas o
contador da coluna continua sendo o total sem filtro.

```
GET /board?query=Lead%20B15
  Fase 1  : leads=1  leadQuantity=15
  Fechado : leads=0  leadQuantity=1

GET /board?startDate=2020-01-01&endDate=2020-01-02
  Fase 1  : leads=0  leadQuantity=15
  Fechado : leads=0  leadQuantity=1
```
A coluna diz "15" e mostra 1 card.

---

### 11. GRAVE — Kanban só entrega 10 leads por coluna e `GET /board` não tem paginação
**Confiança: CONFIRMADO** (a suspeita do briefing procede)

```
15 leads criados na Fase 1:
GET /board -> Fase 1: leads=10, leadQuantity=15
```
`GET /board` não aceita `page`. O único jeito de ver o resto é
`GET /lead/board/:boardId?page=2` — que funciona (devolve os 5 restantes), **mas não
devolve `pages` nem total**, só `{"leads":[...]}`. O front não tem como saber quantas
páginas existem; tem que adivinhar por "veio menos de 10".

---

### 12. MENOR — `POST /field-stock` (transferência geral→volante) não gera movimentação no extrato
**Confiança: CONFIRMADO**

```
POST /product-stock (10 un)  -> aparece em /stock-movements como entry:10
POST /field-stock   (4 un)   -> NÃO aparece em /stock-movements
POST /product-usage (2 un)   -> aparece como exit:2
```
A transferência para o volante e a devolução (`PUT /field-stock/:id`) somem do extrato.
Não dá para auditar "quem levou o quê para o campo". Além disso, a linha `exit` vem com
`unitValue: null` e `totalValue: null`, então o extrato não tem o valor do que saiu.

---

### 13. MENOR — Fases do CRM aceitam posição duplicada e mais de uma fase "fechada"
**Confiança: CONFIRMADO**

```
POST /board {"name":"Dup","position":1,"isLost":false,"color":"#fff","isLast":true} -> 201
GET /board -> Fase 1 pos1 isLast=false | Dup pos1 isLast=true | Perdido pos3 | Fechado pos4 isLast=true
```
Duas fases na posição 1 e duas com `isLast=true`. A ordem do kanban fica indefinida e o
filtro `filter=close` passa a ter duas fases-destino.

---

### 14. MENOR — Campos numéricos sem limite inferior e textos sem limite de tamanho
**Confiança: CONFIRMADO**

```
POST /lead {... "animalQuantity":-99}                 -> 201 (gravado -99)
POST /tag     {"name":"<5000 caracteres>", ...}       -> 201
POST /product {"name":"<5000 caracteres>", ...}       -> 201
```
Sem `@Min`/`@MaxLength`. Quebra layout de tela e permite dado sem sentido.

---

## O que passou (não precisa reauditar)

**Isolamento multiempresa — sólido em tudo, exceto o achado 6.** Testado com id real
da empresa `f4e2f01e-...` obtido por SQL, sempre confirmando no banco que nada mudou:

| Tentativa com recurso de outra empresa | Resposta |
|---|---|
| `GET/PUT/DELETE /product/:id` | 403, produto intacto |
| `POST /product-stock` em produto alheio | 403, `currentStockQuantity` intacto |
| `POST /field-stock` com produto alheio | 403 |
| `GET /field-stock/:id` alheio | 404 |
| `PUT /field-stock/:id` alheio | 403 |
| `PUT/DELETE /product-category/:id` alheio | 403, nome intacto |
| `PUT/DELETE /tag/:id` alheio | 403, nome intacto |
| `PUT/DELETE /board/:id` alheio | 403, nome intacto |
| `PUT/DELETE /lead/:id` alheio | 403, nome intacto |
| `GET /product-usage/appointment/:id` de atendimento alheio | 403 |
| `POST /product-usage/usage` com `appointmentAnimalId` alheio | 403, 0 linhas gravadas |
| `GET /lead/board/:boardId` de fase alheia | devolveu só leads da MINHA empresa — sem vazamento |

**Saldo geral ↔ volante bate dos dois lados (no caminho feliz).** Entrada 100 →
transfere 30 → devolve 10 → consome 5 do volante → consome 7 do geral:
`currentStock 73` + `currentFieldStock 15` = 88 = 100 − 12 consumidos. Conferido em
`GET /product/:id`, `GET /field-stock`, `GET /field-stock/:id` — os três concordam.
(A divergência está no `/stock-statistics`, achado 3.)

**Não dá para transferir mais do que existe nem ficar negativo pela transferência.**
`POST /field-stock` com 1000 (só 70 disponíveis), com −50 e com 0 → todos bloqueados,
saldo inalterado no banco. Mesma coisa em `PUT /field-stock/:id` devolvendo 500 com 20 disponíveis.
(A mensagem é ruim — achado 9 — mas a regra funciona de verdade.)

**`product-usage` baixa o estoque corretamente e trava consumo acima do saldo.**
`stockType:"field"` baixa só o volante; `stockType:"general"` baixa só o geral;
acima do saldo → `400 INSUFFICIENT_STOCK` com mensagem clara em português, nos dois tipos.
`GET /product-usage/appointment/:appointmentAnimalId` devolve o consumo do atendimento.
`appointmentAnimalId` é opcional e omitido funciona (201).

**`PUT /product/:id` — ida e volta completa, sem campo descartado.** Enviei
`name`, `unity`, `categoryId`, `minimumStock`, `minimumFieldStock`, `observation`, `newTags`
e o `GET /product/:id` devolveu todos os 7 alterados. `oldTags` também remove de verdade
(tag sumiu do array na leitura seguinte).

**`PUT /tag/:id` e `PUT /board/:boardId` — ida e volta completa.**
Tag: `name` + `color` persistiram. Board: `name`, `position`, `isLost`, `isLast`, `color`,
os 5 persistiram.

**`PUT /lead/:leadId` — ida e volta completa, incluindo mover de fase.**
Os 7 campos (`name`, `phone`, `city`, `state`, `boardId`, `animalQuantity`, `category`, `procedure`)
persistiram. Mover entre fases funciona e reflete no kanban e nos filtros:
lead movido para a fase `isLost` aparece em `filter=lost`; movido para `isLast` aparece em `filter=close`.

**Paginação e filtros de `/product`.** 14 produtos: `page=1` → 10 itens/`pages:2`;
`page=2` → 4; `page=3` → lista vazia e 200. `page=0`, `page=-1`, `page=abc` → 400 com
"A página deve ser no mínimo 1." Filtro `where[query]`, `where[categoryId]` (categoria
vazia devolve `pages:0` limpo) e `sort[sortField]=name&sort[sortOrder]=desc` todos corretos.

**Paginação e filtros de `/field-stock`.** 14 itens no volante: `page=1` → 10/`pages:2`,
`page=2` → 4. `query=P3` filtra certo. Sem `page` ou `page=abc` → 400.

**Paginação e filtros de `/lead` e `/lead/board/:boardId`.** 16 leads: `page=1` → 10/`pages:2`,
`page=2` → 6. `filter=all|pending|lost|close` respondem coerentemente com a fase do lead.
`query` filtra por nome. `/lead/board/:boardId?page=2` devolve o resto (limitação: sem `pages`, achado 11).

**`/stock-movements`.** Registra `entry` no `POST /product-stock` e `exit` no
`POST /product-usage/usage`, com `productName`, `productUnity`, `categoryName`, `quantity`, `date`.
`type=entry`/`type=exit` filtram certo; `type=xxx` → 400 "Tipo deve ser entry ou exit";
`page=abc` → 400; sem `page` → 200 (default 1).

**Validação de corpo (class-validator) responde 400 em português nos casos testados:**
nome vazio, nome numérico, `stockType` fora do enum, `animalQuantity` string,
`productId` não-UUID, data impossível `2026-02-31` (`@StrictDate` dispara de verdade — testado),
`startDate=abc` e `startDate=2026-02-31` em `/board`.

**`POST /product-stock` com produto inexistente → 404 limpo** ("Registro não encontrado").
**`DELETE /product-category/<uuid inexistente>` → 404 limpo.**
**`GET /product/<uuid deletado>` → 404 limpo.**
**`DELETE /board/<fase vazia>` → 200 e some da listagem.**
**`GET /board` com empresa nova → `{"boards":[]}` 200.**
