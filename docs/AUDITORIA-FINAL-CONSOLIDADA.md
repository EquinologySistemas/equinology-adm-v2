# Auditoria QA — Documento final consolidado

**Sistema Equinology** · 30/07/2026 · **Nenhuma correção foi aplicada — este documento mapeia.**

Repositórios: **WEB** `equinology-web-v2` (app.equinology.com.br) · **API** `vetequus-api` (NestJS) · **APP** `equinology-app-v2` (Expo/React Native) · **ADM** `equinology-adm-v2`

---

## Como este documento foi montado

Três auditorias independentes foram feitas antes dele, e cada uma enxergou uma parte:

| Fonte | O que é | Cobertura | Arquivo |
|---|---|---|---|
| **A** | Varredura ampla do sistema — 13 agentes, 195 achados | A mais larga: todos os módulos dos 4 repos | [fonte-A-varredura-195-achados.md](auditoria/fonte-A-varredura-195-achados.md) |
| **B** | Verificação da bateria de testes manual | A mais precisa: cada bug testado, rastreado até a linha | [fonte-B-bateria-testes.md](auditoria/fonte-B-bateria-testes.md) |
| **C** | Mergulho no módulo de Atendimentos — 72 achados | A mais profunda: fichas clínicas campo a campo | [fonte-C-modulo-atendimentos.md](auditoria/fonte-C-modulo-atendimentos.md) |

Nenhuma das três é "a mais completa" sozinha: **A** tem a largura, **B** tem o rigor, **C** tem a profundidade onde mais importa (prontuário). Onde elas se contradiziam, **12 agentes voltaram ao código para arbitrar** — e em 7 dos 12 casos o veredito mudou o entendimento do problema. Este documento é o resultado: a união das três, com as contradições resolvidas contra o código real.

> ⚠️ O arquivo `docs/AUDITORIA-QA-2026-07-30.md` foi substituído por esta estrutura. As três fontes originais estão preservadas em `docs/auditoria/`.

---

## As 7 correções de rumo (leia antes de agir sobre qualquer relatório antigo)

Estas conclusões **invalidam ou corrigem** o que estava escrito nos documentos anteriores. Agir sobre a versão antiga desperdiça trabalho.

1. **O fix de autocapitalize do login web nunca foi commitado — e o commit `e80874b` foi o que *introduziu* o bug.** O relatório B dizia "já corrigido em junho, verificar deploy". Errado: `git log -S "noAutoCapitalize"` volta vazio; o fix existe **só no working tree da máquina do dev**, não commitado. O `e80874b` adicionou o olhinho trocando `type="password"` por `type={showPassword ? "text" : "password"}` — e a allowlist do componente (`input.tsx:7-14`) isenta `password` mas não `text`, então **com o olhinho ligado o `handleChange` muta o valor real enviado à API**. Não é cosmético: o login falha de verdade. O QA testou o código real.

2. **Não são 8 PDFs virando 1 — são ZERO.** Não existe merge de PDF no projeto (`@react-pdf/renderer` é renderer, não merger). O proxy rejeita qualquer content-type não-`image/` com 415 e o `img.onerror` devolve `null`, que é filtrado sem erro nem aviso. De N PDFs anexados, **nenhum** entra no laudo. O "1 que apareceu" era uma imagem.

3. **O limite de usuários NÃO é um snapshot congelado.** A leitura é sempre ao vivo do plano; editar de 1 para 3 no ADM propaga na hora. A tese do relatório A está refutada. O problema real é maior: **o limite quase nunca é aplicado** — 4 caminhos adicionam usuário sem checar nada, e só o convite por código valida.

4. **O botão Voltar do /plans funciona.** O handler está certo; o middleware é que rebate o usuário de volta. E a causa raiz é pior que o botão: **o registro nunca cria assinatura**, então 100% dos usuários novos nascem sem acesso, e o endpoint `start-trial` existe mas **nenhum frontend o chama**.

5. **Não existe integração ZeptoMail no código** — a palavra só aparece em comentários. O provedor é SMTP genérico via nodemailer; o ZeptoMail entra por `.env`. "Sem créditos" é hipótese não verificada: credencial inválida, remetente não verificado ou porta bloqueada produzem o mesmo 500.

6. **São 6 seções mock, não 9** — mas o gatilho é bem pior do que se pensava: a condição é `if (config && user)`, então **enquanto o contexto do usuário não hidratar, todas as 41 seções caem no mock** com toast de sucesso.

7. **Dois dos 11 "defaults clínicos" foram refutados** (Vulva e Vulvoplastia usam `??`, que não dispara em string vazia) — mas **dois novos foram encontrados**, e o total confirmado se mantém em 11 ocorrências reais.

---

# P0 — Segurança

Estes quatro achados não são bugs de experiência: são exposição de dados de terceiros. Vêm antes de tudo.

## S1. Quebra total de isolamento entre clínicas (IDOR) — 122 endpoints
**Severidade: crítica** · `api:src/infra/http/controllers/animal/**` · `api:.../signature/companySignature.controller.ts:153,163`

A API não valida a empresa dona do registro em **nenhuma** operação de leitura, edição ou exclusão de ficha clínica. O `AuthGuard` global só valida o JWT e popula `request.companyId`; não há filtro de tenant no Prisma (nenhum `$use`/`$extends` no projeto). O `companyId` está disponível via `@CurrentCompanyId()` e é usado corretamente **na criação** — e omitido em todo o resto.

- **40 controllers de ficha clínica** (general 4, dentistry 6, orthopedic 6, reproduction 24). Em 40/40 os handlers PUT/DELETE/GET não recebem `@CurrentCompanyId()` → **120 endpoints**. Qualquer usuário autenticado de outra clínica lê, altera e apaga prontuários alheios sabendo o ID.
- **Mass assignment de tenant:** os DTOs de edição aceitam `companyId` e `animalId` no body (presente em 40 DTOs) e o service aplica sem validar — `if (companyId) test.companyId = companyId;`. Dá para **transferir um prontuário para outra conta**.
- **+2 endpoints de assinatura:** `PUT /signature/cancel/:id` e `PUT /signature/refound/:id` usam `@CurrentUserId()` num parâmetro chamado `companyId` (decorator errado) e o service descarta o valor — qualquer usuário autenticado **cancela ou reembolsa a assinatura de qualquer empresa**.

```ts
// generalTest.controller.ts:31-48 — nenhum @CurrentCompanyId
@Put(':id')
async edit(@Param('id') id: string, @Body() body: EditGeneralTestDto) {
  const result = await this.generalTestService.edit({ generalTestId: id, ...body });
```

**Correção:** exigir `@CurrentCompanyId()` em todo edit/delete/fetch e comparar com o dono antes de qualquer escrita; remover `companyId` dos DTOs de edição; trocar o decorator em cancel/refound; e, como defesa em profundidade, filtro de tenant na camada de repositório.

> Observação de precisão: não existe módulo "boardRecord" na API — os nomes reais são general/dentistry/orthopedic/reproduction. E 4 controllers (deworming, exam, shoeing, vaccine) não usam `CurrentCompanyId` **nem na criação**.

## S2. Tomada de conta de qualquer cliente do app com e-mail + CPF
**Severidade: crítica** · `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts:58-60`

O endpoint público `POST /client/password-code` aceita `{ email, cpf }`. Quando o CPF é enviado e confere, o serviço **deixa de enviar o código por e-mail e o retorna no JSON da resposta**:

```ts
if (cpfTrimmed) { return right({ code: recoverPasswordCode.code }); }
```

A cadeia de exploração é inteiramente pública: pega o `code` na resposta → `PUT /client/password-code` com `{ code, password }` → senha sobrescrita. E-mail e CPF não são segredos de autenticação. Não há rate limiting no projeto (nenhum `Throttler`), permitindo enumeração de CPF a partir do e-mail. O próprio Swagger documenta o comportamento.

Agravantes no mesmo caminho: o código é **impresso em log de produção** (`console.log('RECOVERY CODE:', ...)`) e gerado com `Math.random()`, não criptograficamente seguro.

**Escopo:** exclusivo do fluxo de cliente (app mobile). O fluxo de usuário interno está correto.

**Bônus da mesma função** (`api:src/utils/generateRandomString.ts`): há um off-by-one que gera códigos com **menos de 6 caracteres** e **nunca sorteia a letra `a`** — reduz ainda mais o espaço de busca de um código que já é adivinhável.

## S5. O gate de assinatura não cobre `/notes` e `/reminders`
**Severidade: média** · `web:middleware.ts`

O matcher do middleware não inclui essas duas rotas, então elas são acessíveis sem assinatura válida — furo no controle que barra o resto do dashboard.

## S3. Upload sem validação de tipo, 200 MB em memória, URL pública
**Severidade: alta** · `api:src/infra/http/controllers/file/file.controller.ts`

A API aceita qualquer binário de até 200 MB carregado em memória — inclusive executável — e o publica com URL pública. Não há `fileFilter` nem validação de mimetype.

## S4. Arquivos órfãos permanentes no storage
**Severidade: média** · Não existe nenhuma exclusão no R2: trocar anexo, remover ou apagar o registro deixa o arquivo público para sempre.

---

# P0 — Dinheiro

## D1. Trial vira assinatura paga sem pagamento
**Severidade: crítica** · `api:companySignature.service.ts:154-169`

O método `pix()` promove a assinatura TRIAL do mesmo plano para `status = 'ACTIVE'` com expiração de +1 mês (ou **+1 ano** com `yearly=true`) **no mesmo instante em que devolve o QR Code**, sem aguardar confirmação. A rota `POST /signature/pix/:planId` não tem guarda alguma. **Basta pedir o PIX e não pagar.**

O ramo `else` (linha 180) faz o certo (`INACTIVE` até o webhook), o que confirma que a promoção do trial é um desvio, não um projeto. Agrava: o webhook só ativa quando `status === 'INACTIVE'`, então nem nota fiscal é emitida se o cliente pagar de fato.

## D2. Cartão salvo não repassa nada à clínica (split ausente)
**Severidade: crítica** · `api:src/infra/shared/bank/asaas.ts:160-179`

`existsCreditCartPayment` **não extrai nem envia o `split`** — enquanto `newCreditCartPayment` (linhas 118-141) envia corretamente. Não é campo morto: o contrato exige (`creditCardPayment.ts:31-42`) e os chamadores reais passam repasse de 100% para a clínica (`transaction.service.ts:291-303`, `invoice.service.ts:399-408`).

**Resultado: todo pagamento de fatura ou transação feito com cartão salvo é liquidado 100% na conta da plataforma, sem repasse à clínica.** PIX e cartão novo repassam certo. Correção de uma linha — mas exige apurar e regularizar o que já foi cobrado.

## D3. Upgrade cancela no Asaas antes de cobrar, sem rollback
**Severidade: alta** · `api:companySignature.service.ts:912-920` (PIX) e `:792-800` (cartão)

A assinatura antiga é cancelada no Asaas **antes** do `createSubscription`, e a falha do cancelamento é só logada. Se o `createSubscription` falhar, a rota retorna erro com a recorrência do cliente já destruída e nada no banco registrando isso.

**Ressalva ao relatório B:** a inativação no banco ocorre *depois* do `createSubscription`, então a falha não deixa a empresa sem plano no banco. Mas no **caminho de sucesso do PIX** a afirmação procede: antiga INACTIVE + nova INACTIVE, e como `isSignatureValidForAccess` só aceita ACTIVE/TRIAL, **a empresa perde o acesso assim que gera o QR do upgrade** — e fica bloqueada para sempre se não pagar. No cartão a nova nasce ACTIVE, sem janela de bloqueio.

## D4. Checkout estático — o cliente não sabe se pagou
**Severidade: crítica (percepção) ** · `web:app/(auth)/checkout/[id]/page.tsx`

765 linhas, **zero polling/refetch**. O PIX só mostra texto estático; o cartão faz sucesso otimista + redirect em 2s. Não existe endpoint de status de pagamento consultável.

**Correção:** polling em `GET /signature/current` (ou endpoint de status novo) a cada ~5s + botão "Verificar pagamento".

## D5. Webhook do Asaas — provável 400 em todo evento
**Severidade: crítica** · `api:companySignature.dto.ts:182-193`

`payment` e `subscription` têm `@ValidateNested()` **sem `@IsOptional()`**; o payload real do Asaas traz um **ou** outro → 400 em todo webhook. O Asaas registra como falha e pode suspender a fila. **Corrigir o DTO antes de reconfigurar o painel.**

### Passo a passo do webhook (para a Rafaela)
Endpoint: `POST {API}/signature/webhook` — público, autenticado pelo header `asaas-access-token` igual à env `ASAAS_WEBHOOK_TOKEN` (obrigatória: a API não sobe sem ela).

1. Definir `ASAAS_WEBHOOK_TOKEN` no `.env` de produção e reiniciar a API.
2. Painel Asaas → Integrações → Webhooks → Adicionar.
3. URL: `https://<host-da-api>/signature/webhook`
4. Token de autenticação: o mesmo valor da env.
5. Versão v3, envio sequencial, e-mail para falhas preenchido.
6. Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_DELETED` (+ `SUBSCRIPTION_PAYMENT_RECEIVED` e `SUBSCRIPTION_CANCELLED` se existirem no catálogo).
7. Usar a fila "Webhooks pendentes" do painel para reprocessar o backlog.

**Buraco de cobertura:** o webhook só trata assinatura. **Pagamentos de faturas e movimentações via PIX nunca são confirmados** — não há handler para eles.

## D6. Leitura insegura do erro do Asaas gera 500 genérico
**Severidade: média** · `api:asaas.ts:99, 148, 186, 206, 214, 230, 240`

`data.errors[0].description` sem `?.` e sem try/catch. Como o cliente é `new Axios(...)` sem `validateStatus`, respostas 4xx não rejeitam a promise e caem direto nesse acesso; corpo HTML ou JSON sem `errors` vira TypeError → 500. O gatilho real é `ASAAS_KEY`/ambiente inválido (401/403) ou HTML de proxy — **não** walletId inválido, que retorna 400 bem-formado. Métodos de assinatura já usam `?.`; faturas e transações não.

## D7. KPIs do financeiro calculados só com a 1ª página
**Severidade: crítica** · `web:app/(dashboard)/financial/_utils/useFinancialData.ts:72-81`

`page: "1"` fixo, o `pages` devolvido pela API é ignorado e nunca há segunda chamada. Page size real = 10 **registros de pagamento** (com todas as suas parcelas). Alimentam-se disso: os 4 KPIs (Recebido, A receber, Pago, A pagar), o card de saldo do mês e o gráfico "Evolução mensal".

A tabela logo abaixo pagina corretamente — **então a tela exibe totais que não batem com a própria listagem**. Qualquer clínica com mais de 10 movimentações no período vê números subestimados.

## D8. Fatura pública nunca exibe a chave PIX
**Severidade: crítica** · `web:app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx:133`

A chave PIX salva na tela Clínica não chega à fatura que o cliente final recebe — ele não consegue pagar.

---

# P0 — Integridade do dado clínico

Esta seção é a mais grave em risco assistencial e jurídico. Um laudo assinado é documento.

## C1. O sistema inventa dado clínico quando o veterinário não responde
**Severidade: crítica** · `web:services/boardRecordService.ts` (11 ocorrências confirmadas)

Os selects não têm `required` e o `handleSubmit` não valida, então o formulário salva com campo vazio. E o código **não envia vazio — envia uma afirmação clínica**, por causa do padrão ternário `formData.x === "B" ? "B" : "A"`, que com valor vazio sempre cai no ramo "A".

| Ficha | Campo | Grava sozinho | Linha |
|---|---|---|---|
| Parto — Receptora e Matriz | Tipo · Situação · Sexo | **Normal · Vivo · Macho** | 989-991, 999-1001, 1149-1151, 1159-1161 |
| Diagnóstico de gestação (Inicial e Final, Matriz e Receptora) | Resultado | **Positivo** | 844, 888, 1024 |
| Diagnóstico Final — Matriz | Batimento fetal · Desenvolvimento compatível | **Sim · Sim** | 1055-1056 |
| Coleta de Embrião — Doadora | Coleta | **Positivo** | 621 |
| Diagnóstico de Embrião — Receptora | Resultado | **Positivo** | 809 *(não estava no relatório C)* |
| Exame Andrológico — Garanhão | Coleta | **Feita** | 1221 |
| Teste de Armazenamento | Resultado | **Refrigerado** | 1285 |
| Coletas de Envio — Garanhão | Estado | **Refrigerado** | 1263 *(não estava no relatório C)* |
| Indução Hormonal (Doadora e Receptora) | Via de administração | **Intravenoso** | 543, 743 |
| Avaliação Ginecológica (Doadora e Receptora) | Paridade | **Primípara** | 464, 662 |
| Exame Físico Ortopédico | Sensibilidade *(campo não existe em nenhuma tela)* | **false** | 333 |
| Avaliação Periodontal | Raio-X *(campo não existe em nenhuma tela)* | **false** | 210 |
| Diagnóstico de gestação | Data Previsão Parto | **a data do próprio exame** | 839, 883 |

Um laudo assinado pode declarar que o potro nasceu vivo, macho, de parto normal, sem ninguém ter respondido isso. E os mesmos defaults estão no `buildEditBody`, então **editar um registro correto pode reintroduzir o valor falso**.

> **Retirados da lista original:** "Vulva = Ótima" e "Vulvoplastia = Não" usam `??`, que não dispara sobre string vazia. Esses campos chegam vazios à API — problema menor e de outra natureza.

## C2. Editar o Exame Físico Geral apaga 10 campos clínicos
**Severidade: crítica** · `web:boardRecordService.ts:105-122` × `api:generalTest.service.ts:113-134`

Raiz comum a vários bugs: a API atualiza com guarda de truthiness (`if (campo) entidade.campo = campo`), padrão replicado em **37 services de ficha**; o front monta o body de edição com fallback `?? "-"`.

O formulário tem 6 campos, mas o `buildEditBody` envia 16: **tpc, attitude, lymphNodes, nose, cough, pulmonary, pulse, intestine, feces e urine viram `"-"`** — e como `"-"` é truthy, a API grava. Destruição silenciosa e irreversível.

> **Ressalva honesta:** nenhuma tela atual grava valores reais nesses 10 campos (o APP só os lê), então o dano concreto depende de registros legados ou de chamada direta à API. Confirmar por query antes de dimensionar.

## C3. Laudo e receita saem com dados de demonstração
**Severidade: crítica** · `web:ServiceRecords.tsx:481-488` + `mock.ts:220-224`

O merge `[...api, ...mock]` injeta seeds de demonstração — *"Fenilbutazona 2g IV SID por 3 dias"*, *"Claudicação leve no MAD"* — nos PDFs de laudo e receita das seções Gerais. **O documento sai assinado com prescrição de outro paciente**, e o conteúdo fabricado nem aparece na tela.

## C4. 6 seções salvam só em memória — e o gatilho é mais amplo
**Severidade: crítica** · `web:ServiceRecords.tsx:371-372, 416-443`

Seis seções não têm endpoint configurado e caem num ramo que só atualiza `useState` e mostra toast de sucesso rotulado "(mock)": **Prescrições da Odontologia**; **Avaliação Ginecológica**, **Acompanhamento do CIO**, **Indução Hormonal** e **Cobertura / Inseminação** da Matriz; **Pós-parto / Neonatal** da Receptora. O dado evapora no F5 e nunca chega ao banco.

**O gatilho real é pior:** a condição é `if (config && user)` — enquanto o contexto do usuário não hidratar, **todas as 41 seções com API também caem no mock**, com aviso de sucesso.

> Precisão: o laudo do atendimento **concluído** realmente não contém as seções mock (`servicePdf.tsx:125` pula seções sem config), mas o PDF exportado *in-session* as inclui.

## C5. Do 11º registro em diante, o dado some — da tela e do laudo
**Severidade: alta** · `api:prismaGeneralTest.repository.ts:57-64` · `web:ServiceRecords.tsx:270-276`

A API pagina de 10 em 10 (`take: 10` aparece 61 vezes nos repositórios), a tela pede sempre a página 1 e descarta o `pages`, sem paginador — e o PDF do laudo faz o mesmo. **Agravante:** zero `orderBy` nas queries de ficha, então **quais 10 registros aparecem é indefinido** pelo Postgres e pode mudar após updates.

## C6. Impossível limpar um campo ou remover um anexo
**Severidade: alta** · Mesma raiz do C2: apagar o texto envia `""`, que a API ignora. O usuário vê "Registro atualizado", o refetch traz o valor antigo de volta — **sucesso falso**. Com anexo são duas camadas: o front omite a chave quando não há anexo *e* a API ignora `""`.

## C7. Quatro funcionalidades que falham 100% das vezes

| O quê | Sintoma | Causa |
|---|---|---|
| **Coletas de Envio** (Garanhão) | Todo salvamento retorna erro | A API exige 9 campos de espermograma que o formulário não possui |
| **Editar Avaliação Periodontal** | Toda edição falha | A API exige `xRay`, que o front não envia |
| **Editar Diagnóstico Inicial** (Receptora) | Toda edição falha | Envia data de previsão vazia, rejeitada pelo validador |
| **Sêmen "Fresco"** | Impossível registrar | A opção existe na tela, mas a API só aceita Congelado e Refrigerado |

## C8. Diagnóstico Inicial e Final da receptora gravam na mesma tabela
**Severidade: alta** · `web:boardRecordService.ts:822-823, 866-867`

As duas abas usam o mesmo endpoint (`reproduction-receptor-diagnosis`) e o mesmo fetch, sem discriminador: o registro **duplica nas duas seções** da tela e do laudo, e **excluir numa apaga o da outra**. A trilha da matriz usa endpoints separados.

**Correção:** campo `stage: INITIAL|FINAL` (ou endpoint próprio) + filtro no fetch. Quanto mais tempo passa, mais difícil separar os dados já misturados.

## C9. Dados que o usuário digita e o sistema descarta

- **OE / OD** — ovário esquerdo e direito na Avaliação Ginecológica (Doadora e Receptora): existem na tela, não há coluna no banco e o envio nem os inclui.
- **Método** — inseminação, monta natural ou dirigida: a distinção que justifica a seção existir é perdida em 100% dos casos.
- **Garanhão e Volume** — gravam no banco, mas a releitura não os traz: colunas sempre vazias e o modal de edição abre em branco.
- **Arquivo de ultrassom** — existe coluna própria no banco; o front nunca lê nem grava nela.

## C10. Troca de papel não persiste
Ao atender uma égua doadora como Matriz, os registros vão para as tabelas de matriz — mas o reload volta para "Doadora" e os registros **somem da vista e do laudo**.

---

# P1 — Anexos e PDFs

## X1. Anexos: modelagem inexistente (a raiz de tudo)
**Severidade: alta** · `api:prisma/schema.prisma` (43 ocorrências) · `web:ServiceRecords.tsx:936`

Não existe tabela de anexos. Cada uma das ~43 fichas tem uma única coluna escalar `fileUrl String?`, e o multi-anexo foi implementado **concatenando as URLs com quebra de linha dentro dessa mesma coluna de texto** (`urls.join("\n")`), replicada em três chaves (`fileUrl`/`attachmentUrl`/`resultFileUrl`) no POST/PUT. Não há tipo, nome original, ordem, autoria nem integridade referencial por anexo.

**Consequência 1 — zero PDFs no laudo** (ver correção de rumo nº 2). Vídeos e HEIC também são descartados pelo mesmo caminho. Só sobrevivem png, jpg, webp, gif e bmp.

**Consequência 2 — o cliente final não abre NENHUM anexo quando há 2 ou mais.** No app, `pickAttachmentUrl` devolve a string bruta sem `split("\n")` e ela vai direta para `Linking.openURL(url).catch(() => {})`. Com 2+ anexos a string não é URL válida: a promise rejeita, **o catch está vazio**, o cliente toca no chip e nada acontece — sem nenhuma mensagem. Com 1 anexo funciona.

**Defeitos secundários no upload (web):**
- O lote é sequencial e para no primeiro erro; há `toast.error` e os já enviados são preservados, mas o usuário **não sabe quais ficaram de fora**.
- O botão Salvar só observa `savingModal`; o estado `uploading` é interno ao `MultiFileUpload` e nunca exposto — **dá para salvar durante o upload** e persistir só as URLs já commitadas.
- HEIC sobe (o back não valida mimetype) mas `detectMediaKind` não o reconhece: ícone genérico em vez de preview, e some do laudo.

**Correção estrutural:** criar model `Attachment` (id, recordType, recordId, url, fileName, mimeType, size, order, uploadedBy, createdAt), migrar os valores com `\n`, tratar PDFs por merge real (`pdf-lib`) ou no mínimo **listar os não-rasterizáveis como links** em vez de descartá-los em silêncio; no app, dar `split("\n")` e substituir o catch vazio por feedback.

## X2. Datas em ISO cru no PDF — 21 campos
**Severidade: alta** · `web:services/_data/servicePdf.tsx:67-75`

`fieldsForRecord` faz `String(record[f.key])` ignorando `f.type === "date"`. Sai `2026-07-30T12:00:00.000Z` no documento. Alcança **toda a Reprodução**, incluindo Data Previsão Parto — Geral, Odontologia e Ortopedia não têm campo de data, e é só por isso que nunca apareceu lá. O preview do laudo na modal mostra o mesmo ISO. Na tela o mesmo dado é formatado corretamente — só o caminho do PDF perdeu.

**Uma correção resolve laudo, receita e preview de uma vez.**

## X3. Placeholders impressos no documento entregue ao cliente
**Severidade: alta** · `web:lib/pdf/shared.tsx:228-235, 394-399`

Sem logo cadastrada, o PDF imprime literalmente `LOGO DO VETERINARIO AQUI`. Sem nome, `Nome do veterinario`. Sem CRMV, `CRMV` sozinho.

## X4. PDF da fatura sem assinatura do veterinário
**Severidade: média** · `web:lib/pdf/InvoiceDocument.tsx:236-361` — é o único template que não chama `PdfSignature`; o dado `signatureUrl` já chega. Report/Prescription/HealthRecord fazem certo.

## X5. Imagens difíceis de ver (estado atual, sem proposta)

| Onde | Comportamento hoje |
|---|---|
| Formulário | Card de 56px com nome clicável que abre em nova aba |
| Tabela de registros | Miniatura de **36px**; clique abre o arquivo cru em outra aba — sem lightbox, zoom ou carrossel |
| PDF | Miniatura fixa 150×150pt com corte quadrado — **imagem retangular sai cortada**; ultrassom fica ilegível |
| PDF · anexos | Não existe página dedicada nem visualização grande |
| Preview da modal | Só texto, sem imagem — inconsistente com o PDF baixado |
| Não-imagens | PDF e vídeo são **descartados em silêncio**, sem menção de que existiam |

## X6. Exportação do laudo — estado atual (para decidir com a Rafaela)
Dois botões fixos, só PDF, download direto. Sem dropdown, sem abrir em nova aba (`openPdfInNewTab` existe e não é usado), **nome de arquivo sem data** — laudos do mesmo animal se sobrescrevem. Sugestão se ela quiser opções: um botão "Exportar" com dropdown (Laudo / Prescrição / Ambos / Abrir em nova aba).

---

# P1 — Erros 500 que o usuário encontra

Três destes são a **mesma família**: data sem hora chegando ao Prisma. Vale um helper único de data ISO.

## E1. Recuperar senha → 500
**Severidade: alta** · `api:RecoverPasswordCode.service.ts:43-44`

`sendMail` sem try/catch; o provider re-lança e a API **não tem ExceptionFilter global** — qualquer falha de SMTP vira 500 cru. O código já foi gravado no banco antes do envio. O provedor no código é SMTP genérico via nodemailer (default `smtp.hostinger.com`, driver por `MAIL_DRIVER`); o ZeptoMail entra só por `.env` (`SMTP_HOST=smtp.zeptomail.com`), empacotado para produção pelo `deploy.ps1`.

Mesmo defeito em `RecoverClientPasswordCode.service.ts:63`. Já boas-vindas, inatividade e fim de trial engolem o erro: **não dão 500, mas falham em silêncio**.

## E2. Pagar parcelas → 500
**Severidade: crítica** · `web:PayTransactionSheet.tsx:87-95` + `api:transaction.dto.ts:161-164`

**Não é wallet id.** O front envia `paymentDate: "yyyy-MM-dd"`; o DTO tem `@IsDateString()` sem `@Type(() => Date)` e a string chega ao Prisma, que exige ISO-8601 completo → `PrismaClientValidationError` → 500. O mesmo bug já foi corrigido **só** no `NewPaymentSheet.tsx:120-121` (o comentário no código admite).

Adjacente: `bankPaymentId` do Asaas nunca é persistido.

## E3. Vacinação sem próxima dose → 500
**Severidade: crítica** · `web:services/healthService.ts:74-75`

O fallback injeta `"YYYY-MM-DD"` (sem hora) quando `nextDate` vem vazio; o Prisma exige ISO completo para o `DateTime` NOT NULL. Mesmo bug em vermifugação (122-123) e exame (171). A UI apresenta o campo como opcional. Adjacente: `vaccine.controller.ts:30` usa `CreateVaccineDto` no PUT em vez do `EditVaccineDto`.

## E4. "Internal server error" cru chega ao usuário
**Severidade: crítica** · `api:src/infra/main.ts` (sem ExceptionFilter global) + 84 ocorrências de `toast.error(err.message)` no WEB

Não existe camada de tradução nem máscara de 500 em lugar nenhum.

---

# P1 — Mensagens de erro e i18n

## M1. Erros em inglês vazando para o usuário
**Severidade: alta** · Cadeia completa: `resourceAlreadyExistsError.ts:5` (mensagem hardcoded EN) → `client.service.ts` → `error.handler.ts:30-31` repassa `error.message` crua → `ApiContext.tsx:64-67` → toast.

**Todos os 9 arquivos de `src/core/errors/errors/` estão em inglês**, incluindo `Company user limit exceeded` (exibido cru no registro) e `Resource already exists` (criar cliente com dados repetidos).

**Correção:** adicionar `code` estável às classes de erro + dicionário PT no front (no `ApiContext`), em vez de casar por string.

Na mesma família: os guards lançam 401/403 com as mensagens default do Nest — **"Unauthorized" / "Forbidden"** em inglês (`api:src/infra/shared/auth/auth.guard.ts`).

## M2. ~404 mensagens de DTO com nome de campo em inglês
**Severidade: alta** · `api:orthopedicService.dto.ts:33` → `@IsNotEmpty({ message: 'back é obrigatório' })`, sendo que o rótulo PT é **"Dorso"**.

São **~404 ocorrências** do padrão `'<campo-em-inglês> é obrigatório'` na API (ortopedia, odontologia, vacina/vermífugo/exame, criar animal: `breed` → Raça, `gender`, `name`…). O disparo do "Back é obrigatório" acontece porque o form inicializa `""` e o `?? "-"` do `boardRecordService.ts:322-333` não cobre string vazia.

## M3. Campos obrigatórios sem indicação na tela
Todos os campos são obrigatórios na API e **nenhum** é marcado na tela. Deixar um em branco gera erro técnico emendado: `cervix é obrigatório,cyto é obrigatório…`

---

# P2 — Componentes compartilhados (1 correção → N telas)

## I1. O "0"/"1" preso que não dá para apagar
**Severidade: alta** · 9 arquivos no WEB + APP + ADM

Não existe `NumberInput` compartilhado. O padrão defeituoso `value={num}` + `onChange: Number(e.target.value) || 1` foi clonado. Ao apagar, `Number("")` = 0 é falsy e o `|| 1` / `|| 0` restaura o dígito na hora.

- `NewPaymentSheet.tsx:237-249` (Parcelas — o caso reportado) · `UpdatePaymentSheet.tsx:157-163` · `ServicePayments.tsx:384-394`
- Estoque: `AddStockEntrySheet.tsx:148-152` · `StockOutputSheet.tsx:155-159` · `SendGeneralToVolanteSheet.tsx:138-142` · `SendVolanteToGeneralSheet.tsx:85-89`
- `NewInvoiceSheet.tsx:518-525` · `CreateLeadModal.tsx:194-202` (mitigado)
- **APP:** o telefone do signup tem um `(` que nunca pode ser apagado — mesma classe
- **ADM:** `CouponsForm` com value 0 e `PlansForm` com defaults 10/7

Paliativo já existente no repo: `AddProductSheet.tsx:269/280/293` usa `value={x === 0 ? "" : x}`. Padrão correto de referência: `adm:PlansForm.tsx:148-198`.

**Correção:** estado como string (ou `number | ""`) durante a digitação, normalizando no submit; extrair um `NumberInput` compartilhado.

## I2. CurrencyInput: valor some no blur e bloqueia o salvamento
**Severidade: alta** · `web:components/ui/currency-input.tsx`

- `parseBRL` (14-20) devolve **0** para qualquer entrada que não entende (`R$ 500`, colagem suja, vírgula dupla);
- `displayValue` (45) exibe 0 como **string vazia** (`value > 0 ? formatBRL : ""`);
- `handleBlur` (61-66) re-parseia e **grava 0 no estado do pai** — o campo `required` fica vazio → submit bloqueado. É exatamente o sintoma da Nova Movimentação.
- **Bug extra grave:** `1.5` digitado com ponto decimal vira **R$ 15,00**; `1500.00` vira **R$ 150.000,00**. Corrupção silenciosa de valor monetário.
- Agravantes: `handleFocus` com `setTimeout+select()` sobrescreve dígitos; `modal.tsx:47-51` fecha a modal inteira num clique no overlay, sem confirmação.

Usado em 4 lugares: NewPaymentSheet, UpdatePaymentSheet, ServicePayments, BankAccountSheet. Existe um parser correto no repo (`NewInvoiceSheet.tsx:66-74`) — unificar.

## I3. DateInput aceita 80/50/5021 sem nenhum feedback
**Severidade: alta** · `web:components/ui/date-input.tsx:154-173`

O date-fns rejeita a data, mas o handler trata inválido como **no-op silencioso**: sem borda vermelha, sem mensagem; no blur apaga o texto em silêncio. Sem `min`/`max` de ano (`01/01/9999` passa). O mesmo componente está em **14 telas**. Corrigir o componente resolve todas.

## I4. Dropdowns de data sem a setinha
**Severidade: baixa** · `date-input.tsx:225-234` e `date-time-picker.tsx:192` só têm ícone de calendário; o `Select` do design system tem `ChevronDown` com rotação (`select.tsx:328`). Replicar.

## I5. Minutos só 00/15/30/45 — e o "00 que vira 50"
**Severidade: alta** · `web:components/ui/date-time-picker.tsx:33`

`MINUTES = [0,15,30,45]` fixo, sem prop de step — impossível marcar 13:20. Usado em **todos** os fluxos: Reagendar, Retorno (2 sheets), Novo agendamento, Lembrete, Alterar status.

**A causa do "17:00 vira 17:50" é outra:** o `<select>` é controlado por `value={current.getMinutes()}`; se o valor inicial tem minuto fora da lista (ex. 50, vindo de `defaultReturnDate()` que preserva o minuto do relógio), **nenhuma option casa** — o browser mostra "00" mas o estado real é 50, e clicar em "00" não dispara `change`. Não é bug de falsy/zero. Entrada livre 0-59 resolve os dois.

## I6. Máscaras sem `maxLength` no APP
No `InvoicePaymentSheet` do app, telefone e CPF/CNPJ não têm `maxLength` — digitação infinita. As máscaras centralizadas do WEB e do ADM estão corretas (limitadas via slice).

## I7. Validação de data ausente em 3 camadas (criar animal aceitou 60/92/9)
- **WEB:** `CreateAnimalSheet.tsx:295` não valida `birthDate` no submit; o caminho por voz/IA (476) injeta a string crua no body.
- **APP:** `AnimalRegistrationSheet.tsx:42-53` valida faixas mas aceita 31/02.
- **API (última defesa, falha):** `animal.dto.ts:72-74` usa `@IsString()` — aceita qualquer coisa; o controller faz `new Date(birthDate)` sem checar `Invalid Date`.

## I8. Filtro de datas do financeiro corta registros do dia
**Severidade: alta** · O fim do range nunca vira 23:59:59: o front manda `"yyyy-MM-dd"` cru e a API aplica `lte: new Date(endDate)`. **Agravante de timezone:** `"2026-07-29"` é interpretado como UTC → a fronteira real cai às **21:00 do dia 28** no horário local. A tela de Atendimentos faz certo (`ServicesTable.tsx:207-211`) — o Financeiro não. Faturas têm o mesmo problema.

## I9. Data volta um dia / data vazia vira "hoje"
Campos de data pura exibem **um dia a menos** na tabela, enquanto o modal de edição mostra o dia certo. E em várias fichas de Reprodução, deixar a data em branco **grava a data de hoje sem avisar**.

O mesmo deslocamento existe no **APP**: a data de nascimento do animal aparece **um dia antes** (`app:app/(animal)/[id].tsx` — `toLocaleDateString` sobre meia-noite UTC).

---

# P2 — App mobile (itens próprios)

## B1. "Manter conectado" não tem efeito
**Severidade: alta** · `app:contexts/SessionContext.tsx`

A sessão é **sempre** restaurada, marcando ou não a caixa. O controle existe na tela e não muda nada — em aparelho compartilhado, a expectativa de que desmarcar encerra a sessão não se cumpre.

## B2. Valores monetários sem centavos e sem separador de milhar
**Severidade: baixa** · `app:app/(tabs)/finances.tsx` — os totais da tela de finanças não seguem o formato `R$ 123.456,78` usado no resto do produto.

---

# P2 — Fluxos e telas

## F1. Nova atividade: clientes sem animal desaparecem
**Severidade: alta** · `api:prismaClient.repository.ts:136-140, 169-173`

O filtro por `studFarmId` é feito **só** via `Animal: { some: ... }`, ignorando os vínculos diretos `StudFarm.clientId` e `ClientStudFarm`. O caminho inverso faz certo (`prismaStudFarm.repository.ts:55-66` usa OR).

## F2. Nova movimentação: animais não filtram pelo cliente
`NewPaymentSheet.tsx:321-343` usa a lista global do `GlobalContext`, sem `clientId`. O backend **já aceita** `clientId` no `GET /animal` e o `NewAppointmentSheet.tsx:180` já usa certo.

## F3. A movimentação perde o cliente e a categoria
**Severidade: alta** · O front **exige** o cliente (`NewPaymentSheet.tsx:110-113`) e o envia, mas `CreatePaymentDto`/`EditPaymentDto` não têm o campo, o controller não repassa e **o model Payment não tem a coluna**. O `ValidationPipe` roda sem `whitelist`, então o campo é descartado em silêncio.

Mesma história com o **filtro Profissional/Pessoal**: existe só na UI. Front envia `scope`, controller não lê, DTO não declara, **não existe coluna `scope`** no schema. O filtro nunca muda a lista e a escolha nunca é gravada. Exige migration.

> Na **listagem** o `clientId` funciona, mas só indiretamente via o animal vinculado — logo toda movimentação criada sem animal fica invisível ao filtro por cliente, mesmo com o cliente tendo sido obrigatoriamente escolhido.

## F4. Propriedade não é restrita ao cliente selecionado
**Severidade: alta** · Front usa `dropdownStudFarms` global sem filtrar por `form.clientId`. E na API o filtro é **impossível hoje**: `studFarm.controller.ts:87-98` força `clientId = undefined` para usuário empresa e o `FetchStudFarmDto` nem expõe o campo. O modelo suporta (`ClientStudFarm`, `StudFarm.clientId`).

## F5. Preenchimento por voz: CEP e dropdowns
**Severidade: média**

- **O CEP não é enviado à IA:** não existe `{ key: "cep" }` em `PROPERTY_FORM_FIELDS` e o CEP vive num `useState` separado, **fora** do `formData` que o `AudioToFormButton` escreve — arquiteturalmente impossível preencher. Isso também impede o autopreenchimento ViaCEP por voz.
- **`state` (UF)** é declarado `type: "text"` mas a UI é um `Select` de siglas: a IA devolve "São Paulo" e nada casa. A rota de áudio trata `select` corretamente — mas só se o campo for declarado como select.
- **`clientId` não está na lista** — o dropdown de cliente nunca preenche por voz.
- **No criar animal:** o código tenta mapear nome→ID, mas busca só na 1ª página carregada, com comparação `===` exata sem normalizar acento.
- **Crítico:** `AudioToFormButton.tsx:100` preenche campos não encontrados com a string literal **"Não Informado"**, que é submetida à API e **sobrescreve dados na edição**.

## F6. Calendário: não dá para editar nada
**Severidade: alta** · Funcionalidade **inexistente**, não handler quebrado: `CommitmentDetailsModal` é somente-leitura por design; `AppointmentDetailsModal:172-208` só tem Reagendar/Ver detalhes/Retorno; `NewAppointmentSheet` é create-only. O backend suporta `PUT /appointment/:id`.

> **Atenção na implementação:** enviar `animals` no PUT apaga e recria os `AppointmentAnimal` com status PENDING (perde registros) — só enviar se a lista mudou.

## F7. Modal de status não vem com o status atual
`ChangeAppointmentStatusSheet.tsx:73,83` — `selected` sempre inicializa `"FINISHED"` hardcoded; a prop `currentStatus` nem existe, embora `row.status` esteja disponível no chamador. **`PENDING` (agendado) nem tem opção na lista.**

## F8. Reagendar não muda o status para agendado
`ChangeAppointmentStatusSheet.tsx:100-111` — o ramo RESCHEDULED só faz `PUT /appointment/:id` com datas; nunca toca no `AppointmentAnimal.status`. Inconsistente com o `rescheduleSplit` da API, que ajusta corretamente. Enum certo para "agendado" = `PENDING`.

## F9. Data retroativa — não há bloqueio nenhum no código
`NewAppointmentSheet.tsx:522-534` não passa `min`; DTO e service da API não validam data. **Provável causa do relato da Rafaela:** na visão **Mês**, o `MonthView.tsx` declara `onSelectSlot` (linha 58) mas **nunca o invoca** — clicar num dia não abre a modal (funciona em DayView/WeekView). Confirmar com ela por onde tentou.

## F10. Entrada de produto da home não pré-seleciona o produto
Regressão de props só na home: `page.tsx:155-159` descarta o `productId` e a `AddStockEntrySheet` é montada sem ele. A tabela envia o id, a modal suporta, e a página `/stock` faz certo. **Fix de 2 linhas.**

## F11. Não existe onde cancelar uma fatura
Meio-implementado: o backend aceita `PUT /invoice/:id { status: "CANCELED" }`, a UI tem badge e aba "Canceladas" com contador, mas **não existe o botão** — as ações são só PDF, Receber e Excluir (que perde histórico).

## F12. Falta "+" para criar cliente no criar propriedade
`NewPropertySheet.tsx:191-208` — só Label+Select. O padrão já existe pronto em `CreateAnimalSheet.tsx:631-643` (botão `UserPlus` + sheet aninhado com `nestingLevel` e `onSuccess`). É só replicar.

## F13. Telefone duplicado salva sem erro
`schema.prisma:1641` — `phone String?` sem `@unique`; `client.service.ts:63-71` só checa e-mail/CPF. **Comportamento confirmado e aceito pelo time — sem ação.** Se mudar, atenção a duplicados legados na migration.

## F14. Card do cliente despadronizado
`clients-equines/animals/[id]/page.tsx:634-666` — e-mail/telefone como ícone+texto à esquerda sem label, enquanto o CPF no mesmo card usa `<Row>` como os cards vizinhos. Bônus: wrapper é `<div>` gerando `<dt>/<dd>` **fora de `<dl>`** (HTML inválido).

## F15. Label errado no atendimento concluído
`ServicesTable.tsx:347-351` — a linha FINISHED usa `ViewActionButton` (tooltip "Ver detalhes") mas abre o **modal de laudo**. Menores: empty-state diz `Clique em "Adicionar"` mas o botão chama-se "Novo"; ternário com dois ramos iguais na linha 953.

## F16. Sem pré-visualização de anexos no laudo
`servicePdf.tsx:154-177` monta só título+campos e **descarta** os anexos; `AppointmentReportModal.tsx:204-229` não renderiza mídia. A tabela do atendimento em andamento tem preview (`MediaThumb`) — o laudo não.

---

# P2 — Autenticação e onboarding

## A1. Autocapitalize na senha (ver correção de rumo nº 1)
**Severidade: alta**

**WEB — bug ativo em produção.** HEAD é `3ff1e48` e não tem o fix; a prop `noAutoCapitalize` existe só no working tree local, **não commitada**. Com o olhinho ligado, o `handleChange` muta o valor real enviado à API.

| Campo | Estado |
|---|---|
| `login/page.tsx:110` | type dinâmico, **com** olhinho, autocapitalize **quebrado** com o olhinho ligado |
| `register/page.tsx:184` | `type="password"` fixo, **sem** olhinho, OK |
| `recover-password/page.tsx:137` e `:149` | `type="password"` fixo, **sem** olhinho, OK |

Register e recover estão corretos **por acidente arquitetural**: não têm toggle, então nunca saem do type `password`.

**APP — omissão confirmada, impacto a validar em device.** São **7 campos** de senha (não 5 — o fluxo de primeiro acesso do login tem dois a mais), todos com `isPassword` e **nenhum** com `autoCapitalize="none"`, enquanto os campos de e-mail vizinhos passam. *Ressalva cética:* com `secureTextEntry=true` o iOS e a maioria dos IMEs Android já suprimem a capitalização — o caminho de risco é o mesmo do web: tocar no olhinho zera o `secureTextEntry`. Diferente do web, o app **não muta o valor**; o risco é só do teclado do SO.

**Ação:** commitar e deployar o fix pendente do WEB (hoje é a única cópia existente); endurecer o componente para derivar a decisão do papel semântico (`autoComplete: current-password/new-password`) em vez do atributo `type`; e adicionar `autoCapitalize="none"` + `autoCorrect={false}` como default do `Input` do APP quando `isPassword`.

## A2. Falta olhinho no registro e no recover do WEB
`register/page.tsx:180-193` e `recover-password/page.tsx:133-156` (dois campos). Adicionar prop `showPasswordToggle` no `Input` compartilhado — **junto com a correção do A1**, senão reintroduz o bug.

## A3. O registro nunca cria assinatura — e o trial é órfão
**Severidade: alta** · `api:User.service.ts:271-298`

O registro cria Company e User mas **nunca cria `CompanySignature`**, então 100% dos usuários novos nascem sem acesso. O `register/page.tsx:122` empurra para `/`, o middleware valida assinatura e rebate para `/plans`. Não é loop infinito — `/plans` é pública — é um **beco sem saída**: o usuário recém-registrado que não quer assinar agora não tem estado válido no produto, só "Sair".

**Agravante que nenhum relatório anterior viu:** o endpoint `POST /signature/start-trial/:planId` existe e funciona, mas **nenhum frontend o chama** (grep no WEB e no APP: zero ocorrências). A tela de planos anuncia "X dias de teste grátis" **sem oferecer qualquer ação para ativá-lo** — hoje só admin concede trial.

**Correção mínima:** criar `CompanySignature` TRIAL no registro (ou chamar `start-trial` logo depois) e/ou expor um botão "Começar teste grátis" na tela de planos. O botão Voltar do `/plans` some do problema sozinho.

---

# P2 — Planos e limites de usuário

## L1. O limite de usuários quase nunca é aplicado
**Severidade: alta** · Ver correção de rumo nº 3.

**Não existe snapshot** — a leitura é sempre ao vivo do `SignaturePlan`, e editar o plano no ADM é UPDATE in-place da mesma linha, então 1→3 propaga instantaneamente. O problema é que o limite quase não é checado:

| Caminho | Valida limite? |
|---|---|
| `POST /user` — **o botão "Adicionar colaborador" da tela Clínica** | ❌ Não |
| `POST /admin/user` | ❌ Não |
| Mover usuário de company pelo admin (`PATCH`) | ❌ Não *(não citado por nenhum relatório anterior)* |
| `POST /user/register` com código de convite | ✅ Sim — único |
| `GET /user/limit-info` | ✅ Existe, correto, **e nenhum front consome** |

**Sobre o sintoma "limite continua 1 depois de editar o plano para 3":** se o teste foi pela tela Clínica, **não podia haver bloqueio algum** — aquele caminho não valida nada. Se foi pelo convite por código, as hipóteses são: (a) a assinatura ativa aponta para outro plano; ou (b) **a clínica tem mais de uma assinatura elegível e o código escolhe de forma não-determinística** — `prismaCompanySignature.repository.ts:85-93` faz `findMany` sem `orderBy` e o `.find()` aceita qualquer `ACTIVE` (mesmo vencida) ou `TRIAL` não expirado, podendo pegar a assinatura antiga do plano de 1 usuário.

**O item (b) é um bug real que deve ser corrigido independentemente do sintoma:** ordenar por `createdAt desc` e priorizar ACTIVE não expirada.

## L2. Cancelamento corta o acesso na hora
`cancelSignature` (`companySignature.service.ts:532-554`) corta o acesso imediatamente, contradizendo o texto da própria UI ("acesso até o fim do período pago").

---

# Roadmap

### Bloco 1 — Segurança (antes de qualquer coisa)
1. **Isolamento multi-tenant** (S1) — 122 endpoints. É o maior risco do sistema e cresce com a base de clientes.
2. **Código de reset no corpo da resposta** (S2) — tomada de conta com dados não-secretos.
3. **Validação de mimetype e limite no upload** (S3).

### Bloco 2 — Dinheiro
4. **Trial vira ACTIVE sem pagar** (D1) — receita perdida a cada PIX não pago.
5. **Split ausente no cartão salvo** (D2) — dinheiro de terceiros retido; exige apurar o passivo já cobrado.
6. **Webhook: `@IsOptional()` no DTO** (D5) antes de reconfigurar o painel, depois configurar e reprocessar a fila.
7. **Upgrade sem rollback + bloqueio no PIX** (D3).
8. **KPIs com 1 página** (D7) e **PIX ausente na fatura pública** (D8).
9. **`asaas.ts` blindado** (D6) — elimina os 500 genéricos e destrava o diagnóstico.
10. **Checkout com polling** (D4).

### Bloco 3 — Integridade do prontuário
11. **Defaults que inventam dado clínico** (C1) — risco assistencial e jurídico direto, correção localizada.
12. **Mock vazando para laudo e receita** (C3) e **as 6 seções mock** (C4).
13. **Edição apagando campos ocultos** (C2) — perda permanente e silenciosa.
14. **Diagnóstico Inicial/Final da receptora** (C8) — quanto mais tempo passa, mais difícil separar.
15. **Paginação e ordenação** (C5) — dado invisível é indistinguível de dado perdido.
16. **As 4 funcionalidades que sempre falham** (C7).

### Bloco 4 — Erros 500 e bloqueios de uso
17. **Família "data sem hora no Prisma"** (E2 + E3) — corrigir junto com um helper único de data ISO.
18. **Recover-password** (E1) + `ExceptionFilter` global (E4).
19. **CurrencyInput** (I2) — destrava a Nova Movimentação.
20. **Validação de data na API** (I7).

### Bloco 5 — Componentes compartilhados (1 correção → N telas)
21. **`NumberInput` compartilhado** (I1) — mata o dígito grudado em 9 arquivos + APP + ADM.
22. **`DateInput` com feedback de erro + chevron** (I3/I4) — mata 14 telas.
23. **Camada de tradução de erros** (M1) + varredura das ~404 mensagens de DTO (M2).
24. **Range de datas com startOfDay/endOfDay** (I8).
25. **`formatDate` no `fieldsForRecord`** (X2) — datas ISO em laudo, receita e preview de uma vez.
26. **`DateTimePicker` com minutos livres** (I5).

### Bloco 6 — Modelagem
27. **Tabela `Attachment`** (X1) — resolve multi-anexo no web, no app e no PDF, e destrava preview e visualização grande.
28. **Coluna `scope` no Payment + `clientId`** (F3) — exige migration.
29. **Limite de usuários no `POST /user`** + escolha determinística da assinatura vigente (L1).

### Bloco 7 — UX e fluxos pontuais
30. Trial no registro / botão "Começar teste grátis" (A3) · autocapitalize + olhinho (A1/A2) · status pré-selecionado (F7) · reagendar→PENDING (F8) · edição pelo calendário (F6) · filtros encadeados (F1/F2/F4) · pré-seleção de produto (F10 — 2 linhas) · "+" cliente (F12) · cancelar fatura (F11) · assinatura no PDF da fatura (X4) · placeholders no PDF (X3) · labels (F15) · card do cliente (F14) · preview de anexos (F16) · voz/IA (F5).

---

# Checklist de runtime — o que não se resolve lendo código

Estes pontos dependem de dados de produção, `.env` ou de pessoas. Levantá-los muda a prioridade de vários itens acima.

| # | O que checar | Como | Decide |
|---|---|---|---|
| 1 | Qual commit está em produção no WEB | comparar com `3ff1e48` | Se o autocapitalize do login está ativo (A1) |
| 2 | `.env` do servidor: `MAIL_DRIVER`, `SMTP_HOST`, `SMTP_USER`, `SMTP_FROM` | `root@…:~/App/.env` + `pm2 logs api` | A causa real do 500 do recover (E1) — ZeptoMail é hipótese |
| 3 | Pagamentos com cartão salvo já liquidados sem split | painel Asaas, `billingType CREDIT_CARD` | O passivo de repasse à clínica (D2) |
| 4 | Registros com 2+ URLs concatenadas | `WHERE file_url LIKE '%' \|\| chr(10) \|\| '%'` em cada tabela de ficha | Quantos clientes já estão sem acesso a anexo (X1) |
| 5 | Campos ocultos do Exame Físico com valor real | `SELECT count(*) … WHERE tpc NOT IN ('-','') …` | Se o C2 já destruiu dados ou é só risco futuro |
| 6 | Assinaturas da clínica afetada | `SELECT status, expirationDate, signaturePlanId … WHERE companyId=…` | Se o "limite 1" é multi-assinatura ou plano errado (L1) |
| 7 | `GET /payment?…&page=1` numa clínica real | comparar `pages` com 1 | Dimensiona o erro dos KPIs (D7) |
| 8 | **Rafaela:** por onde tentou criar atividade retroativa | conversa | Confirma se é a visão Mês (F9) |
| 9 | **Rafaela:** como quer exportar o laudo | conversa | Define o formato (X6) — estado atual documentado |
| 10 | Autocapitalize do APP em device físico | teste manual iOS + Android | Se o A1 no app é real ou suprimido pelo IME |

---

*Consolidado a partir de três auditorias independentes, com 12 contradições arbitradas contra o código-fonte. Nenhum arquivo do sistema foi modificado.*
