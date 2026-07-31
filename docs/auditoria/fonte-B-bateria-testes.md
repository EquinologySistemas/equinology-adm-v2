# Auditoria de código — Bateria de testes QA (30/07/2026)

> **Documento-fonte B** da consolidação. Verificação no código de todos os achados da bateria de testes manual.
> Preservado aqui porque o arquivo original em `docs/AUDITORIA-QA-2026-07-30.md` foi sobrescrito.
> **Nada foi corrigido** — este documento traz status, causa raiz com arquivo/linha e direção de correção.

Repos:
- **WEB** = `equinology-web-v2` (Next.js, app.equinology.com.br)
- **API** = `vetequus-api` (NestJS)
- **APP** = `equinology-app-v2` (React Native/Expo)
- **ADM** = `equinology-adm-v2`

Legenda: ✅ confirmado no código · ❌ não encontrado no código · ⚠️ parcial/precisa reprodução

---

## 1. Inputs numéricos e máscaras

### 1.1 ✅ Número "0"/"1" pré-setado que não dá pra apagar (sistema inteiro)
Não existe `NumberInput` compartilhado — o padrão defeituoso `value={num}` + `onChange: Number(e.target.value) || 1` foi clonado em **9 arquivos** do WEB. Ao apagar, `Number("")` = 0 é falsy e o `|| 1`/`|| 0` restaura o dígito na hora.
- `app\(dashboard)\_components\sheets\NewPaymentSheet.tsx:237-249` (Parcelas, estado inicial 1 na linha 62)
- `UpdatePaymentSheet.tsx:157-163` · `services\_components\ServicePayments.tsx:384-394`
- `sheets\stock\AddStockEntrySheet.tsx:148-152` · `StockOutputSheet.tsx:155-159` · `SendGeneralToVolanteSheet.tsx:138-142` · `SendVolanteToGeneralSheet.tsx:85-89`
- `NewInvoiceSheet.tsx:518-525` · `crm\_components\CreateLeadModal.tsx:194-202` (mitigado)
- Paliativo já existente no repo: `stock\AddProductSheet.tsx:269/280/293` usa `value={x === 0 ? "" : x}`.

**Correção:** estado como string (ou `number | ""`) durante a digitação, normalizando no blur/submit; extrair um `NumberInput` compartilhado e migrar as telas. Referência de padrão correto: `equinology-adm-v2\src\app\(private)\plans\_components\PlansForm.tsx:148-198`.

### 1.2 ✅ Nova movimentação: "1" das Parcelas não apaga
Mesmo bug do 1.1 — `NewPaymentSheet.tsx:235-250`.

### 1.3 ✅ Nova movimentação: valor some ao clicar fora (e bloqueia salvar)
`components\ui\currency-input.tsx`:
- `parseBRL` (linhas 14-20) devolve **0** para qualquer entrada que não entende (`R$ 500`, `abc`, colagem suja);
- `displayValue` (linha 45) exibe 0 como **string vazia** (`value > 0 ? formatBRL : ""`);
- `handleBlur` (linhas 61-66) re-parseia e **grava 0 no estado do pai** — campo `required` fica vazio → submit bloqueado.
- Bug extra: `1500.00` (ponto decimal) é interpretado como **R$ 150.000,00** (100x).
- Agravantes: `handleFocus` com `setTimeout+select()` (linhas 53-59) sobrescreve dígitos; `components\ui\modal.tsx:47-51` fecha a modal inteira num clique no overlay, sem confirmação.
- Usado em 4 lugares: `NewPaymentSheet.tsx:185`, `UpdatePaymentSheet.tsx:131`, `ServicePayments.tsx:343`, `BankAccountSheet.tsx:177`.

**Correção:** `parseBRL` distinguir "não numérico" de zero (retornar null e manter último valor válido no blur); aceitar `R$` e ponto decimal; não usar `value > 0` como teste de vazio; `select()` direto no evento; confirmar antes de fechar por clique no overlay.

---

## 2. Datas

### 2.1 ✅ Filtro de atendimentos aceita "80/50/5021" (sem feedback)
`components\ui\date-input.tsx` — o date-fns até rejeita a data, mas `handleInputChange` (154-167) trata inválido como **no-op silencioso**: sem borda vermelha, sem mensagem; no blur (169-173) apaga o texto em silêncio. Sem `min`/`max` de ano (`01/01/9999` passa de verdade). O mesmo componente está em **14 telas** (Atendimentos `ServicesTable.tsx:438`, Financeiro `PaymentsTable.tsx:302,309`, `InvoicesTable.tsx:592,599`, Calendário `DayView.tsx:93`, Notas, ServiceRecords, Manejo sanitário, Criar animal, Nova fatura, Novo pagamento, Baixar transação, Entradas de estoque…). **Corrigir o `date-input.tsx` resolve todas de uma vez.**

**Correção:** estado de erro visual + mensagem quando os 8 dígitos não formam data real; `min`/`max` de ano nos filtros.

### 2.2 ✅ Dropdowns de data sem setinha
`date-input.tsx:225-234` e `date-time-picker.tsx:192` só têm ícone `Calendar`; o `Select` do design system tem `ChevronDown` com rotação (`components\ui\select.tsx:328`). **Correção:** replicar o chevron do select nos dois componentes.

### 2.3 ✅ Criar animal salvou nascimento "60/92/9" (3 camadas)
- WEB: `CreateAnimalSheet.tsx:295` não valida `birthDate` no submit; o caminho por **voz/IA** (linha 476) injeta a string crua no body.
- APP: `AnimalRegistrationSheet.tsx:42-53` valida faixas mas aceita 31/02.
- API (última defesa, falha): `animal.dto.ts:72-74` e `:123-125` usam **`@IsString()`** — aceita qualquer coisa; controller faz `new Date(birthDate)` sem checar `Invalid Date` (`animal.controller.ts:47,73`).

**Correção:** `@IsDateString()`/`@IsDate()` + `@MaxDate` nos DTOs, guardas no controller; validação de submit no front (incl. valor vindo da IA), bloquear data futura.

### 2.4 ✅ Financeiro: filtro de data corta registros do dia 29
Fim do range nunca vira 23:59:59: front manda `"yyyy-MM-dd"` cru (`financial\page.tsx:43-68`, `PaymentsTable.tsx:132-133`, `useFinancialData.ts:56-57,73-74`) e a API aplica `lte: new Date(endDate)` (`prismaPayment.repository.ts:116-133`; faturas idem em `invoice.controller.ts:86-87` + `prismaInvoice.repository.ts:153-159`). Agravante timezone: `"2026-07-29"` é UTC → fronteira real cai às **21:00 do dia 28** local. A tela de Atendimentos faz certo (`ServicesTable.tsx:207-211` com T00:00:00/T23:59:59.999) — o Financeiro não.

**Correção:** util único de range (startOfDay/endOfDay no fuso do usuário) + normalização defensiva no backend.

### 2.5 ✅ PDFs com data em ISO string
Uma única função: `services\_data\servicePdf.tsx:67-75` (`fieldsForRecord`) faz `String(record[f.key])` ignorando `f.type === "date"`. Afeta **Laudo** (`ReportDocument.tsx:163-167`), **Receita** (risco futuro) e o preview da modal. Os demais templates (HealthRecord, Invoice, Stock) formatam certo. Na tela o mesmo dado é formatado (`ServiceRecords.tsx:750-752`) — só o caminho do PDF perdeu.

**Correção:** aplicar `formatDate()` em `fieldsForRecord` quando `type === "date"` — conserta laudo, receita e preview de uma vez.

---

## 3. Modais de cadastro (cliente, animal, propriedade)

> Nota: essas modais existem **só no WEB**. O APP mobile não tem criar cliente/propriedade nem preenchimento por voz.

### 3.1 ✅ "Resource already exists" e erros em inglês
Cadeia completa: `resourceAlreadyExistsError.ts:5` (mensagem hardcoded EN) → `client.service.ts:65,70,231,236` → `error.handler.ts:30-31` repassa `error.message` crua → `ApiContext.tsx:64-67` → `CreateOwnerSheet.tsx:105-108` joga no toast. **Não existe nenhuma camada de tradução** (84 ocorrências de `toast.error(err.message)` no WEB). Todos os 9 arquivos de `src\core\errors\errors\` estão em inglês, incl. `Company user limit exceeded`.

**Correção:** adicionar `code` estável às classes de erro + dicionário PT no front (no `ApiContext`), em vez de casar por string.

### 3.2 ✅ Telefone duplicado salva sem erro (comportamento aceito pelo time)
`schema.prisma:1641` — `phone String?` sem `@unique`; `client.service.ts:63-71` só checa email/CPF. Comportamento é exatamente o observado. Sem ação (decisão do time); se mudar, atenção a dados legados duplicados na migration.

### 3.3 ✅ Voz/OCR não seleciona cliente/propriedade no criar animal
`CreateAnimalSheet.tsx:458-474` até tenta mapear nome→ID, mas: (1) busca só na **1ª página** carregada (`dropdownClients`), sem chamar a busca server-side; (2) comparação `===` exata sem normalizar acento; (3) campos declarados à IA como `type: "text"` em vez de `select` com opções (`CreateAnimalSheet.tsx:60-61`). Agravante: `AudioToFormButton.tsx:100` preenche campos não encontrados com a string literal `"Não Informado"`.

**Correção:** disparar busca server-side com o nome falado + matching com normalização/similaridade + confirmação ao usuário; remover fallback "Não Informado".

### 3.4 ✅ Propriedade não restrita ao cliente selecionado
Front: `CreateAnimalSheet.tsx:686-705` usa `dropdownStudFarms` global, sem filtro por `form.clientId`. API: o filtro é **impossível** hoje — `studFarm.controller.ts:87-98` força `clientId = undefined` para usuário empresa e `FetchStudFarmDto` (studFarm.dto.ts:134-158) nem expõe `clientId`. O modelo suporta (`ClientStudFarm`, `StudFarm.clientId`).

**Correção:** expor `clientId` no DTO/controller; no front, recarregar propriedades ao trocar cliente e limpar `studFarmId` incompatível.

### 3.5 ✅ Falta "+" para criar cliente inline no criar propriedade
`NewPropertySheet.tsx:191-208` — só Label+Select. O padrão já existe pronto em `CreateAnimalSheet.tsx:631-643` (botão `UserPlus` "Novo" + `CreateOwnerSheet` aninhado com `nestingLevel` e `onSuccess`). É só replicar.

### 3.6 ✅ Áudio não pega o CEP nem preenche dropdowns na propriedade
- **CEP não é enviado à IA**: não existe `{ key: "cep" }` em `PROPERTY_FORM_FIELDS` (`NewPropertySheet.tsx:18-36`) e o CEP vive num `useState` separado (linha 62), fora do `formData` que o `AudioToFormButton` escreve — arquiteturalmente impossível preencher. Isso também impede o autopreenchimento ViaCEP via voz.
- **`state` (UF)** é declarado `type: "text"` mas a UI é um `Select` de siglas — a IA devolve "São Paulo" e nada casa. O prompt da rota (`app\api\audio\transcribe-to-form\route.ts:21-23`) trata `select` corretamente, mas só se o campo for declarado como select.
- `clientId` também não está na lista — dropdown de cliente nunca preenche por voz.

**Correção:** mover cep para dentro do `formData` + campo na lista (retornar só dígitos, normalizando número por extenso); declarar `state` como `select` com `options`; idem cliente.

---

## 4. Nova atividade / Nova movimentação / Estoque

### 4.1 ✅ Nova atividade: dropdown de cliente só mostra quem tem animal
`prismaClient.repository.ts:136-140` e `169-173` — o filtro por `studFarmId` é feito **só** via `Animal: { some: ... }`, ignorando os vínculos diretos `StudFarm.clientId` e `ClientStudFarm`. O caminho inverso faz certo (`prismaStudFarm.repository.ts:55-66` usa OR). Front chama com `studFarmId` em `NewAppointmentSheet.tsx:198`.

**Correção:** OR espelhando o padrão do studFarm repository (ou não enviar `studFarmId` se a regra for "todos os clientes").

### 4.2 ⚠️ Data retroativa em atividade — NÃO há bloqueio nenhum no código
`NewAppointmentSheet.tsx:522-534` não passa `min`; DTO/service da API não validam data. **Provável causa do relato da Rafaela:** na visão **Mês** do calendário, `MonthView.tsx` declara `onSelectSlot` (linha 58) mas **nunca invoca** — clicar num dia não abre a modal de criação (funciona em DayView/WeekView). Confirmar com ela por onde tentou.

**Correção:** ligar `onSelectSlot` no MonthView; se a regra for proibir retroativo, criar validação no front (min) **e** na API.

### 4.3 ✅ Nova movimentação: animais não filtram pelo cliente
`NewPaymentSheet.tsx:321-343` usa lista global de animais do `GlobalContext` (`dropdownAnimals` / `searchAnimalsForDropdown` sem `clientId` — `GlobalContext.tsx:244-254, 368-388`). O backend já aceita `clientId` no `GET /animal` (`prismaAnimal.repository.ts:212,220-221`) e o `NewAppointmentSheet.tsx:180` já usa certo.

**Correção:** busca paginada com `clientId` (mesmo padrão do NewAppointmentSheet) + limpar `animalId` ao trocar cliente.

### 4.4 ✅ Entrada de produto da home não pré-seleciona o produto
Regressão de props só na home: `app\(dashboard)\page.tsx:155-159` descarta o `productId` (`onEntry={() => { setStockProductId(null); ... }}`) e a `AddStockEntrySheet` é montada **sem** `productId` (linhas 232-236). A tabela envia o id (`DashboardGeneralStockTable.tsx:243`), a modal suporta (`AddStockEntrySheet.tsx:19-25,57-81`) e a página `/stock` faz certo (`stock\page.tsx:81-83,114-116`).

**Correção:** replicar o padrão da página /stock na home.

---

## 5. Calendário / status de atendimento

### 5.1 ✅ Minutos só 00/15/30/45 (não dá pra pôr 13:20)
`components\ui\date-time-picker.tsx:33` — `MINUTES = [0,15,30,45]` fixo, sem prop de step. Usado por **todos** os fluxos: Reagendar, Retorno (2 sheets), Novo agendamento, Lembrete, Alterar status.

**Correção:** entrada livre 0-59 ou `minuteStep` configurável.

### 5.2 ✅ Selecionar "00" vira 17:50
Causa real: o `<select>` é controlado por `value={current.getMinutes()}`, mas se o valor inicial tem minuto fora da lista (ex. 50, vindo de `defaultReturnDate()` que preserva o minuto do relógio — `ReturnAppointmentAnimalSheet.tsx:20`), **nenhuma option casa**: o browser mostra "00" mas o estado real é 50; clicar em "00" não dispara `change`. Não é bug de falsy/0.

**Correção:** injetar o minuto atual como option extra ou normalizar o valor no mount — resolvido de vez com entrada livre (5.1).

### 5.3 ✅ Não dá pra editar compromisso pessoal nem atendimento pelo calendário
Funcionalidade **inexistente**, não handler quebrado: `CommitmentDetailsModal.tsx` é somente-leitura por design; `AppointmentDetailsModal.tsx:172-208` só tem Reagendar/Ver detalhes/Retorno; `NewAppointmentSheet` é create-only (só `PostAPI`). O backend suporta `PUT /appointment/:id` (`appointment.service.ts:96-143`).

**Correção:** modo dual create/edit na `NewAppointmentSheet` + ação "Editar" nos modais. **Atenção:** enviar `animals` no PUT apaga e recria os `AppointmentAnimal` com status PENDING (perde registros) — só enviar se a lista mudou.

### 5.4 ✅ Modal de status não vem com o status atual selecionado
`ChangeAppointmentStatusSheet.tsx:73,83` — `selected` sempre inicializa `"FINISHED"` hardcoded; a prop `currentStatus` nem existe, embora `row.status` esteja disponível no chamador (`ServicesTable.tsx:301-310`). Obs.: `PENDING` (agendado) nem tem opção na lista.

**Correção:** prop `currentStatus` + representar `PENDING` nas opções.

### 5.5 ✅ Reagendar não muda status para "agendado"
`ChangeAppointmentStatusSheet.tsx:100-111` — o ramo RESCHEDULED só faz `PUT /appointment/:id` com datas; nunca toca no `AppointmentAnimal.status`. Inconsistente com o `rescheduleSplit` da API (`appointment.service.ts:220,229`), que ajusta status corretamente. Enum correto para "agendado" = `PENDING` (schema.prisma:1551-1557).

**Correção:** normalizar status para PENDING no reagendamento total (back ou front), com confirmação se o atendimento estiver IN_PROGRESS.

---

## 6. Login / Registro / Recuperar senha / Checkout / Planos / Asaas

### 6.1 ⚠️ Senha com 1ª letra maiúscula no login
- **WEB: já corrigido** (commit `e80874b`, 06/06/2026 — `noAutoCapitalize` em `login\page.tsx:110-136`). QA provavelmente testou build antigo em produção — **verificar deploy**.
- **APP mobile: CONFIRMADO** — `app\(auth)\login.tsx:304-312` não passa `autoCapitalize="none"` no campo de senha; default do React Native é `"sentences"`. **Correção:** default `autoCapitalize="none"` quando `isPassword` no `components\ui\Input.tsx`.

### 6.2 ✅ Registro sem "olhinho" na senha
`register\page.tsx:180-193` sem toggle (login tem, `login\page.tsx:120-135`). **Também falta no recover-password** (`recover-password\page.tsx:133-156`, dois campos). **Correção:** prop `showPasswordToggle` no `Input` compartilhado.

### 6.3 ✅ Recover-password → 500
`RecoverPasswordCode.service.ts:43-44` chama `sendMail` **sem try/catch**; o provider (`email\brevo.ts:43-46`) faz `throw` → 500 opaco. Provedor real = **SMTP genérico via nodemailer** (default `smtp.hostinger.com` — `brevo.ts:17-33`; driver por env `MAIL_DRIVER`). A hipótese "ZeptoMail sem créditos" só se confirma olhando o `.env` de produção (`SMTP_HOST`). O fluxo de boas-vindas já engole erro (`User.service.ts:66-73`) — o recover não.

**Correção:** try/catch com erro de domínio em PT + checar `SMTP_HOST/SMTP_FROM/MAIL_DRIVER` em produção.

### 6.4 ✅ /plans: botão Voltar "não funciona"
Ele funciona — navega para `/`, mas o `middleware.ts:49-56` valida assinatura e **devolve para /plans** (loop invisível). Agravante: o registro não cria trial (`User.service.ts:261-300`), então todo usuário novo cai nesse estado.

**Correção:** ocultar o Voltar sem assinatura ativa (ou trocar por logout) e/ou criar trial automático no registro (`POST /signature/start-trial/:planId` já existe).

### 6.5 ✅ Checkout estático após pagamento
`checkout\[id]\page.tsx` (765 linhas): **zero polling/refetch**. PIX só mostra texto estático; cartão faz sucesso otimista + redirect em 2s. Não existe endpoint de status de pagamento consultável.

**Correção:** polling em `GET /signature/current` (ou novo endpoint de status) a cada ~5s + botão "Verificar pagamento".

### 6.6 ✅ Webhook Asaas (passo a passo p/ Rafaela + risco encontrado)
Endpoint: `POST {API}/signature/webhook` (`companySignature.controller.ts:115-142`), público, autenticado pelo header `asaas-access-token` == env `ASAAS_WEBHOOK_TOKEN` (obrigatória — a API não sobe sem ela). Eventos tratados: `PAYMENT_RECEIVED/CONFIRMED`, `SUBSCRIPTION_PAYMENT_RECEIVED` (ativa PIX INACTIVE, estende cartão com idempotência), `SUBSCRIPTION_CREATED` (ativa), `SUBSCRIPTION_DELETED/CANCELLED` (inativa).

**RISCO:** `companySignature.dto.ts:182-193` — `payment` e `subscription` têm `@ValidateNested()` **sem `@IsOptional()`**; payload real do Asaas traz um OU outro → provável **400** em todo webhook, que o Asaas registra como falha e pode suspender a fila. **Corrigir o DTO antes de reconfigurar o painel.**

Passo a passo (painel Asaas → Integrações → Webhooks → Adicionar):
1. Definir `ASAAS_WEBHOOK_TOKEN` no `.env` de produção e reiniciar a API.
2. URL: `https://<host-da-api>/signature/webhook`
3. Token de autenticação: o mesmo valor da env.
4. Versão v3, envio sequencial, e-mail para falhas preenchido.
5. Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED` (+ os outros dois se existirem no catálogo).
6. Usar a fila "Webhooks pendentes" do painel para reprocessar o backlog.

### 6.7 ✅ Wallet ID (dois defeitos)
- **A (causa provável dos 500):** `src\infra\shared\bank\asaas.ts:99,147-149,185-187,205-207,213-215` lê `payment.data.errors[0].description` sem defesa — resposta 401/403/HTML do Asaas (típica de walletId inválido) vira TypeError → 500 genérico.
- **B (dinheiro):** `existsCreditCartPayment` (`asaas.ts:157-192`) **não envia o `split`** no payload — pagamento com cartão salvo vai 100% para a plataforma, sem repasse à clínica (o `newCreditCartPayment` envia certo).
- Companies self-service nascem **sem walletId** (`User.service.ts:261-269`); só o admin seta (`adminCompanyUpdate.service.ts:41`). Sem walletId: PIX dá 400 com mensagem PT, cartão dá **410** confuso.

**Correção:** try/catch + leitura defensiva no asaas.ts com log do corpo bruto; incluir `split` no existsCreditCartPayment; mensagens PT para walletId ausente.

### 6.8 Limite de usuários do plano
- **a) ✅ Mensagem em inglês:** `companyUserLimitExceededError.ts:5` → `error.handler.ts:34-35` → exibida crua no register (`register\page.tsx:111-116`).
- **b) ✅ Colaborador manual ilimitado:** `POST /user` (`User.service.ts:159-183`) só valida e-mail duplicado — **nenhuma checagem de limite**; a validação existe só no fluxo de convite por código (`User.service.ts:321-341`). Existe endpoint pronto e não usado: `GET /user/limit-info` (`user.controller.ts:204`). **Correção:** extrair a validação e chamá-la no create; consumir `/user/limit-info` na tela da clínica ("X de Y usuários").
- **c) ❌ Limite "congelado" ao editar plano para 3:** não há snapshot no código — a leitura de `userQuantity` é sempre ao vivo do `SignaturePlan` no momento da checagem (`User.service.ts:330-337`). Hipóteses a validar em runtime: assinatura ativa aponta para OUTRO plano; company sem assinatura ativa (aí nenhum limite é aplicado e `limit-info` mostra 0); cache do front. **Reproduzir consultando `GET /user/limit-info` da company afetada antes de mexer em código.**

---

## 7. Financeiro / Faturas / Assinaturas

### 7.1 ✅ Filtro "só pessoal / só profissional" não funciona
Existe **só na UI**. O front envia `scope` (`PaymentsTable.tsx:130-131`), mas o controller nunca lê (`payment.controller.ts:73-93`), o DTO não tem o campo e **não existe coluna de escopo** no schema (`Payment`, schema.prisma:506-539). O `NewPaymentSheet` até envia `scope` na criação — descartado silenciosamente (ValidationPipe sem whitelist). **Correção:** campo novo no schema + migration + propagar DTO→service→where.

### 7.2 ✅ PDF da fatura sem assinatura do veterinário
`lib\pdf\InvoiceDocument.tsx:236-361` — único template que não chama `PdfSignature` (existe em `shared.tsx:366-399`; o dado `signatureUrl` já chega via `fromCompany.ts:21,35`). Report/Prescription/HealthRecord fazem certo. **Correção:** incluir `<PdfSignature ... />` antes do footer.

### 7.3 ✅ Pagar parcelas → 500 (não é wallet)
`PayTransactionSheet.tsx:31-33,87-95` envia `paymentDate: "yyyy-MM-dd"`; o DTO tem `@IsDateString()` sem `@Type(() => Date)` (`transaction.dto.ts:161-164`) e a string chega ao Prisma, que exige ISO-8601 completo → `PrismaClientValidationError` → 500. O mesmo bug já foi corrigido **só** no `NewPaymentSheet.tsx:120-121` (comentário no código admite). **Correção:** `new Date(...).toISOString()` no front + `@Type(() => Date)` no DTO. Adjacente: `bankPaymentId` do Asaas nunca é persistido (`transaction.service.ts:241-242` + mapper sem o campo).

### 7.4 ✅ Não tem onde cancelar fatura
Meio-implementado: backend aceita `PUT /invoice/:id { status: "CANCELED" }` (`invoice.controller.ts:36-58`, enum ok), a UI tem badge/aba "Canceladas" com contador (`InvoicesTable.tsx:77,83,433`), mas **não existe o botão** — as ações são só PDF, Receber e Excluir (perde histórico). **Correção:** ação "Cancelar fatura" com confirmação, visível quando PENDING.

### 7.5 ✅ Atualizar plano cancela a assinatura atual antes do pagamento (GRAVE no PIX)
`companySignature.service.ts` — `processUpgradeWithPix` (859-992): cancela a antiga no Asaas (912-920) e a inativa (958-960) **antes** do pagamento; a nova nasce INACTIVE até o webhook. **Só clicar em "Pagar upgrade com PIX" já deixa a empresa sem plano.** Cartão (736-857) tem a mesma ordem, sem rollback se `createSubscription` falhar. **Correção:** mover cancelamento/inativação da antiga para o handler do webhook (quando a nova for confirmada), persistindo o vínculo "substituída por"; rollback em falha. Adjacente: `cancelSignature` (532-554) corta o acesso na hora, contradizendo o texto da UI ("acesso até o fim do período pago").

---

## 8. Atendimento / Exame físico / Laudos / Vacinação

### 8.1 ✅ "Back é obrigatório" (e ~404 mensagens iguais)
`orthopedicService.dto.ts:33` — `@IsNotEmpty({ message: 'back é obrigatório' })`; o rótulo PT é "Dorso" (`mock.ts:287`). O disparo acontece porque o form inicializa `""` e o `?? "-"` de `boardRecordService.ts:322-333` não cobre string vazia. Há **~404 ocorrências** do padrão `'<campo-em-inglês> é obrigatório'` na API (ortopedia, odontologia, vacina/vermífugo/exame, criar animal: `breed`, `gender`, `name`…). **Correção:** varrer os DTOs trocando pelo rótulo de negócio em PT; no front, `|| "-"` nos campos exigidos.

### 8.2 ✅ Botão com label errado no atendimento concluído
`ServicesTable.tsx:347-351` — linha FINISHED usa `ViewActionButton` (tooltip padrão "Ver detalhes") mas abre o **modal de laudo**; o mesmo label na linha 353-359 faz outra coisa. Menores: empty-state diz `Clique em "Adicionar"` mas o botão chama-se "Novo" (`ServiceRecords.tsx:692 vs 711`); ternário com dois ramos iguais (`:953`). **Correção:** `label="Ver laudo"` + alinhar textos.

### 8.3 ✅ Sem pré-visualização de anexos no laudo
`servicePdf.tsx:154-177` (`collectReportSections`) monta só título+campos e **descarta** os anexos (`attachmentUrlsForRecord` existe na linha 77 e só é usada no PDF); `AppointmentReportModal.tsx:204-229` não renderiza mídia. A tabela do atendimento em andamento tem preview (`ServiceRecords.tsx:755-765`, `MediaThumb`). **Correção:** incluir `attachments` nas seções do preview e renderizar `MediaThumb`.

### 8.4 ✅ 8 PDFs anexados → só 1 no laudo (na real: **zero** PDFs entram)
Não existe capacidade de merge de PDF: o pipeline rasteriza anexo via `<img>`+canvas (`imageToDataUrl.ts:11-32` — PDF cai no onerror → null → filtrado em silêncio, `servicePdf.tsx:87-92`) e o próprio proxy **rejeita** não-imagem com 415 (`app\api\image-proxy\route.ts:26-30`). Nenhuma lib de PDF-merge no package.json. O "1 que apareceu" era imagem. **Correção:** `pdf-lib` para concatenar PDFs ao laudo (ou `pdfjs-dist` para rasterizar), liberar `application/pdf` no proxy; no mínimo listar anexos não-imagem como links em vez de sumir com eles.

### 8.5 ✅ Vacinação → 500 quando não preenche próxima dose
`healthService.ts:74-75` — fallback injeta `"YYYY-MM-DD"` (sem hora) quando `nextDate` vem vazio; Prisma exige ISO completo para `DateTime` NOT NULL (`schema.prisma:1751`) → `PrismaClientValidationError` → 500. Com o campo preenchido, `toISO` gera ISO completo e funciona — bate 100% com o sintoma. Mesmo bug nas linhas 74 (aplicação), 122-123 (vermifugação) e 171 (exame). Adjacente: `vaccine.controller.ts:30` usa `CreateVaccineDto` no PUT em vez do `EditVaccineDto`. **Correção:** ISO completo no fallback e/ou tornar `nextDate` opcional ponta a ponta (a UI a apresenta como opcional).

### 8.6 ✅ Card do cliente despadronizado (detalhes do animal)
`clients-equines\animals\[id]\page.tsx:634-666` — e-mail/telefone como ícone+texto à esquerda sem label, enquanto CPF no mesmo card usa `<Row>` (label esq./valor dir.) como os cards vizinhos; wrapper é `<div>` gerando `<dt>/<dd>` fora de `<dl>` (HTML inválido). **Correção:** converter para `<Row>` dentro de `<dl>`.

### 8.7 ✅ Acompanhamento gestacional de receptora
A distinção doadora/receptora existe (por gênero + toggle manual). **Bug real encontrado:** "Diagnóstico Inicial" e "Diagnóstico Final" da receptora usam **o mesmo endpoint e o mesmo fetch** (`boardRecordService.ts:822-823` e `866-867` → `reproduction-receptor-diagnosis`), sem discriminador — os registros aparecem **duplicados nas duas seções** da tela e do laudo. A trilha da matriz usa endpoints separados. **Correção:** campo `stage: INITIAL|FINAL` (ou endpoint próprio) + filtro no fetch.

### 8.8 ✅ Exportação do laudo (estado atual, p/ conversar com a Rafaela)
Hoje: dois botões fixos, só PDF, download direto — "Exportar prescrição (PDF)" / "Exportar laudo (PDF)" no atendimento em andamento (`ServiceRecords.tsx:585-610`) e "Baixar…" na modal do concluído (`AppointmentReportModal.tsx:250-272`). Sem dropdown, sem abrir em nova aba (`openPdfInNewTab` existe e não é usado), nome de arquivo sem data (laudos do mesmo animal se sobrescrevem). Sugestão se ela quiser opções: um botão "Exportar" com dropdown (Laudo / Prescrição / Ambos / Abrir em nova aba).

---

## Roadmap sugerido (do documento original)

### P0 — Dinheiro e acesso (fazer primeiro)
1. **Upgrade de plano** (7.5): mover cancelamento da assinatura antiga para depois da confirmação do pagamento (webhook). Hoje dá pra perder o plano só gerando o QR Code.
2. **Split perdido no cartão salvo** (6.7-B): repasse à clínica não está sendo enviado — impacto financeiro direto.
3. **Webhook Asaas** (6.6): corrigir `@IsOptional()` no DTO, configurar token/URL no painel (passo a passo acima), reprocessar pendentes.
4. **asaas.ts blindado** (6.7-A): try/catch + log do corpo — elimina os 500 genéricos de pagamento e destrava o diagnóstico de wallet.
5. **Recover-password** (6.3): try/catch + conferir SMTP em produção.
6. **Checkout com polling** (6.5): usuário precisa ver o pagamento confirmar.

### P1 — Erros 500 e bloqueios de uso
7. **Pagar parcelas** (7.3) e **vacinação/vermífugo/exame** (8.5): mesma família de bug (data sem hora chegando ao Prisma) — corrigir junto, criando helper único de data ISO.
8. **Limite de usuários no POST /user** (6.8-b) + mensagem em PT (6.8-a) + consumir `/user/limit-info` na tela.
9. **CurrencyInput** (1.3): parser + display + blur — destrava a Nova Movimentação da home.
10. **DTO de birthDate e validação de datas na API** (2.3).
11. **Diagnóstico inicial/final da receptora** (8.7): dados sendo gravados misturados — quanto mais tempo passa, mais difícil separar depois.
12. **PDFs anexos no laudo** (8.4): decidir abordagem (merge com pdf-lib vs rasterizar) — é feature ausente, não bugfix.

### P2 — Componentes compartilhados (1 correção → N telas)
13. **NumberInput compartilhado** (1.1/1.2): mata o "dígito grudado" em 9 arquivos.
14. **DateInput com feedback de erro + chevron** (2.1/2.2): mata 14 telas.
15. **Camada de tradução de erros** (3.1) + varredura das ~404 mensagens de DTO (8.1).
16. **Range de datas do financeiro** (2.4) com util único startOfDay/endOfDay.
17. **formatDate no fieldsForRecord** (2.5): datas ISO nos PDFs.
18. **DateTimePicker com minutos livres** (5.1/5.2).

### P3 — UX e fluxos pontuais
19. Status pré-selecionado + PENDING nas opções (5.4) e reagendar→PENDING com confirmação (5.5).
20. Edição de compromisso/atendimento pelo calendário (5.3) — é feature nova (modo edit na sheet).
21. Filtros: cliente por propriedade (4.1), animais por cliente na movimentação (4.3), scope pessoal/profissional (7.1 — exige migration).
22. Pré-seleção de produto na home (4.4) — fix de 2 linhas.
23. "+" cliente no criar propriedade (3.5), olhinho no registro/recover (6.2), assinatura no PDF da fatura (7.2), cancelar fatura (7.4), labels (8.2), card do cliente (8.6), preview de anexos (8.3), Voltar do /plans (6.4), autoCapitalize no APP (6.1).
24. Voz/IA (3.3/3.6): CEP no formData, campos select declarados como select, matching server-side com normalização.

### Itens para validar com pessoas / runtime (não são código)
- **Limite "congelado" em 1 usuário** (6.8-c): não existe no código — reproduzir com `GET /user/limit-info` e conferir qual plano está na assinatura ativa.
- **Data retroativa** (4.2): não há bloqueio no código; confirmar com a Rafaela se ela tentou pela visão Mês (onde o clique no dia não abre a modal).
- **Autocapitalize no login web** (6.1): já corrigido em junho — conferir se produção está com build atual.
- **ZeptoMail** (6.3): conferir `.env` de produção (`SMTP_HOST`) antes de culpar créditos.
- **Exportação do laudo** (8.8): perguntar à Rafaela o formato desejado (estado atual documentado acima).
- **Telefone duplicado** (3.2): comportamento confirmado e aceito pelo time — sem ação.
