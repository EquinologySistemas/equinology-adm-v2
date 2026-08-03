# Dinheiro e Asaas — separado por decisão do dono

> O dono pediu para separar tudo que envolve pagamento, assinatura e Asaas.
> Ele vai tratar no fim. **Nada aqui foi corrigido.**

Contexto que muda a urgência: hoje não há cliente pagante — é tudo teste
interno. Então repasse histórico errado não é problema. O que importa é o que
vai quebrar quando entrar dinheiro de verdade.

## Números

| Severidade | Qtd |
|---|---|
| BLOQUEIA | 15 |
| GRAVE | 26 |
| MENOR | 7 |
| **Total** | **48** |

---

# Bloqueiam a operação com dinheiro real — 15

## DELETE /user/:userId devolve 500 para qualquer veterinario que ja tenha atendido

- **Rota:** `DELETE /user/:userId`
- **Impacto:** 54 FKs para users sao ON DELETE RESTRICT (appointments, notes, reminders, general_*, orthopedic_*, reproduction_*, dentistry_*) e o service deleteUser nao checa vinculo antes de apagar. Na pratica a funcao so funciona para usuario que nunca fez nada. A mensagem generica nao diz o motivo, e a vaga do plano nunca libera.
- **Reprodução:** 1) POST /appointment {"type":"SERVICE","startDate":"2026-08-05T13:00:00.000Z","endDate":"2026-08-05T14:00:00.000Z","userId":"76c0e458-0ab9-403b-97c5-b1812cd53794","studFarmId":"4c0339d1-8c48-4e61-befc-97e8c88931d6","animals":[{"animalId":"51921974-1315-4d29-9a5b-1b47a8035c0f","appointmentType":"Consulta"}]} -> 201. 2) DELETE /user/76c0e458-0ab9-403b-97c5-b1812cd53794 com token do admin -> 500 INTERNAL_SERVER_ERROR. 3) SQL: SELECT COUNT(*) FROM users WHERE id='76c0e458-...' -> 1 (nada excluido). Usuario sem nenhum vinculo e excluido normalmente (200).

## upgrade/pix derruba o acesso da clinica na hora, antes de qualquer pagamento

- **Rota:** `POST /signature/upgrade/pix`
- **Impacto:** A clinica clica em 'fazer upgrade via PIX', ainda nao pagou nada, e perde o sistema no ato — inclusive o periodo que ja estava pago. Fica sem acesso ate pagar o QR code e o webhook chegar.
- **Reprodução:** Empresa B com assinatura ACTIVE paga (cartao, expira 2026-09-02): GET /signature/validation -> 200. Entao POST /signature/upgrade/pix {"newPlanId":"aaaaaaaa-0000-4000-8000-00000000f201","yearly":false} -> 201 devolvendo QR code. Imediatamente GET /signature/validation -> 403 NOT_ALLOWED e GET /signature/current -> {"hasActiveSignature":false}. Banco: todas as 3 linhas de law_firm_signatures da company b97deaeb-0277-4d89-b6d4-77a95bdc6876 ficaram INACTIVE. Codigo: companySignature.service.ts linha 1009 (activeSignature.status='INACTIVE') e 1021 (nova nasce INACTIVE).

## Reembolso nao cancela a recorrencia: cliente reembolsado continua sendo cobrado todo mes

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** Cliente estornado e sem acesso continua com a recorrencia viva no provedor e sera cobrado no proximo ciclo, e no seguinte, indefinidamente. Chargeback e reclamacao certos.
- **Reprodução:** PUT /signature/refound/1beeaa55-efda-4e70-b400-b4474d5cbc61 -> 200; GET /signature/validation -> 403 (acesso cortado). Asaas GET /payments/pay_4vnehh5oub7eea9t -> status REFUNDED. Asaas GET /subscriptions/sub_qlwwkowe08r8sn62 -> status ACTIVE, deleted:false, nextDueDate 2026-09-02, value 124.95. Codigo: refoundSignature (linhas 523-548) so chama refound + cancelInvoice, nunca subscription.cancelSubscription.

## Trial pago no cartao mantem paymentType=PIX e a renovacao nunca estende a validade

- **Rota:** `POST /signature/credit/new + POST /signature/webhook`
- **Impacto:** Toda clinica que veio de trial e pagou no cartao tem a renovacao ignorada: paga e perde o acesso no fim do periodo. Como o trial e o funil padrao de entrada, atinge praticamente toda a base nova.
- **Reprodução:** POST /signature/start-trial/33231be6-b0fc-40d3-b108-91ad5ae1edef; depois POST /signature/credit/new com cartao sandbox aprovado -> 201. Banco (sig 0dbc57cb-4bfa-41b8-bd7c-e33416851005): status=ACTIVE mas paymentType=PIX. GET /signature/current mostra "paymentType":"PIX" para quem pagou no cartao. Renovacao: POST /signature/webhook {"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_RENOVACAO_TESTE_1","subscription":"sub_5010wpyfxzviiv3p"}} -> 200; banco: paymentId atualizado mas expirationDate PARADA em 2026-09-02 17:39:13. Contraprova: a mesma renovacao numa assinatura criada ja como CREDIT_CARD (sig 4f80ff37, sub_wpkehsor34agdte9) estendeu 17:40:12 -> 17:40:27. Codigo: ramos existingTrial nas linhas 273-285 e 373-384 nao atualizam paymentType.

## Cartao nunca e salvo: GET /credit-card sempre vazio e credit/existing inutilizavel

- **Rota:** `POST /signature/credit/new, POST /signature/credit/existing, GET /credit-card`
- **Impacto:** A funcionalidade 'pagar com o cartao salvo' nao existe na pratica: a tela de cartoes fica sempre vazia e a rota credit/existing responde 404 para todo mundo. Nenhum cliente consegue reassinar sem redigitar o cartao.
- **Reprodução:** Depois de dois pagamentos aprovados via POST /signature/credit/new: GET /credit-card -> 200 {"data":[]}. SQL: select count(*) from credit_cards -> 0 em todo o banco. Banco: law_firm_signatures.creditCardId = NULL. POST /signature/credit/existing {"creditCardId":"<qualquer>"} -> 404 RESOURCE_NOT_FOUND. Codigo: newCreditCard cria a assinatura com creditCardId: null (linha 387) e descarta o token do provedor.

## Webhook SUBSCRIPTION_CREATED ativa a assinatura sem nenhum pagamento

- **Rota:** `POST /signature/webhook`
- **Impacto:** Acesso liberado de graca: o Asaas dispara SUBSCRIPTION_CREATED no instante em que a recorrencia e criada (ou seja, ao gerar o QR code). Causa distinta do bug ja mapeado do trial — atinge qualquer assinatura PIX nova, com ou sem trial.
- **Reprodução:** POST /signature/pix/aaaaaaaa-0000-4000-8000-00000000f201 {"yearly":false} -> 201, cria sig 448722f7-fc17-4284-8bd9-6e3d7bcb680f com status INACTIVE e sub_ug3icgfgfzvtmycj. Nenhum pagamento feito. Entao POST /signature/webhook {"event":"SUBSCRIPTION_CREATED","subscription":{"id":"sub_ug3icgfgfzvtmycj"}} -> 200. Banco: status = ACTIVE. GET /signature/current -> hasActiveSignature:true no plano QA-F2-Pro. Codigo: linhas 486-496 setam ACTIVE sem checar pagamento.

## Duplo clique em pagar cria duas assinaturas recorrentes no provedor

- **Rota:** `POST /signature/pix/:planId (e demais rotas de pagamento)`
- **Impacto:** Nao ha trava de idempotencia nem checagem de assinatura vigente. Duplo clique ou retry do front gera duas cobrancas recorrentes permanentes no mesmo cliente, e da para contratar por cima de uma assinatura ja ativa.
- **Reprodução:** Duas chamadas seguidas de POST /signature/pix/aaaaaaaa-0000-4000-8000-00000000f201 {"yearly":false} -> 201 nas duas, criando sig 448722f7 (sub_ug3icgfgfzvtmycj) e sig 13c0da97 (sub_20me2axwe0inqdzp). Banco: 4 assinaturas na company 998a9830, 4 asaasSubscriptionId distintos. Ambas foram criadas enquanto ja existia uma assinatura ACTIVE (4f80ff37).

## Upgrade grava o preco promocional como valor recorrente eterno

- **Rota:** `POST /signature/upgrade/credit e POST /signature/upgrade/pix`
- **Impacto:** O credito proporcional e um desconto de uma vez so, mas vira o valor de todos os meses seguintes. Perda de receita permanente de ~47% em cada upgrade feito.
- **Reprodução:** POST /signature/upgrade/credit -> {"creditApplied":237.56,"finalPrice":262.34}. Asaas GET /subscriptions/sub_wpkehsor34agdte9 -> {value: 262.34, cycle: 'MONTHLY', description: 'Upgrade para Plano QA-F2-Pro - Mensal (Credito aplicado: R$ 237.56)'}. O plano custa 499,90/mes no cartao. Mesmo padrao em upgrade/pix: recorrencia de 222,34 contra 459,90 do plano. Codigo: linhas 853-863 e 973-981 passam finalPrice como value da subscription.

## PUT /payment altera a movimentacao mas nao atualiza nenhuma parcela (nome, valor, quantidade, tipo, categoria)

- **Rota:** `PUT /payment/:paymentId`
- **Impacto:** Cabecalho da movimentacao e caixa contam historias diferentes. Despesa editada para receita continua entrando no caixa com sinal errado, relatorio por categoria fica na categoria antiga e o valor total nao bate com a soma das parcelas. Evidencia extra: GET /transaction/statistics mostra a movimentacao ja OUTCOME aparecendo como incoming de R$100 em marco, abril e maio.
- **Reprodução:** POST /payment {name:'Edit3x F2',amount:300,quantity:3,isTotalValue:true,type:'INCOME',categoryId:<CATI>,firstDueDate:'2026-03-05',status:'PENDING'} -> 201, 3 parcelas de 100. PUT /payment/<id> {quantity:6,amount:600,name:'Edit6x F2'} -> 200. SQL: select count(*),sum(value) from transactions where "paymentId"=<id> -> 3|300 (deveria ser 6|600); select name,amount,quantity from sheduled_payments -> Edit6x F2|600|6. Depois PUT /payment/<id> {type:'OUTCOME',categoryId:<CATO>} -> 200; SQL nas parcelas -> Edit3x F2|INCOME|<CATI> (nome, tipo e categoria antigos).

## Rotas de pagamento de /transaction nao verificam se o lancamento pertence ao cliente do token

- **Rota:** `POST /transaction/pix/:transactionId, POST /transaction/credit/existing, POST /transaction/credit/new`
- **Impacto:** Qualquer cliente autenticado que descubra o id de uma parcela emite cobranca e da baixa em conta alheia, inclusive em despesas internas da clinica (que tambem sao transactions). O InvoiceService tem a guarda equivalente (invoice.clientId !== clientId) e o InvoiceController tem assertClientToken; as tres rotas de /transaction nao tem nem uma nem outra.
- **Reprodução:** Criei movimentacao 'Conta do Cliente B' R$333 com clientId = Cliente B. Com o token do Cliente A: POST /transaction/pix/<parcelaDoClienteB> -> 201 com QR Code emitido; POST /transaction/credit/existing {transactionId:'<parcelaDoClienteB>',creditCardId:'<cartao do Cliente A>',installmentCount:1} -> 201. SQL: select name,status,"paymentDate" from transactions where id=<parcelaB> -> Conta do Cliente B|PAID|2026-08-02 17:47:52.

## bankPaymentId nunca e gravado em transactions - PIX e cartao ficam sem chave de conciliacao

- **Rota:** `POST /transaction/pix/:transactionId, POST /transaction/credit/new, POST /transaction/credit/existing`
- **Impacto:** Nao existe chave para casar o retorno do Asaas com a parcela. Cliente paga o PIX, o dinheiro entra na carteira e o lancamento fica PENDING para sempre.
- **Reprodução:** POST /transaction/pix/6ae17ce0-... (token de cliente) -> 201 com QR Code; SQL: select status,"bankPaymentId" from transactions where id='6ae17ce0-...' -> PENDING|vazio. POST /transaction/credit/new aprovado no sandbox -> 201; SQL id='bcb6d5b2-...' -> PAID|vazio. Base inteira: select count(*) filter (where "bankPaymentId" is not null), count(*) from transactions -> 0|63. Mesma consulta em invoices -> 1|53 (o meu PIX de fatura gravou pay_i6eak0g802b5ifmh). Causa dupla no codigo: PrismaTransactionMapper nao inclui bankPaymentId nem em toDomain nem em toPrisma; e transaction.service.ts:302-303 faz 'await save(transaction); transaction.bankPaymentId = payment.value.paymentId;' (save ANTES da atribuicao).

## Token de admin desativado (ou ate apagado do banco) continua com acesso total ao painel por 90 dias

- **Rota:** `todas as 38 rotas protegidas so por AdminAuthGuard`
- **Impacto:** Desligar um admin nao desliga nada. Ex-funcionario mantem acesso a precos, empresas, assinaturas e financeiro por ate 90 dias e nao existe rota de revogacao.
- **Reprodução:** 1) POST /admin/admins cria suporte.f2@teste.com (role support); guarda o accessToken do signin. 2) PATCH /admin/admins/74cf705f-b69e-4ae3-8410-6d1547973b99 {"active":false} -> 200, active=false no banco. 3) Com o token ANTIGO: GET /admin/auth/me -> 401 (essa checa), mas GET /admin/users -> 200 (lista os 40 usuarios), POST /admin/plans -> 201 (criou plano), DELETE /admin/plans/<id> -> 200 (apagou plano). 4) docker exec vetequus-local psql -c "delete from admin_users where id='74cf705f-...'" e o MESMO token ainda devolve GET /admin/financial/summary -> 200 {"revenueMonth":0,"revenuePreviousMonth":0,"activeSubscriptions":5,"trialSubscriptions":13} e GET /admin/companies -> 200. Causa: AdminAuthGuard (src/infra/shared/auth/admin-auth.guard.ts) so verifica assinatura do JWT e payload.type==='admin', nunca consulta admin_users. JWT valido por 90 dias (iat 1785692226 / exp 1793468226).

## Role support tem poder de super_admin em tudo que importa: cria/apaga planos, cria usuario em qualquer empresa, mexe em billing e le o financeiro

- **Rota:** `38 das 40 rotas de /admin/*`
- **Impacto:** A separacao de papeis so protege a criacao de outros admins. Support altera preco do produto, cria conta ADMIN em empresa de cliente, cancela/cobra/troca plano de assinatura e le o faturamento inteiro.
- **Reprodução:** Apenas POST /admin/admins e PATCH /admin/admins/:id usam AdminSuperAdminGuard. Com token de admin role=support, HTTP observado: POST /admin/admins 403; PATCH /admin/admins/:id 403; GET /admin/admins 200 (lista todos os admins e emails do painel); GET /admin/users 200 (40 usuarios de todas as empresas); POST /admin/users 201 (criou usuario em empresa arbitraria, role a escolha); GET /admin/companies 200; GET /admin/signature 200; GET /admin/coupons 200; GET /admin/ads 200; GET /admin/tutorials 200; GET /admin/financial/summary 200; GET /admin/financial/transactions 200 (todas as transacoes de todas as empresas); POST /admin/plans 201 e DELETE /admin/plans/:id 200 (comprovado com o mesmo token support).

## change-plan cancela a recorrencia no Asaas e NAO cria outra: empresa fica ACTIVE e nunca mais e cobrada

- **Rota:** `POST /admin/signature/change-plan/:id`
- **Impacto:** Perda de receita direta em toda troca de plano feita pelo painel: cliente migra para plano mais caro, mantem acesso ate a data de expiracao e nao existe mais nenhuma cobranca recorrente.
- **Reprodução:** 1) POST /admin/signature/create/258506bc-a83e-4582-bfb0-c9fdff5e0a53/ad5e95fd-e154-4acf-99d0-18cc16ac88a3 {"yearly":false,"isTrial":false} -> 201; banco: asaasSubscriptionId=sub_gm9kpt7uhpbw2qfi. 2) PATCH /admin/signature/a5787b94-135f-4d54-8793-82eb5ba10191 {"status":"ACTIVE","expirationDate":"2026-12-31T00:00:00.000Z"} -> 200. 3) GET .../history -> [{"id":"pay_vmjigjz5qjk03ixg","value":180.11,"status":"PENDING"}]. 4) POST /admin/signature/change-plan/a5787b94-... {"planId":"aaaaaaaa-0000-4000-8000-00000000f201","yearly":false} -> 201. 5) SQL: status=ACTIVE, asaasSubscriptionId=NULL, isAutoRenewActivated=f, signaturePlanId=novo plano (R$459,90/mes), expirationDate=2026-12-31. 6) GET .../history -> {"payments":[]} - o historico anterior tambem some.

## reactivate e renew-yearly criam assinatura NOVA a cada clique e deixam as recorrencias antigas vivas no Asaas (faturamento multiplicado)

- **Rota:** `POST /admin/signature/reactivate/:id e POST /admin/signature/renew-yearly/:id`
- **Impacto:** Dois cliques no painel geram duas cobrancas recorrentes simultaneas no Asaas contra o mesmo cliente, sem nenhum aviso, e a rota chamada reativar nao reativa o acesso.
- **Reprodução:** Empresa 258506bc-a83e-4582-bfb0-c9fdff5e0a53. 1) POST reactivate/a5787b94-... -> 201, nova linha 2d68f386 com sub_1w4vk1y0zlkkb3il. 2) POST reactivate/2d68f386-... -> 201, nova linha 48fd1b73 com sub_m06y8rptnkxzlbrl. 3) POST reactivate/2d68f386-... -> 201, nova linha bd002e84 com sub_zgzh4t4ec9fadkye. 4) POST renew-yearly/2d68f386-... -> 201, mais uma linha anual 3ff182c9 sem cancelar sub_1w4vk. 5) SQL: 6 linhas em law_firm_signatures para a mesma empresa. 6) Prova do faturamento triplicado: GET /admin/signature/2d68f386-.../history -> pay_vx5sipn0nqk2e40v R$459.90 PENDING; 48fd1b73 -> pay_tjorce06ivehdyol R$459.90 PENDING; bd002e84 -> pay_nm88lfe9gk4kq3xm R$459.90 PENDING. Total R$1.379,70 contra o mesmo cliente, mais R$4.966,92 da anual. Extra: reactivate deixa status=INACTIVE, ou seja nao reativa o acesso da empresa, so gera cobranca.

# Graves — 26

## Empresa sem assinatura vigente tem usuarios ilimitados e limit-info devolve numero incoerente

- **Rota:** `POST /user e GET /user/limit-info`
- **Impacto:** CompanyUserLimitService.checkCanAddUser retorna null (libera) quando nao ha assinatura vigente, e 'sem assinatura vigente' inclui trial expirado e plano cancelado/vencido. O limite some exatamente quando deveria apertar. Alem da burla comercial, a tela de plano vai exibir '16 de 0 usuarios'.
- **Reprodução:** 1) POST /user/register criando nova empresa e NAO chamar start-trial -> 201. 2) GET /user/limit-info -> {"currentUsers":1,"maxUsers":0,"planName":"Sem plano ativo","hasActiveSignature":false}. 3) POST /user 15 vezes -> 15x 201. 4) GET /user/limit-info -> {"currentUsers":16,"maxUsers":0}. Empresa de teste: 24d31ce9-76e6-4d65-a79f-1f70f2a913ae.

## PUT /company grava CNPJ lixo sem validacao (e nome de 5000 caracteres)

- **Rota:** `PUT /company`
- **Impacto:** EditCompanyDto.cnpj e apenas @IsString. O CNPJ aparece em fatura/PDF e e o documento do cadastro de pagamento. No POST /user/register o CNPJ e validado (Asaas recusa, 400); na edicao passa batido. postalCode e phone tambem nao tem formato.
- **Reprodução:** PUT /company {"cnpj":"nao-eh-cnpj-123456789"} -> 200. SQL: SELECT cnpj FROM companies WHERE id='7f5174fb-...' -> nao-eh-cnpj-123456789. PUT /company com name de 5000 chars -> 200; SELECT length(name) -> 5000 e o GET devolve inteiro.

## PUT /client aceita cpf e nunca grava - cliente sem CPF fica irrecuperavel e sem paymentId (alcance do bug conhecido)

- **Rota:** `PUT /client/:clientId`
- **Impacto:** Como o paymentId do Asaas so e criado no POST /client quando ha CPF, um cliente cadastrado sem CPF nunca ganha paymentId e NAO PODE SER COBRADO. Nao existe rota alternativa para corrigir - o dado fica travado para sempre.
- **Reprodução:** POST /client {"name":"SemCpf","phone":"11911112222"} sem cpf -> cpf null. PUT /client/<id> {"cpf":"<cpf valido>"} -> 200 sem corpo. GET /client?page=1&query=SemCpf -> cpf null. SQL: SELECT cpf,"paymentId" FROM clients WHERE id='8361d4b3...' -> '|' (AMBOS NULL). O controller desestrutura so {name, phone, email}; o service tem a logica de cpf completa (checagem de duplicidade, limpar com string vazia) e inalcancavel. ALCANCE MEDIDO: vale para os DOIS caminhos - token de empresa E token do proprio cliente (testei o cliente editando a si mesmo pelo app: cpf 28135214502 permaneceu, alvo 00143632086 ignorado). VARREDURA DO MESMO PADRAO: testei os 11 campos de stud-farm e os 9 de animal um a um (POST+GET e PUT+GET) - todos gravam corretamente. Nao ha outro caso deste tipo no modulo alem do filtro color (achado separado).

## calculate-upgrade mostra um preco e a cobranca sai outro (R$ 40 de diferenca)

- **Rota:** `GET /signature/calculate-upgrade vs POST /signature/upgrade/credit`
- **Impacto:** A tela promete um valor e o cartao e debitado com outro. Alem do atrito com o cliente, e problema de transparencia de preco.
- **Reprodução:** GET /signature/calculate-upgrade?planId=aaaaaaaa-0000-4000-8000-00000000f201&yearly=false -> newPlan.price 459.90, calculation.finalPrice 222.34. No mesmo instante POST /signature/upgrade/credit no mesmo plano -> {"finalPrice":262.34}, confirmado no Asaas (subscription value 262.34). Causa: calculateUpgrade usa newPlan.pixPrice mesmo para upgrade no cartao; processUpgradeWithCreditCard usa creditCardPrice.

## Credito proporcional maior do que o cliente pagou (remainingRatio 1.0333)

- **Rota:** `GET /signature/calculate-upgrade e POST /signature/upgrade/*`
- **Impacto:** A clinica recebe de volta mais do que pagou e o erro vai direto para a cobranca real do upgrade, porque os dois processUpgrade* reusam o mesmo calculo.
- **Reprodução:** Assinatura mensal recem-paga: GET /signature/calculate-upgrade?planId=<pro>&yearly=false -> {"daysRemaining":31,"totalDays":30,"remainingRatio":1.0333,"currentPlanCredit":237.56} sobre um plano de 229,90. Codigo: totalDays fixo em 30/365 e daysRemaining com Math.ceil (linhas 735-746, replicado em 822-832 e 943-953).

## Credito do plano atual sempre calculado por PIX, mesmo para quem pagou no cartao

- **Rota:** `GET /signature/calculate-upgrade, POST /signature/upgrade/credit, POST /signature/upgrade/pix`
- **Impacto:** Quem pagou no cartao tem o periodo restante valorizado pelo preco do PIX e perde dinheiro no upgrade — diferenca de 20 reais por mes de saldo no plano testado, proporcionalmente maior no anual.
- **Reprodução:** Assinatura paga no cartao (creditCardPrice 249,90): GET /signature/calculate-upgrade devolveu currentPlan.price 229.90 (que e o pixPrice). Codigo: linhas 743-746, 829-832 e 950-953 usam currentPlan.pixPrice sem olhar paymentType.

## Cupom vira desconto vitalicio na recorrencia, nao e estornado e nao existe no upgrade

- **Rota:** `POST /signature/credit/new, POST /signature/pix/:planId`
- **Impacto:** Cupom de 50% aplicado no value da subscription reduz o preco de todos os meses seguintes, para sempre. Uso do cupom nao volta ao estorno e e consumido antes do pagamento PIX (permite queimar limite de uso sem pagar). Upgrade nao aceita cupom.
- **Reprodução:** POST /signature/credit/new com couponId do cupom QAF2PCT50 (50%) -> 201. Asaas GET /subscriptions/sub_qlwwkowe08r8sn62 -> {value: 124.95, cycle: 'MONTHLY'} sobre plano de 249,90. Depois PUT /signature/refound nessa assinatura -> 200, mas SQL mostra coupons.currentUsages ainda = 1. No fluxo PIX o incrementUsage acontece antes de existir pagamento (linhas 192-195). UpgradeWithNewCreditCardDto e UpgradeWithPixDto nao tem campo couponId.

## installmentCount e validado no DTO e depois descartado em silencio

- **Rota:** `POST /signature/credit/new, POST /signature/credit/existing`
- **Impacto:** O cliente escolhe 12x, a API responde 201 e a cobranca sai a vista. Campo aceito e jogado fora sem aviso — exatamente o padrao 'controller aceita e esquece de repassar'.
- **Reprodução:** O DTO exige installmentCount >= 1 (POST com -5 -> 400 'Deve haver pelo menos uma parcela'), o service recebe o campo em newCreditCard/existingCreditCard, mas ele nao e usado em lugar nenhum: createSubscription e chamado sem parcelamento. A subscription criada no Asaas nao tem installment e nada e gravado no banco sobre parcelas.

## UUID malformado devolve 500 cru em 6 rotas de assinatura

- **Rota:** `start-trial, cancel, refound, pix (couponId), upgrade/pix, calculate-upgrade`
- **Impacto:** Qualquer id malformado vindo do front (deep link quebrado, copiar/colar) derruba a rota com 500 em vez de 400. Ruido em monitoramento e mensagem inutil para o usuario.
- **Reprodução:** POST /signature/start-trial/abc -> 500; PUT /signature/cancel/abc -> 500; PUT /signature/refound/abc -> 500; POST /signature/pix/<plano> {"yearly":false,"couponId":"abc"} -> 500; POST /signature/upgrade/pix {"newPlanId":"abc","yearly":false} -> 500; GET /signature/calculate-upgrade?planId=abc&yearly=false -> 500; GET /signature/calculate-upgrade?yearly=false (sem planId) -> 500. couponId com string de 5000 chars tambem -> 500. Todos com o mesmo corpo generico INTERNAL_SERVER_ERROR.

## Janela de reembolso nao dispara quando refoundDateLimit e NULL, e a rota estoura 500

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** A unica barreira de janela de reembolso simplesmente nao existe para trial e para assinatura PIX ainda nao paga (ambas nascem com refoundDateLimit NULL). Clinica em trial que clica em 'reembolsar' recebe 500 em uso normal.
- **Reprodução:** POST /signature/start-trial/33231be6-... -> trial com paymentId='trial' e refoundDateLimit NULL. PUT /signature/refound/0dbc57cb-4bfa-41b8-bd7c-e33416851005 -> 500 INTERNAL_SERVER_ERROR. Banco antes e depois identico (nada corrompido). Causa: linha 533, moment(null).isBefore(new Date()) devolve false, entao a guarda de janela nao barra e o fluxo segue ate tentar estornar o paymentId literal 'trial' no provedor.

## Plano com isActive=false continua listado publicamente e pode ser contratado

- **Rota:** `GET /signature-plan, POST /signature/credit/new, POST /signature/pix, POST /signature/start-trial`
- **Impacto:** Desativar um plano nao impede nada: ele continua aparecendo na vitrine e continua sendo vendido. Todo o fluxo desta auditoria foi contratado sobre um plano inativo.
- **Reprodução:** SQL: Plano Demo (33231be6-b0fc-40d3-b108-91ad5ae1edef) esta com isActive=false. GET /signature-plan (publico) -> retorna o plano normalmente com "isActive":false. POST /signature/start-trial e POST /signature/credit/new nesse planId -> 201, assinatura criada e cobranca gerada no Asaas. Codigo: SignaturePlanService.fetch chama fetchAll sem filtro e nenhum fluxo de pagamento checa isActive.

## Reembolso duplo aceito e erro do provedor ignorado em silencio

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** Se o estorno falhar no provedor a API responde sucesso mesmo assim: a clinica perde o acesso e nao recebe o dinheiro, sem nenhum sinal de erro. Suporte nao tem como distinguir estorno feito de estorno falho.
- **Reprodução:** PUT /signature/refound/1beeaa55-efda-4e70-b400-b4474d5cbc61 -> 200 (estorno sai, pagamento fica REFUNDED no Asaas). Segunda chamada na mesma assinatura -> 200 de novo. Codigo linha 535: await this.refoundPayment.refound(...) tem o retorno descartado, sem checagem de isLeft(), e a assinatura e marcada INACTIVE de qualquer forma.

## POST /invoice aceita valor negativo e zero; fatura negativa paga vira receita negativa no caixa

- **Rota:** `POST /invoice, PUT /invoice/:id`
- **Impacto:** CreateInvoiceDto.amount so tem @IsNumber(), sem @Min. CreatePaymentDto tem @Min(0.01) - a regra existe no financeiro e falta na fatura. O caixa fica com receita negativa.
- **Reprodução:** POST /invoice {amount:-500,dueDate:'2026-09-01'} -> 201 com amount -500. POST /invoice {amount:0,...} -> 201. PUT /invoice/<id -500> {paidAt:'2026-08-02T12:00:00.000Z'} -> 200 status PAID. SQL: select p.name,p.amount,p.type,t.value,t.status from sheduled_payments p join transactions t on t."paymentId"=p.id where p."invoiceId"='<id -500>' -> Fatura recebida|-500|INCOME|-500|PAID.

## POST /transaction aceita valor negativo (POST /payment bloqueia)

- **Rota:** `POST /transaction`
- **Impacto:** Uma receita de -99 e uma despesa disfarcada que nao aparece em totalOutcome. Validacao inconsistente entre as duas rotas que gravam a mesma tabela.
- **Reprodução:** POST /transaction {name:'NegTx',value:-99,type:'INCOME',dueDate:'2026-08-10',status:'PENDING',categoryId:<CATO>,paymentId:<PAY>} -> 201. SQL: select name,value from transactions where name='NegTx' -> NegTx|-99. Comparacao: POST /payment com amount:-10 -> 400 'O valor deve ser maior que zero'.

## DELETE /invoice apaga fatura JA PAGA sem bloqueio e deixa a movimentacao recebida orfa

- **Rota:** `DELETE /invoice/:id`
- **Impacto:** O documento fiscal e o bankPaymentId do Asaas somem; o dinheiro permanece no caixa sem lastro nem origem rastreavel. A FK invoiceId e ON DELETE SET NULL, entao nao ha nem erro nem cascata.
- **Reprodução:** Fatura F2-001-B com status PAID, amount 9999 e bankPaymentId pay_i6eak0g802b5ifmh. DELETE /invoice/d28419d1-... -> 200 sem aviso. SQL: select count(*) from invoices where id='d28419d1-...' -> 0. SQL: select id,name,amount,"invoiceId" from sheduled_payments where name like 'Fatura F2%' -> 6315a12a-...|Fatura F2-001-B|399.99|NULL. GET /payment?page=1 continua listando 'Fatura F2-001-B' com invoiceNumber null.

## PUT /admin/companies aceita phone, logoUrl, pixKey e signatureUrl, responde 200 e descarta os quatro em silencio

- **Rota:** `PUT /admin/companies/:id`
- **Impacto:** Operador salva, recebe sucesso e o dado nao muda. Alem disso nao existe forma nenhuma de cadastrar o telefone da empresa pelo painel - e o telefone e exatamente o que quebra a criacao de assinatura.
- **Reprodução:** PUT /admin/companies/30c6c97e-57ac-4c1f-b081-154cc085ed10 com {"phone":"11912345678","logoUrl":"https://cdn.x/logo.png","pixKey":"chave@pix.com","signatureUrl":"https://cdn.x/ass.png"} -> HTTP 200 com corpo trazendo phone:null, logoUrl:null, pixKey:null, signatureUrl:null. SQL confirma os 4 campos NULL. Causa: o controller usa EditCompanyDto (do modulo account) que declara os 4 campos, mas AdminCompanyUpdateService so trata name, address, number, postalCode, walletId e cnpj.

## Empresa criada pelo painel nao consegue assinar; o erro aponta um campo que o painel nao tem, e sem usuario e impossivel

- **Rota:** `POST /admin/companies + POST /admin/signature/create/:companyId/:planId`
- **Impacto:** O fluxo criar empresa pelo painel e depois cobrar so funciona se houver CNPJ valido E pelo menos um usuario com telefone valido - nada disso e validado nem editavel na criacao. Empresa sem usuario nunca consegue assinar.
- **Reprodução:** AdminCompanyCreateService grava paymentId='admin-<uuid>' (nao cria cliente Asaas) e nao valida CNPJ. 1) POST /admin/companies {"name":"Empresa F2 Admin","cnpj":"74605006425057"} -> 201 com paymentId admin-d639bb92-... 2) POST /admin/companies {"name":"Dup F2","cnpj":"11111111111111"} -> 201 (CNPJ invalido E duplicado de outra empresa, ambos aceitos; nome de 5000 chars tambem aceito). 3) POST /admin/signature/create/<empresa cnpj 111...>/<plano> -> 400 'O CPF/CNPJ informado e invalido.' 4) Corrigindo o CNPJ para valido -> 400 'O celular informado e invalido.' (telefone veio do 1o usuario, 11999999999, rejeitado pelo Asaas - e 11999999999 e o proprio fallback hardcoded do service). 5) Empresa 27a066f6 com 0 usuarios -> 400 'O CPF/CNPJ informado e invalido.' (fallback 00000000000000). 6) So depois de PATCH /admin/users/:id {"phone":"11988776655"} a assinatura passou (201) e paymentId virou cus_000008550818.

## GET /admin/signature (tela principal do painel) devolve 500 cru para qualquer query param invalido

- **Rota:** `GET /admin/signature`
- **Impacto:** A listagem principal de assinaturas quebra com 500 se o front mandar qualquer filtro fora do esperado, e o operador nao recebe nenhuma pista do que errou.
- **Reprodução:** O controller le status, companyId, page e pageSize com @Query cru, sem DTO nem validacao. HTTP observado: ?status=BANANA -> 500; ?page=abc&pageSize=xyz -> 500; ?page=-1&pageSize=3 -> 500; ?companyId=abc -> 500. Todos com o texto generico 'Nao foi possivel concluir a operacao. Tente novamente em alguns instantes...'. Comparacao: /admin/financial/transactions, que tem DTO, devolve 400 em portugues para page=abc e page=-1.

## PATCH /admin/signature/:id e change-plan devolvem a entidade crua (_id / props / _attachments) em vez do contrato

- **Rota:** `PATCH /admin/signature/:id e POST /admin/signature/change-plan/:id`
- **Impacto:** signature.id vem undefined para o front (o campo esta em _id), quebrando a tela apos salvar. Alem disso expoe asaasSubscriptionId, creditCardId e invoiceId, que nenhuma outra rota expoe.
- **Reprodução:** PATCH /admin/signature/a5787b94-135f-4d54-8793-82eb5ba10191 {"status":"ACTIVE"} -> 200 com {"signature":{"_id":"a5787b94-...","props":{"companyId":...,"paymentId":"sub_pending","asaasSubscriptionId":"sub_gm9kpt7uhpbw2qfi","creditCardId":null,"invoiceId":null,"wasTrial":false,...}},"_attachments":[]}. Todas as outras rotas de assinatura devolvem {id, companyId, signaturePlanId, status, expirationDate, yearly, createdAt}.

## POST/PUT /admin/plans grava preco negativo, userQuantity negativo e desconto anual de 500%

- **Rota:** `POST /admin/plans e PUT /admin/plans/:id`
- **Impacto:** Com yearlyDiscount=500 o calculo anual pixPrice*12*(1-500/100) vira valor negativo enviado direto ao Asaas. Com userQuantity negativo o limite de usuarios do plano bloqueia todos os cadastros da empresa.
- **Reprodução:** POST /admin/plans {"name":"F2ADM Negativo","description":"d","userQuantity":-5,"creditCardPrice":-100,"pixPrice":-50,"isActive":true,"yearlyDiscount":500,"trialDays":0} -> HTTP 201. SQL: userQuantity=-5, creditCardPrice=-100, pixPrice=-50, yearlyDiscount=500. Causa: CreateSignaturePlanDto so tem @Min(0) em trialDays; userQuantity, creditCardPrice, pixPrice e yearlyDiscount nao tem nenhum limite.

## charge devolve 404 'Registro nao encontrado' quando a empresa foi criada pelo painel, mesmo com assinatura existente

- **Rota:** `POST /admin/signature/charge/:id`
- **Impacto:** O operador procura um cadastro que existe. A causa real (empresa nunca virou cliente no Asaas) fica invisivel.
- **Reprodução:** 1) POST /admin/signature/create/27a066f6-8549-4ac4-8621-d7b0f3c09436/904d4948-1f55-46dd-a7fe-fad1a9249d55 {"isTrial":true} -> 201, assinatura 0b657ab3-a43c-4ad0-bcd9-75be660caf0f. 2) POST /admin/signature/charge/0b657ab3-... -> 404 'Registro nao encontrado. Confira os dados informados e tente novamente.' Causa: charge retorna ResourceNotFoundError quando company.paymentId comeca com 'admin-'. A assinatura e a empresa existem.

## Fatura sem clientId pode ser paga por qualquer cliente autenticado e fica PAID sem dono

- **Rota:** `POST /invoice/:id/pay/pix e /pay/credit/new`
- **Impacto:** invoice.service.ts guarda com 'if (invoice.clientId && invoice.clientId !== clientId)' — quando clientId é null a guarda não dispara. Cliente é cobrado por fatura que não é dele, e a fatura fica PAID com clientId NULL: a clínica não tem como saber quem pagou. Exige adivinhar o UUID da fatura, por isso GRAVE e não BLOQUEIA. Com clientId preenchido a guarda funciona: pagar a fatura do outro dono -> 404 limpo e fatura intacta.
- **Reprodução:** 1) Com token da clínica: POST /invoice {amount:55, dueDate:'2026-10-05', number:'F3-ORFA', description:'Fatura sem cliente'} (sem clientId, que é opcional no CreateInvoiceDto) -> 201, id 24716146-de11-497f-8525-2bd6ed75c497, clientId null. 2) POST /invoice/24716146.../pay/pix com token do Dono A -> 201 (QR gerado). 3) POST /invoice/24716146.../pay/credit/new com token do Dono B -> 201. 4) SQL: select number,status,"clientId","bankPaymentId" from invoices where number='F3-ORFA' -> F3-ORFA | PAID | (null) | pay_y14zqy9xhq0hkld2.

## Pagar por cartão quando a clínica não tem conta Asaas devolve 'Registro não encontrado'

- **Rota:** `POST /invoice/:id/pay/credit/new e /pay/credit/existing`
- **Impacto:** Em invoice.service.ts:489 o teste '!company.walletId' cai no mesmo ResourceNotFoundError de 'fatura não existe'. O proprietário vê 'registro não encontrado' para uma fatura que está na tela dele e abre chamado. O caminho PIX já faz certo — é só inconsistência entre os dois.
- **Reprodução:** Com a empresa no estado em que nasce (walletId null): POST /invoice/<fatura própria e existente>/pay/credit/new com payload de cartão válido -> 404 {"message":"Registro não encontrado. Confira os dados informados e tente novamente."}; /pay/credit/existing -> 404 idem. Na MESMA fatura, POST /invoice/<id>/pay/pix -> 400 'A empresa ainda não possui PIX configurado. Entre em contato com o estabelecimento.' Depois de preencher o walletId por SQL, o mesmo POST /pay/credit/new -> 201.

## Autoria do anexo (uploadedBy) e responsavel da ficha vem do body: da para forjar com usuario de OUTRA empresa

- **Rota:** `PUT /exam/:id (e todas as fichas com anexo)`
- **Impacto:** Trilha de auditoria de anexo clinico falsificavel e referencia cruzada entre tenants gravada em banco. Em ficha clinica isso e assinatura de responsabilidade tecnica.
- **Reprodução:** Com token da empresa b19c5017: PUT /exam/e7244d6f-2a6a-4a4a-bb21-01f9bd11afdd {"userId":"41514ceb-4ae4-4491-a431-e7a5fccfc5c7","attachments":[{"url":"https://cdn/forjado.pdf"}]} -> 200. SQL: select a.url,a."uploadedBy",u."companyId" from attachments a left join users u on u.id=a."uploadedBy" where a.url='https://cdn/forjado.pdf' -> uploadedBy de company f4e2f01e. E exams.userId tambem ficou apontando para usuario de outra empresa. Variante: PUT sem userId grava uploadedBy=NULL (autoria perdida); ja ha 324 anexos com uploadedBy nulo no banco.

## As duas fontes de anexo divergem quando a URL contem \n (separador do formato legado)

- **Rota:** `PUT/POST de qualquer ficha com anexo`
- **Impacto:** Consumidor que le a coluna escalar (o presenter devolve resultFileUrl/fileUrl cru, e o fallback legacyViews usa esse split) ve um anexo fantasma. Reverter a fase EXPAND traz o dado corrompido.
- **Reprodução:** PUT /exam/<id> {"attachments":[{"url":"https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf"}]} -> 200. GET /exam/<animalId>?page=1: campo attachments = 1 item; campo resultFileUrl = 'https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf' que, pelo parser legado (split \n), vira 2 itens. AttachmentSyncService.resolve so faz url.trim(), nao rejeita quebra de linha interna.

## GET /coupons/validate/:code publica, sem rate limit, e diferencia 'existe' de 'nao existe'

- **Rota:** `GET /coupons/validate/:code`
- **Impacto:** O status HTTP entrega se o cupom existe: qualquer um enumera a base de cupons por forca bruta e descobre descontos ativos e quantas vagas restam. Alem disso o presenter expoe contadores comerciais internos publicamente.
- **Reprodução:** Sem nenhum token: GET /coupons/validate/NAOEXISTE -> 404; GET /coupons/validate/F3INATIVO -> 200 {"isValid":false}; GET /coupons/validate/F3OK -> 200 com objeto completo do cupom (id, maxUsages, currentUsages). 150 requisicoes concorrentes em 194 ms, todas 200 — nenhum throttle.

# Menores — 7

## Mensagem generica quando a janela de reembolso venceu

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** A mensagem nao diz que o prazo de 7 dias expirou e e a mesma usada para 'assinatura de outra empresa'. Suporte nao consegue diferenciar prazo vencido de tentativa de acesso indevido.
- **Reprodução:** Com refoundDateLimit setado em 2020-01-01 via SQL: PUT /signature/refound/a2222ebb-84ec-4726-83c6-2fe7070455e4 -> 403 {"message":"Voce nao tem permissao para realizar esta acao.","code":"NOT_ALLOWED"}. Banco confirma status inalterado (ACTIVE).

## Erro cru do Asaas vaza quando o cupom zera o valor

- **Rota:** `POST /signature/pix/:planId`
- **Impacto:** applyCouponToValue zera o valor com Math.max(0, ...) e o provedor rejeita. O codigo HTTP esta certo, mas a mensagem tecnica do gateway nao faz sentido para a clinica.
- **Reprodução:** POST /signature/pix/aaaaaaaa-0000-4000-8000-00000000f201 {"yearly":false,"couponId":"aaaaaaaa-0000-4000-8000-00000000c202"} (cupom FIXED de 9999 sobre plano de 459,90) -> 400 {"message":"O parametro value deve ser informado","code":"PAYMENT_ERROR"}. Nao deixou lixo no banco (contagem de assinaturas inalterada).

## Renovacao encurta o periodo em vez de somar ao saldo restante

- **Rota:** `POST /signature/webhook (PAYMENT_CONFIRMED)`
- **Impacto:** Se a cobranca confirmar antes do vencimento, os dias restantes sao perdidos. Impacto pequeno enquanto o provedor cobrar exatamente no vencimento; vira perda real em cobranca antecipada ou retry.
- **Reprodução:** Assinatura CREDIT_CARD com expiracao 2026-09-02 17:40:12. Webhook PAYMENT_CONFIRMED com paymentId novo -> expiracao virou 2026-09-02 17:40:27, ou seja agora+1 mes, e nao expiracao_anterior+1 mes. Codigo: linhas 473-475 e 461-463 usam moment().add(...).

## Recorrencia MONTHLY/YEARLY em dia 29, 30 ou 31 some nos meses curtos

- **Rota:** `GET /reminder/by-date`
- **Impacto:** Lembrete mensal nao ocorre em meses com menos dias.
- **Reprodução:** fetchByDate compara startBrt.date() === queryDom, sem fallback. Lembrete MONTHLY criado em 2026-01-31: GET /reminder/by-date?date=2026-07-31 -> aparece; ?date=2026-09-30 -> nao aparece; ?date=2026-02-28 -> nao aparece.

## /bank-account sem validacoes de conteudo e sem rota de exclusao

- **Rota:** `POST /bank-account, DELETE /bank-account/:id`
- **Impacto:** Conta criada por engano nao tem como ser removida pela API. Nota sobre walletId: o campo NAO pertence a bank-account, mora em companies e so e gravavel pelas rotas admin, que apenas fazem trim() - a base ja tem walletId='wlt_teste' gravado (company 7f5174fb-...), ou seja, zero validacao contra o Asaas. Fora do meu conjunto de 26 rotas, mas o PIX inteiro depende dele.
- **Reprodução:** POST /bank-account {name:'Neg',initialBalance:-500} -> 201 (saldo negativo aceito). POST com name de 5000 chars -> 201. POST com nome ja existente -> 201 (duplicado). DELETE /bank-account/<id> -> 404 'Cannot DELETE /bank-account/<id>' (rota nao existe).

## Receita do resumo financeiro so varre assinaturas ACTIVE e faz N+1 de chamadas ao Asaas

- **Rota:** `GET /admin/financial/summary`
- **Impacto:** Risco de faturamento subestimado apos cancelamentos e de timeout do dashboard financeiro conforme a base cresce.
- **Reprodução:** Leitura de adminFinancial.service.ts: getPaymentsForPeriod itera apenas fetchActiveWithPlans(), enquanto /transactions lista transacoes de assinaturas de qualquer status - os dois numeros nao fecham entre si. Um pagamento recebido de empresa que depois cancelou (INACTIVE) desapareceria retroativamente do faturamento do mes. NAO consegui reproduzir com valor real: revenueMonth e revenuePreviousMonth voltaram 0 em todas as chamadas porque nao ha pagamento RECEIVED no sandbox. Efeito colateral ja observavel: ambas as rotas fazem 1 chamada ao Asaas por assinatura; com 30 assinaturas o /transactions ja dispara ~30 requisicoes externas por pageview.

## POST /animal com gender fora do enum devolve 404 em vez de 400 (fora do meu conjunto, apareceu no caminho)

- **Rota:** `POST /animal`
- **Impacto:** O DTO valida gender só com @IsString(), então o valor inválido só quebra lá na frente e sai como 404 enganoso, sem dizer quais categorias existem (STALLION, CASTRATED, MATRIX, DONOR, RECEPTOR). Fora do meu conjunto — repasse ao agente do módulo animal.
- **Reprodução:** POST /animal {name:'Cavalo B', breed:'MM', gender:'MARE', sex:'FEMALE', birthDate:'2019-05-10', clientId, studFarmId, color:'Tordilho'} com token da clínica -> 404 'Registro não encontrado. Confira os dados informados e tente novamente.' Com gender:'MATRIX' o mesmo payload -> 201.

