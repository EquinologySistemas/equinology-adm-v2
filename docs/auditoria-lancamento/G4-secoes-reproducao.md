# G4 — As 5 seções de reprodução que não tinham onde salvar

Branch `fix/lancamento` em `vetequus-api` e `equinology-web-v2`.
`npx tsc --noEmit` = exit 0 nos dois repos.

## O problema

Cinco abas apareciam na tela com formulário completo e botão Salvar, mas não
existiam no back nem no `SECTION_API_CONFIG` do front. O veterinário preenchia,
clicava Salvar e recebia o toast _"ainda não é salva no servidor"_. Eram 4 da
MATRIZ (a trilha inteira do início do trabalho reprodutivo da égua) e 1 da
RECEPTORA:

| Aba (front) | Título na tela | Rota criada |
| ----------- | -------------- | ----------- |
| `breeding-gyno` | Avaliação Ginecológica | `/reproduction-breeding-gyno` |
| `breeding-heat` | Acompanhamento do CIO | `/reproduction-breeding-heat` |
| `breeding-hormones` | Indução Hormonal | `/reproduction-breeding-hormones` |
| `breeding-cover` | Cobertura / Inseminação | `/reproduction-breeding-cover` |
| `receptor-post` | Pós-parto / Neonatal (receptora) | `/reproduction-receptor-post` |

As tabelas já existiam desde a FASE 1 (ver `SEGUNDA-LEVA-SCHEMA.md`).
`prisma/schema.prisma` **não foi tocado** nesta frente.

---

## API — 45 arquivos novos (9 por seção)

Estrutura idêntica à dos 24 módulos irmãos de reprodução
(`reproduction-receptor-gyno`, `receptor-heat`, `receptor-hormones`,
`donor-insemination`, `breeding-post`):

```
src/domain/enterprise/entities/reproduction/<mod>.ts
src/domain/application/repositories/reproduction/<mod>.repository.ts
src/domain/application/services/animal/interfaces/reproduction/<mod>Props.ts
src/domain/application/services/animal/services/reproduction/<mod>.service.ts
src/infra/shared/database/prisma/mappers/reproduction/Prisma<Mod>Mapper.ts
src/infra/shared/database/prisma/repositories/reproduction/prisma<Mod>.repository.ts
src/infra/http/presenters/reproduction/<mod>.presenter.ts
src/infra/http/controllers/animal/dto/reproduction/<mod>.dto.ts
src/infra/http/controllers/animal/reproduction/<mod>.controller.ts
```

`<mod>` ∈ `reproductionBreedingGyno`, `reproductionBreedingHeat`,
`reproductionBreedingHormones`, `reproductionBreedingCover`,
`reproductionReceptorPost`.

Registro (únicos arquivos compartilhados que foram editados):

- `src/infra/http/modules/animal.module.ts` — 5 controllers + 5 services.
- `src/infra/shared/database/database.module.ts` — 5 bindings
  `provide: <Mod>Repository / useClass: Prisma<Mod>Repository` + exports.

### Rotas de cada seção

Exatamente o mesmo formato dos irmãos, todas sob `@UseGuards(VetOnlyGuard)` e
usando `@CurrentCompanyId()`:

```
POST   /<rota>/:appointmentAnimalId
GET    /<rota>?page=&animalId=&appointmentId=
PUT    /<rota>/:id
DELETE /<rota>/:id
```

Observação sobre a especificação da tarefa: foi pedido também um
`GET /<rota>/:appointmentId`. **Nenhum dos 24 módulos irmãos tem essa rota** — o
front lê pelo `GET` com query (`boardRecordService.fetchRecords`, estilo
`"list"`). Inventar um quinto endpoint sem consumidor sairia do padrão, então
não foi criado. O `GET /:appointmentId` só existe no `owner-note`, que é
`endpointStyle: "singleton"`, caso diferente.

### Obrigatoriedade dos campos — regra seguida

Só leva `@IsNotEmpty` o que a **tela** marca como `required: true`
(`equinology-web-v2/app/(dashboard)/services/_data/mock.ts`). Todo campo de
texto opcional na tela entrou como `@IsOptional()` +
`@Transform(({ value }) => value ?? '')` + default `''`.

| Seção | Obrigatório na API | Opcional (vira `''`) |
| ----- | ------------------ | -------------------- |
| `breeding-gyno` | `vulva` (enum Ótima/Mediana/Ruim), `parity` (enum Primípara/Multípara) | `cervix`, `leftOvary`, `utero`, `rightOvary`, `bodyScore`, `cyto`, `observation` |
| `breeding-heat` | `date` | `leftOvary`, `uterus`, `rightOvary`, `observation` |
| `breeding-hormones` | `date`, `administration` (enum Intravenoso/Intramuscular) | `time`, `hormones`, `dosage`, `observation` |
| `breeding-cover` | `date`, `semen` (enum Congelado/Refrigerado/Fresco) | `time`, `method`, `stallionId`, `observation` |
| `receptor-post` | — (nada) | `mare`, `foal`, `placenta`, `observation` |

Decisões pontuais:

- **`method` (breeding-cover)** é `@IsString` livre, **não** `@IsEnum`. A tela
  não marca o campo como obrigatório; com `@IsEnum` + `Transform(?? '')` o valor
  vazio viraria `''` e o enum devolveria 400 num campo que o veterinário pode
  deixar em branco de propósito.
- **`stallionId` (breeding-cover)** é texto livre, igual a
  `ReproductionDonorInsemination.stallionId`: o garanhão pode não estar
  cadastrado como animal da empresa. Não é FK nem UUID.
- **Grafia do útero**: `utero` no `breeding-gyno` e `uterus` no `breeding-heat`.
  É o que está no schema (espelha `ReproductionReceptorGyno` /
  `ReproductionReceptorHeat`). Foi mantido para não divergir dos irmãos.
- **`breeding-gyno` não tem** `ultrasound`, `angle`, `vulva2` nem
  `vulvoplastia` — esses campos são só da receptora.

### Guarda de posse

O `create` usa o mesmo `ClinicalRecordOwnershipService.canWrite({ animalId,
appointmentAnimalId, companyId })` dos outros 41 módulos. `edit`/`delete`/`fetch`
comparam `companyId` do registro com o do token, como os irmãos.

### Anexos — limitação conhecida e documentada

Os módulos irmãos gravam anexos em dois lugares (dual-write): a tabela
`attachments` e a coluna legada `fileUrl`. A tabela `attachments` exige um valor
do enum **do Postgres** `AttachmentRecordType`, e esse enum vive em
`prisma/schema.prisma` — arquivo que esta frente não podia tocar. Não há valor
para as 5 seções novas.

Solução adotada (sem esconder nada do usuário):

- O `create`/`edit` aceitam `attachments[]` normalmente e usam
  `AttachmentSyncService.resolve()` para normalizar a lista;
- o resultado é gravado **na coluna `fileUrl`**, no formato legado (uma URL por
  linha);
- o presenter **não emite a chave `attachments`** — é justamente a ausência dela
  que faz o `parseRecordAttachments` do front cair no fallback legado e ler as
  URLs de `fileUrl`. Emitir `attachments: []` esconderia os anexos gravados.

Resultado: anexo funciona ponta a ponta hoje; o que se perde é o metadado
(`fileName`, `mimeType`, `size`), que o front já trata como `null`. Quando o enum
ganhar os 5 valores, basta passar a chamar `write`/`hydrate`/`deleteFor` nos 5
services — o comentário no topo de cada service diz isso.

---

## WEB — `services/boardRecordService.ts`

Único arquivo alterado no front. Foram acrescentadas 5 entradas em
`SECTION_API_CONFIG` (`breeding-gyno`, `breeding-heat`, `breeding-hormones`,
`breeding-cover` antes de `breeding-initial`; `receptor-post` logo acima).
Cada uma com `path`, `fetchKey`, `mapToRecord`, `buildCreateBody` e
`buildEditBody`, seguindo os vizinhos:

- campo vazio vai como **string vazia**, nunca `"-"`;
- select obrigatório usa `opt()` (omite quando não respondido — a tela já
  bloqueia salvar sem ele);
- data usa `optISODate()`;
- `time` usa o default `"00:00"` dos irmãos.

Com as chaves presentes, `getSectionApiConfig(sectionKey)` deixa de ser `null` e
o toast _"ainda não é salva no servidor"_ de `ServiceRecords.tsx` (linhas ~472,
~569 e o aviso do modal ~1093) não dispara mais para essas 5. `ServiceRecords.tsx`
não foi tocado.

---

## Verificação por curl (API rodando em `localhost:3333`)

### ANTES

De `SEGUNDA-LEVA-SCHEMA.md`, confirmado com token real:

```
POST /reproduction-breeding-gyno/<appointmentAnimalId>     -> 404
POST /reproduction-breeding-heat/<appointmentAnimalId>     -> 404
POST /reproduction-breeding-hormones/<appointmentAnimalId> -> 404
POST /reproduction-breeding-cover/<appointmentAnimalId>    -> 404
POST /reproduction-receptor-post/<appointmentAnimalId>     -> 404
```

### DEPOIS — ciclo completo, preenchendo SÓ o que a tela marca como obrigatório

Empresa própria (`g4repro1785699404@teste.com`), animal
`155eb5fe-…c5c2`, `appointmentAnimalId` `a09e61d6-…f747`.

| Seção | POST | GET | PUT | GET | DELETE | GET |
| ----- | ---- | --- | --- | --- | ------ | --- |
| `breeding-gyno` | **201** | **200** (1 reg.) | **200** | **200** | **200** | **200** (0 reg.) |
| `breeding-heat` | **201** | **200** (1 reg.) | **200** | **200** | **200** | **200** (0 reg.) |
| `breeding-hormones` | **201** | **200** (1 reg.) | **200** | **200** | **200** | **200** (0 reg.) |
| `breeding-cover` | **201** | **200** (1 reg.) | **200** | **200** | **200** | **200** (0 reg.) |
| `receptor-post` | **201** | **200** (1 reg.) | **200** | **200** | **200** | **200** (0 reg.) |

Comparação campo a campo (leitura de volta logo após o POST mínimo):

```
breeding-gyno   POST {"animalId":…,"userId":…,"vulva":"Ótima","parity":"Primípara","attachments":[]}
                GET  {"vulva":"Ótima","cervix":"","leftOvary":"","utero":"","rightOvary":"",
                      "bodyScore":"","parity":"Primípara","cyto":"","observation":"","fileUrl":null}

breeding-heat   POST {"date":"2026-03-15T12:00:00.000Z"}
                GET  {"date":"2026-03-15T00:00:00.000Z","leftOvary":"","uterus":"",
                      "rightOvary":"","observation":"","fileUrl":null}

breeding-hormones POST {"date":"2026-03-15T12:00:00.000Z","administration":"Intramuscular"}
                  GET  {"date":"2026-03-15T00:00:00.000Z","time":"","hormones":"","dosage":"",
                        "administration":"Intramuscular","observation":"","fileUrl":null}

breeding-cover  POST {"date":"2026-03-15T12:00:00.000Z","semen":"Fresco"}
                GET  {"date":"2026-03-15T00:00:00.000Z","time":"","method":"","semen":"Fresco",
                      "stallionId":"","observation":"","fileUrl":null}

receptor-post   POST {"animalId":…,"userId":…}            (nenhum campo clínico)
                GET  {"mare":"","foal":"","placenta":"","observation":"","fileUrl":null}
```

Depois do PUT, a releitura mostrou o valor novo em cada campo editado
(ex.: `breeding-gyno` → `"cervix":"Cérvix íntegro"`, `"observation":"editado"`),
com os demais campos intactos.

### Ceticismo — as checagens realmente disparam

```
POST /reproduction-breeding-gyno/<meu appointmentAnimalId>  animalId de outra empresa
  -> 403 {"message":"Você não tem permissão para realizar esta ação.","code":"NOT_ALLOWED"}

POST /reproduction-breeding-gyno/<appointmentAnimalId de outra empresa>
  -> 403 {"message":"Você não tem permissão para realizar esta ação.","code":"NOT_ALLOWED"}

POST /reproduction-breeding-gyno/…  sem vulva e sem parity
  -> 400 ["O campo Vulva é obrigatório",
          "Escolha uma condição de vulva válida (Ótima, Mediana ou Ruim)",
          "O campo Paridade é obrigatório",
          "Escolha uma paridade válida (Primípara ou Multípara)"]

POST /reproduction-breeding-cover/…  {"semen":"Morno"}
  -> 400 ["Escolha um tipo de sêmen válido (Congelado, Refrigerado ou Fresco)"]

POST /reproduction-breeding-heat/…   {"date":"2026-02-30"}
  -> 400 ["Informe uma data válida"]

GET  /reproduction-breeding-heat?…   sem token          -> 401
PUT  /reproduction-breeding-heat/<uuid inexistente>     -> 404 RESOURCE_NOT_FOUND
DELETE /reproduction-breeding-heat/<uuid inexistente>   -> 404 RESOURCE_NOT_FOUND
```

### Ponta a ponta com o corpo REAL do front

Executando `buildCreateBody` do `boardRecordService.ts` com o `formData` que a
tela entrega quando só os obrigatórios são preenchidos, e mandando o resultado
para a API:

```
breeding-gyno      POST -> 201   GET -> 200
breeding-heat      POST -> 201   GET -> 200
breeding-hormones  POST -> 201   GET -> 200
breeding-cover     POST -> 201   GET -> 200
receptor-post      POST -> 201   GET -> 200
```

Nenhum `"-"` no corpo — campo em branco sai como `""`.

`getSectionApiConfig` para as 5 chaves:

```
breeding-gyno     -> config OK  path=/reproduction-breeding-gyno       fetchKey=reproductionBreedingGynos
breeding-heat     -> config OK  path=/reproduction-breeding-heat       fetchKey=reproductionBreedingHeats
breeding-hormones -> config OK  path=/reproduction-breeding-hormones   fetchKey=reproductionBreedingHormones
breeding-cover    -> config OK  path=/reproduction-breeding-cover      fetchKey=reproductionBreedingCovers
receptor-post     -> config OK  path=/reproduction-receptor-post       fetchKey=reproductionReceptorPosts
```

Ou seja: o toast _"ainda não é salva no servidor"_ não aparece mais para nenhuma
das 5.

### Anexos

```
POST /reproduction-receptor-post/…  attachments:[{url:"https://ex.com/a.jpg"},{url:"https://ex.com/b.pdf"}]
  -> 201
GET  -> 200  fileUrl = "https://ex.com/a.jpg\nhttps://ex.com/b.pdf"
parseRecordAttachments(item) = [{url:"https://ex.com/a.jpg",order:0}, {url:"https://ex.com/b.pdf",order:1}]
```

No banco:

```
docker exec vetequus-local psql -U postgres -d vetequus \
  -c "SELECT id, mare, \"fileUrl\" FROM reproduction_receptor_posts WHERE id='79590d95-…';"

 79590d95-3a7b-42f1-858c-22c4e77cd4b3 | ok | https://ex.com/a.jpg+
                                      |    | https://ex.com/b.pdf
```

Todos os registros de teste foram apagados ao final (DELETE -> 200).

---

## Pendências deixadas de propósito

1. **Enum `AttachmentRecordType`** sem os 5 valores novos
   (`REPRODUCTION_BREEDING_GYNO`, `_HEAT`, `_HORMONE`, `_COVER`,
   `REPRODUCTION_RECEPTOR_POST`). Exige migration em `prisma/schema.prisma`,
   fora do escopo desta frente. Enquanto isso o anexo vive em `fileUrl` e
   funciona — só sem `fileName`/`mimeType`/`size`.
2. **Sem `GET /<rota>/:appointmentId`** — nenhum irmão tem, e o front não usa.
   Ver justificativa acima.
