# Blindagem da API — varredura CRUD das 391 rotas

12 agentes, 3 fases por dependência, **823 chamadas reais** contra a API rodando.
Todo achado foi reproduzido: os passos estão em cada item.

## Cobertura

| | |
|---|---|
| Rotas da API | 391 |
| **Rotas exercitadas** | **363 (93%)** |
| Achados (após deduplicar) | 180 |
| **Bloqueiam o lançamento** | **44** |
| Graves | 89 |
| Menores | 47 |

## Bloqueadores por tema

| Tema | Bloqueia | Total |
|---|---|---|
| SEGURANCA / ISOLAMENTO | 11 | 20 |
| DINHEIRO / ASSINATURA | 11 | 32 |
| FINANCEIRO / ESTOQUE | 10 | 34 |
| ATENDIMENTO | 5 | 26 |
| OUTROS | 4 | 53 |
| CLINICO | 3 | 15 |

---

# BLOQUEIA O LANÇAMENTO

## ATENDIMENTO

### DELETE /appointment/:id devolve 500 sempre que o atendimento tem algum animal

- **Rota:** `DELETE /appointment/:id`
- **Impacto:** Excluir atendimento simplesmente nao funciona no caso normal — todo atendimento SERVICE tem animal. AppointmentAnimal.appointment nao tem onDelete: Cascade (schema.prisma:1707) e o service so chama prisma.appointment.delete (appointment.service.ts:354). Nao deixa orfao no banco (verificado: 0), mas o usuario recebe 500 generico sem saber o motivo nem o que fazer.
- **Reprodução:** DELETE /appointment/3099e505-dd27-4962-8e8a-4d226599c973 (3 animais) -> 500 mensagem generica. DELETE /appointment/13b6ec7d-... (1 animal, sem ficha nenhuma) -> 500. DELETE /appointment/babe560d-... (ACTIVITY sem animais) -> 200 e o GET details seguinte devolve 404. Ou seja: so exclui atendimento vazio.
- **Módulo:** atendimentos (/appointment + /appointm

### PUT /appointment/:id com animals apaga o historico de status e troca os ids dos vinculos, respondendo 200

- **Rota:** `PUT /appointment/:id`
- **Impacto:** deleteMany + createMany com status PENDING fixo (appointment.service.ts:228-238). Salvar o formulario sem mudar animal nenhum reseta o progresso do atendimento e troca o appointmentAnimalId — que e a chave usada por fichas, pagamentos e produtos. Registros anteriores ficam orfaos de tela. E responde 200, sem qualquer aviso.
- **Reprodução:** 1) Atendimento 4ae92b3b-91d5-4017-971d-9d34a92128d9 com Trovao (aa 8f49b2b7) e Estrela (aa 5dd459c9). 2) PUT /appointment-animal/8f49b2b7-... {"status":"IN_PROGRESS"} -> 200. 3) PUT /appointment/4ae92b3b-... enviando exatamente o MESMO array animals -> 200. 4) GET /appointment/details/4ae92b3b-...: os vinculos agora sao ac4406ed e 7c06c977 (ids novos) e ambos voltaram para PENDING.
- **Módulo:** atendimentos (/appointment + /appointm

### PUT /appointment/:id com animals em atendimento que ja tem ficha: 500 com gravacao parcial (sem transacao)

- **Rota:** `PUT /appointment/:id`
- **Impacto:** appointmentRepository.save roda ANTES do deleteMany, que estoura FK contra a ficha, e nao ha transacao. Efeito pratico: depois que existe qualquer ficha clinica, o atendimento nao pode mais ser salvo pelo formulario — todo PUT devolve erro generico e deixa o registro meio-editado (datas/descricao aplicadas, animais nao).
- **Reprodução:** 1) Atendimento 3099e505-... com 3 animais. 2) POST /general-info/539740e5-... {animalId, userId, observation} -> 201 (ficha do Trovao). 3) PUT /appointment/3099e505-... {"description":"Descricao editada F1","animals":[...3 animais...]} -> 500. 4) docker exec vetequus-local psql -U postgres -d vetequus -c "SELECT description FROM appointments WHERE id='3099e505-dd27-4962-8e8a-4d226599c973'" -> devolve 'Descricao editada F1'. A descricao foi gravada apesar do 500.
- **Módulo:** atendimentos (/appointment + /appointm

### Filtro de data de GET /appointment-animal filtra por data de cadastro, nao pela data do atendimento

- **Rota:** `GET /appointment-animal`
- **Impacto:** prismaAppointmentAnimal.repository.ts:87 monta dateFilter.createdAt em vez de usar appointment.startDate. Qualquer tela que filtre atendimentos por periodo devolve lista vazia ou lista errada, sem erro visivel.
- **Reprodução:** Registros criados em 2026-08-02, atendimentos agendados para 15/07/2026 (10 deles) e 10/09/2026 (1). GET /appointment-animal?page=1&startDate=2026-07-15&endDate=2026-07-15 -> 200 n=0. GET ...startDate=2026-09-10&endDate=2026-09-10 -> 200 n=0. GET ...startDate=2026-08-02&endDate=2026-08-02 -> 200 n=10 (todos).
- **Módulo:** atendimentos (/appointment + /appointm

### DELETE /appointment/:id sempre devolve 500 — impossivel excluir um atendimento

- **Rota:** `DELETE /appointment/:id`
- **Impacto:** Funcionalidade nao funciona: o usuario nunca consegue apagar um atendimento criado errado. Como todo atendimento nasce com pelo menos um animal e a FK e RESTRICT, falha 100% das vezes.
- **Reprodução:** POST /appointment com 1 animal -> 201. GET /appointment/fetch?page=1 para pegar o id. DELETE /appointment/<id> -> 500 'Nao foi possivel concluir a operacao'. Testado com atendimento SEM nenhuma ficha e COM fichas: 500 nos dois casos. Banco: 'select conname, confdeltype from pg_constraint where confrelid=\'appointments\'::regclass' devolve appointment_animals_appointmentId_fkey | r (RESTRICT). A linha continua em appointments apos o DELETE.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

## CLINICO

### App do proprietário recebe 403 em todas as telas de saúde (Vacinas, Vermifugação, Exames, Ferrageamento)

- **Rota:** `GET /vaccine/:animalId, GET /vaccine/soon/:animalId, GET /deworming/:animalId, GET /deworming/soon/:animalId, GET /exam/:animalId, GET /shoeing/:animalId, GET /shoeing/soon/:animalId`
- **Impacto:** As 4 telas de saúde e o resumo de saúde do app do proprietário estão 100% quebrados. Confirmado que o app chama exatamente essas rotas: equinology-app-v2/lib/api-routes.ts linhas 25-49, usadas em app/(animal)/health/vaccines.tsx:32, dewormings.tsx:32, shoeing.tsx:44 e index.tsx:46-49.
- **Reprodução:** 1) POST /client/token {"clientId":"84786150-ade3-47c7-866f-f0c13d111e6d"} -> accessToken com payload {"sub":"<clientId>","companyId":"no-company","type":"client"}. 2) Com esse token: GET /vaccine/bc0abb33-69b6-41ad-9b14-0e9571f7895d?page=1 -> 403 NOT_ALLOWED. Mesmo 403 em /vaccine/soon/<id>, /deworming/<id>?page=1, /exam/<id>?page=1, /shoeing/<id>?page=1, /shoeing/soon/<id>. O animal É do cliente dono do token. Causa: vaccine/deworming/exam/shoeing.service resolvem posse só por isAnimalFromCompany(animalId, companyId) e o token de cliente traz companyId='no-company'; nenhum deles trata tokenType==='client' (só sanitaryProtocol.service trata).
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### Tela de Protocolos do app do proprietário sempre dá 400 (app não envia studFarmId obrigatório)

- **Rota:** `GET /sanitary-protocol`
- **Impacto:** Tela de protocolos sanitários do app do proprietário nunca carrega. O suporte a token de cliente existe e funciona no backend — o que quebra é o contrato exigido.
- **Reprodução:** Com token de cliente: GET /sanitary-protocol?page=1 -> 400 {"message":["O campo Haras é obrigatório","Escolha um Haras válido"]}. Com studFarmId correto o mesmo token retorna 200 e lista os protocolos. O app chama sem studFarmId: ApiRoutes.SanitaryProtocol.list + "?page=1" em equinology-app-v2/app/(animal)/health/protocols.tsx:34 e health/index.tsx:50. DTO FetchSanitaryProtocolDto marca studFarmId como @IsNotEmpty.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### nextDate:null não limpa a próxima dose em nenhuma ficha; API responde 200 mentindo (checagem existe e nunca dispara)

- **Rota:** `PUT /vaccine/:id, PUT /deworming/:id, PUT /exam/:id, PUT /shoeing/:id`
- **Impacto:** Impossível remover um reforço/renovação agendado por engano. A API responde sucesso, o dado não muda e o lembrete continua disparando para o cliente.
- **Reprodução:** POST /vaccine {...,"nextDate":"2026-07-10"} -> 201. PUT /vaccine/56b33d6b-0f57-420c-b316-1e5b32302551 {"nextDate":null} -> 200. GET /vaccine/<animalId>?page=1 -> nextDate continua preenchido. SQL: select "nextDate" from vaccines where id='56b33d6b-...' -> 2026-09-01 00:00:00. Reproduzido igual em PUT /deworming/:id, PUT /exam/:id e PUT /shoeing/:id. Causa: src/infra/shared/decorators/StrictDate.decorator.ts converte null em undefined ('if (value === null || value === undefined || value === \'\') return undefined;'), então o 'if (nextDate !== undefined)' dos services — escrito e comentado justamente para permitir limpar a data — nunca dispara. shoeing.service nem tenta: usa 'nextDate ?? shoeing.nextDate'.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

## DINHEIRO / ASSINATURA

### upgrade/pix derruba o acesso da clinica na hora, antes de qualquer pagamento

- **Rota:** `POST /signature/upgrade/pix`
- **Impacto:** A clinica clica em 'fazer upgrade via PIX', ainda nao pagou nada, e perde o sistema no ato — inclusive o periodo que ja estava pago. Fica sem acesso ate pagar o QR code e o webhook chegar.
- **Reprodução:** Empresa B com assinatura ACTIVE paga (cartao, expira 2026-09-02): GET /signature/validation -> 200. Entao POST /signature/upgrade/pix {"newPlanId":"aaaaaaaa-0000-4000-8000-00000000f201","yearly":false} -> 201 devolvendo QR code. Imediatamente GET /signature/validation -> 403 NOT_ALLOWED e GET /signature/current -> {"hasActiveSignature":false}. Banco: todas as 3 linhas de law_firm_signatures da company b97deaeb-0277-4d89-b6d4-77a95bdc6876 ficaram INACTIVE. Codigo: companySignature.service.ts linha 1009 (activeSignature.status='INACTIVE') e 1021 (nova nasce INACTIVE).
- **Módulo:** F2-assinatura (signature, signature-pl

### Reembolso nao cancela a recorrencia: cliente reembolsado continua sendo cobrado todo mes

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** Cliente estornado e sem acesso continua com a recorrencia viva no provedor e sera cobrado no proximo ciclo, e no seguinte, indefinidamente. Chargeback e reclamacao certos.
- **Reprodução:** PUT /signature/refound/1beeaa55-efda-4e70-b400-b4474d5cbc61 -> 200; GET /signature/validation -> 403 (acesso cortado). Asaas GET /payments/pay_4vnehh5oub7eea9t -> status REFUNDED. Asaas GET /subscriptions/sub_qlwwkowe08r8sn62 -> status ACTIVE, deleted:false, nextDueDate 2026-09-02, value 124.95. Codigo: refoundSignature (linhas 523-548) so chama refound + cancelInvoice, nunca subscription.cancelSubscription.
- **Módulo:** F2-assinatura (signature, signature-pl

### Trial pago no cartao mantem paymentType=PIX e a renovacao nunca estende a validade

- **Rota:** `POST /signature/credit/new + POST /signature/webhook`
- **Impacto:** Toda clinica que veio de trial e pagou no cartao tem a renovacao ignorada: paga e perde o acesso no fim do periodo. Como o trial e o funil padrao de entrada, atinge praticamente toda a base nova.
- **Reprodução:** POST /signature/start-trial/33231be6-b0fc-40d3-b108-91ad5ae1edef; depois POST /signature/credit/new com cartao sandbox aprovado -> 201. Banco (sig 0dbc57cb-4bfa-41b8-bd7c-e33416851005): status=ACTIVE mas paymentType=PIX. GET /signature/current mostra "paymentType":"PIX" para quem pagou no cartao. Renovacao: POST /signature/webhook {"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_RENOVACAO_TESTE_1","subscription":"sub_5010wpyfxzviiv3p"}} -> 200; banco: paymentId atualizado mas expirationDate PARADA em 2026-09-02 17:39:13. Contraprova: a mesma renovacao numa assinatura criada ja como CREDIT_CARD (sig 4f80ff37, sub_wpkehsor34agdte9) estendeu 17:40:12 -> 17:40:27. Codigo: ramos existingTrial nas linhas 273-285 e 373-384 nao atualizam paymentType.
- **Módulo:** F2-assinatura (signature, signature-pl

### Cartao nunca e salvo: GET /credit-card sempre vazio e credit/existing inutilizavel

- **Rota:** `POST /signature/credit/new, POST /signature/credit/existing, GET /credit-card`
- **Impacto:** A funcionalidade 'pagar com o cartao salvo' nao existe na pratica: a tela de cartoes fica sempre vazia e a rota credit/existing responde 404 para todo mundo. Nenhum cliente consegue reassinar sem redigitar o cartao.
- **Reprodução:** Depois de dois pagamentos aprovados via POST /signature/credit/new: GET /credit-card -> 200 {"data":[]}. SQL: select count(*) from credit_cards -> 0 em todo o banco. Banco: law_firm_signatures.creditCardId = NULL. POST /signature/credit/existing {"creditCardId":"<qualquer>"} -> 404 RESOURCE_NOT_FOUND. Codigo: newCreditCard cria a assinatura com creditCardId: null (linha 387) e descarta o token do provedor.
- **Módulo:** F2-assinatura (signature, signature-pl

### Webhook SUBSCRIPTION_CREATED ativa a assinatura sem nenhum pagamento

- **Rota:** `POST /signature/webhook`
- **Impacto:** Acesso liberado de graca: o Asaas dispara SUBSCRIPTION_CREATED no instante em que a recorrencia e criada (ou seja, ao gerar o QR code). Causa distinta do bug ja mapeado do trial — atinge qualquer assinatura PIX nova, com ou sem trial.
- **Reprodução:** POST /signature/pix/aaaaaaaa-0000-4000-8000-00000000f201 {"yearly":false} -> 201, cria sig 448722f7-fc17-4284-8bd9-6e3d7bcb680f com status INACTIVE e sub_ug3icgfgfzvtmycj. Nenhum pagamento feito. Entao POST /signature/webhook {"event":"SUBSCRIPTION_CREATED","subscription":{"id":"sub_ug3icgfgfzvtmycj"}} -> 200. Banco: status = ACTIVE. GET /signature/current -> hasActiveSignature:true no plano QA-F2-Pro. Codigo: linhas 486-496 setam ACTIVE sem checar pagamento.
- **Módulo:** F2-assinatura (signature, signature-pl

### Duplo clique em pagar cria duas assinaturas recorrentes no provedor

- **Rota:** `POST /signature/pix/:planId (e demais rotas de pagamento)`
- **Impacto:** Nao ha trava de idempotencia nem checagem de assinatura vigente. Duplo clique ou retry do front gera duas cobrancas recorrentes permanentes no mesmo cliente, e da para contratar por cima de uma assinatura ja ativa.
- **Reprodução:** Duas chamadas seguidas de POST /signature/pix/aaaaaaaa-0000-4000-8000-00000000f201 {"yearly":false} -> 201 nas duas, criando sig 448722f7 (sub_ug3icgfgfzvtmycj) e sig 13c0da97 (sub_20me2axwe0inqdzp). Banco: 4 assinaturas na company 998a9830, 4 asaasSubscriptionId distintos. Ambas foram criadas enquanto ja existia uma assinatura ACTIVE (4f80ff37).
- **Módulo:** F2-assinatura (signature, signature-pl

### Upgrade grava o preco promocional como valor recorrente eterno

- **Rota:** `POST /signature/upgrade/credit e POST /signature/upgrade/pix`
- **Impacto:** O credito proporcional e um desconto de uma vez so, mas vira o valor de todos os meses seguintes. Perda de receita permanente de ~47% em cada upgrade feito.
- **Reprodução:** POST /signature/upgrade/credit -> {"creditApplied":237.56,"finalPrice":262.34}. Asaas GET /subscriptions/sub_wpkehsor34agdte9 -> {value: 262.34, cycle: 'MONTHLY', description: 'Upgrade para Plano QA-F2-Pro - Mensal (Credito aplicado: R$ 237.56)'}. O plano custa 499,90/mes no cartao. Mesmo padrao em upgrade/pix: recorrencia de 222,34 contra 459,90 do plano. Codigo: linhas 853-863 e 973-981 passam finalPrice como value da subscription.
- **Módulo:** F2-assinatura (signature, signature-pl

### Rotas de pagamento de /transaction nao verificam se o lancamento pertence ao cliente do token

- **Rota:** `POST /transaction/pix/:transactionId, POST /transaction/credit/existing, POST /transaction/credit/new`
- **Impacto:** Qualquer cliente autenticado que descubra o id de uma parcela emite cobranca e da baixa em conta alheia, inclusive em despesas internas da clinica (que tambem sao transactions). O InvoiceService tem a guarda equivalente (invoice.clientId !== clientId) e o InvoiceController tem assertClientToken; as tres rotas de /transaction nao tem nem uma nem outra.
- **Reprodução:** Criei movimentacao 'Conta do Cliente B' R$333 com clientId = Cliente B. Com o token do Cliente A: POST /transaction/pix/<parcelaDoClienteB> -> 201 com QR Code emitido; POST /transaction/credit/existing {transactionId:'<parcelaDoClienteB>',creditCardId:'<cartao do Cliente A>',installmentCount:1} -> 201. SQL: select name,status,"paymentDate" from transactions where id=<parcelaB> -> Conta do Cliente B|PAID|2026-08-02 17:47:52.
- **Módulo:** F2-financeiro (/transaction, /transact

### bankPaymentId nunca e gravado em transactions - PIX e cartao ficam sem chave de conciliacao

- **Rota:** `POST /transaction/pix/:transactionId, POST /transaction/credit/new, POST /transaction/credit/existing`
- **Impacto:** Nao existe chave para casar o retorno do Asaas com a parcela. Cliente paga o PIX, o dinheiro entra na carteira e o lancamento fica PENDING para sempre.
- **Reprodução:** POST /transaction/pix/6ae17ce0-... (token de cliente) -> 201 com QR Code; SQL: select status,"bankPaymentId" from transactions where id='6ae17ce0-...' -> PENDING|vazio. POST /transaction/credit/new aprovado no sandbox -> 201; SQL id='bcb6d5b2-...' -> PAID|vazio. Base inteira: select count(*) filter (where "bankPaymentId" is not null), count(*) from transactions -> 0|63. Mesma consulta em invoices -> 1|53 (o meu PIX de fatura gravou pay_i6eak0g802b5ifmh). Causa dupla no codigo: PrismaTransactionMapper nao inclui bankPaymentId nem em toDomain nem em toPrisma; e transaction.service.ts:302-303 faz 'await save(transaction); transaction.bankPaymentId = payment.value.paymentId;' (save ANTES da atribuicao).
- **Módulo:** F2-financeiro (/transaction, /transact

### change-plan cancela a recorrencia no Asaas e NAO cria outra: empresa fica ACTIVE e nunca mais e cobrada

- **Rota:** `POST /admin/signature/change-plan/:id`
- **Impacto:** Perda de receita direta em toda troca de plano feita pelo painel: cliente migra para plano mais caro, mantem acesso ate a data de expiracao e nao existe mais nenhuma cobranca recorrente.
- **Reprodução:** 1) POST /admin/signature/create/258506bc-a83e-4582-bfb0-c9fdff5e0a53/ad5e95fd-e154-4acf-99d0-18cc16ac88a3 {"yearly":false,"isTrial":false} -> 201; banco: asaasSubscriptionId=sub_gm9kpt7uhpbw2qfi. 2) PATCH /admin/signature/a5787b94-135f-4d54-8793-82eb5ba10191 {"status":"ACTIVE","expirationDate":"2026-12-31T00:00:00.000Z"} -> 200. 3) GET .../history -> [{"id":"pay_vmjigjz5qjk03ixg","value":180.11,"status":"PENDING"}]. 4) POST /admin/signature/change-plan/a5787b94-... {"planId":"aaaaaaaa-0000-4000-8000-00000000f201","yearly":false} -> 201. 5) SQL: status=ACTIVE, asaasSubscriptionId=NULL, isAutoRenewActivated=f, signaturePlanId=novo plano (R$459,90/mes), expirationDate=2026-12-31. 6) GET .../history -> {"payments":[]} - o historico anterior tambem some.
- **Módulo:** Painel interno Equinology (/admin/*) -

### reactivate e renew-yearly criam assinatura NOVA a cada clique e deixam as recorrencias antigas vivas no Asaas (faturamento multiplicado)

- **Rota:** `POST /admin/signature/reactivate/:id e POST /admin/signature/renew-yearly/:id`
- **Impacto:** Dois cliques no painel geram duas cobrancas recorrentes simultaneas no Asaas contra o mesmo cliente, sem nenhum aviso, e a rota chamada reativar nao reativa o acesso.
- **Reprodução:** Empresa 258506bc-a83e-4582-bfb0-c9fdff5e0a53. 1) POST reactivate/a5787b94-... -> 201, nova linha 2d68f386 com sub_1w4vk1y0zlkkb3il. 2) POST reactivate/2d68f386-... -> 201, nova linha 48fd1b73 com sub_m06y8rptnkxzlbrl. 3) POST reactivate/2d68f386-... -> 201, nova linha bd002e84 com sub_zgzh4t4ec9fadkye. 4) POST renew-yearly/2d68f386-... -> 201, mais uma linha anual 3ff182c9 sem cancelar sub_1w4vk. 5) SQL: 6 linhas em law_firm_signatures para a mesma empresa. 6) Prova do faturamento triplicado: GET /admin/signature/2d68f386-.../history -> pay_vx5sipn0nqk2e40v R$459.90 PENDING; 48fd1b73 -> pay_tjorce06ivehdyol R$459.90 PENDING; bd002e84 -> pay_nm88lfe9gk4kq3xm R$459.90 PENDING. Total R$1.379,70 contra o mesmo cliente, mais R$4.966,92 da anual. Extra: reactivate deixa status=INACTIVE, ou seja nao reativa o acesso da empresa, so gera cobranca.
- **Módulo:** Painel interno Equinology (/admin/*) -

## FINANCEIRO / ESTOQUE

### POST /product-usage/usage com quantidade negativa CRIA estoque do nada (201)

- **Rota:** `POST /product-usage/usage`
- **Impacto:** Qualquer usuario logado inventa estoque e destroi o inventario e o financeiro derivado. Depois disso /stock-statistics passou a devolver currentStock -15, totalUsageQuantity -93, totalUsageValue -465.
- **Reprodução:** Produto com 73 no geral e 15 no volante. POST /product-usage/usage {"productId":P,"quantity":-5,"stockType":"general","appointmentAnimalId":AA} -> HTTP 201; GET /product/P mostra currentStock 78 (subiu). POST /product-usage/usage {"productId":P,"quantity":-100,"stockType":"field"} -> 201; currentFieldStock foi de 15 para 115. SQL: SELECT id,quantity FROM product_usages WHERE "productId"='P' devolve linhas com -5 e -100; SELECT "currentStockQuantity" FROM products -> 78. Nao existe guarda quantity<=0 no productUsage.service.ts (o fieldStock.service.ts tem, o de uso nao).
- **Módulo:** F2 - estoque e CRM

### POST /product-stock aceita quantidade negativa e deixa o saldo negativo

- **Rota:** `POST /product-stock`
- **Impacto:** Estoque negativo gravado no banco e preco medio envenenado, o que contamina todos os valores de /stock-statistics.
- **Reprodução:** GET /product/PX -> currentStock 3. POST /product-stock {"productId":PX,"quantity":-50,"unitValue":1,"date":"2026-08-01T00:00:00.000Z"} -> HTTP 201. GET /product/PX -> currentStock -47. unitValue e totalValue negativos tambem sao aceitos com 201.
- **Módulo:** F2 - estoque e CRM

### GET /stock-statistics reporta estoque geral errado: nunca desconta o consumo

- **Rota:** `GET /stock-statistics`
- **Impacto:** O painel de estoque mostra sempre estoque + tudo que ja foi consumido. Quanto mais a clinica usa, mais errado fica, e a quantidade contradiz o valor na mesma tela.
- **Reprodução:** Entrada 100, transfere 30 pro volante, devolve 10, consome 5 do volante e 7 do geral. GET /product/P -> currentStock 73, currentFieldStock 15 (correto). GET /stock-statistics -> currentStock 85, currentFieldStock 15, currentValue 365. O 365 = 73 x 5, ou seja o VALOR usa 73 e a QUANTIDADE mostra 85 na mesma resposta. Causa em stockStatistics.service.ts: currentStock = totalStock - currentFieldStock (sem subtrair productUsage), enquanto currentValue usa stockQty - usageQty - fieldQty.
- **Módulo:** F2 - estoque e CRM

### DELETE /product apaga em cascata o historico de estoque e o consumo lancado em atendimentos

- **Rota:** `DELETE /product/:productId`
- **Impacto:** Um clique apaga o historico clinico de consumo do animal e todo o extrato de inventario, sem retorno.
- **Reprodução:** Produto com entrada de estoque, saldo no volante e 4 registros de uso vinculados a um atendimento. DELETE /product/<P> -> HTTP 200 (sem bloqueio nem aviso). GET /product/<P> -> 404. SQL: count em product_usages, product_stocks e field_stocks para esse productId = 0 nos tres; SELECT id FROM products WHERE id='<P>' -> 0 linhas (hard delete, sem soft delete). GET /stock-movements?page=1 passou a devolver {"movements":[],"pages":0}.
- **Módulo:** F2 - estoque e CRM

### PUT /product-category/:id quebrado: exige no corpo um campo que o controller ignora

- **Rota:** `PUT /product-category/:productCategoryId`
- **Impacto:** Editar categoria de produto nao funciona pelo caminho obvio; qualquer front que mande so {name,color} recebe 400.
- **Reprodução:** PUT /product-category/33dcd525-... {"name":"Cat F2 Edit","color":"#000000"} -> HTTP 400 ["ID da categoria inválido"]. Com {"productCategoryId":"33dcd525-...","name":...} -> HTTP 200 e persiste. EditProductCategoryDto declara productCategoryId obrigatorio com @IsUUID, mas o controller usa o :productCategoryId da rota. Pior: mandando productCategoryId de OUTRA categoria no corpo, a API edita a da URL e responde 200 - o campo do corpo e descartado em silencio.
- **Módulo:** F2 - estoque e CRM

### PUT /reproduction-donor-ovulation/:id responde 200 e nao grava NENHUM campo

- **Rota:** `PUT /reproduction-donor-ovulation/:id`
- **Impacto:** O veterinario edita a ficha de inducao de ovulacao (data, hora, hormonio, dosagem, via de administracao, observacao), a API responde 200 e nada e salvo. Perda silenciosa de dado clinico. Unico modulo dos 41 com esse defeito - os outros 40 aplicam tudo. Causa: em vetequus-api/src/domain/application/services/animal/services/reproduction/reproductionDonorOvulation.service.ts o metodo edit desestrutura todos os campos e nunca faz um unico 'ovulation.X = ...' antes do save; so fileUrl/attachments passam pelo attachmentSync.
- **Reprodução:** 1) POST /reproduction-donor-ovulation/660f537b-590a-48de-ab84-546255bb7d09 {"animalId":"e09485b9-6862-4569-8741-0cfda6fcc71a","userId":"b092e935-f691-4061-8366-8053bbe28cc1","date":"2026-03-10T00:00:00.000Z","time":"T1","hormones":"H1","dosage":"D1","administration":"Intravenoso","observation":"OV1"} -> 201. 2) PUT /reproduction-donor-ovulation/<id> {"date":"2026-09-09T00:00:00.000Z","time":"T2","hormones":"H2","dosage":"D2","administration":"Intramuscular","observation":"OV2","fileUrl":"http://x/y.jpg"} -> OBSERVADO 200 corpo vazio. 3) GET /reproduction-donor-ovulation?page=1&animalId=e09485b9-... -> OBSERVADO date=2026-03-10, time=T1, hormones=H1, dosage=D1, administration=Intravenoso, observation=OV1. So o fileUrl mudou.
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

### 6 modulos: o GET ignora o filtro de atendimento mas o campo pages conta filtrado

- **Rota:** `GET /reproduction-breeding-intermediate, /reproduction-breedingPregnancy, /reproduction-donor-insemination, /reproduction-receptor-inovulation, /reproduction-receptor-monitoring, /reproduction-stallion-collection`
- **Impacto:** Nesses 6 repositorios o fetchByAnimalId filtra so por animalId enquanto o count filtra por animalId+appointmentAnimalId. Resultado: a ficha do atendimento A mostra tambem os registros do atendimento B (mistura prontuario de atendimentos distintos, risco clinico direto) e o pages sai incoerente com a lista (ja observei pages=0 com 2 itens no array), quebrando a paginacao da tela. Arquivos: src/infra/shared/database/prisma/repositories/reproduction/prismaReproductionBreedingIntermediate.repository.ts e os 5 analogos - o where do findMany nao tem appointmentAnimalId, o do count tem.
- **Reprodução:** 1) POST /reproduction-breedingPregnancy/660f537b-590a-48de-ab84-546255bb7d09 {"observation":"PREG-AA1",...} e POST /reproduction-breedingPregnancy/e48c87b4-6d9d-48ee-93e6-422699e7ef9d {"observation":"PREG-AA2",...} (dois appointmentAnimals diferentes do mesmo animal). 2) GET /reproduction-breedingPregnancy?page=1&animalId=e09485b9-...&appointmentId=660f537b-... -> OBSERVADO 200 com ["PREG-AA2","PREG-AA1"] e pages=1 (deveria trazer so PREG-AA1). 3) GET ...&appointmentId=12f3c686-a15c-42e8-8767-ee50f231e509 -> OBSERVADO 200 com ["PREG-AA2","PREG-AA1"] e pages=0 (lista cheia com pages=0). Contraste com modulo sao: GET /general-info?...&appointmentId=660f537b-... -> ["FICHA-AA1"] pages=1.
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

### PUT /payment altera a movimentacao mas nao atualiza nenhuma parcela (nome, valor, quantidade, tipo, categoria)

- **Rota:** `PUT /payment/:paymentId`
- **Impacto:** Cabecalho da movimentacao e caixa contam historias diferentes. Despesa editada para receita continua entrando no caixa com sinal errado, relatorio por categoria fica na categoria antiga e o valor total nao bate com a soma das parcelas. Evidencia extra: GET /transaction/statistics mostra a movimentacao ja OUTCOME aparecendo como incoming de R$100 em marco, abril e maio.
- **Reprodução:** POST /payment {name:'Edit3x F2',amount:300,quantity:3,isTotalValue:true,type:'INCOME',categoryId:<CATI>,firstDueDate:'2026-03-05',status:'PENDING'} -> 201, 3 parcelas de 100. PUT /payment/<id> {quantity:6,amount:600,name:'Edit6x F2'} -> 200. SQL: select count(*),sum(value) from transactions where "paymentId"=<id> -> 3|300 (deveria ser 6|600); select name,amount,quantity from sheduled_payments -> Edit6x F2|600|6. Depois PUT /payment/<id> {type:'OUTCOME',categoryId:<CATO>} -> 200; SQL nas parcelas -> Edit3x F2|INCOME|<CATI> (nome, tipo e categoria antigos).
- **Módulo:** F2-financeiro (/transaction, /transact

### GET /transaction?clientId= nao retorna nada - filtro so olha o caminho legado appointmentAnimal

- **Rota:** `GET /transaction`
- **Impacto:** Ignora Payment.clientId (o campo escolhido no formulario de movimentacao) e Payment.animal.clientId. O PrismaPaymentRepository trata os tres caminhos; so o de transaction ficou pela metade. O extrato por cliente sempre vem vazio.
- **Reprodução:** GET /transaction?page=1&clientId=40c45f21-... -> {"transactions":[],"pages":0}. SQL: select count(*) from transactions t join sheduled_payments p on p.id=t."paymentId" where p."clientId"='40c45f21-...' -> 14. Codigo: prismaTransaction.repository.ts:143-151 monta where.Payment = {appointmentAnimal:{animal:{clientId}}} apenas.
- **Módulo:** F2-financeiro (/transaction, /transact

### GET /transaction/statistics?animalId= sempre retorna zero

- **Rota:** `GET /transaction/statistics`
- **Impacto:** A tela de custo por animal fica sempre zerada quando o vinculo foi feito direto na movimentacao (que e o caminho do formulario atual).
- **Reprodução:** GET /transaction/statistics?startDate=2026-01-01&endDate=2026-12-31&animalId=7407398a-... -> totalIncome 0, totalOutcome 0, totalIncoming 0, totalOutgoing 0. A movimentacao 'Parcelado 12x F2' (12 parcelas, 1 paga de R$100) tem animalId=7407398a-... Codigo: prismaTransaction.repository.ts:99-107 so casa por Payment.appointmentAnimal.animal.id, ignorando Payment.animalId.
- **Módulo:** F2-financeiro (/transaction, /transact

## OUTROS

### DELETE /user/:userId devolve 500 para qualquer veterinario que ja tenha atendido

- **Rota:** `DELETE /user/:userId`
- **Impacto:** 54 FKs para users sao ON DELETE RESTRICT (appointments, notes, reminders, general_*, orthopedic_*, reproduction_*, dentistry_*) e o service deleteUser nao checa vinculo antes de apagar. Na pratica a funcao so funciona para usuario que nunca fez nada. A mensagem generica nao diz o motivo, e a vaga do plano nunca libera.
- **Reprodução:** 1) POST /appointment {"type":"SERVICE","startDate":"2026-08-05T13:00:00.000Z","endDate":"2026-08-05T14:00:00.000Z","userId":"76c0e458-0ab9-403b-97c5-b1812cd53794","studFarmId":"4c0339d1-8c48-4e61-befc-97e8c88931d6","animals":[{"animalId":"51921974-1315-4d29-9a5b-1b47a8035c0f","appointmentType":"Consulta"}]} -> 201. 2) DELETE /user/76c0e458-0ab9-403b-97c5-b1812cd53794 com token do admin -> 500 INTERNAL_SERVER_ERROR. 3) SQL: SELECT COUNT(*) FROM users WHERE id='76c0e458-...' -> 1 (nada excluido). Usuario sem nenhum vinculo e excluido normalmente (200).
- **Módulo:** F1 - acesso e conta (user, company, pa

### PUT /animal/:id regenera o code do animal a cada edicao, invalidando todo convite ja entregue

- **Rota:** `PUT /animal/:id`
- **Impacto:** Todo codigo de vinculo ja entregue a um proprietario para de funcionar em GET /animal/:code e POST /animal/register/:code assim que a clinica editar qualquer coisa do animal - inclusive um PUT vazio.
- **Reprodução:** POST /animal -> code wet2hv0u. PUT /animal/:id {name} -> code lxeg724z. PUT de novo -> cfuqqnge. PUT de novo -> x2usowxo. PUT com CORPO VAZIO {} -> tbztgsiq. Testei os outros dois modulos no mesmo cenario: PUT /stud-farm mantem o code (64Hq41eMIG nas 3 leituras) e PUT /client mantem o code. O defeito e exclusivo do animal. Codigo: animal.service.ts:193-195, 'if (safeCompanyId) { animal.code = generateRandomString(8); }' dentro do edit.
- **Módulo:** F1 - cadastros base: cliente, propried

### DELETE /client/:clientId devolve 500 quando o cliente tem animal - a exclusao simplesmente nao funciona

- **Rota:** `DELETE /client/:clientId`
- **Impacto:** Excluir cliente com animal nunca funciona e o usuario nao descobre o porque - a mensagem e generica. Se o bloqueio for intencional, deveria ser 409 dizendo 'este cliente tem N animais cadastrados'.
- **Reprodução:** POST /client {"name":"DelAN"}; POST /animal {clientId:<DelAN>}; DELETE /client/<DelAN> -> 500 'Nao foi possivel concluir a operacao...'; GET /client?page=1&query=DelAN -> 200, o cliente continua la. Isolei a causa comparando: cliente SEM nenhum vinculo -> DELETE 200 e some da lista; cliente SO com propriedade -> DELETE 200; cliente COM animal -> 500. A FK animals_clientId_fkey e ON DELETE RESTRICT e o service nao checa o vinculo antes, entao o erro do Prisma vaza como 500 generico.
- **Módulo:** F1 - cadastros base: cliente, propried

### /note e /reminder: qualquer usuario da empresa edita e apaga anotacao/lembrete de um colega que ele nem consegue listar

- **Rota:** `PUT /note/:id, DELETE /note/:id, PUT /reminder/:id, DELETE /reminder/:id`
- **Impacto:** Perda silenciosa de dado: a API responde 200 sucesso ao apagar anotacao/lembrete privado de outro veterinario da clinica.
- **Reprodução:** fetch/count/fetchByDate filtram por userId+companyId (cada usuario so ve o que e dele), mas edit/delete autorizam SO por companyId. Criei um 2o usuario na mesma empresa via POST /user. Com o token dele: GET /note?page=1 -> 200 {"notes":[],"pages":0} (nao ve nada); PUT /note/6d1c5618-2fd4-46ac-b4c1-a229d7ee4b13 {"name":"EDITADA POR OUTRO USUARIO"} -> 200 OBSERVADO e o SQL mostra o name trocado; DELETE /note/6d1c5618-... -> 200 e select count(*) from notes where id='6d1c5618-...' -> 0. Identico em /reminder: GET /reminder?page=1 -> {"reminders":[],"pages":0}; DELETE /reminder/478fcfb1-d3a0-4091-b3fa-df2bd050c9a5 -> 200; count no banco -> 0.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

## SEGURANCA / ISOLAMENTO

### GET /appointment/client vaza CPF, e-mail e telefone de outros clientes

- **Rota:** `GET /appointment/client`
- **Impacto:** Dado pessoal (CPF, e-mail, telefone) de um cliente exposto a outro cliente pelo app. Origem: appointment.controller.ts:216 chama fetchAppointments({companyId: undefined, clientId}); o whereFilter usa animals:{some:{animal:{clientId}}} — filtra o atendimento mas nunca poda a lista de animais retornada. Basta um atendimento compartilhado (rotina em haras com varios donos) para vazar.
- **Reprodução:** 1) POST /client/token {"clientId": <ClienteB>} -> token de cliente. 2) GET /appointment/client?page=1 com esse token -> 200. Nos atendimentos 1997524e e 3099e505 (que tem um animal do ClienteB e dois do ClienteA) vieram os animais do ClienteA com o objeto client completo: nome, cpf 01855225131, email clienteaf11477334@t.com e telefone. O ClienteB nunca deveria ver isso.
- **Módulo:** atendimentos (/appointment + /appointm

### Usuario excluido continua com acesso total (leitura e escrita) a API por ate 90 dias

- **Rota:** `DELETE /user/:userId + todas as rotas autenticadas`
- **Impacto:** O JWT nao tem revogacao nem checagem de existencia do usuario no guard. Demitir alguem no painel nao corta o acesso: o ex-funcionario le e altera clientes, animais, fichas e financeiro por 3 meses. Apenas GET /company e PATCH /user/token devolvem 404 (esses dois consultam o banco); o resto do sistema nao.
- **Reprodução:** 1) POST /user/signin com f1u4.1785691476@teste.com -> 201, guarde o token T4. 2) DELETE /user/5e072d97-8ad7-42f6-8597-31e33e19e08f com token do admin -> 200 (usuario some do banco). 3) POST /user/signin com o mesmo email -> 401 (ok). 4) GET /user com Bearer T4 -> 200 + lista da equipe. 5) GET /client?page=1 com Bearer T4 -> 200 + lista de clientes. 6) PUT /client/23e0a56a-9a29-415a-9f06-0418156df5b9 com Bearer T4 body {"name":"Alterado Por Excluido"} -> 200; GET /client/cpf/14026245225 confirma que GRAVOU. Token: iat 1785691807 / exp 1793467807 = 90 dias.
- **Módulo:** F1 - acesso e conta (user, company, pa

### Qualquer empresa ou cliente sequestra o animal de outro tenant via POST /animal/register/:code

- **Rota:** `POST /animal/register/:code`
- **Impacto:** A empresa e o cliente originais PERDEM o animal por completo - some da listagem e da 404 no by-id. Basta acertar um code de 8 caracteres. Perda de dado + vazamento + escrita cruzada entre tenants.
- **Reprodução:** 1) Empresa A cria animal Trovao -> code 9imrh6yv, companyId b6cf7eee. 2) Empresa B (token totalmente alheio): POST /animal/register/9imrh6yv -> 201. 3) Empresa A: GET /animal?page=1&query=Trovao -> 200 {"animals":[],"pages":0}. 4) Empresa A: GET /animal/by-id/cee34143... -> 404. 5) Empresa B: GET /animal?page=1 -> Trovao aparece com companyId 32711d70. Repeti com token de CLIENTE alheio (Cli App) e ele virou o DONO (clientId). Banco: animals cee34143 -> companyId=32711d70 (empresa B), clientId=1ec297e4 (cliente alheio). Codigo: animal.service.ts registerByCode faz animal.companyId=companyId e animal.clientId=clientId sem checar posse. Agrava: GET /animal/:code devolve o animal completo de qualquer tenant (200), permitindo confirmar o code antes do roubo.
- **Módulo:** F1 - cadastros base: cliente, propried

### Propriedade sem cliente e visivel E editavel por TODAS as empresas (furo de tenant confirmado)

- **Rota:** `GET /stud-farm, PUT /stud-farm/:id`
- **Impacto:** Vaza dado cadastral de cliente (endereco e telefone do responsavel) entre tenants e permite escrita cruzada. Chega ali por dois caminhos normais de uso: cadastrar propriedade sem cliente, ou excluir um cliente.
- **Reprodução:** Caminho 1 (cadastro sem cliente, que e opcional no form): A faz POST /stud-farm {"name":"Haras Sem Dono F1"} -> 201. B faz GET /stud-farm?page=1 -> 200 e a propriedade de A aparece. B faz PUT /stud-farm/<id> {"name":"ORFA SEQUESTRADA POR B","city":"HackCity"} -> 200. Caminho 2 (pior, dados reais): A cria cliente + POST /stud-farm {"name":"CADEIA HARAS SIGILOSO","city":"Bauru","address":"Fazenda secreta","responsibleName":"Fulano","responsiblePhone":"11988112233"}. B: GET /stud-farm?page=1&query=CADEIA -> {"studFarms":[],"pages":0} (isolado, ok). A: DELETE /client/<id> -> 200 (FK ON DELETE SET NULL deixa a propriedade orfa). B: GET /stud-farm?page=1&query=CADEIA -> 200 devolve a propriedade INTEIRA com endereco, cidade, responsavel e telefone. B: PUT -> 200. Banco confirma: 97519ddd|ROUBADA|00000000000|clientId NULL e 38ab51e0|ORFA SEQUESTRADA POR B|clientId NULL. Codigo: prismaStudFarm.repository.ts companyScope, ramo AND:[{clientId:null},{ClientStudFarm:none},{Animal:none},{Appointment:none}].
- **Módulo:** F1 - cadastros base: cliente, propried

### Codigo de recuperacao de senha do cliente e reutilizavel indefinidamente

- **Rota:** `PUT /client/password-code`
- **Impacto:** Quem vir o codigo uma unica vez (e-mail encaminhado, print, log) mantem acesso permanente para trocar a senha da conta do proprietario quantas vezes quiser, sem limite de tempo.
- **Reprodução:** Code 942bnd (6 caracteres) lido do banco. PUT /client/password-code {code:'942bnd',password:'SenhaAAA111'} -> 200. POST /client/auth SenhaAAA111 -> 201. PUT /client/password-code {code:'942bnd',password:'SenhaBBB222'} -> 200 (MESMO code). POST /client/auth SenhaBBB222 -> 201. POST /client/auth SenhaAAA111 -> 401 (prova que trocou de novo). SELECT count(*) recover_password_codes -> 1 (a linha continua intacta, nao e queimada nem marcada como usada).
- **Módulo:** F1 - cadastros base: cliente, propried

### POST /lead aceita boardId de outra empresa (e 500 com fase inexistente): lead some do funil

- **Rota:** `POST /lead`
- **Impacto:** Lead criado desaparece do funil permanentemente. Nao houve vazamento de leitura (o fetch filtra por companyId), mas ha gravacao cruzada entre empresas.
- **Reprodução:** POST /lead com boardId=9800ed86-2544-4446-8825-51d61a9f6048 (fase da empresa f4e2f01e-...) -> HTTP 201 com o lead criado. SQL: SELECT id,name,"companyId" FROM leads WHERE "boardId"='9800ed86-...' mostra meu lead 'Hack' (companyId 143b32a1-...) misturado com dois leads da outra empresa. Meu GET /board nao devolve essa fase, entao o lead nunca aparece em nenhuma coluna do meu kanban, embora apareca em GET /lead?filter=all. Com boardId inexistente (00000000-0000-4000-8000-000000000000) -> 500; com boardId 'abc' -> 500. Causa: lead.service.ts::create recebe o BoardRepository injetado e nunca o usa. PUT /lead faz a validacao certa (403).
- **Módulo:** F2 - estoque e CRM

### POST /owner-note/:appointmentAnimalId nao valida o atendimento: escrita cross-tenant, vazamento para o app do proprietario de outra clinica e bloqueio permanente do registro

- **Rota:** `POST /owner-note/:appointmentAnimalId`
- **Impacto:** Vaza dado clinico de uma clinica para o proprietario cliente de outra clinica e trava permanentemente a Anotacao para o proprietario do atendimento atacado.
- **Reprodução:** OwnerNoteService.upsert valida SO o animalId do body contra o companyId do token; o appointmentAnimalId da URL (chave @unique) nunca e verificado. Com token da empresa A: POST /owner-note/bf8b6789-37a0-439f-8ba4-15c482532b47 (appointmentAnimal da empresa B) body {"animalId":"4a8c28dd-... (animal da A)","userId":"b0a3a051-...","description":"TEXTO DA EMPRESA A INJETADO NO ATENDIMENTO DA B"} -> 201 OBSERVADO, com ownerNote.companyId=5811c210 (empresa A) gravado no atendimento da B. SQL: select "companyId",description from owner_notes where "appointmentAnimalId"='bf8b6789-...' confirma. Depois: (1) GET /client-portal/appointment/bf8b6789-... com token do CLIENTE da empresa B -> 200 devolvendo o texto da empresa A (hasContent:true); (2) POST /owner-note/bf8b6789-... com token B -> 403 e GET com token B -> 403, ou seja a empresa B nunca mais grava nem le a anotacao do proprio atendimento e nao tem rota para remover o intruso. Reproduzido tambem contra a empresa demo f4e2f01e (appointmentAnimal e93b966f); esse registro foi removido apos o teste.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### POST /payment aceita categoryId de outra empresa: trava a parcela e contamina o relatorio do outro tenant

- **Rota:** `POST /payment`
- **Impacto:** PaymentService.ownsLinks valida animalId/clientId/appointmentAnimalId mas nao valida categoryId (TransactionService.assertOwnedRefs valida). Resultado: lancamento da minha clinica aparece no relatorio por categoria da outra clinica (fetchWithValue filtra a categoria por companyId mas nao filtra a transacao), e a parcela criada fica permanentemente sem poder ser baixada nem corrigida pela API.
- **Reprodução:** POST /payment {name:'CrossCatPay',amount:100,type:'INCOME',quantity:1,isTotalValue:true,firstDueDate:'2026-08-10',status:'PENDING',categoryId:'6acaa024-...'} (categoria da empresa f4e2f01e) -> 201. SQL: select "transactionCategoryId" from sheduled_payments where name='CrossCatPay' -> 6acaa024-... GET /payment?query=CrossCatPay -> category.name='Faturas recebidas' (nome da categoria da outra clinica). (a) PUT /transaction/<txCrossCatPay> {status:'PAID',paymentDate:'2026-08-10'} -> 403 NOT_ALLOWED: a parcela fica ineditavel para o proprio dono, porque transaction.edit valida a posse da categoria atual. (b) SQL replicando fetchWithValue da outra empresa: select c.name,c."companyId",t.name,t.value,p."companyId" from transaction_categories c join transactions t on t."transactionCategoryId"=c.id join sheduled_payments p on p.id=t."paymentId" where c."companyId"='f4e2f01e-...' and t."paymentDate" between '2026-08-01' and '2026-08-31' -> Faturas recebidas|f4e2f01e-...|CrossCatPay|100|786bdedd-... (MINHA empresa).
- **Módulo:** F2-financeiro (/transaction, /transact

### Token de admin desativado (ou ate apagado do banco) continua com acesso total ao painel por 90 dias

- **Rota:** `todas as 38 rotas protegidas so por AdminAuthGuard`
- **Impacto:** Desligar um admin nao desliga nada. Ex-funcionario mantem acesso a precos, empresas, assinaturas e financeiro por ate 90 dias e nao existe rota de revogacao.
- **Reprodução:** 1) POST /admin/admins cria suporte.f2@teste.com (role support); guarda o accessToken do signin. 2) PATCH /admin/admins/74cf705f-b69e-4ae3-8410-6d1547973b99 {"active":false} -> 200, active=false no banco. 3) Com o token ANTIGO: GET /admin/auth/me -> 401 (essa checa), mas GET /admin/users -> 200 (lista os 40 usuarios), POST /admin/plans -> 201 (criou plano), DELETE /admin/plans/<id> -> 200 (apagou plano). 4) docker exec vetequus-local psql -c "delete from admin_users where id='74cf705f-...'" e o MESMO token ainda devolve GET /admin/financial/summary -> 200 {"revenueMonth":0,"revenuePreviousMonth":0,"activeSubscriptions":5,"trialSubscriptions":13} e GET /admin/companies -> 200. Causa: AdminAuthGuard (src/infra/shared/auth/admin-auth.guard.ts) so verifica assinatura do JWT e payload.type==='admin', nunca consulta admin_users. JWT valido por 90 dias (iat 1785692226 / exp 1793468226).
- **Módulo:** Painel interno Equinology (/admin/*) -

### Role support tem poder de super_admin em tudo que importa: cria/apaga planos, cria usuario em qualquer empresa, mexe em billing e le o financeiro

- **Rota:** `38 das 40 rotas de /admin/*`
- **Impacto:** A separacao de papeis so protege a criacao de outros admins. Support altera preco do produto, cria conta ADMIN em empresa de cliente, cancela/cobra/troca plano de assinatura e le o faturamento inteiro.
- **Reprodução:** Apenas POST /admin/admins e PATCH /admin/admins/:id usam AdminSuperAdminGuard. Com token de admin role=support, HTTP observado: POST /admin/admins 403; PATCH /admin/admins/:id 403; GET /admin/admins 200 (lista todos os admins e emails do painel); GET /admin/users 200 (40 usuarios de todas as empresas); POST /admin/users 201 (criou usuario em empresa arbitraria, role a escolha); GET /admin/companies 200; GET /admin/signature 200; GET /admin/coupons 200; GET /admin/ads 200; GET /admin/tutorials 200; GET /admin/financial/summary 200; GET /admin/financial/transactions 200 (todas as transacoes de todas as empresas); POST /admin/plans 201 e DELETE /admin/plans/:id 200 (comprovado com o mesmo token support).
- **Módulo:** Painel interno Equinology (/admin/*) -

### GET /appointment/client entrega nome, e-mail, telefone, CPF e valores financeiros do OUTRO proprietário (LGPD)

- **Rota:** `GET /appointment/client`
- **Impacto:** Vazamento de dado pessoal sensível (CPF, e-mail, telefone, endereço da propriedade) e financeiro (valor cobrado) entre clientes distintos da mesma clínica, sem nenhuma ação especial — basta o app abrir a agenda. Causa: prismaAppointment.repository.ts whereFilter usa animals:{some:{animal:{clientId}}} para filtrar o ATENDIMENTO, mas AppointmentDetailsPresenter serializa TODOS os appointmentAnimals, e AnimalDetailsPresenter chama ClientPresenter (que expõe cpf/email/phone/code) e PaymentDetailsPresenter (amount/transactions). Também vaza o 'code' do outro cliente, usado por POST /client/link. As demais rotas do portal (/client-portal/*, /client-invoice, /client-payment) estão corretas — o buraco é exclusivo desta.
- **Reprodução:** 1) Com token da clínica: POST /appointment {type:'SERVICE', startDate, endDate, userId, studFarmId, animals:[{animalId:<animal do dono A>,appointmentType:'Consulta'},{animalId:<animal do dono B>,appointmentType:'Consulta'}]} -> 201. 2) POST /client/auth {email:<dono A>, password:<CPF do dono A>} -> 201, accessToken. 3) GET /appointment/client?page=1 com o token do Dono A -> 200. A resposta traz o appointmentAnimal do Dono B integralmente. JSON exato recebido: {"id":"4176aebe-d38c-4d0f-9b17-9729d7a8bdd0","name":"Cavalo B","studFarm":{"name":"Haras B","address":"Rua B","clientId":"72648a45-680b-4859-994f-126846925779"},"client":{"id":"72648a45-680b-4859-994f-126846925779","name":"Dono B SEGREDO","email":"f3donoB1785693423905@teste.com","phone":"11922222222","cpf":"75561435540","code":"20af249d-f72c-472d-8661-925db62c6778"}} e, no mesmo item, "payment":{"name":"PAG-B-SEGREDO","amount":7777,"clientId":"72648a45-680b-4859-994f-126846925779","transactions":[{"name":"PAG-B-SEGREDO","value":7777,"status":"PENDING"}]}. O vazamento é simétrico: o token do Dono B devolve os mesmos campos do Dono A.
- **Módulo:** F3 - Portal do cliente / app do propri

# GRAVE

## ATENDIMENTO

### UUID malformado devolve 500 cru em 8 rotas do conjunto

- **Rota:** `varias (/appointment e /appointment-animal)`
- **Impacto:** Nenhum ParseUUIDPipe nos @Param('id'); o erro do Prisma vaza como 500 generico. A checagem de existencia funciona, so nao cobre o formato.
- **Reprodução:** GET /appointment/details/abc -> 500; PUT /appointment/abc -> 500; DELETE /appointment/abc -> 500; POST /appointment/abc/reschedule -> 500; GET /appointment-animal/details/abc -> 500; PUT /appointment-animal/abc -> 500; PUT /appointment-animal/details/abc -> 500; GET /appointment-animal?page=1&animalId=abc -> 500. Com UUID valido inexistente todas devolvem 404 limpo.
- **Módulo:** atendimentos (/appointment + /appointm

### PUT /appointment-animal/:id e /details/:id nao validam nada no corpo (DTO existe e nao e usado)

- **Rota:** `PUT /appointment-animal/:id e PUT /appointment-animal/details/:id`
- **Impacto:** appointmentAnimal.controller.ts:19 usa @Body() body: EditBodyProps — um type do TypeScript, que some em runtime. O DTO AnimalAppointmentDto com IsEnum e MaxLength(100) existe em appointmentAnimal.dto.ts e nunca e referenciado. Resultado: 500 para entrada errada e a mesma coluna appointmentType aceita 300 chars aqui e e cortada em 100 no POST /appointment. Alem disso da para marcar o animal como RESCHEDULED sem existir reagendamento e sem rescheduledTo.
- **Reprodução:** PUT /appointment-animal/539740e5-... {"status":"BANANA"} -> 500. {"status":123} -> 500. {"appointmentType":999} -> 500. {"appointmentType":"x" repetido 300 vezes} -> 200 e o GET details devolve os 300 caracteres gravados. {"status":"RESCHEDULED"} -> 200 e grava.
- **Módulo:** atendimentos (/appointment + /appointm

### Query param state de GET /appointment-animal e status disfarcado; mandar UF derruba a rota

- **Rota:** `GET /appointment-animal`
- **Impacto:** prismaAppointmentAnimal.repository.ts:118 faz status: data.state as AppointmentStatus. O nome state, ao lado de city/breed/gender (todos atributos do animal/propriedade), induz o front a mandar a UF — e qualquer chamada com state=SP cai com 500.
- **Reprodução:** GET /appointment-animal?page=1&state=SP -> 500. GET /appointment-animal?page=1&state=PENDING -> 200 n=10. GET /appointment-animal?page=1&state=RESCHEDULED -> 200 n=4.
- **Módulo:** atendimentos (/appointment + /appointm

### Paginacao com page menor ou igual a zero vira skip negativo e devolve 500

- **Rota:** `GET /appointment/fetch e GET /appointment-animal`
- **Impacto:** @IsNumberString aceita '0' e '-1' e nao ha Min(1); o skip negativo estoura no Prisma.
- **Reprodução:** GET /appointment/fetch?page=0 -> 500. GET /appointment/fetch?page=-1 -> 500. GET /appointment-animal?page=-1 -> 500. (page=99 devolve 200 com lista vazia, correto.)
- **Módulo:** atendimentos (/appointment + /appointm

### GET /appointment/monthly aceita mes fora de 1..12 e devolve 500

- **Rota:** `GET /appointment/monthly`
- **Impacto:** Sem Min(1)/Max(12) no DTO; moment.utc('2026-13-01') fica invalido e a query estoura. Navegacao de calendario que passe do limite do ano derruba a agenda.
- **Reprodução:** GET /appointment/monthly?month=13&year=2026 -> 500. GET /appointment/monthly?month=0&year=2026 -> 500. GET /appointment/monthly?month=abc&year=2026 -> 400 com mensagem clara.
- **Módulo:** atendimentos (/appointment + /appointm

### endDate anterior ao startDate e aceito e gravado em POST, PUT e reschedule

- **Rota:** `POST /appointment, PUT /appointment/:id, POST /appointment/:id/reschedule`
- **Impacto:** Atendimento com duracao negativa entra na agenda e aparece normalmente em daily, monthly e fetch. Nenhuma validacao cruzada entre as duas datas em nenhuma das tres rotas.
- **Reprodução:** POST /appointment {"startDate":"2026-10-10T13:00:00Z","endDate":"2026-10-01T14:00:00Z"} -> 201. POST /appointment/1997524e-.../reschedule {"startDate":"2026-11-20T13:00:00Z","endDate":"2026-11-01T14:00:00Z"} -> 201. SQL: SELECT id,"startDate","endDate" FROM appointments WHERE "endDate" < "startDate" -> 2 linhas (13b6ec7d e 28cc18f1).
- **Módulo:** atendimentos (/appointment + /appointm

### Token de cliente derruba as listagens da clinica com 500 em vez de 403

- **Rota:** `GET /appointment/fetch, /daily, /monthly, /appointment-animal`
- **Impacto:** O JWT de cliente traz companyId: 'no-company', que vai direto para o where como uuid. Nao ha vazamento (a query nao casa), mas o app do cliente batendo em rota errada gera 500 em vez de negacao limpa.
- **Reprodução:** Com token obtido em POST /client/token: GET /appointment/fetch?page=1 -> 500; GET /appointment/daily?day=2026-07-15 -> 500; GET /appointment/monthly?month=7&year=2026 -> 500; GET /appointment-animal?page=1 -> 500. As rotas por id, em contraste, devolvem 403 corretamente.
- **Módulo:** atendimentos (/appointment + /appointm

### Filtros city e breed de GET /appointment-animal sao case-sensitive e exact match

- **Rota:** `GET /appointment-animal`
- **Impacto:** Sem mode: 'insensitive' no repositorio. O filtro equivalente de appointmentType em /appointment/fetch usa insensitive e funciona nos dois casos — as duas listagens se comportam diferente para o mesmo tipo de busca.
- **Reprodução:** GET /appointment-animal?page=1&city=Campinas -> n=3; city=campinas -> n=0. breed=Mangalarga -> n=10; breed=mangalarga -> n=0.
- **Módulo:** atendimentos (/appointment + /appointm

### GET /appointment-animal nao valida query params: startDate com texto livre devolve 500

- **Rota:** `GET /appointment-animal`
- **Impacto:** O controller usa @Query('startDate') startDate?: string sem DTO nenhum; nada e validado antes de virar new Date() e ir para o Prisma.
- **Reprodução:** GET /appointment-animal?page=1&startDate=abc -> 500. O mesmo caso em /appointment/fetch?page=1&startDate=abc (que tem DTO) -> 400 'Informe uma data valida no campo startDate.'
- **Módulo:** atendimentos (/appointment + /appointm

### PUT /appointment/:id aceita animals: [] e descarta em silencio

- **Rota:** `PUT /appointment/:id`
- **Impacto:** if (animals && animals.length > 0) em appointment.service.ts:227. Nao ha como remover todos os animais de um atendimento pela API, e ela responde sucesso como se tivesse removido.
- **Reprodução:** PUT /appointment/4ae92b3b-... {"animals": []} -> 200. GET /appointment/details/4ae92b3b-... -> os 2 animais continuam vinculados.
- **Módulo:** atendimentos (/appointment + /appointm

### Filtro status=RESCHEDULED e rejeitado em /appointment/fetch, mas o status existe no banco e aparece na outra listagem

- **Rota:** `GET /appointment/fetch`
- **Impacto:** O enum do Prisma tem 4 valores e o DTO de filtro so 3. Atendimentos reagendados sao invisiveis nesse filtro, e as duas listagens do mesmo dado divergem.
- **Reprodução:** GET /appointment/fetch?page=1&status=RESCHEDULED -> 400 'O campo status deve ser um destes valores: PENDING, IN_PROGRESS, FINISHED.' SQL: SELECT status,count(*) FROM appointment_animals ... GROUP BY status -> PENDING 21, RESCHEDULED 4. GET /appointment-animal?page=1&state=RESCHEDULED -> 200 n=4.
- **Módulo:** atendimentos (/appointment + /appointm

### owner-note grava a anotacao no animal errado: animalId nao e conferido contra o animal do atendimento

- **Rota:** `POST /owner-note/:appointmentAnimalId`
- **Impacto:** Orientacao clinica entra no historico do animal errado no app; com donos diferentes, o proprietario errado le o texto (fetchOwnerNotesByAnimal autoriza pelo animalId da nota, nao pelo animal do atendimento).
- **Reprodução:** POST /owner-note/3685c813-... (atendimento do animal 4a8c28dd Cavalo F2) com body animalId=1bff551e-... (outro animal da mesma empresa) -> 201 e ownerNote.animalId=1bff551e. SQL join owner_notes x appointment_animals mostra nota=1bff551e vs atendimento=4a8c28dd. Em seguida GET /client-portal/animal/1bff551e-.../owner-note com token do cliente -> 200 devolvendo a nota no historico de um animal que nunca teve atendimento.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### POST /owner-note com appointmentAnimalId inexistente devolve 500 (violacao de FK)

- **Rota:** `POST /owner-note/:appointmentAnimalId`
- **Impacto:** 500 em fluxo plausivel (atendimento apagado em outra aba).
- **Reprodução:** POST /owner-note/00000000-0000-4000-8000-000000000000 {"animalId":"4a8c28dd-...","userId":"b0a3a051-...","description":"x"} -> 500 INTERNAL_SERVER_ERROR OBSERVADO. Deveria ser 404. Mesma causa raiz do achado 1: o appointmentAnimal nunca e carregado antes do insert.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### 41/41: HTTP 500 cru para UUID malformado e para page <= 0

- **Rota:** `PUT /<41 rotas>/abc, DELETE /<41 rotas>/abc, GET /<41 rotas>?animalId=abc, GET ...&appointmentId=abc, GET ...?page=0, GET ...?page=-1`
- **Impacto:** Nenhuma das 123 rotas valida formato de UUID nem faixa de page. O erro do Postgres/Prisma (invalid input syntax for type uuid, OFFSET must not be negative) vaza como 500 generico com a mensagem 'Nao foi possivel concluir a operacao. Tente novamente em alguns instantes e, se o problema continuar, entre em contato com o suporte.' - incompreensivel para quem so digitou uma URL errada. page=0 e o pior caso: e o off-by-one mais comum de frontend e derruba a tela inteira com 500. Prova de que so falta a validacao de formato: com UUID BEM formado e inexistente o comportamento e correto (404 RESOURCE_NOT_FOUND).
- **Reprodução:** Testado nos 41 modulos com o mesmo resultado. Amostra general-info: PUT /general-info/abc {"observation":"x"} -> OBSERVADO 500; DELETE /general-info/abc -> OBSERVADO 500; GET /general-info?page=1&animalId=abc -> OBSERVADO 500; GET /general-info?page=1&animalId=e09485b9-...&appointmentId=abc -> OBSERVADO 500; GET /general-info?page=0&animalId=e09485b9-... -> OBSERVADO 500; GET /general-info?page=-1&animalId=e09485b9-... -> OBSERVADO 500. Comparar: DELETE /general-info/00000000-0000-0000-0000-000000000000 -> OBSERVADO 404 RESOURCE_NOT_FOUND (correto).
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

### O parametro appointmentId do GET so casa com appointmentAnimalId, e o GET nunca devolve esse id

- **Rota:** `GET /<41 rotas de ficha>?page&animalId&appointmentId`
- **Impacto:** Nos 35 modulos em que o filtro funciona o where e 'appointmentAnimalId: data.appointmentId': o parametro chamado appointmentId tem que receber o id do appointment_animal, nao o id do atendimento. Passando o id real do atendimento a resposta e 200 com lista vazia e pages 0 - a tela abre em branco sem nenhum erro visivel. Agrava: NENHUM dos 41 presenters devolve appointmentAnimalId (verificado nos 41 arquivos em src/infra/http/presenters/), apesar da coluna existir no banco, entao o cliente nao consegue nem descobrir a qual atendimento cada ficha pertence. Marcado SUSPEITO porque nao consegui confirmar o que o frontend envia (nenhum dos repos adm/app/web referencia essas rotas hoje). Se o frontend passar o id do atendimento, isto vira BLOQUEIA em 35 modulos: toda ficha some da tela.
- **Reprodução:** GET /general-info?page=1&animalId=e09485b9-6862-4569-8741-0cfda6fcc71a&appointmentId=12f3c686-a15c-42e8-8767-ee50f231e509 (id do appointment) -> OBSERVADO 200 com [] e pages=0. GET /general-info?page=1&animalId=e09485b9-...&appointmentId=660f537b-590a-48de-ab84-546255bb7d09 (id do appointment_animal) -> OBSERVADO 200 com ["FICHA-AA1"] e pages=1. E: nenhuma resposta de GET dos 41 modulos contem a chave appointmentAnimalId (verificado com 'appointmentAnimalId' in registro -> false).
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

## CLINICO

### PUT /deworming/:id devolve 400 se o front não repetir o id no corpo (quebra o padrão dos irmãos)

- **Rota:** `PUT /deworming/:id`
- **Impacto:** Edição de vermifugação só funciona para quem descobrir a exigência não documentada e inconsistente com as outras fichas.
- **Reprodução:** PUT /deworming/8cb3c660-04bb-4212-92a6-41a014765209 {"name":"Verm B"} -> 400 ["O campo Vermifugação é obrigatório","Escolha uma Vermifugação válida"]. Com {"dewormingId":"8cb3c660-...","name":"Verm B"} -> 200. EditDewormingDto.dewormingId é @IsNotEmpty enquanto EditVaccineDto.vaccineId e EditExamDto.examId são @IsOptional; o controller usa @Param('id') e ignora o campo do corpo de qualquer jeito.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### Valor de enum inválido derruba a rota com 500 (DTO valida só @IsString, coluna é enum Prisma)

- **Rota:** `POST /shoeing, PUT /shoeing/:id, GET /shoeing/:animalId, POST /sanitary-protocol/item, PUT /sanitary-protocol/:protocolId`
- **Impacto:** Mensagem genérica de suporte em vez de 400 explicando os valores aceitos. O caso do filtro type na listagem é o pior: um link salvo com typo derruba a tela de ferrageamento inteira.
- **Reprodução:** POST /shoeing {"type":"BANANA","animalId":"<id>","date":"2026-01-15"} -> 500. POST /shoeing {"type":"trimming",...} (só caixa errada) -> 500. PUT /shoeing/<id> {"type":"XPTO"} -> 500. GET /shoeing/<animalId>?page=1&type=BANANA -> 500. POST /sanitary-protocol/item {"protocolId":"<id>","name":"X","type":"BANANA","isRecurrent":true} -> 500. PUT /sanitary-protocol/<id> {"targetCategory":"BANANA"} -> 500. Enums envolvidos: ShoeingType, ProtocolItemType, ProtocolTargetCategory.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### page=0 e page=-1 devolvem 500 em todas as listagens do módulo

- **Rota:** `GET /vaccine/:animalId, GET /deworming/:animalId, GET /exam/:animalId, GET /shoeing/:animalId, GET /sanitary-protocol`
- **Impacto:** Entrada trivialmente alcançável (paginador em zero, link manipulado) derruba a listagem com erro genérico.
- **Reprodução:** GET /vaccine/<animalId>?page=0 -> 500; ?page=-1 -> 500. Mesmo 500 em /deworming/<id>?page=0, /exam/<id>?page=0, /shoeing/<id>?page=0 e /sanitary-protocol?page=0&studFarmId=<id>. Causa: skip:(page-1)*10 vira negativo e o Prisma rejeita. page=abc e page ausente são tratados corretamente com 400 — só o zero/negativo passa pelo @IsNumberString e explode.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### userId inexistente derruba a rota com 500 (violação de FK não tratada)

- **Rota:** `POST /vaccine, POST /shoeing`
- **Impacto:** Deveria ser 400/404 com mensagem ('Responsável não encontrado'); é 500 genérico.
- **Reprodução:** POST /vaccine {"name":"X","date":"2026-01-01","location":"L","animalId":"<meu animal>","userId":"00000000-0000-0000-0000-000000000000"} -> 500. POST /shoeing {"type":"SHOEING","animalId":"<id>","date":"2026-01-16","userId":"00000000-0000-0000-0000-000000000000"} -> 500. O UUID é bem formado, o usuário é que não existe.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### As duas fontes de anexo divergem quando a URL contem \n (separador do formato legado)

- **Rota:** `PUT/POST de qualquer ficha com anexo`
- **Impacto:** Consumidor que le a coluna escalar (o presenter devolve resultFileUrl/fileUrl cru, e o fallback legacyViews usa esse split) ve um anexo fantasma. Reverter a fase EXPAND traz o dado corrompido.
- **Reprodução:** PUT /exam/<id> {"attachments":[{"url":"https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf"}]} -> 200. GET /exam/<animalId>?page=1: campo attachments = 1 item; campo resultFileUrl = 'https://cdn/real.pdf\nhttps://cdn/INJETADO.pdf' que, pelo parser legado (split \n), vira 2 itens. AttachmentSyncService.resolve so faz url.trim(), nao rejeita quebra de linha interna.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### Anexo de ficha clinica fica publico e para sempre no storage; excluir a ficha nao apaga o arquivo

- **Rota:** `POST /file + DELETE de qualquer ficha`
- **Impacto:** Laudo, exame e receituario de paciente acessiveis sem autenticacao por qualquer pessoa que tenha ou adivinhe a URL (2^32 por nome previsivel, sem rate limit no R2). E 'apagar' no sistema nao apaga de fato.
- **Reprodução:** POST /file com PDF -> fullUrl publica no bucket pub-*.r2.dev. Vincular a uma ficha e DELETE da ficha: a linha some de attachments, mas curl <fullUrl> continua 200, sem token, de qualquer origem. grep -rn 'DeleteObjectCommand|deleteObject' src/ = 0 ocorrencias. Key = <slug-do-nome-original>-<8 hex>.<ext>, sem URL assinada e sem checagem de empresa.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### Path param com UUID malformado devolve 500 cru em todas as rotas de ficha

- **Rota:** `13 rotas de ficha (exam, owner-note, dentistry-exam, vaccine, deworming)`
- **Impacto:** Erro do Postgres (invalid input syntax for type uuid) vaza como INTERNAL_SERVER_ERROR. Falta ParseUUIDPipe. Qualquer link quebrado no front vira 500.
- **Reprodução:** Todas com 'abc' no lugar do uuid, token valido: GET /exam/abc?page=1 -> 500; PUT /exam/abc -> 500; DELETE /exam/abc -> 500; GET /owner-note/abc -> 500; POST /owner-note/abc -> 500; PUT /owner-note/record/abc -> 500; DELETE /owner-note/record/abc -> 500; GET /dentistry-exam?page=1&animalId=abc -> 500; POST /dentistry-exam/abc -> 500; DELETE /dentistry-exam/abc -> 500; GET /vaccine/abc?page=1 -> 500; DELETE /vaccine/abc -> 500; GET /deworming/abc?page=1 -> 500. Bonus: GET /exam/<animalId>?page=-1 -> 500 (skip negativo no Prisma). Controle: page=abc -> 400 correto, page=999 -> 200 vazio.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

## DINHEIRO / ASSINATURA

### Empresa sem assinatura vigente tem usuarios ilimitados e limit-info devolve numero incoerente

- **Rota:** `POST /user e GET /user/limit-info`
- **Impacto:** CompanyUserLimitService.checkCanAddUser retorna null (libera) quando nao ha assinatura vigente, e 'sem assinatura vigente' inclui trial expirado e plano cancelado/vencido. O limite some exatamente quando deveria apertar. Alem da burla comercial, a tela de plano vai exibir '16 de 0 usuarios'.
- **Reprodução:** 1) POST /user/register criando nova empresa e NAO chamar start-trial -> 201. 2) GET /user/limit-info -> {"currentUsers":1,"maxUsers":0,"planName":"Sem plano ativo","hasActiveSignature":false}. 3) POST /user 15 vezes -> 15x 201. 4) GET /user/limit-info -> {"currentUsers":16,"maxUsers":0}. Empresa de teste: 24d31ce9-76e6-4d65-a79f-1f70f2a913ae.
- **Módulo:** F1 - acesso e conta (user, company, pa

### calculate-upgrade mostra um preco e a cobranca sai outro (R$ 40 de diferenca)

- **Rota:** `GET /signature/calculate-upgrade vs POST /signature/upgrade/credit`
- **Impacto:** A tela promete um valor e o cartao e debitado com outro. Alem do atrito com o cliente, e problema de transparencia de preco.
- **Reprodução:** GET /signature/calculate-upgrade?planId=aaaaaaaa-0000-4000-8000-00000000f201&yearly=false -> newPlan.price 459.90, calculation.finalPrice 222.34. No mesmo instante POST /signature/upgrade/credit no mesmo plano -> {"finalPrice":262.34}, confirmado no Asaas (subscription value 262.34). Causa: calculateUpgrade usa newPlan.pixPrice mesmo para upgrade no cartao; processUpgradeWithCreditCard usa creditCardPrice.
- **Módulo:** F2-assinatura (signature, signature-pl

### Credito proporcional maior do que o cliente pagou (remainingRatio 1.0333)

- **Rota:** `GET /signature/calculate-upgrade e POST /signature/upgrade/*`
- **Impacto:** A clinica recebe de volta mais do que pagou e o erro vai direto para a cobranca real do upgrade, porque os dois processUpgrade* reusam o mesmo calculo.
- **Reprodução:** Assinatura mensal recem-paga: GET /signature/calculate-upgrade?planId=<pro>&yearly=false -> {"daysRemaining":31,"totalDays":30,"remainingRatio":1.0333,"currentPlanCredit":237.56} sobre um plano de 229,90. Codigo: totalDays fixo em 30/365 e daysRemaining com Math.ceil (linhas 735-746, replicado em 822-832 e 943-953).
- **Módulo:** F2-assinatura (signature, signature-pl

### Credito do plano atual sempre calculado por PIX, mesmo para quem pagou no cartao

- **Rota:** `GET /signature/calculate-upgrade, POST /signature/upgrade/credit, POST /signature/upgrade/pix`
- **Impacto:** Quem pagou no cartao tem o periodo restante valorizado pelo preco do PIX e perde dinheiro no upgrade — diferenca de 20 reais por mes de saldo no plano testado, proporcionalmente maior no anual.
- **Reprodução:** Assinatura paga no cartao (creditCardPrice 249,90): GET /signature/calculate-upgrade devolveu currentPlan.price 229.90 (que e o pixPrice). Codigo: linhas 743-746, 829-832 e 950-953 usam currentPlan.pixPrice sem olhar paymentType.
- **Módulo:** F2-assinatura (signature, signature-pl

### Cupom vira desconto vitalicio na recorrencia, nao e estornado e nao existe no upgrade

- **Rota:** `POST /signature/credit/new, POST /signature/pix/:planId`
- **Impacto:** Cupom de 50% aplicado no value da subscription reduz o preco de todos os meses seguintes, para sempre. Uso do cupom nao volta ao estorno e e consumido antes do pagamento PIX (permite queimar limite de uso sem pagar). Upgrade nao aceita cupom.
- **Reprodução:** POST /signature/credit/new com couponId do cupom QAF2PCT50 (50%) -> 201. Asaas GET /subscriptions/sub_qlwwkowe08r8sn62 -> {value: 124.95, cycle: 'MONTHLY'} sobre plano de 249,90. Depois PUT /signature/refound nessa assinatura -> 200, mas SQL mostra coupons.currentUsages ainda = 1. No fluxo PIX o incrementUsage acontece antes de existir pagamento (linhas 192-195). UpgradeWithNewCreditCardDto e UpgradeWithPixDto nao tem campo couponId.
- **Módulo:** F2-assinatura (signature, signature-pl

### installmentCount e validado no DTO e depois descartado em silencio

- **Rota:** `POST /signature/credit/new, POST /signature/credit/existing`
- **Impacto:** O cliente escolhe 12x, a API responde 201 e a cobranca sai a vista. Campo aceito e jogado fora sem aviso — exatamente o padrao 'controller aceita e esquece de repassar'.
- **Reprodução:** O DTO exige installmentCount >= 1 (POST com -5 -> 400 'Deve haver pelo menos uma parcela'), o service recebe o campo em newCreditCard/existingCreditCard, mas ele nao e usado em lugar nenhum: createSubscription e chamado sem parcelamento. A subscription criada no Asaas nao tem installment e nada e gravado no banco sobre parcelas.
- **Módulo:** F2-assinatura (signature, signature-pl

### UUID malformado devolve 500 cru em 6 rotas de assinatura

- **Rota:** `start-trial, cancel, refound, pix (couponId), upgrade/pix, calculate-upgrade`
- **Impacto:** Qualquer id malformado vindo do front (deep link quebrado, copiar/colar) derruba a rota com 500 em vez de 400. Ruido em monitoramento e mensagem inutil para o usuario.
- **Reprodução:** POST /signature/start-trial/abc -> 500; PUT /signature/cancel/abc -> 500; PUT /signature/refound/abc -> 500; POST /signature/pix/<plano> {"yearly":false,"couponId":"abc"} -> 500; POST /signature/upgrade/pix {"newPlanId":"abc","yearly":false} -> 500; GET /signature/calculate-upgrade?planId=abc&yearly=false -> 500; GET /signature/calculate-upgrade?yearly=false (sem planId) -> 500. couponId com string de 5000 chars tambem -> 500. Todos com o mesmo corpo generico INTERNAL_SERVER_ERROR.
- **Módulo:** F2-assinatura (signature, signature-pl

### Janela de reembolso nao dispara quando refoundDateLimit e NULL, e a rota estoura 500

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** A unica barreira de janela de reembolso simplesmente nao existe para trial e para assinatura PIX ainda nao paga (ambas nascem com refoundDateLimit NULL). Clinica em trial que clica em 'reembolsar' recebe 500 em uso normal.
- **Reprodução:** POST /signature/start-trial/33231be6-... -> trial com paymentId='trial' e refoundDateLimit NULL. PUT /signature/refound/0dbc57cb-4bfa-41b8-bd7c-e33416851005 -> 500 INTERNAL_SERVER_ERROR. Banco antes e depois identico (nada corrompido). Causa: linha 533, moment(null).isBefore(new Date()) devolve false, entao a guarda de janela nao barra e o fluxo segue ate tentar estornar o paymentId literal 'trial' no provedor.
- **Módulo:** F2-assinatura (signature, signature-pl

### Plano com isActive=false continua listado publicamente e pode ser contratado

- **Rota:** `GET /signature-plan, POST /signature/credit/new, POST /signature/pix, POST /signature/start-trial`
- **Impacto:** Desativar um plano nao impede nada: ele continua aparecendo na vitrine e continua sendo vendido. Todo o fluxo desta auditoria foi contratado sobre um plano inativo.
- **Reprodução:** SQL: Plano Demo (33231be6-b0fc-40d3-b108-91ad5ae1edef) esta com isActive=false. GET /signature-plan (publico) -> retorna o plano normalmente com "isActive":false. POST /signature/start-trial e POST /signature/credit/new nesse planId -> 201, assinatura criada e cobranca gerada no Asaas. Codigo: SignaturePlanService.fetch chama fetchAll sem filtro e nenhum fluxo de pagamento checa isActive.
- **Módulo:** F2-assinatura (signature, signature-pl

### Reembolso duplo aceito e erro do provedor ignorado em silencio

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** Se o estorno falhar no provedor a API responde sucesso mesmo assim: a clinica perde o acesso e nao recebe o dinheiro, sem nenhum sinal de erro. Suporte nao tem como distinguir estorno feito de estorno falho.
- **Reprodução:** PUT /signature/refound/1beeaa55-efda-4e70-b400-b4474d5cbc61 -> 200 (estorno sai, pagamento fica REFUNDED no Asaas). Segunda chamada na mesma assinatura -> 200 de novo. Codigo linha 535: await this.refoundPayment.refound(...) tem o retorno descartado, sem checagem de isLeft(), e a assinatura e marcada INACTIVE de qualquer forma.
- **Módulo:** F2-assinatura (signature, signature-pl

### PUT /admin/companies aceita phone, logoUrl, pixKey e signatureUrl, responde 200 e descarta os quatro em silencio

- **Rota:** `PUT /admin/companies/:id`
- **Impacto:** Operador salva, recebe sucesso e o dado nao muda. Alem disso nao existe forma nenhuma de cadastrar o telefone da empresa pelo painel - e o telefone e exatamente o que quebra a criacao de assinatura.
- **Reprodução:** PUT /admin/companies/30c6c97e-57ac-4c1f-b081-154cc085ed10 com {"phone":"11912345678","logoUrl":"https://cdn.x/logo.png","pixKey":"chave@pix.com","signatureUrl":"https://cdn.x/ass.png"} -> HTTP 200 com corpo trazendo phone:null, logoUrl:null, pixKey:null, signatureUrl:null. SQL confirma os 4 campos NULL. Causa: o controller usa EditCompanyDto (do modulo account) que declara os 4 campos, mas AdminCompanyUpdateService so trata name, address, number, postalCode, walletId e cnpj.
- **Módulo:** Painel interno Equinology (/admin/*) -

### Empresa criada pelo painel nao consegue assinar; o erro aponta um campo que o painel nao tem, e sem usuario e impossivel

- **Rota:** `POST /admin/companies + POST /admin/signature/create/:companyId/:planId`
- **Impacto:** O fluxo criar empresa pelo painel e depois cobrar so funciona se houver CNPJ valido E pelo menos um usuario com telefone valido - nada disso e validado nem editavel na criacao. Empresa sem usuario nunca consegue assinar.
- **Reprodução:** AdminCompanyCreateService grava paymentId='admin-<uuid>' (nao cria cliente Asaas) e nao valida CNPJ. 1) POST /admin/companies {"name":"Empresa F2 Admin","cnpj":"74605006425057"} -> 201 com paymentId admin-d639bb92-... 2) POST /admin/companies {"name":"Dup F2","cnpj":"11111111111111"} -> 201 (CNPJ invalido E duplicado de outra empresa, ambos aceitos; nome de 5000 chars tambem aceito). 3) POST /admin/signature/create/<empresa cnpj 111...>/<plano> -> 400 'O CPF/CNPJ informado e invalido.' 4) Corrigindo o CNPJ para valido -> 400 'O celular informado e invalido.' (telefone veio do 1o usuario, 11999999999, rejeitado pelo Asaas - e 11999999999 e o proprio fallback hardcoded do service). 5) Empresa 27a066f6 com 0 usuarios -> 400 'O CPF/CNPJ informado e invalido.' (fallback 00000000000000). 6) So depois de PATCH /admin/users/:id {"phone":"11988776655"} a assinatura passou (201) e paymentId virou cus_000008550818.
- **Módulo:** Painel interno Equinology (/admin/*) -

### GET /admin/signature (tela principal do painel) devolve 500 cru para qualquer query param invalido

- **Rota:** `GET /admin/signature`
- **Impacto:** A listagem principal de assinaturas quebra com 500 se o front mandar qualquer filtro fora do esperado, e o operador nao recebe nenhuma pista do que errou.
- **Reprodução:** O controller le status, companyId, page e pageSize com @Query cru, sem DTO nem validacao. HTTP observado: ?status=BANANA -> 500; ?page=abc&pageSize=xyz -> 500; ?page=-1&pageSize=3 -> 500; ?companyId=abc -> 500. Todos com o texto generico 'Nao foi possivel concluir a operacao. Tente novamente em alguns instantes...'. Comparacao: /admin/financial/transactions, que tem DTO, devolve 400 em portugues para page=abc e page=-1.
- **Módulo:** Painel interno Equinology (/admin/*) -

### PATCH /admin/signature/:id e change-plan devolvem a entidade crua (_id / props / _attachments) em vez do contrato

- **Rota:** `PATCH /admin/signature/:id e POST /admin/signature/change-plan/:id`
- **Impacto:** signature.id vem undefined para o front (o campo esta em _id), quebrando a tela apos salvar. Alem disso expoe asaasSubscriptionId, creditCardId e invoiceId, que nenhuma outra rota expoe.
- **Reprodução:** PATCH /admin/signature/a5787b94-135f-4d54-8793-82eb5ba10191 {"status":"ACTIVE"} -> 200 com {"signature":{"_id":"a5787b94-...","props":{"companyId":...,"paymentId":"sub_pending","asaasSubscriptionId":"sub_gm9kpt7uhpbw2qfi","creditCardId":null,"invoiceId":null,"wasTrial":false,...}},"_attachments":[]}. Todas as outras rotas de assinatura devolvem {id, companyId, signaturePlanId, status, expirationDate, yearly, createdAt}.
- **Módulo:** Painel interno Equinology (/admin/*) -

### charge devolve 404 'Registro nao encontrado' quando a empresa foi criada pelo painel, mesmo com assinatura existente

- **Rota:** `POST /admin/signature/charge/:id`
- **Impacto:** O operador procura um cadastro que existe. A causa real (empresa nunca virou cliente no Asaas) fica invisivel.
- **Reprodução:** 1) POST /admin/signature/create/27a066f6-8549-4ac4-8621-d7b0f3c09436/904d4948-1f55-46dd-a7fe-fad1a9249d55 {"isTrial":true} -> 201, assinatura 0b657ab3-a43c-4ad0-bcd9-75be660caf0f. 2) POST /admin/signature/charge/0b657ab3-... -> 404 'Registro nao encontrado. Confira os dados informados e tente novamente.' Causa: charge retorna ResourceNotFoundError quando company.paymentId comeca com 'admin-'. A assinatura e a empresa existem.
- **Módulo:** Painel interno Equinology (/admin/*) -

### Fatura sem clientId pode ser paga por qualquer cliente autenticado e fica PAID sem dono

- **Rota:** `POST /invoice/:id/pay/pix e /pay/credit/new`
- **Impacto:** invoice.service.ts guarda com 'if (invoice.clientId && invoice.clientId !== clientId)' — quando clientId é null a guarda não dispara. Cliente é cobrado por fatura que não é dele, e a fatura fica PAID com clientId NULL: a clínica não tem como saber quem pagou. Exige adivinhar o UUID da fatura, por isso GRAVE e não BLOQUEIA. Com clientId preenchido a guarda funciona: pagar a fatura do outro dono -> 404 limpo e fatura intacta.
- **Reprodução:** 1) Com token da clínica: POST /invoice {amount:55, dueDate:'2026-10-05', number:'F3-ORFA', description:'Fatura sem cliente'} (sem clientId, que é opcional no CreateInvoiceDto) -> 201, id 24716146-de11-497f-8525-2bd6ed75c497, clientId null. 2) POST /invoice/24716146.../pay/pix com token do Dono A -> 201 (QR gerado). 3) POST /invoice/24716146.../pay/credit/new com token do Dono B -> 201. 4) SQL: select number,status,"clientId","bankPaymentId" from invoices where number='F3-ORFA' -> F3-ORFA | PAID | (null) | pay_y14zqy9xhq0hkld2.
- **Módulo:** F3 - Portal do cliente / app do propri

### Pagar por cartão quando a clínica não tem conta Asaas devolve 'Registro não encontrado'

- **Rota:** `POST /invoice/:id/pay/credit/new e /pay/credit/existing`
- **Impacto:** Em invoice.service.ts:489 o teste '!company.walletId' cai no mesmo ResourceNotFoundError de 'fatura não existe'. O proprietário vê 'registro não encontrado' para uma fatura que está na tela dele e abre chamado. O caminho PIX já faz certo — é só inconsistência entre os dois.
- **Reprodução:** Com a empresa no estado em que nasce (walletId null): POST /invoice/<fatura própria e existente>/pay/credit/new com payload de cartão válido -> 404 {"message":"Registro não encontrado. Confira os dados informados e tente novamente."}; /pay/credit/existing -> 404 idem. Na MESMA fatura, POST /invoice/<id>/pay/pix -> 400 'A empresa ainda não possui PIX configurado. Entre em contato com o estabelecimento.' Depois de preencher o walletId por SQL, o mesmo POST /pay/credit/new -> 201.
- **Módulo:** F3 - Portal do cliente / app do propri

## FINANCEIRO / ESTOQUE

### PUT /client aceita cpf e nunca grava - cliente sem CPF fica irrecuperavel e sem paymentId (alcance do bug conhecido)

- **Rota:** `PUT /client/:clientId`
- **Impacto:** Como o paymentId do Asaas so e criado no POST /client quando ha CPF, um cliente cadastrado sem CPF nunca ganha paymentId e NAO PODE SER COBRADO. Nao existe rota alternativa para corrigir - o dado fica travado para sempre.
- **Reprodução:** POST /client {"name":"SemCpf","phone":"11911112222"} sem cpf -> cpf null. PUT /client/<id> {"cpf":"<cpf valido>"} -> 200 sem corpo. GET /client?page=1&query=SemCpf -> cpf null. SQL: SELECT cpf,"paymentId" FROM clients WHERE id='8361d4b3...' -> '|' (AMBOS NULL). O controller desestrutura so {name, phone, email}; o service tem a logica de cpf completa (checagem de duplicidade, limpar com string vazia) e inalcancavel. ALCANCE MEDIDO: vale para os DOIS caminhos - token de empresa E token do proprio cliente (testei o cliente editando a si mesmo pelo app: cpf 28135214502 permaneceu, alvo 00143632086 ignorado). VARREDURA DO MESMO PADRAO: testei os 11 campos de stud-farm e os 9 de animal um a um (POST+GET e PUT+GET) - todos gravam corretamente. Nao ha outro caso deste tipo no modulo alem do filtro color (achado separado).
- **Módulo:** F1 - cadastros base: cliente, propried

### UUID malformado em parametro de rota devolve 500 em 9 rotas do conjunto

- **Rota:** `GET/PUT/DELETE /product/abc, DELETE /product-category/abc, GET/PUT /field-stock/abc, PUT/DELETE /tag/abc, GET /product-usage/appointment/abc`
- **Impacto:** Entrada malformada derruba a rota com erro interno generico em vez de mensagem util.
- **Reprodução:** Chamar qualquer uma dessas rotas com 'abc' no lugar do UUID devolve HTTP 500 com 'Não foi possível concluir a operação... entre em contato com o suporte'. Testadas as 9, todas 500. Nenhuma usa ParseUUIDPipe, o erro do Prisma vaza. O correto seria 400/404.
- **Módulo:** F2 - estoque e CRM

### Exclusao bloqueada por vinculo devolve 500 cru em vez de explicar o motivo

- **Rota:** `DELETE /product-category/:id, DELETE /tag/:tagId, DELETE /board/:boardId`
- **Impacto:** O bloqueio existe e funciona, mas o operador recebe 'erro interno, procure o suporte' e vai achar que o sistema quebrou, em vez de 'existem N itens vinculados'.
- **Reprodução:** DELETE /product-category/<categoria com produto> -> 500 (categoria continua no banco). DELETE /tag/<tag vinculada a produto> -> 500 (product_tags continua com 1 linha). DELETE /board/<fase com 15 leads> -> 500 (SELECT count(*) FROM leads WHERE "boardId"=... ainda 15). Todos com id valido e da propria empresa.
- **Módulo:** F2 - estoque e CRM

### Estoque insuficiente no volante responde 403 'Você não tem permissão para realizar esta ação'

- **Rota:** `POST /field-stock, PUT /field-stock/:fieldStockId`
- **Impacto:** Mensagem nao tem relacao com o problema. Compare com /product-usage que faz certo: 400 INSUFFICIENT_STOCK 'Quantidade insuficiente em estoque. Reduza a quantidade ou reponha o item no estoque.'
- **Reprodução:** Produto com 70 no geral: POST /field-stock {"quantity":1000} -> 403 'Você não tem permissão para realizar esta ação.'; mesma mensagem para quantity -50 e para quantity 0. Volante com 20: PUT /field-stock/<fs> {"quantity":500} -> 403 identico. fieldStock.service.ts usa NotAllowedError tanto para saldo insuficiente quanto para quantity<=0.
- **Módulo:** F2 - estoque e CRM

### UUID malformado no path devolve 500 em quatro rotas

- **Rota:** `PUT /transaction/:id, PUT /payment/:id, PUT /bank-account/:id, PUT /transaction-category/:id`
- **Impacto:** Nenhuma delas tem ParseUUIDPipe. /invoice valida corretamente e devolve 400/404 - as quatro rotas de finance nao.
- **Reprodução:** PUT /transaction/abc {status:'PAID'} -> 500 INTERNAL_SERVER_ERROR; PUT /payment/abc {name:'x'} -> 500; PUT /bank-account/abc {name:'x'} -> 500; PUT /transaction-category/abc {name:'x',type:'INCOME'} -> 500.
- **Módulo:** F2-financeiro (/transaction, /transact

### page=0 e page=-1 devolvem 500 em GET /transaction e GET /payment

- **Rota:** `GET /transaction, GET /payment`
- **Impacto:** FetchTransactionDto e FetchPaymentDto usam so @IsNumberString(), sem @Min(1); o skip:(page-1)*10 negativo estoura no Prisma.
- **Reprodução:** GET /transaction?page=0 -> 500; GET /transaction?page=-1 -> 500; GET /payment?page=0 -> 500; GET /payment?page=-1 -> 500. Comparacao: GET /invoice?page=0 -> 400 'O campo page deve ser no minimo 1.'
- **Módulo:** F2-financeiro (/transaction, /transact

### PUT /invoice/:id com paidAt nao-data devolve 500

- **Rota:** `PUT /invoice/:id`
- **Impacto:** EditInvoiceDto.paidAt e validado so com @IsString(); o controller faz new Date(body.paidAt) e passa Invalid Date ao Prisma. dueDate no mesmo DTO usa @IsDateString({strict:true}) e funciona.
- **Reprodução:** PUT /invoice/<id> {"paidAt":"nao-e-data"} -> 500 INTERNAL_SERVER_ERROR. SQL confirma que a fatura continuou PENDING com paidAt NULL (nao corrompeu, mas o 500 e cru).
- **Módulo:** F2-financeiro (/transaction, /transact

### A busca por texto de GET /transaction e silenciosamente ignorada

- **Rota:** `GET /transaction`
- **Impacto:** O repositorio implementa a busca (normalizedLikeSql em name), mas TransactionController.fetch nao desestrutura nem repassa query, e FetchTransactionDto declara o campo como 'Query' com Q maiusculo. A caixa de busca do extrato nao filtra nada. Os demais filtros funcionam.
- **Reprodução:** GET /transaction?page=1 -> 10 itens, pages 2. GET /transaction?page=1&query=Avulsa2 -> 10 itens, pages 2 (lista inteira, incluindo 'Parcelado 12x F2' e 'Fatura F2-001-B'). GET /transaction?page=1&Query=Avulsa2 (Q maiusculo, como no DTO) -> mesmo resultado.
- **Módulo:** F2-financeiro (/transaction, /transact

### POST /invoice aceita valor negativo e zero; fatura negativa paga vira receita negativa no caixa

- **Rota:** `POST /invoice, PUT /invoice/:id`
- **Impacto:** CreateInvoiceDto.amount so tem @IsNumber(), sem @Min. CreatePaymentDto tem @Min(0.01) - a regra existe no financeiro e falta na fatura. O caixa fica com receita negativa.
- **Reprodução:** POST /invoice {amount:-500,dueDate:'2026-09-01'} -> 201 com amount -500. POST /invoice {amount:0,...} -> 201. PUT /invoice/<id -500> {paidAt:'2026-08-02T12:00:00.000Z'} -> 200 status PAID. SQL: select p.name,p.amount,p.type,t.value,t.status from sheduled_payments p join transactions t on t."paymentId"=p.id where p."invoiceId"='<id -500>' -> Fatura recebida|-500|INCOME|-500|PAID.
- **Módulo:** F2-financeiro (/transaction, /transact

### POST /transaction aceita valor negativo (POST /payment bloqueia)

- **Rota:** `POST /transaction`
- **Impacto:** Uma receita de -99 e uma despesa disfarcada que nao aparece em totalOutcome. Validacao inconsistente entre as duas rotas que gravam a mesma tabela.
- **Reprodução:** POST /transaction {name:'NegTx',value:-99,type:'INCOME',dueDate:'2026-08-10',status:'PENDING',categoryId:<CATO>,paymentId:<PAY>} -> 201. SQL: select name,value from transactions where name='NegTx' -> NegTx|-99. Comparacao: POST /payment com amount:-10 -> 400 'O valor deve ser maior que zero'.
- **Módulo:** F2-financeiro (/transaction, /transact

### Editar valor de fatura ja PAGA nao reflete na movimentacao gerada

- **Rota:** `PUT /invoice/:id`
- **Impacto:** Relatorio de faturas diz 9.999 recebidos e o caixa diz 399,99. O valor nao e travado apos o pagamento nem a movimentacao e sincronizada.
- **Reprodução:** Fatura PAID com amount 399.99 e movimentacao gerada de 399.99. PUT /invoice/<id> {"amount":9999} -> 200 com invoice.amount=9999. SQL: select p.amount,t.value,t.status from sheduled_payments p join transactions t on t."paymentId"=p.id where p."invoiceId"='<id>' -> 399.99|399.99|PAID. GET /invoice?page=1&status=PAID -> summary.paidAmount=9999.
- **Módulo:** F2-financeiro (/transaction, /transact

### Filtro de periodo em GET /payment devolve payload contraditorio: quantity/amount do total com transactions so do periodo

- **Rota:** `GET /payment`
- **Impacto:** Confirma a suspeita: com filtro de periodo a linha se apresenta como uma movimentacao de 12x integralmente paga. O recorte das parcelas e intencional (comentario em prismaPayment.repository.ts fala do KPI do mes), mas quantity e amount nao acompanham, entao nao ha como o consumidor saber que esta vendo 1 de 12.
- **Reprodução:** Movimentacao 12x de R$1.200, so a parcela de janeiro paga. GET /payment?page=1 -> quantity 12, amount 1200, 12 transactions, soma 1200, status [PENDING x11, PAID x1]. GET /payment?page=1&startDate=2026-01-01&endDate=2026-01-31 -> quantity 12, amount 1200, 1 transaction, soma 100, status [PAID].
- **Módulo:** F2-financeiro (/transaction, /transact

### Filtro de data de /admin/financial/transactions ignora silenciosamente transacoes com dueDate vazio

- **Rota:** `GET /admin/financial/transactions`
- **Impacto:** Relatorio financeiro por periodo mistura transacoes fora da janela e exibe a coluna de vencimento vazia. O numero apresentado ao dono nao corresponde ao filtro escolhido.
- **Reprodução:** GET /admin/financial/transactions?startDate=2030-01-01 -> 200 {"transactions":[{"id":"pay_1xmxqkcnwbhjkq8l","companyName":"Clinica F2ADM","value":4966.92,"dueDate":"","status":"PENDING"},...]}. Uma transacao de 2026 aparece num filtro que comeca em 2030. Causa: adminFinancial.service.ts so aplica o filtro quando dueDate e truthy (if (startDate && dueDate && ...)); pagamentos avulsos do fluxo anual/charge vem de AdminSignatureService.history com dueDate:''.
- **Módulo:** Painel interno Equinology (/admin/*) -

### 500 cru em UUID malformado em 8 rotas do proprietário

- **Rota:** `GET /client-portal/appointment/:id, GET /client-portal/animal/:id/owner-note, GET /client-portal/animal/:id/animal-note, PUT e DELETE /client-portal/animal-note/:id, GET /client-payment?animalId=, GET /appointment/client?page=-1, POST /invoice/:id/pay/pix`
- **Impacto:** Erro não tratado vazando do Prisma. Nenhum @Param do ClientPortalController tem ParseUUIDPipe. O page=-1 escapa porque FetchAppointmentsByClientDto não tem @Min(1) (page=abc é pego com 400). App do proprietário mostra 'erro no servidor' em vez de mensagem útil, e o log enche de exceção.
- **Reprodução:** Com token de cliente válido: GET /client-portal/appointment/abc -> 500; GET /client-portal/animal/abc/owner-note -> 500; GET /client-portal/animal/abc/animal-note -> 500; PUT /client-portal/animal-note/abc -> 500; DELETE /client-portal/animal-note/abc -> 500; GET /client-payment?page=1&animalId=abc -> 500; GET /appointment/client?page=-1 -> 500; POST /invoice/abc/pay/pix -> 500. Corpo em todos: {"statusCode":500,"message":"Não foi possível concluir a operação...","code":"INTERNAL_SERVER_ERROR"}. Para contraste, com UUID válido inexistente a mesma rota responde 404 limpo, e POST /client-portal/animal-note {animalId:'abc'} responde 400 'ID do animal inválido' — prova de que a validação existe no projeto e só não foi aplicada nos @Param.
- **Módulo:** F3 - Portal do cliente / app do propri

### Rotas da clínica devolvem 500 em vez de 403 quando chamadas com token de cliente

- **Rota:** `GET /client, GET /client/cpf/:cpf, POST /client/token, DELETE /client/:id, POST /invoice, GET /invoice, GET /board`
- **Impacto:** O companyId do token de cliente é a string 'no-company', que não é UUID e explode no Prisma. Fecha o acesso por acidente, não por decisão — nenhum dado voltou, mas basta uma dessas rotas passar a tolerar companyId inválido para virar vazamento. Compare com as que têm guarda e respondem certo: GET /user -> 403 com mensagem clara, GET /company -> 403, /animal-note -> 403, /owner-note -> 403, /general-prescription -> 403, /transaction e /payment -> 403.
- **Reprodução:** Com token do Dono A: GET /client?page=1 -> 500; GET /client/cpf/75561435540 -> 500; POST /client/token {clientId:<outro>} -> 500; DELETE /client/<outro> -> 500; POST /invoice {amount:1,dueDate:'2026-10-01',clientId:<próprio>} -> 500; GET /invoice?page=1 -> 500; GET /board -> 500. Todos com corpo INTERNAL_SERVER_ERROR.
- **Módulo:** F3 - Portal do cliente / app do propri

### Mensagem de validação em inglês e com lista de valores vazia em /client-invoice?status=

- **Rota:** `GET /client-invoice`
- **Impacto:** O @IsEnum(['PENDING','PAID','CANCELED']) do FetchClientInvoiceDto usa array literal (não enum TS), então o class-validator não imprime os valores permitidos. O usuário do app vê erro em inglês e sem informação. As rotas irmãs respondem em português (/client-payment?page=abc -> 'Insira uma página válida').
- **Reprodução:** GET /client-invoice?page=1&status=XX com token de cliente -> 400 {"statusCode":400,"message":["status must be one of the following values: "],"error":"Bad Request","code":"VALIDATION_ERROR"}. A frase termina em dois-pontos sem nenhum valor listado.
- **Módulo:** F3 - Portal do cliente / app do propri

## OUTROS

### Sete rotas devolvem 500 para id/uuid malformado ou corpo sem campo obrigatorio

- **Rota:** `PUT /user/:userId, DELETE /user/:userId, POST /user/register, POST /client/token, POST /client/link, DELETE /client/:clientId/unlink`
- **Impacto:** Falta ParseUUIDPipe/validacao: o where do Prisma estoura com uuid invalido. O caso do companyCode e o mais visivel: qualquer pessoa que digite errado o codigo de convite no cadastro publico recebe 'erro interno, contate o suporte'. Em POST /client/token o corpo esta tipado inline (@Body() body: { clientId: string }) sem DTO, entao escapa do ValidationPipe e {} vira 500 em vez de 400.
- **Reprodução:** PUT /user/abc {"name":"X"} -> 500 | DELETE /user/abc -> 500 | POST /user/register {"newCompany":false,"companyCode":"nao-existe",...} -> 500 | POST /client/token {"clientId":"abc"} -> 500 | POST /client/token {} -> 500 | POST /client/link {"clientCode":"abc"} -> 500 | DELETE /client/abc/unlink -> 500. Com uuid bem formado porem inexistente todas devolvem 404 limpo.
- **Módulo:** F1 - acesso e conta (user, company, pa

### PUT /company grava CNPJ lixo sem validacao (e nome de 5000 caracteres)

- **Rota:** `PUT /company`
- **Impacto:** EditCompanyDto.cnpj e apenas @IsString. O CNPJ aparece em fatura/PDF e e o documento do cadastro de pagamento. No POST /user/register o CNPJ e validado (Asaas recusa, 400); na edicao passa batido. postalCode e phone tambem nao tem formato.
- **Reprodução:** PUT /company {"cnpj":"nao-eh-cnpj-123456789"} -> 200. SQL: SELECT cnpj FROM companies WHERE id='7f5174fb-...' -> nao-eh-cnpj-123456789. PUT /company com name de 5000 chars -> 200; SELECT length(name) -> 5000 e o GET devolve inteiro.
- **Módulo:** F1 - acesso e conta (user, company, pa

### Conta de cliente excluida (soft delete) mantem a sessao viva

- **Rota:** `DELETE /client/me`
- **Impacto:** 'Excluir minha conta' no app nao encerra a sessao: quem estiver com o aparelho segue acessando os dados por ate 90 dias (validade do token). Mesma raiz da falta de revogacao de JWT.
- **Reprodução:** 1) DELETE /client/me com o token do cliente 490e3e48-5805-467d-b516-e17f50fd6117 -> 200. 2) POST /client/auth com email+senha -> 401 (ok). 3) GET /client/profile com o MESMO token de antes -> 200 com nome, email, cpf, phone e code completos.
- **Módulo:** F1 - acesso e conta (user, company, pa

### Filtro color do GET /animal e aceito e descartado em silencio

- **Rota:** `GET /animal`
- **Impacto:** A tela mostra 'filtrado por pelagem' exibindo a lista inteira. O usuario confia num filtro que nao existe.
- **Reprodução:** GET /animal?page=1&color=ZZZNAOEXISTE -> 200 e devolve TODOS os animais (Baio e Alazao). GET /animal?page=1&color=Baio -> 200 e devolve TODOS os animais. Comparar com breed, que e repassado e funciona: ?breed=Crioulo devolve exatamente 1. O FetchAnimalsDto declara e valida color, mas o metodo fetch do animal.controller.ts nao desestrutura color do queryParams nem repassa ao service.
- **Módulo:** F1 - cadastros base: cliente, propried

### page=0 e page negativo devolvem 500 nas tres listagens

- **Rota:** `GET /client, GET /stud-farm, GET /animal`
- **Impacto:** Um front que zere o contador de pagina derruba a tela com erro interno generico. Alem disso page fracionaria pula registros silenciosamente.
- **Reprodução:** GET /client?page=0 -> 500; GET /client?page=-1 -> 500; GET /stud-farm?page=0 -> 500; GET /stud-farm?page=-5 -> 500; GET /animal?page=0 -> 500. O page e validado como @IsNumberString mas nao como inteiro >= 1, entao skip:(page-1)*10 vira negativo e o Prisma estoura. Relacionado: GET /client?page=1.5 retorna 200 e pula 5 registros (skip fracionario).
- **Módulo:** F1 - cadastros base: cliente, propried

### UUID malformado devolve 500 cru em 8 requisicoes das tres rotas

- **Rota:** `PUT/DELETE /client/:id, PUT /stud-farm/:id, GET/POST /stud-farm, PUT /animal/:id, GET /animal/by-id/:id, POST /animal`
- **Impacto:** Qualquer id truncado ou corrompido vindo do front vira erro interno em vez de 400 legivel.
- **Reprodução:** PUT /client/abc -> 500; DELETE /client/abc -> 500; PUT /stud-farm/abc -> 500; GET /stud-farm?page=1&clientId=abc -> 500; POST /stud-farm {"clientId":"abc"} -> 500; PUT /animal/abc -> 500; GET /animal/by-id/abc -> 500; POST /animal {"clientId":"abc"} -> 500. Para comparacao, o mesmo id INEXISTENTE mas com formato valido devolve 404 limpo em todas elas. E GET /client?page=1&studFarmId=abc devolve 400 correto ('O campo studFarmId deve ser um identificador valido') - a validacao existe naquele DTO, provando que so falta aplicar o mesmo padrao (@IsUUID / ParseUUIDPipe) nas demais.
- **Módulo:** F1 - cadastros base: cliente, propried

### gender e sex invalidos no POST e PUT /animal devolvem 404 'Registro nao encontrado'

- **Rota:** `POST /animal, PUT /animal/:id`
- **Impacto:** Mensagem sem nenhuma relacao com o erro real. O usuario ve 'registro nao encontrado' ao escolher uma categoria e nao tem como saber o que corrigir.
- **Reprodução:** POST /animal {"gender":"BANANA",...} -> 404 'Registro nao encontrado. Confira os dados informados e tente novamente.'; POST /animal {"gender":"STALLION","sex":"BANANA"} -> 404 igual; PUT /animal/<id> {"gender":"BANANA"} -> 404 igual. CreateAnimalDto e EditAnimalDto validam gender e sex apenas com @IsString(), sem @IsEnum, entao o valor invalido passa a validacao e quebra la dentro. Compare com GET /animal?page=1&gender=XPTO, que devolve 400 'Cada genero deve ser um valor valido' - o FetchAnimalsDto usa @IsEnum e acerta. Nota: gender:123 (numero) da 400 correto porque ai o @IsString dispara; so o valor textual fora do enum escapa.
- **Módulo:** F1 - cadastros base: cliente, propried

### Nao existe exclusao de propriedade nem de animal na API

- **Rota:** `DELETE /stud-farm/:id, DELETE /animal/:id`
- **Impacto:** Cadastro errado de propriedade ou de animal e permanente. Ironicamente, o unico jeito de um animal sumir da empresa e ser sequestrado por outro tenant (achado A1).
- **Reprodução:** DELETE /stud-farm/ee4c86ed... -> 404 {"message":"Cannot DELETE /stud-farm/ee4c86ed...","error":"Not Found"}. DELETE /animal/d4560528... -> 404 {"message":"Cannot DELETE /animal/d4560528..."}. Confirmado por leitura: studFarm.controller.ts e animal.controller.ts nao importam Delete do @nestjs/common.
- **Módulo:** F1 - cadastros base: cliente, propried

### POST /client/link com codigo inexistente devolve 500, e a rota nao tem rate limit

- **Rota:** `POST /client/link`
- **Impacto:** 500 em entrada malformada e inconsistencia de protecao entre rotas de convite equivalentes.
- **Reprodução:** POST /client/link {"clientCode":"nao-existe"} -> 500. Deveria ser 404 - como clientCode e UUID no banco, qualquer string nao-UUID quebra. Comparar: POST /client/link com codigo valido ja vinculado devolve 409 correto. Observacao adicional de seguranca na mesma rota: diferente de GET /stud-farm/code/:code e GET /animal/:code, que tem ThrottlerGuard 5/min, POST /client/link nao tem nenhum limite - e acertar o codigo vincula um cliente de outro tenant a sua empresa (provado: empresa B fez POST /client/link com o code do Cliente Dois de A e passou a ve-lo em GET /client). O code e UUID v4, entao brute force e impraticavel, mas a protecao esta inconsistente entre as tres rotas de convite.
- **Módulo:** F1 - cadastros base: cliente, propried

### Cliente com soft delete continua ativo e editavel na visao da clinica, sem nenhum sinal na API

- **Rota:** `DELETE /client/me, GET /client, PUT /client/:clientId`
- **Impacto:** A clinica agenda, fatura e manda mensagem para uma conta encerrada sem ter como saber. Se o comportamento e por design, falta o campo no presenter para o front sinalizar.
- **Reprodução:** DELETE /client/me (token do cliente) -> 200. POST /client/auth com as mesmas credenciais -> 401 (login bloqueado, correto). GET /client?page=1&query=SoftDel -> 200, o cliente aparece normalmente e NENHUM campo indica que foi excluido. PUT /client/<id> {"name":"Ressuscitado"} -> 200 e o nome muda de fato. GET /stud-farm?query=SoftDel e GET /animal?query=SoftDel -> propriedade e animal dele continuam listados. Banco: deletedAt=2026-08-02 17:28:05.783 e name='Ressuscitado'. O codigo documenta que manter os dados e intencional; o problema e que o ClientPresenter nao devolve deletedAt em lugar nenhum.
- **Módulo:** F1 - cadastros base: cliente, propried

### leadQuantity do kanban ignora o filtro aplicado - o contador da coluna mente

- **Rota:** `GET /board`
- **Impacto:** A coluna do kanban diz 15 e mostra 1 card.
- **Reprodução:** 15 leads na Fase 1, 1 na Fechado. GET /board?query=Lead%20B15 -> Fase 1 com leads=1 mas leadQuantity=15; Fechado com leads=0 mas leadQuantity=1. GET /board?startDate=2020-01-01&endDate=2020-01-02 -> Fase 1 leads=0 leadQuantity=15. Os leads retornados respeitam o filtro, o contador nao.
- **Módulo:** F2 - estoque e CRM

### Kanban entrega no maximo 10 leads por coluna e GET /board nao tem paginacao

- **Rota:** `GET /board, GET /lead/board/:boardId`
- **Impacto:** Colunas com mais de 10 leads ficam truncadas e o front nao tem como saber quantas paginas existem; so adivinhando por 'veio menos de 10'.
- **Reprodução:** Criei 15 leads na Fase 1. GET /board -> leads=10, leadQuantity=15. GET /board nao aceita parametro page (FetchBoardDto so tem startDate, endDate, query). O contorno GET /lead/board/<B1>?page=2 devolve os 5 restantes corretamente, mas a resposta e {"leads":[...]} sem 'pages' nem total - Object.keys da resposta = ['leads'].
- **Módulo:** F2 - estoque e CRM

### UUID malformado devolve 500 cru em todas as 27 rotas (nenhum ParseUUIDPipe)

- **Rota:** `todas as 27 rotas do conjunto`
- **Impacto:** Qualquer id truncado/corrompido vindo do front vira erro de servidor com mensagem de suporte em vez de 400.
- **Reprodução:** GET /vaccine/abc?page=1 -> 500; GET /vaccine/soon/abc -> 500; PUT /vaccine/abc {"name":"Z"} -> 500; DELETE /vaccine/abc -> 500; POST /vaccine {...,"animalId":"abc"} -> 500; GET /deworming/abc?page=1 -> 500; GET /exam/abc?page=1 -> 500; GET /sanitary-protocol/abc -> 500; GET /sanitary-protocol?page=1&studFarmId=abc -> 500. Com UUID válido porém inexistente a resposta é limpa (404 ou 403) — o problema é exclusivamente o formato.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### UUID malformado no path devolve 500 cru em 11 chamadas do conjunto

- **Rota:** `PUT/DELETE /note/:id, PUT/DELETE /reminder/:id, PUT/DELETE /animal-note/:id, GET /animal-note/animal/:id, POST e GET /owner-note/:aaId, PUT/DELETE /owner-note/record/:id`
- **Impacto:** Erro do Prisma vaza como 500 generico para entrada malformada.
- **Reprodução:** Nenhum ParseUUIDPipe nos parametros. PUT /note/abc -> 500; DELETE /note/abc -> 500; PUT /reminder/abc -> 500; DELETE /reminder/abc -> 500; PUT /animal-note/abc -> 500; DELETE /animal-note/abc -> 500; GET /animal-note/animal/abc -> 500; PUT /owner-note/record/abc -> 500; DELETE /owner-note/record/abc -> 500; GET /owner-note/abc -> 500; POST /owner-note/abc -> 500. Todos com code INTERNAL_SERVER_ERROR. Com UUID valido porem inexistente a resposta e 404 limpa.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### page=0 e page negativo derrubam a listagem com 500

- **Rota:** `GET /note, GET /reminder`
- **Impacto:** Qualquer front que mande page=0 (indice base 0) quebra a listagem inteira.
- **Reprodução:** skip: (page-1)*10 vira negativo. GET /note?page=0 -> 500; GET /note?page=-1 -> 500; GET /reminder?page=0 -> 500; GET /reminder?page=-1 -> 500. Ja GET /note?page=abc e sem page -> 400 com mensagem correta; o @IsNumberString nao barra zero/negativo.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### POST /admin/users cria conta duplicada trocando o caixa do e-mail; o signin em maiuscula autentica na conta-sombra

- **Rota:** `POST /admin/users`
- **Impacto:** Duas contas com o mesmo e-mail em empresas diferentes. Login, recuperacao de senha e suporte ficam ambiguos, e o cliente pode acabar logando na conta errada.
- **Reprodução:** POST /admin/users {"email":"vet.demo@equinology.com.br",...} -> 409 (correto). POST /admin/users {"email":"VET.DEMO@EQUINOLOGY.COM.BR",...} -> 201 (passou). SQL: 74c8c4ca-... | vet.demo@equinology.com.br | empresa f4e2f01e-... e 1ef572dc-... | VET.DEMO@EQUINOLOGY.COM.BR | empresa 258506bc-.... POST /user/signin com o email em maiusculo devolve token com sub=1ef572dc-... e companyId=258506bc-..., ou seja autentica na conta-sombra. Causa: userRepository.findByEmail e case-sensitive e o AdminUserManagementService nao normaliza o email (diferente de /user/register).
- **Módulo:** Painel interno Equinology (/admin/*) -

### UUID malformado devolve 500 cru em praticamente todo o painel (nenhuma rota usa ParseUUIDPipe)

- **Rota:** `13 rotas confirmadas em /admin/*`
- **Impacto:** Qualquer link colado errado ou id truncado vira 500. Erro do Prisma vaza como falha de servidor em vez de 400.
- **Reprodução:** Com :id = 'abc' devolveram 500 INTERNAL_SERVER_ERROR: GET /admin/companies/abc, PUT /admin/companies/abc, PATCH /admin/users/abc, PUT /admin/plans/abc, DELETE /admin/plans/abc, DELETE /admin/coupons/abc, PUT /admin/ads/abc, PUT /admin/tutorials/abc, PATCH /admin/signature/abc, POST /admin/signature/cancel/abc, POST /admin/signature/create/abc/abc, GET /admin/financial/transactions?companyId=abc. Com UUID valido inexistente todas devolvem 404 limpo em portugues. Prova de que o pipe funciona quando o campo esta no DTO: PATCH /admin/users/:id {"companyId":"abc"} -> 400 'O campo companyId deve ser um identificador valido.' O problema esta so nos @Param/@Query.
- **Módulo:** Painel interno Equinology (/admin/*) -

### POST/PUT /admin/plans grava preco negativo, userQuantity negativo e desconto anual de 500%

- **Rota:** `POST /admin/plans e PUT /admin/plans/:id`
- **Impacto:** Com yearlyDiscount=500 o calculo anual pixPrice*12*(1-500/100) vira valor negativo enviado direto ao Asaas. Com userQuantity negativo o limite de usuarios do plano bloqueia todos os cadastros da empresa.
- **Reprodução:** POST /admin/plans {"name":"F2ADM Negativo","description":"d","userQuantity":-5,"creditCardPrice":-100,"pixPrice":-50,"isActive":true,"yearlyDiscount":500,"trialDays":0} -> HTTP 201. SQL: userQuantity=-5, creditCardPrice=-100, pixPrice=-50, yearlyDiscount=500. Causa: CreateSignaturePlanDto so tem @Min(0) em trialDays; userQuantity, creditCardPrice, pixPrice e yearlyDiscount nao tem nenhum limite.
- **Módulo:** Painel interno Equinology (/admin/*) -

### Anuncio aceita redirectUrl javascript:alert(1) e imageUrl invalida, e serve tudo na rota PUBLICA sem autenticacao

- **Rota:** `POST /admin/ads -> GET /ads/sponsors`
- **Impacto:** Se a LP renderizar <a href={redirectUrl}> e XSS armazenado servido publicamente na landing page. Registros de teste ja foram apagados.
- **Reprodução:** POST /admin/ads {"name":"RedRuim","imageUrl":"https://x.com/a.png","redirectUrl":"javascript:alert(1)"} -> 201. POST /admin/ads {"name":"UrlRuim","imageUrl":"nao eh url"} -> 201. GET /ads/sponsors SEM token (rota @IsPublic) -> 200 {"advertisements":[{"name":"RedRuim","redirectUrl":"javascript:alert(1)",...},{"name":"UrlRuim","imageUrl":"nao eh url",...}]}. Nem imageUrl nem redirectUrl tem validacao de URL, enquanto o modulo de tutoriais valida (mediaUrl nao-URL -> 400 'URL invalida').
- **Módulo:** Painel interno Equinology (/admin/*) -

### Ultimo super_admin pode se rebaixar para support e travar o painel permanentemente

- **Rota:** `PATCH /admin/admins/:id`
- **Impacto:** Um clique errado deixa a empresa sem nenhum super_admin e sem forma de criar outro pela aplicacao - recuperacao so por SQL em producao.
- **Reprodução:** Com o unico super_admin da base (058efc34-2bd1-4d8f-9b28-32cf5d7bb6ca): 1) PATCH /admin/admins/058efc34-... {"active":false} -> 400 'Voce nao pode desativar a propria conta.' (correto). 2) PATCH /admin/admins/058efc34-... {"role":"support"} -> 200 com role='support'. 3) POST /admin/admins -> 403 'Apenas super administradores podem realizar esta acao.' A partir dai nao existe nenhuma rota que devolva o super_admin. So recuperei com UPDATE admin_users SET role='super_admin' direto no banco (ja restaurado). Causa: o service bloqueia active:false na propria conta mas nao bloqueia mudanca de role na propria conta e nao verifica se sobra algum super_admin.
- **Módulo:** Painel interno Equinology (/admin/*) -

### Upload de imagem de anuncio confia no Content-Type declarado pelo cliente; binario arbitrario e aceito e publicado

- **Rota:** `POST /admin/ads (multipart)`
- **Impacto:** Qualquer admin (inclusive role support) publica arquivo arbitrario no CDN da empresa passando por imagem.
- **Reprodução:** resolveUploadedImageUrl testa apenas file.mimetype, sem magic bytes. Enviando .exe com type=application/octet-stream -> 400 'A imagem deve ser JPEG, PNG, GIF ou WebP.' Enviando PNG de 6MB -> 400. Enviando o MESMO .exe com type=image/png forjado (curl -F "image=@fake.exe;type=image/png") -> 201: o binario subiu para o Cloudflare e virou imageUrl publica do anuncio.
- **Módulo:** Painel interno Equinology (/admin/*) -

### Token de cliente cria e edita cadastro clínico: POST /stud-farm, PUT /stud-farm/:id e PUT /animal/:id

- **Rota:** `POST /stud-farm, PUT /stud-farm/:id, PUT /animal/:id`
- **Impacto:** O proprietário renomeia registros da base clínica (animals.companyId continua sendo o da clínica) pelo app, sem vínculo de empresa no token. O isolamento ENTRE clientes está OK (PUT /animal do outro dono -> 404, PUT /stud-farm do outro dono -> 403, ambos confirmados sem alteração no banco), então o dano é limitado ao próprio cadastro — mas é escrita não prevista sobre dado da clínica. Nota: DELETE /animal/:id e DELETE /stud-farm/:id não existem (404 'Cannot DELETE').
- **Reprodução:** Com o token do Dono A (companyId 'no-company'): POST /stud-farm {name:'Haras Hack', clientId:<próprio>, address:'x', city:'SP', state:'SP'} -> 201, criado id 1fd15bd7-b22e-4dba-8bb5-74dec5bdd90f. PUT /stud-farm/d54385fd-5c1e-48fa-8b5b-77debcb49494 {name:'Haras Hackeado'} -> 200; SQL: select name from stud_farms where id='d54385fd...' -> 'Haras Hackeado'. PUT /animal/41aecd32-a37d-4810-8ca5-e2094c549e23 {name:'Cavalo Hackeado'} -> 200; SQL: select name from animals where id='41aecd32...' -> 'Cavalo Hackeado'.
- **Módulo:** F3 - Portal do cliente / app do propri

### DELETE /client/me (excluir minha conta) não invalida a sessão — o JWT continua lendo tudo

- **Rota:** `DELETE /client/me + todas as rotas do portal`
- **Impacto:** O soft delete só bloqueia login novo. O JWT já emitido continua válido até expirar (exp observado ~90 dias). Quem pediu exclusão de conta continua com acesso total no aparelho já logado — problema direto de LGPD (direito de eliminação) e de aparelho perdido/roubado.
- **Reprodução:** DELETE /client/me com o token do Dono B -> 200. POST /client/auth {dono B} -> 401 'E-mail ou senha incorretos'. Mas com o MESMO token de antes: GET /client/profile -> 200 devolvendo {"name":"Dono B SEGREDO","cpf":"75561435540",...}; GET /appointment/client?page=1 -> 200; GET /client-invoice?page=1 -> 200 com a fatura F3-002 de R$ 999,99.
- **Módulo:** F3 - Portal do cliente / app do propri

### Allowlist de mimetype do upload confia no que o cliente declara: binario arbitrario sobe com extensao .exe

- **Rota:** `POST /file`
- **Impacto:** A API vira hospedagem publica de binario arbitrario sob o dominio do produto. Bloquear SVG/HTML (que funciona) nao adianta enquanto o mimetype declarado for a unica fonte de verdade.
- **Reprodução:** POST /file multipart com nome='mal.exe', Content-Type declarado='image/png', conteudo 'MZ\x90\x00 EXECUTAVEL' -> 201 {"url":"mal-a6841197.exe","fullUrl":"https://pub-a4f3763969d34f86b87fd3d880941bfc.r2.dev/mal-a6841197.exe"}. curl na fullUrl -> 200 sem autenticacao. Nao ha checagem de magic bytes nem coerencia extensao x mimetype; R2Storage preserva a extensao original.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### GET /coupons/validate/:code publica, sem rate limit, e diferencia 'existe' de 'nao existe'

- **Rota:** `GET /coupons/validate/:code`
- **Impacto:** O status HTTP entrega se o cupom existe: qualquer um enumera a base de cupons por forca bruta e descobre descontos ativos e quantas vagas restam. Alem disso o presenter expoe contadores comerciais internos publicamente.
- **Reprodução:** Sem nenhum token: GET /coupons/validate/NAOEXISTE -> 404; GET /coupons/validate/F3INATIVO -> 200 {"isValid":false}; GET /coupons/validate/F3OK -> 200 com objeto completo do cupom (id, maxUsages, currentUsages). 150 requisicoes concorrentes em 194 ms, todas 200 — nenhum throttle.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### Arquivo e bufferado inteiro em memoria antes de qualquer validacao de tamanho

- **Rota:** `POST /file`
- **Impacto:** Provavel DoS: N uploads grandes simultaneos estouram a heap do processo antes de qualquer rejeicao.
- **Reprodução:** FileInterceptor('file') nao recebe limits:{fileSize}; o MaxFileSizeValidator do ParseFilePipe so roda depois do multer montar o Buffer completo. Indicio observado: upload de 110 MB levou 326 ms e so entao voltou 400 — o corpo inteiro foi recebido e alocado. NAO reproduzi o cenario extremo (centenas de MB) de proposito, para nao causar OOM na API compartilhada com os outros agentes da auditoria.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

## SEGURANCA / ISOLAMENTO

### Propriedade orfa criada por outra empresa pode ser vinculada ao atendimento

- **Rota:** `PUT /appointment/:id`
- **Impacto:** Raiz em prismaStudFarm.repository.ts companyScope, que trata propriedade sem cliente/animal/atendimento como pertencente a qualquer empresa. Efeito no meu conjunto: nome e endereco de propriedade criada por outra empresa aparecem no atendimento.
- **Reprodução:** Empresa 2: POST /stud-farm {"name":"Haras Intruso","clientId":null,"address":"X","city":"Y","state":"SP"} -> 201 (id 69bc3d5e-...). Empresa 1: PUT /appointment/97d76f7d-... {"studFarmId":"69bc3d5e-..."} -> 200 e o GET details mostra 'Haras Intruso' gravado. Contraprova: com propriedade que TEM cliente dono, PUT ... {"studFarmId":"4d74f9e3-..."} -> 403 corretamente.
- **Módulo:** atendimentos (/appointment + /appointm

### Codigo de recuperacao de senha nunca e invalidado apos o uso - reutilizavel a vontade

- **Rota:** `PUT /user/password e PUT /client/password-code`
- **Impacto:** O codigo vale 30 min (entidade) / 1h (query do repositorio) e pode trocar a senha N vezes. Quem interceptar o e-mail retoma a conta repetidamente; a vitima trocar a senha de novo nao expulsa o atacante, porque o codigo dele continua valendo.
- **Reprodução:** 1) POST /password-code {"email":"f1a.1785691444@teste.com"} -> 201. 2) SQL: SELECT code FROM recover_password_codes WHERE "userId"='729ee652-...' -> ke5xr0. 3) PUT /user/password {"code":"ke5xr0","password":"NovaSenha@999"} -> 200. 4) SQL: o registro ke5xr0 CONTINUA na tabela. 5) PUT /user/password {"code":"ke5xr0","password":"Reuso@12345"} -> 200 e POST /user/signin com Reuso@12345 -> 201. Mesmo resultado no lado cliente com o codigo qwif45 via PUT /client/password-code + POST /client/auth.
- **Módulo:** F1 - acesso e conta (user, company, pa

### Nenhuma politica de senha: senha de 1 caractere aceita em cadastro, criacao de colaborador e recuperacao

- **Rota:** `POST /user, POST /user/register, PUT /user/password`
- **Impacto:** Os DTOs so tem @IsString + @IsNotEmpty, sem MinLength nem complexidade. Com o throttle de 10 tentativas/min no login, uma senha de 1 digito e quebravel em segundos. Vale tambem para o app do proprietario.
- **Reprodução:** PUT /user/password {"code":"ke5xr0","password":"a"} -> 200; POST /user/signin com password "a" -> 201 com token. POST /user {"name":"Senha Fraca","email":"fraca.f1@teste.com","phone":"11900000000","password":"1"} -> 201.
- **Módulo:** F1 - acesso e conta (user, company, pa

### Aceita usuário de OUTRA empresa como responsável pela ficha (vínculo cross-tenant gravado)

- **Rota:** `POST /vaccine, POST /deworming, POST /exam, POST /shoeing`
- **Impacto:** Grava dado errado permanentemente e cria referência entre tenants. Qualquer tela ou relatório que resolva o nome do responsável exibirá o nome de um funcionário de outra clínica.
- **Reprodução:** Usuário 74c8c4ca-a401-4a6d-8b28-c2898c194e41 pertence à empresa f4e2f01e-49fb-4ccd-b02c-df1d645aeca5 (não a minha). POST /vaccine {"name":"UserCross","date":"2026-01-01","location":"L","animalId":"<meu animal>","userId":"74c8c4ca-..."} -> 201. Idem POST /exam, POST /shoeing, POST /deworming -> 201 nos quatro. SQL confirma: 'UserCross | 74c8c4ca-... | user_company f4e2f01e-... | animal_company 152488b6-...'. Nenhum service valida que o userId pertence à empresa do token.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### POST/PUT /owner-note aceita userId (veterinario responsavel) de outra empresa sem validacao

- **Rota:** `POST /owner-note/:appointmentAnimalId`
- **Impacto:** Registro clinico assinado por veterinario de outra clinica; integridade de autoria quebrada.
- **Reprodução:** POST /owner-note/3685c813-... {"animalId":"4a8c28dd-...","userId":"80b4b1b4-98aa-4c9e-a11a-0ea79fe9ea50" (usuario da empresa B),"description":"userId de outra empresa"} -> 201 OBSERVADO. SQL: select "userId" from owner_notes where id='06e274fa-...' -> 80b4b1b4 (empresa B). Nem upsert nem edit conferem a empresa do userId.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### 41/41: POST e PUT aceitam e gravam userId (e stallionId) de OUTRA empresa

- **Rota:** `POST /<41 rotas de ficha>/:appointmentAnimalId e PUT /<41 rotas de ficha>/:id`
- **Impacto:** Nenhum dos 41 services valida que o userId informado pertence a empresa do token. A ficha da minha clinica passa a apontar como responsavel tecnico um veterinario de outra clinica. Idem para stallionId em reproduction-donor-insemination (coluna text, sem FK, aceita animal de outra empresa). Nao e vazamento de leitura (o presenter nao resolve nome do usuario), mas grava vinculo cruzado entre tenants e tende a quebrar ou vazar em qualquer tela que resolva esse userId (PDF de prontuario, detalhe do atendimento). Contraponto: animalId E validado corretamente (403).
- **Reprodução:** Com token da empresa 4f9b0aae-dc61-4878-9d3d-9ebb02ce1bfc: PUT /general-info/1bae4741-10f6-427d-ba25-4fd62ef7cd09 {"userId":"74c8c4ca-a401-4a6d-8b28-c2898c194e41"} (usuario da empresa f4e2f01e-49fb-4ccd-b02c-df1d645aeca5) -> OBSERVADO 200. GET /general-info?page=1&animalId=e09485b9-... -> userId = 74c8c4ca-.... Confirmado em SQL: select gi.id, gi."userId", u."companyId", gi."companyId" from general_infos gi join users u on u.id=gi."userId" where gi."companyId"='4f9b0aae-...' and u."companyId"<>'4f9b0aae-...' -> devolve a linha. Sweep automatizado nos 41 modulos: 41/41 aceitam no POST (201) e 41/41 gravam no PUT (200 + persistiu). stallionId: PUT /reproduction-donor-insemination/<id> {"stallionId":"2a86e148-c9b6-4515-ac81-d74258520cc4"} -> 200, valor gravado = animal da empresa f4e2f01e-....
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

### DELETE /invoice apaga fatura JA PAGA sem bloqueio e deixa a movimentacao recebida orfa

- **Rota:** `DELETE /invoice/:id`
- **Impacto:** O documento fiscal e o bankPaymentId do Asaas somem; o dinheiro permanece no caixa sem lastro nem origem rastreavel. A FK invoiceId e ON DELETE SET NULL, entao nao ha nem erro nem cascata.
- **Reprodução:** Fatura F2-001-B com status PAID, amount 9999 e bankPaymentId pay_i6eak0g802b5ifmh. DELETE /invoice/d28419d1-... -> 200 sem aviso. SQL: select count(*) from invoices where id='d28419d1-...' -> 0. SQL: select id,name,amount,"invoiceId" from sheduled_payments where name like 'Fatura F2%' -> 6315a12a-...|Fatura F2-001-B|399.99|NULL. GET /payment?page=1 continua listando 'Fatura F2-001-B' com invoiceNumber null.
- **Módulo:** F2-financeiro (/transaction, /transact

### Autoria do anexo (uploadedBy) e responsavel da ficha vem do body: da para forjar com usuario de OUTRA empresa

- **Rota:** `PUT /exam/:id (e todas as fichas com anexo)`
- **Impacto:** Trilha de auditoria de anexo clinico falsificavel e referencia cruzada entre tenants gravada em banco. Em ficha clinica isso e assinatura de responsabilidade tecnica.
- **Reprodução:** Com token da empresa b19c5017: PUT /exam/e7244d6f-2a6a-4a4a-bb21-01f9bd11afdd {"userId":"41514ceb-4ae4-4491-a431-e7a5fccfc5c7","attachments":[{"url":"https://cdn/forjado.pdf"}]} -> 200. SQL: select a.url,a."uploadedBy",u."companyId" from attachments a left join users u on u.id=a."uploadedBy" where a.url='https://cdn/forjado.pdf' -> uploadedBy de company f4e2f01e. E exams.userId tambem ficou apontando para usuario de outra empresa. Variante: PUT sem userId grava uploadedBy=NULL (autoria perdida); ja ha 324 anexos com uploadedBy nulo no banco.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

# MENOR

## ATENDIMENTO

### Status do animal nao tem maquina de estados: pula etapa, volta de FINISHED e finaliza duas vezes

- **Rota:** `PUT /appointment-animal/:id`
- **Impacto:** Pode ser intencional para permitir correcao, mas hoje nada impede reabrir um atendimento ja finalizado/faturado.
- **Reprodução:** Sobre o mesmo vinculo 539740e5-...: PENDING -> FINISHED (200, pulou IN_PROGRESS); FINISHED -> FINISHED (200); FINISHED -> PENDING (200); FINISHED -> IN_PROGRESS (200). Todas persistiram.
- **Módulo:** atendimentos (/appointment + /appointm

### page e obrigatorio em /appointment/fetch e opcional/ignorado em /appointment-animal

- **Rota:** `GET /appointment/fetch vs GET /appointment-animal`
- **Impacto:** Contrato inconsistente entre as duas listagens do mesmo modulo; page invalido e silenciosamente aceito em uma delas.
- **Reprodução:** GET /appointment/fetch -> 400 'O campo page e obrigatorio.' GET /appointment-animal -> 200 (assume 1). GET /appointment/fetch?page=abc -> 400. GET /appointment-animal?page=abc -> 200 (assume 1 sem avisar).
- **Módulo:** atendimentos (/appointment + /appointm

### Nenhuma ficha de saúde tem vínculo com atendimento (funcionalidade inexistente)

- **Rota:** `POST /vaccine, POST /deworming, POST /exam, POST /shoeing`
- **Impacto:** O foco 'vínculo com atendimento' da auditoria não tem o que testar: registrar a vacina aplicada durante um atendimento não deixa rastro do atendimento.
- **Reprodução:** Leitura de prisma/schema.prisma linhas 1849-1946: os modelos Exam, Vaccine, Deworming e Shoeing só têm FK para animal e user. Não existe appointmentId nem appointmentAnimalId em nenhum deles, e nenhum DTO aceita esse campo.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### animalId aceito e descartado em silencio no upsert de owner-note ja existente

- **Rota:** `POST /owner-note/:appointmentAnimalId`
- **Impacto:** Campo enviado nao e gravado e a API responde sucesso.
- **Reprodução:** No ramo existing do upsert so description e userId sao atualizados; animalId e validado e jogado fora. POST /owner-note/3685c813-... {"animalId":"1bff551e-..."} sobre nota existente -> 201 devolvendo animalId 4a8c28dd (o valor antigo), sem aviso.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### Sem limite de tamanho em campo texto e sem faixa de data valida

- **Rota:** `PUT /<41 rotas>/:id e POST /<41 rotas>/:appointmentAnimalId`
- **Impacto:** Nenhum dos 41 DTOs tem @MaxLength em campo texto: uma observacao de 100.000 caracteres entra no banco sem aviso (vetor para inflar o banco e quebrar layout de PDF/tela). Datas absurdas (ano 0001, ano 9999) entram no prontuario clinico sem qualquer validacao de faixa - a validacao existente so rejeita data sintaticamente invalida.
- **Reprodução:** PUT /general-test/<id> {"observation":"x" repetido 100000 vezes} -> OBSERVADO 200, GET seguinte devolve observation com length 100000. POST /reproduction-receptor-heat/660f537b-... {"animalId":"e09485b9-...","userId":"b092e935-...","date":"9999-12-31T00:00:00.000Z","leftOvary":"L"} -> OBSERVADO 201; mesma coisa com "0001-01-01T00:00:00.000Z" -> OBSERVADO 201; GET devolve ambas gravadas. Comparar: date "2026-02-31T00:00:00.000Z" -> 400 (essa validacao dispara).
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

### POST /appointment com token de cliente devolve 404 em vez de 403

- **Rota:** `POST /appointment`
- **Impacto:** Fecha o acesso, mas com código e mensagem errados. As rotas irmãs acertam: PUT /appointment/:id e DELETE /appointment/:id respondem 403 'Você não tem permissão para realizar esta ação.'
- **Reprodução:** POST /appointment {type:'SERVICE', startDate, endDate, userId, studFarmId, animals:[{animalId:<próprio>,appointmentType:'Consulta'}]} com token de cliente -> 404 'Registro não encontrado. Confira os dados informados e tente novamente.' O atendimento não é criado.
- **Módulo:** F3 - Portal do cliente / app do propri

## CLINICO

### periodDays negativo aceito no item de protocolo sanitário

- **Rota:** `POST /sanitary-protocol/item, PUT /sanitary-protocol/item/:itemId`
- **Impacto:** Protocolo com período negativo ou zero gera agendamento sem sentido.
- **Reprodução:** POST /sanitary-protocol/item {"protocolId":"<id>","name":"Neg","type":"EXAM","periodDays":-500,"isRecurrent":false} -> 201. PUT /sanitary-protocol/item/<id> {"periodDays":0} -> 200 e persiste 0. Não há @Min(1) no DTO.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### /exam não tem rota soon, apesar de gravar nextDate

- **Rota:** `GET /exam/soon/:animalId (inexistente)`
- **Impacto:** Exame com renovação vencendo não aparece em nenhum alerta de 'próximos', diferente das outras três fichas.
- **Reprodução:** GET /exam/soon/<animalId> -> 404 'Cannot GET /exam/soon/...'. vaccine, deworming e shoeing têm a rota equivalente e ela funciona (janela de 15 dias). equinology-app-v2/lib/api-routes.ts confirma que o bloco Exam não tem 'soon'.
- **Módulo:** Saúde do animal (/vaccine, /deworming,

### companyId aceito no EditDto dos 41 e descartado em silencio

- **Rota:** `PUT /<41 rotas de ficha>/:id`
- **Impacto:** O campo companyId esta publicado nos 41 Edit*Dto (e no Swagger) mas o controller sempre sobrescreve com o companyId do token. Do ponto de vista de seguranca esta correto, mas e exatamente o padrao 'campo aceito e ignorado' que ja mordeu esta base: quem ler o contrato acha que da para mover a ficha de empresa.
- **Reprodução:** PUT /general-info/<id> {"companyId":"f4e2f01e-49fb-4ccd-b02c-df1d645aeca5"} -> OBSERVADO 200. GET /general-info?page=1&animalId=e09485b9-... -> companyId continua 4f9b0aae-dc61-4878-9d3d-9ebb02ce1bfc.
- **Módulo:** F2 - Fichas clinicas: GET / PUT / DELE

### Mensagens de erro em ingles em duas situacoes de anexo/upload

- **Rota:** `POST /file, PUT de fichas com anexo`
- **Impacto:** Usuario final ve mensagem em ingles. O resto das mensagens de upload esta correto e em portugues.
- **Reprodução:** POST /file sem nenhum arquivo -> 400 {"message":"File is required"}. PUT /exam/<id> {"attachments":[null]} -> 400 {"message":["each value in nested property attachments must be either object or array"]}. Mesmo texto aparece com attachments:'nao-e-array' e attachments:[{url:'ok'},'texto'].
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### url do anexo aceita qualquer string; sem limite de quantidade e sem limite de tamanho

- **Rota:** `POST/PUT de qualquer ficha com anexo`
- **Impacto:** Se o front renderizar <a href={anexo.url}> sem sanitizar, javascript: vira XSS armazenado. Nao validei o front, entao registro como problema de contrato da API, nao como XSS confirmado. Sem teto de quantidade tambem infla payload e coluna legada.
- **Reprodução:** PUT /exam/<id> {"attachments":[{"url":"javascript:alert(1)"},{"url":"nao-e-url"},{"url":"X"x5000}]} -> 200; o GET devolve os tres intactos, inclusive a string de 5000 chars. POST /exam com 500 anexos -> 201, e o GET devolve os 500 mais a coluna legada com as 500 URLs concatenadas num unico campo. AttachmentDto.url so tem @IsString + @IsNotEmpty.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

## DINHEIRO / ASSINATURA

### Mensagem generica quando a janela de reembolso venceu

- **Rota:** `PUT /signature/refound/:signatureId`
- **Impacto:** A mensagem nao diz que o prazo de 7 dias expirou e e a mesma usada para 'assinatura de outra empresa'. Suporte nao consegue diferenciar prazo vencido de tentativa de acesso indevido.
- **Reprodução:** Com refoundDateLimit setado em 2020-01-01 via SQL: PUT /signature/refound/a2222ebb-84ec-4726-83c6-2fe7070455e4 -> 403 {"message":"Voce nao tem permissao para realizar esta acao.","code":"NOT_ALLOWED"}. Banco confirma status inalterado (ACTIVE).
- **Módulo:** F2-assinatura (signature, signature-pl

### Erro cru do Asaas vaza quando o cupom zera o valor

- **Rota:** `POST /signature/pix/:planId`
- **Impacto:** applyCouponToValue zera o valor com Math.max(0, ...) e o provedor rejeita. O codigo HTTP esta certo, mas a mensagem tecnica do gateway nao faz sentido para a clinica.
- **Reprodução:** POST /signature/pix/aaaaaaaa-0000-4000-8000-00000000f201 {"yearly":false,"couponId":"aaaaaaaa-0000-4000-8000-00000000c202"} (cupom FIXED de 9999 sobre plano de 459,90) -> 400 {"message":"O parametro value deve ser informado","code":"PAYMENT_ERROR"}. Nao deixou lixo no banco (contagem de assinaturas inalterada).
- **Módulo:** F2-assinatura (signature, signature-pl

### Renovacao encurta o periodo em vez de somar ao saldo restante

- **Rota:** `POST /signature/webhook (PAYMENT_CONFIRMED)`
- **Impacto:** Se a cobranca confirmar antes do vencimento, os dias restantes sao perdidos. Impacto pequeno enquanto o provedor cobrar exatamente no vencimento; vira perda real em cobranca antecipada ou retry.
- **Reprodução:** Assinatura CREDIT_CARD com expiracao 2026-09-02 17:40:12. Webhook PAYMENT_CONFIRMED com paymentId novo -> expiracao virou 2026-09-02 17:40:27, ou seja agora+1 mes, e nao expiracao_anterior+1 mes. Codigo: linhas 473-475 e 461-463 usam moment().add(...).
- **Módulo:** F2-assinatura (signature, signature-pl

### Receita do resumo financeiro so varre assinaturas ACTIVE e faz N+1 de chamadas ao Asaas

- **Rota:** `GET /admin/financial/summary`
- **Impacto:** Risco de faturamento subestimado apos cancelamentos e de timeout do dashboard financeiro conforme a base cresce.
- **Reprodução:** Leitura de adminFinancial.service.ts: getPaymentsForPeriod itera apenas fetchActiveWithPlans(), enquanto /transactions lista transacoes de assinaturas de qualquer status - os dois numeros nao fecham entre si. Um pagamento recebido de empresa que depois cancelou (INACTIVE) desapareceria retroativamente do faturamento do mes. NAO consegui reproduzir com valor real: revenueMonth e revenuePreviousMonth voltaram 0 em todas as chamadas porque nao ha pagamento RECEIVED no sandbox. Efeito colateral ja observavel: ambas as rotas fazem 1 chamada ao Asaas por assinatura; com 30 assinaturas o /transactions ja dispara ~30 requisicoes externas por pageview.
- **Módulo:** Painel interno Equinology (/admin/*) -

## FINANCEIRO / ESTOQUE

### Transferencia geral<->volante nao gera movimentacao no extrato

- **Rota:** `POST /field-stock, PUT /field-stock/:id, GET /stock-movements`
- **Impacto:** Nao da para auditar quem levou o que para o campo, e o extrato nao tem o valor do que saiu.
- **Reprodução:** POST /product-stock (10 un) aparece em /stock-movements como entry:10. POST /field-stock (4 un) NAO aparece. POST /product-usage (2 un) aparece como exit:2 - porem com unitValue:null e totalValue:null. Devolucao via PUT /field-stock/:id tambem nao aparece.
- **Módulo:** F2 - estoque e CRM

### Campos numericos sem limite inferior e textos sem limite de tamanho

- **Rota:** `POST /lead, POST /tag, POST /product`
- **Impacto:** Dado sem sentido gravado e quebra de layout nas telas.
- **Reprodução:** POST /lead com animalQuantity -99 -> 201 e grava -99. POST /tag com name de 5000 caracteres -> 201. POST /product com name de 5000 caracteres -> 201. Nenhum DTO usa @Min ou @MaxLength.
- **Módulo:** F2 - estoque e CRM

### Grafico de GET /transaction/statistics inclui um mes a mais no inicio dos labels

- **Rota:** `GET /transaction/statistics`
- **Impacto:** O bucket extra serve de baseline (lastMonthBalance) mas esta dentro de chartData, que e exatamente o que o grafico plota - aparece um mes fantasma.
- **Reprodução:** GET /transaction/statistics?startDate=2026-01-01&endDate=2026-03-31 -> chartData.labels = ['dezembro','janeiro','fevereiro','marco'] (4 rotulos para 3 meses). Com o range de 12 meses: 13 rotulos, comecando e terminando em 'dezembro'. Range invertido (startDate > endDate) -> 200 com tudo vazio, sem erro.
- **Módulo:** F2-financeiro (/transaction, /transact

### /transaction-category sem exclusao e com PUT tudo-ou-nada

- **Rota:** `PUT /transaction-category/:id, DELETE /transaction-category/:id`
- **Impacto:** EditTransactionCategoryDto nao marca nada como opcional: renomear exige reenviar o tipo. Trocar o type da categoria nao toca no type dos lancamentos ja classificados (verifiquei: categoria OUTCOME com 4 transacoes INCOME dentro).
- **Reprodução:** PUT /transaction-category/<id> {"name":"So nome"} -> 400 ['Insira um tipo de categoria valido','Insira um tipo de categoria valido']. POST com nome ja existente -> 201. POST com nome de 5000 chars -> 201. DELETE /transaction-category/<id> -> 404 (rota nao existe).
- **Módulo:** F2-financeiro (/transaction, /transact

### Mensagens de validacao duplicadas e uma em ingles com lista vazia

- **Rota:** `POST /transaction, GET /transaction-category/with-value, GET /invoice`
- **Impacto:** Mensagem feia mas compreensivel na maioria; a do orderBy nao diz ao usuario quais valores sao aceitos.
- **Reprodução:** POST /transaction sem paymentId -> ['Insira um pagamento agendado valido','Insira um pagamento agendado valido']. GET /transaction-category/with-value sem datas -> 4 mensagens, cada uma repetida 2x. GET /invoice?page=1&orderBy=xxx -> ['orderBy must be one of the following values: '] (ingles e lista de valores vazia).
- **Módulo:** F2-financeiro (/transaction, /transact

### quantity sem teto em POST /payment: 1000 parcelas em uma requisicao

- **Rota:** `POST /payment`
- **Impacto:** Uma requisicao gera 1000 inserts e polui a listagem de movimentacoes; sem limite superior de parcelas.
- **Reprodução:** POST /payment {...,"quantity":1000} -> 201. SQL: select count(*) from transactions t join sheduled_payments p on p.id=t."paymentId" where p.name='Q1000' -> 1000.
- **Módulo:** F2-financeiro (/transaction, /transact

### Codigo morto em PaymentController.fetch: ramo tokenType==='client' inalcancavel

- **Rota:** `GET /payment`
- **Impacto:** Nao e vazamento - e protecao redundante que da a impressao de que a rota serve o app do proprietario, quando na pratica o app usa outra rota.
- **Reprodução:** GET /payment?page=1 com token de cliente -> 403 {"message":"Usuario nao encontrado","code":"FORBIDDEN"}. O controller inteiro esta sob @Roles('ADMIN','GESTOR'), entao o bloco 'if (tokenType === client) clientId = userId' nunca executa.
- **Módulo:** F2-financeiro (/transaction, /transact

### page obrigatório só em /client-invoice, opcional nas rotas irmãs da mesma tela

- **Rota:** `GET /client-invoice`
- **Impacto:** O controller já faz 'page: query.page || 1', ou seja, o código foi escrito esperando page opcional, mas o DTO marca como obrigatório. O app consome as três na mesma tela e precisa tratar uma diferente das outras duas.
- **Reprodução:** GET /client-invoice (sem page) -> 400 ["O campo page deve ser no mínimo 1.","O campo page deve ser um número inteiro."]. GET /client-payment (sem page) -> 200. GET /appointment/client (sem page) -> 200.
- **Módulo:** F3 - Portal do cliente / app do propri

## OUTROS

### updatedAt da empresa nunca e atualizado

- **Rota:** `PUT /company`
- **Impacto:** Qualquer tela ou relatorio de 'ultima alteracao' do cadastro da clinica fica errado.
- **Reprodução:** Apos 4 PUT /company bem-sucedidos, GET /company e SQL mostram updatedAt = 2026-08-02 17:24:05.534, identico ao createdAt.
- **Módulo:** F1 - acesso e conta (user, company, pa

### Mensagens de validacao repetidas 2-3x para o mesmo campo

- **Rota:** `POST /password-code, PUT /user/password`
- **Impacto:** Todos os decorators do campo usam a mesma string, entao o front exibe o erro triplicado.
- **Reprodução:** POST /password-code {} -> message: ["Insira um email valido","Insira um email valido","Insira um email valido"]. PUT /user/password {"password":"x"} -> ["Informe um codigo valido","Informe um codigo valido"].
- **Módulo:** F1 - acesso e conta (user, company, pa

### Campo enviado vazio e descartado em silencio com resposta 200

- **Rota:** `PUT /user/profile`
- **Impacto:** A API responde sucesso para uma operacao que nao aconteceu. O comportamento (if (name)) e intencional para proteger colunas NOT NULL, mas deveria devolver 400 em vez de 200.
- **Reprodução:** PUT /user/profile {"name":""} -> 200. GET /user mostra o nome anterior (Dra F1 Editada) inalterado.
- **Módulo:** F1 - acesso e conta (user, company, pa

### POST /user devolve 201 com corpo vazio (nao retorna id do usuario criado)

- **Rota:** `POST /user`
- **Impacto:** POST /client ja foi corrigido para devolver o recurso criado; POST /user nao. Forca round-trip extra e impede o front de navegar direto para o registro novo.
- **Reprodução:** POST /user com payload valido -> 201 com corpo vazio. O front precisa refazer GET /user para descobrir o id. Mesmo padrao em PUT /user/profile, PUT /user/:userId, PUT /company e POST /client/link.
- **Módulo:** F1 - acesso e conta (user, company, pa

### photoUrl do animal aceita qualquer string, sem validar URL

- **Rota:** `POST /animal, PUT /animal/:id`
- **Impacto:** Se o front renderizar em <img src> ou num link, vira vetor de XSS.
- **Reprodução:** POST /animal {"name":"FotoLixo","breed":"Y","gender":"STALLION","photoUrl":"javascript:alert(1)"} -> 201 e o valor e gravado literal (confirmado no corpo da resposta). O DTO usa @IsString() em vez de @IsUrl().
- **Módulo:** F1 - cadastros base: cliente, propried

### PUT /animal grava string vazia onde client e stud-farm normalizam para null

- **Rota:** `PUT /animal/:id`
- **Impacto:** O front tera que tratar dois tipos de vazio (null e '') so no modulo de animal.
- **Reprodução:** PUT /client {"phone":""} -> grava null (correto). PUT /stud-farm {"city":"","responsibleName":""} -> grava null (correto). PUT /animal {"color":"","photoUrl":""} -> grava string vazia '' (divergente). PUT /animal {"studFarmId":""} -> grava null (correto, desvincula).
- **Módulo:** F1 - cadastros base: cliente, propried

### Nenhum campo de texto tem limite de tamanho

- **Rota:** `POST /animal, POST /stud-farm, PUT /client`
- **Impacto:** Quebra qualquer listagem, dropdown ou relatorio que renderize o campo.
- **Reprodução:** POST /animal {"name": 'A' repetido 10000 vezes} -> 201 e gravado inteiro. POST /stud-farm {"name": 'B' x 10000} -> 201 gravado inteiro. PUT /client {"name": 'A' x 5000} -> 200. As colunas sao text, entao nao estoura, mas falta @MaxLength nos DTOs.
- **Módulo:** F1 - cadastros base: cliente, propried

### Fases do CRM aceitam posicao duplicada e mais de uma fase isLast=true

- **Rota:** `POST /board`
- **Impacto:** Ordem do kanban indefinida e o filtro filter=close passa a ter duas fases-destino.
- **Reprodução:** Com Fase 1 (position 1) e Fechado (position 4, isLast true) ja existentes: POST /board {"name":"Dup","position":1,"isLost":false,"color":"#fff","isLast":true} -> 201. GET /board devolve duas fases em position 1 e duas com isLast=true.
- **Módulo:** F2 - estoque e CRM

### POST /animal-note com animal inexistente responde 403 sem permissao em vez de 404

- **Rota:** `POST /animal-note`
- **Impacto:** Mensagem nao explica o problema real ao usuario.
- **Reprodução:** POST /animal-note {"content":"x","animalId":"00000000-0000-4000-8000-000000000000"} -> 403 com mensagem Voce nao tem permissao para realizar esta acao. isAnimalFromCompany colapsa nao existe e e de outra empresa no mesmo NotAllowedError.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### POST devolve 201 com corpo vazio em /note, /animal-note e /reminder

- **Rota:** `POST /note, POST /animal-note, POST /reminder`
- **Impacto:** Front nao recebe o id do registro criado; inconsistente dentro do proprio modulo.
- **Reprodução:** Os tres controllers so tratam o ramo isLeft() e nao retornam nada no sucesso: POST /note -> 201 corpo vazio; POST /animal-note -> 201 vazio; POST /reminder -> 201 vazio. Ja POST /owner-note e POST /client-portal/animal-note devolvem o objeto criado.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### Recorrencia MONTHLY/YEARLY em dia 29, 30 ou 31 some nos meses curtos

- **Rota:** `GET /reminder/by-date`
- **Impacto:** Lembrete mensal nao ocorre em meses com menos dias.
- **Reprodução:** fetchByDate compara startBrt.date() === queryDom, sem fallback. Lembrete MONTHLY criado em 2026-01-31: GET /reminder/by-date?date=2026-07-31 -> aparece; ?date=2026-09-30 -> nao aparece; ?date=2026-02-28 -> nao aparece.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### /animal-note/company e /animal-note/by-date nao tem paginacao

- **Rota:** `GET /animal-note/company, GET /animal-note/by-date`
- **Impacto:** Payload sem teto numa clinica com historico grande.
- **Reprodução:** Controllers e AnimalNoteService.fetchByCompany/fetchByDate nao recebem page nem take; findManyByCompanyId devolve tudo. A resposta observada retorna a lista inteira, sem campo pages.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### /reminder nao notifica nada: nao existe job, push nem e-mail de lembrete

- **Rota:** `GET /reminder/by-date`
- **Impacto:** Se o produto promete lembrete que avisa na data, a funcionalidade nao existe. Nao fechei a verificacao com produto.
- **Reprodução:** Busca por @Cron em todo o src: os unicos schedulers sao inactiveUsers.scheduler.ts e expireTrialSignatures.scheduler.ts; nenhuma referencia a Reminder em jobs ou notificacao. O recurso e apenas uma lista consultada sob demanda.
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### GET /note/by-date ignora o campo date da anotacao e filtra por createdAt

- **Rota:** `GET /note/by-date`
- **Impacto:** Se o usuario le date como quando a anotacao acontece, o card anotacoes do dia mostra o dia errado.
- **Reprodução:** Nota criada em 2026-08-02 com date=2026-08-05T14:00:00.000Z: GET /note/by-date?date=2026-08-05 -> {"notes":[]}; GET /note/by-date?date=2026-08-02 -> devolve as 13 notas. O repositorio filtra por createdAt (comportamento comentado como intencional no codigo).
- **Módulo:** F2 - anotacoes e lembretes (/note, /an

### /bank-account sem validacoes de conteudo e sem rota de exclusao

- **Rota:** `POST /bank-account, DELETE /bank-account/:id`
- **Impacto:** Conta criada por engano nao tem como ser removida pela API. Nota sobre walletId: o campo NAO pertence a bank-account, mora em companies e so e gravavel pelas rotas admin, que apenas fazem trim() - a base ja tem walletId='wlt_teste' gravado (company 7f5174fb-...), ou seja, zero validacao contra o Asaas. Fora do meu conjunto de 26 rotas, mas o PIX inteiro depende dele.
- **Reprodução:** POST /bank-account {name:'Neg',initialBalance:-500} -> 201 (saldo negativo aceito). POST com name de 5000 chars -> 201. POST com nome ja existente -> 201 (duplicado). DELETE /bank-account/<id> -> 404 'Cannot DELETE /bank-account/<id>' (rota nao existe).
- **Módulo:** F2-financeiro (/transaction, /transact

### PUT /admin/companies/:id nao atualiza updatedAt

- **Rota:** `PUT /admin/companies/:id`
- **Impacto:** Auditoria de quando o cadastro da empresa foi alterado fica inutil.
- **Reprodução:** Empresa 30c6c97e-57ac-4c1f-b081-154cc085ed10 criada em 17:38:19.590. Apos dois PUT bem-sucedidos que alteraram name, address, number, postalCode, walletId e cnpj, o SQL continua com updatedAt = 2026-08-02 17:38:19.59, identico a createdAt. Comparacao: o modulo de cupons faz certo (updatedAt mudou de 17:45:25 para 17:45:35 apos o PUT).
- **Módulo:** Painel interno Equinology (/admin/*) -

### Mensagens de erro em ingles e mensagem enganosa para data impossivel em anuncios

- **Rota:** `POST /admin/auth/signin, POST /admin/tutorials, POST /admin/ads`
- **Impacto:** Operador ve mensagem em ingles ou e mandado corrigir o campo errado.
- **Reprodução:** Rate-limit do signin: 'ThrottlerException: Too Many Requests'. POST /admin/tutorials com 13 capitulos: 'chapters must contain no more than 12 elements'. POST /admin/ads com imagem >5MB: 'Validation failed (expected size is less than 5242880)'. POST /admin/ads com validFrom='2026-02-31' e validUntil='2026-03-01': responde 'A data final deve ser igual ou posterior a inicial.' - mas o problema e a data inicial ser invalida, nao a ordem (o modulo de cupons acerta esse caso com 'Datas de validade invalidas.').
- **Módulo:** Painel interno Equinology (/admin/*) -

### signin rejeita e-mail com espacos apesar de o service fazer trim(), e repete a mesma mensagem 3x

- **Rota:** `POST /admin/auth/signin`
- **Impacto:** E-mail colado de gerenciador de senhas falha sem explicar o motivo; lista de erros duplicada polui a tela.
- **Reprodução:** {"email":"  ADMIN@TESTE.COM ","password":"Admin@12345"} -> 400 'Insira um email valido' (o @IsEmail do DTO barra antes do trim do AdminAuthService). {"email":"ADMIN@TESTE.COM",...} -> 201 (maiuscula funciona, espaco nao). Com body vazio {}: a mensagem 'Insira um email valido' aparece 3x repetida e 'Insira uma senha valida' 2x.
- **Módulo:** Painel interno Equinology (/admin/*) -

### content da anotação do proprietário sem limite de tamanho

- **Rota:** `POST /client-portal/animal-note`
- **Impacto:** Sem @MaxLength no DTO e sem teto de quantidade de notas. Um app com bug (ou má-fé) enche a tabela animal_notes.
- **Reprodução:** POST /client-portal/animal-note {animalId:<próprio>, content:'x'.repeat(200000)} com token de cliente -> 201, gravado inteiro no banco.
- **Módulo:** F3 - Portal do cliente / app do propri

### POST /animal com gender fora do enum devolve 404 em vez de 400 (fora do meu conjunto, apareceu no caminho)

- **Rota:** `POST /animal`
- **Impacto:** O DTO valida gender só com @IsString(), então o valor inválido só quebra lá na frente e sai como 404 enganoso, sem dizer quais categorias existem (STALLION, CASTRATED, MATRIX, DONOR, RECEPTOR). Fora do meu conjunto — repasse ao agente do módulo animal.
- **Reprodução:** POST /animal {name:'Cavalo B', breed:'MM', gender:'MARE', sex:'FEMALE', birthDate:'2019-05-10', clientId, studFarmId, color:'Tordilho'} com token da clínica -> 404 'Registro não encontrado. Confira os dados informados e tente novamente.' Com gender:'MATRIX' o mesmo payload -> 201.
- **Módulo:** F3 - Portal do cliente / app do propri

### Anuncio REGIONAL aparece na vitrine publica nacional

- **Rota:** `GET /ads/sponsors`
- **Impacto:** Quem paga anuncio regional (so SP) esta sendo exibido no Brasil inteiro no site institucional. Pode ser intencional para a LP — vale confirmar com o dono antes do lancamento.
- **Reprodução:** GET /ads/sponsors (sem token) -> ['F3 Ad RJ|REGIONAL','F3 Ad SP|REGIONAL','F3 Ad Global|GLOBAL']. fetchActive() nao aplica filtro de localizacao nenhum. Comparar com GET /ads (com token), que filtra corretamente por UF do CEP da empresa.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### POST /file aceita arquivo de 0 byte

- **Rota:** `POST /file`
- **Impacto:** Gera anexo vazio na ficha; o usuario ve um item que nao abre.
- **Reprodução:** POST /file com PNG de tamanho 0 -> 201, arquivo publicado no bucket. Nao ha MinFileSizeValidator.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

### GET /ads/client aceita token de usuario da clinica (deveria ser token de cliente)

- **Rota:** `GET /ads/client`
- **Impacto:** Nao vaza dado de ninguem — apenas aceita silenciosamente o tipo errado de token, o que mascara erro de integracao.
- **Reprodução:** GET /ads/client com Bearer de usuario da clinica -> 200 {"advertisements":[GLOBAL]}. A rota usa @CurrentUserId() e busca clientCompany where clientId = sub do JWT; com token de usuario o sub e um userId, a busca nao acha nada e devolve os anuncios GLOBAL em vez de 401/403.
- **Módulo:** F3 - anexos e arquivos (/file, /ads, /

## SEGURANCA / ISOLAMENTO

### Animal aceita ser criado em propriedade de outro cliente sem aviso

- **Rota:** `POST /animal`
- **Impacto:** Pode ser intencional (animal hospedado em haras de terceiro). Nao fechei porque nao conheco a regra de negocio - vale confirmar com o dono. Se nao for intencional, e dado inconsistente entrando sem barreira.
- **Reprodução:** POST /animal {"name":"CruzaDono","breed":"Y","gender":"STALLION","clientId":<Cliente Um>,"studFarmId":<propriedade do Cliente Dois>} -> 201, aceito sem nenhuma validacao cruzada. Ambos os registros sao da MESMA empresa, entao nao ha vazamento de tenant aqui.
- **Módulo:** F1 - cadastros base: cliente, propried

