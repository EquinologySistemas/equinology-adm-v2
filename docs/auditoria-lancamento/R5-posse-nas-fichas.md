# R5 — Vínculo cross-tenant nas fichas clínicas

Frente R5 dos resíduos menores. Escopo: services e controllers das fichas
clínicas (`general-*`, `dentistry-*`, `orthopedic-*`, `reproduction-*`) e o
módulo `deworming`. Não toca em pagamento, nem em appointment/animal/client/
stud-farm (frente R4).

## Resumo

| # | Item medido | Situação | Resultado |
|---|---|---|---|
| 1 | Fichas aceitam e gravam `userId` de OUTRA empresa no responsável | reproduzido: 201/200 e gravado | **CORRIGIDO** |
| 1b | Fichas de reprodução aceitam `stallionId` de outra empresa | `stallionId` é `text` sem FK, texto livre por decisão de schema | **NÃO ERA BUG** |
| 2 | `companyId` aceito no Edit DTO das fichas e descartado em silêncio | reproduzido (200, banco intocado) | **CORRIGIDO** (removido do DTO) |
| 3 | `PUT /deworming/:id` exige o id repetido no corpo | não reproduz: `dewormingId` já é `@IsOptional()` | **JÁ ESTAVA OK** |

Bônus dentro do escopo: `/deworming` também aceitava `userId` de outra empresa
(create e edit). Corrigido junto.

## Ambiente de prova

Duas empresas criadas via `POST /user/register` (`newCompany: true`), cada uma
com o próprio veterinário, cliente, animal e atendimento:

```
Empresa A  companyId ce9d3bd9-…  userId 56d9b3ce-…  animalId cdc160c9-…
Empresa B  companyId e98be33e-…  userId 760a1ead-…  animalId 6ef2e8d4-…
```

`appointmentAnimalId` de A: `945aea4a-…` (id de `appointment_animals`, o que as
fichas recebem no path como `:appointmentId`).

## Item 1 — `userId` de outra empresa

### Antes (medido)

Empresa A, com o token dela, gravando ficha no animal dela, mas passando o
`userId` do veterinário da empresa B:

```
POST /general-info/945aea4a-…                  -> 201
POST /dentistry-assessment/945aea4a-…          -> 201
POST /orthopedic-info/945aea4a-…               -> 201
POST /reproduction-breeding-initial/945aea4a-… -> 201
```

Banco:

```
select id, "companyId", "userId" from general_infos where "animalId"='cdc160c9-…';
 companyId = ce9d3bd9-…  (empresa A)
 userId    = 760a1ead-…  (veterinário da empresa B)
```

O `PUT` era pior: bastava mandar `{"userId":"<vet da empresa B>"}` para trocar o
responsável de uma ficha já gravada — 200 em todos os quatro módulos, com o
`userId` do outro tenant persistido.

Efeito real: o laudo assinado sai com o nome de um profissional que não existe
naquela clínica, e a ficha entra na lista de "atendimentos do veterinário" da
outra empresa.

### A causa

`ClinicalRecordOwnershipService.canWrite()` já validava `animalId` e
`appointmentAnimalId`. O `userId`, que é FK para `users` e é o terceiro campo de
vínculo gravado pelo create, ficou de fora. O `edit` também não checava:
`if (userId) info.userId = userId;` gravava o que viesse.

### A correção — no ponto compartilhado

`src/domain/application/services/animal/services/clinicalRecordOwnership.service.ts`

- novo `isUserFromCompany(userId, companyId)` — carrega o usuário e compara
  `user.companyId` com a empresa do token;
- `canWrite()` passou a receber `userId` e a exigir os **três** vínculos;
- constante exportada `CLINICAL_RECORD_WRITE_DENIED_MESSAGE` com a mensagem em
  português.

`findById(userId, includeDeleted = true)` de propósito: veterinário com exclusão
lógica continua válido como responsável de ficha antiga, senão editar uma ficha
de quem saiu da clínica passaria a devolver 403. O que a checagem barra é a
**empresa** errada, não o desligamento.

Nos 47 services (7 dentistry + 4 general + 6 orthopedic + 29 reproduction +
ownerNote) a mudança foi mecânica e idêntica:

```ts
// create
if (!(await this.clinicalOwnership.canWrite({ animalId, appointmentAnimalId, companyId, userId }))) {
  return left(new NotAllowedError(CLINICAL_RECORD_WRITE_DENIED_MESSAGE));
}

// edit
if (userId && !(await this.clinicalOwnership.isUserFromCompany(userId, companyId))) {
  return left(new NotAllowedError(CLINICAL_RECORD_WRITE_DENIED_MESSAGE));
}
if (userId) info.userId = userId;
```

`NotAllowedError` ganhou um parâmetro `message` opcional (sem argumento continua
saindo o texto genérico de antes — nenhum uso existente muda).

Mensagem devolvida, 403:

> Não foi possível salvar a ficha: o animal, o atendimento ou o responsável
> selecionado não pertencem à sua clínica. Recarregue a página e selecione
> novamente.

Ela não diz **qual** dos três vínculos falhou de propósito: confirmar para a
clínica A que um id da clínica B existe já é vazamento.

### Depois (medido, 8 módulos de 4 famílias)

| módulo | POST userId=B | POST userId=A | userId gravado | PUT userId=B | POST com token B no animal de A |
|---|---|---|---|---|---|
| general-info | 403 | 201 | A | 403 | 403 |
| general-service | 403 | 201 | A | 403 | 403 |
| dentistry-assessment | 403 | 201 | A | 403 | 403 |
| dentistry-oral | 403 | 201 | A | 403 | 403 |
| orthopedic-info | 403 | 201 | A | 403 | 403 |
| orthopedic-test | 403 | 201 | A | 403 | 403 |
| reproduction-breeding-initial | 403 | 201 | A | 403 | 403 |
| reproduction-stallion-storage | 403 | 201 | A | 403 | 403 |

Outros casos:

```
POST /general-info  userId = uuid que não existe   -> 403 (mesma mensagem)
POST /owner-note    userId = A                     -> 201 (upsert segue normal)
POST /owner-note    userId = B                     -> 403
```

Prova estática de que pegou em todos: `grep` no diretório dos services devolve
**47** arquivos com `canWrite({ animalId, appointmentAnimalId, companyId, userId })`
e **zero** com a assinatura antiga.

Lado negativo conferido: a empresa B continua barrada ao escrever no animal/
atendimento da empresa A (403 nas oito rotas) — a correção não afrouxou nada,
só acrescentou um terceiro vínculo à checagem que já existia.

## Item 1b — `stallionId`

Não é vínculo. `stallionId` existe em `ReproductionBreedingCover` e
`ReproductionDonorInsemination`, é coluna `text` **sem FK**, e o próprio schema
documenta:

```
/// `stallionId` é texto livre, igual a ReproductionDonorInsemination: o
/// garanhão pode não estar cadastrado como animal da empresa.
```

Confirmado no banco:

```
select conname from pg_constraint where conrelid='reproduction_breeding_covers'::regclass and contype='f';
 -> animalId, appointmentAnimalId, companyId, userId   (stallionId NÃO está)

select data_type from information_schema.columns
 where table_name='reproduction_breeding_covers' and column_name='stallionId';  -> text
```

No web (`services/boardRecordService.ts`) o campo pode receber o `id` de um
animal quando o usuário escolhe pelo seletor, mas cai para texto livre quando
ele digita o nome; nenhuma tela resolve esse valor para um cadastro. Portanto
não há vínculo cross-tenant — no máximo uma string opaca. **Não mexi**: exigir
que fosse animal da empresa quebraria o caso documentado do garanhão de fora.

## Item 2 — `companyId` no Edit DTO

### Antes

```
PUT /general-info/<id>  body {"companyId":"<empresa B>","observation":"..."}  -> 200
select "companyId" from general_infos where id='<id>';  -> ce9d3bd9-… (empresa A, intocado)
```

Ou seja: aceito, validado pelo `@IsString`, documentado no Swagger e jogado
fora. O controller monta `{ …body, companyId }` com o `companyId` do token por
último, então o valor do corpo nunca chegava a ser usado.

### Correção

Empresa não se troca por edição — então o campo saiu do contrato em vez de
passar a ser respeitado. Removido `companyId` dos **45** Edit DTOs em
`src/infra/http/controllers/animal/dto/**`.

Sem risco de quebrar o front:

- o `ValidationPipe` global **não** usa `whitelist` nem
  `forbidNonWhitelisted` (`src/infra/main.ts`), então um `companyId` que ainda
  chegue no corpo não vira 400 — continua ignorado, exatamente como antes;
- varredura no `equinology-web-v2`: nenhuma tela de ficha envia `companyId`;
- conferido que em nenhum controller de ficha o `companyId` do token aparece
  **antes** do `...body` (senão o corpo venceria).

Depois: o Swagger não anuncia mais um campo que não faz nada, e quem lê o DTO
não pensa que dá para trocar de empresa.

## Item 3 — `PUT /deworming/:id`

**Não reproduz.** Já foi corrigido em leva anterior. `EditDewormingDto` tem:

```ts
/**
 * Legado. O id que vale é o `:id` da URL — o controller nunca leu este
 * campo. Enquanto era obrigatório, qualquer PUT que mandasse só os campos
 * editados (inclusive {"nextDate":null}) levava 400.
 */
@IsOptional()
dewormingId?: string;
```

Medido:

```
PUT /deworming/<id>  body {"name":"so o path id"}  -> 200
```

Mesmo padrão dos outros módulos. Nada a fazer.

## Bônus — `/deworming` e o `userId`

Enquanto testava o item 3, o `PUT /deworming/<id>` com `{"userId":"<vet da
empresa B>"}` devolvia **200** e gravava. Mesmo defeito do item 1, num módulo
que está no escopo desta frente. `deworming.service.ts` passou a injetar o
`ClinicalRecordOwnershipService` e a chamar `isUserFromCompany` no create e no
edit.

```
POST /deworming  userId=B -> 403      POST /deworming  userId=A -> 201
PUT  /deworming  userId=B -> 403      userId gravado: A
```

## Pendências (fora do escopo desta frente)

`/vaccine`, `/exam` e `/shoeing` têm **o mesmo buraco** e ficaram de fora porque
não estavam na lista da frente. Medido depois da correção:

```
POST /vaccine  {animalId: A, userId: <vet da empresa B>, …} -> 201  (userId gravado = B)
POST /exam     {animalId: A, userId: <vet da empresa B>, …} -> 201
POST /shoeing  {animalId: A, userId: <vet da empresa B>, …} -> 201
```

A correção é de três linhas por service, idêntica à do `deworming`: injetar o
`ClinicalRecordOwnershipService` e chamar `isUserFromCompany` no create e no
edit. `/animal-note` não tem o problema — o `userId` dela vem do token, não do
corpo.

## Verificação final

- `npx tsc --noEmit` na `vetequus-api`: **exit 0**, sem saída.
- Nada tocado no web, no app ou no adm (só este documento).
- Nada tocado em pagamento/assinatura/Asaas nem em appointment/animal/client/
  stud-farm.
- Nada commitado; branch `fix/lancamento` intacta.

### Arquivos alterados

```
src/core/errors/errors/notAllowedError.ts                     (message opcional)
src/domain/application/services/animal/services/clinicalRecordOwnership.service.ts
src/domain/application/services/animal/services/**/*.service.ts        (47 fichas)
src/domain/application/services/animal/services/deworming.service.ts
src/infra/http/controllers/animal/dto/**/*.dto.ts             (45 Edit DTOs)
```
