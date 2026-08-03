# R3 — Filtro que mente e lista que esconde

Frente R3 da auditoria de lançamento. Sete itens medidos na varredura original.
Cada um foi **reproduzido antes** de qualquer alteração; três já estavam
corrigidos por levas anteriores e foram apenas confirmados com `curl`.

## Ambiente da verificação

```
API   http://localhost:3333
Banco docker exec vetequus-local psql -U postgres -d vetequus -c "SQL"
```

Empresa própria, criada só para esta frente (nenhum token compartilhado):

| O quê | Id / valor |
|---|---|
| Empresa A | `a324a514-da0a-4445-8886-e5aa33a45680` (`r3.filtros@teste.com`) |
| Empresa B (lado negativo) | `def0a54d-a0e9-479b-adf4-d9c8edff9390` (`r3.outra@teste.com`) |
| Cliente | `958462cd-0d40-48f4-b091-1b08740da9b6` |
| Haras Campinas / Haras Sao Paulo | `a1dac0c3…` / `15657b25…` |
| Animais | Trovao (Mangalarga / Alazao / Campinas), Estrela (Quarto de Milha / Tordilha / Sao Paulo), Relampago (Mangalarga Marchador / ALAZAO / Campinas) |
| Fase do CRM | `d43089a6-e554-48cb-88ee-ef92404a3ba6` com **12 leads** |
| Anotações de animal | **12** |

O fixture foi montado de propósito com dados que **casam** e dados que **não
casam** com cada filtro, e com caixa diferente (`Alazao` vs `ALAZAO`).

---

## Resumo

| # | Item | Situação |
|---|---|---|
| 1 | `GET /animal?color=` descartado em silêncio | JÁ ESTAVA OK |
| 2 | `city`/`breed` de `/appointment-animal` case-sensitive | JÁ ESTAVA OK |
| 3 | `status=RESCHEDULED` rejeitado em `/appointment/fetch` | JÁ ESTAVA OK |
| 4 | `/note/by-date` filtra por `createdAt` | **CORRIGIDO** |
| 5 | `leadQuantity` do kanban ignora o filtro | JÁ ESTAVA OK |
| 6 | Kanban entrega no máximo 10 leads por coluna | **CORRIGIDO** (API + web) |
| 7 | `/animal-note/company` e `/animal-note/by-date` sem paginação | **CORRIGIDO** |

---

## 1. `GET /animal?color=` — JÁ ESTAVA OK

O controller já repassa `color` (há inclusive comentário registrando a correção
anterior) e o repositório resolve pelagem em `searchIdsByText`, com LIKE sem
caixa nem acento.

```
?color=alazao   -> Relampago/ALAZAO, Trovao/Alazao   pages: 1
?color=ALAZAO   -> Relampago/ALAZAO, Trovao/Alazao   pages: 1
?color=tordilha -> Estrela/Tordilha                  pages: 1
?color=preto    -> (vazio)                           pages: 0
```

O contador `pages` acompanha o filtro (`count` usa o mesmo `searchIdsByText`).

**Uso pelo front:** nenhum. Nem web, nem app do proprietário, nem ADM montam
`color=` na query. É capacidade de API sem tela — o filtro de pelagem existe no
DTO e no repositório, mas a listagem de animais do web não o oferece.

## 2. `city` e `breed` de `/appointment-animal` — JÁ ESTAVA OK

`prismaAppointmentAnimal.repository.searchAnimalIdsByText` já resolve os dois
por LIKE normalizado (join com `stud_farms` para a cidade).

```
?city=campinas -> Relampago, Trovao   ?city=Campinas -> Relampago, Trovao
?city=CAMPINAS -> Relampago, Trovao   ?city=sao      -> Estrela
?city=rio      -> (vazio) pages 0
?breed=mangalarga           -> Relampago, Trovao   (busca parcial funciona)
?breed=Mangalarga Marchador -> Relampago
```

**Uso pelo front:** nenhum. `appointmentService.fetchAppointments` monta
`query/animalId/clientId/status/appointmentType/orderBy/sortOrder/startDate/endDate/includeDeleted`
— não manda `city` nem `breed`.

## 3. `status=RESCHEDULED` em `/appointment/fetch` — JÁ ESTAVA OK

O enum do DTO já inclui `RESCHEDULED`. Prova **positiva** (não só "não dá 400"):
reagendei um animal do atendimento e o registro-fantasma apareceu pelo filtro.

```
POST /appointment/6c114418…/reschedule {items:[{appointmentAnimalId, action:NEW}]} -> 201
GET  /appointment/fetch?status=RESCHEDULED  -> 200, Trovao:RESCHEDULED
GET  /appointment-animal?status=RESCHEDULED -> 200, Trovao:RESCHEDULED
GET  /appointment/fetch?status=BANANA       -> 400
  "O campo status deve ser um destes valores: PENDING, IN_PROGRESS, FINISHED, RESCHEDULED."
```

**Uso pelo front:** o web **exibe** RESCHEDULED (calendário, agenda do dia,
modal de detalhes) mas ainda não manda `status=RESCHEDULED` como filtro.

## 4. `/note/by-date` ignorava a data da anotação — CORRIGIDO

`notes` tem duas datas: `date` (o dia do fato, escolhido pelo usuário e
editável) e `createdAt` (quando foi digitada). A rota filtrava por `createdAt`.

**Antes** — três notas com datas 02, 03 e 04/08, todas digitadas no dia 03:

```
by-date=2026-08-02 -> (vazio)
by-date=2026-08-03 -> Nota de ONTEM | Nota de AMANHA | Nota de HOJE
by-date=2026-08-04 -> (vazio)
```

O card "Anotações do dia" mostrava o que foi **digitado** no dia. Uma nota
marcada para amanhã aparecia hoje e sumia amanhã.

**Correção** — `src/infra/shared/database/prisma/repositories/prismaNote.repository.ts`,
`fetchByDate`: o `where` passou de `createdAt` para `date` e o `orderBy` para
`[{date:'desc'},{id:'desc'}]` (mesmo padrão do `fetch`, que já ordenava por
`date`). O cálculo das bordas do dia em BRT (UTC-3 fixo) foi preservado.

**Depois:**

```
by-date=2026-08-02 -> Nota de ONTEM
by-date=2026-08-03 -> Nota de HOJE
by-date=2026-08-04 -> Nota de AMANHA
by-date=2026-08-05 -> (vazio)
```

**Uso pelo front:** sim — `DashboardNotesCard` (card "Anotações do dia" da home)
chama `/note/by-date?date=<hoje BRT>`.

## 5. `leadQuantity` do kanban — JÁ ESTAVA OK

`prismaBoard.repository.fetchWithLeads` já aplica o **mesmo** `includeCondition`
no `leads` e no `_count.leads`.

```
GET /board                 -> leads.length=10  leadQuantity=12
GET /board?query=antonio   -> leads.length=4   leadQuantity=4
GET /board?query=Antonio   -> leads.length=4   leadQuantity=4   (sem caixa)
GET /board?query=zzz       -> leads.length=0   leadQuantity=0
```

**Uso pelo front:** o web **não** manda filtro para `/board` (`loadBoards`
chama sem parâmetros) e — pior — a coluna nem usava `leadQuantity`: exibia
`leads.length`. Corrigido junto com o item 6.

## 6. Kanban entregava no máximo 10 leads por coluna — CORRIGIDO

Confirmado: com 12 leads na fase, `GET /board` devolvia 10 e não havia rota
paginada utilizável — `GET /lead/board/:boardId` paginava mas **não dizia
quantas páginas existiam**, então o front não tinha como saber que havia mais.
Resultado: 2 leads inalcançáveis, sem nenhum aviso.

**Decisão:** não paginar as **colunas** (`GET /board`) — as fases de funil são
poucas e paginar colunas quebraria o kanban. O que faltava era paginar os
**leads dentro** de cada coluna, e isso já tinha rota própria.

### API

| Arquivo | Mudança |
|---|---|
| `domain/application/repositories/lead.repository.ts` | novo `countByBoardId` |
| `infra/shared/database/prisma/repositories/prismaLead.repository.ts` | implementa `countByBoardId` reusando `fetchConditional` (mesmo `where` da listagem) |
| `domain/application/services/crm/interfaces/leadProps.ts` | `FetchByBoardIdResponse` ganha `leadQuantity` e `pages` |
| `domain/application/services/crm/services/lead.service.ts` | `fetchByBoardId` busca lista e total em paralelo |
| `infra/http/controllers/crm/lead.controller.ts` | devolve `leadQuantity` e `pages` |

```
GET /lead/board/d43089a6…?page=1               -> leads=10 leadQuantity=12 pages=2
GET /lead/board/d43089a6…?page=2               -> leads=2  leadQuantity=12 pages=2
GET /lead/board/d43089a6…?page=1&query=antonio -> leads=4  leadQuantity=4  pages=1
GET /lead/board/d43089a6…?page=1&query=zzz     -> leads=0  leadQuantity=0  pages=0
```

O total respeita o filtro — não adiantaria trocar um número que mente por outro.

### Web

| Arquivo | Mudança |
|---|---|
| `services/crm/leadService.ts` | `fetchByBoardId` passa a devolver `{leads, leadQuantity, pages}` |
| `app/(dashboard)/crm/_components/KanbanColumn.tsx` | cabeçalho mostra o TOTAL da fase (era `leads.length`, travado em 10) + botão "Carregar mais (N restantes)" |
| `app/(dashboard)/crm/_components/CrmKanban.tsx` | `loadMoreLeads` busca a próxima página e anexa (dedup por id, para o lead movido entre colunas não duplicar); overlay de arraste também usa o total |
| `app/(dashboard)/crm/_components/CrmKpis.tsx` | KPIs somam `leadQuantity` e não `leads.length` — com 25 leads o card "Total de leads" dizia 10 |

O total exibido é `Math.max(leadQuantity, leads.length)`: mover card entre
colunas mexe nos dois números e o cabeçalho nunca pode dizer menos do que está
na tela.

**Limitação da verificação:** a prova visual no navegador não foi concluída —
a empresa nova criada para o teste cai no paywall (`/crm` redireciona para
`/plans`) e o fluxo de assinatura é de outra sessão. A verificação foi feita
pelo contrato HTTP (acima) mais `npx tsc --noEmit` e `npm run build` no web,
ambos exit 0.

## 7. `/animal-note/company` e `/animal-note/by-date` sem paginação — CORRIGIDO

Confirmado: as duas rotas faziam `findMany` sem `take`/`skip`. Uma empresa com
milhares de anotações baixava todas a cada carregamento da tela de anotações e
do card da home.

**Cuidado que definiu o desenho:** o web depende do comportamento atual —
`NotesTable` busca `/animal-note/company` inteiro e funde com `/note?page=`
localmente. Cortar em 10 à força quebraria a tela. Então a paginação é
**opcional e retrocompatível**:

- `page` ausente → devolve tudo (como antes);
- `page` presente → uma página de 10;
- em ambos os casos a resposta passa a trazer `total` e `pages`, para o front
  saber o tamanho real antes de decidir paginar.

| Arquivo | Mudança |
|---|---|
| `domain/application/repositories/animalNote.repository.ts` | `page?` em `findManyByCompanyId` / `findManyByCompanyIdAndDate`; novos `countByCompanyId` e `countByCompanyIdAndDate` |
| `infra/shared/database/prisma/repositories/prismaAnimalNote.repository.ts` | helpers `paginate()` e `brtDayRange()` (o cálculo do dia em BRT estava duplicado); implementa os counts |
| `domain/application/services/animal/interfaces/animalNoteProps.ts` | request ganha `page?`; response ganha `total` e `pages` |
| `domain/application/services/animal/services/animalNote.service.ts` | lista e total em paralelo |
| `infra/http/controllers/animal/animalNote.controller.ts` | `@Query('page')` com `parseOptionalPage` |

Não toquei nos DTOs (frente R2): o `page` entra por `@Query('page')` cru e é
validado no controller.

```
animal-note/company                        -> n=12 total=12 pages=2   (sem page: tudo)
animal-note/company?page=1                 -> n=10 total=12 pages=2
animal-note/company?page=2                 -> n=2  total=12 pages=2
animal-note/company?page=3                 -> n=0  total=12 pages=2
animal-note/by-date?date=2026-08-03        -> n=12 total=12 pages=2
animal-note/by-date?date=2026-08-03&page=1 -> n=10 total=12 pages=2
animal-note/by-date?date=2026-08-03&page=2 -> n=2  total=12 pages=2
animal-note/by-date?date=2026-08-04&page=1 -> n=0  total=0  pages=0   (dia sem nada)

animal-note/company?page=0      -> 400 "O parâmetro "page" deve ser um número inteiro maior que zero."
animal-note/company?page=banana -> 400 (mesma mensagem)
```

Sem a validação, `page=banana` viraria `NaN` e devolveria lista vazia sem
explicação — o mesmo padrão de "filtro que mente" que esta frente combate.

---

## Lado negativo (nada foi afrouxado)

Toda rota tocada foi relida com o token da **empresa B**, que não tem nenhum
desses dados:

```
GET /lead/board/<board da empresa A>?page=1  -> 200 {"leads":[],"leadQuantity":0,"pages":0}
GET /animal?page=1&color=alazao              -> 200 {"animals":[],"pages":0}
GET /appointment-animal?page=1&city=campinas -> 200 {"animals":[],"pages":0}
GET /note/by-date?date=2026-08-04            -> 200 {"notes":[]}
GET /animal-note/company?page=1              -> 200 {"animalNotes":[],"total":0,"pages":0}
GET /board                                   -> 200 {"boards":[]}
```

Importante: os **contadores novos** (`leadQuantity`, `total`) também respeitam o
escopo — vêm zerados para a empresa B. Um contador que vazasse o número de leads
da concorrente seria um vazamento novo criado pela própria correção.

## Compilação

```
vetequus-api        npx tsc --noEmit   exit 0
equinology-web-v2   npx tsc --noEmit   exit 0
equinology-web-v2   npm run build      exit 0
```

## O que fica registrado para o dono

1. **Filtros de API sem tela.** `color` (animal) e `city`/`breed`
   (appointment-animal) funcionam na API e nenhum front os usa. Ou a tela ganha
   os campos, ou são capacidade parada.
2. **`status=RESCHEDULED`** é aceito, mas nenhuma tela filtra por ele hoje.
3. **`GET /board` continua sem paginação de colunas** — decisão consciente. Os
   leads dentro da coluna passaram a ser alcançáveis pelo "Carregar mais".
4. **`/animal-note/company` sem `page` continua devolvendo tudo.** A dívida só
   fecha de verdade quando `NotesTable` passar a paginar de fato; a API já
   entrega `total` e `pages` para isso.
5. **Prova visual do kanban pendente**: o paywall de plano bloqueia empresa nova
   em `/crm`. Vale reconferir na tela com uma conta que tenha assinatura ativa.
