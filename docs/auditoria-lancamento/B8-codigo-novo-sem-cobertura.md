# Bloco 8 — O código novo, que ninguém auditou

Auditoria de leitura de código (nada foi executado). Escopo descoberto por
`git log --since` + `git diff --stat` nos quatro repositórios.

## Escopo real do período

| Repo | Commits (7–8 dias) | Diff |
|---|---|---|
| WEB (`equinology-web-v2`) | 22 | 135 arquivos, +13.230 / −3.161 |
| API (`vetequus-api`) | 12 | 605 arquivos, +20.524 / −4.430 |
| APP (`equinology-app-v2`) | 10 | (não medido em detalhe) |
| ADM (`equinology-adm-v2`) | 2 (só docs) | nenhum código |

O ADM **não recebeu nenhuma linha de código** no período — só os dois documentos
de auditoria. Confirmado: `git log --oneline --since="8 days ago"` devolve
apenas `9d90c5d` (merge) e `0efb97f` (docs).

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado, lendo o código fim a fim

**(a) Odontograma v2**
- `odontogram-model.ts` (parse/serialize v1↔v2, findings, Triadan, `hasPolpa`)
- `odontogram-status.ts` (vocabulário canônico + aliases legados)
- `odontogram-voice.ts` (validação servidor, merge de rascunho, aplicação)
- `OdontogramVoiceReview.tsx` (painel de revisão)
- `OdontogramStudio.tsx` (só os pontos de `STATUS_FILL`/`printMode`/`readOnly`;
  não li os ~1.000 linhas de geometria SVG)
- `lib/pdf/captureOdontogram.ts`, `lib/pdf/OdontogramPdf.tsx`,
  `lib/pdf/ReportDocument.tsx` (bloco do odontograma)
- `app/api/audio/transcribe-to-odontogram/route.ts`
- Rota API: `dentistryOdontogram.controller.ts` + DTO + presenter; ida e volta
  do campo `odontogram` por `boardRecordService.ts:440-463`

**(b) Anotações do proprietário / sharedWithOwner**
- `clientPortal.service.ts`, `clientPortal.controller.ts`, presenters
  (`ownerNoteForClient`, `sharedPrescription`)
- `ownerNote.service.ts` + controller + DTO + migration
- `vet-only.guard.ts`, `auth.guard.ts`, `CurrentTokenType.decorator.ts`,
  registro do `APP_GUARD` — **provei que a checagem de `tokenType` dispara**
  (AuthGuard global grava `request.tokenType`, o login de cliente assina
  `type: 'client'` em `client.service.ts:268,320,340`)
- Filtro `sharedWithOwner: true` nos três repositórios de prescrição
- APP: `app/(animal)/notes.tsx`, `app/(animal)/vet/[appointmentAnimalId].tsx`,
  `lib/api-routes.ts`

**(c) Anexos**
- `attachmentSync.service.ts`, `prismaAttachment.repository.ts`,
  `attachment.ts` (entidade + enum), migration de backfill
  `20260730205553`, migration `20260731122806`
- Varredura mecânica: todo service que chama `attachmentSync.write` também
  aplica `attachmentsSync.legacy` na coluna antiga (única exceção:
  `ownerNote.service.ts`, que não tem coluna legada — correto)
- `services/healthService.ts` (o hack das três chaves)

**(d) Preenchimento por voz**
- `AudioToFormButton.tsx` inteiro, `AudioToFormReview.tsx`,
  `app/api/audio/transcribe-to-form/route.ts`, `components/ui/select.tsx`,
  `ServiceRecords.tsx` (abertura de modal, validação, submit, render de campos)

**(e) PDFs/laudos**
- `servicePdf.tsx` inteiro, `ReportDocument.tsx` (bloco de seções/odontograma),
  `AppointmentReportModal.tsx` (por grep dirigido, não linha a linha)

### NÃO verificado (declaro explicitamente)

- Geometria/`<path>` do `OdontogramStudio.tsx` e
  `odontogram-anatomic-paths.ts` — não conferi se cada dente desenhado
  corresponde ao número Triadan certo. **Um erro de mapeamento aqui produziria
  laudo errado e eu não teria como pegá-lo lendo código.** Precisa de conferência
  visual pelo veterinário.
- `lib/pdf/normalizeLogo.ts`, `logoBox.ts`, `LogoFramer.tsx`,
  `LogoPdfPreview.tsx`, `InvoiceDocument.tsx` (enquadramento de logo nos PDFs) —
  fora do núcleo clínico, não abri.
- As ~40 seções de reprodução/ortopedia individualmente: verifiquei o mecanismo
  genérico (`SECTION_API_CONFIG`), não cada `buildCreateBody`.
- Nada foi executado: sem browser, sem banco, sem gerar um PDF real. Toda
  conclusão é de leitura.
- APP: só as telas de anotação/atendimento compartilhado. Faturas, pagamentos e
  o resto do app ficaram fora deste bloco.
- ADM: sem código novo no período — nada a auditar aqui.

---

## Veredito

**funciona_com_ressalva**, com **um caminho que produz laudo falso-negativo
assinado** (achado 1) e outro que grava dado clínico que o veterinário não
digitou (achado 3).

- **CLÍNICA (web):** consegue marcar o odontograma, ditar, revisar e salvar. O
  laudo sai. Mas se o atendimento tiver **mais de um registro de odontograma**,
  o laudo desenha só o último e pode afirmar por escrito "Nenhum achado
  registrado — todos os dentes avaliados como saudáveis".
- **CLIENTE FINAL (app):** vê a anotação e as prescrições compartilhadas; o
  isolamento está correto (não vaza ficha clínica nem anotação privada do vet).
  Porém **perde todas as anotações que já tinha criado no app** (achado 5).
- **EQUIPE EQUINOLOGY (ADM):** não afetada — o ADM não mudou.

---

## Achados

### 1. [BLOQUEIA_LANCAMENTO] Laudo desenha só o ÚLTIMO odontograma do atendimento e pode declarar "nenhum achado"

**Novo.** Não consta na auditoria anterior (odontograma v2 é terreno virgem).
**Confiança: CONFIRMADO.**

O que quebra: a seção "Odontograma" usa endpoint de LISTA
(`endpointStyle` padrão em `boardRecordService.ts:440`), então o veterinário
pode criar N registros de odontograma no mesmo atendimento — cenário natural se
ele marca a arcada superior, salva, e depois abre outro registro para a
inferior. Na montagem do laudo só o último entra:

`app/(dashboard)/services/_data/servicePdf.tsx:359-366`
```ts
const odontoRecords = recordsForSection(odontoSection.key);
const last = odontoRecords[odontoRecords.length - 1] as ...;
const raw = last?.odontogram;
if (typeof raw === "string" && raw.length > 0) {
  odontogramState = parseOdontogram(raw);
  odontogramFindingList = buildOdontogramFindings(odontogramState);
```

Os demais registros não têm como aparecer por outra via: a definição da seção
(`app/(dashboard)/services/_data/mock.ts:318`) só declara o campo `observation`
— o JSON do desenho **não é um `field`**, logo `fieldsForRecord` nunca o imprime:

```ts
{ key: "dentistry-odontogram", title: "Odontograma", fields: [{ key: "observation", label: "Observação" }] },
```

Consequência no papel: se o último registro estiver vazio (ou for um registro
criado só para escrever uma observação), `odontogramFindingList` fica vazio e o
PDF imprime, em documento assinado:

`lib/pdf/OdontogramPdf.tsx:157-165`
```tsx
if (findings.length === 0) {
  return (... <Text>Nenhum achado registrado — todos os dentes avaliados como saudáveis.</Text> ...)
```

Agravante: a modal "Laudo do atendimento" **não pré-visualiza o odontograma** —
grep por `odonto` em `AppointmentReportModal.tsx` não retorna nada, enquanto
`servicePdf.tsx:384-401` só desenha na geração do PDF. O veterinário assina sem
ver o que saiu.

Correção: agregar TODOS os registros de odontograma do atendimento (mesclar os
estados, ou emitir um bloco por registro com data), e nunca imprimir a frase de
"nenhum achado" quando existir registro de odontograma cujo estado não pôde ser
lido.

---

### 2. [GRAVE] Status de dente não reconhecido é descartado em silêncio — o dente volta a "saudável" no laudo

**Novo.** **Confiança: CONFIRMADO** no mecanismo; **SUSPEITO** quanto a existir
hoje dado com vocabulário fora das duas tabelas de alias.

O bug histórico (rótulo PT no banco → dente preto) **está resolvido nos dois
sentidos**: `parseOdontogram` normaliza (`odontogram-model.ts:66-78`) e o PDF
tem o espelho (`OdontogramPdf.tsx:439-464`). Verifiquei os dois caminhos.

O que sobrou: quando o valor não bate em nenhum alias, ele é **jogado fora**, e
o dente passa a contar como saudável — exatamente o falso-negativo que se quis
evitar, só que sem dente preto para denunciar.

`odontogram-model.ts:74-78`
```ts
const d = normalizeToothStatus(src.d);
const p = normalizeToothStatus(src.p);
if (d && d !== "healthy") marks.d = d;
if (p && p !== "healthy") marks.p = p;
if (marks.d || marks.p) out[id] = marks;   // valor irreconhecível: some
```
`odontogram-status.ts:94-98` devolve `undefined` e o comentário assume que o
chamador vai descartar.

Segundo risco, já materializado: as duas tabelas de alias são cópias manuais e
**já divergem**. `odontogram-status.ts:61-81` tem `"hígido"` (com acento);
`OdontogramPdf.tsx:439-458` não tem. Hoje o efeito é nulo (`hígido` → `healthy`
nos dois casos, por caminhos diferentes), mas o par está livre para divergir em
um alias que importe.

Correção: qualquer valor não reconhecido deve gerar um item explícito no laudo
("Dente 207 · dente · achado não reconhecido: 'desgaste'") em vez de sumir; e as
duas tabelas devem sair de um único módulo compartilhado.

---

### 3. [GRAVE] Voz preenche campos `select` sem validar contra as opções: a tela mostra "Selecione" e o registro salva o texto errado

**Novo** (a auditoria anterior corrigiu isso no *Criar animal*, via
`lib/voice-match.ts`; as ~40 seções da ficha clínica ficaram de fora).
**Confiança: CONFIRMADO** no mecanismo; a frequência depende do modelo.

Cadeia completa:

1. A rota de estruturação instrui o modelo a usar uma das opções, mas **não
   valida a resposta** — `app/api/audio/transcribe-to-form/route.ts:86-106`
   (`normalizeStructuredData`) só remove placeholders; nunca compara com
   `field.options`.
2. O botão aplica o valor cru no formulário —
   `AudioToFormButton.tsx:304`:
   ```ts
   applied[field.key] = str;
   ```
   (o tratamento especial existe só para `type === "date"`, linhas 288-303).
3. O `Select` renderiza pelo *match exato* —
   `components/ui/select.tsx:100-101,326`:
   ```ts
   const selectedOption = options.find((o) => o.value === value);
   const displayValue = selectedOption?.label ?? "";
   ...
   {displayValue || (emptyLabel ?? placeholder)}
   ```
   Valor fora da lista ⇒ a tela mostra **"Selecione"** (parece vazio), mas
   `formData` guarda o texto.
4. A validação de obrigatório olha o `formData`, não a opção —
   `ServiceRecords.tsx:483-489`:
   ```ts
   .filter((f) => f.required && !(formData[f.key] ?? "").trim())
   ```
   ⇒ passa.
5. O `buildCreateBody` da seção manda o valor para a API e o prontuário grava.

Campos atingidos são clínicos e binários: `Diagnóstico Final → Resultado`
(Positivo/Negativo), `Parto → Situação` (Vivo/Morto/Aborto), `Exame Físico →
Sensibilidade` (Sim/Não), `Raio-X` (Sim/Não) — `mock.ts:317,325,407,408,411`.
Um "negativo" minúsculo ou um "Não gestante" devolvido pelo modelo entra no
prontuário com a tela em branco.

Correção: aplicar `lib/voice-match.ts` (já existe no repo) aos campos `select`
do `AudioToFormButton`; o que não casar vira `issue` no resumo, nunca valor.

---

### 4. [GRAVE] `owner-note` é a única ficha nova que não valida a posse do atendimento — nota de uma clínica pode ser entregue ao proprietário de outra

**Novo.** **Confiança: CONFIRMADO** (caminho fecha; exige conhecer um UUID de
`appointment_animals` de terceiro, o que limita a exploração na prática).

Todas as fichas clínicas novas passam por
`clinicalRecordOwnership.service.ts:62-76` (`canWrite` valida **animal E
appointmentAnimal** contra o `companyId` do token) — ex.:
`generalPrescription.service.ts:42-45`.

`ownerNote.service.ts:45-50` valida **só o animal**:
```ts
const animal = await this.animalRepository.findById(animalId);
if (!animal) return left(new ResourceNotFoundError());
if (animal.companyId !== companyId) return left(new NotAllowedError());
const existing = await this.ownerNoteRepository.findByAppointmentAnimalId(appointmentAnimalId);
```
O `appointmentAnimalId` vem do path (`ownerNote.controller.ts:18-28`) e nunca é
conferido. Se ainda não existir nota para aquele atendimento, a linha é criada
com `companyId` da clínica A e `appointmentAnimalId` da clínica B.

O impacto se realiza porque a leitura do app **não** filtra por empresa —
autoriza por dono do animal (`clientPortal.service.ts:69-84`) e devolve a nota
encontrada por `appointmentAnimalId`. Ou seja: texto escrito pela clínica A
aparece no aplicativo do proprietário da clínica B.

Correção: injetar `ClinicalRecordOwnershipService` no `OwnerNoteService.upsert`,
como nas demais fichas.

---

### 5. [GRAVE] Migration marca todas as anotações existentes como do veterinário — o proprietário perde no app tudo o que já tinha escrito

**Novo.** **Confiança: CONFIRMADO.**

Antes, o app escrevia na mesma tabela `animal_notes` pela rota do veterinário —
`git show 6bcfef8:"app/(animal)/notes.tsx":38`:
```ts
const res = await GetAPI(ApiRoutes.AnimalNote.byAnimal(animalId));
```

A migration `prisma/migrations/20260731122806_owner_notes_prescription_sharing_animal_note_author/migration.sql`
cria a coluna com `DEFAULT 'VET'` e assume a autoria (o próprio arquivo
documenta a assunção):
```sql
ALTER TABLE "animal_notes" ADD COLUMN "authorType" "AnimalNoteAuthorType" NOT NULL DEFAULT 'VET',
```

E o app passou a ler apenas `OWNER` — `clientPortal.service.ts:127-129`:
```ts
const animalNotes = await this.animalNoteRepository.findManyByAnimalId(animalId, 'OWNER');
return right({ animalNotes: animalNotes.filter((note) => note.clientId === clientId) });
```
(`clientId` também é NULL nas linhas antigas, então o filtro as elimina de
qualquer forma.)

Resultado para a persona CLIENTE FINAL: no dia do lançamento, todas as
anotações que ele escreveu somem do aplicativo — sem aviso, sem tela de
"arquivadas". E passam a ser exibidas ao veterinário como se fossem dele
(`animalNote.service.ts:110` lê `'VET'`).

Correção: ou um backfill que reclassifique por origem conhecida, ou um aviso na
tela do app, ou (se não há como distinguir) uma decisão consciente do dono —
mas registrada, porque é perda de dado visível ao cliente.

---

### 6. [MENOR] Páginas de demonstração/conferência acessíveis sem login em produção

**Novo.** **Confiança: CONFIRMADO.**

`middleware.ts:68-91` — o `matcher` não inclui `/odontograma-novo`,
`/odontograma-novo-v2`, `/odontograma-pdf-check` nem `/logo-pdf-check`, todas
criadas neste período (`app/odontograma-novo/page.tsx`,
`app/odontograma-novo-v2/page.tsx`, `app/odontograma-pdf-check/page.tsx`,
`app/logo-pdf-check/page.tsx`). Qualquer visitante abre.

Não expõem dado de cliente (trabalham com estado fabricado), mas ficam
indexáveis e carregam o bundle do odontograma. Removê-las do build (ou pô-las
atrás do middleware) é trabalho de minutos.

---

### 7. [MENOR] Preenchimento por voz de CAMPOS não pede confirmação (o do odontograma pede)

**Novo.** **Confiança: CONFIRMADO.**

`AudioToFormButton.tsx:307-315` grava direto no formulário
(`setFormData(prev => ({...prev, ...applied}))`) e o resumo
(`AudioToFormReview`) só lista **o que ficou de fora** — nunca o que entrou. Já
o odontograma exige o botão "Aplicar N marcações"
(`OdontogramVoiceReview.tsx:216-224`).

Mitigação real: os valores ficam visíveis nos campos antes de salvar. Vira
problema de verdade quando combinado com o achado 3, em que o campo aparenta
estar vazio.

---

### 8. [MENOR] `normalizeSpokenStatus` casa por palavra solta — "sem gancho" vira "Gancho"

**Novo.** **Confiança: CONFIRMADO** no código; **SUSPEITO** na prática (depende
de o modelo devolver a frase inteira no campo `status`).

`odontogram-voice.ts:239-244`
```ts
// tolera frases curtas: "com gancho", "dente fraturado"
for (const token of text.split(" ")) {
  if (STATUS_ALIASES[token]) return STATUS_ALIASES[token];
```
Não há tratamento de negação. "sem gancho" / "não fraturado" produziriam a
marcação afirmativa. O painel de revisão mostra o `heardAs`, então o
veterinário tem como pegar antes de aplicar — por isso MENOR e não GRAVE.

---

### 9. [MENOR] Migration adiciona dois valores de enum num arquivo só (falha em PostgreSQL ≤ 11)

**Novo.** **Confiança: SUSPEITO** — depende da versão do Postgres em produção,
que não consegui determinar.

`20260731122806.../migration.sql` traz o próprio aviso gerado pelo Prisma e,
em seguida:
```sql
ALTER TYPE "AttachmentRecordType" ADD VALUE 'DENTISTRY_PRESCRIPTION';
ALTER TYPE "AttachmentRecordType" ADD VALUE 'OWNER_NOTE';
```
Em PG 12+ isso passa (os valores não são usados na mesma transação). Em PG 11 ou
anterior, o `migrate deploy` **falha** e o lançamento para. Verificar a versão
do servidor antes do deploy.

---

## O que verifiquei e está CORRETO (para não gerar retrabalho)

- **Retrocompatibilidade v1→v2 do odontograma:** `parseOdontogram` aceita
  `{"207":"hook"}` e `{"v":2,"t":{...}}` (`odontogram-model.ts:51-85`); o PDF
  reimplementa o mesmo aceite (`OdontogramPdf.tsx:485-518`). Registros antigos
  abrem.
- **Captura do desenho para o PDF:** tem guarda contra PNG vazio (mede
  `offsetWidth/offsetHeight`, `captureOdontogram.ts:134-140`), contra dataUrl
  inválido (`:177-181`) e retry sem fontes embutidas (`:169-175`). Se a captura
  falhar, o laudo cai para o esquema Triadan **com aviso impresso**
  (`servicePdf.tsx:387-400`, `ReportDocument.tsx:293-307`) — não omite em
  silêncio.
- **Validação do ditado do odontograma no servidor:** dente fora do Triadan,
  achado fora do vocabulário e polpa em dente sem polpa vão para `unrecognized`
  com motivo em português (`odontogram-voice.ts:302-351`) e são mostrados ao
  veterinário (`OdontogramVoiceReview.tsx:181-210`). Nada é aplicado sem o
  clique em "Aplicar".
- **Isolamento do portal do cliente:** `assertOwnsAnimal` por `clientId` em toda
  leitura; prescrições filtradas por `sharedWithOwner: true` nos três
  repositórios; presenters sem `companyId`/`userId`. **Anotação privada do
  veterinário não vaza para o proprietário** — a rota `/animal-note` recusa
  token de cliente (`VetOnlyGuard`), e `/client-portal/.../animal-note` filtra
  `authorType = 'OWNER'` **e** `clientId` do token.
- **A checagem de `tokenType` realmente dispara:** `AuthGuard` é `APP_GUARD`
  global (`app.module.ts:27-30`), grava `request.tokenType = payload.type`
  (`auth.guard.ts:40`), e o login de cliente assina `type: 'client'`
  (`client.service.ts:268,320,340`). Guards de rota rodam depois do global.
- **Dual-write dos anexos:** varredura mecânica confirma que todo service que
  chama `attachmentSync.write` também grava a coluna legada
  (`if (attachmentsSync.changed) record.fileUrl = attachmentsSync.legacy`); a
  única exceção é `ownerNote.service.ts`, que nasceu sem coluna legada. O
  `replaceForRecord` é transacional (`prismaAttachment.repository.ts:39-58`), e
  o `hydrate` só cai para a coluna antiga quando não há linha na tabela nova.
  **Não encontrei caminho em que as duas fontes divirjam.**
- **`sharedWithOwner`:** default `false` no schema, `false` explícito ao criar
  (`ServiceRecords.tsx:415`), enviado sempre no create e no edit
  (`boardRecordService.ts:344,348`), e o service distingue `undefined` de
  `false` (`generalPrescription.service.ts:123`).
- **Prescrições não entram no laudo:** o filtro `/prescri/i` cobre os três
  títulos reais, todos "Prescrições" (`mock.ts:312,321,330`).

---

## Dúvidas em aberto

1. **O mapeamento dente↔Triadan do desenho está certo?** Não conferi as ~700
   linhas de `odontogram-anatomic-paths.ts` / geometria do `OdontogramStudio`.
   Se um `<path>` estiver associado ao número errado, todo o resto que auditei é
   irrelevante — o laudo sai errado. Só um veterinário olhando a tela resolve.
2. **Existe hoje, no banco de produção, algum status de dente fora das duas
   tabelas de alias?** O comentário do código cita `"ponta"` e `"ok"` como casos
   reais, mas não tenho acesso ao banco. Uma query
   (`SELECT DISTINCT ... FROM dentistry_odontograms`) fecharia o achado 2.
3. **Quantas anotações de proprietário existem hoje em `animal_notes`?** É o que
   dimensiona o achado 5 — pode ser irrelevante (base nova) ou perda visível.
4. **Versão do PostgreSQL em produção** (achado 9).
5. **O `Select` com valor fora das opções realmente chega a acontecer com o
   Gemini 2.5 Flash?** O mecanismo está confirmado; a taxa de disparo não —
   exigiria rodar o fluxo de voz de verdade.
6. Não determinei se a UI oferece explicitamente "adicionar outro odontograma"
   ao mesmo atendimento (achado 1). O endpoint e o `boardRecordService` são de
   lista, e o `openCreateModal` é genérico, então o caminho existe; não abri o
   JSX do botão por seção.
