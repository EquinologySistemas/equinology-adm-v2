# Status verificado — 2ª medição

**Verificação independente contra o código**, com os três repos limpos e commitados. Nada foi estimado: 6 agentes abriram os arquivos.

## Números

| Status | 1ª medição | 2ª medição |
|---|---|---|
| Corrigido | 64 | **116** |
| Parcial | 38 | 25 |
| Não corrigido | 71 | 31 |
| Fora de escopo (Asaas) | 6 | 6 |
| Não aplicável | 4 | 4 |

**Total: 182**

## Em aberto: 56

| Repo | Qtd |
|---|---|
| API | 22 |
| ADM | 14 |
| WEB | 13 |
| APP | 7 |

---

# WEB — 13 em aberto

### [CRITICO] 6 seções sem config de API salvam só em memória

**Status:** parcial

**O que falta:** O dado clínico não some mais em silêncio (o submit é recusado), mas 5 seções de reprodução seguem sem endpoint: o veterinário não consegue registrar nada nelas e elas nunca entram no laudo. Falta mapear/criar os endpoints.

**Evidência:** Corrigido em parte: services/boardRecordService.ts:517 agora tem `"dentistry-prescription"` no SECTION_API_CONFIG, e ServiceRecords.tsx:404-412 substituiu o ramo mock por bloqueio explícito (`toast.error('"X" ainda não é salva no servidor...')` e `return`), idem no delete (474-478). Continuam SEM config: `receptor-post`, `breeding-gyno`, `breeding-heat`, `breeding-hormones`, `breeding-cover` — definidas em _data/mock.ts:402,406,421,432,444 e ausentes da lista de chaves de SECTION_API_CONFIG.

### [CRITICO] Fatura pública nunca exibe a chave PIX salva na tela Clínica

**Status:** nao_corrigido

**O que falta:** A correção recomendada (trocar `settings.pixKey` por `clinic.pixKey`) é de uma linha e não foi aplicada. O objeto `clinic` já está montado duas linhas antes.

**Evidência:** equinology-web-v2/app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx:98 `const settings = getClinicSettings(company?.id ?? null);` e :134 `k: settings.pixKey || undefined,` — continua lendo o localStorage legado, embora `clinicFromCompany(company, user)` já esteja disponível na linha 118 e lib/pdf/fromCompany.ts:34 faça `pixKey: company.pixKey ?? settings.pixKey`.

### [MEDIO] CRM Qtd. animais: campo abre com '0' preso e não pode ser limpo

**Status:** parcial

**O que falta:** O '0 preso' foi resolvido (o texto local permite apagar), mas o campo AINDA ABRE exibindo "0" em vez de vazio com placeholder, e no blur com campo vazio volta a "0" (emptyValue=0). A recomendação original (inicializar null/"" e deixar o placeholder "0" cobrir o vazio) não foi aplicada. Diferente de AddProductSheet, aqui também não há `onFocus={e => e.target.select()}`, então digitar por cima gera "05" até o blur.

**Evidência:** CreateLeadModal.tsx:194-203 migrado para `<NumberInput id="lead-animals" min={0} emptyValue={0} value={form.animalQuantity ?? null} onChange={(v) => setForm(p => ({...p, animalQuantity: v ?? 0}))} placeholder="0" />`. Porém o state segue inicializado em 0: linha 41 `animalQuantity: 0`, linha 57 `initialData.animalQuantity ?? 0`, linha 69 (reset) `animalQuantity: 0`.

### [MEDIO] Inconsistência de fuso: cards em BRT fixo, modais/picker no fuso do navegador

**Status:** parcial

**O que falta:** Nenhum desses três arquivos importa lib/brt. Para quem está fora de UTC-3 o card e o modal de detalhes ainda podem divergir.

**Evidência:** O DateTimePicker foi convertido: date-time-picker.tsx:19 importa `brtLocalDate/brtNow/isoFromBrtWallClock`, `parseISOOrDate` devolve parede de relógio BRT (linhas 50-54) e o valor emitido volta por `isoFromBrtWallClock` (152/159/164). PORÉM os modais de detalhes seguem no fuso local: CommitmentDetailsModal.tsx:29 `const start = appointment.startDate ? new Date(...)` + `format(start, ...)` na linha 51; AppointmentDetailsModal.tsx:75 e :163 idem; RescheduleAppointmentSheet.tsx:124-129 formata 'Dat

### [MEDIO] Pagamento de várias parcelas em loop sem atomicidade

**Status:** nao_corrigido

**O que falta:** Falha no meio continua deixando estado parcial invisível para o usuário. Só a mensagem de erro melhorou (achado #12).

**Evidência:** web:PayTransactionSheet.tsx:97-110 — `for (const id of selectedIds) { await PutAPI(`/transaction/${id}`, ...) }` seguido de `toast.success` e, no catch, apenas `toast.error(getApiErrorMessage(...))`: sem `onSuccess?.()`, sem refresh e sem informar quais parcelas foram efetivadas. Na API não existe endpoint de baixa em lote — `grep -rn "pay-many|payMany" src` não retorna nada.

### [MEDIO] Botão do olho com tooltip 'Ver detalhes' abre o laudo

**Status:** parcial

**O que falta:** Falta passar o label por status também em ServiceHistory (o próprio achado citava essa tela).

**Evidência:** Corrigido no arquivo do achado: ServicesTable.tsx:349-352 `<ViewActionButton label="Ver laudo" onClick={() => openReport(row)} />` para FINISHED e :355-361 `label="Abrir atendimento"` para os demais. Porém ServiceHistory.tsx:280 continua `<ViewActionButton onClick={() => setSelected(h)} />` sem label, e :165/293-297 mostram que, quando `selected.status === 'FINISHED'`, o que abre é o AppointmentReportModal (laudo) — com o tooltip padrão 'Ver detalhes'.

### [MEDIO] Estoque: entrada inicial e categoria recém-criada localizadas por NOME

**Status:** nao_corrigido

**O que falta:** Exige mudança na API (POST /product retornar o registro criado), que não foi feita.

**Evidência:** equinology-web-v2/app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx:86-101 — comentário 'Como POST /product não retorna o id, localizamos o produto recém-criado pelo nome', `params.set("where[query]", productName)` e `const created = (res?.products ?? []).find((p) => p.name === productName)`; :152 `const created = next.find((c) => c.name === nameTrim)` para a categoria.

### [MEDIO] Middleware do web não protege /notes e /reminders; matcher tem rotas mortas

**Status:** parcial

**O que falta:** O furo de segurança (rotas fora do gate de assinatura) está fechado. Falta apenas remover as duas entradas mortas do matcher — cosmético.

**Evidência:** equinology-web-v2/middleware.ts (config.matcher) — foram adicionados '/notes', '/notes/:path*', '/reminders', '/reminders/:path*' com comentário 'Achado S5'. Porém '/stock2' e '/cooperators' continuam listados, e `ls app/(dashboard)/` mostra apenas: calendar, clients-equines, clinic, crm, financial, notes, reminders, services, stock, subscription.

### [MEDIO] Saída de estoque sem validação de quantidade disponível (e typo 'disponivel')

**Status:** parcial

**O que falta:** Falta a validação preventiva no envio Geral→Volante; lá o erro só aparece após o round-trip à API.

**Evidência:** CORRIGIDO em StockOutputSheet.tsx:104-110 — `if (available !== null && quantity > available) { toast.error(\`Quantidade indisponível: há apenas ${available} em estoque.\`) ... }`; typo corrigido em SendVolanteToGeneralSheet.tsx:50 'Quantidade maior que a disponível no volante (N).'. NÃO CORRIGIDO em SendGeneralToVolanteSheet.tsx:79-90 — o handleSubmit valida só `!productId || !quantity || quantity <= 0` e a data; nenhuma comparação com `product.currentStock` (que é exibido na linha 118).

### [BAIXO] Guards lançam 401/403 sem mensagem — 'Unauthorized'/'Forbidden' default

**Status:** parcial

**O que falta:** Faltam os 4 decorators (401, interceptado pelos fronts → impacto baixo, como o próprio achado previa) e o `new Error("Unauthorized")` da web. Mitigação parcial: lib/api-error.ts MESSAGE_BY_RAW mapeia 'unauthorized'→'Sua sessão expirou...' e 'forbidden'→'Você não tem permissão...', então na web esses textos não chegam mais crus ao toast.

**Evidência:** CORRIGIDO nos guards: auth.guard.ts:30 'Você precisa estar autenticado para acessar este recurso.' e :42 'Sua sessão expirou. Faça login novamente para continuar.'; admin-auth.guard.ts:30/41/52 com mensagens PT; admin-super-admin.guard.ts:13/21/27 ('Apenas super administradores podem realizar esta ação.'); vet-only.guard.ts:33/55 usa VET_ONLY_MESSAGE. NÃO CORRIGIDO nos decorators citados no mesmo achado: CurrentUserId.decorator.ts:8, CurrentCompanyId.decorator.ts:8, CurrentAdminUserId.decorator.

### [BAIXO] Data de nascimento aceita datas futuras (sem max=hoje) e DateInput descarta inválidas sem mensagem

**Status:** parcial

**O que falta:** O calendário ainda permite clicar em 2030; o bloqueio só acontece no submit, com toast. Basta passar `max={hoje}`.

**Evidência:** O DateInput passou a suportar e exibir erro (`components/ui/date-input.tsx:209,229-230,404` — `maxDate`, mensagem 'Data posterior a ...' e dia desabilitado no calendário), e o submit barra futuro (CreateAnimalSheet.tsx:567-570). MAS o campo de nascimento continua sem a prop: CreateAnimalSheet.tsx:985-993 renderiza `<DateInput id="birthDate" calendarPosition="top" value=... onChange=... disabled=... />`, sem `max`.

### [BAIXO] Inconsistências de padrão entre as três modais (máscaras, validações, console.log, obrigatórios)

**Status:** nao_corrigido

**O que falta:** Únicos avanços tangenciais: phone/cpf ganharam validação no caminho do áudio (achado #14). A padronização pedida não foi feita.

**Evidência:** Os quatro pontos seguem abertos: (1) `console.log("created: ", created)` em CreateAnimalSheet.tsx:616 e `console.log("created", created)` em NewPropertySheet.tsx:285; (2) máscara de CEP ainda duplicada — `formatCEP` em lib/masks.ts:52 e `formatCep` em lib/cep.ts:43; (3) clientId continua opcional na criação de propriedade (NewPropertySheet.tsx:282 `clientId: formData.clientId || undefined`, só `name` tem required); (4) label de voz do CreateOwnerSheet continua 'Nome' (linha 21).

### [BAIXO] Fallback incorreto: modal de status envia appointmentId para /appointment-animal

**Status:** nao_corrigido

**O que falta:** A bomba latente segue armada: qualquer novo chamador que não passe appointmentAnimalId vai bater no endpoint errado.

**Evidência:** ChangeAppointmentStatusSheet.tsx:149 — `const targetId = appointmentAnimalId ?? appointmentId;` continua exatamente como no achado, e é usado tanto no ramo RESCHEDULED (linha 158) quanto no de FINISHED/IN_PROGRESS (linha 161). Nenhum guard novo: o submit só é bloqueado por `if (!appointmentId) return` (linha 127), que não exige appointmentAnimalId.

---

# API — 22 em aberto

### [CRITICO] "Internal server error" cru — API sem ExceptionFilter global e frontends sem máscara de 500

**Status:** parcial

**O que falta:** Falta a máscara de 5xx no app mobile. Também sobram pontos na web que não passam pelo ApiContext e exibem `data.message` cru (app/(auth)/recover-password/page.tsx:38-40 e app/(auth)/register/page.tsx:111-113 com fetch direto) — hoje o risco é baixo porque a API só emite PT nesses casos, mas a máscara depende do backend, não do front.

**Evidência:** CORRIGIDO NA API: vetequus-api/src/infra/shared/handler/all-exceptions.filter.ts:35 `@Catch()` + classe AllExceptionsFilter que loga `error.stack` e responde `{statusCode:500, message: GENERIC_ERROR_MESSAGE, code:'INTERNAL_SERVER_ERROR'}`; registrado de fato em src/infra/main.ts:36 `app.useGlobalFilters(new AllExceptionsFilter())`. error.handler.ts:113-120 (default) também passou a logar e devolver GENERIC_ERROR_MESSAGE em vez de `error.message`. WEB: lib/api-error.ts:126 `if (err.status >= 500)

### [ALTO] "Resource already exists" em inglês e sem indicar o campo duplicado

**Status:** parcial

**O que falta:** API corrigida de fato (verificado nos 17 pontos de instanciação: só client.service.ts:388 fica sem field). Falta: (a) na web, o mapa por `code` sobrescreve a mensagem específica da API — o usuário volta a ver texto genérico e o campo `field` do body não é lido em lugar nenhum (grep por `field` em lib/api-error.ts e ApiContext.tsx: ausente); (b) adm (src/context/ApiContext.tsx, branch main) e app (contexts/ApiContext.tsx) não têm camada de tradução — nesses dois a mensagem específica passa, mas por ausência de tratamento, não por design.

**Evidência:** vetequus-api/src/core/errors/errors/resourceAlreadyExistsError.ts:26-43 — construtor recebe `field?: DuplicatedField` e monta `Já existe um cadastro com este ${FIELD_LABEL[field]}...`; FIELD_LABEL cobre email/cpf/cnpj/cpfCnpj/phone/code/name/document. client.service.ts:68 `new ResourceAlreadyExistsError('email')` e :73 `('cpf')` — os dois ramos citados no achado agora são distinguíveis. error.handler.ts:66-76 devolve 409 com `{message, code:'RESOURCE_ALREADY_EXISTS', field}`. PORÉM equinology-we

### [ALTO] Limite não é snapshot; seleção não-determinística da assinatura / planos duplicados

**Status:** parcial

**O que falta:** Faltam os itens 1 e 3 da recomendação: impedir/auditar planos com nome duplicado e reproduzir o cenário 1→3 para confirmar a causa-raiz do sintoma relatado. A propagação da edição do plano segue sendo ao vivo (por design). Só o item 2 (determinismo) foi resolvido — e apenas no caminho do limite de usuários; companySignature.service.ts:710 (`calculateUpgrade`) ainda usa `signatures.find(sig => sig.status === 'ACTIVE')` sem checar expiração.

**Evidência:** FEITO: ordenação determinística — prismaCompanySignature.repository.ts:85-93 `orderBy: [{createdAt:'desc'},{id:'desc'}]`; companyUserLimit.service.ts:44-66 `findCurrentSignature` prioriza ACTIVE válida > TRIAL válida > ACTIVE expirada, com desempate por id. NÃO FEITO: signaturePlan.service.ts:37-61 (`create`) e :63-92 (`edit`) não checam nome duplicado, e prisma/schema.prisma:252-268 tem `name String` SEM `@unique`. Também não há snapshot: CompanySignature guarda só `signaturePlanId` (schema.pri

### [ALTO] POST /animal não retorna o animal criado — fluxo aninhado nunca auto-seleciona

**Status:** parcial

**O que falta:** Sintoma idêntico ao original: o onSuccess nunca dispara e o animal recém-criado não é selecionado no formulário pai. Falta `created.animal.id` (ou desestruturar) no CreateAnimalSheet. Verifiquei ApiContext.tsx:62-79: PostAPI devolve `res.json()` puro, sem desembrulhar nada.

**Evidência:** API corrigida: animal.controller.ts:84 → `return { animal: AnimalPresenter.toHTTP(result.value.animal) }`. MAS o web não foi ajustado: CreateAnimalSheet.tsx:612-630 faz `const created = await PostAPI<{id,name}>('/animal', body)` e testa `if (created?.id && onSuccess)`. O corpo real é `{ animal: {...} }`, então `created.id` continua undefined.

### [ALTO] POST /stud-farm não retorna a propriedade criada

**Status:** parcial

**O que falta:** A propriedade criada dentro do Criar animal continua não sendo auto-selecionada. Além disso, o workaround por e-mail citado na recomendação segue vivo: CreateOwnerSheet.tsx:189-193 ainda faz `GetAPI('/client?page=1')` e procura por email, embora client.controller.ts:49 já devolva `{ client: ... }`.

**Evidência:** API corrigida: studFarm.controller.ts:64 → `return { studFarm: StudFarmPresenter.toHTTP(...) }`. Web NÃO ajustado: NewPropertySheet.tsx:284-303 faz `const created = await PostAPI<StudFarm>('/stud-farm', body)` e `if (created?.id && onSuccess) onSuccess(created as StudFarm)` — `created` é `{studFarm:{...}}`, logo `created.id` é undefined.

### [ALTO] Criar animal sem selecionar Cliente falha com 'Resource not found'

**Status:** parcial

**O que falta:** A mensagem melhorou (agora 404 em PT-BR: 'Registro não encontrado. Confira os dados informados...'), mas continua sem dizer que faltou o cliente, e o front segue sem validar. A regressão do `finalClientId` calculado-e-ignorado não foi resolvida — apenas ganhou uma guarda que nunca dispara.

**Evidência:** animal.controller.ts:60-66 calcula `finalClientId = clientId || userId` e lança BadRequest se vazio — mas a linha 74 continua passando `clientId: tokenType === 'client' ? userId : clientId` (ignorando finalClientId). Para um vet, userId existe, o BadRequest nunca dispara e o service recebe clientId undefined → animal.service.ts:85-88 devolve `left(new ResourceNotFoundError())`. No web, CreateAnimalSheet handleSubmit (545-571) não valida cliente.

### [ALTO] Reagendar pela modal de status move o atendimento INTEIRO

**Status:** nao_corrigido

**O que falta:** O endpoint de split existe e funciona (appointment.service.ts:249+, usado pelo RescheduleAppointmentSheet), mas a modal de status não o utiliza. Cenário do achado permanece: reagendar o animal A move os 3 animais.

**Evidência:** ChangeAppointmentStatusSheet.tsx:150-155 — o ramo RESCHEDULED continua fazendo `PutAPI('/appointment/'+appointmentId, { startDate, endDate, description })`, que altera a data do atendimento inteiro. Não há chamada a `rescheduleSplit`/`POST /appointment/:id/reschedule`, nem verificação de quantos animais o atendimento tem, nem qualquer aviso ao usuário no JSX (linhas 271-296).

### [ALTO] Arquitetura de anexos frágil (N URLs num campo String)

**Status:** parcial

**O que falta:** Transição incompleta (expand/contract sem o contract): as colunas string continuam no schema, e services/healthService.ts:44-54 (`withAttachment`) AINDA envia o mesmo valor sob as três chaves `attachmentUrl`/`fileUrl`/`resultFileUrl` contando com o ValidationPipe sem whitelist — o hack original permanece nas telas de vacina/vermífugo/exame.

**Evidência:** Feito: api:prisma/schema.prisma `model Attachment` (recordType/recordId/url/fileName/mimeType/size/order/uploadedBy) + migration 20260730205553_add_attachments_table com backfill idempotente por `string_to_array(col, chr(10))` e WITH ORDINALITY; attachment.repository.ts; DTOs/controllers aceitam `attachments` (ex.: vaccine.controller.ts:14,26). Front: ServiceRecords.tsx:429-438 envia `attachments = toAttachmentPayload(formAttachments)` e boardRecordService.ts:1647-1649 lê a lista `attachments` c

### [MEDIO] Exame físico: "back é obrigatório" — campo exibido como "Dorso"

**Status:** parcial

**O que falta:** A metade da recomendação sobre nomenclatura PT está feita e verificada em todos os DTOs ortopédicos e odontológicos. A metade sobre alinhar os campos obrigatórios do DTO com o formulário real não foi feita (ver #15). O fallback `?? "-"` sobre string vazia continua sendo um caminho para 400.

**Evidência:** vetequus-api/src/infra/http/controllers/animal/dto/orthopedic/orthopedicService.dto.ts:45 `@IsNotEmpty({ message: 'O campo Dorso é obrigatório' })`; :35 'O campo Inspeção'; :50 'O campo Garupa'; :65 'O campo Sensibilidade'. Odontologia idem: dentistry/dentistryAssessment.dto.ts:143 'O campo Gengiva é obrigatório', :153 'O campo Raio-X é obrigatório', :59 'Informe um cemento válido'. MAS o desalinhamento DTO↔form persiste: equinology-web-v2/services/boardRecordService.ts:578-583 ainda faz `back: 

### [MEDIO] Formulário web de Exame Físico não coleta campos que o DTO exige (inspection, rump, sensibility)

**Status:** nao_corrigido

**O que falta:** Nenhuma das duas alternativas da recomendação foi executada (nem tornar opcional no DTO, nem adicionar ao formulário). O que mudou desde a auditoria: (a) as mensagens ganharam rótulo PT (achado #4) e (b) `sensibility` passou a vir do formulário via `optBool(formData.sensibility)` com comentário 'nunca fabricar false' — mas como o DTO mantém @IsNotEmpty, se o usuário não responder Sensibilidade o POST volta 400. Ou seja: o dado fantasma de inspection/rump continua entrando no prontuário e um novo caminho de 400 foi introduzido em sensibility.

**Evidência:** DTO inalterado quanto à obrigatoriedade: vetequus-api/src/infra/http/controllers/animal/dto/orthopedic/orthopedicService.dto.ts:32-36 `@IsString(...) @IsNotEmpty({message:'O campo Inspeção é obrigatório'}) inspection!: string;`, :48-51 `rump!: string` obrigatório, :63-66 `sensibility!: boolean` obrigatório. FRONT inalterado: equinology-web-v2/services/boardRecordService.ts:572-585 `buildCreateBody` continua com `inspection: "-", rump: "-"` hardcoded, e o `mapToRecord` (linhas 560-571) nem lê ess

### [MEDIO] 'Upgrade' definido apenas por userQuantity

**Status:** nao_corrigido

**O que falta:** Nada mudou. Empresa em plano ilimitado (userQuantity null) segue impedida de qualquer upgrade e plano mais barato com mais usuários segue passando como upgrade. Fica na fronteira do escopo excluído (é a regra que governa o fluxo de upgrade/Asaas), então pode ter sido deixado de fora intencionalmente.

**Evidência:** api:companySignature.service.ts:726-730 continua idêntico: `const currentLimit = currentPlan.userQuantity; const newLimit = newPlan.userQuantity; if (currentLimit === null || (newLimit !== null && newLimit <= currentLimit)) return left(new NotAllowedError());` — mesma lógica repetida em :813-817 (processUpgradeWithCreditCard) e :934-938 (processUpgradeWithPix). Preço nunca entra na decisão.

### [MEDIO] 'Resource not found' (inglês) vaza cru nas telas de auth

**Status:** parcial

**O que falta:** A enumeração de e-mails cadastrados nos endpoints públicos de recuperação continua possível (respostas diferentes para e-mail existente x inexistente). Mitigado parcialmente pelo rate limit de 5/min adicionado nos dois controllers.

**Evidência:** FEITO: api:src/core/errors/errors/resourceNotFoundError.ts:7 — 'Registro não encontrado. Confira os dados informados e tente novamente.' e code RESOURCE_NOT_FOUND; error.handler.ts:49-52 passou de GoneException(410) para 404. NÃO FEITO: RecoverPasswordCode.service.ts:33-35 e RecoverClientPasswordCode.service.ts:34-35,42,46 continuam retornando `left(new ResourceNotFoundError())` quando o e-mail não existe, em vez do 200 genérico.

### [MEDIO] Erro 'breed é obrigatório' — raça sem validação no frontend

**Status:** parcial

**O que falta:** Falta a validação no frontend com mensagem amigável antes do submit — a raça vazia continua indo para a API, que agora responde em português mas depois de um round-trip.

**Evidência:** API corrigida: animal.dto.ts:36-38 → `@IsNotEmpty({ message: 'O campo Raça é obrigatório' })` (e 'O campo Nome/Categoria é obrigatório'). Mas CreateAnimalSheet.tsx:545-571 (handleSubmit) valida APENAS `form.name` e a data; o Select de raça (linha 812-820) não tem `required`.

### [MEDIO] CEP não é persistido em lugar nenhum

**Status:** nao_corrigido

**O que falta:** O CEP segue sendo apenas insumo do ViaCEP; ao editar uma propriedade o campo continua voltando vazio. Falta migration + coluna + DTO + presenter.

**Evidência:** vetequus-api/prisma/schema.prisma — grep por 'cep' não retorna nenhum campo no model StudFarm (só falsos positivos de 'ReproductionReceptor'). CreateStudFarmDto/EditStudFarmDto (studFarm.dto.ts) não têm campo cep, e StudFarmPresenter.toHTTP não o expõe. No web, EditPropertySheet.tsx:45 continua com `useState('')` para o cep.

### [MEDIO] Cliente criado sem senha recebe senha previsível (CPF ou email)

**Status:** parcial

**O que falta:** Houve mitigação de UX, não de segurança: CreateOwnerSheet.tsx:218-224 avisa que a senha inicial é o CPF (ou o e-mail) e o app tem fluxo de primeiro acesso com código por e-mail (equinology-app-v2/app/(auth)/login.tsx:24-31). Mas a credencial previsível continua válida para login direto — não há bloqueio nem senha aleatória.

**Evidência:** client.service.ts:75 — `const passwordHash = await this.hash.hash(password ?? cpf ?? email);` continua idêntico. Não existe flag do tipo mustChangePassword/firstAccess no schema (grep vazio).

### [MEDIO] API: appointmentService.edit destrutura `status` e nunca aplica

**Status:** parcial

**O que falta:** Editar um atendimento mandando a lista de animais continua zerando status e histórico por animal.

**Evidência:** Metade feita: `status` foi removido da assinatura do edit (appointment.service.ts:184-195) e do EditAppointmentDto (appointment.dto.ts:132: '`status` foi removido: o atendimento não tem status próprio'). Mas o segundo ponto da recomendação continua aberto: linhas 227-239 ainda fazem `deleteMany({ appointmentId })` seguido de `createMany(... status: 'PENDING')` sempre que `animals` é enviado.

### [MEDIO] Fatura marcada 'Vencida' no próprio dia do vencimento

**Status:** parcial

**O que falta:** Falta normalizar o corte no backend para o FIM do dia do vencimento (BRT). Hoje o contador/aba 'Vencidas' e o filtro overdue ainda contam a fatura durante todo o dia em que ela vence — divergindo do badge da própria linha, que já está certo.

**Evidência:** Front corrigido: InvoicesTable.tsx:133-135 `isOverdue` usa `isPastDueDay(inv.dueDate)` e lib/brt.ts:176-179 compara CHAVES DE DIA (`day < brtTodayApiDate()`). Backend NÃO: api:prismaInvoice.repository.ts:111 `where: { ...base, status:'PENDING', dueDate: { lt: now } }` (aba/resumo 'Vencidas') e :185 `and.push({ status:'PENDING', dueDate: { lt: new Date() } })` (filtro overdue).

### [MEDIO] Só 'Data início' OU só 'Data fim' é silenciosamente ignorado

**Status:** nao_corrigido

**O que falta:** Nem intervalo aberto no repositório (gte sem lte), nem validação/auto-preenchimento na UI, nem aviso ao usuário. Comportamento silencioso permanece idêntico.

**Evidência:** api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts:131 `if (!startDate || !endDate) return undefined;` (inalterado). Front continua permitindo uma ponta só: PaymentsTable.tsx:305-318 são dois DateInputs independentes e 134-137 enviam cada um separadamente (`if (startIso) ... if (endIso) ...`). useFinancialData.ts:66 `const hasCustom = !!params.startDate?.trim() && !!params.endDate?.trim();` também exige as duas pontas.

### [MEDIO] Com filtro de período, status 'Pago' e modais enxergam só as parcelas do período

**Status:** nao_corrigido

**O que falta:** Nada mudou: parcelamento de 12x com só a parcela do mês paga continua aparecendo como 'Pago', e as modais de detalhes/pagar continuam vendo apenas o subconjunto do período.

**Evidência:** api:prismaPayment.repository.ts:95-103 mantém `transactions: { where: transactionDateFilter, ... }` no include (comentário '3. CRÍTICO ... o KPI some apenas as parcelas do mês'). O PaymentDetails.presenter.ts não expõe nenhum agregado (`paidCount`/`totalCount`) — só `transactions`. Front: PaymentsTable.tsx:55-60 `derivePaymentStatus` continua com `payment.transactions.every(t => t.status === 'PAID')`; ViewPaymentSheet.tsx:90-91 calcula paid/total sobre `payment.transactions` e não faz nenhum Get

### [BAIXO] Mensagens de validação da API de atividades vazam em inglês

**Status:** parcial

**O que falta:** Erros como 'appointmentType must be shorter than or equal to 100 characters' e os aninhados 'animals.0....' continuam chegando crus ao toast.

**Evidência:** appointment.dto.ts:83-90 — só startDate/endDate ganharam PT-BR (via `@StrictDate('Informe uma data válida')`). Continuam sem `message`: `@IsUUID('4')` + `@IsNotEmpty()` de animalId (linhas 31-32), appointmentType (36-39), userId (64-66), studFarmId e o `@IsEnum(AppointmentKind)` do type. No front, o dicionário frágil segue vivo: NewAppointmentSheet.tsx:28-45, com as mesmas 7 entradas.

### [BAIXO] Listas e dropdowns de cliente não filtram soft delete (deletedAt)

**Status:** nao_corrigido

**O que falta:** A migration 20260729215802_add_client_deleted_at existe (a coluna foi criada), mas nenhum fetch/count a considera — clientes excluídos seguem selecionáveis nos dropdowns de criação.

**Evidência:** vetequus-api/src/infra/shared/database/prisma/repositories/prismaClient.repository.ts — grep por 'deletedAt' no arquivo continua retornando ZERO ocorrências. `fetchByCompanyId` (linha ~140) e `countByCompanyId` (linha ~169) não filtram nada além de companyId/query/studFarmId.

### [BAIXO] Logs de debug em produção, incluindo dados de pagamento

**Status:** nao_corrigido

**O que falta:** Nenhum log foi removido nem condicionado a `__DEV__`. Os comentários no código ainda dizem 'Remover depois que resolver'.

**Evidência:** equinology-app-v2/components/sheets/InvoicePaymentSheet.tsx:216, 245, 254, 268, 278, 285, 298, 301, 320, 335, 347, 673, 676, 679, 682 — todos os `console.log("[PIX DEBUG] ...")` continuam, inclusive :278 logando a resposta. No backend, transaction.service.ts:248 `console.log('[PIX BACK DEBUG] company.walletId vazio — abortando')` e :227/:340/:404 logando metadados.

---

# APP — 7 em aberto

### [ALTO] Nenhuma camada central de tradução de erros nos 3 frontends

**Status:** parcial

**O que falta:** 1 de 3 frontends. Na web sobram 9 pontos com `err instanceof Error ? err.message` cru (WalletCard.tsx:59, services/[id]/page.tsx:126, AudioToFormButton.tsx:333, ServiceChat.tsx:89, ServiceHistory.tsx:123, ServicePayments.tsx:85, ServicesTable.tsx:239, NewAppointmentSheet.tsx:371, odontograma-pdf-check/page.tsx:194) — como ApiContext agora lança ApiError, esses toasts exibem a mensagem crua sem passar pela máscara de 5xx.

**Evidência:** WEB CORRIGIDO: equinology-web-v2/lib/api-error.ts cria `ApiError` (message/status/code), `MESSAGE_BY_CODE` (11 codes), `MESSAGE_BY_RAW` (internal server error, unauthorized, forbidden, failed to fetch...), heurística `looksPortuguese` e `getApiErrorMessage`; context/ApiContext.tsx:16-22 `throwApiError` lança ApiError com o `code` do body em todos os 4 verbos. 50 arquivos já usam getApiErrorMessage. APP NÃO CORRIGIDO: equinology-app-v2 não tem nenhum módulo equivalente (grep por getApiErrorMessag

### [ALTO] Impossível editar atendimento ou compromisso pelo calendário

**Status:** nao_corrigido

**O que falta:** AppointmentDetailsModal e CommitmentDetailsModal seguem somente leitura (só Reagendar/Retorno/Ver detalhes). O PUT /appointment/:id existe na API, mas nenhuma tela o usa para editar tipo/título/responsável.

**Evidência:** Nenhum sheet de edição foi criado — app/(dashboard)/_components/sheets/index.ts não exporta nada do tipo Edit/UpdateAppointment. Grep por 'onEdit' e 'Editar' em app/(dashboard)/calendar/ retorna zero. RescheduleAppointmentSheet.tsx:95-99 continua recombinando o título do compromisso (`${commitmentTitle}\n${descDraft}`) a partir do valor antigo, sem torná-lo editável.

### [ALTO] Finanças busca só a página 1 da API (10 itens) — 'Carregar mais' pagina apenas localmente

**Status:** nao_corrigido

**O que falta:** Nada mudou: nem paginação incremental na API, nem busca de todas as páginas. Os totais Pendente/Pago (linhas 89+) continuam calculados só sobre os 10 primeiros de cada endpoint. A tela 'Custos e Pagamentos' do animal também não foi verificada como corrigida (mesmo padrão).

**Evidência:** equinology-app-v2/app/(tabs)/finances.tsx:33-34 `GetAPI(ApiRoutes.ClientPayment.list + "?page=1")` / `GetAPI(ApiRoutes.ClientInvoice.list + "?page=1")` — chamada única; :86 `const paged = filtered.slice(0, page * pageSize);` e :87 `hasMore = paged.length < filtered.length` — 'Carregar mais' continua só fatiando o que já foi baixado.

### [ALTO] Fatura pública é payload base64 sem assinatura

**Status:** nao_corrigido

**O que falta:** O cabeçalho do arquivo continua declarando 'o payload vai inteiro na URL para evitar dependência de backend' — a decisão de design não foi revista.

**Evidência:** equinology-web-v2/lib/invoice-share.ts:56-58 `export function encodeInvoicePayload(p) { return toBase64Url(JSON.stringify(p)); }` e :60-68 `decodeInvoicePayload` só faz base64url→JSON.parse e checa `parsed?.v !== 1 || !Array.isArray(parsed.it)`. Nenhum HMAC, nenhuma chamada ao backend, nenhum aviso.

### [MEDIO] Formulário de cartão novo sem validação: mês/ano de validade, email e CPF/CNPJ

**Status:** parcial

**O que falta:** Falta: mês 01-12, ano >= atual (e mês/ano não no passado), regex de e-mail e comprimento do número do cartão (13-19 dígitos). Os inputs têm maxLength (2/4/23) mas isso não impede '99' de mês nem ano no passado.

**Evidência:** equinology-app-v2/components/sheets/InvoicePaymentSheet.tsx:436-440 — só há `const documentError = cpfCnpjValidationError(cpfCnpj); if (documentError) { Toast... return; }`. Antes disso, :415-433 apenas checa campos não-vazios; `expiryMonth`/`expiryYear`/`email`/`number` seguem sem validação de faixa/formato.

### [MEDIO] Usuário com cartão salvo não consegue pagar com um cartão novo

**Status:** nao_corrigido

**O que falta:** Nenhum caminho na UI para cadastrar outro cartão quando já existe pelo menos um salvo.

**Evidência:** equinology-app-v2/components/sheets/InvoicePaymentSheet.tsx:732 `{creditCards.length > 0 ? (` — o ramo verdadeiro renderiza apenas a lista de cartões + botão 'Pagar com cartão selecionado' (:756-762); o bloco 'Adicionar cartão e pagar' (:766-776) continua exclusivamente dentro do `else` (:764).

### [BAIXO] Formatação de R$ inconsistente e eixo do gráfico com ponto decimal

**Status:** nao_corrigido

**O que falta:** Nenhuma das duas partes da recomendação foi aplicada.

**Evidência:** web:MonthlyEvolutionChart.tsx:129-133 — `tickFormatter={(v) => v >= 1000 ? `R$ ${(v/1000).toFixed(1)}k` : v > 0 ? `R$ ${v}` : "R$ 0"}` (ainda 'R$ 1.5k' com ponto e sem separador de milhar). Helpers duplicados continuam: InvoicesTable.tsx:119 `function formatBRL` e NewInvoiceSheet.tsx:49 `function formatBrl`. lib/format.ts exporta apenas formatCurrency/formatDate/formatTime/formatDateTime/formatToday — não há `formatCompactBRL`.

---

# ADM — 14 em aberto

### [ALTO] ADM: ApiContext quebra com erro de rede em GET/PUT/PATCH/DELETE

**Status:** nao_corrigido

**O que falta:** O ADM está na branch main (não existe fix/auditoria-qa nesse repo). O commit a4b3966 ('enhance ApiContextProvider... 401 errors') mexeu no contexto mas não replicou o optional chaining nos quatro métodos.

**Evidência:** equinology-adm-v2/src/context/ApiContext.tsx:119-120 (GetAPI), :142-143, :165-166, :188-189 — todos com `const message = err.response.data; const status = err.response.status;` sem optional chaining. Só o PostAPI (:94-97) tem `err.response?.status ?? 0` e fallback 'Não foi possível conectar ao servidor.'.

### [ALTO] ADM Financeiro: coluna 'Pago em' mostra a data de vencimento

**Status:** nao_corrigido

**O que falta:** Nem o serviço nem a interface foram alterados; a data efetiva do gateway continua não sendo propagada.

**Evidência:** vetequus-api/src/domain/application/services/admin/services/adminFinancial.service.ts:125-127 — `const dueDate = payment.dueDate ? moment(payment.dueDate) : null; const paymentDate = payment.status === 'PAID' || payment.status === 'RECEIVED' ? dueDate : null;` e :146 `paymentDate: paymentDate?.toISOString()`. A interface `PaymentHistoryItem` (:6-11) continua sem campo de data real de pagamento.

### [ALTO] ADM: datas 'YYYY-MM-DD' e UTC-midnight exibidas um dia antes

**Status:** nao_corrigido

**O que falta:** Nenhum helper de data pura foi criado nem aplicado.

**Evidência:** Não existe nenhum `formatDate` compartilhado no ADM (`grep -rn formatDate src/` só acha `formatDateInput` local do AdsForm). Continuam: financial/page.tsx:140 `new Date(t.dueDate).toLocaleDateString("pt-BR", ...)` e :210; subscriptions/_components/SubscriptionDetailModal.tsx:297 e :490; lib/coupons-api.ts:66 `new Date(c.validFrom).toLocaleDateString("pt-BR")` e :69.

### [ALTO] ADM: editar assinatura re-salva expirationDate como meia-noite UTC

**Status:** nao_corrigido

**O que falta:** Continua enviando sempre que o campo estiver preenchido (não checa se o admin alterou) e serializa como 00:00 UTC. Só o `status` tem a checagem de mudança (`editStatus !== subscription.status`).

**Evidência:** equinology-adm-v2/src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx:209-211 `new Date(subscription.expirationDate).toISOString().slice(0, 10)` e :222-223 `if (editExpiration) payload.expirationDate = new Date(editExpiration).toISOString();`.

### [MEDIO] ADM Cupons: campo Percentual/Valor abre com '0' setado

**Status:** nao_corrigido

**O que falta:** Nenhuma correção foi aplicada no repositório ADM: `git log` dos arquivos citados mostra apenas commits antigos (d1978e1, 5e3347d, f976b9d), anteriores à auditoria.

**Evidência:** equinology-adm-v2 está na branch `main` e não possui a branch fix/auditoria-qa (`git branch -a` lista apenas main / origin/main). Em src/app/(private)/coupons/_components/CouponsForm.tsx, `defaultValuesFromCoupon` (bloco de criação) continua com `value: 0` — nenhuma alteração. O zod (linhas ~50-58) segue exigindo valor maior que zero, então o default oferecido continua sendo inválido.

### [MEDIO] ADM Planos: preços interpretam dígitos como centavos e backspace preso em '0,00'

**Status:** nao_corrigido

**O que falta:** Repo ADM sem branch de correção; o comportamento de centavos (digitar 150 = R$ 1,50) permanece idêntico ao relatado.

**Evidência:** src/app/(private)/plans/_components/PlansForm.tsx:145-198 — os campos Preço cartão/PIX continuam com `parsePriceToCents(raw)` + `formatPriceFromCents(Number(field.value))` re-renderizando a cada tecla. A única salvaguarda é `raw.trim() === "" ? undefined : cents`, que só cobre select-all+delete; o backspace em "0,00" ainda produz "0,0" → parse 0 → volta a "0,00". Não há adoção do CurrencyInput/parseBrl do web.

### [MEDIO] ADM: expirationDate salva como 00:00 UTC e exibida um dia antes; DTO aceita qualquer string

**Status:** parcial

**O que falta:** O deslocamento de um dia (grava 00:00 UTC, exibe em -03:00) permanece exatamente como relatado, e o corte de acesso do TRIAL continua caindo às 21:00 BRT do dia anterior. Só a validação do DTO foi endurecida.

**Evidência:** Lado API CORRIGIDO: src/infra/http/controllers/admin/dto/adminSignature.dto.ts:27 `@IsDateString({ strict: true }, { message: 'Informe uma data de expiração válida' })`. Lado ADM NÃO CORRIGIDO: src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx:209-210 continua `new Date(subscription.expirationDate).toISOString().slice(0, 10)`, linha 223 `payload.expirationDate = new Date(editExpiration).toISOString()` (00:00 UTC) e linhas 296-297 exibem com `new Date(...).toLocaleDateString

### [MEDIO] ADM Anúncios: erro de validação em array vira toast 'undefined, undefined'

**Status:** nao_corrigido

**O que falta:** Nota: com a tradução do ValidationPipe na API (#27) o array agora traz strings em PT, mas o ADM continua descartando-as e mostrando 'undefined, undefined'.

**Evidência:** equinology-adm-v2/src/app/(private)/ads/page.tsx:106 e :144 — `res.body.message.map((m: { defaultMessage?: string }) => m.defaultMessage).join(", ")`. Continua mapeando `defaultMessage` sobre um array de strings.

### [MEDIO] ADM Planos: formulário permite criar plano sem preço

**Status:** nao_corrigido

**O que falta:** Os preços continuam opcionais no zod de criação. O commit d1978e1 tocou o PlansForm, mas só no tratamento assíncrono do submit.

**Evidência:** equinology-adm-v2/src/app/(private)/plans/_components/PlansForm.tsx:12-13 — `priceCardCents: z.coerce.number().min(0).optional(), pricePixCents: z.coerce.number().min(0).optional(),` no `planSchema`.

### [MEDIO] ADM Nova assinatura: empresa e plano pré-selecionados com o primeiro da lista

**Status:** nao_corrigido

**O que falta:** O 'valor default preso' permanece: abrir a modal e submeter cria assinatura para a primeira empresa/plano da lista sem escolha explícita.

**Evidência:** equinology-adm-v2/src/app/(private)/subscriptions/_components/SubscriptionCreateModal.tsx:56 `if (arr.length) setCompanyId(arr[0].id);` e :66 `if (normalized.length) setPlanId(normalized[0].id);`.

### [MEDIO] ADM Anúncios: sem validação de tamanho da imagem e de ordem das datas

**Status:** nao_corrigido

**O que falta:** Os dois pontos do achado permanecem abertos.

**Evidência:** equinology-adm-v2/src/app/(private)/ads/_components/AdsForm.tsx:127-145 `onFileChange` valida apenas `!file.type.startsWith("image/")` — não há checagem de `file.size`. O `superRefine` (:28-44) só valida 'ambas ou nenhuma' das datas e o escopo REGIONAL; não compara `validUntil >= validFrom`.

### [BAIXO] Painel ADM: login sem olhinho na senha

**Status:** nao_corrigido

**O que falta:** Ponto de atenção geral: o repo ADM ficou de fora do esforço de correção (não existe branch fix/auditoria-qa local nem remota). Qualquer achado de ADM deste lote deve ser presumido intocado.

**Evidência:** adm:src/app/login/page.tsx:94-100 continua `<AuthInput id="password" type="password" ... autoComplete="current-password">` fixo, e adm:src/components/auth/AuthInput.tsx não tem nenhuma referência a Eye/EyeOff nem a showPassword (grep sem resultado). Além disso o repositório ADM está na branch `main` (HEAD 9647fb5) e NÃO possui a branch fix/auditoria-qa — nenhuma correção da auditoria foi aplicada aqui.

### [BAIXO] ADM Cupons: criação sem toast de sucesso e exclusão com confirm() nativo

**Status:** nao_corrigido

**Evidência:** equinology-adm-v2/src/app/(private)/coupons/_components/CouponCreateModal.tsx:31-34 — no sucesso apenas `onSaved(); onClose();`, sem toast. Os `window.confirm` continuam: coupons/page.tsx:70 `if (!confirm("Excluir este cupom?")) return;`, plans/page.tsx:55, ads/page.tsx:151, admins/_components/AdminDetailModal.tsx:119, subscriptions/_components/SubscriptionDetailModal.tsx:106.

### [BAIXO] Clínica: limite de logo 5,5 MB vs mensagem 5 MB; ADM aninha <button> dentro de <button>

**Status:** nao_corrigido

**O que falta:** Nenhuma das duas partes foi corrigida. O commit mais recente do ADM (9647fb5) é justamente um refactor do LocationTargeting, mas apenas reformatou o JSX — o aninhamento de <button> continua.

**Evidência:** (1) equinology-web-v2/app/(dashboard)/clinic/_components/PdfSettingsCard.tsx:67-68 `if (file.size > 5.5 * 1024 * 1024) { toast.error("Logo deve ter no máximo 5 MB."); }` e :174 texto 'até 5 MB'. (2) equinology-adm-v2/src/app/(private)/ads/_components/LocationTargeting.tsx:280 abre `<button type="button" onClick={() => toggleUf(s.uf)}>` e :301-310 renderiza outro `<button type="button" onClick={(e)=>{e.stopPropagation(); clearUf(s.uf);}}>limpar</button>` dentro dele, fechando em :313.

---

# Corrigidos e confirmados

- Parcelas: o '1' não pode ser apagado no modal Nova movimentação
- CurrencyInput: valor zera no blur e o required bloqueia o salvamento
- CurrencyInput: ponto tratado como milhar corrompe '1.5' → 15
- Sheets de estoque: quantidade inicia em 1 preso e vira '0 preso' ao apagar
- APP Signup: '(' do telefone nunca pode ser apagado
- APP Pagamento de fatura: Telefone e CPF/CNPJ do cartão sem maxLength nem máscara
- API: CreatePaymentDto aceita amount 0/negativo e quantity 0/negativo
- Estoque mínimo (Add/EditProductSheet): digitar '0' faz o dígito sumir
- CurrencyInput não representa 0 nem valores negativos
- API aceita qualquer string como data de nascimento do animal
- App mobile aceita datas de calendário impossíveis (31/02)
- Filtro de datas do financeiro corta registros do último dia
- DateInput aceita data impossível e descarta o valor em silêncio
- Preenchimento por áudio injeta birthDate sem normalizar
- Filtro 'Vence de/até' das faturas corta o último dia e aceita lixo
- Estatísticas de transação excluem o último dia do período
- Filtro por data das Anotações compara o dia em UTC
- App: data de nascimento do animal exibida um dia antes
- Campos de data sem indicador de dropdown (chevron)
- @IsDateString sem strict aceita datas de calendário inválidas em dezenas de DTOs
- Datas de filtro de leads (CRM) validadas só com @IsString
- "Company user limit exceeded" em inglês no cadastro com código de empresa
- "breed é obrigatório" — nome técnico do campo em inglês na validação
- ~1467 decorators class-validator sem message: erros default do Nest em inglês
- "Resource not found" em inglês e mapeado para HTTP 410 Gone
- "Animal already registered" e "Not allowed" em inglês repassados cru
- Padrão sistêmico: mensagens de DTO em PT usando nome técnico do campo em inglês
- PUT /vaccine/:id usa CreateVaccineDto em vez de EditVaccineDto
- Vacinação sem próxima dose: web injeta data falsa (hoje) para contornar DTO obrigatório
- Adição manual de colaborador ignora o limite de usuários do plano
- ADM cria e move usuários entre companies sem validar limite do plano
- IDOR: qualquer usuário autenticado pode cancelar ou reembolsar assinatura de qualquer empresa
- Cancelar renovação automática derruba o acesso imediatamente
- Assinatura ACTIVE nunca expira localmente
- Trials podem ser encadeados infinitamente
- Mensagem 'Company user limit exceeded' em inglês
- Endpoint GET /user/limit-info existe mas nunca é usado
- Excluir plano com assinaturas vinculadas gera 500 (FK sem onDelete)
- Recuperar senha (web) retorna 500 quando o SMTP falha
- Mesmo 500 no recuperar senha do app mobile
- Login (web): senha capitalizada ao usar o olhinho
- Registro (web): campo de senha sem olhinho
- Recuperar senha (web): input 'Código' capitaliza e invalida o código
- Registro (web): campo 'Código da clínica' capitaliza e quebra o vínculo
- App forgot-password: input 'Código' sem autoCapitalize='none'
- API devolve o código de recuperação no corpo da resposta e loga no console
- generateRandomString off-by-one
- Recuperar senha (web): 'Nova senha' e 'Confirmar senha' sem olhinho
- App: inputs de senha com autoCapitalize/autoCorrect default quando a senha é revelada
- Logs de produção expõem companyCode e dados da empresa
- E-mails de boas-vindas/inatividade/fim de trial já protegidos (mapeamento)
- Erro 'Resource already exists' exibido cru em inglês ao duplicar email/CPF de cliente
- Voz não preenche dropdowns de Cliente/Propriedade no Criar animal
- Dropdown de Propriedade no Criar animal não filtra pelas propriedades do cliente
- Data de nascimento inválida ('60/92/9') passa sem validação de ponta a ponta
- Modal Criar propriedade não tem botão '+' para criar cliente novo
- CEP não é capturado pelo preenchimento por áudio na modal de propriedade
- Dropdowns da modal de propriedade não são preenchidos por voz (Cliente ausente; Estado como texto)
- Voz preenche campos não falados com o literal 'Não Informado'
- Telefone/CPF vindos da voz gravados com formatação inconsistente
- Modal 'Novo cliente' aninhada abre com mesmo z-index da modal pai
- Dropdowns de select por voz no Criar animal falham silenciosamente (raça/pelagem/sexo/categoria)
- Filtro de cliente por propriedade só retorna clientes que têm animal na propriedade
- Na Home o 'próximo horário livre' sobrescreve a data escolhida pelo usuário
- Parcelas: o número 1 não pode ser apagado
- CurrencyInput: zero some no blur, entrada inválida vira 0, ponto multiplica valor
- Nova Movimentação: dropdown de Animal não filtra pelos animais do cliente
- API descarta clientId e scope da movimentação
- Nova Atividade também envia clientId que a API descarta
- Botão Salvar da Nova Movimentação desabilitado sem categorias
- Dropdown de minutos limitado a 00/15/30/45
- "00 vira 50": select de minuto com valor fora da grade preserva minuto oculto
- Modal de alterar status sempre abre com "Finalizado" pré-selecionado
- Reagendar pela modal de status não volta o status do animal para "Agendado"
- Card de estoque da home: botão "Entrada" descarta o produto
- Modal de status não oferece a opção "Agendado" (PENDING)
- Entrada de estoque registrada hoje aparece com data de ONTEM
- Filtro 'pessoal/profissional' do card Pagamentos descartado pela API
- endDate vira meia-noite UTC e exclui o último dia
- PDF 'Exportar fatura' sem assinatura do veterinário
- Modal 'Pagar parcelas' 500: paymentDate 'yyyy-MM-dd' chega como string no Prisma
- Faturas sem botão de cancelar
- KPIs/saldo/gráfico calculados só com a 1ª página
- Vencimento de fatura com 1 dia a menos (off-by-one de fuso)
- Cliente de 'Nova Movimentação' obrigatório na UI mas descartado pela API
- Mensagens de erro da API em inglês nos toasts
- Datas em ISO string nos PDFs de laudo e no preview
- Anexos em PDF descartados silenciosamente no laudo
- Modal 'Laudo do atendimento' não pré-visualiza anexos
- PDF de fatura sem assinatura do veterinário
- Vacinação sem próxima dose → 500
- Laudo/prescrição misturam registros MOCK com dados reais
- Diagnóstico Inicial e Final da receptora sem discriminador
- Reprodução de animal castrado gera laudo vazio sem aviso
- Card 'Cliente' da ficha do animal despadronizado
- PUT de vacina/exame usando DTO de criação
- Código de reset de senha retornado no corpo da resposta pública mediante email+CPF
- Login com senha errada exibe 'Resource not found' em inglês
- Bug de precedência no mapper: pagamento via AppointmentAnimal perde o animal
- 'Manter conectado' não tem efeito — sessão é sempre restaurada
- Código de recuperação: teclado capitaliza a 1ª letra e o código gerado é minúsculo
- Campos de senha perdem autocapitalize/autocorrect quando o 'olhinho' é ativado
- Data de nascimento do animal aceita datas inexistentes (31/02) e futuras
- Telefone em 'Meus dados' sem máscara nem normalização
- Salvar/excluir anotação falha silenciosamente — nenhum feedback de erro
- Fatura chega ao app com nome do animal vazio
- Valores monetários sem centavos e sem separador de milhar nos totais
- Select de Propriedade exibe opção 'Carregando...' selecionável
- Estoque: data da entrada/transferência gravada como meia-noite UTC
- Atendimento > Pagamentos: vencimento um dia antes e crash 'Invalid time value'
- Mensagens de erro em inglês da API vazam cruas nos toasts (web e ADM)
- Notes: filtro por data compara dia em UTC
- Clínica: CEP sem máscara/maxLength e Nome sem obrigatoriedade
- DateInput sem validação de faixa de ano
- Assinatura (web): botão 'Ver detalhes' deveria ser 'Ver planos'
- CRM: campo Estado (UF) do lead é texto livre sem maxLength
