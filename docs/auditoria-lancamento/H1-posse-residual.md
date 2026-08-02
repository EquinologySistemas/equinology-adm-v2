# H1 — Posse e escrita cruzada que sobraram

Escopo: `owner-note`, `lead`/`board` (CRM) e `payment`.
Fora de escopo (outras frentes): animal, client, stud-farm, appointment, user, transaction.

Ambiente da verificação: API local em `http://localhost:3333`, banco `vetequus-local`,
duas empresas montadas do zero (**A** = atacante, **B** = vítima), cada uma com
cliente, animal, atendimento (`appointment_animals`), fase de CRM (`boards`) e
categoria financeira (`transaction_categories`) próprios.

Resumo: **os 3 itens ainda estavam quebrados** — nenhum tinha sido resolvido pelas
levas anteriores. Os 3 foram corrigidos e verificados ao vivo, com lado negativo
(empresa de fora) e lado positivo (empresa dona) provados em cada um.

---

## 1. `POST /owner-note/:appointmentAnimalId` — escrita cross-tenant (CONFIRMADO e CORRIGIDO)

### Estado anterior

`OwnerNoteService.upsert` validava **só o `animalId`** do corpo contra o
`companyId` do token. O `appointmentAnimalId` vinha do path e ia direto para o
INSERT, sem nenhuma checagem.

Consequências medidas:

1. A clínica A gravava a anotação em cima do atendimento da clínica B usando o
   **próprio** animal (que passa na checagem existente) + o `appointmentAnimalId`
   de B.
2. O app do proprietário de B mostrava esse texto:
   `ClientPortalService` (`clientPortal.service.ts:78`) lê por
   `ownerNoteRepository.findByAppointmentAnimalId(appointmentAnimalId)`, **sem
   filtro de empresa** — a autorização ali é por `clientId`, então a linha de A
   entra na tela do proprietário de B.
3. `owner_notes.appointmentAnimalId` é **UNIQUE**. Com a linha de A ocupando o
   slot, o upsert legítimo de B caía no ramo `existing` e batia em
   `existing.companyId !== companyId` → 403 permanente. A clínica dona nunca mais
   conseguia criar a anotação dela.

### Prova antes da correção

```
1a A grava nota no appointmentAnimal de B   -> 201  (deveria ser 4xx)
1c B grava a nota DELE                      -> 403  (dona travada)
1e A lê a nota gravada no atendimento de B  -> 200
```

Evidência no banco (a nota e o atendimento em empresas diferentes):

```sql
SELECT n.id, n.description, n."companyId" AS nota_empresa, ap."companyId" AS atendimento_empresa
FROM owner_notes n
JOIN appointment_animals aa ON aa.id = n."appointmentAnimalId"
JOIN appointments ap        ON ap.id = aa."appointmentId"
WHERE n.description LIKE 'INVASAO%';
```

```
description | nota_empresa                         | atendimento_empresa
INVASAO     | 0d39f7b1-1730-4065-ab66-ee80a0bb5021 | e012f4b4-a46a-451e-8e34-f7f03f139b6f
```

### Correção

`src/domain/application/services/animal/services/ownerNote.service.ts`

Trocou a checagem parcial pelo mesmo guard das 41 fichas clínicas,
`ClinicalRecordOwnershipService.canWrite`, que confere **animal E atendimento**
contra o `companyId` do token (o `AppointmentAnimal` não guarda `companyId`: a
posse sobe para o `Appointment` pai).

```ts
if (!(await this.clinicalOwnership.canWrite({ animalId, appointmentAnimalId, companyId }))) {
  return left(new NotAllowedError());
}
```

O `AnimalRepository` saiu do construtor (ficou sem uso — a checagem de animal
agora está dentro do serviço de posse).

### Prova depois da correção

```
1a A grava nota no appointmentAnimal de B      -> 403 NOT_ALLOWED   (barrado)
1b A grava com animal+atendimento de B         -> 403 NOT_ALLOWED   (barrado)
1c B grava a nota DELE                         -> 201              (dona OK)
1d B lê a nota dele                            -> 200 "nota legitima B"
1e A lê a nota de B                            -> 403 NOT_ALLOWED
1f A grava a nota DELE                         -> 201              (dona OK)
```

---

## 2. `POST /lead` — fase (board) de outra empresa e 500 com fase inexistente (CONFIRMADO e CORRIGIDO)

### Estado anterior

`LeadService.create` **não validava o `boardId`** (o `edit` já validava desde uma
leva anterior — só o `create` ficou de fora). O lead nascia com `companyId` do
token e `boardId` de outra empresa: sumia do funil de quem criou (que lista por
`companyId`) e não aparecia em lugar nenhum recuperável.

Com `boardId` inexistente estourava violação de chave estrangeira no Prisma e
voltava **500 genérico**. Com `boardId` fora do formato uuid (a coluna é
`@db.Uuid`) também dava 500.

### Prova antes da correção

```
2a A cria lead na fase de B                 -> 201  (deveria ser 4xx)
2b A cria lead com fase inexistente (uuid)  -> 500 INTERNAL_SERVER_ERROR
2c A cria lead com fase "nao-existe"        -> 500 INTERNAL_SERVER_ERROR
```

Evidência no banco:

```sql
SELECT l.id, l.name, l."companyId" AS lead_empresa, b."companyId" AS fase_empresa
FROM leads l JOIN boards b ON b.id = l."boardId"
WHERE l."companyId" <> b."companyId";
```

```
Lead teste | 0d39f7b1-1730-4065-ab66-ee80a0bb5021 | e012f4b4-a46a-451e-8e34-f7f03f139b6f
```

### Correção

`src/domain/application/services/crm/services/lead.service.ts` — guarda de posse
no `create`, com `ValidationError` (400) e mensagem que diz o que fazer:

```ts
const board = await this.boardRepository.findById(boardId);

if (!board || board.companyId !== companyId) {
  return left(
    new ValidationError(
      'A fase informada não existe no seu funil. Atualize a página e escolha uma fase da lista.'
    )
  );
}
```

`src/infra/http/controllers/crm/dto/leadDto.ts` — `boardId` passou de `@IsString`
para `@IsUUID('4')` no `CreateLeadDto` e no `EditLeadDto`: valor fora do formato
uuid agora para no ValidationPipe (400 com mensagem) em vez de chegar ao Prisma e
virar 500.

`src/domain/application/services/crm/interfaces/leadProps.ts` —
`CreateLeadServiceResponse` passou de `Either<null, …>` para
`Either<ValidationError, …>`.

### Prova depois da correção

```
2a A cria lead na fase de B     -> 400 VALIDATION_ERROR
   "A fase informada não existe no seu funil. Atualize a página e escolha uma fase da lista."
2b A cria lead com fase inexistente -> 400 VALIDATION_ERROR "Escolha uma fase válida do funil"
2c A cria lead com fase lixo        -> 400 VALIDATION_ERROR "Escolha uma fase válida do funil"
2d A cria lead na fase DELE         -> 201  (dona OK)

L1 A move o lead DELE para a fase de B -> 403 NOT_ALLOWED  (edit continua barrando)
L2 B tenta editar o lead de A          -> 403 NOT_ALLOWED
L3 A move o lead para a fase dele      -> 200  (dona OK)
```

Nenhum 500 sobrou nas rotas de lead.

---

## 3. `POST /payment` — `categoryId` de outra empresa (CONFIRMADO e CORRIGIDO)

### Estado anterior

`PaymentService.ownsLinks` validava `animalId`, `clientId` e
`appointmentAnimalId`, mas **não** `categoryId` — o único vínculo que ficou de
fora. O `TransactionService.assertOwnedRefs` já validava a categoria dele, então
a divergência era só do lado do Payment.

Consequências: a movimentação **e todas as parcelas geradas** nasciam apontando
para o plano de contas de outro tenant (`Transaction.transactionCategoryId` é
copiado do `categoryId` do Payment). O relatório por categoria do outro tenant
(`/transaction-category/with-value`) somava esse dinheiro, e a categoria alheia
passava a ter dependente que impede remoção.

Com `categoryId` inexistente também dava **500** (violação de FK).

### Prova antes da correção

```
3a A cria payment com a categoria de B      -> 201  (deveria ser 4xx)
3b A cria payment com categoria inexistente -> 500 INTERNAL_SERVER_ERROR
```

Evidência no banco (`payments` mapeia para `sheduled_payments`):

```sql
SELECT p.id, p.name, p."companyId" AS pay_empresa, c."companyId" AS cat_empresa
FROM sheduled_payments p JOIN transaction_categories c ON c.id = p."transactionCategoryId"
WHERE p."companyId" <> c."companyId";
```

```
Consulta | 0d39f7b1-1730-4065-ab66-ee80a0bb5021 | e012f4b4-a46a-451e-8e34-f7f03f139b6f
```

### Correção

`src/domain/application/services/finance/services/payment.service.ts`

- `TransactionCategoryRepository` injetado no construtor (já é exportado pelo
  `DatabaseModule`, que a `FinanceModule` importa — nenhuma mudança de módulo foi
  necessária).
- `ownsLinks` ganhou o ramo de categoria, no mesmo formato do
  `TransactionService.assertOwnedRefs`:

```ts
if (links.categoryId) {
  const category = await this.transactionCategoryRepository.findById(links.categoryId);

  if (!category || category.companyId !== companyId) return false;
}
```

- `create` e `edit` passaram a mandar `categoryId` para o `ownsLinks`.
- `payment.service.verify.spec.ts` atualizado com o mock do novo repositório
  (3 testes passando).

### Prova depois da correção

```
3a A cria payment com a categoria de B      -> 403 NOT_ALLOWED  (barrado)
3b A cria payment com categoria inexistente -> 403 NOT_ALLOWED  (não é mais 500)
3c A cria payment com a categoria DELE      -> 201             (dona OK)

P1 A repontar o payment dele p/ categoria de B -> 403 NOT_ALLOWED
P2 B edita o payment de A                      -> 403 NOT_ALLOWED
P3 A edita com a categoria dele                -> 200          (dona OK)
```

---

## Arquivos alterados

| Arquivo | O quê |
| --- | --- |
| `src/domain/application/services/animal/services/ownerNote.service.ts` | `upsert` usa `ClinicalRecordOwnershipService.canWrite`; `AnimalRepository` removido do construtor |
| `src/domain/application/services/crm/services/lead.service.ts` | `create` valida a fase contra a empresa do token, com `ValidationError` |
| `src/domain/application/services/crm/interfaces/leadProps.ts` | `CreateLeadServiceResponse` passa a admitir `ValidationError` |
| `src/infra/http/controllers/crm/dto/leadDto.ts` | `boardId` com `@IsUUID('4')` em Create e Edit |
| `src/domain/application/services/finance/services/payment.service.ts` | `ownsLinks` valida `categoryId`; repositório de categoria injetado |
| `src/domain/application/services/finance/services/payment.service.verify.spec.ts` | mock do novo repositório |

## Checagens

- `npx tsc --noEmit` → **exit 0** com todas as alterações desta frente aplicadas.
  (Execuções posteriores acusam erros em `appointment.controller.ts`,
  `appointment/dto/appointment.dto.ts` e `prismaAppointmentAnimal.repository.ts`
  — arquivos que **não** pertencem a esta frente e estavam sendo editados ao vivo
  por outro agente.)
- `npx vitest run payment.service.verify.spec.ts` → 3/3 passando.
- As linhas cruzadas criadas pelas reproduções pré-correção foram removidas do
  banco local ao final (owner_note, lead e payment + parcela).

## Não mexido de propósito

- `ClientPortalService.fetchOwnerNoteByAppointmentAnimal` continua lendo por
  `appointmentAnimalId` sem filtro de empresa. **Isso está certo**: ali a
  autorização é por `clientId` (o proprietário só chega no atendimento dos animais
  dele) e é justamente por isso que o vazamento do item 1 acontecia na origem, na
  escrita. Fechada a escrita, não há mais linha de outra empresa para ler.
- `GET /owner-note/:appointmentAnimalId` (lado vet) já filtrava por `companyId` e
  não foi alterado.
