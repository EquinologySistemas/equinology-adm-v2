# Bloco 3 — Persona CLÍNICA: cadastros e operação do dia a dia

Auditoria fim a fim WEB (`equinology-web-v2`) ↔ API (`vetequus-api`) ↔ Prisma.
Nenhum arquivo de produção foi alterado. Data: 02/08/2026.
API em `main` HEAD `4dc4607`; WEB e ADM conforme working tree lido.

---

## Cobertura — o que EU verifiquei e o que NÃO verifiquei

### Verificado lendo o código (fim a fim)

**a) Cliente**
- `CreateOwnerSheet.tsx` (criar/editar/visualizar) → `POST/PUT /client` → `client.controller.ts` → `client.service.ts` → `prismaClient.repository.ts` → `model Client` no schema.
- Listagem e paginação: `ClientsTable.tsx` → `GET /client` → `fetchByCompanyId`/`countByCompanyId`.
- Exclusão: procurei em todo `app/(dashboard)/clients-equines/` e no `GlobalContext`.
- Soft delete: `deletedAt` no schema, no entity, no mapper e em todos os repositórios/serviços (grep global).

**b) Propriedade (stud farm)**
- `NewPropertySheet.tsx` e `EditPropertySheet.tsx` → `POST/PUT /stud-farm` → `studFarm.controller.ts` → `studFarm.service.ts` → `prismaStudFarm.repository.ts` → `model StudFarm`.
- Escopo de posse por empresa (`companyScope`) e por cliente (`clientScope`), incluindo `belongsToCompany`.
- CEP: ViaCEP no front, DTO, presenter e schema.

**c) Animal**
- `CreateAnimalSheet.tsx` (criar / editar / criar aninhado com `onSuccess`) → `POST/PUT /animal` → `animal.controller.ts` (rastreei `finalClientId` linha a linha) → `animal.service.ts` → `prismaAnimal.repository.ts` → `model Animal`.
- Foto (`uploadFile` → `photoUrl`), presenters `animal.presenter.ts` e `animalDetails.presenter.ts`.
- Vínculo por código (`getByCode`, `registerByCode`) e regeneração do `code` no edit.

**d) Atendimento**
- `NewAppointmentSheet`, `EditAppointmentSheet`, `ChangeAppointmentStatusSheet` → `appointment.controller.ts` → `appointment.service.ts` (`create`, `edit`, `rescheduleSplit`).
- Múltiplos animais: `AppointmentAnimal` no `edit` (deleteMany + createMany).

**e) Fichas clínicas**
- Inventário completo das 46 seções de `app/(dashboard)/services/_data/mock.ts` cruzado com as 43 entradas de `SECTION_API_CONFIG` (`services/boardRecordService.ts`).
- Cruzamento automatizado, seção por seção, de **cada campo do formulário** contra o `Create<...>Dto` correspondente em `api/src/infra/http/controllers/animal/dto/**` (script de varredura escrito para esta auditoria; resultados reconferidos manualmente em `generalTest`, `dentistryOral`, `orthopedicService`, `reproductionDonorGyno`, `reproductionDonorInsemination`, `reproductionStallionCollection`).
- Fluxo de submit em `ServiceRecords.tsx` (validação de required, bloqueio de seção sem endpoint, montagem do body, anexos).
- Paginação/ordenação: `fetchAllRecords` no front e `orderBy`/`take` nos repositórios da API.

**f) Estoque**
- `AddStockEntrySheet`, `StockOutputSheet`, `SendGeneralToVolanteSheet`, `SendVolanteToGeneralSheet` → `fieldStock.service.ts`, `productUsage.service.ts`, `stockMovement.service.ts`, `productStock.service.ts`, `model FieldStock`.

**g) CRM**
- `CrmKanban.tsx`, `KanbanColumn.tsx`, `CrmKpis.tsx`, `CreateLeadModal.tsx`, `services/crm/*` → `/board` e `/lead` → `prismaBoard.repository.ts`, `prismaLead.repository.ts`.

### NÃO verificado (declarado explicitamente)

- **Odontograma v2** — só constatei que `dentistry-odontogram` tem config e que `ServiceRecords` carrega `record.odontogram` como JSON string. Não abri o componente de desenho nem validei o round-trip do JSON. **Terreno virgem, sem cobertura.**
- **Preenchimento por voz** (`AudioToFormButton` e a rota de áudio da API) — fora do escopo de tempo. Não reverifiquei os achados F5 da auditoria anterior.
- **Tabela de anexos (`Attachment`)** — verifiquei apenas que `attachments[]` é enviado e lido; não auditei o backfill, o dual-write nem o comportamento com PDFs.
- **Anotações do proprietário (`owner-note`)** — verifiquei só o transporte singleton no `boardRecordService`; não abri o controller/service da API nem o consumo no APP.
- **Laudo/PDF** e a exportação (bloco de outra auditoria).
- **Financeiro** (movimentações, faturas, KPIs) — fora deste bloco.
- **Calendário** (`MonthView`/`DayView`/`WeekView`, `onSelectSlot`) — não reabri; o achado F9 anterior segue sem reverificação.
- Não executei nada: sem banco, sem chamadas HTTP reais. Tudo é leitura de código.
- Das ~46 seções de ficha, li **integralmente** a config de 12 e os DTOs de 8; as demais foram cobertas pelo cruzamento automatizado + amostragem. O padrão é sistêmico e idêntico, mas assumo que a contagem exata por seção pode variar em 1–2 campos.

---

## Veredito

**Quebrado.**

A persona CLÍNICA **não consegue completar o fluxo central do produto** — registrar uma ficha clínica preenchendo só o que examinou. Em pelo menos 28 das 43 seções com endpoint, deixar em branco um campo que a própria tela **não marca como obrigatório** resulta em HTTP 400 com lista de erros técnicos. O Exame Físico Geral (a ficha mais usada) exige Temperatura, FC, FR, Peso e Mucosa — nenhuma marcada na tela.

Além disso:
- 5 seções de reprodução **não têm onde salvar** (não sobrevivem a nada, nem ao submit).
- Editar o CPF de um cliente **não salva** e o sistema diz que salvou.
- Propriedade criada sem cliente fica **visível e editável por todas as outras clínicas** do sistema.
- CRM mostra no máximo 10 leads por coluna e conta errado o total.

O que funciona bem: criação/edição de animal (com cliente), estoque (entrada, saída, transferência, validação de saldo), paginação e ordenação das fichas, isolamento multi-tenant dos animais e das fichas.

---

## Achados

---

### A1 · Fichas clínicas: campo em branco que a tela não marca como obrigatório devolve 400 — em ~28 seções

**Severidade: BLOQUEIA_LANCAMENTO** · Novo (a auditoria anterior via só casos isolados: "back é obrigatório", "Coletas de Envio", "Editar Avaliação Periodontal". É um padrão sistêmico, não 3 casos.)

**O que quebra na prática:** o veterinário abre "Exame Físico" no atendimento, digita Temperatura e Observação — que é o uso real — e clica Salvar. Volta um toast com `O campo Freq. Cardíaca é obrigatório, O campo Freq. Respiratória é obrigatório, O campo Mucosa é obrigatório, O campo Peso é obrigatório`. Nenhum desses campos tem asterisco, aviso ou borda. O registro não é criado. O dado não existe nem em memória.

**Cadeia confirmada:**

1. `ServiceRecords.tsx:405-410` inicializa **todo** campo da seção como string vazia:
```ts
const empty: Record<string, string> = {};
section.fields.forEach((f) => { empty[f.key] = ""; });
```
2. `ServiceRecords.tsx:478-484` só bloqueia campos marcados `required: true` no `mock.ts`:
```ts
const missing = modalSection.fields
  .filter((f) => f.required && !(formData[f.key] ?? "").trim())
```
3. `boardRecordService.ts:283-298` monta o body com `?? "-"`, que **não dispara sobre string vazia**:
```ts
temperature: formData.temperature ?? "-",
heartRate:   formData.heartRate ?? "-",
breathRate:  formData.breathRate ?? "-",
mucous:      formData.mucous ?? "-",
weight:      formData.weight ?? "-",
```
   → o corpo sai com `""`.
4. `api:.../dto/general/generalTest.dto.ts:25-52` — todos `@IsNotEmpty`:
```ts
@IsNotEmpty({ message: 'O campo Temperatura é obrigatório' })
temperature!: string;
```
5. `api:src/infra/main.ts:20-29` — `exceptionFactory` devolve o array de mensagens; o front joga no toast.

**Seções afetadas (varredura completa, campo do formulário sem `required` × DTO `@IsNotEmpty`):**

| Seção | Campos que derrubam o salvamento |
|---|---|
| general-service | problem |
| general-test (Exame Físico) | temperature, heartRate, breathRate, weight, mucous |
| dentistry-exam | body, heartRate, weight |
| dentistry-assessment | stage, gums |
| dentistry-oral | molars, canines, incisors, tongue |
| ortho-service (Exame Físico Ortopédico) | problem, members, neck, back, hoof |
| donor-gyno | cervix, utero, bodyScore, angle, cyto |
| donor-heat | leftOvary, uterus, rightOvary |
| donor-ovulation | time, hormones, dosage |
| donor-insemination | time (+ ver A2) |
| donor-embryo | time |
| receptor-gyno | cervix, utero, bodyScore, angle, ultrasound, cyto |
| receptor-heat | leftOvary, rightOvary, uterus |
| receptor-hormones | time, hormones, dosage |
| receptor-inovulation | time, embryo |
| receptor-diagnosis-final | heartRate, embryo, expectancyConditional |
| receptor-vaccines | type |
| receptor-monitoring | ultrasound |
| breeding-vaccines | type |
| breeding-post | mare, foal, placenta |
| stallion-physical | inspection, behavior, ultrasound, spermogramVolume, spermogramMotility, totalConcentration, mlConcentration, mobileConcentration, integrity, pathology |
| stallion-collections | destination |
| stallion-shipping | place, recipient, type |

**Correção:** decidir por seção qual campo é clinicamente obrigatório. Para os que NÃO são: trocar `@IsNotEmpty` por `@IsOptional()` + `@Transform(({value}) => value ?? '')` no DTO de criação (padrão já usado no `observation`). Para os que SÃO: marcar `required: true` no `mock.ts` para a tela avisar antes do round-trip. Não voltar a mandar `"-"`: isso reintroduz dado clínico fabricado.

---

### A2 · Inseminação da Doadora: Garanhão e Volume são obrigatórios na API e opcionais na tela — e nunca voltam na releitura

**Severidade: BLOQUEIA_LANCAMENTO** · Parcialmente novo (a auditoria anterior citava "Garanhão e Volume gravam mas a releitura não traz"; o 400 na criação é novo)

**O que quebra:** registrar uma inseminação sem informar Garanhão ou Volume devolve 400 (`O campo Garanhão é obrigatório` / `O campo Volume é obrigatório`). Quando o vet preenche e salva, o dado **grava** — mas a tabela e o modal de edição abrem em branco, porque o front não lê esses campos de volta. O campo **Método** (Inseminação / Monta natural / Monta dirigida) existe na tela e nunca é enviado: a distinção que justifica a seção é perdida em 100% dos casos.

**Evidência:**
- `api:.../reproduction/reproductionDonorInsemination.dto.ts:55-64`
```ts
@IsNotEmpty({ message: 'O campo Garanhão é obrigatório' })
stallionId!: string;
@IsNotEmpty({ message: 'O campo Volume é obrigatório' })
volume!: string;
```
- `web:app/(dashboard)/services/_data/mock.ts:386-387` — `{ key: "stallionId", label: "Garanhão" }` e `{ key: "volume", label: "Volume" }`, **sem `required: true`**.
- `web:services/boardRecordService.ts` (bloco `"donor-insemination"`) — `mapToRecord` devolve apenas `date, time, semen, observation`; `stallionId`, `volume` e `method` ficam de fora.
- `api:src/infra/http/presenters/reproduction/reproductionDonorInsemination.presenter.ts:15-16` — a API **devolve** `stallionId` e `volume`; a perda é 100% no front.

---

### A3 · Cinco seções de Reprodução não têm onde salvar

**Severidade: BLOQUEIA_LANCAMENTO** · Já constava (C4 / "6 seções mock"), **ainda aberto** — agora com bloqueio explícito em vez de mock silencioso

**O que quebra:** o veterinário abre a seção, preenche e clica Salvar. Recebe `"<Seção>" ainda não é salva no servidor. Registre esta informação em Observações de outra seção até a funcionalidade ser liberada.` Ou seja: o dado não evapora mais em silêncio (melhorou), mas a funcionalidade **não existe** — e essas seções nunca aparecem no laudo.

Seções sem entrada em `SECTION_API_CONFIG`:
- `breeding-gyno` — Avaliação Ginecológica (Matriz)
- `breeding-heat` — Acompanhamento do CIO (Matriz)
- `breeding-hormones` — Indução Hormonal (Matriz)
- `breeding-cover` — Cobertura / Inseminação (Matriz)
- `receptor-post` — Pós-parto / Neonatal (Receptora)

**Evidência:** definidas em `web:app/(dashboard)/services/_data/mock.ts:416,431,442,454` e `:412`; ausentes das 43 chaves de `SECTION_API_CONFIG` (`web:services/boardRecordService.ts:249-1585`). Bloqueio em `web:.../ServiceRecords.tsx:464-470`:
```ts
if (!config) {
  toast.error(`"${modalSection.title}" ainda não é salva no servidor. ...`);
  return;
}
```

**Impacto de negócio:** a trilha inteira da MATRIZ (o caso mais comum de reprodução equina fora de TE) não é registrável.

---

### A4 · Propriedade sem cliente é visível e editável por TODAS as clínicas do sistema

**Severidade: BLOQUEIA_LANCAMENTO** · **Novo** — não consta em nenhuma auditoria anterior

**O que quebra:** `stud_farms` não tem `companyId`; a posse é derivada. O escopo por empresa tem um ramo "órfã" que **não filtra por empresa nenhuma**: qualquer propriedade sem cliente, sem animal e sem atendimento casa para **todo** `companyId`. Como o cadastro de propriedade só exige o nome, esse é o estado natural de toda propriedade recém-criada.

Resultado: a Clínica A cria "Haras São João", ainda sem cliente. A Clínica B abre a lista de propriedades e vê "Haras São João" — com endereço, responsável e telefone. E pode **editar**, porque `belongsToCompany` usa exatamente o mesmo escopo.

**Evidência:** `api:src/infra/shared/database/prisma/repositories/prismaStudFarm.repository.ts:47-64`
```ts
private companyScope(companyId: string) {
  return { OR: [
    { client: { companies: { some: { companyId } } } },
    { ClientStudFarm: { some: { client: { companies: { some: { companyId } } } } } },
    { Animal: { some: { companyId } } },
    { Appointment: { some: { companyId } } },
    { AND: [                       // <-- ramo sem qualquer filtro de empresa
      { clientId: null },
      { ClientStudFarm: { none: {} } },
      { Animal: { none: {} } },
      { Appointment: { none: {} } },
    ] },
  ] };
}
```
E `:146-152`:
```ts
async belongsToCompany(studFarmId, companyId) {
  const count = await this.prisma.studFarm.count({
    where: { id: studFarmId, ...this.companyScope(companyId) },
  });
```
usado como única guarda em `api:.../studFarm.service.ts:122-126` (edit).

O comentário no código admite o motivo ("sem ele, a propriedade sumiria da lista logo depois de ser cadastrada"), mas a solução escolhida abre o tenant.

**Correção:** adicionar `companyId` (ou `createdByCompanyId`) em `StudFarm` com migration e filtrar por ele; o ramo "órfã" nunca deve existir sem discriminador de empresa.

---

### A5 · Editar o CPF do cliente não salva — e o sistema diz que salvou

**Severidade: BLOQUEIA_LANCAMENTO** · **Novo**

**O que quebra:** a clínica cadastra o cliente sem CPF (a própria modal avisa que sem CPF ele não paga faturas pelo app). Depois consegue o CPF, abre "Editar cliente", digita, salva, vê "Cliente atualizado com sucesso." — e no F5 o campo está vazio de novo. O cliente segue sem conseguir pagar.

**Evidência:** o front envia o CPF:
`web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx:144-153`
```ts
const body: CreateClientDto = { name, phone, email, cpf: formData.cpf || undefined };
...
await PutAPI(`/client/${initialData.id}`, body);
```
O DTO aceita: `api:.../client/dto/client.dto.ts:56-59` (`cpf?: string` em `EditClientDto`).
O service trata: `api:.../client/services/client.service.ts:149-162` (checa duplicidade e faz `client.cpf = cpf || null`).
**O controller descarta:** `api:src/infra/http/controllers/client/client.controller.ts:59`
```ts
const { name, phone, email } = body;   // cpf nunca é lido
```
Como o `ValidationPipe` roda sem `whitelist`, não há erro — o campo simplesmente desaparece.

**Agravante:** o `paymentId` do Asaas só é criado quando há CPF na **criação** (`client.service.ts:78-89`). Um cliente criado sem CPF nunca ganha `paymentId`, e não existe caminho para corrigir isso pela tela.

---

### A6 · Editar um animal troca o código de vínculo dele

**Severidade: GRAVE** · **Novo**

**O que quebra:** o `code` do animal é o segredo que o proprietário usa no app para se vincular (`GET /animal/:code`, `POST /animal/register/:code`). Qualquer edição do animal feita pela clínica **gera um código novo**. O código que a clínica já mandou por WhatsApp para o cliente para de funcionar, sem aviso nenhum para ninguém.

**Evidência:** `api:src/domain/application/services/animal/services/animal.service.ts:193-195`
```ts
if (safeCompanyId) {
  animal.code = generateRandomString(8);
}
```
Como o controller sempre passa `companyId` para tokens de empresa (`animal.controller.ts:109`), o ramo dispara em **toda** edição feita no web.

**Bônus confirmado:** `prisma/schema.prisma:398` — `code String` **sem `@unique`** (compare com `Client.code` na linha 1763 e `StudFarm.code` na 1995, ambos `@unique`), e a busca usa `findFirst` (`prismaAnimal.repository.ts:36-40`). Com `generateRandomString(8)` há colisão possível, e a colisão devolve um animal arbitrário — inclusive de outra clínica.

---

### A7 · Criar animal a partir de outra modal nunca auto-seleciona o animal criado

**Severidade: GRAVE** · Já constava, **ainda aberto**

**O que quebra:** no fluxo "Nova atividade → não achei o animal → + criar animal", o animal é criado, mas o `onSuccess` nunca dispara: o formulário pai volta com o campo vazio e o usuário precisa procurar o animal na lista. Mesma coisa com propriedade e com cliente.

**Evidência:** a API já devolve o objeto embrulhado —
`api:.../animal.controller.ts:86` → `return { animal: AnimalPresenter.toHTTP(...) }`
`api:.../studFarm.controller.ts:75` → `return { studFarm: ... }`
`api:.../client.controller.ts:48` → `return { client: ... }`
O front lê a chave errada —
`web:.../CreateAnimalSheet.tsx:621-635`
```ts
const created = await PostAPI<{ id: string; name: string }>("/animal", body);
console.log("created: ", created);
...
if (created?.id && onSuccess) {   // created.id é sempre undefined
```
`web:.../NewPropertySheet.tsx:284-303` — `if (created?.id && onSuccess) onSuccess(created as StudFarm);` — idem.
`web:.../CreateOwnerSheet.tsx:189-193` — ainda usa o workaround antigo:
```ts
const list = await GetAPI<{ clients: Client[] }>("/client?page=1");
const created = list?.clients?.find((c) => c.email === body.email);
```
Como `fetchByCompanyId` ordena por `name asc` com `take: 10` (`prismaClient.repository.ts:161-163`), numa clínica com mais de 10 clientes o recém-criado normalmente **não está na página 1** e o `onSuccess` também falha.

**Bônus:** `console.log("created: ", created)` (`CreateAnimalSheet.tsx:625`) e `console.log("created", created)` (`NewPropertySheet.tsx:285`) em produção.

---

### A8 · CRM: cada coluna mostra no máximo 10 leads e os KPIs contam só o que foi carregado

**Severidade: GRAVE** · **Novo**

**O que quebra:** a clínica com 30 leads em "Novo contato" vê 10 cartões, o cabeçalho da coluna diz "10 leads" e o KPI "Total de leads" diz 10. Não há "carregar mais", não há paginação, não há indicação de que existe mais. Do 11º lead em diante o registro é indistinguível de um lead perdido — e ele nem pode ser arrastado para outra coluna.

**Evidência:**
- `api:src/infra/shared/database/prisma/repositories/prismaBoard.repository.ts:51-60` — `leads: { orderBy: [...], take: 10 }`, e `_count: { leads: true }` no mesmo include (a API sabe o total real).
- `web:app/(dashboard)/crm/_components/KanbanColumn.tsx:64` — `{leads.length} {leads.length === 1 ? "lead" : "leads"}` — usa o array truncado, **não** o `leadQuantity`.
- `web:app/(dashboard)/crm/_components/CrmKpis.tsx:14-23` — `boards.reduce((s, b) => s + b.leads.length, 0)` nos 4 KPIs.

**Filtros do CRM:** `services/crm/boardService.ts:11-21` e `leadService.ts:9-24` aceitam `query`, `startDate` e `endDate`, mas `CrmKanban.tsx:47` chama `boardService.fetchBoardsWithLeads({ GetAPI })` **sem parâmetro nenhum**, e não existe UI de filtro em `app/(dashboard)/crm/` (grep por `startDate`/`query` retorna zero nos componentes). Os filtros do CRM **não existem na tela**.

---

### A9 · Não existe como excluir cliente, propriedade ou animal pela tela — e o endpoint que existe quebra

**Severidade: GRAVE** · **Novo**

**O que quebra:** a pergunta "o soft delete funciona? cliente excluído some dos dropdowns?" não chega a ser feita, porque **não há botão de excluir**. `ClientsTable.tsx:237-243`, `StudFarmsTable.tsx` e `AnimalsTable.tsx` só oferecem `ViewActionButton` e `EditActionButton`. `DeleteAPI` só é usado no web para anotações do animal (`clients-equines/animals/[id]/page.tsx:309`). Cadastro errado é permanente.

Quando o endpoint for ligado, ele quebra:
- `api:client.service.ts:170-187` faz **hard delete** (`this.clientRepository.delete(client)` → `prisma.client.delete`).
- `prisma/schema.prisma:410` — `client Client @relation(fields: [clientId], references: [id])`, relação obrigatória **sem `onDelete`** → `Restrict`. Cliente com qualquer animal ⇒ violação de FK ⇒ exceção não tratada no service ⇒ `AllExceptionsFilter` ⇒ 500 genérico ("erro interno") na cara do usuário.
- O **soft delete existe mas é exclusivo do app do proprietário**: `client.controller.ts:79-88` (`DELETE /client/me`, exige `tokenType === 'client'`).

**Consequência do soft delete parcial:** um cliente que apagou a própria conta pelo app continua aparecendo normalmente nas listas e dropdowns da clínica. `prismaClient.repository.ts` **não tem uma única ocorrência de `deletedAt`** (grep no arquivo inteiro: zero) — nem em `fetch`, nem em `fetchByCompanyId`, nem em `count*`. Só o login o trata (`client.service.ts:255`).

---

### A10 · CEP é pedido nas duas modais de propriedade e nunca é gravado

**Severidade: GRAVE** · Já constava, **ainda aberto**

**O que quebra:** a modal de criar propriedade tem campo CEP com busca ViaCEP; a de editar também (`EditPropertySheet.tsx:371-386`). O CEP preenche rua/bairro/cidade/UF e depois é descartado: ao reabrir a propriedade para editar, o CEP está sempre vazio e o usuário precisa digitar de novo. **Não sobrevive a um F5.**

**Evidência:**
- `web:.../NewPropertySheet.tsx:270-282` — o `body` montado tem `name, city, state, location, address, street, number, neighborhood, responsibleName, responsiblePhone, clientId`. **Sem `cep`.**
- `api:.../studFarm/dto/studFarm.dto.ts` — `CreateStudFarmDto`/`EditStudFarmDto` não têm campo `cep`.
- `api:prisma/schema.prisma` — `model StudFarm` não tem coluna de CEP.

---

### A11 · "Reagendar" pela modal de status move o atendimento inteiro

**Severidade: GRAVE** · Já constava (ALTO, não corrigido), **confirmado ainda aberto**

**O que quebra:** num atendimento com 3 animais, reagendar o animal A pela modal de status move os 3 para a nova data. Só o status do animal A volta para "Agendado"; os outros dois ficam com o status antigo numa data que ninguém escolheu.

**Evidência:** `web:.../ChangeAppointmentStatusSheet.tsx:150-158`
```ts
if (selected === "RESCHEDULED") {
  await PutAPI(`/appointment/${appointmentId}`, { startDate, endDate, description: descDraft });
  await PutAPI(`/appointment-animal/${targetId}`, { status: "PENDING" });
```
O endpoint correto existe e é usado em outra tela: `POST /appointment/:id/reschedule` → `appointment.service.ts:245+` (`rescheduleSplit`), que preserva o atendimento original como histórico. A modal de status não o chama, não conta quantos animais existem e não avisa nada no JSX.

**Bomba latente na mesma função:** `:149`
```ts
const targetId = appointmentAnimalId ?? appointmentId;
```
Se algum chamador novo não passar `appointmentAnimalId`, o PUT vai para `/appointment-animal/<id-de-appointment>`. O único guard do submit é `if (!appointmentId) return` (`:127`). Hoje o único chamador (`ServicesTable.tsx:706`) passa o id certo — por isso é latente, não ativo.

---

### A12 · Editar um atendimento reenviando a lista de animais apaga status e histórico

**Severidade: GRAVE** · Já constava (parcial), **confirmado ainda aberto**

**O que quebra:** `PUT /appointment/:id` com `animals` faz `deleteMany` + `createMany` com `status: 'PENDING'`. Todos os `AppointmentAnimal` são recriados com id novo — o que zera o status de cada animal e **desconecta as fichas clínicas** já criadas (todos os modelos de ficha têm FK `appointmentAnimalId`).

**Evidência:** `api:.../appointment/services/appointment.service.ts:225-238`
```ts
if (animals && animals.length > 0) {
  await this.appointmentAnimalRepository.deleteMany({ appointmentId: AppointmentId });
  await this.appointmentAnimalRepository.createMany(
    animals.map((animal) => AppointmentAnimal.create({ ..., status: 'PENDING' }))
  );
}
```
**Mitigação atual, não correção:** a única tela de edição (`web:.../EditAppointmentSheet.tsx:81-84`) só envia `description`, com um comentário em caixa alta no topo do arquivo:
> `⚠️ NUNCA envie 'animals' no PUT /appointment/:id.`

O contrato da API continua perigoso: o DTO aceita `animals`, e o próximo desenvolvedor que quiser "editar os animais do atendimento" destrói prontuário.

**Efeito colateral aceito hoje:** não existe forma de editar data, tipo, responsável, propriedade ou animais de um atendimento pela interface. A `EditAppointmentSheet` é só descrição; `AppointmentDetailsModal` e `CommitmentDetailsModal` são somente leitura.

---

### A13 · OE / OD (ovário esquerdo e direito) são digitados e descartados

**Severidade: GRAVE** · Já constava (C9), **confirmado ainda aberto**

**O que quebra:** na Avaliação Ginecológica da Doadora e da Receptora a tela tem os campos OE, U e OD (`mock.ts:341-343`). O achado de cada ovário — o dado central do exame — não tem coluna no banco, não é enviado e não volta. O vet digita e o sistema descarta em silêncio.

**Evidência:**
- `web:app/(dashboard)/services/_data/mock.ts:341,343` — `{ key: "leftOvary", label: "OE", inline: true }`, `{ key: "rightOvary", label: "OD", inline: true }`.
- `web:services/boardRecordService.ts`, bloco `"donor-gyno"` — o `buildCreateBody` envia `vulva, cervix, utero, observation, ultrasound, bodyScore, parity, angle, vulva2, vulvoplastia, cyto`. **Sem `leftOvary`/`rightOvary`.**
- `api:prisma/schema.prisma:1198-1226` — `model ReproductionDonorGyno` não tem coluna de ovário.
- `api:src/infra/http/presenters/reproduction/reproductionDonorGyno.presenter.ts` — idem.

(As seções `donor-heat` / `receptor-heat` têm `leftOvary`/`rightOvary` de verdade — lá o problema é o A1, não este.)

---

### A14 · Data da transferência para o estoque volante é validada, enviada e jogada fora

**Severidade: MENOR** · **Novo**

**O que quebra:** a modal "Enviar para o volante" tem campo Data, valida (`Informe uma data válida (dd/mm/aaaa)`) e envia. A transferência é gravada sem data nenhuma — não há coluna. Toda transferência para o volante é atemporal, e nenhuma transferência aparece no histórico de movimentações.

**Evidência:**
- `web:.../stock/SendGeneralToVolanteSheet.tsx:100-116` — `await PostAPI("/field-stock", { productId, quantity, date: dateIso })`.
- `api:.../stock/dto/fieldStock.dto.ts:6-16` — `CreateFieldStockDto` tem só `productId` e `quantity`. Sem `whitelist` no `ValidationPipe`, o `date` é descartado sem erro.
- `api:prisma/schema.prisma:542-554` — `model FieldStock { id, productId, userId, quantity }`. Sem data.
- `api:.../stock/services/stockMovement.service.ts:26-48` — a listagem de movimentações lê só `productStock` (entradas) e `productUsage` (saídas). Transferências geral↔volante nunca aparecem.

**Adjacente (MENOR):** saldo insuficiente no servidor devolve `NotAllowedError` → *"Você não tem permissão para realizar esta ação."* (`api:src/core/errors/errors/notAllowedError.ts:7`), mensagem errada para o caso. Só não incomoda porque o front hoje valida antes (`SendGeneralToVolanteSheet.tsx:88-95`, `StockOutputSheet.tsx`, `SendVolanteToGeneralSheet.tsx`).

---

### A15 · Foto do animal não pode ser removida

**Severidade: MENOR** · **Novo**

`web:.../CreateAnimalSheet.tsx:596` e `:620` — `if (photoUrl) body.photoUrl = photoUrl;`. Com o campo vazio a chave é omitida; do outro lado, `api:animal.service.ts:191` faz `animal.photoUrl = photoUrl ?? animal.photoUrl`. Trocar a foto funciona; apagar não.

---

### O que verifiquei e está CORRETO

Registro explícito para não gerar retrabalho:

- **C1 (defaults clínicos inventados):** **corrigido.** O padrão `formData.x === "B" ? "B" : "A"` não existe mais em `boardRecordService.ts` (grep por `? "` + `===`: só duas ocorrências, ambas no `sharedWithOwner`). Os selects usam `opt()`/`optBool()`, que **omitem** quando não respondidos (`:168-193`), e `ServiceRecords.tsx:478-484` bloqueia os `required` antes do envio.
- **C5 (registro some do 11º em diante):** **corrigido** nos dois lados. `boardRecordService.fetchAllRecords` (`:1665-1692`) busca todas as páginas; todos os repositórios de ficha têm `orderBy` (varredura: só `prismaProductTag` e `prismaRecoverPasswordCode` não têm, e nenhum dos dois é ficha).
- **C7 "Coletas de Envio falha 100%":** **corrigido.** Os 9 campos de espermograma viraram `@IsOptional` (`reproductionStallionCollection.dto.ts:44-84`). Resta só `destination` (coberto por A1).
- **C7 "Sêmen Fresco":** **corrigido.** `SemenType.Fresco` existe no enum (`reproductionDonorInsemination.dto.ts:20`).
- **Exame Físico Ortopédico:** `inspection` e `rump` viraram opcionais na API (`orthopedicService.dto.ts:33-41,52-62`) e o front parou de mandar `"-"` (`boardRecordService.ts:581-589`). `sensibility` é `required: true` na tela e bloqueado antes do envio. Restam os 5 campos do A1.
- **Estoque:** entrada, saída, transferência e devolução validam saldo nos **dois** lados. `fieldStock.service.ts:44-47` e `:113-115`; `productUsage.service.ts:78-81` e `:96-99` com `InsufficientStockError`. Validação preventiva também no `SendGeneralToVolanteSheet` (o gap apontado no STATUS-VERIFICADO foi fechado).
- **Isolamento multi-tenant de animal e ficha:** as guardas de posse existem e **disparam de verdade** — `animal.service.ts:49-69` (`ownsLinks`), `:160-164` (edit), `:275-277` (getById); `productUsage.service.ts:29-40` (`ownsAppointmentAnimal`); `appointment.service.ts:201`. Comparam `companyId` com `companyId`, não com `userId`.
- **Criar animal sem cliente:** o front agora **valida antes** (`CreateAnimalSheet.tsx:554-559`, `"Selecione o cliente proprietário do animal."`), então o usuário não vê mais o "Registro não encontrado". Detalhe abaixo em Dúvidas.

---

## Dúvidas em aberto

1. **`finalClientId` (`animal.controller.ts:62-68`) continua calculado e ignorado.** A linha 76 passa `clientId: tokenType === 'client' ? userId : clientId`, não `finalClientId`. Para um veterinário, `userId` sempre existe, então o `BadRequestException` da linha 65 **nunca dispara** — é a sétima ocorrência do padrão "a checagem existe e nunca funciona" nesta base. Hoje o sintoma está mascarado pela validação no front (A7 acima). **Não classifiquei como achado porque não consegui produzir um caminho de usuário que chegue lá:** qualquer chamada direta à API sem `clientId` cai no `left(new ResourceNotFoundError())` do `animal.service.ts:87-90` e devolve 404 com mensagem genérica. É código morto perigoso, não bug ativo. Recomendo remover ou fazer valer.

2. **Odontograma v2** — não sei se o JSON do desenho sobrevive ao round-trip. `ServiceRecords.tsx:445-449` carrega `record.odontogram` do registro para o `formData`, mas não confirmei se o `buildCreateBody` de `dentistry-odontogram` envia esse campo nem se a API tem coluna. **Precisa de auditoria dedicada.**

3. **A5 (CPF descartado no controller) tem quantos irmãos?** Não varri os outros ~20 controllers procurando campos que o DTO aceita, o service trata e o controller esquece de destruturar. O `ValidationPipe` sem `whitelist` torna esse erro invisível em toda a API. Vale uma varredura mecânica: para cada controller, comparar as chaves destruturadas do `body` com as propriedades do DTO.

4. **Colisão de `Animal.code`** (A6): não sei o tamanho da base em produção. Com 8 caracteres do alfabeto de `generateRandomString`, o risco só é relevante acima de alguns milhares de animais. O que é certo é a **regeneração a cada edição**, que independe do volume.

5. **A4 em produção:** não consultei o banco. Uma query em `stud_farms` procurando linhas com `clientId IS NULL` e sem vínculos diria em segundos quantas propriedades estão hoje expostas entre clínicas.

6. **Filtros do CRM:** existem no serviço e no backend. Não consegui determinar se a UI de filtro foi removida ou nunca foi construída — não há vestígio dela nos componentes.
