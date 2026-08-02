# F2-fichas-leitura-edicao

Varredura de GET / PUT / DELETE das secoes de ficha clinica contra a API rodando em
`http://localhost:3333`, com empresa propria criada para a auditoria.

Fixture usada (isolada, criada por mim):
- companyId `4f9b0aae-dc61-4878-9d3d-9ebb02ce1bfc`
- userId `b092e935-f691-4061-8366-8053bbe28cc1`
- animalId `e09485b9-6862-4569-8741-0cfda6fcc71a` / animal2 `13d4b22d-e479-4db2-8c3e-79458b983dcd`
- appointmentAnimalId 1 `660f537b-590a-48de-ab84-546255bb7d09` (appointment `12f3c686-a15c-42e8-8767-ee50f231e509`)
- appointmentAnimalId 2 `e48c87b4-6d9d-48ee-93e6-422699e7ef9d` (appointment `da6cf576-bea7-4046-b3a7-2a5f10a4d426`)
- empresa "vitima" usada nos testes de isolamento: `f4e2f01e-49fb-4ccd-b02c-df1d645aeca5`

Scripts usados (ficam no scratchpad da sessao):
`f2-setup.js`, `f2-specs.js`, `f2-sweep.js`, `f2-confirm.js`, `f2-iso.js`, `f2-fk.js`.

---

## Cobertura: 123 rotas testadas / 123 rotas do meu conjunto

**Correcao de escopo.** O enunciado falava em "43 secoes com GET /x, GET /x/:appointmentId,
PUT /x/:id e DELETE /x/:id". Na API existem **41 controllers** nesses 4 modulos
(general 4, dentistry 7, orthopedic 6, reproduction 24) e **nao existe** a rota
`GET /x/:appointmentId` — o filtro por atendimento e o query param
`GET /x?page=1&animalId=<id>&appointmentId=<id>`. Portanto o conjunto real e
41 x 3 = **123 rotas**, e as 123 foram exercitadas.

Modulos varridos (todos com POST -> GET ida-e-volta -> PUT de todos os campos -> GET ->
filtros -> paginacao -> entradas malformadas -> DELETE -> GET):

general-info, general-prescription, general-service, general-test,
dentistry-assessment, dentistry-exam, dentistry-odontogram, dentistry-oral,
dentistry-prescription, dentistry-report, dentistry-sedation,
orthopedic-blockage, orthopedic-extra, orthopedic-info, orthopedic-prescription,
orthopedic-service, orthopedic-test,
reproduction-breeding-birth, reproduction-breeding-initial,
reproduction-breeding-intermediate, reproduction-breeding-post,
reproduction-breedingPregnancy, reproduction-breeding-vaccines,
reproduction-donor-embryo, reproduction-donor-gyno, reproduction-donor-heat,
reproduction-donor-insemination, reproduction-donor-ovulation,
reproduction-receptor-diagnosis, reproduction-receptor-embryo,
reproduction-receptor-final, reproduction-receptor-gyno, reproduction-receptor-heat,
reproduction-receptor-hormones, reproduction-receptor-inovulation,
reproduction-receptor-monitoring, reproduction-receptor-vaccines,
reproduction-stallion-collection, reproduction-stallion-physical,
reproduction-stallion-shipping, reproduction-stallion-storage.

### O que NAO foi testado (declarado com precisao)

1. **Upload real de anexo** (`POST /file`). Testei `attachments[]` e `fileUrl` passando
   URLs sinteticas; nao subi binario nem validei R2/S3.
2. **Isolamento cross-empresa em profundidade nos 41**: os testes de leitura/edicao/exclusao
   de recurso de outra empresa (403) foram feitos em `general-info` (amostra) e o mecanismo
   e o mesmo `ClinicalRecordOwnershipService` + `companyId !== companyId` em todos os 41
   (verificado no codigo). Os testes de **FK cross-empresa (userId/stallionId)** esses sim
   rodaram nos 41.
3. **Concorrencia** (dois PUT simultaneos no mesmo id) e **carga**.
4. **Campo `odontogram`** de `dentistry-odontogram` foi testado como string simples; nao
   validei se ha um JSON/estrutura esperada pela tela.
5. Nao verifiquei como os frontends (adm/app/web) montam a chamada do filtro por atendimento —
   nao ha referencia a essas rotas em `equinology-adm-v2/src` nem em `equinology-app-v2`
   (grep sem resultado). Isso afeta a classificacao do achado #2, marcado como SUSPEITO.

---

## Achados

### 1. BLOQUEIA — `PUT /reproduction-donor-ovulation/:id` responde 200 e nao grava NADA (CONFIRMADO)

O service `edit` desestrutura todos os campos e **nunca atribui nenhum deles** na entidade.
So o `fileUrl`/`attachments` sao gravados (via `attachmentSync`). Data, hora, hormonio,
dosagem, via de administracao e observacao sao perdidos silenciosamente com HTTP 200.

Arquivo: `vetequus-api/src/domain/application/services/animal/services/reproduction/reproductionDonorOvulation.service.ts`
(metodo `edit`: entre a checagem de `companyId` e o `save` nao existe um unico `ovulation.X = ...`).

Reproducao:
```
POST /reproduction-donor-ovulation/660f537b-590a-48de-ab84-546255bb7d09
  {"animalId":"e094...","userId":"b092...","date":"2026-03-10T00:00:00.000Z",
   "time":"T1","hormones":"H1","dosage":"D1","administration":"Intravenoso","observation":"OV1"}
-> 201

PUT /reproduction-donor-ovulation/5ff973f9-de54-4da9-b097-71eb1d0847df
  {"date":"2026-09-09T00:00:00.000Z","time":"T2","hormones":"H2","dosage":"D2",
   "administration":"Intramuscular","observation":"OV2","fileUrl":"http://x/y.jpg"}
-> 200 (corpo vazio)

GET /reproduction-donor-ovulation?page=1&animalId=e094...
-> {"date":"2026-03-10T00:00:00.000Z","time":"T1","hormones":"H1","dosage":"D1",
    "administration":"Intravenoso","observation":"OV1", "fileUrl":"http://x/y.jpg"}
```
Ou seja: o unico campo que mudou foi o `fileUrl`. **Unico modulo dos 41 com esse defeito** —
os outros 40 aplicaram todos os campos corretamente no PUT.

---

### 2. BLOQUEIA — 6 modulos: o GET **ignora** o filtro de atendimento, mas o `pages` conta filtrado (CONFIRMADO)

Em 6 repositorios o `fetchByAnimalId` filtra **so por `animalId`**, enquanto o `count` do
mesmo repositorio filtra por `animalId + appointmentAnimalId`. Consequencias:

- a lista da ficha do atendimento A mostra tambem os registros do atendimento B (mistura
  prontuario de atendimentos diferentes);
- `pages` sai incoerente com a lista devolvida (ja vi `pages: 0` com 2 itens no array),
  o que quebra a paginacao da tela.

Modulos afetados:
`reproduction-breeding-intermediate`, `reproduction-breedingPregnancy`,
`reproduction-donor-insemination`, `reproduction-receptor-inovulation`,
`reproduction-receptor-monitoring`, `reproduction-stallion-collection`.

Arquivos (metodo `fetchByAnimalId` sem `appointmentAnimalId` no `where`, `count` com):
`vetequus-api/src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionBreedingIntermediate.repository.ts`
e os 5 analogos.

Reproducao (`reproduction-breedingPregnancy`, 2 fichas em atendimentos diferentes):
```
POST /reproduction-breedingPregnancy/660f537b-...  {"observation":"PREG-AA1", ...}
POST /reproduction-breedingPregnancy/e48c87b4-...  {"observation":"PREG-AA2", ...}

GET /reproduction-breedingPregnancy?page=1&animalId=e094...&appointmentId=660f537b-...
-> 200  ["PREG-AA2","PREG-AA1"]   pages=1      <-- devia trazer so PREG-AA1

GET /reproduction-breedingPregnancy?page=1&animalId=e094...&appointmentId=12f3c686-...
-> 200  ["PREG-AA2","PREG-AA1"]   pages=0      <-- lista cheia com pages=0
```
Comparacao com um modulo sao (`general-info`, mesmo cenario):
```
GET /general-info?...&appointmentId=660f537b-...  -> ["FICHA-AA1"]  pages=1  (correto)
```

---

### 3. GRAVE — 41/41: `PUT` e `POST` aceitam e gravam `userId` de OUTRA empresa (CONFIRMADO)

Nenhum dos 41 services valida que o `userId` informado pertence a empresa do token
(`grep userRepository|companyId` no `edit` dos 41: zero ocorrencias). Resultado: a ficha da
minha clinica passa a apontar, como responsavel tecnico, um veterinario de outra clinica.
Idem para `stallionId` em `reproduction-donor-insemination` (coluna `text`, sem FK).

Reproducao:
```
PUT /general-info/1bae4741-10f6-427d-ba25-4fd62ef7cd09
  {"userId":"74c8c4ca-a401-4a6d-8b28-c2898c194e41"}   (usuario da empresa f4e2f01e-...)
-> 200
GET /general-info?page=1&animalId=e094...
-> userId = "74c8c4ca-a401-4a6d-8b28-c2898c194e41"
```
Confirmado no banco:
```sql
select gi.id, gi."userId", u."companyId" as user_company, gi."companyId" as ficha_company
from general_infos gi join users u on u.id = gi."userId"
where gi."companyId"='4f9b0aae-dc61-4878-9d3d-9ebb02ce1bfc'
  and u."companyId" <> '4f9b0aae-dc61-4878-9d3d-9ebb02ce1bfc';
-- 1bae4741-... | 74c8c4ca-... | f4e2f01e-... | 4f9b0aae-...
```
`stallionId` cross-empresa:
```
PUT /reproduction-donor-insemination/<id> {"stallionId":"2a86e148-c9b6-4515-ac81-d74258520cc4"}
-> 200, valor gravado = 2a86e148-... (animal da empresa f4e2f01e-...)
```
Rodou nos 41: **41/41 no POST, 41/41 no PUT**. Nao e vazamento de leitura (o GET nao
resolve nome do usuario), mas grava vinculo entre empresas e pode quebrar/vazar em qualquer
tela que resolva esse `userId` (PDF de prontuario, detalhe do atendimento).
Contraponto positivo: `animalId` **e** validado (retorna 403 com animal de outra empresa).

---

### 4. GRAVE — 41/41: 500 cru em id/parametro malformado (CONFIRMADO)

Nenhuma rota valida formato de UUID nem faixa de `page`. O erro do Postgres/Prisma
(`invalid input syntax for type uuid`, `OFFSET must not be negative`) vaza como 500 generico.
Testado nos 41 modulos, todos com o mesmo comportamento.

| Chamada | HTTP observado |
|---|---|
| `PUT /<rota>/abc` | **500** |
| `DELETE /<rota>/abc` | **500** |
| `GET /<rota>?page=1&animalId=abc` | **500** |
| `GET /<rota>?page=1&animalId=<ok>&appointmentId=abc` | **500** |
| `GET /<rota>?page=-1&animalId=<ok>` | **500** |
| `GET /<rota>?page=0&animalId=<ok>` | **500** |

Mensagem devolvida: `"Não foi possível concluir a operação. Tente novamente em alguns
instantes e, se o problema continuar, entre em contato com o suporte."` — incompreensivel
para o usuario, que so digitou uma URL errada. `page=0` e especialmente ruim: e o off-by-one
mais comum de frontend e derruba a tela inteira com 500.

Comparacao: com UUID **bem formado** e inexistente o comportamento e correto (404
`RESOURCE_NOT_FOUND`), o que prova que so falta a validacao de formato.

---

### 5. GRAVE — `appointmentId` no GET so casa com `appointmentAnimalId`, e o GET nunca devolve esse id (SUSPEITO)

Nos 35 modulos em que o filtro funciona, o `where` e
`appointmentAnimalId: data.appointmentId` — ou seja, o parametro chamado `appointmentId`
tem que receber o **id do appointment_animal**, nao o id do atendimento. Passando o id real
do atendimento a resposta e `200` com lista vazia e `pages: 0` (a tela abre em branco sem
nenhum erro).

```
GET /general-info?page=1&animalId=e094...&appointmentId=12f3c686-...  (id do appointment)
-> 200  []          pages=0
GET /general-info?page=1&animalId=e094...&appointmentId=660f537b-...  (id do appointment_animal)
-> 200  ["FICHA-AA1"]  pages=1
```

Agrava o quadro: **nenhum dos 41 presenters devolve `appointmentAnimalId`** (verificado nos
41 arquivos em `src/infra/http/presenters/{general,dentistry,orthopedic,reproduction}/`),
apesar de a coluna existir no banco. O cliente nao consegue nem descobrir a qual atendimento
cada ficha pertence a partir da resposta.

Marcado SUSPEITO porque nao consegui confirmar o que o frontend envia (nenhum dos 3 repos
web/app/adm referencia essas rotas hoje). Se o frontend passar o id do atendimento, isto
vira BLOQUEIA em 35 modulos: toda ficha some da tela.

---

### 6. MENOR — `companyId` aceito no `EditDto` e descartado em silencio (CONFIRMADO)

```
PUT /general-info/<id> {"companyId":"f4e2f01e-49fb-4ccd-b02c-df1d645aeca5"}
-> 200,  GET depois: companyId continua 4f9b0aae-... (correto)
```
Do ponto de vista de seguranca esta certo (o controller sobrescreve com o `companyId` do
token). Mas o campo esta publicado no DTO/Swagger e nao faz nada — e o padrao "campo aceito e
ignorado" que ja mordeu esta base. Presente nos 41 `Edit*Dto`.

---

### 7. MENOR — sem limite de tamanho em campo texto e sem limite de data (CONFIRMADO)

```
PUT /general-test/<id> {"observation":"x".repeat(100000)}   -> 200, gravou 100000 chars
POST /reproduction-receptor-heat/<aa> {"date":"9999-12-31T00:00:00.000Z"} -> 201
POST /reproduction-receptor-heat/<aa> {"date":"0001-01-01T00:00:00.000Z"} -> 201
```
Datas absurdas entram no prontuario sem qualquer aviso. Campo texto sem `@MaxLength` em
nenhum dos 41 DTOs — vetor de inflar o banco e quebrar layout de PDF.

---

## O que passou (nao precisa reauditar)

Tudo abaixo foi exercitado nos **41 modulos** (salvo onde indico amostra) e passou:

1. **Ida e volta POST -> GET, campo a campo, nos 41.** Todo campo enviado no POST voltou no
   GET com o mesmo valor, incluindo os modulos "gordos" (`general-test` 17 campos,
   `reproduction-donor-gyno`/`receptor-gyno` 13, `reproduction-stallion-physical` 14,
   `reproduction-stallion-collection` 13). **Zero casos de campo que grava e nao volta.**
   O caso conhecido de `donor-insemination` (`stallionId`/`volume`) esta corrigido: ambos
   voltam no GET (mapper `toDomain`/`toPrisma` e presenter completos). Varri os 41
   comparando `CreateDto` x presenter e nao ha nenhum outro campo faltando.
2. **PUT com todos os campos alterados, nos 41.** 40 de 41 aplicaram e persistiram tudo
   (unica excecao: achado #1).
3. **PUT parcial nao apaga vizinho.** `general-test` com 17 campos preenchidos + `PUT
   {"observation":"SO_ISSO"}` -> nenhum outro campo mudou. `PUT {}` -> 200 e nada muda.
4. **`fileUrl: ""` limpa corretamente** (`fileUrl` vira `null` e `attachments` vira `[]`).
5. **DELETE funciona e nao deixa anexo orfao.** Nos 41, DELETE devolve 200 e o GET seguinte
   devolve 0 registros. Verificado no banco em `general-info` com 2 anexos:
   `select count(*) from attachments where "recordId"='<id>'` = 2 antes, **0** depois; a
   linha em `general_infos` tambem sumiu. Todos os 41 services chamam
   `attachmentSync.deleteFor(...)` no delete (verificado no codigo).
6. **Isolamento entre empresas (amostra `general-info`, mecanismo identico nos 41):**
   - `GET ?animalId=<animal de outra empresa>` -> **403** `NOT_ALLOWED`
   - `PUT /<ficha de outra empresa>` -> **403**, e o banco nao mudou
   - `DELETE /<ficha de outra empresa>` -> **403**, registro intacto no banco
   - `POST /<appointmentAnimalId de outra empresa>` -> **403**
   - `PUT {"animalId": <animal de outra empresa>}` -> **403** (esta checagem *dispara* mesmo)
7. **PUT/DELETE com UUID bem formado e inexistente** -> **404**
   `{"code":"RESOURCE_NOT_FOUND","message":"Registro não encontrado..."}` nos 41.
8. **Paginacao correta** (`general-service`, 12 registros): page1 = 10 itens, page2 = 2 itens,
   page3 = vazio, `pages: 2` nas tres, **zero duplicata entre paginas**, 12 distintos no
   total. A ordenacao explicita `orderBy [{createdAt desc},{id desc}]` esta nos repositorios
   e resolve o problema antigo de registro "sumindo" entre paginas.
9. **`appointmentAnimalId` sobrevive ao PUT** (confirmado no banco: continua
   `660f537b-...` depois de um PUT que so mexeu em `observation`).
10. **Validacao de tipo no PUT dispara**: `{"observation": 12345}` -> 400
    `["Informe observações válidas"]`; `{"observation": ["a"]}` -> 400. Campo desconhecido no
    body -> 200 e ignorado (sem whitelist estrita, mas sem efeito colateral).
11. **Validacao de data invalida dispara**: `"2026-02-31T00:00:00.000Z"` -> 400
    `["Informe uma data válida"]`; `"nao-e-data"` -> 400.
12. **GET com `page` alem do fim** -> 200 com lista vazia (sem 500).
13. **`GET /<rota>?page=1` sem `animalId`** -> 400 com mensagem clara
    (`"O campo Animal é obrigatório"`), nos 41.
14. **Rota `reproduction-breedingPregnancy`** foge do padrao kebab-case de todas as outras 40
    (deveria ser `reproduction-breeding-pregnancy`). Nao e bug funcional — a rota responde —
    mas e armadilha para quem for montar cliente novo. Registrado aqui, sem severidade.
