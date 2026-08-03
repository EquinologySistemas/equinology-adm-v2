# F3-anexos-e-arquivos

Auditoria executada contra a API rodando em `http://localhost:3333` em 02/08/2026.
Empresa isolada criada para o teste: `Clinica F3 1785693339276` (companyId `b19c5017-e4db-4b61-a545-39d672544375`).
Empresa secundaria para teste de isolamento: `Clinica B` (companyId `969a8b74-0734-4203-b2e0-d9dcea674e71`).
Nenhum arquivo `.ts` foi alterado.

## Cobertura: 6 / 6 rotas do conjunto

| Rota | Metodo | Testada |
|---|---|---|
| `/file` | POST | sim |
| `/ads/sponsors` | GET (publica) | sim |
| `/ads` | GET (token empresa) | sim |
| `/ads/client` | GET (token cliente) | sim |
| `/tutorials` | GET (publica) | sim |
| `/coupons/validate/:code` | GET (publica) | sim |

Comportamento de anexo nas fichas: testado de ponta a ponta em `/exam`,
`/dentistry-exam`, `/owner-note` (as tres variantes que existem: coluna legada
`resultFileUrl`, coluna legada `fileUrl`, e ficha sem coluna legada). As outras
43 fichas usam exatamente o mesmo `AttachmentSyncService` e o mesmo DTO, entao
os achados de anexo valem para todas; o que **nao** foi exercitado rota a rota
foi o CRUD completo das 43 (fora do meu conjunto).

### Nao testado / ficou de fora
- Upload real de video (mp4 valido) acima de 25 MB e abaixo de 100 MB: so testei
  o limite (110 MB rejeitado). Nao subi video valido grande para nao poluir o bucket.
- DoS por buffer em memoria: **nao reproduzi** um upload de 500 MB+ para nao
  derrubar a API compartilhada com os outros agentes. Fica como SUSPEITO (achado 8).
- Rotas `admin/ads`, `admin/tutorials`, `admin/coupons`: nao ha senha do admin
  (`admin@teste.com`) e nenhuma das que tentei funcionou; os dados de anuncio,
  tutorial e cupom foram semeados por SQL direto e removidos ao final.
- Portal do cliente (`clientPortal`) lendo anexos: nao testei com token de cliente real.
- Nao existe rota para apagar/listar um anexo individual — a unica forma e
  reenviar a lista inteira no PUT da ficha. Isso e design, nao bug, mas anotado.

---

## Achados

### 1. BLOQUEIA — `DELETE /appointment/:id` sempre devolve 500; e impossivel excluir um atendimento
**Confianca: CONFIRMADO**

A FK `appointment_animals_appointmentId_fkey` esta como RESTRICT (`confdeltype = 'r'`)
e o service deleta o `appointment` sem antes remover os `appointment_animals`.
Como todo atendimento nasce com pelo menos um animal, a exclusao falha 100% das vezes.

Reproducao:
```
POST /appointment {"type":"SERVICE","startDate":"2026-09-05T13:00:00.000Z",
  "endDate":"2026-09-05T14:00:00.000Z","userId":"<u>","studFarmId":"<s>",
  "animals":[{"animalId":"<a>","appointmentType":"Consulta"}]}   -> 201
GET /appointment/fetch?page=1  -> pega o id
DELETE /appointment/<id>  -> 500 "Nao foi possivel concluir a operacao..."
```
Evidencia (banco, apos o DELETE): a linha continua em `appointments`.
```
select conname, confdeltype from pg_constraint where confrelid='appointments'::regclass;
 appointment_animals_appointmentId_fkey | r
```
Testado com atendimento vazio (sem nenhuma ficha) e com atendimento com fichas:
500 nos dois casos. Nao e o vinculo de ficha — e o proprio `appointment_animal`.
Impacto: o usuario nunca consegue apagar um atendimento errado. E, como o
atendimento nao morre, o cenario de anexo orfao por cascade nao chega a existir.

### 2. GRAVE — Autoria do anexo (`uploadedBy`) e do responsavel da ficha vem do body, nao do JWT: da para forjar com usuario de OUTRA empresa
**Confianca: CONFIRMADO**

`ExamService.edit` repassa o `userId` do corpo direto para
`attachmentSync.write(..., userId)` e para `exam.userId`. Nao ha checagem de que
esse usuario pertence a empresa do token.

Reproducao (token da empresa `b19c5017`, userId de usuario da empresa `f4e2f01e`):
```
PUT /exam/e7244d6f-2a6a-4a4a-bb21-01f9bd11afdd
{"userId":"41514ceb-4ae4-4491-a431-e7a5fccfc5c7",
 "attachments":[{"url":"https://cdn/forjado.pdf"}]}   -> 200
```
Evidencia (banco):
```
select a.url, a."uploadedBy", u."companyId" from attachments a
  left join users u on u.id = a."uploadedBy" where a.url='https://cdn/forjado.pdf';
 https://cdn/forjado.pdf | 41514ceb-... | f4e2f01e-49fb-4ccd-b02c-df1d645aeca5

select e."userId", u."companyId" as user_company, an."companyId" as animal_company
  from exams e join animals an on an.id=e."animalId" left join users u on u.id=e."userId"
  where e.id='e7244d6f-...';
 41514ceb-... | f4e2f01e-... | b19c5017-...
```
O exame da empresa A ficou gravado com veterinario responsavel de outra empresa.
Impacto: trilha de auditoria de anexo falsificavel e referencia cruzada entre
tenants gravada em banco. Em ficha clinica isso e assinatura de responsabilidade.

**Efeito colateral confirmado:** se o PUT nao mandar `userId`, o `uploadedBy` do
anexo vira `null` — a autoria e simplesmente perdida em toda edicao parcial.
Reproduzido: `PUT /exam/<id> {"attachments":[{"url":"https://cdn/autor2.pdf"}]}`
grava `uploadedBy = NULL`. No banco hoje ja ha 324 anexos com `uploadedBy` nulo.

### 3. GRAVE — As duas fontes de anexo divergem quando a URL contem `\n`
**Confianca: CONFIRMADO**

O formato legado concatena as URLs com `\n`. O `AttachmentSyncService.resolve`
so faz `url.trim()` — nao rejeita quebra de linha no meio da URL. Resultado: a
tabela `attachments` guarda 1 anexo, a coluna legada guarda uma string que, lida
pelo parser legado, vira 2 anexos.

Reproducao:
```
PUT /exam/<id> {"attachments":[{"url":"https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf"}]}  -> 200
GET /exam/<animalId>?page=1
  attachments        -> 1 item  ("https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf")
  resultFileUrl      -> "https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf"
  split('\n')        -> 2 itens
```
Impacto: qualquer consumidor que ainda leia a coluna escalar (o presenter
devolve `resultFileUrl`/`fileUrl` cru para o front, e o fallback `legacyViews`
usa exatamente esse split) enxerga um anexo fantasma que nao existe na tabela
nova. Se a fase EXPAND for revertida, o dado volta corrompido.

### 4. GRAVE — A allowlist de mimetype do upload confia no que o cliente declara: da para subir binario arbitrario com extensao `.exe`
**Confianca: CONFIRMADO**

`FileController` valida apenas `file.mimetype` (vindo do header do multipart) e
o `R2Storage` monta a key preservando a extensao **original** do nome enviado.
Nao ha checagem de magic bytes nem coerencia entre extensao e mimetype.

Reproducao:
```
POST /file  (multipart)
  file: nome="mal.exe", Content-Type declarado="image/png", conteudo="MZ\x90\x00 EXECUTAVEL"
-> 201 {"url":"mal-a6841197.exe",
        "fullUrl":"https://pub-a4f3763969d34f86b87fd3d880941bfc.r2.dev/mal-a6841197.exe"}
```
Evidencia: `curl -I` na fullUrl devolve **200**, sem nenhuma autenticacao.
Impacto: a API vira hospedagem publica de binario arbitrario sob o dominio do
produto. Bloquear SVG e HTML (que a rota faz corretamente) nao adianta enquanto
o mimetype for a unica fonte de verdade.

### 5. GRAVE — Anexo de ficha clinica fica publico e para sempre no storage; excluir a ficha nao apaga o arquivo
**Confianca: CONFIRMADO**

O bucket e o R2 publico (`pub-a4f3763969d34f86b87fd3d880941bfc.r2.dev`). Nao ha
URL assinada, nao ha checagem de empresa, nao existe `DeleteObjectCommand` em
lugar nenhum do codigo (`grep -rn "DeleteObjectCommand\|deleteObject" src/` = 0 ocorrencias).

Reproducao:
1. `POST /file` com um PDF -> `fullUrl`.
2. Vincular esse url a uma ficha, depois `DELETE` da ficha.
3. A linha some de `attachments` (isso funciona, ver "O que passou"), mas
   `curl <fullUrl>` continua devolvendo **200** — para qualquer pessoa da internet,
   sem token, de qualquer empresa.

A key e `<slug-do-nome-original>-<8 hex>.<ext>`. Como o slug preserva o nome que
o usuario enviou (`exame-hemograma-a1b2c3d4.pdf`), o espaco de busca por arquivo
com nome previsivel e 2^32 — e nao ha rate limit no R2 publico.
Impacto: laudo, exame e receituario de paciente acessiveis sem autenticacao, e
"apagar" no sistema nao apaga de fato.

### 6. GRAVE — Path param com UUID malformado devolve 500 cru em todas as rotas de ficha
**Confianca: CONFIRMADO**

Nao ha `ParseUUIDPipe` nem validacao de formato; o erro do Postgres
(`invalid input syntax for type uuid`) sobe como INTERNAL_SERVER_ERROR.

Reproduzido em 10 rotas, todas com `abc` no lugar do uuid:
```
GET    /exam/abc?page=1                 -> 500
PUT    /exam/abc                        -> 500
DELETE /exam/abc                        -> 500
GET    /owner-note/abc                  -> 500
POST   /owner-note/abc                  -> 500
PUT    /owner-note/record/abc           -> 500
DELETE /owner-note/record/abc           -> 500
GET    /dentistry-exam?page=1&animalId=abc -> 500
POST   /dentistry-exam/abc              -> 500
DELETE /dentistry-exam/abc              -> 500
GET    /vaccine/abc?page=1              -> 500
DELETE /vaccine/abc                     -> 500
GET    /deworming/abc?page=1            -> 500
```
Bonus na mesma familia: `GET /exam/<animalId>?page=-1` -> **500**
(page negativa vira `skip` negativo no Prisma). Ja `page=abc` -> 400 correto e
`page=999` -> 200 com lista vazia.

### 7. GRAVE — `GET /coupons/validate/:code` e publica, sem rate limit, e diferencia "existe" de "nao existe"
**Confianca: CONFIRMADO**

Codigo inexistente -> **404**. Codigo existente porem invalido (expirado,
inativo, esgotado, ainda nao vigente) -> **200** com `isValid:false`.
Ou seja: o proprio status HTTP entrega se o cupom existe.

Reproducao (sem nenhum token):
```
GET /coupons/validate/NAOEXISTE   -> 404
GET /coupons/validate/F3INATIVO   -> 200 {"isValid":false,...}
GET /coupons/validate/F3OK        -> 200 {"isValid":true,"coupon":{...}}
```
Sem throttle: 150 requisicoes concorrentes em 194 ms, todas 200.
Alem disso, para um cupom valido a rota devolve o objeto inteiro pelo
`CouponPresenter`, incluindo `id`, `maxUsages` e `currentUsages` — informacao
comercial interna exposta publicamente.
Impacto: qualquer um enumera a base de cupons por forca bruta e descobre
descontos ativos e quantas vagas restam.

### 8. GRAVE (SUSPEITO) — O arquivo e bufferado inteiro em memoria antes de qualquer validacao de tamanho
**Confianca: SUSPEITO** (nao reproduzi o cenario extremo de proposito)

`@UseInterceptors(FileInterceptor('file'))` nao recebe `limits: { fileSize }`.
O `MaxFileSizeValidator` do `ParseFilePipe` so roda **depois** que o multer ja
montou o `Buffer` completo. Indicio observado: o envio de 110 MB levou 326 ms e
so entao voltou 400 — o corpo inteiro foi recebido e alocado.
Nao disparei um upload de varias centenas de MB porque a API e compartilhada com
os outros agentes desta auditoria e um OOM derrubaria todos.
Impacto provavel: N uploads grandes simultaneos estouram a heap do processo.

### 9. MENOR — Anuncio REGIONAL aparece na vitrine publica nacional
**Confianca: CONFIRMADO**

`GET /ads/sponsors` (publica, sem token) chama `fetchActive()`, que nao aplica
nenhum filtro de localizacao. Um anuncio com `scope: REGIONAL` e `targetStates:["SP"]`
aparece no site institucional para o Brasil inteiro.
```
GET /ads/sponsors -> ["F3 Ad RJ|REGIONAL", "F3 Ad SP|REGIONAL", "F3 Ad Global|GLOBAL"]
```
Comparar com `GET /ads` (com token), que filtra corretamente. Pode ser
intencional para a LP, mas quem paga anuncio regional esta sendo exibido fora da
regiao contratada — vale confirmar com o dono antes do lancamento.

### 10. MENOR — Mensagens de erro em ingles em duas situacoes de anexo/upload
**Confianca: CONFIRMADO**

```
POST /file sem nenhum arquivo
  -> 400 {"message":"File is required"}
PUT /exam/<id> {"attachments":[null]}
  -> 400 {"message":["each value in nested property attachments must be either object or array"]}
PUT /exam/<id> {"attachments":"nao-e-array"}
  -> 400 {"message":["Informe uma lista de anexos valida",
                     "each value in nested property attachments must be either object or array"]}
```
O resto das mensagens de upload esta correto e em portugues.

### 11. MENOR — `url` do anexo aceita qualquer string; sem limite de quantidade e sem limite de tamanho
**Confianca: CONFIRMADO**

`AttachmentDto.url` so tem `@IsString` + `@IsNotEmpty`. Aceito e gravado sem
reclamar:
```
PUT /exam/<id> {"attachments":[{"url":"javascript:alert(1)"},
                               {"url":"nao-e-url"},
                               {"url":"XXXX...5000 chars"}]}  -> 200
GET de volta: os tres voltam intactos (5000 chars inclusive)
```
E nao ha teto de quantidade: `POST /exam` com **500 anexos** -> 201, e o GET
devolve os 500 (mais a coluna legada com as 500 URLs concatenadas em um unico campo).
Impacto: se o front renderizar `<a href={anexo.url}>` sem sanitizar, `javascript:`
vira XSS armazenado. Nao validei o front, por isso a URL perigosa fica registrada
aqui como problema de contrato da API, nao como XSS confirmado.

### 12. MENOR — `POST /file` aceita arquivo de 0 byte
**Confianca: CONFIRMADO**

`POST /file` com PNG de tamanho 0 -> 201, arquivo publicado no bucket.
Nao ha `MinFileSizeValidator`. Gera anexo vazio na ficha.

### 13. MENOR — `GET /ads/client` aceita token de usuario da clinica (deveria ser token de cliente)
**Confianca: CONFIRMADO**

A rota usa `@CurrentUserId()` e busca `clientCompany where clientId = <sub do JWT>`.
Com o token de um usuario (veterinario), `sub` e um `userId`, a busca nao acha
nada e a rota devolve 200 com os anuncios GLOBAL em vez de 401/403.
```
GET /ads/client  (Bearer de usuario da clinica) -> 200 {"advertisements":[GLOBAL]}
```
Nao vaza dado de ninguem — apenas aceita silenciosamente o tipo errado de token.

---

## O que passou (nao precisa reauditar)

**`POST /file` — validacao de tipo e tamanho**
- `image/png` e `application/pdf` validos -> 201 com `url` + `fullUrl`.
- Tipo proibido -> 400 com mensagem clara em portugues listando os aceitos:
  `application/x-msdownload`, `application/octet-stream`, `image/svg+xml`, `text/html` — todos 400.
- Limite por tipo dispara de fato (provei, nao so li o codigo):
  imagem 16 MB -> 400 "maximo para este tipo e 15 MB";
  pdf 26 MB -> 400 "...25 MB"; video 110 MB -> 400 "...100 MB".
- `IMAGE/PNG` em maiusculo -> aceito (normalizacao case-insensitive funciona).
- Nome com `../../../etc/passwd.png` -> sanitizado para `passwd-<hash>.png`, sem traversal.
- Nome de 500 chars -> truncado em 80, sem erro.
- Sem arquivo -> 400. Sem token -> 401.
- Colisao de nome: dois uploads do mesmo arquivo geram keys distintas, sem sobrescrita.

**Dual-write / dual-read dos anexos (o mecanismo em si esta correto)**
- Criar com `attachments[]` grava a tabela nova E a coluna legada no formato
  `url1\nurl2`. Confirmado por SQL em `exams.resultFileUrl`.
- Mandar `attachments` e `resultFileUrl` no mesmo request: `attachments` vence e
  a coluna legada e reescrita a partir dele — nao ficam divergentes.
- Mandar so o campo legado (`resultFileUrl: "a\nb"`): a tabela nova e populada
  com 2 linhas, na ordem certa. Volta e meia funciona nos dois sentidos.
- Editar outro campo sem citar anexo: os anexos ficam intactos (o `changed:false`
  realmente funciona — a distincao entre "nao mandei" e "mandei vazio" e respeitada).
- `attachments: []` limpa os dois lados: tabela zerada e coluna legada vira NULL.
- Ordem (`order`) preservada na leitura.
- `OWNER_NOTE` (ficha sem coluna legada) grava e le so pela tabela nova, correto.

**Limpeza de anexo ao excluir a ficha**
- `DELETE /exam/<id>`: 2 anexos antes -> 0 depois (SQL).
- `DELETE /dentistry-exam/<id>` e `DELETE /owner-note/record/<id>`: idem, 0 linhas
  restantes em `attachments`.
- 45 dos 46 services que usam `attachmentSync` chamam `deleteFor` no delete; o
  unico que nao chama (`clientPortal.service.ts`) e so leitura, entao esta certo.
  (A sobra fica no storage — ver achado 5 — mas o banco nao deixa orfao.)

**Isolamento entre empresas nas fichas com anexo**
Com o token da empresa B, contra recurso da empresa A:
- `GET /exam/<animalId de A>?page=1` -> 403, mensagem clara em portugues.
- `PUT /exam/<id de A>` -> 403 e **nada mudou** (conferido por GET depois).
- `DELETE /exam/<id de A>` -> 403 e o exame continua no banco.
- `POST /exam` apontando para animal de outra empresa -> 403.

**Validacao do `AttachmentDto`**
- `size: -5` -> 400 "O campo size deve ser no minimo 0."
- `size: "abc"` -> 400 "Informe um tamanho de arquivo valido"
- anexo sem `url` / `url: null` -> 400 "O campo URL do anexo e obrigatorio"
- `attachments` como string -> 400.

**`GET /tutorials`** (publica) — devolve so `isActive: true`; o tutorial inativo
nao aparece. Aliases `videoUrl`/`fileUrl` preenchidos conforme o `type`
(VIDEO -> videoUrl, PDF -> fileUrl), `chapters` vem como array. Lista vazia
responde `{"tutorials":[]}` com 200, sem quebrar.

**`GET /ads`** (com token) — a segmentacao por CEP funciona de verdade e degrada bem:
| postalCode da empresa | anuncios devolvidos |
|---|---|
| `01310100` (SP) | F3 Ad SP + Global |
| `22041001` (RJ) | F3 Ad RJ + Global |
| `''` (vazio) | so Global |
| `abc` (lixo) | so Global |
| `00000000` (inexistente) | so Global |
Nenhum 500 em nenhum caso. Anuncio inativo e anuncio com `validUntil` no passado
nunca aparecem, nem em `/ads` nem em `/ads/sponsors`. `GET /ads` sem token -> 401.

**`GET /coupons/validate/:code`** — a logica de validade esta correta e disparou
em todos os casos que montei: expirado, inativo, esgotado (`currentUsages >= maxUsages`)
e ainda nao vigente (`validFrom` futuro) -> todos `isValid:false`.
Cupom valido PERCENT e FIXED devolvem o desconto certo.
Normalizacao funciona: `f3ok` e ` F3OK ` acham `F3OK`.
Entradas hostis nao quebram: `' OR 1=1 --`, `../../user`, `%00`, string de 2000
chars -> todas 404 limpo, nenhum 500, nenhum vazamento de SQL.
