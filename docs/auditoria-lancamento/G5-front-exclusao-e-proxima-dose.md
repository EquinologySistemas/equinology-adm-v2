# G5 — Front: botão de excluir, filtro de excluídos e próxima dose

Repositório tocado: **apenas o WEB** (`equinology-web-v2`), branch `fix/lancamento`.
A API não foi alterada.

Data da verificação: 2026-08-02. API em `http://localhost:3333`.

---

## Contexto

A API ganhou exclusão lógica (soft delete) em cliente, propriedade, animal e
atendimento, com o parâmetro de listagem `includeDeleted`. Nenhum dos três
fronts tinha botão de excluir nem filtro para ver o excluído — o trabalho de
back estava inacessível para o usuário.

Além disso, a triagem apontou que o campo "próxima dose / próxima realização"
não podia ser LIMPO pela tela: o front nunca mandava o pedido de limpeza.

---

## 1. Nome do parâmetro — confirmado lendo a API

`includeDeleted`, booleano em query string. Confirmado nos quatro DTOs:

- `src/infra/http/controllers/client/dto/client.dto.ts` (`FetchClientDto`)
- `src/infra/http/controllers/studFarm/dto/studFarm.dto.ts`
- `src/infra/http/controllers/animal/dto/animal.dto.ts`
- `src/infra/http/controllers/appointment/dto/appointment.dto.ts`

Todos usam o mesmo transform:

```ts
@Transform(({ value }) => value === true || value === 'true' || value === '1')
```

Por isso o front manda literalmente `includeDeleted=true` (string), e só quando
o toggle está ligado — o parâmetro nem entra na URL quando desligado.

`deletedAt` vem nos presenters `client`, `studFarm`, `animal`, `animalDetails` e
`appointmentDetails` (este último é o usado por `GET /appointment/fetch`).

---

## 2. O que mudou no WEB

### 2.1 Arquivos novos

| Arquivo | O que é |
| --- | --- |
| `components/ui/show-deleted-toggle.tsx` | `ShowDeletedToggle` (o "toglezinho"), `DeletedBadge` (selo "Excluído em DD/MM/AAAA") e `isDeleted()`. |
| `services/deletionService.ts` | As quatro chamadas `DELETE` num lugar só: `/client/:id`, `/stud-farm/:id`, `/animal/:id`, `/appointment/:id`. |

Nada de componente de confirmação novo: foi reaproveitado o `useConfirm` de
`components/ui/confirm-dialog` (já montado no `app/(dashboard)/layout.tsx`), e a
lixeira é o `DeleteActionButton` que já existia em
`components/ui/table-action-button.tsx`.

### 2.2 Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `types/dashboard.ts` | `deletedAt?: string \| null` em `Client`, `StudFarm`, `AnimalListItem` e `AppointmentItem`. |
| `app/(dashboard)/_components/tableStyles.ts` | `tableTrDeleted` e `cardItemDeleted` — mesmas classes de `tableTr`/`cardItem` com fundo âmbar tênue e opacidade. Reexportados em `clients-equines/_components/tableStyles.ts` e `services/_components/tableStyles.ts`. |
| `context/GlobalContext.tsx` | `loadClients`, `loadAnimals` e `loadStudFarms` ganharam o argumento `includeDeleted`. Quando ligado, o resultado **não** alimenta o cache dos dropdowns — nenhum select do sistema passa a oferecer registro excluído. |
| `services/appointmentService.ts` | `FetchAppointmentsParams.includeDeleted` → `includeDeleted=true` na query de `/appointment/fetch`. |
| `app/(dashboard)/clients-equines/_components/ClientsTable.tsx` | Toggle + lixeira (lista e cards) + linha/card destacados + selo. |
| `app/(dashboard)/clients-equines/_components/StudFarmsTable.tsx` | Idem. |
| `app/(dashboard)/clients-equines/_components/AnimalsTable.tsx` | Idem. |
| `app/(dashboard)/services/_components/ServicesTable.tsx` | Toggle + lixeira por atendimento + linha destacada + selo. |
| `services/healthService.ts` | Nova `toApiNextDate` (próxima dose). Normalização de data também no `shoeingApi.update`, que mandava o corpo cru. |
| `app/(dashboard)/services/_components/ServiceHealthManagement.tsx` | Nova `nextDateForApi`, substituindo `toISO` nos campos de próxima dose. |

---

## 3. Fluxo de tela

### Clientes / Propriedades / Animais — `/clients-equines`

1. Na faixa de filtros de cada tabela, ao lado da busca, aparece o botão-switch
   **"Mostrar excluídos"**. Padrão: desligado.
2. **Excluir**: na coluna Ações, terceiro ícone, a lixeira vermelha
   ("Excluir cliente" / "Excluir propriedade" / "Excluir animal"). No modo
   cards, é o botão "Excluir" ao lado de "Editar".
3. Ao clicar abre o diálogo do `useConfirm` (variante `danger`), dizendo o que
   acontece e o que é preservado. Exemplo do cliente:
   *"O cliente sai das listagens e dos seletores do sistema. O histórico de
   atendimentos, animais e cobranças é mantido. Para vê-lo de novo, ligue
   'Mostrar excluídos'."*
4. Confirmando: a lixeira vira spinner, sai `DELETE /client/:id`, toast
   *"Cliente excluído."* e a lista recarrega na mesma página e com os mesmos
   filtros. Erro → `getApiErrorMessage` com mensagem em português.
5. Com o toggle **desligado**, o registro some. Ligando o toggle, a lista
   recarrega com `includeDeleted=true`: a linha volta com fundo âmbar, texto
   esmaecido e o selo **"Excluído em DD/MM/AAAA"** ao lado do nome. A lixeira
   não aparece em registro já excluído (não há o que excluir duas vezes).
6. Os selects de cliente/propriedade da própria tela continuam sem excluídos —
   o cache de dropdown do `GlobalContext` não é atualizado quando
   `includeDeleted` está ligado.

### Atendimentos — `/services`

1. O toggle **"Mostrar excluídos"** fica no fim da faixa de filtros (depois do
   filtro de cliente). Ligar/desligar volta para a página 1.
2. **Atendimento com 1 animal**: a lixeira entra nas ações da própria linha.
3. **Atendimento com vários animais**: a lixeira fica na **linha-resumo**
   (exclusão é do atendimento inteiro, não de um animal dele). O clique usa
   `stopPropagation` para não expandir/recolher a linha.
4. Confirmação mostra data e quantidade de animais, e avisa que registros
   clínicos, laudos e cobranças já lançados são mantidos.
5. Confirmando: `DELETE /appointment/:id`, toast *"Atendimento excluído."* e
   `fetchAppointments()`.
6. Com o toggle ligado, o atendimento excluído volta com a linha âmbar e o selo
   "Excluído em ...", inclusive nas sub-linhas de cada animal.

---

## 4. Próxima dose — a chave que sumia do JSON

### O problema (dois pontos, não um)

O achado da triagem apontava `healthService.toApiDate`. Havia um segundo
engolimento antes dele, em `ServiceHealthManagement.tsx`:

```
DateInput vazio ("")
  -> toISO("")            => undefined     (tela)
  -> toApiDate(undefined) => undefined     (service)
  -> JSON.stringify APAGA a chave "nextDate"
  -> API entende "não mexa neste campo" e mantém o reforço
```

Resultado: a tela respondia 200, o campo continuava preenchido no banco e o
lembrete seguia disparando para o cliente. Corrigir só o `healthService` não
resolveria — o `undefined` já chegava pronto da tela.

### A correção

`ServiceHealthManagement.tsx`:

```ts
function nextDateForApi(value: string | undefined | null): string {
  return (value ?? "").trim();   // "" quando vazio, nunca undefined
}
```

`services/healthService.ts`:

```ts
function toApiNextDate(v: string | undefined | null): string | null | undefined {
  if (v === undefined) return undefined;          // campo ausente = não altera
  const s = (v ?? "").trim();
  if (!s) return null;                            // vazio = LIMPA
  const d = new Date(s.length === 10 ? `${s}T12:00:00.000Z` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
```

Aplicada nos oito pontos das quatro fichas (create e update de vacina,
vermifugação, exame e ferrageamento). O `shoeingApi.update` também passou a
normalizar `date`/`nextDate` — mandava o corpo cru.

`toApiDate` continua existindo e continua com o comportamento antigo para o
campo `date` (obrigatório): vazio = não mexe.

### Corpo JSON com o campo "Próxima aplicação" apagado na tela

```
ANTES  -> {"name":"Ivermectina","date":"2026-07-01T00:00:00.000Z"}
DEPOIS -> {"name":"Ivermectina","date":"2026-07-01T00:00:00.000Z","nextDate":null}
```

---

## 5. Verificação com curl real

Empresa de teste criada só para esta frente (CNPJ `15572548681601`,
`g5front-a1@teste.com`).

### 5.1 Atendimento

```
-- ANTES (lista padrão, toggle desligado)
GET /appointment/fetch?page=1                       [HTTP 200]
appointments: c1804ee3-... deletedAt=null

-- DELETE
DELETE /appointment/c1804ee3-...                    [HTTP 200]
{"message":"Atendimento excluído. Ele não aparece mais na agenda nem nas
 listagens; o histórico foi preservado. Para vê-lo, use o filtro de excluídos."}

-- DEPOIS (toggle desligado)
GET /appointment/fetch?page=1                       [HTTP 200]
{"appointments":[],"pages":0}

-- DEPOIS (toggle LIGADO)
GET /appointment/fetch?page=1&includeDeleted=true    [HTTP 200]
appointments: c1804ee3-... deletedAt=2026-08-02T19:42:06.932Z
```

### 5.2 Animal

```
-- ANTES   GET /animal?page=1                        [HTTP 200]  1 animal, deletedAt ausente
-- DELETE  DELETE /animal/59c61333-...               [HTTP 200]  "Animal excluído. ..."
-- DEPOIS  GET /animal?page=1                        [HTTP 200]  {"animals":[],"pages":0}
-- DEPOIS  GET /animal?page=1&includeDeleted=true    [HTTP 200]  deletedAt=2026-08-02T19:42:13.566Z
```

### 5.3 Propriedade

```
-- ANTES   GET /stud-farm?page=1                     [HTTP 200]  Haras G5
-- DELETE  DELETE /stud-farm/f57d06ac-...            [HTTP 200]  "Propriedade excluída. ..."
-- DEPOIS  GET /stud-farm?page=1                     [HTTP 200]  {"studFarms":[],"pages":0}
-- DEPOIS  GET /stud-farm?page=1&includeDeleted=true [HTTP 200]  deletedAt=2026-08-02T19:42:1...
```

### 5.4 Cliente

```
-- ANTES   GET /client?page=1                        [HTTP 200]  "deletedAt":null
-- DELETE  DELETE /client/5d30c999-...               [HTTP 200]  "Cliente excluído. ..."
-- DEPOIS  GET /client?page=1                        [HTTP 200]  {"clients":[],"pages":0}
-- DEPOIS  GET /client?page=1&includeDeleted=true    [HTTP 200]  "deletedAt":"2026-08-02T19:42:22.978Z"
```

### 5.5 Próxima dose — as quatro fichas

Vacina (`18c72070-...`), com `nextDate = 2026-10-01T12:00:00.000Z` gravada:

```
-- ANTES  (corpo do front sem a chave nextDate)
PUT /vaccine/:id  {"name":"Influenza","date":"...","location":"Pescoco"}          [HTTP 200]
GET /vaccine/:animalId  ->  nextDate = 2026-10-01T12:00:00.000Z   (NÃO limpou)

-- DEPOIS (corpo do front com nextDate: null)
PUT /vaccine/:id  {"name":"Influenza","date":"...","location":"Pescoco","nextDate":null}  [HTTP 200]
GET /vaccine/:animalId  ->  nextDate = null                        (limpou)
```

Vermifugação, exame e ferrageamento, no mesmo animal:

```
-- ANTES  (sem a chave)
PUT /deworming -> 200 | PUT /exam -> 200 | PUT /shoeing -> 200
  deworming.nextDate = 2026-10-01T12:00:00.000Z
  exam.nextDate      = 2026-10-01T12:00:00.000Z
  shoeing.nextDate   = 2026-10-01T12:00:00.000Z

-- DEPOIS ("nextDate": null)
PUT /deworming -> 200 | PUT /exam -> 200 | PUT /shoeing -> 200
  deworming.nextDate = null
  exam.nextDate      = null
  shoeing.nextDate   = null
```

### 5.6 Build

```
npx tsc --noEmit   -> exit 0
npm run build      -> exit 0  (34 rotas compiladas)
```

---

## 6. O que NÃO foi feito

- **Ficha do animal** (`/clients-equines/animals/[id]`) e **tela do
  atendimento** (`/services/[id]`) continuam sem botão de excluir. A exclusão
  está nas listagens, que é onde o dono pediu. Se quiser também na ficha, é
  uma adição pequena reusando `deletionService` + `useConfirm`.
- **Restaurar** (desfazer a exclusão) não existe: a API não expõe rota de
  restore. Com o toggle ligado o registro aparece, mas só para consulta.
- **APP e ADM** não foram tocados — outra frente.
- Os selects/dropdowns seguem sem excluídos, de propósito ("não faça puxar nos
  filtros").
