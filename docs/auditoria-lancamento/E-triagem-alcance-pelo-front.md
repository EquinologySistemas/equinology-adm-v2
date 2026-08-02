# Frente E — Triagem: o bug é alcançável pela tela?

**Nenhuma linha de código de aplicação foi alterada.** Frente somente-leitura.
Entregável principal: `TRIAGEM-ALCANCE.md` (nesta mesma pasta).

## O que foi feito

1. Leitura completa do `BLINDAGEM-API.md` (44 BLOQUEIA + 89 GRAVE).
2. Mapeamento de **todos** os pontos de chamada dos 3 fronts:
   - WEB `equinology-web-v2`: `app/`, `services/`, `context/`, `hooks/`, `lib/`
   - APP `equinology-app-v2`: `lib/api-routes.ts` (catálogo) + `app/`, `components/`
   - ADM `equinology-adm-v2`: `src/app/(private)/*`
3. Para cada achado dependente de campo/parâmetro: conferência do **corpo real**
   que o front monta (não só se a rota existe).
4. Reprodução por curl contra `http://localhost:3333` dos cenários decisivos.

## Descobertas que mudam a prioridade

### 1. O caso do dono está confirmado: `animals` no PUT não vem do front

Os 4 pontos que fazem `PUT /appointment/:id` no web mandam, no máximo,
`{startDate, endDate, description}`. O `EditAppointmentSheet.tsx:84` tem até um
comentário no código dizendo "Só a descrição. SEM `animals`". APP e ADM não
chamam a rota. Os **3 achados** de `PUT /appointment` com `animals` (reset de
histórico, 500 com ficha, `animals: []` silencioso) são **SO_VIA_API**.

### 2. `GET /appointment-animal` é rota morta

Nenhum front chama o GET. Isso derruba de prioridade **1 BLOQUEIA** (filtro de
data por `createdAt`) e **4 GRAVE** (`state=SP`, `city/breed` case-sensitive,
`startDate=abc`, `page<=0`). A listagem da tela usa `GET /appointment/fetch`.

### 3. `DELETE /appointment` e `DELETE /client` não existem na tela

Os dois achados BLOQUEIA de "500 sempre" não são reproduzíveis por usuário: não
há botão. Confirmado por grep de `DeleteAPI` no web inteiro.

### 4. `GET /transaction` inteiro não é usado

O extrato financeiro da tela usa `GET /payment`. Isso torna **NAO_USADO** dois
BLOQUEIA (`?clientId=` vazio, `statistics?animalId=` zerado) e três GRAVE.

### 5. As fichas clínicas **são** usadas pelo web — o relatório está desatualizado

O `BLINDAGEM-API.md` afirma que "nenhum dos repos adm/app/web referencia essas
rotas hoje". Está errado: `equinology-web-v2/services/boardRecordService.ts`
(1746 linhas) mapeia **43 seções** de ficha e faz GET/POST/PUT/DELETE em todas.

Consequências:
- O BLOQUEIA dos "6 módulos que ignoram o filtro de atendimento" é
  **ALCANCAVEL** (mistura de prontuário entre atendimentos na tela).
- O BLOQUEIA do `PUT /reproduction-donor-ovulation` que não grava nada é
  **ALCANCAVEL**.
- Em compensação, a hipótese "se o frontend passar o id do atendimento isso vira
  BLOQUEIA em 35 módulos" **não se confirma**: `boardRecordService.ts:1641` manda
  `appointmentId: appointmentAnimalId`, ou seja, já manda o id certo.

### 6. `nextDate` — a correção da API não resolve o bug da tela

A API já foi corrigida por outra frente (`{"nextDate":null}` -> 200 e limpa).
Mas o web **nunca manda `null`**: `services/healthService.ts:24-29` (`toApiDate`)
devolve `undefined` para campo vazio, e o `JSON.stringify` remove a chave. Como o
service da API só escreve quando o campo vem definido, **o usuário continua sem
conseguir remover a próxima dose pela tela**.

> Pendência para a frente do front (não editei, não é minha frente):
> `equinology-web-v2/services/healthService.ts` — nas 4 fichas
> (vaccine/deworming/exam/shoeing), enviar `nextDate: null` quando o campo
> estiver vazio, em vez de `undefined`.

### 7. `PUT /deworming/:id` — o front cai no 400

O `healthService.ts:145` manda `{name, date, nextDate, description, animalId}` e
**não manda `dewormingId`**, que o `EditDewormingDto` exige. Editar vermifugação
pela tela dá 400. É ALCANCAVEL, apesar de estar classificado como GRAVE.

### 8. `PUT /client` com CPF — ALCANCAVEL, e o formulário tem o campo

`CreateOwnerSheet.tsx:133` preenche o campo CPF na edição e `:153` manda o campo
no PUT. A API responde 200 e não grava. O cliente fica sem CPF e sem `paymentId`
— não pode ser cobrado, e não há outro caminho para corrigir.
(O APP não manda cpf: `profile.tsx:115` envia só `name` e `phone`.)

## Verificações por curl (todas contra a 3333, códigos observados)

| Cenário | Resultado |
|---|---|
| `PUT /appointment/f4c03ed6 {"description":"..."}` (payload do web) | **200**; `appointment_animals` mantém ids `1dabd4d7`/`54d645bf` e o status `IN_PROGRESS` |
| `PUT /appointment/f4c03ed6 {...,"animals":[2 itens]}` | **200**; ids viram `6edc6eeb`/`98c3c4e5` e ambos voltam a `PENDING` (bug confirmado, inalcançável pela tela) |
| `DELETE /appointment/f4c03ed6` | **500** `INTERNAL_SERVER_ERROR` (bug confirmado; nenhum front chama) |
| `GET /vaccine|deworming|exam|shoeing/:animalId` com token de cliente | **403** nas 6 chamadas (as rotas exatas de `health/index.tsx:46-49`) |
| `GET /sanitary-protocol?page=1` com token de cliente | **400** (a chamada exata de `protocols.tsx:34`) |
| `GET /appointment/client?page=1` com token de cliente | **200**, expondo `('Mariana Duarte','236.881.904-30','cliente4.demo@equinology.com.br','(67) 99844-0004', code)` de OUTRO proprietário |
| `PUT /client/39839e52 {name,phone,email,cpf}` (payload do `CreateOwnerSheet`) | **200**; SQL: `cpf` e `paymentId` continuam NULL |
| `PUT /vaccine/e20133ec {"nextDate":null}` | **200**, coluna vai a NULL (**já corrigido**) |
| `PUT /vaccine/e20133ec {name,date,location}` (payload do web ao limpar o campo) | **200**, `nextDate` **continua** `2026-07-10` (bug persiste pela tela) |
| `PUT /payment/40307988 {name,amount,type,quantity,categoryId}` (payload do `UpdatePaymentSheet`) | **200**; parcelas 3→6 e soma 300→600 (**já corrigido** por outra frente) |
| `GET /reproduction-breedingPregnancy?page=1&animalId=..&appointmentId=98c3c4e5` | **200**, 1 registro correto, `pages=1` (**já corrigido**) |

## Ambiente de teste

- Usuário COLABORADOR criado na empresa demo `f4e2f01e` via
  `POST /user/register` com `companyCode`.
- Usuário ADMIN criado em empresa nova `a2f86506` via `POST /user/register`
  com `newCompany:true` (necessário porque `/payment` e `/transaction-category`
  exigem ADMIN — colaborador recebe 403).
- Instabilidade esperada: vários `HTTP 000` por reinício do watch do Nest
  (outros agentes salvando arquivos). Todos os resultados acima foram obtidos
  com a API respondendo 200 no health check imediatamente antes.

## Limpeza feita

Removi por SQL os registros que criei:
`TRIAGEM-E-*` (3 atendimentos + 5 vínculos), 2 ovulações `OV1/OV2`,
`TriagemE Edit*` (1 payment + 6 transactions), clientes `TriagemE SemCpf` e
`TriE Cli`, animal `TriE Cavalo`, vacinas `TriE Vac*`.

**Ressalva honesta:** o `DELETE FROM reproduction_breeding_pregnancies WHERE
observation LIKE 'PREG-%'` removeu **4** linhas, e eu só havia criado 2. As
outras 2 eram `PREG-AA1`/`PREG-AA2`, registros de teste deixados pela auditoria
anterior (citados no `BLINDAGEM-API.md`). Não eram dado de cliente, mas registro.

Ficaram no banco (não removi para não quebrar FKs/token de outras frentes):
os 2 usuários de teste (`triagem.e.*@teste.com`, `triagem.adm.*@teste.com`),
a empresa `a2f86506` e a categoria `TriagemE CatIN`.

## Perguntas para o dono

1. `DELETE /appointment` e `DELETE /client` não existem em nenhuma tela.
   É intencional (não se apaga atendimento/cliente) ou o botão sumiu do front?
   Se for intencional, os dois BLOQUEIA viram "remover a rota".
2. `GET /appointment-animal` e `GET /transaction` são rotas mortas. Manter,
   remover, ou o front deveria estar usando (extrato por cliente/animal)?
3. O app do proprietário cria e edita `stud-farm` e `animal` (registro de animal
   pelo próprio dono). Isso é feature ou brecha? Muda o veredito do achado.
4. Na tela de Atendimentos não há como filtrar por "Reagendado" — o filtro só
   oferece 3 status. É lacuna de produto a fechar antes do lançamento?
