# Segunda leva - mudancas de banco (FASE 1)

Migration unica: `vetequus-api/prisma/migrations/20260802192218_segunda_leva/migration.sql`
Aplicada em `localhost:5442` (`vetequus`). `npx prisma migrate status` = "Database schema is up to date!".
Prisma Client ja regenerado. `npx tsc --noEmit` na API sai 0.

Nenhuma coluna existente foi alterada ou removida. A migration e 100% aditiva.

---

## 1. Exclusao logica de usuario e de produto

Mesmo padrao de `clients`, `animals`, `appointments`, `stud_farms`:

| Tabela     | Coluna      | Tipo             |
| ---------- | ----------- | ---------------- |
| `users`    | `deletedAt` | `TIMESTAMP(3)` nullable |
| `products` | `deletedAt` | `TIMESTAMP(3)` nullable |

No schema: `User.deletedAt DateTime?` e `Product.deletedAt DateTime?`.

Contrato esperado nos services (igual as levas anteriores):
- listagens filtram `deletedAt: null` por padrao;
- `includeDeleted=true` (query string) devolve tambem os excluidos;
- `DELETE` grava `deletedAt: new Date()` em vez de apagar a linha;
- usuario com `deletedAt` preenchido nao deve conseguir logar.

Nada disso esta implementado ainda - a FASE 1 entregou so a coluna.

---

## 2. Cinco secoes de reproducao que nao tinham tabela

Fonte dos campos: `equinology-web-v2/app/(dashboard)/services/_data/mock.ts`
(chaves `breeding-gyno`, `breeding-heat`, `breeding-hormones`, `breeding-cover`,
`receptor-post`). Convencao de coluna/relacao copiada dos irmaos
`ReproductionReceptorGyno`, `ReproductionReceptorHeat`,
`ReproductionReceptorHormones`, `ReproductionDonorInsemination` e
`ReproductionBreedingPost`.

### Estrutura comum a todos os 5 models

```
id                  String   @id @default(uuid()) @db.Uuid
animalId            String   @db.Uuid
companyId           String   @db.Uuid
userId              String   @db.Uuid
... campos clinicos ...
observation         String
fileUrl             String?
createdAt           DateTime @default(now())
appointmentAnimalId String   @db.Uuid

appointmentAnimal AppointmentAnimal @relation(fields: [appointmentAnimalId], references: [id])
animal            Animal            @relation(fields: [animalId], references: [id])
company           Company           @relation(fields: [companyId], references: [id])
user              User              @relation(fields: [userId], references: [id])
```

FKs `ON DELETE RESTRICT ON UPDATE CASCADE` - identico aos irmaos.

### Criterio de nulabilidade (decisao ja tomada nesta base)

- Campo clinico de texto: `String` **NOT NULL**. O DTO usa
  `@IsOptional()` + `@Transform(({ value }) => value ?? '')`, entao branco vira
  `''` e o veterinario nunca leva 400 por deixar campo vazio.
- Campo de data: nas 5 secoes toda data e `required: true` na tela, entao ficou
  `DateTime @db.Date` **NOT NULL**, igual a `date` dos irmaos
  (`ReproductionReceptorHormones.date`, `ReproductionDonorInsemination.date`).
  Data que a tela permite vazia continua sendo `DateTime?` - o unico caso hoje e
  `ReproductionReceptorDiagnosis.expectancyDate`.
- `fileUrl` continua `String?` (opcional), como em todos os irmaos.

---

### `ReproductionBreedingGyno` -> tabela `reproduction_breeding_gynos`
Aba `breeding-gyno` - Avaliacao Ginecologica da MATRIZ.

| Campo | Tipo Prisma | Origem na tela |
| ----- | ----------- | -------------- |
| `vulva` | `String` | select Otima/Mediana/Ruim |
| `cervix` | `String` | texto |
| `leftOvary` | `String` | texto (label "OE") |
| `utero` | `String` | texto (label "U") |
| `rightOvary` | `String` | texto (label "OD") |
| `bodyScore` | `String` | texto |
| `parity` | `String` | select Primipara/Multipara |
| `cyto` | `String` | texto (Citologia) |
| `observation` | `String` | texto |

Nao tem `date`. Atencao: a tela da matriz **nao** tem `ultrasound`, `angle`,
`vulva2` nem `vulvoplastia` - esses sao so da receptora. Nao copiar cegamente
`ReproductionReceptorGyno`.

### `ReproductionBreedingHeat` -> tabela `reproduction_breeding_heats`
Aba `breeding-heat` - Acompanhamento do CIO da MATRIZ.

| Campo | Tipo Prisma |
| ----- | ----------- |
| `date` | `DateTime @db.Date` (obrigatorio) |
| `leftOvary` | `String` |
| `uterus` | `String` |
| `rightOvary` | `String` |
| `observation` | `String` |

Cuidado com a grafia: aqui o utero e `uterus` (igual a
`ReproductionReceptorHeat`), enquanto no Gyno e `utero`. Foi mantido assim para
espelhar os irmaos ja existentes.

### `ReproductionBreedingHormones` -> tabela `reproduction_breeding_hormones`
Aba `breeding-hormones` - Inducao Hormonal da MATRIZ.

| Campo | Tipo Prisma |
| ----- | ----------- |
| `date` | `DateTime @db.Date` (obrigatorio) |
| `time` | `String` (hora em texto, "08:30") |
| `hormones` | `String` |
| `dosage` | `String` |
| `administration` | `String` (select Intravenoso/Intramuscular) |
| `observation` | `String` |

Copia exata de `ReproductionReceptorHormones`.

### `ReproductionBreedingCover` -> tabela `reproduction_breeding_covers`
Aba `breeding-cover` - Cobertura / Inseminacao da MATRIZ.

| Campo | Tipo Prisma |
| ----- | ----------- |
| `date` | `DateTime @db.Date` (obrigatorio) |
| `time` | `String` |
| `method` | `String` (select Monta natural/Inseminacao) |
| `semen` | `String` (select Congelado/Refrigerado/Fresco) |
| `stallionId` | `String` |
| `observation` | `String` |

`stallionId` e **texto livre**, nao e FK nem `@db.Uuid` - identico a
`ReproductionDonorInsemination.stallionId`. O garanhao pode nao estar
cadastrado como animal da empresa.

### `ReproductionReceptorPost` -> tabela `reproduction_receptor_posts`
Aba `receptor-post` - Pos-parto / Neonatal da RECEPTORA.

| Campo | Tipo Prisma |
| ----- | ----------- |
| `mare` | `String` (Egua receptora) |
| `foal` | `String` (Potro) |
| `placenta` | `String` |
| `observation` | `String` |

Nao tem `date`. E o espelho de `ReproductionBreedingPost`, que atende so a
matriz - por isso a receptora precisou de tabela propria em vez de reusar a
existente.

---

## Relacoes inversas adicionadas

Os 5 models novos foram declarados tambem em `User`, `Company`, `Animal` e
`AppointmentAnimal`:

```
ReproductionBreedingGyno     ReproductionBreedingGyno[]
ReproductionBreedingHeat     ReproductionBreedingHeat[]
ReproductionBreedingHormones ReproductionBreedingHormones[]
ReproductionBreedingCover    ReproductionBreedingCover[]
ReproductionReceptorPost     ReproductionReceptorPost[]
```

---

## O que ainda NAO existe (trabalho das proximas fases)

Nao ha controller, service, repository, DTO nem presenter para nenhuma das 5
secoes. Verificado por curl com token real: os 5 POST retornam **404**.

```
POST /reproduction-breeding-gyno/<appointmentAnimalId>     -> 404
POST /reproduction-breeding-heat/<appointmentAnimalId>     -> 404
POST /reproduction-breeding-hormones/<appointmentAnimalId> -> 404
POST /reproduction-breeding-cover/<appointmentAnimalId>    -> 404
POST /reproduction-receptor-post/<appointmentAnimalId>     -> 404
```

Rotas sugeridas (mesmo formato dos irmaos, ver
`reproductionBreedingPost.controller.ts`):
`POST /<rota>/:appointmentAnimalId`, `PUT /<rota>/:id`, `DELETE /<rota>/:id`,
`GET /<rota>?page&animalId&appointmentId`, todas sob `@UseGuards(VetOnlyGuard)`
e usando `@CurrentCompanyId()`.

As tabelas em si ja gravam: insert real com `animalId`/`companyId`/`userId`/
`appointmentAnimalId` validos passou nas 5 (`INSERT 0 1` em cada), o que prova
que as FKs e os NOT NULL estao coerentes com o fluxo do app.
