# Mapa consolidado — tudo que precisa de correção

Fonte: auditoria estática em 8 blocos (569 verificações) + teste funcional contra a
API rodando. Cada item traz evidência em arquivo:linha.

## Números

| Severidade | Qtd |
|---|---|
| Bloqueia o lançamento | **28** |
| Grave | 57 |
| Menor | 32 |
| **Total** | **117** |

73 dos 117 são NOVOS — não constavam em nenhuma auditoria anterior.

| Repo | Qtd |
|---|---|
| API | 38 |
| WEB | 37 |
| ADM | 24 |
| OUTRO | 11 |
| APP | 7 |

---

# BLOQUEIA O LANÇAMENTO — 28

## 1. [ADM] Coluna "Pago em" do Financeiro mostra a data de vencimento, não a de pagamento

**O que acontece:** A equipe olha o Financeiro para saber quando o dinheiro entrou e vê o vencimento. Cliente que pagou com 20 dias de atraso aparece como pago no dia do vencimento. A data real confirmada pelo gateway nunca é lida do Asaas.

**Evidência:** vetequus-api/src/domain/application/services/admin/services/adminFinancial.service.ts:126-128 — `const dueDate = payment.dueDate ? moment(payment.dueDate) : null; const paymentDate = payment.status === 'PAID' || payment.status === 'RECEIVED' ? dueDate : null;` e :147 `paymentDate: paymentDate?.toISOString()`. A interface PaymentHistoryItem (:6-11) não tem campo de data real; history() (adminSignature.service.ts:308-314) só copia id/value/dueDate/status. Exibido como "Pago em" em adm:src/app/(private)/financial/page.tsx:204-215.

**Correção:** Propagar paymentDate/confirmedDate do Asaas em history() e no PaymentHistoryItem; enquanto não existir, exibir "—" em vez do vencimento.

---

## 2. [ADM] O Financeiro nunca mostra mais de 10 transações e não tem filtro de período · **NOVO**

**O que acontece:** O admin abre o Financeiro e vê 10 linhas. Não há indicação de que existam mais, não há paginação e não há filtro de data — só uma busca que filtra as 10 já baixadas. É impossível auditar o que foi recebido.

**Evidência:** adm:src/app/(private)/financial/page.tsx:60 `GetAPI(API_FINANCIAL_TRANSACTIONS, true)` sem page/pageSize; api:adminFinancial.service.ts:94 `const { ..., page = 1, pageSize = 10 } = params;` (o DTO documenta default 20 — adminFinancial.dto.ts:47). O `total` devolvido é ignorado; a página fatia localmente (:122-125) com PAGE_SIZE=20 e components/ui/Pagination.tsx:25 `if (totalItems === 0 || totalPages <= 1) return null` esconde o paginador.

**Correção:** Enviar page/pageSize na chamada e paginar pelo `total` da API; adicionar filtro de período (a API já aceita startDate/endDate/status/companyId).

---

## 3. [ADM] "Receita do mês" soma vencimentos de assinaturas hoje ativas — não o que o gateway confirmou · **NOVO**

**O que acontece:** O número que a equipe usa como faturamento está errado por construção: cliente que pagou e depois cancelou some; assinatura vencida some; pagamento atrasado cai no mês errado (o recorte é por vencimento); e pagamento anual/PIX avulso nunca entra porque o dueDate vem vazio. O card ainda se anuncia como "Pagamentos confirmados no mês corrente".

**Evidência:** api:adminFinancial.service.ts:175-210 getPaymentsForPeriod itera só `fetchActiveWithPlans()`, que no Prisma é `status:'ACTIVE'` E `expirationDate >= now` (prismaCompanySignature.repository.ts:203-215); filtra por dueDate (:198-199) e soma PAID/RECEIVED (:66-68). O ramo avulso de history() devolve `dueDate: ''` (adminSignature.service.ts:325-332) e o laço descarta em :196 `if (!payment.dueDate) continue`. Rótulo em adm:src/app/(private)/page.tsx:316-318.

**Correção:** Calcular receita a partir dos pagamentos confirmados no período (data de pagamento do gateway), sobre TODAS as assinaturas, não só as ativas agora.

---

## 4. [ADM] A validade que o admin escolhe é gravada e exibida um dia antes — e é reescrita sem ele mexer

**O que acontece:** O admin define validade 10/08, salva e a própria modal passa a mostrar 09/08. O acesso da clínica cai às 21h do dia 09. Pior: basta abrir a modal e trocar só o status que a validade é reenviada com o deslocamento.

**Evidência:** adm:src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx:222-223 `if (editExpiration) payload.expirationDate = new Date(editExpiration).toISOString();` (= 00:00 UTC = 21:00 BRT do dia anterior); exibição em :296-299 `new Date(...).toLocaleDateString("pt-BR")` enquanto o input em :208-211 usa `toISOString().slice(0,10)` — a mesma modal mostra duas datas. Corte de acesso em api:signatureAccess.ts:53.

**Correção:** Enviar a data como fim do dia no fuso BRT (ou data pura + normalização no backend) e só incluir expirationDate no payload quando o campo mudou.

---

## 5. [ADM] ADM mostra usuários de demonstração como se fossem clientes reais · **NOVO**

**O que acontece:** EQUIPE EQUINOLOGY. Se a API cai ou o token expira num caminho não-401, a tela Usuários preenche a lista com dados inventados — "Maria Silva / maria.silva@haras.com.br / Haras Silva / plano Profissional", "João Santos / EquiClinic / Empresarial", "Ana Oliveira / VetEquus" — sem toast, sem badge, sem nenhum indicador. Quem vende o sistema olha a base e acredita: reporta número errado ao dono, procura cliente que não existe, discute plano que ninguém contratou. A própria equipe sabia que isso precisava de aviso: a página de administradores faz o mesmo fallback e SINALIZA.

**Evidência:** adm:src/app/(private)/users/page.tsx:89-102 `if (res.status === 200) { ... } else { setUsers(FALLBACK_USERS); }` — sem toast; FALLBACK_USERS definido em :16-47 com os três registros fictícios. Contraste: adm:src/app/(private)/admins/page.tsx:62 `const [isMockData, setIsMockData] = useState(false)` e :200 `{isMockData && <MockIndicator />}` — a página de usuários não tem nem o state nem o componente.

**Correção:** Remover FALLBACK_USERS e exibir estado de erro; no mínimo replicar o MockIndicator do admins/page.tsx.

---

## 6. [API] Pagamento com cartão SALVO liquida 100% na conta da plataforma — e o sistema diz à clínica que ela recebeu

**O que acontece:** O proprietário paga R$ 500 pelo app com o cartão já salvo; o Asaas credita os R$ 500 integralmente na conta da Equinology; transaction.service.ts:376-377 e invoice.service.ts:460-461 marcam status='PAID' e paymentDate=agora; o financeiro da clínica exibe 'Recebido R$ 500,00'. Ela dá baixa, considera quitado e nunca vê o dinheiro. Impacto: 100% do valor por transação. Agravante de frequência: o 1º pagamento com cartão salva o token (transaction.service.ts:435-443, invoice.service.ts:516-523) e o app só oferece o cartão salvo quando existe um (InvoicePaymentSheet.tsx:732 — o bloco 'Adicionar cartão e pagar' vive só no else), então do 2º pagamento em diante todos os clientes caem no caminho quebrado.

**Evidência:** vetequus-api/src/infra/shared/bank/asaas.ts:157-179 — `const { billingType, value, creditCardToken, customer, installmentCount, dueDate, totalValue } = data;` (split NÃO desestruturado) e os dois corpos `fullPaymentData`/`installMentPaymentData` sem a chave `split`. Contraste no mesmo arquivo: newCreditCartPayment desestrutura split em :118 e o inclui em :129 e :140; pixPayment em :195 e :201. Contrato exige: creditCardPayment.ts:38-42 declara split obrigatório em ExistsCreditCartPaymentProps. Chamadores reais passam 100%: transaction.service.ts:365-370 e invoice.service.ts:454.

**Correção:** Desestruturar `split` em asaas.ts:160 e incluí-lo nos dois objetos de payload (:163-179). Antes do lançamento, apurar no painel Asaas quais cobranças CREDIT_CARD já foram liquidadas sem split e regularizar o repasse — é dinheiro de terceiros retido.

---

## 7. [API] Ninguém marca fatura/movimentação como paga no PIX — não há webhook, job nem processo

**O que acontece:** A clínica emite a fatura, o proprietário paga por PIX no app, o dinheiro cai de verdade na carteira dela no Asaas — e no sistema a fatura continua 'Pendente' e depois migra para a aba 'Vencidas'. Ela cobra o cliente de novo, o cliente mostra o comprovante, e a clínica perde a confiança no financeiro do produto no primeiro mês. Idêntico para movimentação. Quem marca uma fatura como paga hoje é exclusivamente uma pessoa clicando 'Receber' na web, ou o próprio fluxo de cartão. O PIX não tem nenhum caminho automático. Configurar o webhook no painel do Asaas NÃO resolve: o handler existente devolve right(null) silenciosamente para qualquer pagamento que não seja de assinatura.

**Evidência:** Único webhook da API: companySignature.controller.ts:114-118 (POST /signature/webhook). O handler companySignature.service.ts:414-518 (signatureValidation) só consulta companySignatureRepository.findBySubscriptionId e findByPaymentId — nenhuma consulta a Invoice ou Transaction; :440-442 `if (!signature) { return right(null); }`. Busca por `bankPaymentId` em toda a API retorna só escritas (transaction.service.ts:303,375,446; invoice.service.ts:406,459,526) e getters/setters — não existe nenhum findByBankPaymentId. Busca por @Cron retorna apenas expireTrialSignatures.scheduler.ts e inactiveUsers.scheduler.ts. invoice.service.ts:397-407 (payPix) grava bankPaymentId e retorna sem tocar em status; transaction.service.ts:206-316 (pix) nunca toca transaction.status.

**Correção:** Escrever o tratamento de PAYMENT_RECEIVED/PAYMENT_CONFIRMED para fatura e movimentação, criando antes `findByBankPaymentId` nos repositórios de Invoice e Transaction. Não basta configurar o painel.

---

## 8. [API] O bankPaymentId do PIX de movimentação nem chega a ser gravado: save() antes da atribuição · **NOVO**

**O que acontece:** A coluna bankPaymentId da movimentação paga por PIX fica sempre NULL. Mesmo que o webhook de conciliação seja escrito, não haverá como amarrar o evento do Asaas de volta à parcela — a chave de conciliação nunca foi salva. É o pré-requisito silencioso da correção anterior.

**Evidência:** vetequus-api/src/domain/application/services/finance/services/transaction.service.ts:302-303 — `await this.transactionRepository.save(transaction);` seguido de `transaction.bankPaymentId = payment.value.paymentId;`. As duas linhas estão invertidas. Ordem correta no mesmo arquivo nos caminhos de cartão: :375-379 e :446-450 (atribui, depois salva). E em invoice.service.ts:406-407, também correto.

**Correção:** Trocar a ordem das duas linhas.

---

## 9. [API] Renovação por PIX nunca estende a assinatura — o cliente paga o 2º mês e é barrado · **NOVO**

**O que acontece:** A clínica assina por PIX, paga, trabalha. No mês seguinte o Asaas cobra, ela paga, o webhook PAYMENT_RECEIVED chega — e a expirationDate não se mexe. Cinco dias depois do vencimento (tolerância do signatureAccessDeadline) o scheduler marca INACTIVE e o middleware joga a clínica em /plans. Cliente pagante fora do sistema. Asaas diz 'pago', banco diz 'expirada'.

**Evidência:** vetequus-api/src/domain/application/services/signature/service/companySignature.service.ts:444-477 — `if (signature.paymentType === 'PIX' && signature.status === 'INACTIVE') { ... } else if (signature.paymentType === 'CREDIT_CARD' && signature.paymentId !== paymentId) { signature.expirationDate = moment().add(1, ...) }`. Uma assinatura PIX já ACTIVE não casa com nenhum dos dois ramos; só `signature.paymentId = paymentId` (:480) roda. Corte confirmado em signatureAccess.ts:29-33, prismaCompanySignature.repository.ts:141-158 e expireTrialSignatures.scheduler.ts:48-63.

**Correção:** Trocar a condição por 'se o paymentId é novo, estende a expiração, qualquer que seja o paymentType' — a mesma idempotência que já existe no ramo do cartão.

---

## 10. [API] Trial vira assinatura paga sem pagamento (D1 da auditoria anterior, intacto)

**O que acontece:** A clínica ativa o teste grátis, vai ao checkout do mesmo plano, marca 'Assinatura anual' e clica 'Gerar PIX': no mesmo request o registro TRIAL vira ACTIVE com validade de UM ANO, antes de qualquer confirmação. Fecha a aba e nunca paga. Agravante: com a assinatura já ACTIVE, o webhook do pagamento real cai no vazio (mesma causa do achado anterior) — nem nota fiscal sai se o cliente honesto pagar.

**Evidência:** companySignature.service.ts:155-170 — `const existingTrial = existingSignatures.find(s => s.status === 'TRIAL' && s.signaturePlanId === planId); if (existingTrial) { existingTrial.status = 'ACTIVE'; existingTrial.expirationDate = moment().add(1, yearly ? 'year' : 'month').toDate(); ... await this.companySignatureRepository.save(existingTrial); }`. O ramo else (:171-190) faz o certo (nasce INACTIVE), provando que a promoção é desvio, não projeto.

**Correção:** Remover a promoção imediata: o trial só vira ACTIVE quando o webhook confirmar o pagamento, igual ao ramo else.

---

## 11. [API] O evento SUBSCRIPTION_CREATED ativa a assinatura PIX sem nenhum pagamento · **NOVO**

**O que acontece:** O fluxo PIX cria a assinatura INACTIVE mas já com expirationDate em +1 mês/+1 ano. O Asaas então emite SUBSCRIPTION_CREATED para a recorrência recém-criada e o handler marca status='ACTIVE' sem checar pagamento, valor ou nada. Gerar o QR Code passa a valer um mês (ou um ano) de sistema grátis para qualquer conta, com ou sem trial. O runbook da auditoria anterior manda justamente HABILITAR esse evento no painel.

**Evidência:** companySignature.service.ts:486-496 — `if (status === 'SUBSCRIPTION_CREATED') { if (subscriptionId) { const signature = await this.companySignatureRepository.findBySubscriptionId(subscriptionId); if (signature) { signature.status = 'ACTIVE'; await this.companySignatureRepository.save(signature); } } }`. A assinatura nasce com expiração futura em :172-187.

**Correção:** Remover a ativação nesse evento (SUBSCRIPTION_CREATED não é confirmação de pagamento). Enquanto isso, NÃO habilitar esse evento no painel do Asaas. Ressalva: só dispara se o evento estiver configurado, e há corrida com o create() da linha 189.

---

## 12. [API] Toda a seção Saúde do animal devolve 403 para o proprietário · **NOVO**

**O que acontece:** Vacinas, vermífugos e exames aparecem sempre como '0 registros' e, ao abrir, o app mostra 'Não foi possível carregar as vacinas. Verifique sua conexão' — culpando a internet do usuário por um 403. Não existe cenário em que funcione: mesmo animal criado pelo próprio app nasce com companyId nulo.

**Evidência:** vetequus-api/src/domain/application/services/client/services/client.service.ts:265-269 emite o token com `companyId: 'no-company'`; vaccine.controller.ts:68-73 repassa `@CurrentCompanyId()` sem olhar tokenType; vaccine.service.ts:32-36 `return !!animal && animal.companyId === companyId;` e :166-168 `if (!(await this.isAnimalFromCompany(animalId, companyId))) return left(new NotAllowedError());` — idêntico em deworming.service.ts:32-35,162,180, exam.service.ts:30-33,154, shoeing.service.ts:29-32,126,142. error.handler.ts:59-60 mapeia NotAllowedError para 403. Sintoma na tela: app/(animal)/health/index.tsx:44-67 e health/vaccines.tsx:35-39.

**Correção:** Quando tokenType==='client', autorizar por dono do animal (clientId), como o ClientPortalService.assertOwnsAnimal já faz, em vez de comparar companyId.

---

## 13. [API] PIX pago nunca é confirmado — fatura fica pendente para sempre · **NOVO**

**O que acontece:** O proprietário gera o QR, paga no banco e continua vendo 'Pendente' no app; a clínica não recebe baixa. Na movimentação nem existe rastro para conciliar, porque o id do Asaas não chega a ser persistido.

**Evidência:** Único webhook do sistema: companySignature.controller.ts:114-141, que só chama signatureValidation (companySignature.service.ts:414-483, busca apenas em CompanySignature). Nenhuma leitura de bankPaymentId em todo o src — só escritas: invoice.service.ts:406,459,526 e transaction.service.ts:303,375,446. Em transaction.service.ts:302-303 o `await this.transactionRepository.save(transaction)` vem ANTES de `transaction.bankPaymentId = payment.value.paymentId`, então o id nunca é gravado. A tela não faz polling: finances.tsx:53-55 carrega só no mount.

**Correção:** Tratar PAYMENT_RECEIVED/PAYMENT_CONFIRMED buscando Invoice/Transaction por bankPaymentId, inverter as duas linhas do transaction.service.ts e refetch na tela.

---

## 14. [API] Pagamento com cartão SALVO não repassa nada para a clínica (split ausente)

**O que acontece:** O proprietário paga, o dinheiro é liquidado 100% na conta da plataforma e a clínica não recebe. PIX e cartão novo repassam certo.

**Evidência:** infra/shared/bank/asaas.ts:157-179 — `const { billingType, value, creditCardToken, customer, installmentCount, dueDate, totalValue } = data;` e o payload montado sem `split`, enquanto newCreditCartPayment (asaas.ts:106-141) envia. O contrato exige o campo (shared/payment/creditCardPayment.ts:32-44) e os chamadores passam 100% para a clínica: invoice.service.ts:454 e transaction.service.ts:365-370.

**Correção:** Incluir split no destructuring e nos dois payloads; apurar no painel do Asaas o que já foi cobrado sem repasse.

---

## 15. [API] .env de produção versionado no Git, com o JWT_SECRET · **NOVO**

**O que acontece:** Quem tiver o repositório assina um JWT com qualquer companyId e passa por TODAS as checagens de posse — prontuário, financeiro e dado pessoal de todas as clínicas ficam legíveis e alteráveis. Anula sozinho todo o trabalho de isolamento multi-tenant. Também expõe a senha do RDS de produção, as chaves do bucket R2 de anexos clínicos, o SMTP e o token do webhook Asaas.

**Evidência:** vetequus-api/.env.backup-antes-local (rastreado pelo git, commitado em 17dc8d9): DATABASE_URL="postgresql://postgres:***@database-1.c5ci8gu88rnd.us-east-2.rds.amazonaws.com/dados"; JWT_SECRET="eyJhb…"; SMTP_KEY=wSsVR6…; AWS_ACCESS_KEY_ID=5c4774…; AWS_SECRET_ACCESS_KEY_ID=c72ffc…; ASAAS_KEY = $aact_YTU5…; ASAAS_WEBHOOK_TOKEN=… — .gitignore:39 ignora só ".env", não ".env.backup-antes-local". Cadeia: auth.guard.ts:34-40 verifica só a assinatura e popula request.companyId com o valor do payload.

**Correção:** Rotacionar TODOS os segredos (JWT, RDS, R2, SMTP, Asaas, webhook). Remover o arquivo do índice, adicionar .env* ao .gitignore e reescrever o histórico (git filter-repo) — rotacionar não basta se o histórico permanecer.

---

## 16. [APP] .env versionado aponta o app para um IP de rede local (http://192.168.1.9:3333) · **NOVO**

**O que acontece:** Se o APK/IPA de lançamento sair desta árvore, todo proprietário abre o app e recebe 'Não foi possível conectar ao servidor' — nada funciona. Agravante: http puro é bloqueado pelo ATS do iOS.

**Evidência:** equinology-app-v2/.env linha 4 `EXPO_PUBLIC_API_URL="http://192.168.1.9:3333"` é a única linha ativa; as de produção estão comentadas (linhas 11-12). O arquivo está commitado (git check-ignore não casa) e eas.json não define nenhuma env em build.production — o build usa este .env e inlina EXPO_PUBLIC_*.

**Correção:** Mover a URL de produção para eas.json (build.production.env) e remover o .env do versionamento.

---

## 17. [OUTRO] Proprietário vê animal, CPF, e-mail, telefone e cobrança de outro proprietário · **NOVO**

**O que acontece:** Atendimento com cavalos de donos diferentes (visita a haras) faz o app do dono A receber o animal do dono B com os dados pessoais completos do dono B e os valores/parcelas da cobrança dele. Vazamento de dado pessoal e financeiro de terceiro — LGPD.

**Evidência:** prismaAppointment.repository.ts:487-504 filtra o APPOINTMENT (`animals: { some: animalFilter }`), não a lista de animais; :13-48 `appointmentDetailsInclude` traz `animals: { include: { animal: { include: { client: true } }, Payment: {...} } }`; a cadeia serializa tudo: appointmentDetails.presenter.ts:14 -> appointmentAnimalDetails.presenter.ts:9,14 -> animalDetails.presenter.ts:19 -> client.presenter.ts:5-12 (`name, email, phone, cpf, code`). Consumido por app/(tabs)/agenda.tsx:74 e (animal)/vet/index.tsx:86-121.

**Correção:** Filtrar os animais no include (`animals: { where: { animal: { clientId } } }`) ou podar no presenter quando o token for de cliente.

---

## 18. [WEB] A clínica não tem como obter o walletId, e o sistema aceita qualquer UUID sem validar no gateway · **NOVO**

**O que acontece:** No dia do lançamento a clínica assina, cadastra clientes, emite fatura — e descobre que o botão de pagar não aparece no app do proprietário, sem nenhuma mensagem que a ensine a resolver. O produto NUNCA cria a conta de recebimento dela: li os 12 métodos de asaas.ts e não há criação de subconta/wallet; createPaymentId (:76-104) cria um /customers, que é pagador, não recebedor. Ela precisa abrir conta no Asaas por fora, achar o Wallet ID no painel e colar num campo de texto livre sem instrução. E um UUID de formato válido mas de outra conta passa direto — o split mandaria o dinheiro para a carteira de um terceiro, sem o sistema conseguir detectar.

**Evidência:** Cadastro: equinology-web-v2/app/(dashboard)/clinic/_components/WalletCard.tsx:112-118, campo livre rotulado só 'Wallet ID — Identificador da carteira de pagamentos', sem link nem ajuda. Validação: só formato — WalletCard.tsx:19 `const UUID_REGEX = /^[0-9a-f]{8}-.../` e :45 `if (trimmedValue && !UUID_REGEX.test(trimmedValue))`. Backend: company.dto.ts:39-43 apenas `@IsOptional() @IsString() walletId?: string | null`. Nenhuma chamada ao Asaas para verificar a carteira. Vazio é tratado corretamente (invoice.service.ts:384-389, transaction.service.ts:247-254, clientInvoice.presenter.ts:24 `payable = !!company?.walletId`) — o problema é a ausência de caminho guiado para preencher.

**Correção:** No mínimo: texto na tela explicando onde obter o Wallet ID no painel Asaas + validação server-side chamando o gateway antes de gravar. Ideal: criar a subconta Asaas da clínica no onboarding.

---

## 19. [WEB] Upgrade por PIX derruba o acesso da clínica no instante em que o QR é gerado (D3, intacto)

**O que acontece:** Clínica ativa e em dia clica em 'Pagar upgrade com PIX' em /subscription. O backend marca a antiga INACTIVE e cria a nova também INACTIVE; como isSignatureValidForAccess só aceita ACTIVE/TRIAL, a próxima navegação cai em /plans. Lá o botão 'Voltar' some, o 'teste grátis' é recusado (empresa já usou trial) e uma segunda tentativa de upgrade devolve 403 porque não há mais nenhuma ACTIVE. A recorrência antiga já foi cancelada no Asaas ANTES, com a falha apenas logada e sem rollback.

**Evidência:** companySignature.service.ts:1008-1029 — `activeSignature.status = 'INACTIVE'; await this.companySignatureRepository.save(activeSignature); const newSignature = CompanySignature.create({ ... status: 'INACTIVE', ... })`; signatureAccess.ts:51 `if (signature.status !== 'ACTIVE' && signature.status !== 'TRIAL') return false;`; cancelamento prévio sem rollback em :962-970; segunda tentativa barrada em :916 `signatures.find(sig => sig.status === 'ACTIVE')`; botão Voltar escondido em web:app/(auth)/plans/page.tsx:201.

**Correção:** Só inativar a assinatura antiga quando o pagamento do upgrade for confirmado pelo webhook; e não cancelar no Asaas antes de o createSubscription ter sucesso.

---

## 20. [WEB] Nenhum ponto do checkout é idempotente — cada clique cria uma recorrência nova no Asaas · **NOVO**

**O que acontece:** Nem o front nem o back verificam se a empresa já tem assinatura vigente ou recorrência aberta. No PIX o botão vira 'Gerar novo PIX' e continua clicável: cada clique é um POST /subscriptions novo. No cartão, nada impede pagar duas vezes — e ali a cobrança é real. Resultado: N assinaturas no banco e N recorrências cobrando por mês no Asaas. Cobrança duplicada do cliente.

**Evidência:** companySignature.service.ts:121-129 (createSubscription é a PRIMEIRA coisa do pix(), sem consulta prévia a assinaturas) e :344-354 (idem em newCreditCard); a única consulta a fetchByCompanyId vem depois e só procura trial (:155, :268, :368). Front: equinology-web-v2/app/(auth)/checkout/[id]/page.tsx:610-612 — `{submitting ? 'Gerando PIX…' : pixResult ? 'Gerar novo PIX' : 'Gerar PIX'}`.

**Correção:** Recusar pix/credit/new/credit/existing quando fetchByCompanyId já devolver assinatura válida por isSignatureValidForAccess, ou reaproveitar a asaasSubscriptionId existente.

---

## 21. [WEB] Criar conta de clínica nova sem CPF/CNPJ mostra "Registro não encontrado. Ele pode ter sido removido." · **NOVO**

**O que acontece:** CLÍNICA. O caso concreto que o dono citou. No formulário de registro, nenhum campo da clínica é obrigatório (cpfCnpj, companyName, postalCode, address, number renderizados sem `required`). O usuário preenche nome, e-mail, senha, telefone, aceita os termos, clica em Criar conta — e lê "Registro não encontrado. Ele pode ter sido removido." Nada indica que faltou o CPF/CNPJ, o CEP, o endereço ou o número; nenhum campo fica marcado. O cliente desiste ou liga no suporte.

**Evidência:** web:app/(auth)/register/page.tsx:258-315 (os 5 campos sem `required`) e :96-102 `if (payload.cpfCnpj) body.cpfCnpj = payload.cpfCnpj;` — api:User.service.ts:254-259 `if (newCompany) { if (!cpf && !companyCnpj) return left(new ResourceNotFoundError()); if (!paymentType || !address || !number || !postalCode) { return left(new ResourceNotFoundError()); }` — api:error.handler.ts:50 mapeia para 404 code RESOURCE_NOT_FOUND — web:lib/api-error.ts:88 `RESOURCE_NOT_FOUND: "Registro não encontrado. Ele pode ter sido removido."`

**Correção:** Mínima (sem backend): marcar os 5 campos como `required` quando newCompany === true. Certa: trocar os dois ResourceNotFoundError por ValidationError com a mensagem do campo faltante — a classe já existe e já mapeia para 400 em error.handler.ts:96.

---

## 22. [WEB] Ficha clinica: campo em branco que a tela nao marca como obrigatorio devolve 400 — em ~28 secoes · **NOVO**

**O que acontece:** O veterinario abre 'Exame Fisico' no atendimento, digita Temperatura e Observacao (o uso real) e clica Salvar. Volta um toast com 'O campo Freq. Cardiaca e obrigatorio, O campo Freq. Respiratoria e obrigatorio, O campo Mucosa e obrigatorio, O campo Peso e obrigatorio'. Nenhum desses campos tem asterisco, aviso ou borda na tela. O registro nao e criado — o dado nao existe nem em memoria. Atinge Exame Fisico Geral, Exame Fisico Odontologico, Exame Intra Oral, Avaliacao Periodontal, Exame Fisico Ortopedico, Avaliacao Ginecologica (doadora e receptora), CIO, Inducao Hormonal, Inovulacao, Diagnostico Final, Vacinas, Acomp. Gestacional, Exame Androlologico, Coletas de Envio e Envio.

**Evidência:** web:app/(dashboard)/services/_components/ServiceRecords.tsx:405-410 inicializa TODO campo da secao como string vazia (`section.fields.forEach((f) => { empty[f.key] = ""; })`); :478-484 so bloqueia campos com `required: true` no mock.ts. web:services/boardRecordService.ts:283-298 monta o body com `temperature: formData.temperature ?? "-"` — o `??` NAO dispara sobre string vazia, entao sai `""`. api:src/infra/http/controllers/animal/dto/general/generalTest.dto.ts:25-52 `@IsNotEmpty({ message: 'O campo Temperatura e obrigatorio' }) temperature!: string;` (idem heartRate, breathRate, mucous, weight). Mesmo padrao em dentistryOral.dto.ts:25-62, orthopedicService.dto.ts, reproductionDonorGyno.dto.ts:60-112.

**Correção:** Decidir por secao qual campo e clinicamente obrigatorio. Para os que NAO sao: trocar @IsNotEmpty por @IsOptional() + @Transform(({value}) => value ?? '') no Create DTO (padrao ja usado no campo observation). Para os que SAO: marcar required: true no mock.ts para a tela avisar antes do round-trip. Nao voltar a mandar "-": isso reintroduz dado clinico fabricado.

---

## 23. [WEB] Cinco secoes de Reproducao nao tem onde salvar

**O que acontece:** O veterinario abre Avaliacao Ginecologica, CIO, Inducao Hormonal ou Cobertura/Inseminacao da MATRIZ, ou Pos-parto/Neonatal da RECEPTORA, preenche e clica Salvar. Recebe '"<Secao>" ainda nao e salva no servidor. Registre esta informacao em Observacoes de outra secao ate a funcionalidade ser liberada.' A trilha inteira da Matriz (o caso mais comum de reproducao equina fora de TE) nao e registravel e nunca entra no laudo. O dado nao evapora mais em silencio (melhorou), mas a funcionalidade nao existe.

**Evidência:** web:app/(dashboard)/services/_data/mock.ts:412 (receptor-post), :416 (breeding-gyno), :431 (breeding-heat), :442 (breeding-hormones), :454 (breeding-cover) — definidas como secao. Ausentes das 43 chaves de SECTION_API_CONFIG em web:services/boardRecordService.ts:249-1585. Bloqueio em web:app/(dashboard)/services/_components/ServiceRecords.tsx:464-470: `if (!config) { toast.error(...); return; }`.

**Correção:** Criar/mapear os endpoints das 5 secoes na API e adicionar as entradas em SECTION_API_CONFIG. Enquanto isso, esconder as secoes da tela em vez de oferecer um formulario que nao salva.

---

## 24. [WEB] Propriedade sem cliente e visivel e editavel por TODAS as clinicas do sistema · **NOVO**

**O que acontece:** stud_farms nao tem companyId; a posse e derivada. O escopo por empresa tem um ramo 'orfa' que nao filtra por empresa nenhuma: qualquer propriedade sem cliente, sem animal e sem atendimento casa para TODO companyId. Como o cadastro so exige o nome (clientId e opcional), esse e o estado natural de toda propriedade recem-criada. A Clinica A cria 'Haras Sao Joao' sem cliente; a Clinica B ve o registro na lista com endereco, responsavel e telefone — e pode EDITAR, porque belongsToCompany usa o mesmo escopo. Vazamento de dado de terceiro entre tenants.

**Evidência:** api:src/infra/shared/database/prisma/repositories/prismaStudFarm.repository.ts:47-64 — companyScope() com o ramo `{ AND: [ { clientId: null }, { ClientStudFarm: { none: {} } }, { Animal: { none: {} } }, { Appointment: { none: {} } } ] }` sem qualquer filtro de companyId; :146-152 belongsToCompany usa `{ id: studFarmId, ...this.companyScope(companyId) }` e e a unica guarda do edit em api:src/domain/application/services/studFarm/services/studFarm.service.ts:122-126. web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx:281 `clientId: formData.clientId || undefined` (opcional).

**Correção:** Adicionar companyId (ou createdByCompanyId) ao model StudFarm com migration e filtrar por ele. O ramo 'orfa' nunca deve existir sem discriminador de empresa.

---

## 25. [WEB] Editar o CPF do cliente nao salva — e o sistema diz que salvou · **NOVO**

**O que acontece:** A clinica cadastra o cliente sem CPF (a propria modal avisa que sem CPF ele nao paga faturas pelo app). Depois consegue o CPF, abre 'Editar cliente', digita, salva, ve 'Cliente atualizado com sucesso.' — e no F5 o campo esta vazio de novo. O cliente segue sem conseguir pagar. Agravante: o paymentId do Asaas so e criado quando ha CPF NA CRIACAO, entao um cliente criado sem CPF nunca ganha paymentId e nao existe caminho pela tela para corrigir isso.

**Evidência:** web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx:144-153 envia `cpf: formData.cpf || undefined` no PUT /client/:id. api:src/infra/http/controllers/client/dto/client.dto.ts:56-59 — EditClientDto TEM `cpf?: string`. api:src/domain/application/services/client/services/client.service.ts:149-162 TRATA o cpf (checa duplicidade e faz `client.cpf = cpf || null`). MAS api:src/infra/http/controllers/client/client.controller.ts:59 `const { name, phone, email } = body;` — cpf nunca e lido. Sem `whitelist` no ValidationPipe nao ha erro: o campo simplesmente some. Criacao do paymentId: client.service.ts:78-89.

**Correção:** Destruturar e repassar `cpf` no client.controller.ts:59-69. Varrer os demais controllers procurando o mesmo padrao (DTO aceita, service trata, controller esquece).

---

## 26. [WEB] Inseminacao da Doadora: Garanhao e Volume obrigatorios na API e opcionais na tela; Metodo descartado; releitura em branco

**O que acontece:** Registrar uma inseminacao sem informar Garanhao ou Volume devolve 400 ('O campo Garanhao e obrigatorio' / 'O campo Volume e obrigatorio') — nenhum dos dois esta marcado na tela. Quando o vet preenche e salva, o dado grava, mas a tabela e o modal de edicao abrem em branco (o front nao le esses campos de volta), o que leva o usuario a salvar de novo em branco e tomar 400 outra vez. O campo Metodo (Inseminacao / Monta natural / Monta dirigida) existe na tela e nunca e enviado: a distincao que justifica a secao e perdida em 100% dos casos.

**Evidência:** api:src/infra/http/controllers/animal/dto/reproduction/reproductionDonorInsemination.dto.ts:55-64 `@IsNotEmpty({message:'O campo Garanhao e obrigatorio'}) stallionId!: string;` e `@IsNotEmpty({message:'O campo Volume e obrigatorio'}) volume!: string;`. web:app/(dashboard)/services/_data/mock.ts:386-387 — `{ key: "stallionId", label: "Garanhao" }` e `{ key: "volume", label: "Volume" }` SEM required. web:services/boardRecordService.ts, bloco "donor-insemination": mapToRecord devolve apenas date/time/semen/observation — stallionId, volume e method ficam de fora; buildCreateBody nao envia `method`. api:src/infra/http/presenters/reproduction/reproductionDonorInsemination.presenter.ts:15-16 — a API DEVOLVE stallionId e volume; a perda e 100% no front.

**Correção:** Mapear stallionId/volume no mapToRecord; adicionar coluna e envio de `method`; alinhar obrigatoriedade entre mock.ts e o Create DTO.

---

## 27. [WEB] Laudo desenha só o ÚLTIMO registro de odontograma do atendimento e pode declarar 'nenhum achado' · **NOVO**

**O que acontece:** A seção Odontograma usa endpoint de LISTA, então o veterinário pode criar N registros no mesmo atendimento (cenário natural: marca a arcada superior, salva, abre outro para a inferior). Na montagem do laudo só o último é lido; os demais não têm como aparecer por outra via, porque o JSON do desenho não é um 'field' da seção e nunca é impresso como texto. Se o último registro estiver vazio ou tiver sido criado só para uma observação, a lista de achados fica vazia e o PDF ASSINADO imprime 'Nenhum achado registrado — todos os dentes avaliados como saudáveis' — um documento afirmando que o cavalo não tem achado nenhum. Agravante: a modal 'Laudo do atendimento' nem pré-visualiza o odontograma (grep por 'odonto' no AppointmentReportModal.tsx não retorna nada), então o vet assina sem ver o que saiu.

**Evidência:** equinology-web-v2/app/(dashboard)/services/_data/servicePdf.tsx:359-366 — `const last = odontoRecords[odontoRecords.length - 1]; const raw = last?.odontogram; if (typeof raw === "string" && raw.length > 0) { odontogramState = parseOdontogram(raw); odontogramFindingList = buildOdontogramFindings(odontogramState);` · app/(dashboard)/services/_data/mock.ts:318 — `{ key: "dentistry-odontogram", title: "Odontograma", fields: [{ key: "observation", label: "Observação" }] }` (o campo `odontogram` não é um field, logo fieldsForRecord nunca o imprime) · lib/pdf/OdontogramPdf.tsx:157-165 — `if (findings.length === 0) { return (<View ...><Text>Nenhum achado registrado — todos os dentes avaliados como saudáveis.</Text></View>) }`

**Correção:** Agregar TODOS os registros de odontograma do atendimento (mesclar os estados ou emitir um bloco por registro, com data), e nunca imprimir a frase de 'nenhum achado' quando existir registro de odontograma cujo estado não pôde ser lido. Adicionar a pré-visualização do odontograma na modal de laudo.

---

## 28. [WEB] /api/image-proxy é SSRF de leitura arbitrária, sem autenticação · **NOVO**

**O que acontece:** Qualquer pessoa na internet faz o servidor do WEB buscar qualquer URL e recebe o corpo de volta: endpoint de metadados do provedor (credencial de infra), varredura da rede interna, leitura do backend por loopback. A rota não está no matcher do middleware, logo não exige login.

**Evidência:** equinology-web-v2/app/api/image-proxy/route.ts:11-45 — `upstream = await fetch(url)` sem allowlist de host; o único filtro é `contentType.startsWith("image/") || looksLikeImageUrl`, e looksLikeImageUrl testa o regex contra `url.split("?")[0]` cru. Bypass: ?url=http://169.254.169.254/latest/meta-data/…%23.png — o fragmento fica na string (regex casa) e o fetch o descarta ao buscar. middleware.ts (config.matcher) não tem nenhuma entrada /api.

**Correção:** Exigir sessão; allowlist do host do R2; bloquear IP privado/link-local; testar a extensão em new URL(url).pathname, não na string crua.

---

# GRAVE — 57

## 1. [ADM] "Trocar plano" cancela a recorrência no Asaas e não cria outra — o cliente para de ser cobrado · **NOVO**

**O que acontece:** O admin troca o plano, vê "Plano alterado." e a partir dali a clínica nunca mais é cobrada. O acesso segue até a expirationDate antiga e depois cai. Perda de receita silenciosa.

**Evidência:** api:src/domain/application/services/admin/services/adminSignature.service.ts:261-271 — cancela `subscription.cancelSubscription(subId)`, seta `asaasSubscriptionId = null`, `paymentId = 'sub_pending'`, `isAutoRenewActivated = false` e salva. Não há nenhum `createSubscription` depois. Toast de sucesso em adm:SubscriptionDetailModal.tsx:153.

**Correção:** Criar a nova assinatura no Asaas dentro do changePlan (com rollback se falhar) ou devolver o link de pagamento do novo ciclo.

---

## 2. [ADM] Assinatura mensal criada pelo admin não devolve link de pagamento · **NOVO**

**O que acontece:** O admin cria a assinatura mensal, a modal fecha com "Assinatura criada." e ele fica sem nada para mandar ao cliente. As saídas são o botão "Recibo" (nome errado para a função certa) ou "Gerar cobrança", que cria uma cobrança AVULSA nova fora da recorrência — o cliente pode receber duas cobranças do mesmo mês.

**Evidência:** api:adminSignature.service.ts:209 `return right({ signature: companySignature });` (ramo mensal, sem invoiceUrl), contra :160-163 no ramo anual. A modal só mostra o link se existir: adm:SubscriptionCreateModal.tsx:100-106. Workarounds: receipt() em adminSignature.service.ts:340-348 e charge() em :275-299 (undefinedPayment novo + sobrescreve signature.paymentId).

**Correção:** Buscar o primeiro pagamento da recorrência criada e devolver invoiceUrl também no ramo mensal; renomear "Recibo" para "Link de pagamento".

---

## 3. [ADM] Reativar / Renovar anual / criar trial geram assinaturas DUPLICADAS para a mesma empresa · **NOVO**

**O que acontece:** A lista de Assinaturas passa a mostrar várias linhas da mesma clínica com status diferentes, sem indicar qual vale. Também dá para encadear trials pelo painel. Qual assinatura governa acesso e limite de usuários vira heurística.

**Evidência:** api:adminSignature.service.ts:234-243 (reactivate) e :245-254 (renewYearly) chamam adminCreate, que sempre faz `CompanySignature.create(...)` (:82, :139, :188) e não consulta assinaturas existentes (:52-96). O ramo isTrial (:78-96) não checa histórico. Desempate posterior em companyUserLimit.service.ts:60-65. A tela adm:subscriptions/page.tsx não agrupa nem filtra por empresa.

**Correção:** Reativar/renovar sobre a assinatura existente, ou marcar a anterior como substituída; bloquear trial repetido.

---

## 4. [ADM] Cupom escolhido na criação de trial é validado e depois descartado · **NOVO**

**O que acontece:** O admin seleciona o cupom, recebe "Assinatura criada" e o cupom não foi aplicado a nada nem contado como uso.

**Evidência:** api:adminSignature.service.ts:64-76 busca e valida o cupom, mas o ramo `if (isTrial)` (:78-96) não aplica desconto nem chama `coupon.incrementUsage()` — diferente dos ramos anual (:154-158) e mensal (:203-207). Seleção em adm:SubscriptionCreateModal.tsx:231-245.

**Correção:** Ignorar explicitamente o cupom no trial (desabilitar o campo na UI) ou aplicá-lo na primeira cobrança pós-trial.

---

## 5. [ADM] A lista de Assinaturas mostra no máximo 20 e esconde o resto sem aviso · **NOVO**

**O que acontece:** A partir da 21ª assinatura os clientes somem do painel. Não há paginação visível, não há filtro por status ou empresa, e a busca só filtra as 20 baixadas.

**Evidência:** adm:src/app/(private)/subscriptions/page.tsx:49 `GetAPI(API_SIGNATURE, true)` sem paginação; api:adminSignature.controller.ts:32 `pageSize: pageSize ? parseInt(pageSize, 10) : 20`; o `total` devolvido em :46 é descartado (normalizeSubscription não o lê) e a página fatia localmente (:80-83) com PAGE_SIZE=20; Pagination.tsx:25 não renderiza com uma página só.

**Correção:** Paginar server-side usando o `total`; expor filtros de status/empresa que a API já aceita.

---

## 6. [ADM] Tela de Usuários exibe 4 clientes FALSOS quando a API falha, sem nenhum indicador · **NOVO**

**O que acontece:** Com a API fora do ar ou um 500, o painel mostra "Maria Silva / Haras Silva", "João Santos / EquiClinic" etc. como se fossem base real. A tela de Administradores faz o mesmo mas acende o MockIndicator; a de Usuários não.

**Evidência:** adm:src/app/(private)/users/page.tsx:98-101 `} else { setUsers(FALLBACK_USERS); }` com FALLBACK_USERS definido em :16-57. Grep por MockIndicator no src: só importado e usado em admins/page.tsx:6,200 — nenhuma ocorrência em users/page.tsx.

**Correção:** Remover o fallback mock (ou, no mínimo, exibir o MockIndicator e um erro).

---

## 7. [ADM] Backend fora do ar trava a tela em "carregando" para sempre

**O que acontece:** Erro de rede/CORS/timeout estoura um TypeError dentro do catch do ApiContext; a promise rejeita e o `setLoading(false)` que vem depois do await nunca roda. A tela fica em esqueleto, sem toast, sem erro.

**Evidência:** adm:src/context/ApiContext.tsx:118-122 (GetAPI), :141-145 (PutAPI), :164-168 (PatchAPI), :187-191 (DeleteAPI) — `const message = err.response.data; const status = err.response.status;` sem optional chaining. Só PostAPI (:93-99) tem `err.response?.status ?? 0` e fallback. Chamadores sem try/catch: subscriptions/page.tsx:47-61, companies/page.tsx:43-57, plans/page.tsx:35-48, admins/page.tsx:69-95.

**Correção:** Replicar o optional chaining e o fallback do PostAPI nos outros quatro verbos.

---

## 8. [ADM] Erro de validação em Anúncios vira "undefined, undefined"; em Tutoriais, toast vazio

**O que acontece:** Toda falha de validação de anúncio ou tutorial some. O admin não descobre o que preencheu errado.

**Evidência:** adm:src/app/(private)/ads/page.tsx:105 e :143 `res.body.message.map((m: { defaultMessage?: string }) => m.defaultMessage).join(", ")` sobre um array de STRINGS (api:main.ts:23-29 devolve `message: string[]`). Em tutorials/page.tsx:24-35 a mesma função tem `.filter(Boolean)`, então o join dá "" e o toast sai em branco.

**Correção:** Tratar `message` como string | string[] num helper único do ADM (equivalente ao lib/api-error.ts do WEB).

---

## 9. [ADM] Financeiro dispara uma chamada ao Asaas por assinatura, em série (N+1) · **NOVO**

**O que acontece:** Abrir o Financeiro ou o Dashboard faz ~3 chamadas HTTP ao gateway por clínica cadastrada, sequenciais. Com dezenas de clientes a tela pode estourar timeout — e por G1 ela travaria sem mensagem.

**Evidência:** api:adminFinancial.service.ts:107-111 busca até 10000 assinaturas (`pageSize: 10000`) e :120 faz `await this.adminSignatureService.history(signature.id)` DENTRO do for; cada history() é um GET no Asaas (adminSignature.service.ts:306). getFinancialSummary repete duas vezes (:62 e :72). O dashboard chama summary + transactions juntos em adm:(private)/page.tsx:149-159.

**Correção:** Persistir as cobranças localmente (ou cachear) em vez de consultar o Asaas por assinatura a cada render.

---

## 10. [ADM] ADM quebra em erro de rede em GET/PUT/PATCH/DELETE: tela presa em "carregando" para sempre, sem mensagem

**O que acontece:** EQUIPE EQUINOLOGY. Com a API fora do ar (ou DNS/CORS/túnel), o axios rejeita com error.response undefined; `err.response.data` lança TypeError DENTRO do .catch, então GetAPI rejeita em vez de resolver. Como quase nenhum chamador tem try/catch (30 chamadas a GetAPI contra 10 blocos catch no repo inteiro) e o setLoading(false) está depois do await, a tela fica girando indefinidamente sem toast, sem erro e sem retry. Vale para Planos, Empresas, Cupons, Assinaturas, Usuários, Tutoriais, Anúncios e Administradores — só Financeiro tem try/catch/finally.

**Evidência:** adm:src/context/ApiContext.tsx:118-122 (GetAPI), :141-145 (Put), :164-168 (Patch), :187-191 (Delete): `.catch((err) => { const message = err.response.data; const status = err.response.status; return { status, body: message }; });` — sem optional chaining. Só PostAPI (:93-98) tem `err.response?.status ?? 0`. Chamador típico: adm:src/app/(private)/plans/page.tsx:35-48 `setLoading(true); const res = await GetAPI(API_PLANS, true); setLoading(false);` — o setLoading(false) nunca executa. Idem companies/page.tsx:43-57, coupons/page.tsx:31-47, subscriptions/page.tsx:47-61, users/page.tsx:89-102, tutorials/page.tsx:61-73, admins/page.tsx:69-79.

**Correção:** `err.response?.data` / `err.response?.status ?? 0` nos quatro verbos, com o mesmo fallback do PostAPI. Quatro linhas.

---

## 11. [ADM] Rate limit (429) vira "Email ou senha inválidos" no WEB e texto em inglês cru no login do ADM · **NOVO**

**O que acontece:** CLÍNICA e EQUIPE EQUINOLOGY. Quem erra a senha 10 vezes e depois digita a CERTA continua lendo "Email ou senha inválidos." por até um minuto — não sabe que está bloqueado e não sabe esperar. No registro lê "Não foi possível criar a conta. Confira os dados" e fica reeditando dados corretos; na recuperação de senha, "Não foi possível enviar o código." No painel interno é pior: a tela de login mostra literalmente "ThrottlerException: Too Many Requests".

**Evidência:** Mensagem real: node_modules/@nestjs/throttler/dist/throttler.exception.js:5 `exports.throttlerMessage = 'ThrottlerException: Too Many Requests';`. É HttpException com corpo string -> api:all-exceptions.filter.ts:57-61 repassa intacta com code 'HTTP_ERROR' (429 não está no CODE_BY_STATUS, :13-23). WEB: lib/api-error.ts:191-214 — code HTTP_ERROR fora dos mapas, raw fora de MESSAGE_BY_RAW (:148-161, sem 429), status<500, looksPortuguese=false -> retorna o fallback da tela; login/page.tsx:45 `"Email ou senha inválidos."`, register/page.tsx:118, recover-password/page.tsx:44. ADM: src/app/login/page.tsx:45-50 `typeof body?.message === "string" ? body.message : ...` exibe a string em inglês. Rotas limitadas: user.controller.ts:45-46 (signin 10/min), :63-64 (register 5/min), recoverPasswordCode.controller.ts:15-16, adminAuth.controller.ts:19-20. O APP acerta: app:lib/api-error.ts:90 `429: "Muitas tentativas em pouco tempo..."`.

**Correção:** Copiar o MESSAGE_BY_STATUS do APP para o api-error.ts do WEB (ou entrada 429 em MESSAGE_BY_RAW) e criar a camada no ADM.

---

## 12. [ADM] ADM sem camada de tradução: "undefined, undefined" ao salvar anúncio e array de validação colado no toast

**O que acontece:** EQUIPE EQUINOLOGY. Salvar um anúncio com campo inválido mostra literalmente "undefined, undefined" — o operador não faz ideia do que corrigir. Nos demais modais (planos, cupons, assinaturas) o array de mensagens PT da API é passado direto ao toast. E o corpo montado para 500 no ApiContext ("Ops! algo deu errado") nunca é exibido, porque as telas leem `res.body?.message` sobre uma string.

**Evidência:** adm:src/app/(private)/ads/page.tsx:106 e :144 `res.body.message.map((m: { defaultMessage?: string }) => m.defaultMessage).join(", ")` — `message` é array de STRINGS (api:main.ts:29), logo m.defaultMessage é sempre undefined. adm:src/context/ApiContext.tsx:101-106 substitui o corpo por `body: "Ops! algo deu errado, tente novamente"` (string) e as telas fazem `res.body?.message` (undefined) -> caem no fallback: plans/page.tsx:64, subscriptions/_components/SubscriptionDetailModal.tsx:98,138,158,238, coupons/page.tsx:78. Nenhum getApiErrorMessage existe no repo (grep vazio); 28 pontos de body.message espalhados.

**Correção:** Portar lib/api-error.ts do APP (que tem a ordem de resolução correta) para o ADM e trocar os 28 pontos; corrigir o .map de ads/page.tsx primeiro (2 linhas).

---

## 13. [API] Pagar movimentação de terceiro: falta no /transaction a guarda de posse que o /invoice tem · **NOVO**

**O que acontece:** Um cliente autenticado que conheça o id de uma transação de outra clínica consegue (a) descobrir o valor dela pelo QR PIX gerado e (b) em credit/existing, pagar com o próprio cartão e marcar a transação alheia como PAID. O dano financeiro direto é baixo (ele paga do próprio bolso), mas o financeiro de uma clínica que ele nem conhece passa a mostrar uma baixa que ela não recebeu — e, por causa do split ausente no cartão salvo, o dinheiro nem chega a essa clínica. GRAVE e não BLOQUEIA porque exige conhecer um UUID v4.

**Evidência:** invoice.controller.ts:117-121 tem `assertClientToken(tokenType)` e invoice.service.ts:381,436,492 checam `invoice.clientId !== clientId`. Já transaction.controller.ts:148-153 (POST /transaction/pix/:transactionId), :162-175 (credit/new) e :180-191 (credit/existing) usam @CurrentUserId() como clientId sem checar tokenType; e transaction.service.ts:206-316 (pix) e :318-382 (existingCreditCard) nunca comparam a transação com o clientId — o único guard é sobre o cartão (:348 `if (creditCard.clientId !== clientId)`). Marcação de pago sem posse: :376-379.

**Correção:** Replicar em transaction.controller.ts o assertClientToken do invoice.controller.ts e, no service, validar que a transação pertence ao cliente do token (via payment.clientId / animal.clientId).

---

## 14. [API] Erro do Asaas lido sem proteção nos métodos da clínica: faturas e movimentações viram 500 genérico

**O que acontece:** O cliente Axios é criado sem validateStatus, então respostas 4xx/5xx não rejeitam a promise e caem direto no acesso `data.errors[0].description`. Corpo HTML (proxy/WAF) ou JSON sem `errors` vira TypeError → 500 cru na cara do usuário, sem diagnóstico. Os métodos de assinatura já foram blindados com ?. dentro de try/catch; exatamente os métodos que a clínica usa não foram.

**Evidência:** vetequus-api/src/infra/shared/bank/asaas.ts linhas 99, 148, 186, 206, 214, 230 e 239, todas no padrão `return left(new PaymentError(payment.data.errors[0].description));` sem `?.` e sem try/catch. Cliente sem validateStatus em :65 `this.AsaasApi = new Axios({ baseURL: url, headers: {...} })`. Contraste: :316, :328, :340, :348, :361, :392, :404, :427, :438, :449, :460 usam `?.` dentro de try/catch.

**Correção:** Aplicar o mesmo padrão dos métodos de assinatura (try/catch + optional chaining + mensagem default) nos 7 pontos restantes.

---

## 15. [API] Admin desativado continua operando o painel por até 90 dias · **NOVO**

**O que acontece:** Desativar um administrador não o expulsa. O guard não consulta o banco; o token dura 90 dias e não há revogação. Ele segue criando empresas, assinaturas, cupons e cancelando assinaturas de clientes.

**Evidência:** api:src/infra/shared/auth/admin-auth.guard.ts:36-46 — verifica só assinatura e `payload.type !== 'admin'`, nunca busca o AdminUser nem checa `active`. Token com `signOptions: { expiresIn: '90d' }` em api:src/infra/shared/auth/auth.module.ts:14. Comparar com admin-super-admin.guard.ts:20, que checa `admin?.active`, e adminAuth.service.ts:29, que barra no login.

**Correção:** Carregar o AdminUser no AdminAuthGuard e recusar quando `!active`; reduzir o expiresIn do token de admin.

---

## 16. [API] Papel super_admin só protege duas rotas — admin comum faz tudo · **NOVO**

**O que acontece:** Um admin de "suporte" cria e apaga plano, cria e cancela assinatura, altera validade, gera cobrança, muda o walletId de qualquer clínica (para onde vai o dinheiro dela) e lê todo o financeiro. O ADM nem esconde os botões.

**Evidência:** AdminSuperAdminGuard aparece em exatamente dois handlers: api:adminPanelAccounts.controller.ts:30 e :47. Todos os outros usam só AdminAuthGuard: adminCompany.controller.ts:15, adminUser.controller.ts:11, adminPlan.controller.ts:10, adminCoupon.controller.ts:11, adminSignature.controller.ts:16, adminFinancial.controller.ts:18. No ADM, só admins/page.tsx:77 consulta `role`.

**Correção:** Decidir o que o papel `support` pode fazer e aplicar o guard nas rotas destrutivas/financeiras; espelhar na UI.

---

## 17. [API] Cards do Financeiro discordam entre si: "Em Trial" conta trials expirados · **NOVO**

**O que acontece:** O mesmo cliente aparece contado de formas diferentes em três lugares. O dono não sabe quantos trials vivos existem.

**Evidência:** api:adminFinancial.service.ts:58 usa `fetchByStatusWithPlans('TRIAL')`, que NÃO filtra expiração (prismaCompanySignature.repository.ts:227-247), enquanto :57 usa `fetchActiveWithPlans()`, que filtra `expirationDate >= now` (:203-215). A lista de assinaturas (listForAdmin, :166-201) não filtra data nenhuma.

**Correção:** Unificar a regra de "vigente" (isSignatureValidForAccess) nos três lugares.

---

## 18. [API] Assinatura paga com cartão novo (o único caminho de cartão do web) não emite nota fiscal · **NOVO**

**O que acontece:** O checkout do web só oferece cartão novo (POST /signature/credit/new). Esse método grava invoiceId null e nunca chama scheduleInvoice.createInvoice — o caminho irmão, de cartão salvo, chama. Toda venda de assinatura por cartão feita pelo site fica sem nota fiscal agendada no Asaas. No PIX a nota só nasce dentro do webhook, e por causa do achado do trial ela não nasce quando o pagamento veio de um trial promovido.

**Evidência:** api:companySignature.service.ts:262-266 (cartão salvo: `const invoice = await this.scheduleInvoice.createInvoice({ paymentId: firstPaymentId, customerId: company.paymentId, value: annualValue })`) versus :373-404 (cartão novo: `existingTrial.invoiceId = null` em :379 e `invoiceId: null` em :396, sem nenhuma chamada a scheduleInvoice no método newCreditCard). Nota do PIX só em :454-458, dentro do webhook.

**Correção:** Replicar o createInvoice de existingCreditCard dentro de newCreditCard.

---

## 19. [API] O cupom é consumido ao gerar o PIX, mesmo que o pagamento nunca aconteça · **NOVO**

**O que acontece:** Cupom com maxUsages limitado perde uma unidade a cada geração de QR Code. Como o botão vira 'Gerar novo PIX' e segue clicável, um único usuário esgota uma campanha inteira sem pagar nada.

**Evidência:** api:companySignature.service.ts:192-195 — `if (couponResult.coupon) { couponResult.coupon.incrementUsage(); await this.couponRepository.save(couponResult.coupon); }` no fim de pix(), incondicionalmente, sem esperar confirmação. Mesmo padrão em :307-310 (cartão salvo) e :406-409 (cartão novo), onde ao menos há cobrança real.

**Correção:** Mover o incrementUsage para o webhook, no ponto em que a assinatura passa a ACTIVE.

---

## 20. [API] Webhook trata 6 eventos; estorno, chargeback e inadimplência não estão entre eles

**O que acontece:** signatureValidation só reage a PAYMENT_RECEIVED, PAYMENT_CONFIRMED, SUBSCRIPTION_PAYMENT_RECEIVED, SUBSCRIPTION_CREATED, SUBSCRIPTION_DELETED e SUBSCRIPTION_CANCELLED. Não há tratamento de PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED, PAYMENT_DELETED nem PAYMENT_OVERDUE: quem pede estorno ou abre chargeback continua com o sistema liberado até a expirationDate, e a Equinology fica sem o dinheiro e sem sinal no banco.

**Evidência:** api:companySignature.service.ts:422-426, :486 e :498 são os três únicos ifs de evento do método; qualquer outro `event` cai no `return right(null)` da linha 520, sem log. Buraco adjacente: grep de 'webhook' na API retorna um único endpoint (POST /signature/webhook) — faturas e movimentações da clínica não têm handler (há um PaymentWebhookDto órfão em finance/dto/transaction.dto.ts:354, sem rota).

**Correção:** Tratar PAYMENT_REFUNDED/CHARGEBACK revogando o acesso, e PAYMENT_OVERDUE ao menos para alerta.

---

## 21. [API] Totais 'Pendente' e 'Pago' da tela de Finanças estão errados · **NOVO**

**O que acontece:** Movimentação de R$1.200 em 12x com 6 parcelas pagas aparece inteira em Pendente e zero em Pago — o proprietário vê que deve o dobro do real. E quando a clínica desmarca 'valor total' no web, o app exibe o valor da PARCELA rotulado como 'Valor total'.

**Evidência:** app/(tabs)/finances.tsx:70-71 somam `p.amount` por payment; lib/payment-utils.ts:8-9 só marca PAID quando todas as parcelas estão pagas. `isTotalValue` não é lido em lugar nenhum do app (grep vazio), embora payment.service.ts:144 defina `value: isTotalValue ? amount / quantity : amount` e NewPaymentSheet.tsx:299-301 exponha o checkbox. Rótulo 'Valor total' em InvoicePaymentSheet.tsx:609-612.

**Correção:** Somar as transactions (parcelas), não o amount do pai.

---

## 22. [API] Depois de pagar com cartão, a fatura continua marcada como pendente na lista · **NOVO**

**O que acontece:** Pagamento processado e fatura PAID no banco, mas o card atrás do modal segue com badge 'Pendente' até reabrir o app — gatilho para pagar duas vezes ou ligar para a clínica.

**Evidência:** InvoicePaymentSheet.tsx:436-438 e :541-546 fazem toast + closeInvoiceSheet(); contexts/ActionSheetContext.tsx:44-51 não tem callback de sucesso; app/(tabs)/finances.tsx:53-55 carrega só no mount (sem useFocusEffect nem pull-to-refresh). Backend já grava PAID em invoice.service.ts:460-461.

**Correção:** Callback onSuccess no sheet + refetch da lista.

---

## 23. [API] Senha inicial do proprietário é o próprio CPF

**O que acontece:** Quem souber e-mail + CPF (dados que circulam em contrato e cadastro de haras) entra na conta e vê os animais, o conteúdo compartilhado e as cobranças. O 'Primeiro Acesso' por código existe mas é opcional — a credencial previsível continua válida.

**Evidência:** client.service.ts:76 `const passwordHash = await this.hash.hash(password ?? cpf ?? email);` (idêntico no register, :291). Nenhuma flag de troca obrigatória no schema (grep mustChangePassword vazio). Login aceita normalmente: client.service.ts:246-272.

**Correção:** Gerar senha aleatória + exigir primeiro acesso por código, ou bloquear login enquanto a senha for a inicial.

---

## 24. [API] /transaction/pix e /transaction/credit/* sem checagem de dono da transação nem de tipo de token · **NOVO**

**O que acontece:** Com um transactionId qualquer, um cliente autenticado gera PIX de cobrança alheia e, ao pagar com cartão, marca a movimentação de OUTRO cliente como PAID. Corrompe o financeiro da clínica.

**Evidência:** transaction.controller.ts:148-195 — os três handlers só passam `clientId: userId`, sem o assertClientToken que o invoice.controller.ts:120-126 tem. No service, pix() (transaction.service.ts:206-316), existingCreditCard() (:318-382) e newCreditCard() (:384-453) validam o dono do CARTÃO (:348) mas nunca o dono da transação; :376-379 grava status PAID. O caminho de fatura tem a guarda certa (invoice.service.ts:381-382, 436-437, 492-493) — mas ela é `if (invoice.clientId && ...)`, então fatura sem cliente vinculado também pode ser paga por qualquer cliente.

**Correção:** Adicionar assertClientToken e validar que a transação pertence ao cliente do token; tornar a guarda da fatura incondicional.

---

## 25. [API] Editar um animal troca o codigo de vinculo dele (e Animal.code nao e unique) · **NOVO**

**O que acontece:** O `code` do animal e o segredo que o proprietario usa no app para se vincular. Qualquer edicao do animal feita pela clinica gera um codigo novo, entao o codigo ja enviado por WhatsApp ao cliente para de funcionar, sem aviso para ninguem. Alem disso Animal.code nao tem @unique (diferente de Client.code e StudFarm.code) e a busca usa findFirst: em caso de colisao o vinculo pode entregar um animal arbitrario, inclusive de outra clinica.

**Evidência:** api:src/domain/application/services/animal/services/animal.service.ts:193-195 `if (safeCompanyId) { animal.code = generateRandomString(8); }` — o controller sempre passa companyId para token de empresa (animal.controller.ts:109), entao o ramo dispara em TODA edicao pelo web. api:prisma/schema.prisma:398 `code String` sem @unique (compare :1763 Client.code @unique e :1995 StudFarm.code @unique). api:src/infra/shared/database/prisma/repositories/prismaAnimal.repository.ts:36-40 usa `findFirst`.

**Correção:** Remover a regeneracao do code no edit; adicionar @unique em Animal.code com migration e tratar colisao na geracao.

---

## 26. [API] owner-note é a única ficha nova que não valida a posse do atendimento — nota de uma clínica pode ser entregue ao proprietário de outra · **NOVO**

**O que acontece:** Todas as fichas clínicas novas passam por ClinicalRecordOwnershipService.canWrite, que valida animal E appointmentAnimal contra o companyId do token. O upsert da 'Anotação para o proprietário' valida apenas o animal; o appointmentAnimalId vem do path e nunca é conferido. Se ainda não existir nota naquele atendimento, a clínica A cria uma linha com o companyId dela e o appointmentAnimalId da clínica B. O impacto se realiza porque a leitura do app não filtra por empresa (autoriza por dono do animal e devolve a nota encontrada por appointmentAnimalId): texto escrito pela clínica A aparece no aplicativo do proprietário da clínica B. Exige conhecer um UUID de appointment_animals de terceiro, o que limita a exploração prática.

**Evidência:** vetequus-api/src/domain/application/services/animal/services/ownerNote.service.ts:45-50 — `const animal = await this.animalRepository.findById(animalId); if (!animal) return left(new ResourceNotFoundError()); if (animal.companyId !== companyId) return left(new NotAllowedError()); const existing = await this.ownerNoteRepository.findByAppointmentAnimalId(appointmentAnimalId);` (nenhuma checagem do appointmentAnimalId) · comparar com src/domain/application/services/animal/services/general/generalPrescription.service.ts:42-45 `if (!(await this.clinicalOwnership.canWrite({ animalId, appointmentAnimalId, companyId }))) return left(new NotAllowedError());` · src/domain/application/services/animal/services/clinicalRecordOwnership.service.ts:62-76 · leitura sem filtro de empresa em src/domain/application/services/client/services/clientPortal.service.ts:69-84

**Correção:** Injetar ClinicalRecordOwnershipService no OwnerNoteService.upsert e chamar canWrite({ animalId, appointmentAnimalId, companyId }), como nas demais fichas.

---

## 27. [API] Pagar movimentação ou fatura de terceiro: falta checagem de posse em 3 rotas · **NOVO**

**O que acontece:** Um cliente autenticado que obtenha um transactionId (não adivinha — sai em resposta de API, print, PDF, suporte) paga a parcela de outra pessoa com o próprio cartão e a marca como PAID. O crédito é lançado no cliente errado e a conciliação da clínica quebra. Fatura com clientId nulo pode ser paga por qualquer cliente.

**Evidência:** src/domain/application/services/finance/services/transaction.service.ts:206-262 (pix), :317-378 (existingCreditCard, grava status='PAID'), :383-455 (newCreditCard) — buscam a transaction pelo id da URL e NUNCA comparam com o clientId do token. invoice.service.ts:381, :436, :492: `if (invoice.clientId && invoice.clientId !== clientId)` — libera quando invoice.clientId é NULL. (No mesmo arquivo, transaction.service.ts:348 `creditCard.clientId !== clientId` está correto.)

**Correção:** Resolver o dono da parcela (transaction → payment → clientId/animal.clientId) e comparar com o clientId do token nas três rotas; recusar fatura com clientId nulo.

---

## 28. [API] Código de propriedade (studFarm) gerado com Math.random() — é credencial · **NOVO**

**O que acontece:** O code é o segredo que libera GET /stud-farm/code/:code (devolve a propriedade de qualquer tenant) e POST /stud-farm/:id/link (vincula um cliente à propriedade). Gerado com PRNG não criptográfico, cujo estado no V8 é recuperável a partir de saídas consecutivas.

**Evidência:** src/domain/application/services/studFarm/services/studFarm.service.ts:221-226 define uma função local `generateRandomString` com `Math.random()`, usada em :81 `code: generateRandomString(10)` — enquanto src/utils/generateRandomString.ts usa crypto.randomInt exatamente por esse motivo (e o código de animal, animal.service.ts:99, usa a versão correta). O acesso é validado em studFarm.service.ts:211 `if (!code || studFarm.code !== code)`. Mitigação parcial: Throttle 5/min em studFarm.controller.ts:182-184.

**Correção:** Apagar a função local e importar @/utils/generateRandomString.

---

## 29. [APP] Logs de debug de pagamento em produção, no app e na API

**O que acontece:** O payload PIX (copia-e-cola), ids de fatura/transação, clientId e o walletId da clínica saem no log do dispositivo e do servidor. Sem transform-remove-console, sobrevivem no build de release.

**Evidência:** app: InvoicePaymentSheet.tsx:271-277, 300-306, 323-328, 333-337 (inclui `body: res.body`), 340-347, 353, 356-359, 375-380, 390-394, 402, 752-771; babel.config.js sem transform-remove-console. API: transaction.service.ts:212, 221-228, 239-243, 248, 257, 265-269, 284-296, 305-308, 332-341, 398-405 — comentários ainda dizem 'remover depois que o bug for resolvido'.

**Correção:** Remover os console.log ou condicioná-los a __DEV__ / Logger com nível.

---

## 30. [APP] WEB descarta a mensagem específica de validação e sempre mostra texto genérico · **NOVO**

**O que acontece:** CLÍNICA, em TODOS os formulários. A API traduz e detalha ("O campo Raça é obrigatório"), mas o WEB resolve pelo `code` antes de olhar a mensagem e o code de toda validação é VALIDATION_ERROR, mapeado para "Confira os dados informados e tente novamente." Em ficha clínica com 20 campos o veterinário não descobre qual campo corrigir. Vale para animal, cliente, propriedade, atendimento, fatura e pagamento. Efeito colateral: o dicionário de NewAppointmentSheet.tsx:29-37 virou código morto, porque casa por strings em inglês que a API não emite mais.

**Evidência:** api:src/infra/main.ts:20-33 exceptionFactory devolve `{ message: flattenValidationErrors(errors), code: 'VALIDATION_ERROR' }` — web:lib/api-error.ts:202 `if (err.code && MESSAGE_BY_CODE[err.code]) return MESSAGE_BY_CODE[err.code];` com :95 `VALIDATION_ERROR: "Confira os dados informados e tente novamente."`, ANTES do bloco :212 `if (raw && looksPortuguese(raw)) return raw;`. Prova de que dispara: ApiContext.tsx:16-18 -> apiErrorFromResponse -> toApiError (api-error.ts:58-68) lê parsed?.code do corpo. Contraste que prova ser omissão: app:lib/api-error.ts:165-173 faz looksPortuguese ANTES do MESSAGE_BY_CODE, com comentário explicando por quê.

**Correção:** Mover o bloco `looksPortuguese(raw)` de api-error.ts:212 para antes da linha 202, igual ao APP. Manter MESSAGE_BY_CODE como fallback para mensagem vazia ou em inglês. É uma movimentação de bloco.

---

## 31. [APP] APP: a tela de pagamento de fatura não usa a camada de erro e cita "Asaas" e "logs do backend" para o cliente final

**O que acontece:** CLIENTE FINAL / PROPRIETÁRIO. É justamente o fluxo onde ele paga. Em erro de gateway a mensagem diz "peça para o suporte verificar os logs do backend" e nomeia o fornecedor "Asaas" — linguagem interna na tela do dono do cavalo. Em erro de validação, o corpo vem como array e o código faz cast para string, jogando o array no toast. Continuam os 15 console.log("[PIX DEBUG]") do arquivo, inclusive um logando a resposta do pagamento.

**Evidência:** app:components/sheets/InvoicePaymentSheet.tsx:369, :441 e :549 — `const msg = (res.body as { message?: string })?.message ?? "Erro ao processar pagamento";`. Texto do gateway em :370-372. Logs em :216,245,254,268,278,285,298,301,320,335,347,673,676,679,682. A camada existe e é boa (app:lib/api-error.ts inteiro) mas só 6 dos 22 arquivos que chamam a API a usam: login.tsx, signup.tsx, forgot-password.tsx, profile.tsx, notes.tsx, AnimalRegistrationSheet.tsx.

**Correção:** Trocar os 3 pontos por getApiErrorMessage(res, "...") e reescrever o texto do 502/504 em linguagem de usuário final; remover ou condicionar a __DEV__ os console.log.

---

## 32. [APP] Nao existe como excluir cliente, propriedade ou animal pela tela — e o endpoint que existe quebra com 500

**O que acontece:** Cadastro errado e permanente: nao ha botao de excluir em nenhuma das tres tabelas. Se o endpoint for ligado, ele quebra — DELETE /client/:id faz hard delete e a relacao Animal.clientId e obrigatoria sem onDelete (Restrict), entao cliente com qualquer animal gera violacao de FK nao tratada -> 500 generico. O soft delete existe mas e exclusivo do app do proprietario, e um cliente que apagou a propria conta pelo app continua aparecendo normalmente nas listas e dropdowns da clinica.

**Evidência:** web: nenhum DeleteAPI em app/(dashboard)/clients-equines/ exceto anotacoes do animal (clients-equines/animals/[id]/page.tsx:309); ClientsTable.tsx:237-243 so tem ViewActionButton e EditActionButton. api:src/domain/application/services/client/services/client.service.ts:170-187 -> `this.clientRepository.delete(client)` -> prismaClient.repository.ts:120-127 `prisma.client.delete`. api:prisma/schema.prisma:410 `client Client @relation(fields: [clientId], references: [id])` sem onDelete. Soft delete restrito ao app: api:client.controller.ts:79-88 (`DELETE /client/me`, exige tokenType === 'client'). api:prismaClient.repository.ts — grep por 'deletedAt' no arquivo inteiro: ZERO ocorrencias (fetch, fetchByCompanyId, count, countByCompanyId nao filtram). Unico lugar que trata: client.service.ts:255 (login).

**Correção:** Filtrar deletedAt em todos os fetch/count de cliente; se exclusao pela clinica for desejada, usar soft delete (desvincular da empresa) em vez de hard delete.

---

## 33. [APP] Migration marca todas as anotações existentes como do veterinário — o proprietário perde no app tudo o que já tinha escrito · **NOVO**

**O que acontece:** Antes, o app do proprietário escrevia na mesma tabela animal_notes usando a rota do veterinário. A migration cria a coluna authorType com DEFAULT 'VET' (e clientId NULL) para todas as linhas existentes, e o app passou a ler apenas authorType='OWNER' com clientId igual ao do token. Resultado no dia do lançamento: todas as anotações que o proprietário escreveu somem do aplicativo, sem aviso e sem tela de arquivadas, e passam a ser exibidas ao veterinário como se fossem dele. A própria migration documenta a assunção, mas não há remediação.

**Evidência:** vetequus-api/prisma/migrations/20260731122806_owner_notes_prescription_sharing_animal_note_author/migration.sql — `ALTER TABLE "animal_notes" ADD COLUMN "authorType" "AnimalNoteAuthorType" NOT NULL DEFAULT 'VET', ADD COLUMN "clientId" UUID, ADD COLUMN "userId" UUID;` (o cabeçalho do arquivo assume: 'Anotações que na verdade eram do proprietário passam a aparecer só no web') · equinology-app-v2 `git show 6bcfef8:"app/(animal)/notes.tsx":38` — `const res = await GetAPI(ApiRoutes.AnimalNote.byAnimal(animalId));` (o app usava a rota do vet) · vetequus-api/src/domain/application/services/client/services/clientPortal.service.ts:127-129 — `findManyByAnimalId(animalId, 'OWNER')` + `.filter((note) => note.clientId === clientId)`

**Correção:** Backfill que reclassifique por origem conhecida, ou aviso na tela do app, ou decisão consciente e registrada do dono — é perda de dado visível ao cliente final.

---

## 34. [OUTRO] Quem já tem cartão salvo não consegue pagar com um cartão novo

**O que acontece:** Cartão salvo vencido/sem limite = nenhum caminho de cartão. Sobra o PIX, que nunca confirma.

**Evidência:** components/sheets/InvoicePaymentSheet.tsx:811 `{creditCards.length > 0 ? (` — o ramo verdadeiro só lista cartões e o botão de pagar (:835-841); o bloco 'Adicionar cartão e pagar' vive exclusivamente no else (:843-855).

**Correção:** Expor 'usar outro cartão' também quando há cartões salvos.

---

## 35. [OUTRO] Agenda do proprietário carrega só a primeira página (10 atendimentos) · **NOVO**

**O que acontece:** O calendário mostra apenas os 10 agendamentos mais recentes; meses anteriores aparecem vazios, sem aviso.

**Evidência:** app/(tabs)/agenda.tsx:74 `GetAPI(ApiRoutes.Appointment.fetchByClient + "?page=1")` — o `pages` da resposta é ignorado. A API pagina 10 em 10 (prismaAppointment.repository.ts:336-338, appointment.controller.ts:216-222). A tela de atendimentos do animal pagina certo ((animal)/vet/index.tsx:86-121), e o financeiro já foi corrigido em lib/client-finances.ts.

**Correção:** Reusar o padrão de fetchAllPages do client-finances.ts.

---

## 36. [OUTRO] Anexos clínicos em bucket R2 público, chave previsível, sem revogação

**O que acontece:** O ultrassom, o laudo e a foto do animal ficam legíveis para sempre por quem tiver a URL — cliente que trocou de clínica, ex-funcionário, qualquer um. A autorização protege a referência, nunca o arquivo: o navegador busca direto no pub-*.r2.dev sem passar pela API. Não há como revogar.

**Evidência:** src/infra/shared/storage/r2-storage.ts:44-66 — `const shortId = randomUUID().split('-')[0]` (32 bits) e Key = `<slug-do-nome-original>-<shortId>.<ext>`; file.controller.ts:72 devolve `${CLOUDFLARE_URL}/${url}` e CLOUDFLARE_URL=https://pub-a4f3763969d34f86b87fd3d880941bfc.r2.dev (bucket público). O upload não é vinculado a companyId nem a registro nenhum.

**Correção:** Bucket privado + URL assinada com expiração emitida pela API após checar posse; UUID completo na chave.

---

## 37. [OUTRO] Swagger e Scalar servidos em produção sem autenticação · **NOVO**

**O que acontece:** GET /api e GET /reference entregam o mapa completo da API (endpoints, DTOs, campos, enums) para qualquer um. É o insumo que transforma qualquer IDOR residual em exploração dirigida.

**Evidência:** src/infra/main.ts:47 `SwaggerModule.setup('api', app, document);` e :50-57 `app.use('/reference', apiReference(...))` — sem checagem de NODE_ENV e sem guard; por serem middlewares Express montados no app, o APP_GUARD (AuthGuard) não os cobre.

**Correção:** Condicionar a NODE_ENV !== 'production' ou proteger com basic auth.

---

## 38. [OUTRO] Token de 90 dias sem revogação: excluir usuário ou desativar admin não derruba a sessão · **NOVO**

**O que acontece:** Colaborador demitido e excluído em DELETE /user/:id continua com acesso total à clínica por até 90 dias. Admin do painel desativado continua operando todas as rotas administrativas normais. Combinado com o JWT_SECRET vazado, não existe sequer o recurso de 'trocar a senha para expulsar'.

**Evidência:** src/infra/shared/auth/auth.module.ts:16 `signOptions: { expiresIn: '90d' }`; auth.guard.ts:33-43 não consulta o banco; admin-auth.guard.ts NÃO checa `admin.active` (só admin-super-admin.guard.ts:23 checa). Não existe blacklist nem refresh token no projeto.

**Correção:** Reduzir a expiração, adicionar refresh token, e checar existência/active da conta no guard (ou um tokenVersion no banco).

---

## 39. [OUTRO] GET /coupons/validate/:code público e sem rate limit: enumeração de cupom · **NOVO**

**O que acontece:** Persona EQUIPE EQUINOLOGY perde receita: cupons são cadastrados à mão no ADM, logo são curtos e humanos (PROMO10, LANCAMENTO). Um dicionário acha todos em minutos e o desconto vira público.

**Evidência:** src/infra/http/controllers/admin/publicCoupon.controller.ts:13-27 — @IsPublic() sem @UseGuards(ThrottlerGuard); devolve isValid, discountType, discountPercentage, discountFixedAmount e o cupom inteiro. (Compare com animal.controller.ts:191-192 e studFarm.controller.ts:182-184, que aplicam Throttle 5/min no mesmo tipo de rota-por-código.)

**Correção:** @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 60_000 } }).

---

## 40. [WEB] Editar valor ou parcelas de uma movimentação não altera as parcelas — a tela passa a mostrar dois números diferentes · **NOVO**

**O que acontece:** A clínica corrige uma movimentação de R$ 1.000 para R$ 1.500 (ou de 1x para 3x). Depois: a listagem mostra R$ 1.500 (lê payment.amount); as parcelas no detalhe continuam somando R$ 1.000; os KPIs 'Recebido/A receber' mostram R$ 1.000, porque computeFinancialKpis soma p.transactions[].value. O total do topo da tela não bate com a listagem logo abaixo, sem nenhum aviso — mesmo sintoma do antigo D7, reintroduzido por outra causa.

**Evidência:** vetequus-api/src/domain/application/services/finance/services/payment.service.ts:191 `if (amount !== undefined) paymentExists.amount = amount;`, :193 `if (quantity !== undefined) paymentExists.quantity = quantity;`, :203 `await this.paymentRepository.save(paymentExists);` — fim do método. `grep -n transactionRepository payment.service.ts` retorna só :28 (injeção) e :152 (createMany do create): o edit nunca toca nas Transaction. Front expõe os dois campos: equinology-web-v2/app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx:130-134 (Valor) e :155-161 (Parcelas), enviados em PUT /payment/:id (:84-90). KPIs a partir das transações: financial/_utils/financialSummary.ts:38-47.

**Correção:** No edit, quando amount/quantity/isTotalValue mudarem, regerar as parcelas ainda PENDING (preservando as já pagas) ou bloquear a edição desses campos quando houver parcela paga.

---

## 41. [WEB] O link público da fatura é o próprio documento codificado na URL: dá para editar o valor

**O que acontece:** O token da URL é base64url puro do JSON. Decodifica, muda o total e os itens, recodifica — e a página exibe o novo valor com a logo, o CNPJ e a chave PIX da clínica. Um cliente gera um 'comprovante de fatura' de R$ 50 para uma cobrança de R$ 5.000. Ressalva honesta: a chave PIX vai no payload, então o dinheiro continua indo para a clínica; o dano é de prova documental — a página tem cara de documento oficial e não é verificável.

**Evidência:** equinology-web-v2/lib/invoice-share.ts:57-59 `export function encodeInvoicePayload(p) { return toBase64Url(JSON.stringify(p)); }` e :61-68 `decodeInvoicePayload` só faz base64url→JSON.parse com `if (parsed?.v !== 1 || !Array.isArray(parsed.it)) return null;` — sem HMAC, sem assinatura, sem consulta ao backend. app/fatura/[token]/page.tsx:20-21 chama decodeInvoicePayload(token) e :38 calcula o subtotal a partir de data.it. Geração em ViewPaymentSheet.tsx:155-156.

**Correção:** Assinar o payload com HMAC server-side, ou trocar por um id opaco resolvido por endpoint público somente-leitura.

---

## 42. [WEB] 'Todo período': os KPIs cobrem uma janela e a tabela cobre outra · **NOVO**

**O que acontece:** Com 'Todo período' selecionado, qualquer movimentação de mais de 12 meses atrás — ou de mais de 3 meses à frente, comum em parcelamento longo — aparece na tabela e não entra nos KPIs. Os quatro cards e o gráfico ficam menores que a listagem, sem aviso. Nos demais presets ('Este mês' é o default) os dois lados batem. Nota: o antigo D7 (KPIs só com a 1ª página) FOI corrigido — useFinancialData.ts:100-125 percorre todas as páginas em lotes.

**Evidência:** equinology-web-v2/app/(dashboard)/financial/page.tsx:50 `if (preset === "all") return { start: "", end: "" };`. Com strings vazias, _utils/useFinancialData.ts:64 avalia `hasCustom = false` e cai no default de :78-80 `subMonths(new Date(), DEFAULT_MONTHS_BACK)` / `addMonths(new Date(), DEFAULT_MONTHS_FORWARD)` (12 e 3). A PaymentsTable recebe as mesmas strings vazias (page.tsx:242-243) e, sem datas, prismaPayment.repository.ts→getTransactionDateFilter retorna undefined, devolvendo tudo.

**Correção:** No preset 'all', ou não aplicar janela default no useFinancialData, ou propagar a mesma janela para a tabela.

---

## 43. [WEB] Cadastro de clínica nova: campos obrigatórios no back são opcionais no front, e a falha vira 'Registro não encontrado. Ele pode ter sido removido.' · **NOVO**

**O que acontece:** O formulário de 'Nova clínica' mostra CPF/CNPJ, Nome da clínica, CEP, Endereço e Número sem `required` e sem asterisco. A API exige CPF-ou-CNPJ E endereço E número E CEP, e devolve ResourceNotFoundError quando falta qualquer um. O usuário lê 'Registro não encontrado. Ele pode ter sido removido.' embaixo do botão Criar conta, sem saber o que corrigir. Mesma frase aparece quando o código da clínica está errado no cadastro por vínculo. É exatamente o cenário que o dono pediu para não existir ('precisa dizer não foi possível criar conta por XYZ').

**Evidência:** web:app/(auth)/register/page.tsx:258-313 (cinco campos sem `required`) e :96-102 (`if (payload.cpfCnpj) body.cpfCnpj = ...`); api:User.service.ts:254-259 — `if (!cpf && !companyCnpj) return left(new ResourceNotFoundError()); if (!paymentType || !address || !number || !postalCode) { return left(new ResourceNotFoundError()); }`; api:error.handler.ts:50 mapeia para 404 code RESOURCE_NOT_FOUND; web:lib/api-error.ts:88 traduz esse code para 'Registro não encontrado. Ele pode ter sido removido.' e :202 faz o code ganhar da mensagem da API. Código de clínica inexistente: User.service.ts:343-346.

**Correção:** Trocar esses ResourceNotFoundError por ValidationError com texto próprio ('Informe CPF ou CNPJ', 'Informe o CEP') e marcar os campos como obrigatórios na tela. Duplicidade de e-mail já funciona bem (409 com field).

---

## 44. [WEB] Checkout PIX não confirma nada: sem polling, sem botão 'verificar', e o texto contradiz o código (D4, intacto)

**O que acontece:** O cliente gera o QR, paga no banco e a tela nunca muda. Nenhum polling, nenhum refetch, nenhum redirect, nenhum e-mail. Se fechar a aba, a única forma de saber se funcionou é tentar navegar e ver se o middleware o rebate. Pior: a mensagem promete 'A assinatura será ativada após a confirmação do pagamento' — falso quando existe trial (já foi ativada na hora) e impossível de acompanhar quando não existe.

**Evidência:** web:app/(auth)/checkout/[id]/page.tsx:601-615 — o bloco PIX é um <form> com um único <Button type="submit">; não há setInterval no arquivo (os únicos setTimeout são o do 'Copiado!' em :329 e o do redirect de cartão em :387). Texto em :314-316.

**Correção:** Polling em GET /signature/current a cada ~5s enquanto a tela estiver aberta + botão 'Já paguei / Verificar pagamento'.

---

## 45. [WEB] Rotas /api/* do Next ficam fora do middleware e sem autenticação — a chave da OpenRouter está aberta na internet · **NOVO**

**O que acontece:** POST /api/chat, /api/audio/transcribe, /api/audio/transcribe-to-form e /api/audio/transcribe-to-odontogram usam process.env.OPENROUTER_API_KEY e não checam token nenhum. Não estão no matcher, então o middleware nem roda. Qualquer pessoa que descubra a URL gasta a conta de LLM da Equinology (até 15 MB de áudio por request).

**Evidência:** web:app/api/audio/transcribe/route.ts:7-14 — `export async function POST(request: Request) { const apiKey = process.env.OPENROUTER_API_KEY; if (!apiKey) {...}` — a única checagem antes de gastar a chave é a existência da própria chave; idem web:app/api/chat/route.ts:11-19. web:middleware.ts (config.matcher) não tem nenhuma entrada /api. Nota positiva no mesmo arquivo: as dez rotas do dashboard estão todas cobertas e o furo S5 (/notes, /reminders) está fechado; as rotas mortas /stock2 e /cooperators citadas no STATUS-VERIFICADO já não existem mais.

**Correção:** Exigir o cookie/token nessas route handlers (ou incluí-las no matcher com validação), e considerar rate limit por sessão.

---

## 46. [WEB] Falha silenciosa de leitura no WEB: KPI financeiro zerado e dropdown vazio quando a API falha · **NOVO**

**O que acontece:** CLÍNICA. Quando a API falha, a home mostra R$ 0,00 de entradas e saídas do mês, lucro 0 e gráfico vazio — não é "carregando", não é erro, é um NÚMERO, e o número está errado. O card de alertas de estoque diz "nenhum produto abaixo do mínimo" quando na verdade não conseguiu perguntar. E os selects de cliente/animal/produto de 8 telas mostram "nenhum resultado", indistinguível de "esta clínica não tem cadastros". Pior que mensagem feia: é informação falsa apresentada com confiança.

**Evidência:** web:hooks/usePaginatedSelect.ts:81-86 `.catch(() => { if (id !== reqId.current) return; setItems([]); setPage(0); setTotalPages(0); });` — usado por NewAppointmentSheet, NewPaymentSheet, NewInvoiceSheet, CreateNoteSheet, NotesTable, AddStockEntrySheet, SendGeneralToVolanteSheet, StockOutputSheet. web:app/(dashboard)/_components/DashboardEntryExit.tsx:118-122 `.catch(() => { setTotalIncome(0); setTotalOutcome(0); setChartData([]); })`; mesmo padrão em DashboardCommercialSector.tsx:126-130 (leads e lucro -> 0), DashboardGeneralStockTable.tsx:98, DashboardVolanteStockTable.tsx:89, DashboardStockAlertsCard.tsx:185, StockProductsTable.tsx:88, StockMovementsTable.tsx:62. Padrão correto já existe no repo: ServiceOverview.tsx:86-89 `.catch(() => { toast.error("Erro ao carregar anotações."); setNotes([]); })`.

**Correção:** Estado de erro por card ("Não foi possível carregar — tentar novamente") em vez de zero; nos selects, mensagem de erro no lugar do "nenhum resultado".

---

## 47. [WEB] CPF inválido no cadastro é reportado como "Não foi possível processar o pagamento"

**O que acontece:** CLÍNICA. No registro de clínica nova a API cria o cliente no Asaas antes de criar a conta. CPF/CNPJ inválido -> o Asaas recusa -> PaymentError com a descrição real (em PT) na message -> mas o WEB resolve pelo code PAYMENT_ERROR e mostra "Não foi possível processar o pagamento. Confira os dados e tente novamente." O usuário lê sobre um pagamento que nunca tentou fazer e não descobre que o campo errado é o CPF. Mesma raiz do achado A1.

**Evidência:** api:User.service.ts:273 e :288 `if (createPaymentId.isLeft()) return left(new PaymentError(createPaymentId.value.message));` — api:error.handler.ts:63 -> 400 code PAYMENT_ERROR — web:lib/api-error.ts:98-99 `PAYMENT_ERROR: "Não foi possível processar o pagamento. Confira os dados e tente novamente."` vence a mensagem específica por causa da ordem em :202. Risco adjacente ainda aberto: api:src/infra/shared/bank/asaas.ts:99 `connect.data.errors[0].description` sem `?.` (idem :148,186,206,214,230,240) — com ASAAS_KEY inválida ou HTML de proxy dá TypeError; hoje não vaza stack (o filtro global captura) mas o cadastro morre no genérico.

**Correção:** Corrigir a ordem em web:lib/api-error.ts (achado A1) resolve este também; e blindar os 7 acessos de asaas.ts com ?. e fallback.

---

## 48. [WEB] Criar animal/propriedade/cliente a partir de outra modal nunca auto-seleciona o registro criado

**O que acontece:** No fluxo 'Nova atividade -> nao achei o animal -> + criar animal', o animal e criado mas o onSuccess nunca dispara: o formulario pai volta com o campo vazio e o usuario precisa fechar tudo e procurar na lista. Idem para propriedade e cliente. No caso do cliente ha um agravante: o workaround busca o recem-criado por e-mail na pagina 1 de /client, que e ordenada por nome asc com take 10 — numa clinica com mais de 10 clientes o registro normalmente nao esta la e o onSuccess tambem falha.

**Evidência:** API ja devolve embrulhado: api:animal.controller.ts:86 `return { animal: AnimalPresenter.toHTTP(...) }`; api:studFarm.controller.ts:75 `return { studFarm: ... }`; api:client.controller.ts:48 `return { client: ... }`. Front le a chave errada: web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:621-635 `const created = await PostAPI<{id;name}>("/animal", body); ... if (created?.id && onSuccess)`; web:.../NewPropertySheet.tsx:284-303 `if (created?.id && onSuccess) onSuccess(created as StudFarm)`; web:.../CreateOwnerSheet.tsx:189-193 `GetAPI("/client?page=1")` + find por email, contra api:prismaClient.repository.ts:161-163 `orderBy: [{name:'asc'},{id:'asc'}], take: 10`. Bonus: console.log em producao em CreateAnimalSheet.tsx:625 e NewPropertySheet.tsx:285.

**Correção:** Ler `created.animal.id` / `created.studFarm.id` / `created.client.id` nos tres sheets e remover o workaround por e-mail.

---

## 49. [WEB] CRM: cada coluna mostra no maximo 10 leads e os KPIs contam so o que foi carregado; filtros nao existem na tela · **NOVO**

**O que acontece:** A clinica com 30 leads em 'Novo contato' ve 10 cartoes, o cabecalho da coluna diz '10 leads' e o KPI 'Total de leads' diz 10. Nao ha 'carregar mais', paginacao nem qualquer indicacao de que existe mais. Do 11o lead em diante o registro e indistinguivel de um lead perdido — e nem pode ser arrastado para outra coluna. Os filtros (busca, data inicio, data fim) existem no service e no backend mas nao existe UI que os acione.

**Evidência:** api:src/infra/shared/database/prisma/repositories/prismaBoard.repository.ts:51-60 — `leads: { orderBy: [...], take: 10 }` com `_count: { leads: true }` no mesmo include (a API sabe o total real). web:app/(dashboard)/crm/_components/KanbanColumn.tsx:64 usa `{leads.length}` (array truncado) em vez de leadQuantity. web:app/(dashboard)/crm/_components/CrmKpis.tsx:14-23 `boards.reduce((s, b) => s + b.leads.length, 0)` nos 4 KPIs. web:app/(dashboard)/crm/_components/CrmKanban.tsx:47 `boardService.fetchBoardsWithLeads({ GetAPI })` sem params, embora web:services/crm/boardService.ts:11-21 aceite query/startDate/endDate; grep por startDate/query nos componentes de crm retorna zero.

**Correção:** Usar leadQuantity/_count nos contadores e KPIs; adicionar paginacao incremental por coluna; construir (ou remover) a UI de filtros.

---

## 50. [WEB] CEP e pedido nas duas modais de propriedade e nunca e gravado

**O que acontece:** A modal de criar propriedade tem campo CEP com busca ViaCEP; a de editar tambem. O CEP preenche rua/bairro/cidade/UF e depois e descartado: ao reabrir a propriedade para editar, o CEP esta sempre vazio e o usuario redigita. Nao sobrevive a um F5.

**Evidência:** web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx:270-282 — o body montado tem name, city, state, location, address, street, number, neighborhood, responsibleName, responsiblePhone, clientId; SEM cep. web:app/(dashboard)/_components/sheets/EditPropertySheet.tsx:371-386 renderiza o campo 'CEP' que abre sempre vazio (useState('') na :45). api:src/infra/http/controllers/studFarm/dto/studFarm.dto.ts — CreateStudFarmDto/EditStudFarmDto sem campo cep. api:prisma/schema.prisma — model StudFarm sem coluna de CEP.

**Correção:** Migration + coluna cep em StudFarm, campo no DTO, envio no front e exposicao no StudFarmPresenter.

---

## 51. [WEB] 'Reagendar' pela modal de status move o atendimento inteiro (todos os animais)

**O que acontece:** Num atendimento com 3 animais, reagendar o animal A pela modal de status move os 3 para a nova data. So o status do animal A volta para 'Agendado'; os outros dois ficam com o status antigo numa data que ninguem escolheu. O endpoint correto de split existe e e usado em outra tela.

**Evidência:** web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:150-158 — o ramo RESCHEDULED faz `PutAPI('/appointment/'+appointmentId, { startDate, endDate, description })` seguido de `PutAPI('/appointment-animal/'+targetId, { status: 'PENDING' })`. Nao ha chamada a POST /appointment/:id/reschedule (api:src/domain/application/services/appointment/services/appointment.service.ts:245+ rescheduleSplit), nem contagem de animais, nem aviso no JSX (:271-296). Bomba latente na mesma funcao, :149 `const targetId = appointmentAnimalId ?? appointmentId;` — o unico guard do submit e `if (!appointmentId) return` (:127).

**Correção:** Usar rescheduleSplit na modal de status quando o atendimento tiver mais de um animal; exigir appointmentAnimalId em vez do fallback.

---

## 52. [WEB] Editar um atendimento reenviando a lista de animais apaga status e desconecta as fichas clinicas

**O que acontece:** PUT /appointment/:id com `animals` faz deleteMany + createMany com status PENDING. Todos os AppointmentAnimal sao recriados com id novo — o que zera o status por animal e desconecta as fichas clinicas ja criadas (todos os modelos de ficha tem FK appointmentAnimalId). Hoje o dano esta contido porque a unica tela de edicao so manda a descricao, com um aviso em caixa alta no topo do arquivo; mas o contrato da API continua armado para o proximo desenvolvedor. Efeito colateral aceito: nao existe forma de editar data, tipo, responsavel, propriedade ou animais de um atendimento pela interface.

**Evidência:** api:src/domain/application/services/appointment/services/appointment.service.ts:225-238 — `await this.appointmentAnimalRepository.deleteMany({ appointmentId }); await this.appointmentAnimalRepository.createMany(animals.map(a => AppointmentAnimal.create({ ..., status: 'PENDING' })))`. Mitigacao no front: web:app/(dashboard)/_components/sheets/EditAppointmentSheet.tsx:19 comentario '⚠️ NUNCA envie `animals` no PUT /appointment/:id' e :81-84 `await PutAPI('/appointment/'+appointmentId, { description })`.

**Correção:** Fazer diff da lista de animais no service (adicionar/remover so o que mudou, preservando os AppointmentAnimal existentes) em vez de deleteMany+createMany.

---

## 53. [WEB] OE / OD (ovario esquerdo e direito) sao digitados na Avaliacao Ginecologica e descartados

**O que acontece:** Na Avaliacao Ginecologica da Doadora e da Receptora a tela tem os campos OE, U e OD. O achado de cada ovario — o dado central do exame — nao tem coluna no banco, nao e enviado e nao volta. O veterinario digita e o sistema descarta em silencio, com toast de sucesso.

**Evidência:** web:app/(dashboard)/services/_data/mock.ts:341 `{ key: "leftOvary", label: "OE", inline: true }` e :343 `{ key: "rightOvary", label: "OD", inline: true }`. web:services/boardRecordService.ts, bloco "donor-gyno": buildCreateBody envia vulva, cervix, utero, observation, ultrasound, bodyScore, parity, angle, vulva2, vulvoplastia, cyto — sem leftOvary/rightOvary. api:prisma/schema.prisma:1198-1226 model ReproductionDonorGyno nao tem coluna de ovario. api:src/infra/http/presenters/reproduction/reproductionDonorGyno.presenter.ts idem.

**Correção:** Migration com colunas leftOvary/rightOvary em ReproductionDonorGyno e ReproductionReceptorGyno, DTO, presenter e envio/leitura no front.

---

## 54. [WEB] Voz preenche campos select sem validar contra as opções: a tela mostra 'Selecione' e o registro salva o texto errado · **NOVO**

**O que acontece:** O veterinário dita, o modelo devolve um valor que não bate exatamente com nenhuma opção ('negativo' minúsculo, 'Não gestante'), o valor entra cru no formData, o Select renderiza por match exato e exibe o placeholder 'Selecione' (parece vazio), a validação de obrigatório olha o formData e PASSA, e o prontuário grava um valor que o veterinário nunca viu nem selecionou. Atinge campos clínicos binários: Diagnóstico Final→Resultado (Positivo/Negativo), Parto→Situação (Vivo/Morto/Aborto), Exame Físico→Sensibilidade, Raio-X. A auditoria anterior corrigiu exatamente isso no Criar animal criando lib/voice-match.ts; as ~40 seções da ficha clínica ficaram de fora.

**Evidência:** equinology-web-v2/app/api/audio/transcribe-to-form/route.ts:86-106 — `normalizeStructuredData` só remove placeholders, nunca compara com field.options · app/(dashboard)/services/_components/AudioToFormButton.tsx:304 — `applied[field.key] = str;` (tratamento especial existe só para type === "date", linhas 288-303) · components/ui/select.tsx:100-101 — `const selectedOption = options.find((o) => o.value === value); const displayValue = selectedOption?.label ?? "";` e :326 `{displayValue || (emptyLabel ?? placeholder)}` · app/(dashboard)/services/_components/ServiceRecords.tsx:483-489 — `.filter((f) => f.required && !(formData[f.key] ?? "").trim())` · campos em app/(dashboard)/services/_data/mock.ts:317,325,407,408,411

**Correção:** Aplicar lib/voice-match.ts (já existe no repo) aos campos type === 'select' do AudioToFormButton; o que não casar vira issue no resumo de revisão, nunca valor no formulário.

---

## 55. [WEB] Status de dente não reconhecido é descartado em silêncio — o dente volta a 'saudável' no laudo · **NOVO**

**O que acontece:** O bug histórico (rótulo PT no banco → dente preto) está de fato resolvido nos dois sentidos, verifiquei os dois caminhos. O que sobrou: um valor que não bata em nenhum alias é JOGADO FORA, e o dente passa a contar como saudável — o mesmo falso-negativo de antes, só que agora sem o dente preto para denunciar. Além disso, as duas tabelas de alias são cópias manuais mantidas em arquivos diferentes e JÁ DIVERGEM ('hígido' com acento existe só numa delas); hoje o efeito é nulo, mas o par está livre para divergir num alias que importe.

**Evidência:** equinology-web-v2/app/(dashboard)/services/_components/odontogram/odontogram-model.ts:74-78 — `const d = normalizeToothStatus(src.d); const p = normalizeToothStatus(src.p); if (d && d !== "healthy") marks.d = d; if (p && p !== "healthy") marks.p = p; if (marks.d || marks.p) out[id] = marks;` · odontogram-status.ts:94-98 — `if (CANONICAL.has(value)) return value as ToothStatus; return LEGACY_STATUS_ALIASES[value.trim().toLowerCase()];` (devolve undefined) · divergência: odontogram-status.ts:61-81 contém `"hígido": "healthy"`, enquanto o espelho em lib/pdf/OdontogramPdf.tsx:439-458 não o contém

**Correção:** Valor não reconhecido deve gerar item explícito no laudo ('Dente 207 · dente · achado não reconhecido: "desgaste"') em vez de sumir; e as duas tabelas de alias devem sair de um único módulo compartilhado.

---

## 56. [WEB] 4 rotas Next públicas gastam a chave de IA (OPENROUTER_API_KEY) do dono · **NOVO**

**O que acontece:** Qualquer um chama /api/chat com systemPrompt arbitrário em loop e usa o produto como proxy de LLM gratuito na conta do dono. As três rotas de áudio idem. Sem token, sem rate limit.

**Evidência:** equinology-web-v2/app/api/chat/route.ts:12 `const apiKey = process.env.OPENROUTER_API_KEY;` (aceita messages e systemPrompt do corpo); app/api/audio/transcribe/route.ts:9; app/api/audio/transcribe-to-form/route.ts; app/api/audio/transcribe-to-odontogram/route.ts — nenhuma checa autenticação, e middleware.ts (config.matcher) não cobre /api.

**Correção:** Ler o cookie de sessão nessas rotas (ou incluir /api/:path* no matcher) e aplicar limite por usuário.

---

## 57. [WEB] Fatura pública é base64 sem assinatura — página de cobrança falsa no domínio do produto

**O que acontece:** Dá para montar o JSON com nome, CNPJ e logo de uma clínica real e a chave PIX do atacante, e mandar o link https://app.equinology.com.br/fatura/<token> ao cliente final. A página é servida no domínio legítimo com HTTPS válido e tem botão 'copiar chave PIX'. Não vaza dado de outro tenant — o risco é forjar, não ler.

**Evidência:** equinology-web-v2/lib/invoice-share.ts:56-58 `encodeInvoicePayload` é só toBase64Url(JSON.stringify(p)); :60-68 `decodeInvoicePayload` só faz base64url→JSON.parse e checa `parsed?.v !== 1`. Nenhum HMAC, nenhuma chamada ao backend, nenhuma expiração. app/fatura/[token]/page.tsx:22 renderiza o payload direto, incluindo data.k (chave PIX). A rota /fatura não está no matcher do middleware.

**Correção:** Assinar o payload com HMAC de servidor e validar no render, ou trocar por um id opaco resolvido pelo backend.

---

# MENOR — 32

## 1. [ADM] Dashboard conta "Planos ativos" errado — conta todos, inclusive os inativos · **NOVO**

**O que acontece:** Métrica do dashboard sempre igual ao total de planos.

**Evidência:** adm:src/app/(private)/page.tsx:225-227 `plansList.filter((p: { active?: boolean }) => p.active !== false)` — a API devolve `isActive`, não `active` (api:signaturePlan.presenter.ts:14). Anúncios funcionam por acaso porque o presenter tem alias `active` (advertisement.presenter.ts:11).

**Correção:** Ler `isActive`.

---

## 2. [ADM] Não dá para limpar walletId (nem endereço/CEP) da empresa · **NOVO**

**O que acontece:** O walletId decide para onde vai o dinheiro da clínica. Se estiver errado, o admin só consegue sobrescrever, nunca remover — e não há validação de formato em lugar nenhum.

**Evidência:** adm:CompanyDetailModal.tsx:88-93 envia `walletId: data.walletId?.trim() || undefined`; api:adminCompanyUpdate.service.ts:41 `if (walletId !== undefined) company.walletId = walletId;`. O CNPJ é a única exceção (envia null explícito).

**Correção:** Enviar null quando o campo é esvaziado; validar formato do walletId.

---

## 3. [ADM] Criar plano sem preço: o formulário deixa submeter e a API responde 400 com array colado

**O que acontece:** O admin envia sem preço e recebe uma mensagem com os erros concatenados sem separador.

**Evidência:** adm:PlansForm.tsx:12-14 `priceCardCents/pricePixCents ... .optional()`; api:adminPlan.dto.ts:29-36 `@IsNumber() @IsNotEmpty()`. adm:PlanCreateModal.tsx:52-55 joga `res.body?.message` (array) direto no <p> e no toast.

**Correção:** Tornar os preços obrigatórios no zod e tratar `message` como array.

---

## 4. [ADM] Preço do plano em centavos, backspace preso em "0,00"; cupom abre com valor 0 inválido

**O que acontece:** Digitar 150 no preço vira R$ 1,50; o campo de cupom abre com 0, valor que o próprio schema rejeita.

**Evidência:** adm:PlansForm.tsx:157-168 e :185-198 com parsePriceToCents (lib/utils.ts:65-68); adm:CouponsForm.tsx:63-73 `value: 0` contra o superRefine em :44-58 que exige > 0.

**Correção:** Adotar um NumberInput/CurrencyInput compartilhado; inicializar o cupom vazio com placeholder.

---

## 5. [ADM] Modal "Nova assinatura" pré-seleciona a primeira empresa e o primeiro plano

**O que acontece:** Abrir e submeter cria assinatura para a primeira empresa da lista, sem escolha explícita.

**Evidência:** adm:SubscriptionCreateModal.tsx:57 `if (arr.length) setCompanyId(arr[0].id);` e :66 `if (normalized.length) setPlanId(normalized[0].id);`

**Correção:** Deixar o valor vazio e confiar no `required` do select.

---

## 6. [ADM] Link de cobrança só é copiado para a área de transferência, nunca exibido · **NOVO**

**O que acontece:** Fora de contexto seguro (HTTP) ou sem permissão de clipboard, a promise rejeita sem catch e o link se perde — mas o toast de sucesso já apareceu.

**Evidência:** adm:SubscriptionDetailModal.tsx:92-96 e :133-135 — `navigator.clipboard.writeText(res.body.invoiceUrl)` seguido de `toast.success("Link de cobrança copiado.")`, sem exibir a URL nem tratar rejeição.

**Correção:** Mostrar a URL num input readonly além de copiar (o padrão já existe no SubscriptionCreateModal:137-150).

---

## 7. [ADM] Login do ADM sem olhinho; exclusões com confirm() nativo; código da empresa nunca exibido

**O que acontece:** Fricção de operação: o admin não confere a senha digitada, todas as exclusões usam o diálogo do browser, e o `code` que a clínica precisa para convidar colaboradores não aparece em nenhuma tela.

**Evidência:** adm:src/app/login/page.tsx:94-104 (type="password" fixo; AuthInput.tsx sem Eye/EyeOff). confirm() em coupons/page.tsx:70, plans/page.tsx:55, ads/page.tsx:148, tutorials/page.tsx:108, SubscriptionDetailModal.tsx:106. `code` é devolvido por api:company.presenter.ts:8 e normalizado em companies/page.tsx:20, mas grep por "code" em CompanyDetailModal.tsx: zero ocorrências.

**Correção:** Adicionar toggle de senha, substituir confirm() por modal e exibir o código da empresa no detalhe.

---

## 8. [API] Não dá para apagar o Wallet ID: o '??' preserva o valor antigo e o toast diz sucesso · **NOVO**

**O que acontece:** Se a clínica trocar de conta Asaas e quiser limpar o campo antes de recolar, não consegue: ela esvazia, vê 'Wallet ID atualizado.' e o valor antigo volta no refetch. Menor porque ela pode sobrescrever direto.

**Evidência:** vetequus-api/src/domain/application/services/account/services/Company.service.ts:57 `company.walletId = walletId ?? company.walletId;`. O front envia null ao esvaziar: WalletCard.tsx:52 `walletId: trimmedValue || null` e :54 `toast.success("Wallet ID atualizado.")`. Como @IsOptional() deixa null passar, `null ?? company.walletId` devolve o valor antigo. Campos vizinhos do mesmo método fazem certo: Company.service.ts:58-72 usam `if (campo !== undefined)`.

**Correção:** Trocar por `if (walletId !== undefined) company.walletId = walletId;`.

---

## 9. [API] Fatura paga é contada duas vezes se a clínica somar os dois blocos da tela · **NOVO**

**O que acontece:** Receber uma fatura cria automaticamente uma Movimentação de entrada espelhada, que alimenta o KPI 'Recebido' no topo. Ao mesmo tempo, o bloco de Faturas logo abaixo mostra seu próprio paidAmount. O mesmo dinheiro aparece nos dois lugares. Cada bloco está certo isolado, mas a tela não sinaliza que um é reflexo do outro.

**Evidência:** vetequus-api/src/domain/application/services/invoice/invoice.service.ts:162-210 (ensureInvoicePaymentExists cria Payment + Transaction PAID), chamado em :300-310 (botão Receber), :465-471 e :532-538 (cartão). Somatório independente das faturas: prismaInvoice.repository.ts:98-102 (aggregate status PAID → paidAmount).

**Correção:** Rotular o card de faturas pagas como 'já incluído no Recebido' ou unificar a origem do número.

---

## 10. [API] status da assinatura no PATCH é validado só como string; não há como voltar para TRIAL · **NOVO**

**O que acontece:** A defesa contra valor inválido não existe (hoje não dispara pela tela). E o admin não consegue devolver uma assinatura ao estado TRIAL.

**Evidência:** api:adminSignature.dto.ts:30-33 `@IsOptional() @IsString() status?: 'ACTIVE' | 'INACTIVE'` (tipo só de TypeScript); aplicado cru em adminSignature.service.ts:216. No ADM o select só tem ACTIVE/INACTIVE (SubscriptionDetailModal.tsx:334-336) e o estado inicial converte TRIAL em ACTIVE (:203-207).

**Correção:** Trocar por @IsIn(['ACTIVE','INACTIVE','TRIAL']).

---

## 11. [API] CORREÇÃO DE RUMO: o DTO do webhook NÃO rejeita o payload real do Asaas — o achado D5 está refutado

**O que acontece:** A auditoria anterior classificou como CRÍTICO que @ValidateNested sem @IsOptional faria todo webhook voltar 400, e recomendou corrigir antes de configurar o painel. Isso é falso: propriedade ausente é pulada pela validação aninhada. Se a equipe gastar a véspera do lançamento nisso, gasta em nada — o que precisa de atenção no webhook são os achados do SUBSCRIPTION_CREATED e da cobertura de eventos.

**Evidência:** vetequus-api/node_modules/class-validator/cjs/validation/ValidationExecutor.js:250-253 — `nestedValidations(value, metadatas, error) { if (value === void 0) { return; }`. O ValidationPipe global (api:src/infra/main.ts:13-32) não usa whitelist, forbidNonWhitelisted nem skipMissingProperties. api:companySignature.dto.ts:169-192 segue como descrito antes. Também está CERTO no webhook: autenticação por header (controller:125-127), env obrigatória (shared/env/env.ts:27), ThrottlerGuard não é global (app.module.ts:15-21) e a leitura do subscriptionId cobre as duas formas do payload v3 (controller:130-132).

**Correção:** Nenhuma ação. Documentar a refutação para não desperdiçar esforço.

---

## 12. [API] Cadastro não checa CPF/CNPJ duplicado; só e-mail · **NOVO**

**O que acontece:** Dá para cadastrar duas clínicas com o mesmo CNPJ, gerando dois customers no Asaas para o mesmo documento e duas bases separadas. Não impede ninguém de trabalhar; sujeira de cadastro e de conciliação.

**Evidência:** api:src/domain/application/services/account/services/User.service.ts:247-249 — `const userAlreadyExists = await this.userRepository.findByEmail(email); if (userAlreadyExists) return left(new ResourceAlreadyExistsError('email'));` — é a única checagem de duplicidade do register.

**Correção:** Checar cpf/cnpj antes de criar a Company, devolvendo ResourceAlreadyExistsError com o field correto (a infraestrutura de field já existe).

---

## 13. [API] Leitura insegura do erro do Asaas (D6) — impacto rebaixado de médio para menor

**O que acontece:** Continua sem optional chaining, mas o AllExceptionsFilter global agora captura o TypeError e devolve mensagem genérica em português. O usuário não vê mais 'Internal server error' cru; o custo hoje é diagnóstico (a causa real do erro Asaas se perde), não vazamento.

**Evidência:** api:src/infra/shared/bank/asaas.ts:99, 148, 186, 206, 214, 230, 240 — `connect.data.errors[0].description` sem `?.`; mitigado por api:src/infra/main.ts:36 `app.useGlobalFilters(new AllExceptionsFilter())`. Os métodos de assinatura (createSubscription, cancelSubscription, getSubscriptionPayments, getPixQrCode) já usam `?.` e try/catch.

**Correção:** Adicionar `?.` e logar o corpo cru do Asaas para diagnóstico.

---

## 14. [API] Ficha do animal aberta por deep link mostra 'Animal não encontrado' · **NOVO**

**O que acontece:** No uso normal não aparece (a lista grava o animal no contexto antes de navegar), mas em deep link ou perda de contexto a tela nunca carrega.

**Evidência:** app/(animal)/[id].tsx:63 chama `/animal/{uuid}`, que no Nest casa com @Get(':code') (animal.controller.ts:193-200 -> animal.service.ts:243-253 findByCode) e devolve 404; além disso o corpo é `{ animal: {...} }` e a tela faz `mapAnimal(res.body)` (lê body.id). A rota correta existe e não é usada: GET /animal/by-id/:id (animal.controller.ts:173-183).

**Correção:** Chamar /animal/by-id/:id e desembrulhar `body.animal` — lembrando que essa rota também filtra por companyId e precisa do mesmo ajuste do achado 1.

---

## 15. [API] 736 de 2.080 decorators class-validator sem message: nome do campo em inglês dentro de frase em português

**O que acontece:** CLÍNICA. Não sai mais inglês cru — o tradutor da API cobre os 28 templates padrão do class-validator num ponto só. O que resta é o nome técnico do campo, preservado de propósito pelo tradutor: "O campo animalId é obrigatório.", "O campo dueDate deve ser um texto." Os DTOs dos dois fluxos MAIS usados estão em 0% de cobertura. Ressalva honesta: enquanto o achado A1 não for corrigido, nada disso chega à tela no WEB (todo 400 vira o texto genérico) — o impacto só aparece depois. No APP e no ADM já aparece hoje.

**Evidência:** Contagem programática em api:src/ (decorators validadores, excluindo @IsOptional): 2.080 total, 1.344 com message (64,6%), 736 sem (35,4%). Nos 86 DTOs de src/infra/http/controllers/**: 58 têm pelo menos um sem message, 11 não têm nenhum. Fluxos principais: appointment/dto/appointment.dto.ts 50 validadores / 0 com message; client/dto/client.dto.ts 37 / 0; invoice/dto/invoice.dto.ts 47 / 5; studFarm/dto/studFarm.dto.ts 31 / 16; animal/dto/animal.dto.ts 27 / 13; finance/dto/payment.dto.ts 50 / 41; finance/dto/transaction.dto.ts 78 / 73. Tradutor: api:src/infra/shared/validation/validationMessage.translator.ts:104-120 (preserva o nome da propriedade por design).

**Correção:** Alternativa barata que resolve os 736 num arquivo só: mapa `campo -> rótulo PT` dentro do próprio validationMessage.translator.ts, em vez de editar 58 DTOs. Se for editar DTO, priorizar appointment.dto.ts e client.dto.ts (87 decorators, os dois fluxos mais usados).

---

## 16. [API] ESTADO CORRIGIDO (registro): o 500 cru acabou — ExceptionFilter global existe e está registrado

**O que acontece:** Registro para corrigir o STATUS-VERIFICADO, que lista isto como pendente. Nenhum stack, nenhuma mensagem interna e nenhum "Internal server error" chega ao corpo da resposta em nenhum dos 4 repos, no que depende da API. Falha de SMTP, erro do Prisma e bug de código viram 500 com texto PT genérico e stack só no log do servidor.

**Evidência:** api:src/infra/main.ts:36 `app.useGlobalFilters(new AllExceptionsFilter());` — api:src/infra/shared/handler/all-exceptions.filter.ts:35 `@Catch()` sem argumento e :65-76 loga error.stack e responde `{ statusCode: 500, message: GENERIC_ERROR_MESSAGE, code: 'INTERNAL_SERVER_ERROR' }` — api:error.handler.ts:100-107 (default) também loga e devolve o genérico em vez de error.message — as 10 classes de api:src/core/errors/errors/ verificadas uma a uma, todas em PT — api:file.controller.ts:36-60 valida tamanho e mimetype com mensagens PT específicas.

**Correção:** Nenhuma. Atualizar o STATUS-VERIFICADO, que ainda marca este item como parcial.

---

## 17. [API] Migration adiciona dois valores de enum num arquivo só (falha em PostgreSQL <= 11) · **NOVO**

**O que acontece:** Em PG 12+ passa (os valores não são usados na mesma transação). Em PG 11 ou anterior o `prisma migrate deploy` falha e o lançamento para. Não consegui determinar a versão do Postgres em produção.

**Evidência:** vetequus-api/prisma/migrations/20260731122806_owner_notes_prescription_sharing_animal_note_author/migration.sql — o próprio arquivo traz o aviso gerado pelo Prisma ('This migration adds more than one value to an enum. With PostgreSQL versions 11 and earlier, this is not possible in a single migration') seguido de `ALTER TYPE "AttachmentRecordType" ADD VALUE 'DENTISTRY_PRESCRIPTION'; ALTER TYPE "AttachmentRecordType" ADD VALUE 'OWNER_NOTE';`

**Correção:** Confirmar a versão do PostgreSQL em produção antes do deploy; se <= 11, quebrar em duas migrations.

---

## 18. [API] GET /animal/by-id/:id libera animal com companyId nulo para qualquer clínica · **NOVO**

**O que acontece:** Animal cadastrado pelo próprio proprietário no app nasce com companyId NULL; a guarda usa AND, então não dispara e qualquer clínica que saiba o UUID lê a ficha. Exploração exige adivinhar um UUID v4, o que na prática não acontece — mas é o mesmo padrão 'se o dono é nulo, libera' do achado de pagamento.

**Evidência:** src/domain/application/services/animal/services/animal.service.ts:276 `if (companyId && animal.companyId && animal.companyId !== companyId) return left(new ResourceNotFoundError());` — combinado com animal.controller.ts:75 `companyId: tokenType === 'client' ? undefined : companyId`, que grava NULL.

**Correção:** Recusar quando animal.companyId for nulo e o requisitante for uma clínica que não o cadastrou.

---

## 19. [API] Logs de PIX com dado financeiro de cliente em produção

**O que acontece:** transactionId, clientId, customer (id Asaas), walletId e valor gravados no log do servidor a cada tentativa de pagamento. Sem senha nem cartão, mas é dado financeiro identificável.

**Evidência:** src/domain/application/services/finance/services/transaction.service.ts:212, 217, 227, 265, 284, 293, 322, 340, 404 — console.log('[PIX BACK DEBUG] …'); o comentário da linha 210 ainda diz 'Logs temporários — remover depois que o bug for resolvido'.

**Correção:** Remover ou condicionar a NODE_ENV !== 'production'.

---

## 20. [APP] Varredura completa de catch vazio / só-console nos 4 repos: 5 ocorrências, 3 benignas · **NOVO**

**O que acontece:** Baixo. Resultado bem melhor do que a auditoria anterior sugeria. WEB 1 catch vazio (ViaCEP, comentado, correto), APP 1 (decodeURIComponent com fallback, correto), ADM 0, API 1 vazio + 2 só-console. Os relevantes: a falha do vínculo automático animal<->propriedade é engolida com console.log de produção, e há um catch vazio sem comentário no client.service.

**Evidência:** api:src/domain/application/services/animal/services/animal.service.ts:116 e :206 — catch com apenas `console.log('[AnimalService] Vínculo automático com propriedade: ...')`. api:src/domain/application/services/client/services/client.service.ts:106 — catch com corpo vazio e sem comentário. Benignos: web:app/(auth)/register/page.tsx:63 (`// ignore`, ViaCEP) e app:components/ui/AttachmentChip.tsx:210 (fallback "Anexo N"). Complementar, .catch(()=>{}) inline: 18 no WEB (cobertos pelo achado A7), 2 no APP (AdsCarousel.tsx:73 abrir anúncio falha em silêncio; SessionContext.tsx:144), 0 no ADM.

**Correção:** Trocar os console.log por this.logger.warn e decidir se a falha do vínculo deve virar erro; abrir o client.service.ts:106 para saber o que ele engole.

---

## 21. [OUTRO] Datas puras exibidas um dia antes em todo o painel; nenhum helper de data existe no ADM

**O que acontece:** Vencimento, validade, cadastro e validade de cupom aparecem com um dia a menos para quem está em UTC-3.

**Evidência:** Grep por formatDate em adm/src: só `formatDateInput` local do AdsForm. Pontos com `new Date(x).toLocaleDateString("pt-BR")` sobre ISO em meia-noite UTC: financial/page.tsx:140,210; subscriptions/page.tsx:135,145; SubscriptionDetailModal.tsx:297,307,490; lib/coupons-api.ts:66,69; companies/page.tsx:126; admins/page.tsx:166.

**Correção:** Criar um helper de data pura (BRT) no ADM e aplicar nos 10 pontos.

---

## 22. [OUTRO] A tela de pagamento é a única que não usa a camada de tradução de erro

**O que acontece:** Mensagem crua da API vai direto ao toast; erro de class-validator (array) sai emendado. As demais telas do app já usam getApiErrorMessage.

**Evidência:** InvoicePaymentSheet.tsx:369, 441, 549 `(res.body as { message?: string })?.message ?? "Erro ao processar pagamento"`, enquanto lib/api-error.ts existe e é usado em login.tsx:95, signup.tsx:95, profile.tsx:128, notes.tsx:44, AnimalRegistrationSheet.tsx:194.

**Correção:** Trocar pelos três getApiErrorMessage(res, ...).

---

## 23. [OUTRO] Fatura cancelada aparece como 'Pendente' no app · **NOVO**

**O que acontece:** O proprietário vê uma dívida já cancelada, com o aviso 'O pagamento ainda não está disponível. Entre em contato com o estabelecimento.'

**Evidência:** clientInvoice.presenter.ts:51-59 `status: invoice.status === 'PAID' ? 'PAID' : 'PENDING'` (CANCELED cai em PENDING) e :23-25 payable=false; a tela renderiza o aviso em InvoicePaymentSheet.tsx:658-664.

**Correção:** Propagar CANCELED e esconder/rotular a fatura cancelada.

---

## 24. [OUTRO] CORS aberto e ValidationPipe sem whitelist

**O que acontece:** CORS '*' remove a barreira contra scripts de terceiros chamarem a API (impacto baixo porque a auth é Bearer, não cookie). O ValidationPipe sem whitelist deixa campos não declarados chegarem ao service — é a superfície que torna o mass assignment de companyId possível; hoje está contida só pela ORDEM dos spreads nos controllers (`{ ...body, companyId }`), o que é defesa frágil.

**Evidência:** src/infra/main.ts:11 `NestFactory.create(AppModule, { cors: true })`; :14-31 ValidationPipe com transform:true e exceptionFactory, mas sem `whitelist: true` nem `forbidNonWhitelisted`. Padrão que segura hoje: generalTest.controller.ts:39-43 `{ generalTestId: id, ...body, companyId }`.

**Correção:** Restringir CORS às origens do WEB/ADM; ligar whitelist:true no ValidationPipe (exige revisar os DTOs que hoje dependem de campos extras).

---

## 25. [WEB] Itens da fatura são texto serializado dentro de description, com parser por regex — não existe model InvoiceItem · **NOVO**

**O que acontece:** A clínica não consegue saber quanto faturou de cada procedimento: relatório por serviço é impossível. E se um item tiver o nome com o padrão ' - R$ ' embutido, o parser o classifica errado e ele cai em freeform, sumindo da lista de itens do PDF. Não bloqueia; é o teto do módulo. A dívida é assumida no próprio código.

**Evidência:** equinology-web-v2/lib/invoice-items.ts:1-16 documenta a decisão ('Zero mudança no schema/migration… Quando precisarmos de relatórios financeiros por serviço, aí vale criar tabela InvoiceItem'). Serialização em :33-43 (`${qty} x ${name} — ${price}` · Animal: X), parser por regex em :79-92 `/^(\d+)\s*x\s*(.+?)\s*[—\-]\s*R\$\s*([\d.,]+).../i`. Envio: NewInvoiceSheet.tsx:264-272 grava itemsText em `description`.

**Correção:** Criar model InvoiceItem quando houver necessidade de relatório por serviço. Sem ação para o lançamento.

---

## 26. [WEB] Logs de produção no caminho do dinheiro e da navegação

**O que acontece:** Ruído e vazamento de metadados em log de produção.

**Evidência:** web:context/ApiContext.tsx:41 — `console.log("[GET]", path, new Date().toISOString())` em toda requisição GET do sistema. api:src/infra/shared/bank/asaas.ts:275 — `console.log(connect.data)` despeja a resposta de criação de nota fiscal.

**Correção:** Remover ou condicionar a ambiente de desenvolvimento.

---

## 27. [WEB] Data da transferencia para o estoque volante e validada, enviada e jogada fora; transferencias nao aparecem no historico · **NOVO**

**O que acontece:** A modal 'Enviar para o volante' tem campo Data, valida ('Informe uma data valida (dd/mm/aaaa)') e envia. A transferencia e gravada sem data nenhuma — nao ha coluna. Toda transferencia geral<->volante e atemporal e nenhuma delas aparece na lista de movimentacoes de estoque.

**Evidência:** web:app/(dashboard)/_components/sheets/stock/SendGeneralToVolanteSheet.tsx:100-116 `await PostAPI("/field-stock", { productId, quantity, date: dateIso })`. api:src/infra/http/controllers/stock/dto/fieldStock.dto.ts:6-16 CreateFieldStockDto tem so productId e quantity (sem whitelist, `date` e descartado sem erro). api:prisma/schema.prisma:542-554 `model FieldStock { id, productId, userId, quantity }`. api:src/domain/application/services/stock/services/stockMovement.service.ts:26-48 le so productStock (entradas) e productUsage (saidas). Adjacente: saldo insuficiente no servidor devolve NotAllowedError -> 'Voce nao tem permissao para realizar esta acao.' (api:src/core/errors/errors/notAllowedError.ts:7).

**Correção:** Ou remover o campo Data da modal, ou adicionar coluna date em FieldStock e incluir as transferencias no stockMovement. Trocar NotAllowedError por InsufficientStockError no fieldStock.service.

---

## 28. [WEB] Foto do animal nao pode ser removida · **NOVO**

**O que acontece:** Trocar a foto funciona; apagar nao. Com o campo vazio a chave e omitida no body e a API mantem o valor anterior.

**Evidência:** web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:596 e :620 `if (photoUrl) body.photoUrl = photoUrl;` contra api:src/domain/application/services/animal/services/animal.service.ts:191 `animal.photoUrl = photoUrl ?? animal.photoUrl;`.

**Correção:** Enviar photoUrl: null explicitamente ao remover e tratar `if (photoUrl !== undefined) animal.photoUrl = photoUrl || null` no service.

---

## 29. [WEB] Páginas de demonstração/conferência acessíveis sem login em produção · **NOVO**

**O que acontece:** Quatro páginas criadas neste período ficam fora do matcher do middleware e abrem para qualquer visitante, sem autenticação. Não expõem dado de cliente (trabalham com estado fabricado), mas ficam indexáveis e carregam o bundle do odontograma.

**Evidência:** equinology-web-v2/middleware.ts:68-91 — o config.matcher não inclui '/odontograma-novo', '/odontograma-novo-v2', '/odontograma-pdf-check' nem '/logo-pdf-check', enquanto os arquivos existem: app/odontograma-novo/page.tsx, app/odontograma-novo-v2/page.tsx, app/odontograma-pdf-check/page.tsx, app/logo-pdf-check/page.tsx

**Correção:** Remover as páginas do build de produção ou incluí-las no matcher do middleware.

---

## 30. [WEB] Preenchimento por voz de CAMPOS não pede confirmação (o do odontograma pede) · **NOVO**

**O que acontece:** O ditado dos campos grava direto no formulário e o resumo de revisão só lista o que NÃO foi preenchido — nunca o que entrou. O ditado do odontograma, no mesmo componente, exige o botão 'Aplicar N marcações'. A assimetria é mitigada porque os valores ficam visíveis nos campos antes de salvar; vira problema real quando combinada com o achado do select, em que o campo aparenta estar vazio.

**Evidência:** equinology-web-v2/app/(dashboard)/services/_components/AudioToFormButton.tsx:307-315 — `if (appliedCount > 0) { setFormData((prev) => ({ ...prev, ...applied })); }` e :315 `setReview({ transcript, issues: fieldIssues, filled: appliedCount });` · comparar com odontogram/OdontogramVoiceReview.tsx:216-224 (botão 'Aplicar N marcações', disabled quando o rascunho está vazio)

**Correção:** Listar também o que FOI preenchido no resumo (campo → valor aplicado), ou exigir confirmação como no odontograma.

---

## 31. [WEB] normalizeSpokenStatus casa por palavra solta — 'sem gancho' vira 'Gancho' · **NOVO**

**O que acontece:** O fallback por token não trata negação: se o campo status devolvido pelo modelo contiver 'sem gancho' ou 'não fraturado', a marcação afirmativa é criada. O painel de revisão exibe o heardAs, então o veterinário tem como pegar antes de aplicar — por isso MENOR e não GRAVE.

**Evidência:** equinology-web-v2/app/(dashboard)/services/_components/odontogram/odontogram-voice.ts:239-244 — `// tolera frases curtas: "com gancho", "dente fraturado"\n for (const token of text.split(" ")) { if (STATUS_ALIASES[token]) return STATUS_ALIASES[token]; if ((STATUS_KEYS as string[]).includes(token)) return token as ToothStatus; }`

**Correção:** Descartar o trecho (mandar para unrecognized) quando houver token de negação ('sem', 'não', 'nao', 'nenhum') antes do achado.

---

## 32. [WEB] Páginas de demo e /clinic/odontograma fora do gate do middleware

**O que acontece:** Telas internas/não finalizadas acessíveis sem login. Li os quatro page.tsx e os _components: nenhuma faz chamada de API (grep por GetAPI/PostAPI/fetch vazio; odontograma-pdf-check:210 usa clinic fixo de verificação). Não vaza dado — expõe UI inacabada. /clinic/odontograma é tela real de dashboard, mas o matcher tem '/clinic' sem ':path*', então o gate de assinatura não roda ali.

**Evidência:** equinology-web-v2/middleware.ts (config.matcher) — não lista /odontograma-novo, /odontograma-novo-v2, /odontograma-pdf-check, /logo-pdf-check, /fatura, /api, nem /clinic/:path*. Resíduo confirmado: '/stock2' e '/cooperators' continuam no matcher e não existem em app/(dashboard)/.

**Correção:** Remover as páginas de demo do build de produção; trocar '/clinic' por '/clinic/:path*'; limpar as duas entradas mortas.

---

