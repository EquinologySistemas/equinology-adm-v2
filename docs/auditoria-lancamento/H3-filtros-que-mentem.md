# H3 — Filtro aceito e descartado, e contador que mente

Classe de defeito: **a tela oferece o filtro, o usuário usa, e o resultado está
errado sem nenhum aviso.** Não há erro, não há toast, não há lista vazia
suspeita — só um número ou uma lista silenciosamente errados.

Todos os 8 casos foram **reproduzidos ao vivo** contra a API em
`http://localhost:3333` antes de qualquer alteração, corrigidos, e
**re-verificados ao vivo** com dados que casam e dados que NÃO casam com o
filtro. O isolamento entre empresas foi testado no lado negativo em todos eles.

Repositório tocado: `vetequus-api` (branch `fix/lancamento`).
`npx tsc --noEmit` → exit 0.

---

## Resumo

| # | Caso | Situação | Consumido por front? |
|---|------|----------|----------------------|
| 1 | `GET /transaction?clientId=` não retorna nada | CORRIGIDO | não (rota de API) |
| 2 | `GET /transaction/statistics?animalId=` sempre zero | CORRIGIDO | não (rota de API) |
| 3 | `GET /animal?color=` aceito e descartado | CORRIGIDO | não (nenhum front envia) |
| 4 | `city`/`breed` de `/appointment-animal` exigiam igualdade exata | CORRIGIDO | não |
| 5 | `state` de `/appointment-animal` era status disfarçado | CORRIGIDO | não |
| 6 | `status=RESCHEDULED` rejeitado em `/appointment/fetch` | CORRIGIDO | **sim — WEB** |
| 7 | `/appointment-animal` filtrava por `createdAt`, não pela data do atendimento | CORRIGIDO | não |
| 8 | `leadQuantity` do kanban ignorava o filtro | CORRIGIDO | **sim — WEB, visível na tela** |

**Prioridade real:** os casos 6 e 8 são os únicos que um usuário alcança pela
tela hoje. O 8 é o mais grave da leva: o número aparece no cabeçalho de cada
coluna do kanban e estava simplesmente errado sempre que havia filtro. Os
demais são rotas de API sem consumidor de front no momento — corrigidos mesmo
assim porque a correção era barata e o defeito é real, mas ficam registrados
como **baixa prioridade de lançamento**.

---

## Caso 1 — `GET /transaction?clientId=` não retornava nada

**Arquivo:** `src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts`
(`transactionWhere`)

Um lançamento chega ao cliente por três caminhos:

- `Payment.clientId` — cliente escolhido direto na Movimentação (é o que o
  formulário grava **hoje**);
- `Payment.appointmentAnimal.animal.clientId` — legado, via agendamento;
- `Payment.animal.clientId` — via animal.

O filtro olhava **só o legado**. Ou seja: justamente o campo que o formulário
preenche era o único ignorado. Resultado: lista sempre vazia.

O `PrismaPaymentRepository.whereFilter` já tratava os três — foi usado como
referência, e agora os dois estão idênticos.

### Antes / depois (medido)

```
sem filtro                          -> n=2 :: MOV-CLIENT-B, MOV-CLIENT-A
ANTES  clientId=<Cliente A>         -> n=0    (nenhum!)
DEPOIS clientId=<Cliente A>         -> n=1 :: MOV-CLIENT-A
DEPOIS clientId=<Cliente B>         -> n=1 :: MOV-CLIENT-B
```

`pages` acompanha a lista (`count` usa o mesmo `where`): `n=1 pages=1`.

---

## Caso 2 — `GET /transaction/statistics?animalId=` sempre zero

**Arquivo:** mesmo repositório, `getStatistics`.

Mesma causa: só o ramo `appointmentAnimal` era olhado, ignorando o `animalId`
gravado direto na Movimentação. A tela de custo por animal ficava zerada.

### Antes / depois (medido)

```
sem animalId              -> totalIncoming = 1400   (os dois lançamentos)
ANTES  animalId=<Animal A> -> totalIncoming = 0
DEPOIS animalId=<Animal A> -> totalIncoming = 500
DEPOIS animalId=<Animal B> -> totalIncoming = 900
```

500 + 900 = 1400: o recorte por animal fecha com o total.

---

## Caso 3 — `GET /animal?color=` era aceito e descartado

**Arquivo:** `src/infra/http/controllers/animal/animal.controller.ts` (`fetch`)

Caso clássico de "a checagem existe e nunca é chamada": o DTO
(`FetchAnimalsDto`) já declarava `color`, o repositório já sabia filtrar por
pelagem em `searchIdsByText` — **o controller simplesmente não repassava o
campo** no `where`. O filtro era aceito com 200 e a lista voltava inteira.

### Antes / depois (medido)

```
sem filtro                -> n=3
ANTES  color=Tordilho     -> n=3   (nada foi filtrado)
ANTES  color=Inexistente  -> n=3   (nada foi filtrado)
DEPOIS color=Tordilho     -> n=1 :: Estrela H3
DEPOIS color=Alazão       -> n=1 :: Relampago H3
DEPOIS color=alazao       -> n=1 :: Relampago H3   (sem acento)
DEPOIS color=ALAZAO       -> n=1 :: Relampago H3   (caixa alta)
DEPOIS color=alaz         -> n=2                   (busca parcial)
DEPOIS color=Inexistente  -> n=0 pages=0
```

A busca sem caixa/acento já vinha de graça do `normalizedLikeSql` que o
repositório usava — bastava o campo chegar até lá.

---

## Caso 4 — `city` e `breed` de `/appointment-animal` exigiam igualdade exata

**Arquivo:** `src/infra/shared/database/prisma/repositories/prismaAppointmentAnimal.repository.ts`

Os dois filtros moravam no `where` do Prisma como igualdade literal
(`breed: data.breed`, `studFarm: { city: data.city }`). Digitar "campinas" não
achava "Campinas"; "Mangal" não achava "Mangalarga".

Foram movidos para a mesma consulta de texto normalizado já usada pelo resto da
base (`normalizedLikeSql`), com `LEFT JOIN stud_farms` para alcançar a cidade.
O método `findAnimalIdsByQuery` virou `searchAnimalIdsByText`, que resolve
busca + raça + cidade de uma vez e devolve `null` quando nenhum filtro textual
foi pedido (`null` = "não restringe", diferente de `[]` = "nada casou").

### Antes / depois (medido)

```
ANTES  city=Campinas    -> n=1     DEPOIS -> n=2 *
ANTES  city=campinas    -> n=0     DEPOIS -> n=2 *
ANTES  city=CAMP        -> n=0     DEPOIS -> n=2 *
ANTES  breed=Mangalarga -> n=1     DEPOIS -> n=1
ANTES  breed=mangalarga -> n=0     DEPOIS -> n=1
ANTES  breed=Mangal     -> n=0     DEPOIS -> n=1
       city=Curitiba    -> n=0     DEPOIS -> n=0   (continua não achando)
       breed=Arabe      -> n=0     DEPOIS -> n=0   (continua não achando)
```

\* o "2" do depois não é vazamento: no meio da verificação um reagendamento
criou uma segunda linha para o mesmo animal de Campinas (a linha-fantasma
`RESCHEDULED` na data de origem + a nova em 15/04). Ambas são do mesmo haras em
Campinas e da mesma empresa. Confirmado no banco.

Os filtros continuam somando com **E** (não se anulam):

```
city=Campinas & breed=Mangalarga  -> n=2
city=Campinas & breed=Quarto      -> n=0
query=Trovao  & city=Campinas     -> n=2
query=Trovao  & city=Sorocaba     -> n=0
```

---

## Caso 5 — `state` era status disfarçado de UF

**Arquivos:** `dto/appointmentAnimal.dto.ts`, `appointmentAnimal.controller.ts`,
`interfaces/appointmentAnimalProps.ts`, repositório.

O parâmetro se chamava `state` mas sempre foi o **status** do atendimento.
Quem mandava uma UF (`state=SP`) só recebia erro.

Correção: `status` passou a ser o nome oficial do parâmetro; `state` continua
aceito como **apelido legado** (marcado `@deprecated` e `deprecated: true` no
Swagger) para não quebrar link ou integração antiga. Quando os dois vierem,
`status` vence. A mensagem de erro do apelido legado agora explica o engano e
aponta o caminho certo.

### Antes / depois (medido)

```
ANTES  state=SP       -> 400 "Os dados enviados são inválidos. Revise os campos
                              do formulário e tente novamente."   (genérico)
DEPOIS state=SP       -> 400 "O parâmetro \"state\" é o status do atendimento,
                              não a UF. Use PENDING, IN_PROGRESS, FINISHED ou
                              RESCHEDULED. Para filtrar por cidade, use
                              \"city\"."
DEPOIS status=SP      -> 400 "Status inválido. Use PENDING, IN_PROGRESS,
                              FINISHED ou RESCHEDULED"
DEPOIS status=PENDING     -> n=2
DEPOIS status=FINISHED    -> n=0
DEPOIS status=RESCHEDULED -> n=1
DEPOIS state=PENDING      -> n=2   (apelido legado segue funcionando)
```

Nota: a validação de enum com mensagem em português nesta rota veio da frente
H2 (DTO `FetchAppointmentAnimalsDto`), que rodou em paralelo. H3 acrescentou o
nome correto do parâmetro e a mensagem específica do apelido.

---

## Caso 6 — `status=RESCHEDULED` rejeitado em `/appointment/fetch`

**Arquivos:** `dto/appointment.dto.ts`,
`interfaces/appointmentProps.ts`, `repositories/appointment.repository.ts`,
`prismaAppointment.repository.ts`.

`RESCHEDULED` existe no enum do banco, é gravado pelo próprio reagendamento
(`appointment.service`) e é exibido pela WEB com o badge "Reagendado". Mas o
enum do DTO de filtro tinha só três valores — filtrar por ele devolvia 400.

O tipo foi alargado em toda a cadeia (DTO → interface de serviço → interface de
repositório → repositório Prisma).

**Cuidado tomado:** o enum de **escrita** (`PUT /appointment-animal`, em
`dto/appointmentAnimal.dto.ts`) continua **sem** `RESCHEDULED`, de propósito.
Aquele estado é derivado: quem o grava é o reagendamento, que também preenche
`rescheduledTo`. Deixar alguém gravá-lo direto criaria uma linha-fantasma sem
data de destino. **Filtrar não altera nada — gravar altera.** Só o lado da
leitura foi liberado.

### Antes / depois (medido, com uma linha `RESCHEDULED` real criada via
`POST /appointment/:id/reschedule`)

```
ANTES  status=RESCHEDULED -> 400 "O campo status deve ser um destes valores:
                                  PENDING, IN_PROGRESS, FINISHED."
DEPOIS sem filtro         -> n=3 :: 20/09[PENDING] 15/04[PENDING] 10/03[RESCHEDULED]
DEPOIS status=RESCHEDULED -> n=1 :: 10/03[RESCHEDULED]
DEPOIS status=PENDING     -> n=2 :: 20/09, 15/04
DEPOIS status=FINISHED    -> n=0
DEPOIS status=BANANA      -> 400 "O campo status deve ser um destes valores:
                                  PENDING, IN_PROGRESS, FINISHED, RESCHEDULED."
```

**Pendência de front (fora do escopo H3):** a WEB consome
`/appointment/fetch?status=` em `services/appointmentService.ts` e já entende
`RESCHEDULED` no resto da tela (badge "Reagendado", filtragem da agenda), mas o
dropdown de status em `app/(dashboard)/services/_components/ServicesTable.tsx`
ainda oferece só três opções. A API está destravada; adicionar
`{ value: "RESCHEDULED", label: "Reagendado" }` é uma linha.

---

## Caso 7 — período filtrava a data de cadastro, não a do atendimento

**Arquivo:** `prismaAppointmentAnimal.repository.ts` (`buildWhere`)

`startDate`/`endDate` filtravam `appointmentAnimal.createdAt` — **a data em que
a linha foi digitada no sistema**, não `appointment.startDate`, a data em que o
atendimento acontece. Qualquer tela que filtrasse por período devolvia lista
errada, e de um jeito especialmente traiçoeiro: como quase tudo é cadastrado
"hoje", filtrar pelo mês corrente devolvia **tudo**, e filtrar pelo mês do
atendimento devolvia **nada** — exatamente o inverso do esperado.

O fim do intervalo também usava `setDate(+1)` com `lte`, o que incluía o
primeiro instante do dia seguinte. Passou a usar `normalizeRangeStart` /
`normalizeRangeEnd` (fuso de Brasília), os mesmos helpers já usados em
pagamentos e lembretes.

### Antes / depois (medido)

Atendimentos em **10/03/2026** e **20/09/2026**; todos cadastrados hoje
(02/08/2026).

```
ANTES  01/03..31/03 (deveria achar o de março) -> n=0   ERRADO
ANTES  01/08..31/08 (não deveria achar nada)   -> n=2   ERRADO
DEPOIS 01/03..31/03 -> n=1
DEPOIS 01/09..30/09 -> n=1
DEPOIS 01/08..31/08 -> n=0
DEPOIS 01/01..31/12 -> n=2
DEPOIS só startDate=01/06 (intervalo aberto) -> n=1
DEPOIS 10/03..10/03 (borda, dia exato)       -> n=1
```

A borda `10/03..10/03` achar o atendimento das 10:00 confirma que o fim do dia
está ancorado corretamente.

---

## Caso 8 — `leadQuantity` do kanban mentia

**Arquivo:** `src/infra/shared/database/prisma/repositories/prismaBoard.repository.ts`
(`fetchWithLeads`)

**O caso mais grave da leva — é o único visível na tela hoje.**

A lista de leads de cada coluna recebia o filtro (`leads: { where: includeCondition }`),
mas o contador ao lado, não:

```ts
_count: { select: { leads: true } }   // conta TUDO, ignora o filtro
```

O usuário filtrava por nome ou por período, via **1 card** na coluna, e o
cabeçalho continuava dizendo **3**. Número que não correspondia a nada.

Correção: o `_count` passou a usar exatamente o mesmo `where` da lista.

### Antes / depois (medido — 3 leads: Joao Alfa, Maria Beta, Pedro Gama)

```
                                          leadQuantity   cards
sem filtro                    ANTES  ->        3           3    ok
?query=Joao                   ANTES  ->        3           1    MENTIRA
?query=ZZZNADA                ANTES  ->        3           0    MENTIRA
?startDate=2020-01-01&endDate=2020-12-31
                              ANTES  ->        3           0    MENTIRA

sem filtro                    DEPOIS ->        3           3
?query=Joao                   DEPOIS ->        1           1
?query=a                      DEPOIS ->        3           3
?query=ZZZNADA                DEPOIS ->        0           0
?startDate=2020-..&endDate=2020-..  DEPOIS ->  0           0
?startDate=2026-08-01&endDate=2026-08-31 DEPOIS -> 3        3
```

**Consumo confirmado no front:** `services/crm/boardService.ts` monta
`/board?query=&startDate=&endDate=` e `app/(dashboard)/crm/_components/CrmKanban.tsx`
exibe `b.leadQuantity` (inclusive ajustando ±1 ao arrastar card entre colunas).
Ou seja: o número errado estava na cara do usuário.

---

## Verificação do lado negativo (isolamento entre empresas)

Nenhuma das correções alarga o alcance de um token. Uma **segunda empresa** foi
registrada e pediu, com o próprio token, exatamente os recursos da primeira:

```
E2 -> /transaction?clientId=<cliente da E1>              -> 200, n=0
E2 -> /transaction/statistics?animalId=<animal da E1>    -> totalIncoming=0
E2 -> /animal?color=Tordilho (pelagem só da E1)          -> n=0
E2 -> /appointment-animal?city=Campinas                  -> n=0
E2 -> /appointment-animal?breed=Mangalarga               -> n=0
E2 -> /appointment-animal?animalId=<animal da E1>        -> n=0
E2 -> /appointment/fetch?status=RESCHEDULED              -> n=0
E2 -> /board                                             -> boards=0
```

Ponto que merecia atenção e foi checado: em `/appointment-animal`, a consulta
crua que resolve `query`/`breed`/`city` varre a tabela `animals` **sem**
`companyId` — ela pode devolver IDs de outras empresas. O isolamento não vem
dali, e sim do `where` final (`appointment: { companyId }`), que é aplicado por
cima. Os três testes acima confirmam que o recorte segura. Esse desenho já
existia antes (era o comportamento do `findAnimalIdsByQuery`) e não foi
afrouxado — mas fica registrado como ponto sensível: **qualquer mudança futura
no `buildWhere` que remova o `appointment.companyId` abre vazamento de
listagem.**

---

## Arquivos alterados (`vetequus-api`)

```
src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts
src/infra/shared/database/prisma/repositories/prismaAppointmentAnimal.repository.ts
src/infra/shared/database/prisma/repositories/prismaBoard.repository.ts
src/infra/shared/database/prisma/repositories/prismaAppointment.repository.ts  (só o tipo de status)
src/infra/http/controllers/animal/animal.controller.ts
src/infra/http/controllers/appointment/appointmentAnimal.controller.ts
src/infra/http/controllers/appointment/dto/appointment.dto.ts
src/infra/http/controllers/appointment/dto/appointmentAnimal.dto.ts
src/domain/application/services/appointment/interfaces/appointmentAnimalProps.ts
src/domain/application/services/appointment/interfaces/appointmentProps.ts
src/domain/application/repositories/appointment.repository.ts
```

Nenhuma migration. Nenhuma mudança de contrato que quebre chamador existente:
`state` segue aceito, `status` é adição, `color` já era declarado no DTO.

---

## Pendências deixadas (não são bugs de API)

1. **WEB — dropdown de status dos atendimentos.** Adicionar a opção
   "Reagendado" (`RESCHEDULED`) em `ServicesTable.tsx`. A API já aceita.
2. **WEB/APP — filtros sem consumidor.** `GET /transaction` (lista),
   `GET /transaction/statistics`, `GET /animal?color=` e
   `GET /appointment-animal` (lista) estão corretos agora, mas nenhum front os
   chama. Vale decidir se viram tela ou se são rota morta a remover depois do
   lançamento.
3. **`state` deprecado.** Quando nenhum chamador usar mais o apelido, remover do
   DTO. Hoje não custa nada mantê-lo.
