# F2-adm

Varredura do painel interno (`/admin/*`) contra a API rodando em `http://localhost:3333`,
com confirmacao no banco (`docker exec vetequus-local psql`) e no Asaas sandbox.
Nenhum arquivo `.ts` foi alterado.

## Cobertura: 40 / 40 rotas

| Grupo | Rotas | Status |
|---|---|---|
| `/admin/auth` | `POST signin`, `GET me`, `PATCH token` | 3/3 |
| `/admin/users` | `GET`, `POST`, `PATCH :id` | 3/3 |
| `/admin/admins` | `GET`, `POST`, `PATCH :id` | 3/3 |
| `/admin/companies` | `GET`, `POST`, `GET :id`, `PUT :id` | 4/4 |
| `/admin/plans` | `POST`, `PUT :id`, `DELETE :id` | 3/3 |
| `/admin/signature` | `GET`, `POST create/:companyId/:planId`, `PATCH :id`, `POST cancel/:id`, `POST reactivate/:id`, `POST renew-yearly/:id`, `POST change-plan/:id`, `POST charge/:id`, `GET :id/history`, `GET :id/receipt` | 10/10 |
| `/admin/coupons` | `POST`, `PUT :id`, `DELETE :id`, `GET` | 4/4 |
| `/admin/ads` | `POST`, `PUT :id`, `DELETE :id`, `GET` | 4/4 |
| `/admin/tutorials` | `POST`, `PUT :id`, `DELETE :id`, `GET` | 4/4 |
| `/admin/financial` | `GET summary`, `GET transactions` | 2/2 |

### Nao testadas
Nenhuma rota do conjunto ficou de fora.

Lacunas de profundidade (declaradas honestamente):
- `revenueMonth` / `revenuePreviousMonth` de `/admin/financial/summary` sempre retornaram `0`
  porque nao consegui marcar nenhuma cobranca como `RECEIVED` no Asaas sandbox. O achado #10
  sobre o escopo do calculo veio de leitura do codigo + comportamento observado de `/transactions`,
  nao de um numero errado reproduzido — esta marcado como SUSPEITO.
- Nao testei o rate-limit do `signin` sob concorrencia, so a contagem sequencial (dispara no 2o request
  depois de ~9 chamadas na janela; a protecao existe e funciona).
- Isolamento entre empresas nao se aplica: o painel e global por design (super_admin e support veem
  todas as empresas). O que testei no lugar foi a matriz de permissao entre roles (achado #2).

---

## Achados

### 1. BLOQUEIA — Token de admin desativado (ou apagado) continua com acesso total ao painel
`AdminAuthGuard` (`src/infra/shared/auth/admin-auth.guard.ts`) apenas verifica a assinatura do JWT e
`payload.type === 'admin'`. Nunca consulta `admin_users`. Nao checa `active` nem se a conta existe.
So `GET /admin/auth/me` e `PATCH /admin/auth/token` checam `active`.
O token tem validade de 90 dias (`iat` 1785692226 / `exp` 1793468226).

Reproducao:
1. `POST /admin/admins` cria `suporte.f2@teste.com` (role `support`), guarda o token do `signin`.
2. `PATCH /admin/admins/74cf705f-...` com `{"active": false}` -> 200, `active: false` no banco.
3. Com o token ANTIGO:
   - `GET /admin/auth/me` -> **401** (checa active)
   - `GET /admin/users` -> **200** (lista os 40 usuarios da base)
   - `POST /admin/plans` -> **201** (criou o plano "F2ADM Desativado")
   - `DELETE /admin/plans/<id>` -> **200** (apagou o plano)
4. Pior: `docker exec ... "delete from admin_users where id='74cf705f-...'"` (conta APAGADA) e o
   mesmo token ainda devolve `GET /admin/financial/summary` -> **200**
   `{"revenueMonth":0,"revenuePreviousMonth":0,"activeSubscriptions":5,"trialSubscriptions":13}`
   e `GET /admin/companies` -> **200**.

Impacto: desligar um admin nao desliga nada. Ex-funcionario mantem acesso a precos, empresas,
assinaturas e financeiro por ate 90 dias, e nao existe rota de revogacao.

---

### 2. BLOQUEIA — Role `support` tem poder de super_admin em tudo que importa (billing, precos, usuarios)
Apenas 2 das 40 rotas usam `AdminSuperAdminGuard`: `POST /admin/admins` e `PATCH /admin/admins/:id`.
As outras 38 exigem so `AdminAuthGuard`.

Matriz medida com token de um admin `role: support`:

| Rota | HTTP observado |
|---|---|
| `POST /admin/admins` | 403 "Apenas super administradores podem realizar esta acao." |
| `PATCH /admin/admins/:id` | 403 (idem) |
| `GET /admin/admins` | **200** (lista todos os admins e e-mails do painel) |
| `GET /admin/users` | **200** (40 usuarios de todas as empresas) |
| `POST /admin/users` | **201** (criou usuario em empresa arbitraria) |
| `GET /admin/companies` | **200** |
| `GET /admin/signature` | **200** |
| `GET /admin/coupons` | **200** |
| `GET /admin/ads` / `/admin/tutorials` | **200** |
| `GET /admin/financial/summary` | **200** |
| `GET /admin/financial/transactions` | **200** (todas as transacoes de todas as empresas) |
| `POST /admin/plans` + `DELETE /admin/plans/:id` | **201 / 200** (comprovado no passo 3 do achado #1) |

Ou seja: `support` cria/apaga planos (preco do produto), cria usuario ADMIN em qualquer empresa,
cancela/cobra/troca plano de assinatura e le o financeiro inteiro. A separacao de papel
so protege a criacao de outros admins.

---

### 3. BLOQUEIA — `POST /admin/signature/change-plan/:id` cancela a recorrencia no Asaas e nao cria nenhuma outra
`adminSignature.service.ts::changePlan` cancela `asaasSubscriptionId`, zera o campo, seta
`paymentId='sub_pending'`, `isAutoRenewActivated=false` e NAO cria assinatura nova no Asaas.
`status` continua `ACTIVE` e `expirationDate` intacta.

Reproducao:
1. `POST /admin/signature/create/258506bc-.../ad5e95fd-...` `{"yearly":false,"isTrial":false}` -> 201,
   banco com `asaasSubscriptionId = sub_gm9kpt7uhpbw2qfi`.
2. `PATCH /admin/signature/a5787b94-...` `{"status":"ACTIVE","expirationDate":"2026-12-31T00:00:00.000Z"}` -> 200.
3. `GET /admin/signature/a5787b94-.../history` -> `[{"id":"pay_vmjigjz5qjk03ixg","value":180.11,"status":"PENDING"}]`
4. `POST /admin/signature/change-plan/a5787b94-...` `{"planId":"aaaaaaaa-...-f201","yearly":false}` -> **201**
5. Banco: `status=ACTIVE`, `asaasSubscriptionId = NULL`, `isAutoRenewActivated=f`,
   `signaturePlanId` = novo plano (QA-F2-Pro, R$459,90/mes), `expirationDate = 2026-12-31`.
6. `GET .../history` -> `{"payments":[]}` — o historico anterior tambem some.

Impacto: a empresa muda para um plano mais caro, continua `ACTIVE` ate 31/12 e **nunca mais e cobrada**.
Perda de receita direta em toda troca de plano feita pelo painel.

---

### 4. BLOQUEIA — `reactivate` e `renew-yearly` criam assinatura NOVA a cada clique; recorrencias antigas ficam vivas no Asaas
Ambos delegam para `adminCreate`, que sempre faz `CompanySignature.create(...)`. A linha original
nunca e reaproveitada e a subscription anterior nunca e cancelada.

Reproducao (empresa `258506bc-a83e-4582-bfb0-c9fdff5e0a53`):
1. `POST /admin/signature/reactivate/a5787b94-...` -> 201, nova linha `2d68f386` com `sub_1w4vk1y0zlkkb3il`
2. `POST /admin/signature/reactivate/2d68f386-...` -> 201, nova linha `48fd1b73` com `sub_m06y8rptnkxzlbrl`
3. `POST /admin/signature/reactivate/2d68f386-...` -> 201, nova linha `bd002e84` com `sub_zgzh4t4ec9fadkye`
4. `POST /admin/signature/renew-yearly/2d68f386-...` -> 201, mais uma linha anual `3ff182c9`
   (sem cancelar `sub_1w4vk...`)
5. Banco: **6 linhas** em `law_firm_signatures` para a mesma empresa.
6. Prova do faturamento triplicado no Asaas:
   - `GET /admin/signature/2d68f386-.../history` -> `pay_vx5sipn0nqk2e40v` R$ **459.90** PENDING
   - `GET /admin/signature/48fd1b73-.../history` -> `pay_tjorce06ivehdyol` R$ **459.90** PENDING
   - `GET /admin/signature/bd002e84-.../history` -> `pay_nm88lfe9gk4kq3xm` R$ **459.90** PENDING

   Total R$ 1.379,70 pendente contra o mesmo cliente, mais R$ 4.966,92 da anual.

Extra: `reactivate` deixa a assinatura em `status = INACTIVE`. Ou seja, a rota chamada "reativar"
nao reativa o acesso da empresa — so cria cobranca.

---

### 5. GRAVE — `PUT /admin/companies/:id` aceita 4 campos, responde 200 e descarta todos em silencio
O controller usa `EditCompanyDto` (do modulo account), que declara `phone`, `logoUrl`, `pixKey` e
`signatureUrl`. `AdminCompanyUpdateService` so trata `name, address, number, postalCode, walletId, cnpj`.

Reproducao:
```
PUT /admin/companies/30c6c97e-57ac-4c1f-b081-154cc085ed10
{"phone":"11912345678","logoUrl":"https://cdn.x/logo.png","pixKey":"chave@pix.com","signatureUrl":"https://cdn.x/ass.png"}
-> HTTP 200, corpo com phone:null, logoUrl:null, pixKey:null, signatureUrl:null
```
Banco confirma: `phone`, `logoUrl`, `pixKey`, `signatureUrl` todos NULL.

Consequencia pratica: nao existe forma de cadastrar o telefone da empresa pelo painel — e o
telefone e exatamente o que quebra a criacao de assinatura (achado #6).

---

### 6. GRAVE — Empresa criada pelo painel nao consegue assinar; erro aponta um campo que o painel nem tem
`AdminCompanyCreateService` grava `paymentId = "admin-<uuid>"` (nao cria cliente no Asaas) e nao
valida CNPJ. Na hora da assinatura, `adminCreate` tenta criar o cliente Asaas usando
`company.cnpj ?? contact?.cpf ?? '00000000000000'` e `contact?.phone ?? '11999999999'`.

Reproducao:
1. `POST /admin/companies` `{"name":"Empresa F2 Admin","cnpj":"74605006425057",...}` -> 201,
   `paymentId: "admin-d639bb92-..."`.
2. `POST /admin/companies` `{"name":"Dup F2","cnpj":"11111111111111"}` -> **201** (CNPJ invalido aceito,
   e duplicado de outra empresa tambem aceito).
3. `POST /admin/signature/create/<empresa com cnpj 111...>/<plano>` -> **400** "O CPF/CNPJ informado e invalido."
4. Corrigindo o CNPJ para um valido -> **400** "O celular informado e invalido." — o telefone veio do
   primeiro usuario da empresa (`11999999999`), que o Asaas rejeita. E `11999999999` e justamente o
   fallback hardcoded do service, entao **empresa criada pelo painel SEM usuario nunca consegue assinar**:
   testado com a empresa `27a066f6` (0 usuarios) -> 400 "O CPF/CNPJ informado e invalido."
5. So depois de `PATCH /admin/users/:id {"phone":"11988776655"}` a assinatura passou (201) e o
   `paymentId` virou `cus_000008550818`.

Nada disso e validado ou explicado no momento da criacao da empresa, e o campo `phone` sequer e
editavel pelo painel (achado #5).

---

### 7. GRAVE — `POST /admin/users` cria conta duplicada trocando o caixa do e-mail
A checagem `userRepository.findByEmail` e case-sensitive e o service nao normaliza o e-mail.

Reproducao:
```
POST /admin/users {"email":"vet.demo@equinology.com.br", ...} -> 409 (correto)
POST /admin/users {"email":"VET.DEMO@EQUINOLOGY.COM.BR", ...} -> 201  <-- passou
```
Banco:
```
74c8c4ca-... | vet.demo@equinology.com.br | empresa f4e2f01e-...
1ef572dc-... | VET.DEMO@EQUINOLOGY.COM.BR | empresa 258506bc-...
```
E `POST /user/signin` com o e-mail em maiusculo autentica na conta-sombra
(`sub: 1ef572dc-...`, `companyId: 258506bc-...`), nao na original.

Impacto: duas contas com o mesmo e-mail em empresas diferentes; login, recuperacao de senha e
suporte ficam ambiguos. (Limpei o registro renomeando para `f2adm-lixo@teste.com`.)

---

### 8. GRAVE — `GET /admin/signature` (tela principal do painel) devolve 500 para qualquer query param invalido
O controller le `status`, `companyId`, `page` e `pageSize` com `@Query` cru, sem DTO nem validacao.

| Query | HTTP observado |
|---|---|
| `?status=BANANA` | **500** |
| `?page=abc&pageSize=xyz` | **500** |
| `?page=-1&pageSize=3` | **500** |
| `?companyId=abc` | **500** |

Todos com o texto generico "Nao foi possivel concluir a operacao...". Nenhuma pista pro operador.
Paginacao e filtro validos funcionam (`page=1/2` com `pageSize=3` retornam conjuntos distintos,
`total=30` bate; `status=TRIAL` retorna 13 e so TRIAL, conferido contra o banco).

---

### 9. GRAVE — UUID malformado devolve 500 cru em praticamente todo o painel
Nenhuma rota usa `ParseUUIDPipe`. O erro do Prisma vaza como 500.

Confirmado (todos com `:id = "abc"`):
`GET /admin/companies/abc`, `PUT /admin/companies/abc`, `PATCH /admin/users/abc`,
`PUT /admin/plans/abc`, `DELETE /admin/plans/abc`, `DELETE /admin/coupons/abc`,
`PUT /admin/coupons/abc` (via id inexistente ok, malformado 500),
`PUT /admin/ads/abc`, `PUT /admin/tutorials/abc`, `PATCH /admin/signature/abc`,
`POST /admin/signature/cancel/abc`, `POST /admin/signature/create/abc/abc`,
`GET /admin/financial/transactions?companyId=abc`.

Contraste: com UUID valido inexistente todas devolvem 404 limpo em portugues.
`PATCH /admin/users/:id {"companyId":"abc"}` devolve 400 correto — prova que o pipe funciona quando
o campo esta no DTO; o problema e so nos `@Param`/`@Query`.

---

### 10. GRAVE — `PATCH /admin/signature/:id` e `POST change-plan/:id` vazam a entidade crua (`_id`/`props`)
Todas as demais rotas de assinatura devolvem `{id, companyId, signaturePlanId, status, ...}`.
Estas duas devolvem o objeto de dominio serializado:
```json
{"signature":{"_id":"a5787b94-...","props":{"companyId":"...","expirationDate":"...","paymentId":"sub_pending",
"paymentType":"PIX","signaturePlanId":"...","status":"ACTIVE","invoiceId":null,"refoundDateLimit":null,
"isAutoRenewActivated":true,"yearly":false,"creditCardId":null,"createdAt":"...","asaasSubscriptionId":"sub_gm9k...",
"wasTrial":false},"_attachments":[]}}
```
`signature.id` e `undefined` pro front. Alem de quebrar o contrato, expoe `asaasSubscriptionId`,
`creditCardId` e `invoiceId`, que nenhuma outra rota expoe.

---

### 11. GRAVE — `POST/PUT /admin/plans` grava preco negativo e desconto de 500%
`CreateSignaturePlanDto` so tem `@Min(0)` em `trialDays`. `userQuantity`, `creditCardPrice`,
`pixPrice` e `yearlyDiscount` nao tem limite nenhum.

Reproducao:
```
POST /admin/plans
{"name":"F2ADM Negativo","description":"d","userQuantity":-5,"creditCardPrice":-100,
 "pixPrice":-50,"isActive":true,"yearlyDiscount":500,"trialDays":0}
-> HTTP 201
```
Banco: `userQuantity=-5, creditCardPrice=-100, pixPrice=-50, yearlyDiscount=500`.
Com `yearlyDiscount=500` o calculo anual (`pixPrice*12*(1-500/100)`) vira valor negativo e vai
direto pro Asaas. Com `userQuantity` negativo o limite de usuarios do plano bloqueia todo mundo.

---

### 12. GRAVE — `POST /admin/ads` grava `redirectUrl: "javascript:alert(1)"` e serve na rota PUBLICA
`imageUrl` e `redirectUrl` nao tem validacao de URL (o modulo de tutoriais valida, o de anuncios nao).

Reproducao:
```
POST /admin/ads {"name":"RedRuim","imageUrl":"https://x.com/a.png","redirectUrl":"javascript:alert(1)"} -> 201
POST /admin/ads {"name":"UrlRuim","imageUrl":"nao eh url"} -> 201
GET /ads/sponsors   (sem token, rota @IsPublic)
-> {"advertisements":[{"name":"RedRuim","redirectUrl":"javascript:alert(1)","imageUrl":"https://x.com/a.png",...},
                      {"name":"UrlRuim","imageUrl":"nao eh url",...}]}
```
Se a LP renderizar `<a href={redirectUrl}>`, e XSS armazenado servido publicamente. (Ja apaguei os dois.)

---

### 13. GRAVE — Ultimo super_admin pode se rebaixar e travar o painel para sempre
`adminPanelAccount.service.ts::update` bloqueia `active:false` na propria conta, mas nao bloqueia
mudanca de `role` na propria conta, e nao verifica se sobra algum super_admin.

Reproducao (com o unico super_admin da base):
1. `PATCH /admin/admins/058efc34-... {"active":false}` -> 400 "Voce nao pode desativar a propria conta." (correto)
2. `PATCH /admin/admins/058efc34-... {"role":"support"}` -> **200**, `role: "support"`
3. `POST /admin/admins` -> **403** "Apenas super administradores podem realizar esta acao."

A partir daqui nao existe nenhuma rota que devolva o super_admin. So recuperei com
`UPDATE admin_users SET role='super_admin'` direto no banco. (Restaurado.)

---

### 14. GRAVE — Upload de anuncio confia no `Content-Type` do cliente; binario arbitrario e aceito
`resolveUploadedImageUrl` testa apenas `file.mimetype` (declarado pelo cliente), sem magic bytes.

| Envio | HTTP observado |
|---|---|
| `.exe` com `type=application/octet-stream` | 400 "A imagem deve ser JPEG, PNG, GIF ou WebP." |
| PNG de 6 MB | 400 "Validation failed (expected size is less than 5242880)" |
| **`.exe` com `type=image/png` forjado** | **201** — subiu pro Cloudflare e virou `imageUrl` publica |

---

### 15. GRAVE — Filtro de data de `/admin/financial/transactions` ignora silenciosamente parte das transacoes
`adminFinancial.service.ts` so aplica o filtro quando `dueDate` e truthy
(`if (startDate && dueDate && ...)`). Pagamentos avulsos (fluxo anual / `charge`) vem de
`AdminSignatureService.history` com `dueDate: ''`, entao escapam do filtro.

Reproducao:
```
GET /admin/financial/transactions?startDate=2030-01-01
-> {"transactions":[{"id":"pay_1xmxqkcnwbhjkq8l","companyName":"Clinica F2ADM","value":4966.92,"dueDate":"","status":"PENDING"},...]}
```
Uma transacao de 2026 aparece num filtro que comeca em 2030, e com a coluna de vencimento vazia.

---

### 16. GRAVE — `POST /admin/signature/charge/:id` devolve 404 "Registro nao encontrado" quando a empresa foi criada pelo painel
`charge` retorna `ResourceNotFoundError` quando `company.paymentId` comeca com `admin-`. A assinatura
e a empresa existem; a mensagem manda o operador procurar um cadastro inexistente.

Reproducao:
1. `POST /admin/signature/create/27a066f6-.../904d4948-...` `{"isTrial":true}` -> 201 (assinatura `0b657ab3`)
2. `POST /admin/signature/charge/0b657ab3-...` -> **404** "Registro nao encontrado. Confira os dados informados e tente novamente."

---

### 17. MENOR — `PUT /admin/companies/:id` nao atualiza `updatedAt`
Reproducao: empresa `30c6c97e` criada 17:38:19.590; apos dois `PUT` bem-sucedidos que mudaram
`name`, `address`, `number`, `postalCode`, `walletId` e `cnpj`, o banco continua com
`updatedAt = 2026-08-02 17:38:19.59` (identico a `createdAt`).
Modulo de cupons faz certo (`updatedAt` mudou de 17:45:25 para 17:45:35). Auditoria de quem
alterou o cadastro da empresa fica inutil.

---

### 18. MENOR — Mensagens de erro em ingles e mensagem de data enganosa
- `POST /admin/auth/signin` estourando o rate-limit: `"ThrottlerException: Too Many Requests"`.
- `POST /admin/tutorials` com 13 capitulos: `"chapters must contain no more than 12 elements"`.
- `POST /admin/ads` com imagem >5MB: `"Validation failed (expected size is less than 5242880)"`.
- `POST /admin/ads` com `validFrom: "2026-02-31"` (data impossivel) responde
  `"A data final deve ser igual ou posterior a inicial."` — o problema e a data inicial ser invalida,
  nao a ordem. Cupom acerta esse caso (`"Datas de validade invalidas."`).

---

### 19. MENOR — `signin` rejeita e-mail com espacos apesar de o service fazer `trim()`
`AdminAuthService.authenticate` faz `email.trim().toLowerCase()`, mas o `@IsEmail()` do DTO barra antes.
- `{"email":"  ADMIN@TESTE.COM ", ...}` -> 400 "Insira um email valido"
- `{"email":"ADMIN@TESTE.COM", ...}` -> 201 (maiuscula funciona, espaco nao)

Colado de um gerenciador de senhas o login falha sem explicar o motivo. Alem disso a mensagem
"Insira um email valido" aparece **3x repetida** e "Insira uma senha valida" **2x** quando o body vem vazio.

---

### 20. MENOR (SUSPEITO) — Receita do resumo financeiro so varre assinaturas ACTIVE
`getPaymentsForPeriod` itera apenas `fetchActiveWithPlans()`. Um pagamento recebido de uma empresa
que depois cancelou (`INACTIVE`) desaparece retroativamente do faturamento do mes.
`/transactions`, ao contrario, lista transacoes de assinaturas de qualquer status — os dois numeros
nao fecham entre si.

Nao consegui reproduzir com valor real porque nao ha pagamento `RECEIVED` no sandbox
(`revenueMonth` e `revenuePreviousMonth` foram 0 em todas as chamadas). Marcado como SUSPEITO.

Efeito colateral ja observavel: ambas as rotas fazem 1 chamada ao Asaas por assinatura
(N+1 externo). Com 30 assinaturas o `/transactions` ja dispara ~30 requisicoes por pageview;
em producao isso vira timeout.

---

## O que passou (nao precisa reauditar)

**Autenticacao**
- `POST /admin/auth/signin` com senha errada e com e-mail inexistente -> 401 identico
  ("E-mail ou senha incorretos"), sem enumeracao de usuario.
- Body vazio -> 400 com mensagens em portugues.
- Rate-limit do signin **dispara de verdade**: 10/60s por IP, medido (1o request 401, do 2o em diante 429).
- `GET /admin/auth/me` sem token -> 401; token lixo -> 401 "Sua sessao expirou".
- `PATCH /admin/auth/token` renova o token e recusa admin inativo.
- Login de admin desativado -> 401. Nenhum hash de senha vaza em nenhuma resposta.

**Guardas que existem e funcionam**
- `AdminSuperAdminGuard` barra `support` em `POST /admin/admins` e `PATCH /admin/admins/:id` (403 claro).
- Auto-desativacao da propria conta de admin -> 400 "Voce nao pode desativar a propria conta."
- `POST /admin/admins` com e-mail ja existente -> 409; `role` omitido cai em `support` (fail-safe correto).

**Limite de usuarios por plano — CONFIRMADO que dispara**
- Plano `userQuantity=1`, empresa com 1 usuario e assinatura TRIAL vigente:
  `POST /admin/users` -> **403** "Voce atingiu o limite de usuarios do seu plano..."
- `PATCH /admin/users/:id` com `companyId` de destino tambem passa pela mesma checagem.

**`/admin/users`**
- Round-trip completo: `name`, `email`, `phone`, `role`, `companyId`, `newPassword` — todos gravaram
  e voltaram no `GET`. Senha nova confirmada por `POST /user/signin`.
- E-mail duplicado (mesmo caixa) -> 409 em `POST` e em `PATCH`.
- `companyId` inexistente -> 404; malformado -> 400; `newPassword` com 5 chars -> 400.
- Nenhum `passwordHash` no payload.

**`/admin/plans`**
- Round-trip de todos os 8 campos, conferido no banco (`F2ADM Plano Editado`).
- `DELETE` de plano com assinaturas vinculadas -> **400 com mensagem excelente**:
  "Nao e possivel excluir este plano: existem 2 assinatura(s) vinculada(s) a ele. Desative o plano
  para que ele deixe de ser oferecido, mantendo o historico das assinaturas." Nada foi apagado (conferido no banco).
- `PUT`/`DELETE` com id valido inexistente -> 404.

**`/admin/coupons` (o modulo mais solido do conjunto)**
- Round-trip completo incluindo troca de `PERCENT` -> `FIXED`. `updatedAt` atualiza.
- Codigo duplicado -> 409 em `POST` e em `PUT`.
- `validUntil` < `validFrom` -> 400 claro. Datas invalidas (`2026-02-31`, `"banana"`) -> 400 "Datas de validade invalidas."
- `PERCENT` sem percentual -> 400; `FIXED` sem valor -> 400; percentual 150 -> 400.
- **Limite de usos dispara**: cupom `maxUsages=1` -> 1a assinatura 201 e `currentUsages=1`;
  2a -> 400 "Cupom invalido. Verifique se esta ativo, dentro do periodo de validade e nao excedeu o limite de usos."
- Desconto aplicado corretamente no valor real: anual 459,90x12x0,9 = 4.966,92; com cupom de 50% a
  fatura no Asaas saiu **2.483,46** (`pay_o420plnx45ub0pev`).

**`/admin/tutorials`**
- Round-trip completo com capitulos aninhados (titulo, descricao, timecode, sortOrder).
- `mediaUrl` ausente -> 400; `mediaUrl` nao-URL -> 400 "URL invalida: nao eh url";
  `type` invalido -> 400; `sortOrder` negativo -> 400; 13 capitulos -> 400.
- `DELETE` remove o tutorial e **nao deixa capitulo orfao** (`tutorial_chapters` = 0 apos a troca para PDF e apos o delete).

**`/admin/ads`**
- Round-trip de todos os campos incluindo `scope`, `targetStates` e `targetCities`.
- Sem arquivo e sem `imageUrl` -> 400; `validUntil` < `validFrom` -> 400;
  `scope=REGIONAL` sem estados -> 400; `scope=MUNICIPAL` sem cidades -> 400; UF inexistente -> 400 "UF invalida: XX".
- Arquivo nao-imagem declarado corretamente -> 400; arquivo >5MB -> 400.
- `targetStates` e limpo ao trocar para `MUNICIPAL` (comportamento coerente com o modelo).

**`/admin/signature`**
- Paginacao valida correta: `pageSize=3` com `page=1` e `page=2` retornam conjuntos disjuntos, `total=30`.
- `status=TRIAL` retorna 13 itens, todos TRIAL — bate com `select status, count(*) from law_firm_signatures`.
- Todas as 8 rotas por id com UUID valido inexistente -> 404 limpo (cancel, reactivate, renew-yearly,
  charge, history, receipt, change-plan, create).
- `PATCH` com `expirationDate: "2026-02-31"` -> 400 "Informe uma data de expiracao valida".
- `change-plan` sem `planId` -> 400.
- `history` e `receipt` retornam dados reais do Asaas (`pay_vmjigjz5qjk03ixg` R$180,11 PENDING;
  `https://sandbox.asaas.com/i/vmjigjz5qjk03ixg`).

**`/admin/financial`**
- `activeSubscriptions: 5` e `trialSubscriptions: 13` batem exatamente com
  `select status, count(*) from law_firm_signatures group by status` (ACTIVE 5 / TRIAL 13 / INACTIVE 11).
- `transactions`: paginacao correta (`total=15`, `page=1` e `page=2` com itens distintos, `page=999` -> lista vazia
  mantendo `total`), `status=PENDING` retorna so PENDING, `status=RECEIVED` retorna vazio,
  `page=abc` e `page=-1` -> 400 com mensagem em portugues (ao contrario de `/admin/signature`),
  `startDate=2026-02-31` -> 400 "Informe uma data inicial valida".

---

## Fixtures criadas (para limpeza posterior)
- Empresas: `30c6c97e-57ac-4c1f-b081-154cc085ed10` (Empresa F2 Editada), `27a066f6-...` (Dup F2),
  `66436c3f-...` (nome de 5000 chars), `258506bc-a83e-4582-bfb0-c9fdff5e0a53` (Clinica F2ADM, via `/user/register`).
- Planos `F2ADM *` — os 3 ficaram com `isActive=false`, nao aparecem na venda.
- Anuncios e cupons de teste: **apagados** (`GET /ads/sponsors` voltou vazio).
- Admin `suporte.f2@teste.com`: apagado (usado na prova do achado #1).
- Assinaturas de teste concentradas nas empresas acima; nenhuma cobranca real (sandbox).
