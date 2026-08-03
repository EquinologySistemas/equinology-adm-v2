# Triagem de alcance — o bug chega até a tela?

Frente E. **Nenhum arquivo de código foi alterado.** Só leitura dos 3 fronts
(WEB, APP, ADM) + curl contra a API em http://localhost:3333 para confirmar
cenários.

## Legenda do veredito

| Veredito | Significado |
|---|---|
| **ALCANCAVEL** | Usuário comum reproduz pela tela, com o payload que o front realmente monta. Corrigir. |
| **SO_VIA_API** | A rota é usada, mas o campo/valor que dispara o bug a interface nunca envia. Risco só com chamada manual (usuário malicioso com token válido). Prioridade menor. |
| **NAO_USADO** | Nenhum dos 3 fronts chama essa rota (ou esse verbo). Rota morta hoje. |

## Onde cada front bate

- **WEB** (`equinology-web-v2`): clínica. É o único que consome fichas clínicas,
  estoque, financeiro, agenda.
- **APP** (`equinology-app-v2`): proprietário. Só token de cliente. Catálogo em
  `lib/api-routes.ts` — **atenção: várias rotas estão declaradas ali e não são
  usadas por nenhuma tela** (Appointment.create/update/delete, Vaccine.create/
  update/delete, Exam/Shoeing/Deworming write, SanitaryProtocol write).
- **ADM** (`equinology-adm-v2`): painel interno. **Só bate em `/admin/*`.**
  Nenhuma chamada a `/appointment`, `/product`, `/payment`, `/transaction`,
  `/vaccine` etc. (grep vazio em `src/`).

---

# 1. O caso citado pelo dono: `PUT /appointment/:id` com `animals`

**Confirmado: o WEB nunca envia `animals` no PUT.** São 4 pontos de chamada,
todos sem o campo:

| Arquivo:linha | Corpo enviado |
|---|---|
| `equinology-web-v2/app/(dashboard)/_components/sheets/EditAppointmentSheet.tsx:84` | `{ description }` — há comentário explícito no código: *"Só a descrição. SEM `animals`"* |
| `equinology-web-v2/app/(dashboard)/_components/sheets/RescheduleAppointmentSheet.tsx:181` | `{ startDate, endDate, description }` |
| `equinology-web-v2/app/(dashboard)/_components/sheets/RescheduleAppointmentSheet.tsx:204` | `{ description }` |
| `equinology-web-v2/app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:151` | `{ startDate, endDate, description }` |

`animals` só é enviado no **POST** `/appointment` (criação) e no
`POST /appointment/:id/reschedule`. O APP não chama PUT /appointment (rota
declarada em `api-routes.ts:75` e sem nenhum consumidor). O ADM não chama.

### Prova por curl (atendimento f4c03ed6, 2 animais)

```
PUT /appointment-animal/1dabd4d7  {"status":"IN_PROGRESS"}          -> 200
PUT /appointment/f4c03ed6  {"description":"..."}   (payload do web) -> 200
   banco: 1dabd4d7=IN_PROGRESS, 54d645bf=PENDING   (ids e status INTACTOS)

PUT /appointment/f4c03ed6  {"description":"...","animals":[...2...]} -> 200
   banco: ids agora 6edc6eeb e 98c3c4e5 (NOVOS) e ambos PENDING
```

O bug existe e é grave — mas **não é alcançável pela tela**.
**Veredito: SO_VIA_API.** Vale o mesmo para os dois achados irmãos
(`animals` + ficha existente = 500 com gravação parcial; `animals: []` aceito e
descartado).

---

# 2. Tabela — BLOQUEIA O LANÇAMENTO

## ATENDIMENTO

| Achado | Rota | Front (arquivo:linha) | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| DELETE devolve 500 quando o atendimento tem animal (2 achados duplicados) | `DELETE /appointment/:id` | **nenhum**. WEB: nenhum `DeleteAPI("/appointment...")`. APP: `lib/api-routes.ts:76` declarado, zero consumidores. ADM: n/a | — | **NAO_USADO** (curl confirma o 500: `DELETE /appointment/f4c03ed6 -> 500`) |
| PUT com `animals` apaga histórico de status e troca os ids | `PUT /appointment/:id` | web `EditAppointmentSheet.tsx:84`, `RescheduleAppointmentSheet.tsx:181/204`, `ChangeAppointmentStatusSheet.tsx:151` | **Não.** Nenhum dos 4 manda `animals` | **SO_VIA_API** |
| PUT com `animals` em atendimento com ficha: 500 + gravação parcial | `PUT /appointment/:id` | idem acima | **Não** | **SO_VIA_API** |
| Filtro de data filtra por `createdAt` e não por `startDate` | `GET /appointment-animal` | **nenhum**. Grep `appointment-animal` nos 3 repos só devolve `PUT /appointment-animal/:id`. O GET não é chamado | — | **NAO_USADO** |

> A listagem de atendimentos do web usa `GET /appointment/fetch`
> (`services/appointmentService.ts:116`), que tem DTO e filtro de data correto.
> `GET /appointment-animal` é rota morta hoje.

## CLINICO

| Achado | Rota | Front (arquivo:linha) | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| App do proprietário recebe 403 nas 4 telas de saúde | `GET /vaccine|deworming|exam|shoeing/:animalId` (+`/soon`) | app `app/(animal)/health/index.tsx:46-49`, `vaccines.tsx:32`, `dewormings.tsx:32`, `exams.tsx`, `shoeing.tsx:44` | Sim — o app usa token de cliente (`companyId: 'no-company'`), que é exatamente o que quebra | **ALCANCAVEL** |
| Tela de Protocolos sempre 400 (app não manda `studFarmId`) | `GET /sanitary-protocol` | app `app/(animal)/health/protocols.tsx:34`, `health/index.tsx:50` — monta `ApiRoutes.SanitaryProtocol.list + "?page=1"`, sem `studFarmId` | Sim (a ausência é o problema) | **ALCANCAVEL** |
| `nextDate:null` não limpa a próxima dose | `PUT /vaccine|deworming|exam|shoeing/:id` | web `services/healthService.ts:97,145,195,~250` | **Não manda `null` — manda o campo AUSENTE.** `toApiDate()` (linha 24-29) devolve `undefined` para string vazia e o `JSON.stringify` derruba a chave | **ALCANCAVEL** — ver alerta abaixo |

### Alerta sobre `nextDate` (verificado hoje, 02/08)

A API **já foi corrigida** por outra frente: `PUT /vaccine/:id {"nextDate":null}`
-> 200 e a coluna vai a NULL (confirmado em SQL).

**Mas o bug continua na tela**, porque o web nunca manda `null`:

```
PUT /vaccine/e20133ec {"nextDate":null}                      -> 200, nextDate = NULL   (API OK)
PUT /vaccine/e20133ec {"nextDate":"2026-07-10T12:00:00Z"}    -> 200, nextDate = 2026-07-10
PUT /vaccine/e20133ec {"name":"...","date":"...","location":"L"}  (payload do web quando
                                                              o usuário APAGA o campo)
                                                             -> 200, nextDate CONTINUA 2026-07-10
```

**Pendência para a frente do front:** `equinology-web-v2/services/healthService.ts`
precisa enviar `nextDate: null` (e não `undefined`) quando o campo estiver vazio,
nas 4 fichas. Sem isso a correção da API não resolve nada para o usuário.

## DINHEIRO / ASSINATURA

| Achado | Rota | Front (arquivo:linha) | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| `upgrade/pix` derruba o acesso antes do pagamento | `POST /signature/upgrade/pix` | web `app/(dashboard)/subscription/page.tsx:138` | Sim, fluxo normal do botão "fazer upgrade" | **ALCANCAVEL** |
| Reembolso não cancela a recorrência | `PUT /signature/refound/:id` | **nenhum**. Web usa `/signature/cancel/:id` (`subscription/page.tsx:180`); ADM usa `/admin/signature/cancel` e `/charge` (`SubscriptionDetailModal.tsx:108,129`). Grep de `refound` nos 3 fronts = 0 | — | **NAO_USADO** (só operação manual/suporte) |
| Trial pago no cartão fica `paymentType=PIX` e a renovação não estende | `POST /signature/credit/new` + webhook | web `app/(auth)/plans/page.tsx:155` (start-trial) e `app/(auth)/checkout/[id]/page.tsx:357` (credit/new) | Sim — é o funil padrão trial → cartão | **ALCANCAVEL** |
| Cartão nunca é salvo; `GET /credit-card` sempre vazio | `POST /signature/credit/new`, `GET /credit-card` | app `components/sheets/InvoicePaymentSheet.tsx` (`ApiRoutes.CreditCard.list`) | Sim — a tela "pagar com cartão salvo" do app lê essa rota e sempre vem vazia | **ALCANCAVEL** |
| `POST /signature/credit/existing` inutilizável (404) | `POST /signature/credit/existing` | **nenhum front chama** (o web só usa `credit/new`) | — | **NAO_USADO** |
| Webhook `SUBSCRIPTION_CREATED` ativa sem pagamento | `POST /signature/webhook` | não é chamada de front — **quem dispara é o Asaas**, automaticamente, ao criar a recorrência | n/a | **ALCANCAVEL** (não depende de ação do usuário; acontece sozinho em produção) |
| Duplo clique cria duas assinaturas recorrentes | `POST /signature/pix/:planId` | web `app/(auth)/checkout/[id]/page.tsx:291` | Sim — botão de checkout, duplo clique é o caso trivial | **ALCANCAVEL** |
| Upgrade grava o preço promocional como valor recorrente | `POST /signature/upgrade/pix` (e `/credit`) | web `subscription/page.tsx:138` (**só o pix**; `upgrade/credit` não é chamado por nenhum front) | Sim, no caminho PIX | **ALCANCAVEL** (via `upgrade/pix`) |
| Rotas de pagamento de `/transaction` não checam o dono | `POST /transaction/pix/:id`, `/credit/new`, `/credit/existing` | app `components/sheets/InvoicePaymentSheet.tsx` (`ApiRoutes.Transaction.*`); o id vem de `GET /client-payment`, ou seja sempre do próprio cliente | O front nunca manda id alheio | **SO_VIA_API** (mas continua risco real: basta um cliente autenticado adivinhar/descobrir um id) |
| `bankPaymentId` nunca gravado em `transactions` | `POST /transaction/pix|credit/*` | app `InvoicePaymentSheet.tsx` | Sim — todo pagamento normal do app cai nisso | **ALCANCAVEL** |
| `change-plan` cancela a recorrência e não cria outra | `POST /admin/signature/change-plan/:id` | adm `src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx:145` | Sim, botão de trocar plano | **ALCANCAVEL** |
| `reactivate`/`renew-yearly` criam assinatura nova a cada clique | `POST /admin/signature/reactivate|renew-yearly/:id` | adm `SubscriptionDetailModal.tsx:115` e `:122` (botão em `:366`) | Sim, botões do painel | **ALCANCAVEL** |

## FINANCEIRO / ESTOQUE

| Achado | Rota | Front (arquivo:linha) | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| Quantidade negativa cria estoque do nada | `POST /product-usage/usage` | web `app/(dashboard)/_components/sheets/stock/StockOutputSheet.tsx:116` | **Não.** `NumberInput min={1}` (linha 169) + guarda `if (!quantity \|\| quantity <= 0) return` (linha 100). Também nunca envia `appointmentAnimalId` | **SO_VIA_API** |
| Quantidade negativa aceita na entrada | `POST /product-stock` | web `AddStockEntrySheet.tsx:100` e `AddProductSheet.tsx:100` | **Não.** `min={1}` + guarda `quantity <= 0`. E o web **nunca envia `unitValue`** (o achado também cita unitValue/totalValue negativos) | **SO_VIA_API** |
| `/stock-statistics` nunca desconta o consumo | `GET /stock-statistics` | web `app/(dashboard)/stock/_components/StockStatisticsKpis.tsx:58` | Sem parâmetro — o erro é do cálculo do backend | **ALCANCAVEL** |
| `DELETE /product` apaga em cascata histórico e consumo | `DELETE /product/:id` | web `app/(dashboard)/stock/_components/StockProductsTable.tsx:123` | Sim, botão de excluir produto na tabela | **ALCANCAVEL** |
| `PUT /product-category/:id` exige campo que o controller ignora | `PUT /product-category/:id` | **nenhum**. Web só faz `GET /product-category` e `POST /product-category` (`AddProductSheet.tsx:142`, `EditProductSheet.tsx:130`). Não existe edição de categoria de produto na tela | — | **NAO_USADO** |
| `PUT /reproduction-donor-ovulation/:id` responde 200 e não grava nada | `PUT /reproduction-donor-ovulation/:id` | web `services/boardRecordService.ts:1729` (`editRecord`), seção `path: "reproduction-donor-ovulation"` na linha 787 | Sim — é a edição normal da ficha | **ALCANCAVEL** (verificado hoje: **já corrigido**, PUT 200 e os 5 campos persistiram) |
| 6 módulos: o GET ignora o filtro de atendimento | `GET /reproduction-breeding-intermediate`, `/reproduction-breedingPregnancy`, `/reproduction-donor-insemination`, `/reproduction-receptor-inovulation`, `/reproduction-receptor-monitoring`, `/reproduction-stallion-collection` | web `services/boardRecordService.ts:1639-1648` (`fetchRecords`), seções nas linhas 1306, 1369, 826, 1026, 1209, 1517 | Sim — o web manda `appointmentId=<appointmentAnimalId>` em toda abertura de ficha | **ALCANCAVEL** (verificado hoje: **já corrigido**; ver curl abaixo) |
| `PUT /payment` não atualiza nenhuma parcela | `PUT /payment/:id` | web `app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx:90` — corpo `{name, amount, type, quantity, categoryId, animalId?}` | **Sim, manda os 5 campos exatos que não propagavam** | **ALCANCAVEL** (verificado hoje: **já corrigido**; ver curl abaixo) |
| `GET /transaction?clientId=` não retorna nada | `GET /transaction` | **nenhum**. Grep em `web/app|services|hooks|lib|context`: só existe `PUT /transaction/:id` (`PayTransactionSheet.tsx:100`) e `/transaction-category`. O extrato da tela usa `GET /payment` (`useFinancialData.ts:96`) | — | **NAO_USADO** |
| `GET /transaction/statistics?animalId=` sempre zero | `GET /transaction/statistics` | **nenhum front chama** | — | **NAO_USADO** |

### Curl das duas correções já aplicadas por outras frentes

Filtro de atendimento nas fichas (parâmetros idênticos aos que o web monta):

```
POST /reproduction-breedingPregnancy/98c3c4e5 {"observation":"PREG-98c3c4e5",...} -> 201
POST /reproduction-breedingPregnancy/f5316052 {"observation":"PREG-f5316052",...} -> 201
GET  /reproduction-breedingPregnancy?page=1&animalId=03bf275f&appointmentId=98c3c4e5
     -> 200, 1 registro (PREG-98c3c4e5), pages=1     [antes vinham os 2]
GET  ...&appointmentId=f5316052 -> 200, 1 registro (PREG-f5316052), pages=1
```

`PUT /payment` propagando para as parcelas:

```
POST /payment {name:"TriagemE Edit3x",amount:300,quantity:3,...} -> 201
   SQL: 3 parcelas | soma 300 | nome "TriagemE Edit3x"
PUT  /payment/40307988 {name:"TriagemE Edit6x",amount:600,type:"INCOME",quantity:6,categoryId}
   (payload idêntico ao UpdatePaymentSheet)               -> 200
   SQL: 6 parcelas | soma 600 | nome "TriagemE Edit6x"    [antes: 3 | 300 | nome antigo]
```

## OUTROS

| Achado | Rota | Front (arquivo:linha) | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| `DELETE /user/:id` 500 para veterinário que já atendeu | `DELETE /user/:userId` | web `services/clinicService.ts:85` | Sim — excluir colaborador é botão da tela `/clinic`; qualquer vet que já atendeu cai no 500 | **ALCANCAVEL** |
| `PUT /animal/:id` regenera o `code` a cada edição | `PUT /animal/:id` | web `app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:597` | Sim — qualquer edição de animal (nome, pelagem…) invalida o convite já entregue | **ALCANCAVEL** |
| `DELETE /client/:id` 500 quando o cliente tem animal | `DELETE /client/:clientId` | **nenhum**. Grep de `DeleteAPI` no web: `/invoice`, `/note`, `/animal-note`, `/reminder`, `/product`, `/user`, `/board`, `/lead`, `/vaccine`, `/deworming`, `/exam`, `/shoeing`. Não há exclusão de cliente na tela | — | **NAO_USADO** |
| `/note` e `/reminder`: qualquer usuário edita/apaga o do colega | `PUT|DELETE /note/:id`, `/reminder/:id` | web `NotesTable.tsx:385-389`, `DashboardRemindersCard.tsx:139`, `services/noteService.ts:52`, `reminderService.ts:70` | O id vem sempre da lista, e a lista (`GET /note`) já é filtrada por `userId` — o usuário nunca vê o id do colega | **SO_VIA_API** |

## SEGURANCA / ISOLAMENTO

| Achado | Rota | Front (arquivo:linha) | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| `GET /appointment/client` vaza CPF/e-mail/telefone/valores de outro cliente (2 achados) | `GET /appointment/client` | app `app/(tabs)/agenda.tsx:74` e `app/(animal)/vet/index.tsx:88` | Sim — basta abrir a agenda do app | **ALCANCAVEL** (reproduzido hoje, ver abaixo) |
| Usuário excluído continua com acesso por 90 dias | `DELETE /user/:id` + todas as rotas | web `clinicService.ts:85` demite; o token do demitido continua válido | n/a — não depende de campo | **ALCANCAVEL** |
| Sequestro de animal de outro tenant | `POST /animal/register/:code` | web `CreateAnimalSheet.tsx:534` (campo de texto livre onde o usuário cola o código) e app `components/sheets/AnimalRegistrationSheet.tsx` (`ApiRoutes.Animal.registerByCode`) | Sim — o campo aceita **qualquer** código de 8 chars, sem validação de origem | **ALCANCAVEL** |
| Propriedade sem cliente visível/editável por todas as empresas | `GET /stud-farm`, `PUT /stud-farm/:id` | web `NewPropertySheet.tsx:282` envia `clientId: formData.clientId \|\| undefined` e **não há nenhuma validação exigindo cliente** no `handleSubmit` | Sim — cadastrar propriedade sem cliente é o caminho normal do formulário | **ALCANCAVEL** |
| Código de recuperação de senha do cliente reutilizável | `PUT /client/password-code` | app `app/(auth)/forgot-password.tsx` e `app/(auth)/login.tsx` (`ApiRoutes.Client.passwordCode`) | n/a — o defeito é o código não ser queimado | **ALCANCAVEL** |
| `POST /lead` aceita `boardId` de outra empresa | `POST /lead` | web `services/crm/leadService.ts:41` — `boardId` vem do kanban do próprio usuário | **Não** manda id alheio | **SO_VIA_API** |
| `POST /owner-note/:appointmentAnimalId` sem validar o atendimento | `POST /owner-note/:aaId` | web `services/boardRecordService.ts:1707` (`createRecord`), seção `owner-note` na linha 354. O `appointmentAnimalId` e o `animalId` vêm da tela do atendimento aberto | **Não** manda ids de outro tenant nem `animalId` divergente | **SO_VIA_API** |
| `POST /payment` aceita `categoryId` de outra empresa | `POST /payment` | web `NewPaymentSheet.tsx:165` — `categoryId` escolhido do `GET /transaction-category` da própria empresa | **Não** | **SO_VIA_API** |
| Token de admin desativado/apagado segue com acesso 90 dias | 38 rotas `/admin/*` | adm inteiro (`src/app/(private)/*`) | n/a | **ALCANCAVEL** |
| Role `support` com poder de super_admin | 38 de 40 rotas `/admin/*` | adm inteiro | n/a | **ALCANCAVEL** |

### Curl do vazamento de `GET /appointment/client`

```
POST /appointment  {animals:[<animal do Cliente X>, <animal do Cliente Y>]}  -> 201
POST /client/token {"clientId":"<Cliente X>"}                                -> token de cliente
GET  /appointment/client?page=1   (a chamada exata de agenda.tsx:74)         -> 200
  outros clientes expostos: 1
  ('Mariana Duarte', '236.881.904-30', 'cliente4.demo@equinology.com.br',
   '(67) 99844-0004', 'd21dd8d5-1609-4258-bbb6-05cf287c63b5')
```

Nome, CPF, e-mail, telefone e o `code` de vínculo do outro proprietário.

---

# 3. Tabela — GRAVE (os que dependem de campo/parâmetro)

| Achado | Rota | Front | Envia o campo problemático? | Veredito |
|---|---|---|---|---|
| `PUT /client` aceita `cpf` e nunca grava | `PUT /client/:id` | web `CreateOwnerSheet.tsx:153` monta `{name, phone, email, cpf}` e **existe campo CPF no formulário de edição** (linha 133). App **não** manda cpf (`profile.tsx:115` só `name`+`phone`) | **Sim (web)** | **ALCANCAVEL** — reproduzido hoje: `PUT /client/39839e52 {...,"cpf":"00143632086"} -> 200`, SQL `cpf` e `paymentId` continuam NULL |
| UUID malformado → 500 (todas as famílias: atendimento, fichas 41/41, saúde 27 rotas, admin 13 rotas, estoque 9, financeiro 4, portal 8) | várias | os fronts sempre passam ids vindos da própria API | **Não** | **SO_VIA_API** (higiene de API; mensagem ruim, não bug de uso normal) |
| `page=0` / `page=-1` → 500 em ~todas as listagens | várias | paginadores começam em 1; `boardRecordService.fetchAllRecords` itera de 1 até `pages` | **Não** | **SO_VIA_API** |
| `PUT /appointment-animal` sem DTO (aceita status inválido, 300 chars, RESCHEDULED solto) | `PUT /appointment-animal/:id` | web `services/[id]/page.tsx:138,167`, `ChangeAppointmentStatusSheet.tsx:158,161`, `QuickStartAppointmentSheet.tsx:103`, `ReturnAppointmentAnimalSheet.tsx:141`, `ReturnAppointmentSheet.tsx:84` — **todos mandam só `{status: <enum válido>}`**; nunca `appointmentType`, nunca `RESCHEDULED` | **Não** | **SO_VIA_API** |
| `state=SP` derruba `/appointment-animal` | `GET /appointment-animal` | rota não é chamada | — | **NAO_USADO** |
| `city`/`breed` case-sensitive; `startDate=abc` → 500 | `GET /appointment-animal` | rota não é chamada | — | **NAO_USADO** |
| `PUT /appointment` com `animals: []` | `PUT /appointment/:id` | nenhum front manda `animals` no PUT | **Não** | **SO_VIA_API** |
| `status=RESCHEDULED` rejeitado em `/appointment/fetch` | `GET /appointment/fetch` | web `ServicesTable.tsx:220-223` filtra explicitamente e só envia PENDING/IN_PROGRESS/FINISHED; o `<Select>` (linha 426) nem oferece "Reagendado" | **Não** (não dá 400) | **SO_VIA_API** — mas fica a **lacuna de produto**: não há como listar atendimentos reagendados na tela de Atendimentos |
| `month` fora de 1..12 → 500 | `GET /appointment/monthly` | web `context/GlobalContext.tsx:472`, mês derivado de `Date` | **Não** | **SO_VIA_API** |
| `endDate < startDate` aceito | `POST/PUT /appointment`, reschedule | web sempre manda `endDate: form.startDate` (`NewAppointmentSheet.tsx:346`) e `endDate: date` no reagendamento | **Não** | **SO_VIA_API** |
| Token de cliente derruba listagens da clínica com 500 | `GET /appointment/fetch|daily|monthly`, `/client`, `/invoice`, `/board` | app não chama nenhuma delas (`Appointment.fetch/monthly/daily` declarados em `api-routes.ts:68-73`, zero consumidores) | — | **NAO_USADO** |
| `PUT /deworming/:id` exige `dewormingId` no corpo | `PUT /deworming/:id` | web `healthService.ts:145` manda `{name, date, nextDate, description, animalId}` — **sem `dewormingId`** | **Sim, a ausência é o problema** | **ALCANCAVEL** — editar vermifugação pela tela dá 400 |
| Enum inválido → 500 em shoeing/sanitary-protocol | `POST/PUT /shoeing`, `/sanitary-protocol/*` | web manda `type` de `<Select>` fechado; app não escreve nessas rotas | **Não** | **SO_VIA_API** |
| `userId` inexistente → 500 | `POST /vaccine`, `/shoeing` | `userId` vem do usuário logado | **Não** | **SO_VIA_API** |
| `PUT /admin/companies` descarta `phone`, `logoUrl`, `pixKey`, `signatureUrl` | `PUT /admin/companies/:id` | adm `CompanyDetailModal.tsx:104` envia só `{name, address, number, postalCode, walletId, cnpj}` | **Não manda os 4** | **SO_VIA_API** — porém confirma o segundo ponto do achado: **não existe campo de telefone no painel**, e é o telefone que quebra a criação de assinatura |
| Empresa criada pelo painel não consegue assinar / `charge` 404 | `POST /admin/companies` + `/admin/signature/create`, `/charge/:id` | adm `CompanyCreateModal.tsx:98`, `SubscriptionCreateModal.tsx`, `SubscriptionDetailModal.tsx:129` | Sim — fluxo padrão do operador | **ALCANCAVEL** |
| `GET /admin/signature` 500 com query inválida | `GET /admin/signature` | adm `subscriptions/page.tsx:13` | Os filtros da tela são fechados | **SO_VIA_API** |
| `PATCH /admin/signature/:id` devolve entidade crua (`_id`/`props`) | `PATCH /admin/signature/:id` | adm `SubscriptionDetailModal.tsx` | Sim — a tela salva e recebe `id: undefined` | **ALCANCAVEL** |
| `DELETE /invoice` apaga fatura já PAGA | `DELETE /invoice/:id` | web `InvoicesTable.tsx:463` — o `confirm()` (linha 446) **não checa o status**, o botão aparece para fatura PAID | Sim | **ALCANCAVEL** |
| `PUT /invoice` com `paidAt` não-data → 500 | `PUT /invoice/:id` | web `InvoicesTable.tsx:301` manda `new Date().toISOString()` | **Não** | **SO_VIA_API** |
| Editar valor de fatura já paga não reflete no caixa | `PUT /invoice/:id` | web só faz PUT com `{paidAt}` (linha 301) e `{status:"CANCELED"}` (linha 432). Não há edição de `amount` na tela | **Não** | **SO_VIA_API** |
| `POST /invoice` aceita valor negativo/zero | `POST /invoice` | web `NewInvoiceSheet.tsx:269` — `amount: calculatedTotal`, somatório dos itens | **Não** pelo caminho normal | **SO_VIA_API** |
| `POST /transaction` aceita valor negativo | `POST /transaction` | **nenhum front faz POST /transaction** | — | **NAO_USADO** |
| Busca por texto de `GET /transaction` ignorada; `page<=0` | `GET /transaction` | rota não é chamada | — | **NAO_USADO** |
| Estoque insuficiente no volante responde 403 com mensagem errada | `POST /field-stock`, `PUT /field-stock/:id` | web `SendGeneralToVolanteSheet.tsx:110` pré-valida contra `available` (linha 93) | Só se o saldo estiver **desatualizado/`null`** (produto ainda carregando, ou dois usuários simultâneos) — aí o 403 chega na tela | **SO_VIA_API** na maioria dos casos; **corrida real existe** |
| Exclusão bloqueada por vínculo devolve 500 cru | `DELETE /product-category/:id`, `/tag/:id`, `/board/:id` | `DELETE /board/:id` é usado: web `services/crm/boardService.ts:45`. `product-category` e `tag` não têm DELETE na tela | Sim (board) | **ALCANCAVEL** para `/board`; **NAO_USADO** para product-category e tag |
| `leadQuantity` do kanban ignora o filtro | `GET /board` | web `services/crm/boardService.ts` | Sim | **ALCANCAVEL** |
| Kanban entrega no máximo 10 leads por coluna | `GET /board` | web `boardService.ts` | Sim | **ALCANCAVEL** |
| Filtro `color` de `GET /animal` descartado | `GET /animal` | **nenhum**. `color` só aparece como campo do formulário de cadastro (`CreateAnimalSheet.tsx:870`, "Pelagem (opcional)"); nenhum `params.set("color", ...)` em `app/`, `services/` ou `context/` | **Não** — a tela não tem filtro de pelagem | **NAO_USADO** |
| `gender`/`sex` inválidos → 404 "Registro não encontrado" | `POST/PUT /animal` | web `CreateAnimalSheet.tsx` usa `<Select>` fechado | **Não** | **SO_VIA_API** |
| `41/41` fichas aceitam `userId` de outra empresa | `POST/PUT` das 41 rotas | web `boardRecordService.ts` envia `userId: ctx.userId` (usuário logado) | **Não** | **SO_VIA_API** |
| Parâmetro `appointmentId` do GET só casa com `appointmentAnimalId` | `GET` das 41 rotas de ficha | web `boardRecordService.ts:1639-1642`: `appointmentId: appointmentAnimalId` — **o front já manda o id certo** | Manda o correto | **NAO_ALCANCAVEL hoje** — a hipótese "vira BLOQUEIA em 35 módulos" do relatório **não se confirma**. Fica só a fragilidade do nome do parâmetro |
| Anexo público e permanente no R2; upload confia no mimetype | `POST /file` | web/app usam upload de anexo normalmente | Sim (o vazamento é do storage) | **ALCANCAVEL** para "anexo público"; **SO_VIA_API** para o forjamento de mimetype |
| `GET /coupons/validate/:code` público e sem rate limit | `GET /coupons/validate/:code` | web `checkout/[id]/page.tsx` (cupom) | Sim, rota pública | **ALCANCAVEL** |
| Token de cliente cria/edita `stud-farm` e `animal` | `POST/PUT /stud-farm`, `PUT /animal/:id` | app `AnimalRegistrationSheet.tsx` (`StudFarm.client`, `Animal.create`) e `ApiRoutes.Animal.update` | Sim — é o cadastro de animal pelo app | **ALCANCAVEL** (comportamento pode ser intencional; confirmar com o dono) |
| `DELETE /client/me` não invalida a sessão | `DELETE /client/me` | app `app/(tabs)/profile.tsx` (`Client.deleteAccount`) | Sim | **ALCANCAVEL** |

---

# 4. Rotas mortas encontradas (informação extra)

Nenhum dos 3 fronts chama:

- `DELETE /appointment/:id`
- `GET /appointment-animal` (todos os filtros)
- `GET /appointment/fetch`, `/daily`, `/monthly` **com token de cliente** (o app não usa)
- `DELETE /client/:clientId`
- `PUT /product-category/:id`
- `GET /transaction`, `GET /transaction/statistics`, `POST /transaction`
- `PUT /signature/refound/:id`
- `POST /signature/credit/existing`, `POST /signature/upgrade/credit`
- `DELETE /product-category/:id`, `DELETE /tag/:id`

Rotas declaradas em `equinology-app-v2/lib/api-routes.ts` sem nenhum consumidor:
`Appointment.fetch/create/update/delete/monthly/daily/details`,
`Vaccine/Deworming/Exam/Shoeing.create/update/delete`,
`SanitaryProtocol.create/createItem/update/updateItem/delete/deleteItem`,
`StudFarm.list/create/update`, `PublicAds.list`.

---

# 5. Resumo por prioridade

**Corrigir (ALCANCAVEL) — atendimento/financeiro/estoque/saúde/fichas:**

1. `GET /appointment/client` — vazamento de CPF/e-mail/telefone (LGPD), app abre a agenda e já vaza.
2. 4 telas de saúde do app com 403 + Protocolos com 400.
3. `nextDate` — API já corrigida, **falta o front mandar `null`**.
4. `PUT /deworming/:id` exigindo `dewormingId` que o web não manda.
5. `PUT /client` descartando o CPF (campo existe no formulário).
6. `DELETE /product` em cascata; `/stock-statistics` com quantidade errada.
7. `DELETE /user` 500 para vet que já atendeu; `PUT /animal` regenerando o code.
8. Propriedade sem cliente = furo de tenant (formulário permite criar sem cliente).
9. Sequestro por `POST /animal/register/:code` (campo de texto livre).
10. Assinatura: `upgrade/pix` corta acesso, trial→cartão, duplo clique, `credit-card` vazio, webhook `SUBSCRIPTION_CREATED`, `bankPaymentId`.
11. ADM: `change-plan`, `reactivate`, `renew-yearly`, `charge` 404, `PATCH` devolvendo entidade crua.
12. `DELETE /invoice` de fatura paga.

**Despriorizar (SO_VIA_API):** tudo de `PUT /appointment` com `animals`, quantidades negativas de estoque, `categoryId`/`boardId`/`userId` cross-tenant, UUID malformado, `page<=0`, enums inválidos, `endDate<startDate`.

**Rota morta (NAO_USADO):** ver seção 4 — vale decidir se remove ou se o front deveria estar usando.
