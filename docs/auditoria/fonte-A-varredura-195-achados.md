# Auditoria QA — Sistema Equinology
**Data:** 30/07/2026 · **Método:** 13 agentes de auditoria em paralelo sobre os 4 repositórios (web, adm, app mobile, API), com leitura de código e evidência arquivo:linha. **Nenhuma correção foi aplicada** — este documento apenas mapeia.

## Resumo

- **195 achados** no total — 21 críticos · 77 altos · 72 médios · 25 baixos
- **78** correspondem a bugs da bateria de testes manual (agora com causa raiz localizada) · **117** são achados novos

### Legenda de severidade

| Severidade | Significado |
|---|---|
| Crítico | Quebra fluxo, perde dado, 500, falha de segurança |
| Alto | Funcionalidade se comporta errado |
| Médio | UX ruim que confunde o usuário |
| Baixo | Cosmético / padronização |

### Visão por dimensão

| Dimensão | Achados | Crít. | Alto | Médio | Baixo |
|---|---|---|---|---|---|
| Inputs numéricos e moeda | 12 | 0 | 3 | 7 | 2 |
| Campos e filtros de data | 14 | 2 | 5 | 6 | 1 |
| Mensagens de erro e i18n | 15 | 1 | 8 | 5 | 1 |
| Planos, limites e assinaturas | 15 | 2 | 8 | 4 | 1 |
| Checkout, Asaas e webhook | 12 | 5 | 3 | 4 | 0 |
| Autenticação | 15 | 2 | 6 | 4 | 3 |
| Modais de cadastro | 20 | 1 | 8 | 8 | 3 |
| Nova atividade / Nova movimentação | 10 | 1 | 3 | 4 | 2 |
| Calendário e agenda | 12 | 0 | 7 | 4 | 1 |
| Financeiro e faturas | 15 | 2 | 6 | 6 | 1 |
| PDFs, laudos e anexos | 14 | 3 | 7 | 2 | 2 |
| App mobile | 18 | 1 | 6 | 7 | 4 |
| Telas não testadas (varredura) | 23 | 1 | 7 | 11 | 4 |

## Achados críticos (todas as dimensões)

- **API aceita qualquer string como data de nascimento do animal (só @IsString) e faz new Date() sem validar** — `api:src/infra/http/controllers/animal/dto/animal.dto.ts:74` _(Campos e filtros de data)_
- **App mobile aceita datas de calendário impossíveis (31/02) no cadastro de animal e gera 500 na API** — `app:components/sheets/AnimalRegistrationSheet.tsx:50` _(Campos e filtros de data)_
- **"Internal server error" cru ao usuário — API sem ExceptionFilter global e frontends sem máscara de 500** — `api:src/infra/shared/handler/error.handler.ts:39` _(Mensagens de erro e i18n)_
- **Upgrade via PIX cancela a assinatura atual antes do pagamento e derruba o acesso da clínica na hora** — `api:src/domain/application/services/signature/service/companySignature.service.ts:958` _(Planos, limites e assinaturas)_
- **IDOR: qualquer usuário autenticado pode cancelar ou reembolsar assinatura de qualquer empresa** — `api:src/infra/http/controllers/signature/companySignature.controller.ts:153` _(Planos, limites e assinaturas)_
- **Checkout PIX fica estático: nenhum polling/confirmação após o pagamento** — `web:app/(auth)/checkout/[id]/page.tsx:314` _(Checkout, Asaas e webhook)_
- **Webhook Asaas: endpoint, token e passo a passo de configuração (entrega solicitada)** — `api:src/infra/http/controllers/signature/companySignature.controller.ts:115` _(Checkout, Asaas e webhook)_
- **Pagamentos de faturas/movimentações via PIX no app nunca são confirmados (webhook não cobre Invoice/Transaction)** — `api:src/infra/http/controllers/signature/companySignature.controller.ts:134` _(Checkout, Asaas e webhook)_
- **Modal 'Pagar parcelas' (financeiro web) dá Internal server error — causa é data 'yyyy-MM-dd' no PUT /transaction, NÃO wallet id** — `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx:91` _(Checkout, Asaas e webhook)_
- **Gerar PIX em cima de um TRIAL ativa a assinatura imediatamente, sem pagamento** — `api:src/domain/application/services/signature/service/companySignature.service.ts:159` _(Checkout, Asaas e webhook)_
- **Recuperar senha (web) retorna 500 Internal server error quando o SMTP (ZeptoMail) falha** — `api:src/domain/application/services/account/services/RecoverPasswordCode.service.ts:44` _(Autenticação)_
- **Mesmo 500 no recuperar senha do app mobile (fluxo client por e-mail)** — `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts:63` _(Autenticação)_
- **Voz preenche campos não falados com o literal 'Não Informado' — que é submetido à API e sobrescreve dados na edição** — `web:app/(dashboard)/services/_components/AudioToFormButton.tsx:100` _(Modais de cadastro)_
- **API descarta clientId e scope da movimentação: campo Cliente é obrigatório no front mas o dado é perdido** — `api:src/infra/http/controllers/finance/dto/payment.dto.ts:13` _(Nova atividade / Nova movimentação)_
- **Modal 'Pagar parcelas' → 500 Internal server error: paymentDate 'yyyy-MM-dd' chega como string no Prisma** — `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx:93` _(Financeiro e faturas)_
- **KPIs, saldo do mês e gráfico de evolução calculados só com a 1ª página (10 pagamentos)** — `web:app/(dashboard)/financial/_utils/useFinancialData.ts:75` _(Financeiro e faturas)_
- **Vacinação sem próxima dose → 500 Internal server error (front injeta data inválida para o Prisma)** — `web:services/healthService.ts:75` _(PDFs, laudos e anexos)_
- **Laudo/prescrição exportados da tela de atendimento misturam registros MOCK (dados clínicos falsos) com dados reais** — `web:app/(dashboard)/services/_components/ServiceRecords.tsx:481` _(PDFs, laudos e anexos)_
- **6 seções de atendimento sem config de API salvam só em memória — dados clínicos perdidos e ausentes do laudo concluído** — `web:services/boardRecordService.ts:45` _(PDFs, laudos e anexos)_
- **Código de reset de senha é retornado no corpo da resposta pública mediante email+CPF (tomada de conta)** — `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts:58` _(App mobile)_
- **Fatura pública nunca exibe a chave PIX salva na tela Clínica — cliente não consegue pagar** — `web:app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx:133` _(Telas não testadas (varredura))_

---

## Inputs numéricos e moeda

> Os dois bugs reportados foram localizados com causa raiz confirmada no código. O "1 preso" do modal Nova movimentação nasce do padrão `value={form.quantity}` (state numérico) + `onChange` com `Number(e.target.value) || 1`: quando o usuário apaga o campo, a string vazia vira 0, o `|| 1` devolve 1 e o input re-renderiza com "1" — impossível limpar. O "valor que some no blur" nasce no componente CurrencyInput (web): `parseBRL` devolve 0 para qualquer texto não parseável (ex.: valor colado com "R$", segunda vírgula digitada) e o displayValue esconde valores 0 (`value > 0 ? formatBRL(value) : ""`), então no blur o campo fica vazio e o `required` bloqueia o salvamento; o mesmo parser trata "." como separador de milhar, transformando "1.5" digitado em 15 (corrupção silenciosa de valor monetário). A mesma classe de problema ("número inicial preso" por state numérico que não admite string vazia) se repete em 4 campos de Parcelas/Quantidade do web, nos 4 sheets de estoque, no CRM (Qtd. animais) e no ADM (CouponsForm com value 0 e PlansForm com defaults 10/7). No APP mobile, o telefone do signup tem um "(" que nunca pode ser apagado (mesma classe) e o formulário de cartão do InvoicePaymentSheet tem telefone e CPF/CNPJ sem maxLength (digitação infinita). Na API, o CreatePaymentDto não tem @Min em amount/quantity, aceitando pagamento com valor 0/negativo ou 0 parcelas (que cria pagamento sem nenhuma transaction). As máscaras centralizadas de CPF/CNPJ/telefone/CEP/cartão do web e do ADM estão corretas (limitadas via slice).

### 1. [Alto] Parcelas: o '1' não pode ser apagado no modal Nova movimentação

**Local:** `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx:245` · **Origem:** reportado nos testes manuais

O campo Parcelas usa state numérico com `value={form.quantity}` e onChange `Number(e.target.value) || 1`. Quando o usuário seleciona o '1' e apaga, e.target.value vira "", Number("") = 0, o `|| 1` força 1 de volta e o input re-renderiza com "1". O usuário nunca consegue limpar o campo; para digitar 12 precisa posicionar o cursor depois do 1. É exatamente o bug reportado. O mesmo padrão existe em UpdatePaymentSheet (Editar pagamento), ServicePayments (Nova movimentação do atendimento) e NewInvoiceSheet (Qtd. do item, com Math.max(1, ...)).

**Evidência:**

```
<Input id="quantity" type="number" min={1} value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) || 1 }))} required />
```

**Recomendação:** Manter o valor do input como string no state (permitindo "") e converter para número apenas no submit, com fallback/validação ali (padrão já usado corretamente em ServiceHealthManagement.tsx:1052-1073, campo nextDays). Ex.: `const [quantityText, setQuantityText] = useState("1")` e no submit `Math.max(1, parseInt(quantityText, 10) || 1)`.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx:156-165` · `web:app/(dashboard)/services/_components/ServicePayments.tsx:384-394` · `web:app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx:516-528`

### 2. [Alto] CurrencyInput: valor some/zera no blur quando o texto não é parseável, e o required bloqueia o salvamento

**Local:** `web:components/ui/currency-input.tsx:61` · **Origem:** reportado nos testes manuais

No blur, o CurrencyInput re-parseia o texto digitado com parseBRL, que devolve 0 para QUALQUER entrada não parseável (Number.isNaN → return 0), e o display esconde zero (`value > 0 ? formatBRL(value) : ""`). Resultado: se o usuário cola um valor formatado ("R$ 150,00"), digita uma segunda vírgula ("1,5,0") ou qualquer caractere inválido, ao clicar fora o campo fica VAZIO (amount = 0) e, como o input tem `required`, o formulário não deixa salvar — exatamente o sintoma reportado no modal Nova movimentação. Digitação simples de dígitos+vírgula funciona no código atual, então o gatilho é entrada não parseável (colagem, vírgula dupla, símbolo). Afeta todos os usos: NewPaymentSheet, UpdatePaymentSheet, ServicePayments e BankAccountSheet.

**Evidência:**

```
const handleBlur = () => { setFocused(false); const parsed = parseBRL(inputValue); onChange(parsed); setInputValue(parsed > 0 ? formatBRL(parsed) : ""); }; // e parseBRL: if (Number.isNaN(value)) return 0; // e linha 45: const displayValue = focused ? inputValue : (value > 0 ? formatBRL(value) : "");
```

**Recomendação:** No blur, se o parse falhar, manter o último valor válido em vez de zerar (ou manter o texto e sinalizar erro). Sanitizar a entrada no onChange removendo caracteres não [0-9.,] antes do parse (aceita colagem de "R$ 1.500,00"). Tratar 0 como valor exibível ("0,00") em vez de esconder, para o usuário ver o que aconteceu.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx:185-190` · `web:app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx:131-136` · `web:app/(dashboard)/services/_components/ServicePayments.tsx:343-347` · `web:app/(dashboard)/_components/sheets/BankAccountSheet.tsx:177-180`

### 3. [Alto] CurrencyInput: ponto tratado como separador de milhar corrompe valores digitados com ponto decimal ("1.5" vira 15)

**Local:** `web:components/ui/currency-input.tsx:14` · **Origem:** achado novo da auditoria

parseBRL remove TODOS os pontos antes de converter (`.replace(/\./g, "")`). Usuário que digita decimal com ponto (padrão de teclado numérico) tem o valor multiplicado silenciosamente: "1.5" → "15" → R$ 15,00 (10x); "1.50" → 150 (100x). Como o input aceita livremente o caractere ".", nada impede essa digitação. É corrupção silenciosa de valor financeiro em todos os formulários de dinheiro do web (movimentações, contas bancárias).

**Evidência:**

```
function parseBRL(str: string): number { const normalized = str.replace(/\s/g, "").replace(/\./g, "").replace(",", "."); ... }
```

**Recomendação:** Só tratar "." como milhar quando houver vírgula na string (padrão já usado corretamente em NewInvoiceSheet.tsx:66-74, parseBrlInput: `t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t`). Unificar os dois parsers num só util.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx:66-74`

### 4. [Médio] Sheets de estoque: quantidade inicia em 1 preso e vira '0 preso' ao apagar

**Local:** `web:app/(dashboard)/_components/sheets/stock/AddStockEntrySheet.tsx:152` · **Origem:** reportado nos testes manuais

Os 4 sheets de movimentação de estoque usam `useState(1)` + `value={quantity}` + onChange `Number(e.target.value) || 0`. O campo já abre com "1"; ao apagar, vira 0 e o input re-renderiza com "0" — o usuário digita e o número entra depois do 0 (ex.: "05"), tendo que apagar o zero manualmente. É a classe exata reportada ("já vem um número setado"). O submit tem guarda `quantity <= 0`, então não corrompe dados, mas trava a digitação.

**Evidência:**

```
const [quantity, setQuantity] = useState(1); ... <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} required />
```

**Recomendação:** Trocar o state para string (permitir ""), converter no submit. Alternativa mínima: `value={quantity === 0 ? "" : quantity}` + `onFocus={(e) => e.target.select()}` como já feito em AddProductSheet.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/stock/StockOutputSheet.tsx:37,155-161` · `web:app/(dashboard)/_components/sheets/stock/SendGeneralToVolanteSheet.tsx:25,138-144` · `web:app/(dashboard)/_components/sheets/stock/SendVolanteToGeneralSheet.tsx:26,84-92`

### 5. [Médio] CRM Qtd. animais: campo abre com '0' preso e não pode ser limpo

**Local:** `web:app/(dashboard)/crm/_components/CreateLeadModal.tsx:196` · **Origem:** reportado nos testes manuais

CreateLeadModal inicializa `animalQuantity: 0` (state numérico) e o input usa `value={form.animalQuantity ?? ""}` — como 0 não é nullish, renderiza "0". O onChange usa `parseInt(e.target.value, 10) || 0`, então apagar o campo devolve 0 e o "0" reaparece; digitar por cima gera "02" até o re-render. Classe exata do bug reportado.

**Evidência:**

```
animalQuantity: 0, ... <Input id="lead-animals" type="number" min={0} value={form.animalQuantity ?? ""} onChange={(e) => setForm((p) => ({ ...p, animalQuantity: parseInt(e.target.value, 10) || 0 }))} placeholder="0" />
```

**Recomendação:** Guardar como string no form state ("" quando vazio) e converter no submit; ou `value={form.animalQuantity === 0 ? "" : form.animalQuantity}` já que o placeholder "0" cobre o vazio.

**Arquivos relacionados:** `web:app/(dashboard)/crm/_components/CreateLeadModal.tsx:32-41`

### 6. [Médio] ADM Cupons: campo Percentual/Valor abre com '0' setado (react-hook-form default value: 0)

**Local:** `adm:src/app/(private)/coupons/_components/CouponsForm.tsx:68` · **Origem:** reportado nos testes manuais

CouponsForm define `value: 0` nos defaultValues quando é criação; como o input é `type="number"` registrado via react-hook-form, ele abre exibindo "0". O usuário digita e o dígito entra depois do 0 ("020"), precisando apagar o zero — classe exata reportada. Além disso, o zod exige value > 0, então o 0 pré-preenchido é um valor inválido oferecido por padrão.

**Evidência:**

```
return { code: "", discountType: "PERCENT", value: 0, ... }; ... <input type="number" step={discountType === "PERCENT" ? 1 : 0.01} {...register("value")} min={0} ... />
```

**Recomendação:** Usar `value: undefined` (ou schema com campo string + coerce no submit) para o input abrir vazio com placeholder, como já é feito com priceCardCents/pricePixCents no PlansForm.

**Arquivos relacionados:** `adm:src/app/(private)/coupons/_components/CouponsForm.tsx:166-172`

### 7. [Médio] ADM Planos: preços interpretam dígitos como centavos (digitar '150' salva R$ 1,50) e backspace fica preso em '0,00'

**Local:** `adm:src/app/(private)/plans/_components/PlansForm.tsx:162` · **Origem:** reportado nos testes manuais

Os campos Preço cartão/PIX usam máscara de centavos: parsePriceToCents extrai só dígitos e trata como centavos, e o value re-renderiza formatado a cada tecla. Quem digita "150" esperando R$ 150 vê "1,50" e, se não notar, salva preço 100x menor. Além disso, apagar com backspace não zera: "0,00" → backspace → "0,0" → parse 0 → re-renderiza "0,00" de novo (só limpa com select-all+delete, que retorna undefined). Os campos Desconto anual (default 10) e Trial (default 7) também abrem preenchidos com type=number, repetindo a classe 'número já setado'.

**Evidência:**

```
onChange={(e) => { const raw = e.target.value; const cents = parsePriceToCents(raw); field.onChange(raw.trim() === "" ? undefined : cents); }} // parsePriceToCents: const digits = (value ?? "").replace(/\D/g, ""); return digits === "" ? 0 : parseInt(digits, 10);
```

**Recomendação:** Padronizar com o mesmo componente de moeda do web (corrigido): texto livre com vírgula decimal, parse no blur, permitindo string vazia. Se mantiver o modo centavos, deixar claro no label/placeholder e tratar o backspace em "0,00" devolvendo undefined.

**Arquivos relacionados:** `adm:src/lib/utils.ts:54-68` · `adm:src/app/(private)/plans/_components/PlansForm.tsx:180-198,206-223`

### 8. [Médio] APP Signup: '(' do telefone nunca pode ser apagado

**Local:** `app:app/(auth)/signup.tsx:51` · **Origem:** achado novo da auditoria

O formatPhone local do signup não tem guarda para string vazia: `if (d.length <= 2) return `(${d}``. Quando o usuário apaga todos os dígitos, d = "" e a função devolve "(", que re-renderiza no input; apagar o "(" produz "" de novo → "(" volta. O campo nunca fica vazio — mesma classe do '1 preso'. A versão do web (lib/masks.ts:12) tem a guarda correta: `return d ? `(${d}` : ""`.

**Evidência:**

```
const formatPhone = (t: string) => { const d = t.replace(/\D/g, "").slice(0, 11); if (d.length <= 2) return `(${d}`; ... };
```

**Recomendação:** Adicionar guarda de vazio: `if (!d) return "";` (igual ao web equinology-web-v2/lib/masks.ts formatPhone).

**Arquivos relacionados:** `web:lib/masks.ts:10-15`

### 9. [Médio] APP Pagamento de fatura: Telefone e CPF/CNPJ do cartão sem maxLength nem máscara — digitação infinita

**Local:** `app:components/sheets/InvoicePaymentSheet.tsx:828` · **Origem:** achado novo da auditoria

No formulário de novo cartão do InvoicePaymentSheet, o campo Telefone (linhas 818-827) aceita qualquer texto sem limite e sem máscara, e o CPF/CNPJ (linhas 828-840) remove não-dígitos mas não limita tamanho (CPF/CNPJ tem no máximo 14 dígitos) — o usuário pode digitar dígitos infinitamente e só descobre o erro quando o gateway (Asaas) rejeita. O Número do cartão usa maxLength={19} com strip de não-dígitos, permitindo 19 dígitos, acima dos 16 do placeholder (menor, pois há bandeiras de 19). CEP, validade e CVV estão corretamente limitados.

**Evidência:**

```
<Input label="CPF/CNPJ" placeholder="Somente números" value={cardForm.cpfCnpj} onChangeText={(t) => setCardForm((f) => ({ ...f, cpfCnpj: t.replace(/\D/g, "") }))} keyboardType="numeric" ... /> // sem maxLength; Telefone (l.818-827) sem máscara e sem maxLength
```

**Recomendação:** Aplicar slice(0, 14) no CPF/CNPJ (+maxLength={18} se formatar), máscara/limite de 11-13 dígitos no telefone, e slice de dígitos no número do cartão coerente com o maxLength.

**Arquivos relacionados:** `app:components/sheets/InvoicePaymentSheet.tsx:718-731`

### 10. [Médio] API: CreatePaymentDto aceita amount 0/negativo e quantity 0/negativo — pagamento criado sem nenhuma parcela

**Local:** `api:src/infra/http/controllers/finance/dto/Payment.dto.ts:48` · **Origem:** achado novo da auditoria

O DTO valida amount e quantity apenas com @IsNumber/@IsNotEmpty (0 e negativos passam, pois IsNotEmpty só barra ''/null/undefined). No PaymentService.create, o loop `for (let i = 0; i < quantity; i++)` com quantity <= 0 não executa nenhuma iteração: o payment é persistido SEM nenhuma transaction (parcela), ficando órfão nas telas que calculam status por transactions (ex.: 0/0 parcelas pagas). Amount negativo/0 também é aceito. Os frontends web coagem quantity para >= 1, mas a API fica exposta a qualquer cliente (app mobile, integrações, requests diretos).

**Evidência:**

```
@IsNotEmpty({ message: 'Insira uma quantidade valida' }) @IsNumber({}, { message: 'Insira uma quantidade valida' }) quantity!: number; // e payment.service.ts:56-73: for (let i = 0; i < quantity; i++) { ... value: isTotalValue ? payment.amount / quantity : payment.amount ... } await this.paymentRepository.create(payment);
```

**Recomendação:** Adicionar @Min(0.01) em amount e @Min(1)/@IsInt em quantity no CreatePaymentDto e EditPaymentDto (mensagens já estão em pt-BR).

**Arquivos relacionados:** `api:src/domain/application/services/finance/services/payment.service.ts:56-73`

### 11. [Baixo] Estoque mínimo (Add/EditProductSheet): digitar '0' faz o dígito sumir e não aceita estado intermediário

**Local:** `web:app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx:269` · **Origem:** achado novo da auditoria

Os campos de estoque mínimo usam `value={minimumStock === 0 ? "" : minimumStock}` com onChange `Number(e.target.value) || 0`. Isso evita o '0 preso', mas cria o efeito inverso: digitar '0' converte para 0 e o input renderiza vazio (o dígito digitado desaparece na hora). Estados intermediários também são normalizados agressivamente. UX confusa, sem perda de dados.

**Evidência:**

```
<Input type="number" min={0} placeholder="0" value={minimumStock === 0 ? "" : minimumStock} onChange={(e) => setMinimumStock(Number(e.target.value) || 0)} onFocus={(e) => e.target.select()} />
```

**Recomendação:** Mesmo padrão de state string com conversão no submit; assim '0' digitado permanece visível.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/stock/EditProductSheet.tsx:255-275` · `web:app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx:288-297`

### 12. [Baixo] CurrencyInput não representa 0 nem valores negativos — risco no editar conta bancária

**Local:** `web:components/ui/currency-input.tsx:45` · **Origem:** achado novo da auditoria

O displayValue esconde qualquer valor <= 0 (`value > 0 ? formatBRL(value) : ""`) e o useEffect só sincroniza com `value >= 0`. No BankAccountSheet, editar uma conta com saldo inicial 0 mostra o campo vazio (aceitável), mas se a API permitir saldo inicial negativo o campo abre vazio e salvar sobrescreve o saldo com 0 sem o usuário perceber. Não confirmei na API se initialBalance negativo é possível — achado condicional, mas a limitação do componente é real e verificada no código.

**Evidência:**

```
const displayValue = focused ? inputValue : (value > 0 ? formatBRL(value) : ""); ... React.useEffect(() => { if (!focused && value >= 0) { setInputValue(value > 0 ? formatBRL(value) : ""); } }, [value, focused]);
```

**Recomendação:** Exibir explicitamente 0 como "0,00" quando o chamador passar 0 vindo de dado persistido (prop opcional showZero) e decidir política para negativos; hoje o componente silencia ambos.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/BankAccountSheet.tsx:55-60,177-180`

---

## Campos e filtros de data

> O sistema web centraliza datas em dois componentes próprios (components/ui/date-input.tsx e date-time-picker.tsx): o calendário deles funciona, mas o campo digitável do DateInput aceita qualquer sequência de 8 dígitos (ex.: 80/50/5021) sem mensagem de erro — quando a data é impossível ou incompleta ele simplesmente NÃO propaga o valor, então filtros não filtram e formulários salvam sem data (ou com a data antiga), o que explica os dois bugs reportados (filtro de atendimentos e nascimento 60/92/9). No backend, a validação de datas é fraca: vários DTOs usam apenas @IsString (birthDate do animal, dueStart/dueEnd de faturas, datas de lead e expirationDate de assinatura) e os controllers fazem new Date() sem checar Invalid Date, permitindo 500 e datas erradas; @IsDateString sem strict ainda aceita 30/02. O filtro do financeiro está errado na API: endDate "YYYY-MM-DD" vira meia-noite UTC e o lte corta o dia final inteiro para registros com hora real (mesma classe em faturas e estatísticas de transação) — exatamente o bug do "até dia 29". O bloqueio de data retroativa relatado pela Rafaela NÃO existe no código atual (nenhum min/isBefore em nenhum sheet de criação nem na API de appointment) — provavelmente versão antiga ou confusão de fluxo. Pontos corretos que servem de modelo: filtro de data da tela de serviços (range 00:00–23:59.999 local), janelas BRT do prismaAppointment.repository e o parseDateRange de cupons/anúncios (T23:59:59.999Z + checagem de NaN).

### 1. [Crítico] API aceita qualquer string como data de nascimento do animal (só @IsString) e faz new Date() sem validar

**Local:** `api:src/infra/http/controllers/animal/dto/animal.dto.ts:74` · **Origem:** reportado nos testes manuais

CreateAnimalDto/EditAnimalDto validam birthDate apenas com @IsString — qualquer texto passa ('60/92/9', 'banana'). O controller então faz new Date(birthDate) sem checar Invalid Date: strings BR 'dd/MM/yyyy' são interpretadas como mês/dia americano (10/03/2020 vira 3 de outubro) e strings inválidas viram Invalid Date, que estoura no Prisma como erro 500. É o lado backend do bug 'modal criar animal deixou salvar 60/92/9': a API não teria barrado.

**Evidência:**

```
@IsString({ message: 'Informe uma data de nascimento válida' })
@IsOptional()
birthDate?: Date;  // (linhas 72-74; mesmo padrão no Edit, linhas 123-125)
// animal.controller.ts:47 → birthDate: birthDate ? new Date(birthDate) : undefined,
```

**Recomendação:** Trocar @IsString por @IsDateString({ strict: true }) (ou @Type(() => Date) + @IsDate como já feito em birthDateStart/birthDateEnd, linhas 213-226 do mesmo arquivo) e rejeitar Invalid Date no controller antes de chamar o service.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/animal.controller.ts (linhas 47 e 73)` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx (linhas 267/295 enviam form.birthDate cru)`

### 2. [Crítico] App mobile aceita datas de calendário impossíveis (31/02) no cadastro de animal e gera 500 na API

**Local:** `app:components/sheets/AnimalRegistrationSheet.tsx:50` · **Origem:** achado novo da auditoria

dateBrToIso valida apenas dia 1-31, mês 1-12 e ano 1900-2100, sem conferir dias do mês: 31/02/2026 passa e vira '2026-02-31'. Na API, new Date('2026-02-31') é Invalid Date (formato ISO é validado pelo V8) e o Prisma lança erro → requisição falha com 500 sem mensagem amigável. Fluxo quebra para o usuário do app.

**Evidência:**

```
if (month < 1 || month > 12) return null;
if (day < 1 || day > 31) return null;
if (year < 1900 || year > 2100) return null;
return `${yyyy}-${mm}-${dd}`;  // 31/02 passa
```

**Recomendação:** Validar a data real (ex.: montar Date e conferir se dia/mês/ano batem de volta) antes de enviar; e a API deve rejeitar Invalid Date com 400.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/animal.controller.ts (linha 47, new Date sem validação)`

### 3. [Alto] Filtro de datas do financeiro corta registros do último dia (endDate vira meia-noite UTC)

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts:128` · **Origem:** reportado nos testes manuais

O front envia startDate/endDate como 'YYYY-MM-DD' (DateInput). No repositório de pagamentos a API faz new Date(endDate) = 00:00:00 UTC do dia e usa lte. Qualquer transação cujo paymentDate/dueDate tem hora real (ex.: paymentDate = new Date() gravado na hora do pagamento, transaction.service.ts:311; dueDate = new Date() em invoice.service.ts:358/402/457) fica FORA do resultado se cair no último dia do range — exatamente o bug 'filtrando até dia 29, registros do dia 29 somem'. O início também desloca: gte 00:00 UTC = 21:00 BRT do dia anterior.

**Evidência:**

```
const start = new Date(startDate);
const end = new Date(endDate);
return { OR: [
  { paymentDate: { not: null, gte: start, lte: end } },
  { paymentDate: null, dueDate: { gte: start, lte: end } },
] };  // sem fim-de-dia (linhas 116-131)
```

**Recomendação:** No repositório, normalizar o fim do range para o fim do dia no fuso do Brasil (ex.: `${endDate}T23:59:59.999` + offset -03:00, como já é feito em prismaAppointment.repository.ts linhas 149-153) e o início para 00:00 BRT.

**Arquivos relacionados:** `web:app/(dashboard)/financial/_components/PaymentsTable.tsx (linhas 132-133, envia YYYY-MM-DD cru)` · `web:app/(dashboard)/financial/page.tsx (linhas 60-67, periodRange date-only)` · `api:src/domain/application/services/finance/services/transaction.service.ts (linha 311, paymentDate com hora real)`

### 4. [Alto] DateInput aceita digitação de data impossível (80/50/5021) sem erro e descarta o valor em silêncio

**Local:** `web:components/ui/date-input.tsx:163` · **Origem:** reportado nos testes manuais

A máscara só limita a 8 dígitos; 80/50/5021 é exibido normalmente. Quando os 8 dígitos formam data inválida (ou o usuário para no meio, ex.: 60/92/9), toApiDate retorna '' e onChange NÃO é chamado — sem toast, sem borda vermelha. Consequências: (1) no filtro de atendimentos o usuário vê 80/50/5021 no campo e acha que filtrou, mas nada mudou; (2) no modal de animal o usuário digita 60/92/9, o form salva sem data (ou mantém a data antiga se estava editando) e ninguém avisa; (3) o `required` é satisfeito pelo texto inválido, deixando submeter formulário com estado vazio. Afeta TODOS os consumidores: ServicesTable (filtro), CreateAnimalSheet, PaymentsTable, InvoicesTable, NotesTable, NewPaymentSheet, NewInvoiceSheet, PayTransactionSheet, ServicePayments, ServiceRecords, ServiceHealthManagement (6 usos), AddStockEntrySheet, SendGeneralToVolanteSheet, DayView.

**Evidência:**

```
if (digits.length === 8) {
  const api = toApiDate(v);
  if (api) onChange(api);
}  // inválido/incompleto → onChange nunca dispara, nenhum feedback ao usuário
```

**Recomendação:** No blur (e no submit), se o texto digitado não corresponde a uma data válida, mostrar estado de erro (borda + mensagem 'Data inválida') em vez de reverter silenciosamente; opcionalmente limitar dia≤31/mês≤12 já na máscara, como o formatExpiryMonth do checkout faz (lib/masks.ts:73-78).

**Arquivos relacionados:** `web:app/(dashboard)/services/_components/ServicesTable.tsx (linhas 438-444, bug reportado do filtro)` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx (linhas 738-746, bug reportado do nascimento)`

### 5. [Alto] Preenchimento por áudio injeta birthDate sem normalizar — data pode ser salva errada (dd/MM interpretado como MM/dd)

**Local:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:476` · **Origem:** achado novo da auditoria

O fluxo AudioToFormButton do CreateAnimalSheet grava no estado o birthDate cru retornado pelo LLM, que o prompt instrui a devolver 'DD/MM/AAAA ou ISO' (route.ts:20). O submit envia form.birthDate sem converter (o DateInput só normaliza a EXIBIÇÃO). Se vier '10/03/2020', a API faz new Date('10/03/2020') = 3 de outubro de 2020 (parse americano) — data salva silenciosamente errada; strings não parseáveis viram Invalid Date → 500.

**Evidência:**

```
if (next.birthDate) updated.birthDate = next.birthDate;  // cru, sem parseDateToApiFormat
// linha 295: if (form.birthDate) body.birthDate = form.birthDate;
```

**Recomendação:** Aplicar parseDateToApiFormat(next.birthDate) ao receber o resultado do áudio e descartar/alertar se retornar ''.

**Arquivos relacionados:** `web:app/api/audio/transcribe-to-form/route.ts (linha 20, 'data no formato DD/MM/AAAA ou ISO')` · `api:src/infra/http/controllers/animal/animal.controller.ts (linha 47)` · `web:lib/date-parse.ts (parseDateToApiFormat já existe e não é usado aqui)`

### 6. [Alto] Filtro 'Vence de/até' das faturas corta o último dia e aceita lixo (dueStart/dueEnd só @IsString)

**Local:** `api:src/infra/http/controllers/invoice/invoice.controller.ts:87` · **Origem:** achado novo da auditoria

Mesma classe do financeiro: o front envia dueEnd 'YYYY-MM-DD', o controller faz new Date(dueEnd) = 00:00 UTC e o repositório usa lte — faturas com dueDate gravado com hora real (invoice.service.ts usa dueDate: new Date() nas linhas 358/402/457) somem do último dia do filtro. Além disso o DTO valida dueStart/dueEnd apenas com @IsString: qualquer string passa e new Date('lixo') = Invalid Date chega ao Prisma → erro 500.

**Evidência:**

```
dueStart: query.dueStart ? new Date(query.dueStart) : undefined,
dueEnd: query.dueEnd ? new Date(query.dueEnd) : undefined,  // 00:00 UTC, sem NaN-check
// invoice.dto.ts:144-152 → @IsString() dueStart?: string; @IsString() dueEnd?: string;
```

**Recomendação:** Validar com @IsDateString, checar Invalid Date, e expandir dueEnd para fim do dia (23:59:59.999 no fuso BR).

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/repositories/prismaInvoice.repository.ts (linhas 153-160, gte/lte cru)` · `api:src/domain/application/services/invoice/invoice.service.ts (linhas 358/402/457, dueDate com hora real)` · `web:app/(dashboard)/financial/_components/InvoicesTable.tsx (linhas 591-604, DateInputs 'Vence de/até')`

### 7. [Alto] Estatísticas de transação (KPIs/gráficos do financeiro) excluem o último dia do período

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts:90` · **Origem:** achado novo da auditoria

getStatistics usa gte/lte com as datas cruas. O front (useFinancialData) monta o range com new Date('YYYY-MM-DD') → endDate = 00:00 UTC do último dia, então transações pagas em qualquer hora do último dia (paymentDate com hora real) ficam fora dos KPIs e da evolução mensal — mesma classe do bug reportado no filtro, mas afetando os cartões e gráficos.

**Evidência:**

```
OR: [
  { paymentDate: { gte: data.startDate, lte: data.endDate } },
  { dueDate: { gte: data.startDate, lte: data.endDate } },
],  // sem fim-de-dia
```

**Recomendação:** Mesma correção do achado do filtro: normalizar endDate para fim do dia no fuso BR (na API, para valer para todos os clientes).

**Arquivos relacionados:** `web:app/(dashboard)/financial/_utils/useFinancialData.ts (linhas 53-74, end = new Date('YYYY-MM-DD') e envia toISOString)`

### 8. [Médio] Bloqueio de data retroativa relatado pela Rafaela NÃO existe no código atual — não localizado

**Local:** `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx:522` · **Origem:** reportado nos testes manuais

Varri todos os caminhos de criação de atividade/compromisso: NewAppointmentSheet (modal 'nova atividade', DateTimePicker sem prop min, linha 522), QuickStartAppointmentSheet (linha 117), RescheduleAppointmentSheet (425), ReturnAppointmentSheet (140), ReturnAppointmentAnimalSheet (278), ChangeAppointmentStatusSheet (228), cliques em slot do calendário (DayView:159, WeekView:162, CalendarMain:189 — sem checagem de passado) e a API (appointment.service.ts e appointment.dto.ts — nenhuma regra de data mínima; grep por isBefore/passado/retroativ não retorna bloqueio). O app mobile não tem criação de atividade (só AnimalRegistrationSheet e InvoicePaymentSheet). Conclusão: ou a Rafaela usava uma versão anterior do sistema, ou o 'bloqueio' percebido é o comportamento do DateTimePicker/DateInput de descartar silenciosamente entrada inválida (achado do date-input), que pode parecer 'não deixa'. Não afirmo causa sem evidência.

**Evidência:**

```
<DateTimePicker ... />  // nenhum uso de prop `min` em nenhum sheet do repo (grep min= em app/**/*.tsx só retorna min numéricos de inputs de quantidade)
```

**Recomendação:** Reproduzir com a Rafaela anotando a tela exata e a mensagem exibida; se ocorrer de novo, capturar o request no network — o bloqueio não está neste código.

**Arquivos relacionados:** `web:components/ui/date-time-picker.tsx (min/max existem mas nunca são passados)` · `api:src/domain/application/services/appointment/services/appointment.service.ts (sem regra de data mínima)`

### 9. [Médio] Filtro por data das Anotações compara o dia em UTC — notas criadas à noite somem/aparecem no dia errado

**Local:** `web:app/(dashboard)/notes/_components/NotesTable.tsx:364` · **Origem:** achado novo da auditoria

O filtro converte a data da nota com new Date(n.date).toISOString().split('T')[0], ou seja, o dia em UTC. Uma nota de 29/07 22:00 BRT é 30/07 em UTC: filtrando por 29/07 ela não aparece, filtrando por 30/07 aparece indevidamente. Mesma classe timezone do financeiro, mas no client-side.

**Evidência:**

```
const noteDate = new Date(n.date).toISOString().split("T")[0];
return noteDate === dateFilter;
```

**Recomendação:** Comparar no fuso local (ex.: format(new Date(n.date), 'yyyy-MM-dd') do date-fns) ou reutilizar a heurística de lib/format.ts.

### 10. [Médio] ADM: expirationDate da assinatura salva como 00:00 UTC e exibida em fuso local — mostra um dia antes; DTO aceita qualquer string

**Local:** `adm:src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx:223` · **Origem:** achado novo da auditoria

No modal de edição, o valor do input type=date é convertido com new Date(editExpiration).toISOString() → 00:00 UTC. A exibição usa new Date(...).toLocaleDateString('pt-BR') (modal linha 297 e listagem page.tsx linha 135), que no fuso -03:00 mostra o dia ANTERIOR ao escolhido pelo admin. Além disso, AdminUpdateSignatureBodyDto valida expirationDate só com @IsString — qualquer lixo passa pela validação. Como expirationDate controla acesso de TRIAL (companySignature.service.ts:560), o corte real também ocorre às 21:00 BRT do dia anterior ao pretendido.

**Evidência:**

```
payload.expirationDate = new Date(editExpiration).toISOString();  // 00:00Z
// linha 297: new Date(subscription.expirationDate).toLocaleDateString(  → dia anterior em BRT
```

**Recomendação:** Gravar fim-de-dia no fuso BR (ou exibir com formatação date-only como lib/format.ts da web) e validar o DTO com @IsDateString.

**Arquivos relacionados:** `adm:src/app/(private)/subscriptions/page.tsx (linha 135)` · `api:src/infra/http/controllers/admin/dto/adminSignature.dto.ts (linhas 24-28, @IsString)` · `api:src/domain/application/services/signature/service/companySignature.service.ts (linhas 559-561)`

### 11. [Médio] App: data de nascimento do animal exibida um dia antes (toLocaleDateString sobre meia-noite UTC)

**Local:** `app:app/(animal)/[id].tsx:118` · **Origem:** achado novo da auditoria

birthDate é armazenado como meia-noite UTC (ex.: 2020-03-10T00:00:00.000Z). A tela de detalhe do animal usa new Date(birthDate).toLocaleDateString('pt-BR'), que em BRT (-03:00) exibe 09/03/2020. O próprio app tem o util formatCalendarDatePtBR (lib/date-utils.ts) criado exatamente para isso, mas essa tela não o usa.

**Evidência:**

```
value: animal.birthDate
  ? new Date(animal.birthDate).toLocaleDateString("pt-BR")
  : null,
```

**Recomendação:** Trocar por formatCalendarDatePtBR(animal.birthDate).

**Arquivos relacionados:** `app:lib/date-utils.ts (formatCalendarDatePtBR, solução já existente)`

### 12. [Médio] Campos de data sem indicador de dropdown ('setinha'): DateTimePicker e DateInput não têm chevron

**Local:** `web:components/ui/date-time-picker.tsx:192` · **Origem:** reportado nos testes manuais

O gatilho do DateTimePicker é um botão com ícone de calendário à ESQUERDA e nenhum indicador à direita de que abre um popover — parece campo estático (usado em Nova Atividade, Reagendar, Retorno, Concluir atendimento, Lembretes, Anotações). O DateInput tem botão-calendário à direita, mas sem chevron-down. Em contraste, o Select do design system usa ChevronDown (select.tsx:328), então os campos de data destoam do padrão — é o bug reportado das 'setinhas'.

**Evidência:**

```
<Calendar className="h-4 w-4 shrink-0 ..." />
<span ...>{displayLabel || placeholder}</span>  // nenhum ChevronDown no gatilho (linhas 177-201)
```

**Recomendação:** Adicionar ChevronDown à direita do gatilho dos dois componentes (girando quando aberto), seguindo o Select.

**Arquivos relacionados:** `web:components/ui/date-input.tsx (linhas 225-234, só ícone Calendar)` · `web:components/ui/select.tsx (linha 328, padrão ChevronDown a seguir)`

### 13. [Médio] @IsDateString sem strict aceita datas de calendário inválidas (ex.: 2023-02-30) em dezenas de DTOs

**Local:** `api:src/infra/http/controllers/finance/dto/payment.dto.ts:39` · **Origem:** achado novo da auditoria

Todos os usos de @IsDateString na API (95 ocorrências em 26 arquivos: payment.dto, transaction.dto, appointment.dto, reminder.dto, note.dto, productStock.dto, todos os DTOs de reprodução etc.) estão sem { strict: true }. O isISO8601 padrão valida só o formato: '2023-02-30' passa, e new Date('2023-02-30') = Invalid Date estoura depois no Prisma (500) em vez de retornar 400 com mensagem clara. Mês 92/dia 60 são barrados pelo formato, mas 31/02, 31/04 etc. não.

**Evidência:**

```
@IsDateString({}, { message: 'Insira uma data valida' })
@IsNotEmpty({ message: 'Insira uma data valida' })
firstDueDate!: Date;  // sem strict: '2023-02-30' passa
```

**Recomendação:** Padronizar @IsDateString({ strict: true, strictSeparator: true }) nos DTOs de data (ou @Type(() => Date) + @IsDate).

**Arquivos relacionados:** `api:src/infra/http/controllers/appointment/dto/appointment.dto.ts (linhas 43-50 e 241-252)` · `api:src/infra/http/controllers/finance/dto/transaction.dto.ts (linhas 47, 82, 122, 162)`

### 14. [Baixo] Datas de filtro de leads (CRM) validadas só com @IsString na API

**Local:** `api:src/infra/http/controllers/crm/dto/leadDto.ts:97` · **Origem:** achado novo da auditoria

FetchLeadDto e o DTO de fetchLeads validam startDate/endDate com @IsString — qualquer string passa e vira Date no repositório (fetchConditional), com risco de Invalid Date no Prisma. Hoje o CRM web não expõe esse filtro na UI (nenhum DateInput em app/(dashboard)/crm), então a exposição é só via API direta, mas é a mesma classe de falta de validação.

**Evidência:**

```
@IsString({ message: 'Insira uma data de inicio valida' })
@IsOptional()
startDate?: Date;  // (linhas 96-104 e 117-125)
```

**Recomendação:** Trocar para @IsDateString({ strict: true }) como nos demais DTOs.

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/repositories/prismaLead.repository.ts (linhas 92-107, usa as datas no where)`

---

## Mensagens de erro e i18n

> A API não tem nenhuma camada de i18n/tradução de erros: os erros de domínio em src/core/errors nascem com mensagens fixas em inglês ("Resource already exists", "Company user limit exceeded", "Not allowed", "Resource not found", "Animal already registered"), o ErrorHandler central repassa error.message cru para as exceptions HTTP e não existe ExceptionFilter global — qualquer exceção não tratada (falha de SMTP na recuperação de senha, erro do Prisma, resposta inesperada do Asaas) vira o 500 default do Nest com body "Internal server error" em inglês. As mensagens de validação de DTO são um mosaico: ~1467 decorators class-validator sem message (erro default em inglês, ex. "email must be an email") e centenas com message "misturada" usando o nome técnico do campo ("breed é obrigatório", "back é obrigatório", "nextDate é obrigatório", "xRay é obrigatório"). Nos três frontends não existe camada de mapeamento API→usuário: o web (ApiContext.tsx) lança new Error(message) cru e ~30 componentes fazem toast.error(err.message); o app mobile toasta res.body.message cru inclusive em 500; o ADM é o único que mascara o 500 ("Ops! algo deu errado"), mas repassa cru os demais status. A única tradução existente no sistema inteiro é um mapa local de 7 entradas dentro de NewAppointmentSheet.tsx. Todos os 5 bugs reportados foram confirmados com causa raiz localizada, e a varredura encontrou a mesma classe de problema em login/cadastro do app, cupons/assinaturas do ADM, edição de vacina e integração Asaas.

### 1. [Crítico] "Internal server error" cru ao usuário — API sem ExceptionFilter global e frontends sem máscara de 500

**Local:** `api:src/infra/shared/handler/error.handler.ts:39` · **Origem:** reportado nos testes manuais

Não existe nenhum @Catch/ExceptionFilter no src da API (grep vazio). Qualquer exceção não tratada — ex.: falha do SMTP em sendMail na recuperação de senha (RecoverPasswordCode.service.ts:44 e RecoverClientPasswordCode.service.ts:63, sem try/catch), erro do Prisma, resposta inesperada do Asaas — vira o 500 default do Nest com body {"message":"Internal server error"}. Além disso o próprio ErrorHandler tem default que gera InternalServerErrorException(error.message) para erros não mapeados. Exibição crua confirmada: web recover-password/page.tsx:38 (setError(data.message)), app forgot-password.tsx:41/78, app InvoicePaymentSheet.tsx:254/326/406 (pagar parcelas — Toast com res.body.message), web InvoicesTable.tsx:310 (dar baixa em fatura). O ADM é o único que mascara ('Ops! algo deu errado, tente novamente', ApiContext.tsx:101-105).

**Evidência:**

```
default:
  throw new InternalServerErrorException(error.message);
// RecoverPasswordCode.service.ts:44 (sem try/catch — SMTP fora = 500)
await this.sendEmail.sendMail({ to: user.email, subject, html });
// app InvoicePaymentSheet.tsx:254
(res.body as { message?: string })?.message ?? ...
// web recover-password/page.tsx:38
setError((data as { message?: string }).message ?? "Erro ao enviar código.");
```

**Recomendação:** Adicionar um ExceptionFilter global na API que loga o erro real e responde 500 com mensagem PT genérica ('Erro interno. Tente novamente.'); nos frontends, tratar status >= 500 com mensagem própria em vez de exibir res.body.message.

**Arquivos relacionados:** `api:src/infra/main.ts` · `api:src/domain/application/services/account/services/RecoverPasswordCode.service.ts` · `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts` · `web:app/(auth)/recover-password/page.tsx` · `app:app/(auth)/forgot-password.tsx` · `app:components/sheets/InvoicePaymentSheet.tsx` · `web:app/(dashboard)/financial/_components/InvoicesTable.tsx`

### 2. [Alto] "Resource already exists" em inglês e sem indicar o campo duplicado (e-mail ou CPF)

**Local:** `api:src/core/errors/errors/resourceAlreadyExistsError.ts:5` · **Origem:** reportado nos testes manuais

ResourceAlreadyExistsError tem mensagem fixa 'Resource already exists' sem parâmetro de campo. Na criação de cliente, o service retorna esse erro tanto para e-mail duplicado (linha 65) quanto para CPF duplicado (linha 70) — impossível distinguir. O ErrorHandler repassa a mensagem crua num ConflictException e o web toasta err.message direto (CreateOwnerSheet.tsx:106-108). O mesmo erro cru aparece no cadastro do app mobile (signup.tsx:98), no vínculo cliente-empresa (client.service.ts:329), em cupons, admins e usuários do painel ADM.

**Evidência:**

```
export class ResourceAlreadyExistsError extends Error implements ServiceError {
  constructor() {
    super('Resource already exists');
  }
}
// client.service.ts:63-70
const clientAlreadyExists = await this.clientRepository.findByEmail(email);
if (clientAlreadyExists) return left(new ResourceAlreadyExistsError());
if (cpf) {
  const cpfAlreadyExists = await this.clientRepository.findByCpf(cpf);
  if (cpfAlreadyExists) return left(new ResourceAlreadyExistsError());
}
```

**Recomendação:** Aceitar um parâmetro de mensagem no construtor (com default em PT) e lançar mensagens específicas: 'Já existe um cliente com este e-mail.' / 'Já existe um cliente com este CPF.'. Alternativa mínima: criar mapa de tradução central no frontend para o fallback.

**Arquivos relacionados:** `api:src/domain/application/services/client/services/client.service.ts` · `api:src/infra/shared/handler/error.handler.ts` · `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx` · `app:app/(auth)/signup.tsx` · `api:src/domain/application/services/admin/services/coupon.service.ts` · `api:src/domain/application/services/admin/services/adminUserManagement.service.ts` · `api:src/domain/application/services/account/services/User.service.ts`

### 3. [Alto] "Company user limit exceeded" em inglês no cadastro com código de empresa

**Local:** `api:src/core/errors/errors/companyUserLimitExceededError.ts:5` · **Origem:** reportado nos testes manuais

CompanyUserLimitExceededError tem mensagem fixa em inglês. É retornado no fluxo de registro quando o usuário entra numa empresa existente cujo plano já atingiu o limite de usuários (User.service.ts:337-339). O ErrorHandler converte em ForbiddenException(error.message) e a página de registro do web exibe data.message cru (register/page.tsx:112-113). O veterinário vê a frase em inglês sem saber o que fazer (não diz o limite nem sugere upgrade).

**Evidência:**

```
super('Company user limit exceeded');
// User.service.ts:337-339
if (currentUsers.length >= signaturePlan.userQuantity) {
  return left(new CompanyUserLimitExceededError());
}
// error.handler.ts:34-35
case CompanyUserLimitExceededError:
  throw new ForbiddenException(error.message);
// web register/page.tsx:112-113
setError((data as { message?: string }).message ?? "Erro ao criar conta.")
```

**Recomendação:** Trocar a mensagem para PT com contexto: 'A empresa atingiu o limite de usuários do plano atual. Fale com o administrador para fazer upgrade.'

**Arquivos relacionados:** `api:src/domain/application/services/account/services/User.service.ts` · `api:src/infra/shared/handler/error.handler.ts` · `web:app/(auth)/register/page.tsx`

### 4. [Alto] "breed é obrigatório" — mensagem de validação com nome técnico do campo em inglês

**Local:** `api:src/infra/http/controllers/animal/dto/animal.dto.ts:36` · **Origem:** reportado nos testes manuais

O DTO de criação de animal usa o nome do campo do banco na mensagem: '@IsNotEmpty({ message: \'breed é obrigatório\' })'. O app mobile envia breed vazio quando o usuário não seleciona raça (AnimalRegistrationSheet.tsx:191 envia `breed: breedId ?? ""` e só valida o nome no cliente), recebe o 400 e toasta a mensagem crua (linha 217). O web tem o mesmo buraco: CreateAnimalSheet só valida `name` antes do POST /animal, então raça vazia produz o mesmo toast. O usuário vê 'breed' em vez de 'Raça'.

**Evidência:**

```
@IsString({ message: 'Informe uma raça válida' })
@IsNotEmpty({ message: 'breed é obrigatório' })
breed!: string;
// app AnimalRegistrationSheet.tsx:191 e 217
breed: breedId ?? "",
Toast.show({ type: "error", text1: (res.body as any)?.message ?? "Erro ao cadastrar" });
```

**Recomendação:** Trocar a mensagem do DTO para 'A raça é obrigatória' (padrão: nome de exibição PT, nunca o nome do campo). Idealmente também validar raça no cliente antes do submit.

**Arquivos relacionados:** `app:components/sheets/AnimalRegistrationSheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `web:context/ApiContext.tsx`

### 5. [Alto] ~1467 decorators class-validator sem message: erros default do Nest em inglês em 79 DTOs

**Local:** `api:src/infra/http/controllers/client/dto/client.dto.ts:14` · **Origem:** achado novo da auditoria

A varredura encontrou 1467 ocorrências de @IsNotEmpty()/@IsString()/@IsEmail()/@IsUUID() etc. sem message customizada em 79 arquivos de DTO. O ValidationPipe global (main.ts:11-15) não tem exceptionFactory nem i18n, então qualquer violação retorna o texto default em inglês ('name should not be empty', 'email must be an email', 'companyId must be a UUID'). Exemplo user-facing direto: CreateClientDto (criação de cliente) tem todos os campos sem message. Esses arrays de mensagens chegam crus aos toasts dos três frontends.

**Evidência:**

```
@IsString()
@IsNotEmpty()
name!: string;
...
@IsEmail()
@IsNotEmpty()
email!: string;
// main.ts:11-15
app.useGlobalPipes(new ValidationPipe({ transform: true }));
```

**Recomendação:** Configurar exceptionFactory no ValidationPipe global traduzindo os constraints para PT (ou adotar nestjs-i18n), em vez de corrigir DTO por DTO.

**Arquivos relacionados:** `api:src/infra/main.ts` · `api:src/infra/http/controllers/invoice/dto/invoice.dto.ts` · `api:src/infra/http/controllers/appointment/dto/appointment.dto.ts` · `api:src/infra/http/controllers/studFarm/dto/studFarm.dto.ts`

### 6. [Alto] "Resource not found" em inglês e mapeado para HTTP 410 Gone em vez de 404

**Local:** `api:src/core/errors/errors/resourceNotFoundError.ts:5` · **Origem:** achado novo da auditoria

ResourceNotFoundError tem mensagem fixa em inglês e o ErrorHandler o converte em GoneException (410), semanticamente errado (410 = recurso removido permanentemente). É o erro mais usado da API (login com conta inexistente, recuperação de senha com e-mail não cadastrado, qualquer busca por id). Na recuperação de senha do web, o usuário que digita e-mail não cadastrado vê literalmente 'Resource not found' (recover-password/page.tsx:38 exibe data.message).

**Evidência:**

```
super('Resource not found');
// error.handler.ts:22-23
case ResourceNotFoundError:
  throw new GoneException(error.message);
```

**Recomendação:** Trocar para NotFoundException com mensagem PT parametrizável ('Registro não encontrado.' / 'E-mail não cadastrado.'). Atenção: frontends que testam status 410 precisam ser atualizados junto.

**Arquivos relacionados:** `api:src/infra/shared/handler/error.handler.ts` · `web:app/(auth)/recover-password/page.tsx` · `app:app/(auth)/forgot-password.tsx`

### 7. [Alto] Nenhuma camada central de tradução/mapeamento de erros nos 3 frontends — toast repassa cru

**Local:** `web:context/ApiContext.tsx:43` · **Origem:** achado novo da auditoria

web: ApiContext.tsx lança `new Error(err.message)` com a mensagem crua da API (linhas 41-43, 64-67, 89-92, 111-114) e ~30 componentes fazem `toast.error(err instanceof Error ? err.message : ...)` (CreateOwnerSheet, CreateAnimalSheet, InvoicesTable, ServiceRecords, CrmKanban, PdfSettingsCard, etc.). app: ApiContext retorna `error.response.data` cru sem máscara de 500 (contexts/ApiContext.tsx:62-67) e as telas toastam res.body.message. adm: mascara só o 500; demais status repassam body.message cru (ex.: subscriptions/_components/SubscriptionDetailModal.tsx:98/138/158). A única tradução do sistema inteiro é um mapa local de 7 entradas em NewAppointmentSheet.tsx:28-45 — prova de que o problema já foi percebido e resolvido pontualmente, não estruturalmente.

**Evidência:**

```
const err = await res.json().catch(() => ({ message: res.statusText }));
throw new Error((err as { message?: string }).message ?? "Erro na requisição");
// NewAppointmentSheet.tsx:28-31 (única camada de tradução existente)
const API_ERROR_TRANSLATIONS: Record<string, string> = {
  "userId should not be empty": "O campo responsável é obrigatório", ...
```

**Recomendação:** Extrair translateApiError para um módulo compartilhado por frontend, chamado no ponto único (ApiContext) — cobrindo mensagens de domínio EN, arrays do class-validator e fallback genérico para mensagens desconhecidas/500.

**Arquivos relacionados:** `app:contexts/ApiContext.tsx` · `adm:src/context/ApiContext.tsx` · `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx` · `adm:src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx`

### 8. [Alto] Vacinação sem próxima dose: frontend web injeta data falsa (hoje) para contornar DTO obrigatório

**Local:** `web:services/healthService.ts:75` · **Origem:** reportado nos testes manuais

CreateVaccineDto exige nextDate ('nextDate é obrigatório'), mas o domínio real permite vacina sem próxima dose. O web contorna silenciosamente enviando a data de HOJE quando o campo fica vazio (healthService.ts:75 `nextDate: rest.nextDate || new Date().toISOString().split("T")[0]` — mesmo padrão na linha 123 para vermifugação), o que grava dado errado (próxima dose = hoje) e dispara lembretes indevidos. Quem não usa o contorno (app/fluxos antigos) recebe 400 com mensagem técnica ou, com payload de data inválida (DTO só valida IsString), erro do Prisma → 500 'Internal server error' — o cenário reportado pelo usuário.

**Evidência:**

```
nextDate: rest.nextDate || new Date().toISOString().split("T")[0],
// api vaccine.dto.ts:17-19
@IsString({ message: 'Informe uma data válida' })
@IsNotEmpty({ message: 'nextDate é obrigatório' })
nextDate!: Date;
```

**Recomendação:** Tornar nextDate opcional no DTO/entidade (com @IsDateString para validar formato) e remover o fallback de data falsa no frontend.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/dto/vaccine.dto.ts` · `api:src/domain/application/services/animal/services/vaccine.service.ts`

### 9. [Alto] Integração Asaas: descrição do gateway repassada crua e crash se 'errors' vier vazio

**Local:** `api:src/infra/shared/bank/asaas.ts:99` · **Origem:** achado novo da auditoria

Toda falha do Asaas retorna PaymentError com `connect.data.errors[0].description` — texto do gateway repassado sem tratamento ao usuário (via BadRequestException no ErrorHandler). Além do texto fora de controle da aplicação, se o Asaas responder erro sem o array `errors` (timeout, HTML de proxy, mudança de contrato), `errors[0]` lança TypeError não capturado → 500 'Internal server error' cru — candidato provável ao 500 reportado no fluxo de pagamento de parcelas do app.

**Evidência:**

```
if (connect.status !== 200) return left(new PaymentError(connect.data.errors[0].description));
// padrão repetido nas linhas 148, 186, 206, 214, 230, 240
```

**Recomendação:** Acessar `connect.data?.errors?.[0]?.description` com fallback PT ('Falha na comunicação com o meio de pagamento. Tente novamente.') e logar a resposta completa.

**Arquivos relacionados:** `api:src/core/errors/errors/paymentError.ts` · `app:components/sheets/InvoicePaymentSheet.tsx` · `api:src/infra/shared/handler/error.handler.ts`

### 10. [Médio] Exame físico: "back é obrigatório" — campo exibido como "Dorso" no formulário

**Local:** `api:src/infra/http/controllers/animal/dto/orthopedic/orthopedicService.dto.ts:33` · **Origem:** reportado nos testes manuais

O DTO ortopédico valida `back` com mensagem 'back é obrigatório', mas o formulário web de Exame Físico (ortho-service) rotula o campo como 'Dorso'. O boardRecordService tenta contornar com `formData.back ?? "-"`, porém string vazia não é nullish — se o campo vier como "" o 400 volta com a mensagem técnica e o ServiceRecords.tsx:412 toasta err.message cru. O mesmo DTO exige `inspection`, `rump` e `sensibility`, que nem existem no formulário web (preenchidos com '-'/false hardcoded), evidenciando o descolamento DTO↔form. Mesmo padrão nos DTOs de odontologia ('xRay é obrigatório', 'gums é obrigatório', 'cement é obrigatório').

**Evidência:**

```
@IsNotEmpty({ message: 'back é obrigatório' })
back!: string;
// web mock.ts:287 — label do form
{ key: "back", label: "Dorso" }
// web boardRecordService.ts:328
back: formData.back ?? "-",
```

**Recomendação:** Renomear as mensagens do DTO para o nome de exibição PT ('O campo Dorso é obrigatório') e alinhar os campos obrigatórios do DTO com o que o formulário realmente coleta.

**Arquivos relacionados:** `web:app/(dashboard)/services/_data/mock.ts` · `web:services/boardRecordService.ts` · `web:app/(dashboard)/services/_components/ServiceRecords.tsx` · `api:src/infra/http/controllers/animal/dto/dentistry/dentistryAssessment.dto.ts`

### 11. [Médio] "Animal already registered" e "Not allowed" em inglês repassados cru

**Local:** `api:src/core/errors/errors/animalAlreadyRegisteredError.ts:5` · **Origem:** achado novo da auditoria

AnimalAlreadyRegisteredError ('Animal already registered') é retornado ao vincular animal por código de compartilhamento já usado (animal.service.ts:228/235) e o controller lança ConflictException(error.message) (animal.controller.ts:172-174); o app exibe cru no Toast (AnimalRegistrationSheet.tsx:159) e o web idem (CreateAnimalSheet, fluxo por código, toast err.message). NotAllowedError ('Not allowed') vira ForbiddenException(error.message) no ErrorHandler e chega cru aos toasts em qualquer operação sem permissão (ex.: client.service.ts:299/352).

**Evidência:**

```
super('Animal already registered');
// animal.controller.ts:172-174
if (error instanceof AnimalAlreadyRegisteredError) {
  throw new ConflictException(error.message);
}
// notAllowedError.ts:5
super('Not allowed');
```

**Recomendação:** Traduzir: 'Este animal já está vinculado à sua conta.' e 'Você não tem permissão para esta ação.'

**Arquivos relacionados:** `api:src/core/errors/errors/notAllowedError.ts` · `api:src/domain/application/services/animal/services/animal.service.ts` · `app:components/sheets/AnimalRegistrationSheet.tsx` · `api:src/infra/shared/handler/error.handler.ts`

### 12. [Médio] Padrão sistêmico: mensagens de DTO em português usando nome técnico do campo em inglês

**Local:** `api:src/infra/http/controllers/animal/dto/vaccine.dto.ts:18` · **Origem:** achado novo da auditoria

Dezenas de DTOs seguem o template '<campoTécnico> é obrigatório': 'name é obrigatório', 'date é obrigatório', 'nextDate é obrigatório', 'animalId é obrigatório', 'userId é obrigatório', 'page é obrigatório', 'studFarmId é obrigatório', 'holderName é obrigatório', 'ccv é obrigatório', 'expiryMonth é obrigatório', 'localization/mobility/cement/gums/xRay é obrigatório', 'isRecurrent é obrigatório', 'type é obrigatório'. Confirmado em vaccine.dto.ts, deworming.dto.ts, exam.dto.ts, sanitaryProtocol.dto.ts, studFarm.dto.ts, companySignature.dto.ts, User.dto.ts, dentistryAssessment.dto.ts, orthopedicService.dto.ts. Todos vazam para o usuário via toasts pelo caminho já mapeado. É a mesma classe dos bugs 'breed'/'back' reportados.

**Evidência:**

```
@IsNotEmpty({ message: 'nextDate é obrigatório' })
nextDate!: Date;
// companySignature.dto.ts:38
@IsNotEmpty({ message: 'O campo ccv é obrigatório' })
// dentistryAssessment.dto.ts:65
@IsNotEmpty({ message: 'xRay é obrigatório' })
```

**Recomendação:** Padronizar todas as messages com o nome de exibição PT do campo ('A próxima dose é obrigatória', 'O CVV é obrigatório'); ids internos (animalId, userId, page) não deveriam gerar mensagem user-facing — se faltam, é bug do frontend e merece 400 técnico + toast genérico.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/dto/deworming.dto.ts` · `api:src/infra/http/controllers/animal/dto/exam.dto.ts` · `api:src/infra/http/controllers/dto/sanitaryProtocol.dto.ts` · `api:src/infra/http/controllers/signature/dto/companySignature.dto.ts` · `api:src/infra/http/controllers/account/dto/User.dto.ts` · `api:src/infra/http/controllers/studFarm/dto/studFarm.dto.ts`

### 13. [Médio] PUT /vaccine/:id usa CreateVaccineDto (todos os campos obrigatórios) em vez de EditVaccineDto

**Local:** `api:src/infra/http/controllers/animal/vaccine.controller.ts:30` · **Origem:** achado novo da auditoria

O endpoint de edição de vacina valida o body com CreateVaccineDto, que exige name, date, nextDate, location e animalId. Editar uma vacina enviando só os campos alterados retorna 400 com as mensagens técnicas ('nextDate é obrigatório', 'location é obrigatório') — o EditVaccineDto com campos opcionais existe no mesmo arquivo e não é usado. Isso torna o fluxo de edição de vacina (inclusive marcar sem próxima dose) impossível sem reenviar tudo, e contribui para os erros que o usuário vê nesse fluxo.

**Evidência:**

```
@Put(':id')
async update(@Body() body: CreateVaccineDto, @Param('id') id: string) {
// vaccine.dto.ts define EditVaccineDto (linha 55) com campos @IsOptional, não utilizado
```

**Recomendação:** Trocar o tipo do body do @Put para EditVaccineDto.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/dto/vaccine.dto.ts` · `web:services/healthService.ts`

### 14. [Médio] Formulário web de Exame Físico não coleta campos que o DTO exige (inspection, rump, sensibility)

**Local:** `web:services/boardRecordService.ts:331` · **Origem:** achado novo da auditoria

O DTO CreateOrthopedicServiceDto exige inspection, rump e sensibility como obrigatórios, mas o formulário web 'Exame Físico' (ortho-service) só tem Queixa, Membros, Pescoço, Dorso, Casco e Observação. O boardRecordService envia valores fixos ('-', '-', false) para satisfazer a API, poluindo o prontuário clínico com dados fantasma que aparecem depois em relatórios/PDF. É a causa estrutural do desalinhamento nome-de-campo↔label que gerou o bug 'Back/Dorso'.

**Evidência:**

```
inspection: "-",
rump: "-",
sensibility: false,
// api orthopedicService.dto.ts:23/38/53 — todos @IsNotEmpty
```

**Recomendação:** Tornar inspection/rump/sensibility opcionais no DTO (refletindo o formulário real) ou adicionar os campos ao formulário — decidir com o domínio clínico.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/dto/orthopedic/orthopedicService.dto.ts` · `web:app/(dashboard)/services/_data/mock.ts`

### 15. [Baixo] Guards lançam 401/403 sem mensagem — 'Unauthorized'/'Forbidden' default em inglês

**Local:** `api:src/infra/shared/auth/auth.guard.ts:30` · **Origem:** achado novo da auditoria

auth.guard.ts:30/42, admin-auth.guard.ts:30/39/44, admin-super-admin.guard.ts:13/19 e os decorators CurrentUserId/CurrentCompanyId lançam UnauthorizedException()/ForbiddenException() sem argumento → body com 'Unauthorized'/'Forbidden' em inglês. O 401 é interceptado pelos frontends (redirect para login), mas o 403 pode vazar para toast em fluxos sem tratamento específico. role.guard.ts já está correto ('Acesso negado', 'Você não tem permissão...') — o padrão existe mas não foi aplicado nos demais. O web ApiContext ainda lança `new Error("Unauthorized")` próprio (context/ApiContext.tsx:15).

**Evidência:**

```
throw new UnauthorizedException();
// admin-super-admin.guard.ts:13/19
throw new ForbiddenException();
// contraste — role.guard.ts:28 (correto)
throw new ForbiddenException('Acesso negado');
```

**Recomendação:** Passar mensagens PT nos guards ('Sessão expirada. Faça login novamente.', 'Acesso negado.'), seguindo o padrão já usado em role.guard.ts.

**Arquivos relacionados:** `api:src/infra/shared/auth/admin-auth.guard.ts` · `api:src/infra/shared/auth/admin-super-admin.guard.ts` · `api:src/infra/shared/decorators/CurrentUserId.decorator.ts` · `web:context/ApiContext.tsx`

---

## Planos, limites e assinaturas

> A dimensão de planos/limites/assinaturas tem furos estruturais: dos 4 caminhos que adicionam usuário a uma company, apenas 1 (registro via código de convite) valida o limite do plano — a adição manual de colaborador (POST /user), a criação de usuário pelo ADM e a movimentação de usuário entre companies pelo ADM não validam nada, nem no backend nem no frontend. O limite de usuários NÃO é snapshotado: CompanySignature guarda apenas signaturePlanId e todas as verificações leem o plano ao vivo, então a edição do plano no ADM propaga no backend — o sintoma de "não propagar" provavelmente vem de planos duplicados no banco (o ADM lista e edita qualquer linha) ou da seleção não-determinística da assinatura ativa (fetchByCompanyId sem orderBy). O fluxo de upgrade via PIX cancela a assinatura atual (no Asaas e no banco) antes de o novo plano ser pago, deixando a clínica sem nenhuma assinatura válida e bloqueada pelo middleware até o webhook confirmar o pagamento. Além dos bugs reportados, encontrei IDOR crítico nos endpoints de cancelamento/reembolso de assinatura (qualquer usuário autenticado cancela/reembolsa assinatura de qualquer empresa), assinaturas ACTIVE que nunca expiram localmente (dependem 100% de webhook), trials encadeáveis infinitamente e possibilidade de dupla assinatura recorrente via checkout. Único limite de plano existente é userQuantity — não há limite de animais, atendimentos ou qualquer outro recurso no modelo SignaturePlan nem enforcement em nenhum serviço. O app mobile não tem fluxo de colaboradores (o signup dele registra Client, entidade separada), então os furos estão no web e no ADM.

### 1. [Crítico] Upgrade via PIX cancela a assinatura atual antes do pagamento e derruba o acesso da clínica na hora

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:958` · **Origem:** reportado nos testes manuais

processUpgradeWithPix cancela a assinatura recorrente no Asaas (passo 6, linhas 913-920), marca a assinatura atual como INACTIVE (passo 9, linhas 958-960) e cria a nova como INACTIVE até o PIX ser pago (passo 10, linha 971). Entre gerar o QR Code e o webhook confirmar o pagamento, a company não tem NENHUMA assinatura válida — e o middleware do web chama GET /signature/validation em toda navegação e redireciona para /plans quando falha (middleware.ts:49-55). Se o usuário nunca pagar o PIX, a assinatura antiga (que estava paga e vigente) fica perdida para sempre. O correto é cancelar a antiga apenas no webhook de confirmação do pagamento do upgrade.

**Evidência:**

```
// 6. Cancelar assinatura antiga no Asaas (se existir)
if (activeSignature.asaasSubscriptionId) {
  const cancelResult = await this.subscription.cancelSubscription(...);
}
...
// 9. Marcar assinatura antiga como INACTIVE
activeSignature.status = 'INACTIVE';
await this.companySignatureRepository.save(activeSignature);
// 10. Criar nova assinatura (INACTIVE até pagar o PIX)
```

**Recomendação:** Manter a assinatura atual ACTIVE e apenas criar a nova como INACTIVE/PENDING_UPGRADE; no webhook PAYMENT_CONFIRMED da nova assinatura (signatureValidation), aí sim cancelar a antiga no Asaas e marcá-la INACTIVE. Adicionar também expiração/cleanup de upgrades PIX nunca pagos.

**Arquivos relacionados:** `web:app/(dashboard)/subscription/page.tsx` · `web:middleware.ts` · `api:src/infra/http/controllers/signature/companySignature.controller.ts`

### 2. [Crítico] IDOR: qualquer usuário autenticado pode cancelar ou reembolsar assinatura de qualquer empresa

**Local:** `api:src/infra/http/controllers/signature/companySignature.controller.ts:153` · **Origem:** achado novo da auditoria

PUT /signature/cancel/:signatureId e PUT /signature/refound/:signatureId recebem o id da assinatura na URL e não validam ownership. O controller até passa um 'companyId' para o service, mas com dois defeitos em cascata: (1) usa o decorator @CurrentUserId() rotulado como companyId (linhas 154 e 164), ou seja, passa o id do USUÁRIO; (2) os services cancelSignature e refoundSignature desestruturam apenas { signatureId } e nunca comparam signature.companyId com nada (companySignature.service.ts:508-554). Qualquer usuário logado de qualquer clínica pode cancelar a assinatura Asaas de outra clínica ou disparar reembolso (refoundPayment.refound) de pagamento alheio dentro da janela de 7 dias.

**Evidência:**

```
@Put('cancel/:signatureId')
async cancel(@Param('signatureId') signatureId: string, @CurrentUserId() companyId: string) {
  const result = await this.companySignatureService.cancelSignature({ signatureId, companyId });
// service: async cancelSignature({ signatureId }: CancelSignatureRequest) { ... nunca usa companyId
```

**Recomendação:** Usar @CurrentCompanyId() no controller e, nos services cancelSignature/refoundSignature, retornar NotAllowedError quando signature.companyId !== companyId (a interface CancelSignatureRequest já declara companyId — só não é usado).

**Arquivos relacionados:** `api:src/domain/application/services/signature/service/companySignature.service.ts` · `api:src/domain/application/services/signature/interfaces/companySignatureProps.ts`

### 3. [Alto] Adição manual de colaborador ignora o limite de usuários do plano

**Local:** `api:src/domain/application/services/account/services/User.service.ts:159` · **Origem:** reportado nos testes manuais

A tela de configurações da clínica (web) adiciona colaborador via clinicService.createUser → POST /user → UserService.create, que apenas checa e-mail duplicado e cria o usuário — não consulta assinatura nem userQuantity do plano. O único caminho que valida o limite é o registro com código de convite (User.service.ts:321-341, register com newCompany=false), que retorna CompanyUserLimitExceededError. Resultado: plano de 1 usuário permite colaboradores ilimitados pelo caminho manual. O frontend também não ajuda: nem o modal nem a CollaboratorsTable consultam o limite ou desabilitam o botão.

**Evidência:**

```
async create({ name, email, password, companyId, phone }: CreateUserServiceRequest) {
  const userAlreadyExists = await this.userRepository.findByEmail(email);
  if (userAlreadyExists) return left(new ResourceAlreadyExistsError());
  const passwordHash = await this.hasher.hash(password);
  const user = User.create({ name, email, passwordHash, companyId, phone });
  await this.userRepository.create(user);  // nenhuma checagem de limite
```

**Recomendação:** Extrair a validação de limite do fluxo register (User.service.ts:321-341) para um método compartilhado e chamá-la também em UserService.create antes de criar o usuário. No web, usar o endpoint GET /user/limit-info (já existe) para desabilitar o botão 'Adicionar colaborador' quando currentUsers >= maxUsers.

**Arquivos relacionados:** `api:src/infra/http/controllers/account/user.controller.ts` · `web:app/(dashboard)/clinic/_components/AddCollaboratorModal.tsx` · `web:services/clinicService.ts` · `web:app/(dashboard)/clinic/_components/CollaboratorsTable.tsx`

### 4. [Alto] Limite não é snapshot — edição de plano propaga no backend; sintoma provável vem de planos duplicados ou seleção não-determinística da assinatura

**Local:** `api:src/domain/application/services/signature/service/signaturePlan.service.ts:62` · **Origem:** reportado nos testes manuais

Validei onde o limite fica persistido: apenas em SignaturePlan.userQuantity (schema.prisma:244). CompanySignature guarda somente signaturePlanId (FK, schema.prisma:259/274) — não há snapshot na company nem na assinatura. Todos os checks (User.service.ts:330-340, getUserLimitInfo:445-453) fazem signaturePlanRepository.findById ao vivo, e a edição do ADM (PUT /admin/plans/:id → SignaturePlanService.edit → prisma.signaturePlan.update in-place) altera a mesma linha. Ou seja, NO CÓDIGO a edição 1→3 propaga. Não localizei a causa exata do sintoma relatado; causas prováveis com evidência: (a) planos duplicados no banco — o ADM lista todos via GET /signature-plan (fetchAll sem filtro) e o admin pode editar uma linha homônima diferente da que a assinatura da clínica referencia; o seed (prisma/seed-plan-admin.ts) faz findFirst por nome, o que convive mal com duplicatas; (b) fetchByCompanyId não tem orderBy (prismaCompanySignature.repository.ts:85-93) e os checks usam .find() na lista — com múltiplas assinaturas (trial antigo não expirado + ativa), o limite pode ser lido de um plano antigo; (c) o usuário pode ter observado o 'limite 1' pelo caminho manual, que nunca valida. Recomendo verificar no banco se há mais de uma linha em signature_plans e qual id a law_firm_signatures da clínica aponta.

**Evidência:**

```
async edit({ id, ... userQuantity ... }) {
  const signaturePlan = await this.signaturePlanRepository.findById(id);
  ...
  if (userQuantity !== undefined) signaturePlan.userQuantity = userQuantity;
  await this.signaturePlanRepository.save(signaturePlan); // update in-place, mesma linha referenciada pelas assinaturas
```

**Recomendação:** 1) Auditar duplicidade de planos no banco e impedir nomes duplicados; 2) ordenar fetchByCompanyId por createdAt desc e priorizar status ACTIVE sobre TRIAL nos .find(); 3) reproduzir o cenário: editar plano 1→3 e tentar entrar via código — se ainda bloquear, capturar o signaturePlanId da assinatura vs o id editado.

**Arquivos relacionados:** `api:prisma/schema.prisma` · `api:src/infra/shared/database/prisma/repositories/prismaCompanySignature.repository.ts` · `api:prisma/seed-plan-admin.ts` · `adm:src/app/(private)/plans/_components/PlanDetailModal.tsx` · `api:src/domain/application/services/account/services/User.service.ts`

### 5. [Alto] Cancelar renovação automática derruba o acesso imediatamente, contrariando a promessa da UI

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:548` · **Origem:** achado novo da auditoria

A tela de assinatura do web promete no diálogo de confirmação: 'Você continuará com acesso até o fim do período já pago' (subscription/page.tsx:170-172). Mas CompanySignatureService.cancelSignature seta signature.status = 'INACTIVE' na hora (linhas 548-549), e isSignatureValidForAccess só aceita ACTIVE ou TRIAL válido — então na próxima navegação o middleware expulsa o usuário para /plans, mesmo com meses pagos restantes. O correto seria apenas desligar isAutoRenewActivated/cancelar no Asaas e manter ACTIVE até expirationDate.

**Evidência:**

```
signature.isAutoRenewActivated = false;
signature.status = 'INACTIVE';
await this.companySignatureRepository.save(signature);  // acesso cai na hora, apesar do período pago
```

**Recomendação:** Em cancelSignature, manter status ACTIVE e apenas desativar isAutoRenewActivated (cancelando a recorrência no Asaas); criar scheduler que marque INACTIVE quando expirationDate passar (hoje só existe para TRIAL).

**Arquivos relacionados:** `web:app/(dashboard)/subscription/page.tsx` · `web:middleware.ts`

### 6. [Alto] Assinatura ACTIVE nunca expira localmente — acesso depende 100% de webhook do Asaas

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:556` · **Origem:** achado novo da auditoria

isSignatureValidForAccess retorna true para qualquer assinatura com status ACTIVE sem olhar expirationDate (só TRIAL tem a data checada, linhas 556-564). O único scheduler de expiração é o de trials (expireTrialSignatures.scheduler.ts); assinaturas pagas só viram INACTIVE via webhook SUBSCRIPTION_DELETED/CANCELLED ou cancelamento manual. Se o pagamento recorrente falhar e o webhook se perder (ou o evento de inadimplência não for tratado — o webhook só trata PAYMENT_RECEIVED/CONFIRMED e SUBSCRIPTION_*), a clínica mantém acesso indefinidamente após o fim do período pago.

**Evidência:**

```
private isSignatureValidForAccess(signature: CompanySignature): boolean {
  if (signature.status === 'ACTIVE') return true;  // ignora expirationDate
  if (signature.status === 'TRIAL') { ... return now <= expiration; }
  return false;
}
```

**Recomendação:** Checar expirationDate (com período de tolerância) também para ACTIVE, e/ou criar scheduler de expiração de assinaturas pagas vencidas; tratar eventos de inadimplência do Asaas (PAYMENT_OVERDUE).

**Arquivos relacionados:** `api:src/domain/application/services/signature/service/expireTrialSignatures.scheduler.ts`

### 7. [Alto] Trials podem ser encadeados infinitamente (novo trial após cada expiração)

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:575` · **Origem:** achado novo da auditoria

startTrial só bloqueia se a company tiver acesso válido AGORA (signatures.some(isSignatureValidForAccess), linhas 575-577). Como trial expirado não conta como acesso válido, uma clínica pode deixar o trial vencer e iniciar outro trial (do mesmo plano ou de outro plano com trialDays > 0) repetidamente, usando o sistema de graça para sempre. Não há verificação de 'já usou trial antes' por company nem por plano.

**Evidência:**

```
const signatures = await this.companySignatureRepository.fetchByCompanyId(companyId);
const hasValidAccess = signatures.some((sig) => this.isSignatureValidForAccess(sig));
if (hasValidAccess) return left(new NotAllowedError());
// nada impede novo TRIAL se já existiu um TRIAL expirado
```

**Recomendação:** Bloquear startTrial quando já existir qualquer assinatura anterior com status TRIAL (expirada ou não) para a company — ex.: signatures.some(s => s.status === 'TRIAL' || s.paymentId === 'trial').

**Arquivos relacionados:** `api:src/infra/http/controllers/signature/companySignature.controller.ts`

### 8. [Alto] Checkout de novo plano não considera assinatura ativa existente — dupla assinatura recorrente possível

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:154` · **Origem:** achado novo da auditoria

Os fluxos de pagamento pix(), newCreditCard() e existingCreditCard() criam uma assinatura recorrente no Asaas e uma nova CompanySignature sem verificar se a company já tem assinatura ACTIVE de outro plano — o único reaproveitamento é de TRIAL do MESMO plano (ex.: pix, linhas 154-189: find de status TRIAL && signaturePlanId === planId). O middleware do web permite navegar para /plans e /checkout mesmo logado com assinatura ativa (middleware.ts:22-24, 49). Uma clínica que pagar um segundo plano pelo checkout fica com duas recorrências ativas no Asaas cobrando em paralelo, e qual plano vale para o limite depende da ordem não-determinística de fetchByCompanyId.

**Evidência:**

```
const existingSignatures = await this.companySignatureRepository.fetchByCompanyId(companyId);
const existingTrial = existingSignatures.find(
  (s) => s.status === 'TRIAL' && s.signaturePlanId === planId
);
// só reaproveita TRIAL do mesmo plano; ACTIVE de outro plano é ignorada e uma 2ª subscription é criada
```

**Recomendação:** Nos três fluxos de pagamento, se existir assinatura ACTIVE, bloquear (direcionando para o fluxo de upgrade) ou tratar como upgrade/downgrade explícito com cancelamento pós-pagamento da anterior.

**Arquivos relacionados:** `web:middleware.ts` · `web:app/(auth)/checkout/[id]/page.tsx` · `api:src/infra/shared/database/prisma/repositories/prismaCompanySignature.repository.ts`

### 9. [Alto] Upgrade com cartão ativa o novo plano antes da confirmação da cobrança e cancela o antigo sem garantia de pagamento

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:792` · **Origem:** achado novo da auditoria

processUpgradeWithCreditCard cancela a assinatura Asaas antiga (linhas 792-800) e marca a antiga como INACTIVE (826-828) igual ao fluxo PIX, mas cria a nova já como ACTIVE (831-848) apenas por a subscription ter sido criada no Asaas — sem aguardar a confirmação da cobrança no cartão. Se a cobrança for recusada depois, a clínica fica com o plano novo ativo sem ter pago (inverso do bug do PIX). O 'continua mesmo se falhar o cancelamento' (comentário na linha 798) também pode deixar a recorrência antiga viva no Asaas junto da nova.

**Evidência:**

```
// 6. Cancelar assinatura antiga no Asaas (se existir)
if (activeSignature.asaasSubscriptionId) { const cancelResult = await this.subscription.cancelSubscription(...); ... }
...
const newSignature = CompanySignature.create({ ... status: 'ACTIVE', ... }); // antes da confirmação da cobrança
```

**Recomendação:** Criar a nova assinatura PENDING/INACTIVE e ativá-la (cancelando a antiga) apenas no webhook PAYMENT_CONFIRMED; tratar falha de cancelamento no Asaas com retry/alerta.

**Arquivos relacionados:** `api:src/infra/http/controllers/signature/companySignature.controller.ts`

### 10. [Alto] Excluir plano com assinaturas vinculadas gera erro 500 (FK sem onDelete)

**Local:** `api:src/domain/application/services/signature/service/signaturePlan.service.ts:93` · **Origem:** achado novo da auditoria

DELETE /admin/plans/:id chama signaturePlanRepository.delete → prisma.signaturePlan.delete direto (prismaSignaturePlan.repository.ts:53-59), sem verificar se existem CompanySignature apontando para o plano. A relação signaturePlan em CompanySignature (schema.prisma:274) não define onDelete, então o default Restrict faz o Prisma lançar P2003, que cai no default do ErrorHandler como InternalServerErrorException (500). O ADM até avisa 'Assinaturas ativas podem ser afetadas' (plans/page.tsx:55) mas o admin recebe um erro genérico. Se a FK fosse cascade, seria pior: assinaturas órfãs.

**Evidência:**

```
async delete({ id }: DeleteSignaturePlanRequest) {
  const signaturePlan = await this.signaturePlanRepository.findById(id);
  if (!signaturePlan) return left(new ResourceNotFoundError());
  await this.signaturePlanRepository.delete(id); // sem checar CompanySignature vinculadas → P2003 → 500
```

**Recomendação:** Antes de deletar, contar assinaturas vinculadas e retornar erro de negócio amigável ('plano em uso — desative em vez de excluir'); preferir soft-delete via isActive.

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/repositories/prismaSignaturePlan.repository.ts` · `api:prisma/schema.prisma` · `adm:src/app/(private)/plans/page.tsx`

### 11. [Médio] ADM cria e move usuários entre companies sem validar limite do plano

**Local:** `api:src/domain/application/services/admin/services/adminUserManagement.service.ts:33` · **Origem:** achado novo da auditoria

Os outros dois caminhos de adição de usuário a uma company estão no painel ADM: POST /admin/users (UserCreateModal) chama AdminUserManagementService.create, que valida apenas company existente e e-mail duplicado; e PATCH /admin/users/:id permite trocar o companyId de um usuário (linhas 62-66), movendo-o para uma company possivelmente lotada. Nenhum dos dois consulta a assinatura/userQuantity. Mesmo sendo ação administrativa, é o mesmo furo de regra de negócio e pode deixar companies acima do limite silenciosamente.

**Evidência:**

```
async create(input: CreateAdminUserInput) {
  const company = await this.companyRepository.findById(input.companyId);
  if (!company) return left(new ResourceNotFoundError());
  const existingByEmail = await this.userRepository.findByEmail(input.email);
  if (existingByEmail) return left(new ResourceAlreadyExistsError());
  ...
  await this.userRepository.create(user);  // sem checagem de limite
```

**Recomendação:** Reusar a mesma validação de limite nos dois métodos (create e update-com-companyId), possivelmente com um bypass explícito e logado para admins (ex.: flag force).

**Arquivos relacionados:** `api:src/infra/http/controllers/admin/adminUser.controller.ts` · `adm:src/app/(private)/users/_components/UserCreateModal.tsx` · `adm:src/app/(private)/users/_components/UserDetailModal.tsx`

### 12. [Médio] Mensagem 'Company user limit exceeded' nasce em inglês na API e é exibida crua no frontend

**Local:** `api:src/core/errors/errors/companyUserLimitExceededError.ts:5` · **Origem:** achado novo da auditoria

CompanyUserLimitExceededError tem a mensagem hardcoded em inglês ('Company user limit exceeded', linha 5) e o ErrorHandler a repassa como ForbiddenException(error.message) (error.handler.ts:34-35). No web, a página de registro exibe data.message diretamente (register/page.tsx:111-114: setError(data.message ?? 'Erro ao criar conta.')), então o veterinário que tenta entrar numa clínica lotada via código de convite vê a mensagem em inglês. Nenhum dos frontends (web/app) traduz essa string — grep não encontrou tratamento em nenhum deles.

**Evidência:**

```
export class CompanyUserLimitExceededError extends Error implements ServiceError {
  constructor() {
    super('Company user limit exceeded');
  }
}
// web register/page.tsx: setError((data as { message?: string }).message ?? 'Erro ao criar conta.')
```

**Recomendação:** Trocar a mensagem da API para português (padrão das demais mensagens de negócio, ex.: cupom) ou mapear o erro no frontend para mensagem amigável ('Esta clínica atingiu o limite de usuários do plano').

**Arquivos relacionados:** `web:app/(auth)/register/page.tsx` · `api:src/infra/shared/handler/error.handler.ts`

### 13. [Médio] Endpoint GET /user/limit-info existe mas nunca é usado — tela da clínica não mostra nem antecipa o limite

**Local:** `web:services/clinicService.ts:82` · **Origem:** achado novo da auditoria

A API expõe GET /user/limit-info (user.controller.ts:204-211) e o web tem clinicService.getUserLimitInfo (clinicService.ts:82-87), mas nenhum componente chama esse método — a tela clinic não exibe 'X de Y usuários' nem desabilita o botão de adicionar quando o limite é atingido. Detalhes adicionais: o service retorna maxUsers = -1 para plano ilimitado (User.service.ts:450, 'signaturePlan.userQuantity ?? -1') e também planName/hasActiveSignature, mas o tipo UserLimitInfo do web só declara currentUsers/maxUsers e não trata o -1. Combinado com o POST /user sem validação, o usuário não tem nenhum feedback de limite no caminho manual.

**Evidência:**

```
async getUserLimitInfo(api: Pick<ApiContextProps, 'GetAPI'>): Promise<UserLimitInfo> {
  const res = await api.GetAPI<UserLimitInfo>('/user/limit-info');
  return res;
}
// grep em app/ e components/: nenhuma chamada a getUserLimitInfo/limit-info
```

**Recomendação:** Consumir limit-info na CollaboratorsTable (badge 'X de Y usuários' e botão desabilitado no limite) e padronizar a semântica de ilimitado (null em vez de -1) entre API e front.

**Arquivos relacionados:** `api:src/domain/application/services/account/services/User.service.ts` · `api:src/infra/http/controllers/account/user.controller.ts` · `web:app/(dashboard)/clinic/_components/CollaboratorsTable.tsx`

### 14. [Médio] 'Upgrade' definido apenas por userQuantity: plano ilimitado nunca faz upgrade e preço é ignorado

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:676` · **Origem:** achado novo da auditoria

calculateUpgrade e os dois processUpgrade validam upgrade exclusivamente comparando userQuantity: 'if (currentLimit === null || (newLimit !== null && newLimit <= currentLimit)) return left(new NotAllowedError())' (linhas 676-680, 763-767, 884-888). Consequências: (1) empresa em plano com usuários ilimitados (userQuantity null — caso do plano seedado 'Equinology') é bloqueada de qualquer upgrade, mesmo para um plano mais caro com mais recursos; (2) um plano com mais usuários mas mais barato passa como 'upgrade', permitindo trocar para plano inferior em preço com crédito proporcional. O web replica a mesma regra no filtro de opções (subscription/page.tsx:92-101). Como planos hoje só se diferenciam por userQuantity isso é coerente, mas quebra assim que existir outro diferencial.

**Evidência:**

```
const currentLimit = currentPlan.userQuantity;
const newLimit = newPlan.userQuantity;
if (currentLimit === null || (newLimit !== null && newLimit <= currentLimit)) {
  return left(new NotAllowedError());
}
```

**Recomendação:** Definir upgrade por preço do ciclo (ou por hierarquia explícita de planos) em vez de userQuantity, e permitir upgrade a partir de planos ilimitados quando houver plano superior em preço.

**Arquivos relacionados:** `web:app/(dashboard)/subscription/page.tsx`

### 15. [Baixo] Único limite de plano existente é userQuantity — nenhum outro recurso (animais, atendimentos, estoque) é limitado

**Local:** `api:prisma/schema.prisma:240` · **Origem:** achado novo da auditoria

Varredura por outros limites da mesma classe: o modelo SignaturePlan tem somente userQuantity como limite (schema.prisma:240-254 — os demais campos são preço/desconto/trial); o único match de 'animalQuantity' no schema é do model Lead (formulário de marketing, linha 1533), não de plano. Nenhum service de animal, appointment, stock ou client consulta plano/assinatura antes de criar registros. Ou seja, não existem outros limites com o mesmo furo porque não existem outros limites — todos os planos diferem apenas em quantidade de usuários. Registrado como achado informativo para a decisão de produto: se a intenção comercial era limitar animais/atendimentos por plano, isso não está implementado em lugar nenhum.

**Evidência:**

```
model SignaturePlan {
  id              String   @id @default(uuid()) @db.Uuid
  name            String
  description     String?
  userQuantity    Int?
  creditCardPrice Float
  pixPrice        Float
  isActive        Boolean
  yearlyDiscount  Float   @default(0)
  trialDays       Int     @default(0)
  ...
}
```

**Recomendação:** Se houver intenção de limitar outros recursos por plano, modelar os limites no SignaturePlan e centralizar a verificação num guard/service único (evitando repetir o padrão atual de checagem espalhada que gerou os furos de usuário).

**Arquivos relacionados:** `api:src/domain/application/services/animal` · `api:src/domain/application/services/appointment`

---

## Checkout, Asaas e webhook

> A integração Asaas vive em api:src/infra/shared/bank/asaas.ts e o ÚNICO webhook do sistema é POST /signature/webhook (companySignature.controller.ts), autenticado pelo header asaas-access-token comparado com ASAAS_WEBHOOK_TOKEN — ele trata apenas assinaturas SaaS (PAYMENT_RECEIVED/PAYMENT_CONFIRMED/SUBSCRIPTION_*); pagamentos de faturas e movimentações feitos pelo app do proprietário (PIX com split 100% para company.walletId) NUNCA são confirmados, pois não existe webhook nem polling que consulte bankPaymentId. O checkout web gera o PIX e fica estático (sem polling de /signature/validation), e a ativação da assinatura depende 100% do webhook — sem ele configurado o cliente paga e nunca ganha acesso, e renovações de cartão expiram mesmo com o Asaas cobrando. O 500 do modal "Pagar parcelas" NÃO é wallet id: é o PUT /transaction/:id recebendo paymentDate "yyyy-MM-dd" (string passa cru pelo class-validator e quebra no Prisma, que exige ISO-8601 DateTime). O botão Voltar de /plans "não funciona" porque manda para "/" e o middleware devolve para /plans quando não há assinatura ativa. Achados extras graves: gerar PIX em cima de um trial ativa a assinatura sem pagamento, e o upgrade via PIX desativa a assinatura atual antes da confirmação, trancando o cliente para fora do sistema.

### 1. [Crítico] Checkout PIX fica estático: nenhum polling/confirmação após o pagamento

**Local:** `web:app/(auth)/checkout/[id]/page.tsx:314` · **Origem:** reportado nos testes manuais

Após POST /signature/pix/:planId a tela só mostra o QR Code e a mensagem estática 'A assinatura será ativada após a confirmação do pagamento' (linha 314-316). Não há polling de GET /signature/validation ou GET /signature/current (ambos existem na API), não há botão 'já paguei', nem redirect automático. A assinatura é criada com status INACTIVE (companySignature.service.ts linha 180) e só vira ACTIVE quando o webhook chega. O usuário paga, a tela não muda, e ele não sabe se deu certo; se recarregar, o middleware o devolve para /plans até o webhook processar. A mesma ausência de polling existe no upgrade PIX em app/(dashboard)/subscription/page.tsx (handleUpgradePix, linhas 132-152) e no app mobile (InvoicePaymentSheet.tsx, handleGeneratePixQr linhas 182-289 — gera QR e nada monitora o status).

**Evidência:**

```
setPixResult({ encodedImage: enc, payload: pay });
setSuccess("PIX gerado. Escaneie o QR Code ou copie o código para pagar no app do seu banco. A assinatura será ativada após a confirmação do pagamento.");  // fim do fluxo — nenhum setInterval/polling no arquivo
```

**Recomendação:** Após exibir o QR, iniciar polling (ex.: a cada 5s por até 10min) em GET /signature/validation ou GET /signature/current; quando ativar, mostrar sucesso e redirecionar para '/'. Adicionar botão manual 'Já paguei — verificar'. Replicar no upgrade PIX (/subscription) e no app mobile (re-fetch da fatura após gerar QR).

**Arquivos relacionados:** `api:src/domain/application/services/signature/service/companySignature.service.ts` · `web:app/(dashboard)/subscription/page.tsx` · `app:components/sheets/InvoicePaymentSheet.tsx` · `api:src/infra/http/controllers/signature/companySignature.controller.ts`

### 2. [Crítico] Webhook Asaas: endpoint, token e passo a passo de configuração (entrega solicitada)

**Local:** `api:src/infra/http/controllers/signature/companySignature.controller.ts:115` · **Origem:** reportado nos testes manuais

O único endpoint de webhook da API é POST {URL_DA_API}/signature/webhook (companySignature.controller.ts linhas 115-142). É público (@IsPublic), responde HTTP 200 e exige o header 'asaas-access-token' igual à env ASAAS_WEBHOOK_TOKEN (env.ts linha 27 — obrigatória, a API nem sobe sem ela); token errado retorna 401 e o Asaas INTERROMPE a fila de sincronização do webhook até reativação manual. Eventos tratados no service (signatureValidation, linhas 416-505): PAYMENT_RECEIVED, PAYMENT_CONFIRMED e SUBSCRIPTION_PAYMENT_RECEIVED ativam/renovam assinatura (busca por subscriptionId via body.payment.subscription ou body.subscription.id, fallback por paymentId); SUBSCRIPTION_CREATED ativa; SUBSCRIPTION_DELETED/SUBSCRIPTION_CANCELLED desativam. PASSO A PASSO no painel Asaas: (1) Login em asaas.com (produção) ou sandbox.asaas.com com a conta dona da ASAAS_KEY; (2) Menu Configurações da conta > Integrações > Webhooks (ou https://www.asaas.com/customerConfigIntegrations/index); (3) 'Adicionar webhook' do tipo Cobranças; (4) URL: https://SEU_HOST_DA_API/signature/webhook; (5) E-mail para notificação de falhas: e-mail do time; (6) Versão da API: v3; (7) Token de autenticação: exatamente o valor de ASAAS_WEBHOOK_TOKEN do .env da API (o Asaas o envia no header asaas-access-token); (8) Tipo de envio: Sequencial (fila); (9) Marcar no mínimo os eventos PAYMENT_RECEIVED e PAYMENT_CONFIRMED (os SUBSCRIPTION_* tratados no código não constam como eventos padrão do webhook de cobranças do Asaas — a renovação já é coberta pelos PAYMENT_*); (10) Salvar, pagar um PIX de teste e conferir na aba de logs do webhook se retornou 200; se acumular falhas, o Asaas pausa a fila e é preciso reativá-la manualmente na mesma tela. PONTOS QUE DEPENDEM 100% DO WEBHOOK (falham se não configurado): ativação de assinatura PIX do checkout (fica INACTIVE para sempre), ativação pós-upgrade PIX, extensão de expirationDate nas renovações de cartão (linhas 460-471 — sem webhook o Asaas continua cobrando mas o sistema expira o acesso) e desativação quando a assinatura é cancelada no Asaas.

**Evidência:**

```
@Post('webhook')
@IsPublic()
@HttpCode(200)
... if (accessToken !== this.envService.get('ASAAS_WEBHOOK_TOKEN')) { throw new UnauthorizedException('Invalid webhook token'); }
```

**Recomendação:** Configurar o webhook conforme o passo a passo acima e criar um health-check/log dos eventos recebidos. Adicionalmente, criar fallback de conciliação ativa (job que consulta GET /payments/:id no Asaas via getPaymentInfo já existente em asaas.ts linha 444) para não depender só do webhook.

**Arquivos relacionados:** `api:src/domain/application/services/signature/service/companySignature.service.ts` · `api:src/infra/shared/env/env.ts` · `api:.env.example` · `api:src/infra/shared/bank/asaas.ts`

### 3. [Crítico] Pagamentos de faturas/movimentações via PIX no app nunca são confirmados (webhook não cobre Invoice/Transaction)

**Local:** `api:src/infra/http/controllers/signature/companySignature.controller.ts:134` · **Origem:** achado novo da auditoria

Quando o proprietário paga uma fatura via app (POST /invoice/:id/pay/pix) ou uma movimentação (POST /transaction/pix/:id), a API cria a cobrança PIX no Asaas com split 100% para company.walletId e grava invoice.bankPaymentId (invoice.service.ts linha 365). Porém o único webhook do sistema (POST /signature/webhook) só consulta CompanySignature — não existe NENHUM código que busque Invoice ou Transaction por bankPaymentId (grep por findByBankPaymentId retorna vazio em toda a API). Resultado: o cliente paga o PIX, o dinheiro cai na wallet do veterinário, mas a fatura fica PENDING para sempre e a Movimentação nunca vira PAID — o vet precisa marcar manualmente. Só os fluxos de cartão marcam PAID na hora (porque a captura é síncrona, invoice.service.ts linhas 412-414 e 476-478). Agrava: o app não faz polling após gerar o QR (InvoicePaymentSheet.tsx).

**Evidência:**

```
const result = await this.companySignatureService.signatureValidation({ paymentId: ... }); // webhook só chama signatureValidation; invoice.service.ts:365 'invoice.bankPaymentId = payment.value.paymentId' é gravado mas nunca lido de volta em nenhum webhook/job
```

**Recomendação:** No handler do webhook, após tratar assinatura, buscar também Invoice (findByBankPaymentId) e Transaction pelo payment.id do evento PAYMENT_RECEIVED/CONFIRMED e marcar como paga (reutilizando ensureInvoicePaymentExists do invoice.service). Exigirá criar o método de busca por bankPaymentId nos repositórios.

**Arquivos relacionados:** `api:src/domain/application/services/invoice/invoice.service.ts` · `api:src/domain/application/services/finance/services/transaction.service.ts` · `app:components/sheets/InvoicePaymentSheet.tsx` · `api:prisma/schema.prisma`

### 4. [Crítico] Modal 'Pagar parcelas' (financeiro web) dá Internal server error — causa é data 'yyyy-MM-dd' no PUT /transaction, NÃO wallet id

**Local:** `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx:91` · **Origem:** reportado nos testes manuais

O modal envia PUT /transaction/:id com paymentDate no formato 'yyyy-MM-dd' (PayTransactionSheet.tsx linhas 90-95, valor vem de new Date().toISOString().slice(0,10)). No backend, EditTransactionDto.paymentDate usa @IsDateString mas o ValidationPipe global tem apenas transform:true sem enableImplicitConversion (main.ts linhas 11-15), então o valor chega como STRING no service; transaction.service.edit (linha 87) atribui a string direto na entidade e o PrismaTransactionMapper repassa cru para prisma.transaction.update (prismaTransaction.repository.ts linhas 28-32). O Prisma exige ISO-8601 DateTime completo para campos DateTime — 'yyyy-MM-dd' lança PrismaClientValidationError, exceção não tratada vira 500 {message:'Internal server error'}, que o front repassa cru no toast (ApiContext.tsx linhas 89-91). O fluxo de CRIAÇÃO funciona porque payment.service converte com moment(firstDueDate).toDate() (payment.service.ts linha 57) — só o edit passa a string crua. Wallet id não participa desse endpoint (é o registro manual de pagamento do vet, sem Asaas).

**Evidência:**

```
await PutAPI(`/transaction/${id}`, { status: "PAID", paymentDate: dateStr, bankAccountId });  // dateStr = new Date().toISOString().slice(0, 10) → "2026-07-30"
```

**Recomendação:** No service edit (ou no DTO com @Transform/@Type(() => Date)), converter paymentDate/dueDate para Date antes do save (ex.: new Date(paymentDate) ou moment(...).toDate()), como já é feito na criação. Alternativa no front: enviar ISO completo (new Date().toISOString()).

**Arquivos relacionados:** `api:src/infra/http/controllers/finance/dto/transaction.dto.ts` · `api:src/domain/application/services/finance/services/transaction.service.ts` · `api:src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts` · `api:src/infra/main.ts` · `web:context/ApiContext.tsx`

### 5. [Crítico] Gerar PIX em cima de um TRIAL ativa a assinatura imediatamente, sem pagamento

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:159` · **Origem:** achado novo da auditoria

No fluxo PIX do checkout, se a empresa tem uma assinatura TRIAL do mesmo plano, o service marca existingTrial.status = 'ACTIVE' e estende a expiração por 1 mês/ano NO MOMENTO DA GERAÇÃO DO QR CODE (companySignature.service.ts linhas 159-169), antes de qualquer confirmação do Asaas. Ou seja: usuário em trial abre o checkout, clica 'Gerar PIX', fecha a tela sem pagar e ganha um período inteiro de acesso gratuito. O fluxo sem trial faz o correto (cria com status 'INACTIVE' na linha 180 e espera o webhook). O mesmo padrão nos fluxos de cartão (linhas 267-279 e 367-378) é aceitável porque a captura do cartão é síncrona, mas no PIX é um buraco de receita.

**Evidência:**

```
if (existingTrial) {
  existingTrial.status = 'ACTIVE';
  existingTrial.expirationDate = moment().add(1, yearly ? 'year' : 'month').toDate();
  ... await this.companySignatureRepository.save(existingTrial);
} else {
  const companySignature = CompanySignature.create({ ..., status: 'INACTIVE', ... });
```

**Recomendação:** No branch existingTrial do fluxo PIX, manter status 'TRIAL' (ou 'INACTIVE') e deixar o webhook PAYMENT_RECEIVED/CONFIRMED promover para ACTIVE — o signatureValidation já ativa PIX INACTIVE; hoje ele ignora o caso por o status já estar ACTIVE.

**Arquivos relacionados:** `api:src/infra/http/controllers/signature/companySignature.controller.ts`

### 6. [Alto] Botão VOLTAR da tela /plans não funciona: middleware devolve para /plans quem não tem assinatura ativa

**Local:** `web:app/(auth)/plans/page.tsx:102` · **Origem:** reportado nos testes manuais

O botão chama handleBack = router.push('/') (plans/page.tsx linhas 102-104, botão nas linhas 132-139). A rota '/' está no matcher do middleware, que para qualquer rota fora de /plans|/checkout chama GET /signature/validation e, se a resposta não for ok (usuário sem assinatura ativa — exatamente o público típico da tela de planos), redireciona de volta para /plans (middleware.ts linhas 49-55). Resultado: o clique dispara navegação, o middleware devolve para a própria página e o botão parece morto. Para usuários COM assinatura ativa o botão funciona, o que explica a intermitência. O botão 'Sair' ao lado funciona porque /login é rota pública.

**Evidência:**

```
const handleBack = () => { router.push("/"); };  // middleware.ts:53-55: if (!validationRes.ok) { return NextResponse.redirect(new URL("/plans", request.url)); }
```

**Recomendação:** Decidir o destino do Voltar conforme o estado: se GET /signature/validation falhar, esconder o botão ou levá-lo para /login / página institucional; se ok, manter '/'. Alternativa simples: usar router.back() com fallback, ou consultar a validação no mount da página de planos para renderizar o botão só quando houver acesso.

**Arquivos relacionados:** `web:middleware.ts`

### 7. [Alto] Upgrade via PIX desativa a assinatura atual ANTES da confirmação do pagamento — cliente fica trancado fora do sistema

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:959` · **Origem:** achado novo da auditoria

processUpgradeWithPix cancela a assinatura antiga no Asaas, marca a atual como INACTIVE (linha 959) e cria a nova também INACTIVE (linhas 963-979), tudo no momento em que o QR é gerado. Se o usuário não pagar na hora (ou se o webhook não estiver configurado), a empresa perde o acesso imediatamente: o middleware do web passa a redirecionar tudo para /plans, mesmo com o período anterior já pago. Combinado com a ausência de polling na tela /subscription (linhas 132-152 do page.tsx), o usuário gera o PIX, a tela não confirma nada e no próximo clique ele está bloqueado.

**Evidência:**

```
// 9. Marcar assinatura antiga como INACTIVE
activeSignature.status = 'INACTIVE';
await this.companySignatureRepository.save(activeSignature);
// 10. Criar nova assinatura (INACTIVE até pagar o PIX)
const newSignature = CompanySignature.create({ ..., status: 'INACTIVE', ...});
```

**Recomendação:** Só desativar a assinatura antiga quando o webhook confirmar o pagamento da nova (guardar referência 'pendingUpgrade'), ou pelo menos manter a antiga ACTIVE até expirar. Cancelar a subscription antiga no Asaas pode continuar imediato para evitar cobrança dupla.

**Arquivos relacionados:** `web:app/(dashboard)/subscription/page.tsx` · `web:middleware.ts`

### 8. [Alto] Wallet ID: mapeamento completo de onde é exigida e comportamento quando vazia (410 enganoso nos fluxos de cartão)

**Local:** `api:src/domain/application/services/finance/services/transaction.service.ts:270` · **Origem:** reportado nos testes manuais

walletId é o UUID da carteira Asaas da CLÍNICA (Company.walletId, schema.prisma linha 168) usado como split de 100% em TODOS os pagamentos cliente→vet: transaction.service.ts pix (linhas 216-221), existingCreditCard (299-304), newCreditCard (359-364) e invoice.service.ts payPix (linha 360), payExistingCreditCard (407), payNewCreditCard (461). Onde é cadastrada: painel ADM (companies CompanyCreateModal/CompanyDetailModal, campo walletId) via POST/PUT /admin/companies (adminCompany.controller.ts linhas 38 e 58) e pelo próprio vet no web em /clinic (WalletCard.tsx, PUT /company com validação de UUID). O app mobile NUNCA manipula walletId — ele só consome a flag derivada 'payable' (clientInvoice.presenter.ts linha 25: payable = isPending && hasWallet; PrismaPaymentDetailsMapper.ts linha 44: payable = !!company.walletId) e, quando false, esconde a UI de pagamento com a mensagem 'O pagamento ainda não está disponível' (InvoicePaymentSheet.tsx linhas 512-519). Quando walletId está vazia: os fluxos PIX retornam 400 com mensagem clara ('A empresa ainda não possui PIX configurado...', transaction.service.ts linhas 186-193 e invoice.service.ts 343-348); MAS os 4 fluxos de cartão tratam walletId vazia como ResourceNotFoundError (transaction.service.ts linhas 270-281 e 331-341; invoice.service.ts 389-390 e 442-443), que o ErrorHandler converte em 410 Gone sem mensagem — o app mostra 'Transação não encontrada ou a empresa ainda não tem PIX configurado' (texto genérico, InvoicePaymentSheet.tsx linha 258). Não gera 500 (o 500 do modal de parcelas tem outra causa — ver achado próprio); porém se a walletId for um UUID que não existe no Asaas, o split é recusado pelo Asaas e a mensagem de erro em inglês do gateway é repassada crua ao app (asaas.ts linha 206 → PaymentError).

**Evidência:**

```
if (!transaction || !client || !creditCard || !company || !company.walletId) { ... return left(new ResourceNotFoundError()); }  // error.handler.ts:22-23 → GoneException (410) sem mensagem específica
```

**Recomendação:** Nos fluxos de cartão, separar o caso !company.walletId em um PaymentError com a mesma mensagem amigável do fluxo PIX. Para 'testar wallet id no app': cadastrar um UUID de wallet válido da conta Asaas (Asaas > Configurações > Informações da conta > Wallet ID) em /clinic ou no ADM, e validar que faturas PENDING aparecem com payable=true no app.

**Arquivos relacionados:** `api:src/domain/application/services/invoice/invoice.service.ts` · `api:src/infra/http/presenters/clientInvoice.presenter.ts` · `api:src/infra/shared/database/prisma/mappers/PrismaPaymentDetailsMapper.ts` · `web:app/(dashboard)/clinic/_components/WalletCard.tsx` · `adm:src/app/(private)/companies/_components/CompanyDetailModal.tsx` · `app:components/sheets/InvoicePaymentSheet.tsx` · `api:src/infra/shared/handler/error.handler.ts`

### 9. [Médio] Transaction.bankPaymentId nunca é persistido: save antes da atribuição + mapper omite o campo

**Local:** `api:src/domain/application/services/finance/services/transaction.service.ts:241` · **Origem:** achado novo da auditoria

Dois defeitos empilhados impedem a conciliação de movimentações pagas via app: (1) em transaction.service.ts o fluxo PIX chama transactionRepository.save(transaction) na linha 241 e SÓ DEPOIS atribui transaction.bankPaymentId na linha 242 — ordem invertida; (2) mesmo nos fluxos de cartão (linhas 309 e 380), onde a ordem está certa, o PrismaTransactionMapper.toPrisma (linhas 23-37) não inclui bankPaymentId, e o toDomain (linhas 5-21) também não lê — a coluna bankPaymentId existe no schema (schema.prisma linha 549) mas fica sempre NULL. Sem esse vínculo, mesmo que o webhook passe a cobrir transações (achado anterior), será impossível localizar a Transaction pelo payment.id do Asaas.

**Evidência:**

```
await this.transactionRepository.save(transaction);
transaction.bankPaymentId = payment.value.paymentId;  // atribuído DEPOIS do save; e PrismaTransactionMapper.toPrisma não mapeia bankPaymentId
```

**Recomendação:** Inverter a ordem (atribuir antes do save) e adicionar bankPaymentId no toPrisma/toDomain do PrismaTransactionMapper.

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/mappers/prismaTransactionMapper.ts` · `api:prisma/schema.prisma`

### 10. [Médio] Cliente Asaas acessa response.data.errors[0] sem guard em vários métodos — erro de gateway vira 500 genérico e mensagens em inglês vazam para o front

**Local:** `api:src/infra/shared/bank/asaas.ts:206` · **Origem:** achado novo da auditoria

Em asaas.ts, os métodos mais antigos (createPaymentId linha 99, newCreditCartPayment 148, existsCreditCartPayment 186, pixPayment 206 e 214, cancelInvoice 230, refound 240) fazem 'connect.data.errors[0].description' sem optional chaining nem try/catch. Se o Asaas responder algo fora do formato {errors:[...]} (ex.: 401 por ASAAS_KEY inválida, 429, HTML de proxy), isso lança TypeError não tratado → 500 'Internal server error'. Os métodos novos (createSubscription etc.) já usam errors?.[0]?. e try/catch com fallback em português. Além disso, quando o Asaas devolve erro estruturado, a description em inglês/técnica do gateway é repassada crua ao usuário final: PaymentError → BadRequest (error.handler.ts linha 28-29) → web exibe message no toast (ApiContext.tsx linhas 89-91) e o app idem (InvoicePaymentSheet.tsx linha 253-259). createInvoice (linhas 246-278) nem checa status: assume connect.data.id e loga com console.log.

**Evidência:**

```
if (payment.status !== 200) {
  return left(new PaymentError(payment.data.errors[0].description));
}
```

**Recomendação:** Padronizar todos os métodos com o padrão dos novos: try/catch + errors?.[0]?.description + mensagem fallback em português. Mapear/traduzir mensagens do Asaas antes de repassar ao front.

**Arquivos relacionados:** `api:src/infra/shared/handler/error.handler.ts` · `web:context/ApiContext.tsx` · `app:components/sheets/InvoicePaymentSheet.tsx`

### 11. [Médio] Webhook trata eventos SUBSCRIPTION_CREATED/DELETED/CANCELLED e SUBSCRIPTION_PAYMENT_RECEIVED que não constam como eventos do webhook de cobranças do Asaas

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:480` · **Origem:** achado novo da auditoria

signatureValidation (companySignature.service.ts linhas 416-505) tem branches para 'SUBSCRIPTION_PAYMENT_RECEIVED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_DELETED' e 'SUBSCRIPTION_CANCELLED'. No webhook de cobranças do Asaas (v3), os eventos enviados são da família PAYMENT_* (PAYMENT_CREATED, PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED etc.) — cobranças de assinatura chegam como PAYMENT_* com o campo payment.subscription preenchido (que o controller já usa, linhas 130-133). Os branches SUBSCRIPTION_* provavelmente nunca executam (dead code), e o cancelamento de assinatura feito direto no painel do Asaas não desativará a assinatura no sistema por esse caminho. Recomendo validar na documentação/logs do Asaas na hora de configurar o webhook (por isso severidade média e não alta).

**Evidência:**

```
if (status === 'SUBSCRIPTION_CREATED') { ... }
if (status === 'SUBSCRIPTION_DELETED' || status === 'SUBSCRIPTION_CANCELLED') { ... }
```

**Recomendação:** Ao configurar o webhook, conferir na tela de eventos do Asaas quais nomes realmente existem; se SUBSCRIPTION_* não existir, tratar cancelamento via evento PAYMENT_DELETED/PAYMENT_OVERDUE ou via job de conciliação usando getSubscriptionPayments/status da subscription.

**Arquivos relacionados:** `api:src/infra/http/controllers/signature/companySignature.controller.ts`

### 12. [Médio] Renovação por cartão depende exclusivamente do webhook para estender o acesso — sem webhook, cliente pagante é bloqueado

**Local:** `api:src/domain/application/services/signature/service/companySignature.service.ts:460` · **Origem:** achado novo da auditoria

Assinaturas de cartão são criadas ACTIVE com expirationDate de +1 mês/ano (companySignature.service.ts linhas 380-395). A extensão nas renovações só acontece no webhook, no branch 'CREDIT_CARD && signature.paymentId !== paymentId' (linhas 460-471). Como a subscription recorrente vive no Asaas, sem webhook configurado o cartão do cliente continua sendo cobrado todo ciclo, mas expirationDate nunca é estendida: isSignatureValidForAccess considera ACTIVE válido sem checar expiração (linhas 556-564 — status ACTIVE passa), PORÉM o GetCurrentSignatureInfo/telas mostram data expirada e qualquer rotina que use expirationDate considera vencido. Nota: como isSignatureValidForAccess retorna true para status ACTIVE independente da data, o bloqueio efetivo hoje só ocorre se algo mudar o status; ainda assim a data de expiração exibida em /subscription fica errada e o modelo depende do webhook para se manter consistente. Este achado completa a lista de 'pontos que dependem do webhook' pedida na missão.

**Evidência:**

```
} else if (signature.paymentType === 'CREDIT_CARD' && signature.paymentId !== paymentId) {
  signature.expirationDate = moment().add(1, signature.yearly ? 'year' : 'month').toDate();
  signature.status = 'ACTIVE';
}
```

**Recomendação:** Além de configurar o webhook, criar job periódico de conciliação (getSubscriptionPayments por asaasSubscriptionId) para estender/expirar assinaturas mesmo com webhook fora do ar; e decidir se ACTIVE com expirationDate vencida deve ou não dar acesso (hoje dá, o que mascara o problema).

**Arquivos relacionados:** `api:src/infra/http/controllers/signature/companySignature.controller.ts` · `web:app/(dashboard)/subscription/page.tsx`

---

## Autenticação

> As telas de auth do web (login, register, recover-password, mail-code) e do app (login, signup, forgot-password) foram auditadas junto com o serviço de e-mail da API. Os 3 bugs reportados foram confirmados com causa raiz: (1) a capitalização forçada da senha no login web vem do componente Input que aplica capitalizeFirstChar quando o campo alterna para type="text" ao exibir a senha — existe correção local NÃO commitada; (2) o registro web realmente não tem olhinho na senha; (3) o "Internal server error" no recuperar senha nasce porque o provider SMTP relança o erro e os services de recovery (user e client) não tratam a falha, vazando 500 — o envio já é configurável por env (MAIL_DRIVER=log|smtp, SMTP_HOST/PORT/USER/KEY/FROM), então trocar de ZeptoMail não exige código. O pente fino achou problemas mais graves da mesma classe: o input de código de recuperação (web e app) capitaliza a primeira letra enquanto os códigos gerados são minúsculos e a busca no banco é case-sensitive, quebrando o fluxo mesmo com e-mail funcionando; o código da clínica no registro web sofre a mesma capitalização; e o endpoint client/password-code devolve o código de recuperação no corpo da resposta HTTP quando informado email+CPF, além de logá-lo em console. E-mails de boas-vindas, inatividade e fim de trial já estão protegidos com try/catch e não quebram pelo mesmo motivo; não existe fluxo de convite por e-mail (vínculo é por código de clínica).

### 1. [Crítico] Recuperar senha (web) retorna 500 Internal server error quando o SMTP (ZeptoMail) falha

**Local:** `api:src/domain/application/services/account/services/RecoverPasswordCode.service.ts:44` · **Origem:** reportado nos testes manuais

No fluxo POST /password-code, o service persiste o código e chama `await this.sendEmail.sendMail(...)` sem try/catch. O provider BrevoMailProvider (nodemailer genérico) captura o erro do SMTP, loga e RELANÇA (`throw error`). Como a falha não vira um `left()` do Either, ela estoura fora do ErrorHandler do controller e o NestJS devolve o 500 genérico "Internal server error" — exatamente o que o usuário vê quando o ZeptoMail está sem créditos. O código de recuperação fica gravado no banco mas o usuário nunca o recebe. Alternativas já são configuráveis por env sem tocar código: MAIL_DRIVER=log|smtp e SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_KEY/SMTP_FROM (api:src/infra/shared/env/env.ts linhas 6-17; comentário do brevo.ts diz que migrar para/do ZeptoMail é só trocar essas envs).

**Evidência:**

```
const { subject, html } = recoveryEmail(recoverPasswordCode.code);
await this.sendEmail.sendMail({ to: user.email, subject, html });  // sem try/catch

// brevo.ts:43-46
} catch (error) {
  this.logger.error(`Falha ao enviar e-mail para ${data.to}: ${error}`);
  throw error;
}
```

**Recomendação:** Envolver o sendMail em try/catch no service e retornar um erro de domínio traduzido (ex.: "Não foi possível enviar o e-mail agora, tente mais tarde") em vez de deixar vazar 500; ou tornar o envio assíncrono/não bloqueante com retry. Curto prazo operacional: apontar SMTP_HOST/PORT/USER/KEY/FROM para outro provedor (Brevo/Hostinger) ou MAIL_DRIVER=log em staging.

**Arquivos relacionados:** `api:src/infra/shared/email/brevo.ts` · `api:src/infra/shared/email/email.module.ts` · `api:src/infra/shared/env/env.ts` · `api:src/infra/http/controllers/account/recoverPasswordCode.controller.ts` · `web:app/(auth)/recover-password/page.tsx`

### 2. [Crítico] Mesmo 500 no recuperar senha do app mobile (fluxo client por e-mail)

**Local:** `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts:63` · **Origem:** achado novo da auditoria

O fluxo do app (forgot-password.tsx chama POST /client/password-code só com email) cai em RecoverClientPasswordCodeService.create, que também chama `await this.sendEmail.sendMail(...)` sem try/catch na linha 63. Com o ZeptoMail sem créditos, o tutor no app recebe "Internal server error" na tela "Recuperar senha". Observação: o fluxo "Primeiro Acesso" do app (email+CPF) NÃO depende de e-mail — o código é retornado direto na resposta — então só o "Esqueci minha senha" quebra.

**Evidência:**

```
const { subject, html } = recoveryEmail(recoverPasswordCode.code);
await this.sendEmail.sendMail({ to: client.email, subject, html });

return right(null);
```

**Recomendação:** Mesmo tratamento do achado anterior: capturar a falha de envio e devolver erro de domínio amigável em português.

**Arquivos relacionados:** `app:app/(auth)/forgot-password.tsx` · `api:src/infra/http/controllers/client/recoverClientPasswordCode.controller.ts` · `api:src/infra/shared/email/brevo.ts`

### 3. [Alto] Login (web): senha ganha primeira letra maiúscula ao usar o olhinho — correção existe mas NÃO está commitada/deployada

**Local:** `web:components/ui/input.tsx:34` · **Origem:** reportado nos testes manuais

O componente Input aplica `capitalizeFirstChar` a todo input cujo type não está em NO_CAPITALIZE_TYPES. No login, o campo de senha alterna `type={showPassword ? "text" : "password"}`; ao clicar no olhinho o type vira "text" e o handleChange passa a forçar a primeira letra maiúscula do que o usuário digita — a senha enviada fica errada e o login falha. Na working tree local já existe a correção (prop `noAutoCapitalize` no campo e atributo autoCapitalize no Input), mas `git status` mostra `app/(auth)/login/page.tsx` e `components/ui/input.tsx` como MODIFICADOS e não commitados — a versão em produção (commit 7a2c2e1) não tem o `noAutoCapitalize` no login (confirmado via git diff).

**Evidência:**

```
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (shouldCapitalize) {
    e.target.value = capitalizeFirstChar(e.target.value);
  }
  onChange?.(e);
};

// git diff (fix local não commitado):
+            noAutoCapitalize   // em app/(auth)/login/page.tsx
+          autoCapitalize={autoCapitalize ?? (shouldCapitalize ? undefined : "off")}
```

**Recomendação:** Commitar e deployar o fix local. Melhor ainda: no Input, nunca capitalizar quando o campo é um toggle de senha — ex.: tratar `autoComplete="current-password"/"new-password"` como isento, para o bug não voltar em novos formulários.

**Arquivos relacionados:** `web:app/(auth)/login/page.tsx` · `web:lib/utils.ts`

### 4. [Alto] Registro (web): campo de senha sem ícone de mostrar/ocultar

**Local:** `web:app/(auth)/register/page.tsx:182` · **Origem:** reportado nos testes manuais

O input de senha do registro é um `<Input type="password">` puro, sem rightIcon com Eye/EyeOff como existe no login (login/page.tsx linhas 120-135). O usuário não consegue conferir a senha que está criando. Falta também `autoComplete="new-password"` (gerenciadores de senha tratam como senha atual).

**Evidência:**

```
<Input
  id="password"
  type="password"
  value={payload.password}
  onChange={(e) =>
    setPayload((p) => ({ ...p, password: e.target.value }))
  }
  required
  minLength={6}
  placeholder="••••••••"
/>  // sem rightIcon / toggle
```

**Recomendação:** Replicar o padrão do login: estado showPassword + rightIcon Eye/EyeOff + `noAutoCapitalize` (obrigatório, senão o toggle reintroduz o bug de capitalização) + autoComplete="new-password".

**Arquivos relacionados:** `web:app/(auth)/login/page.tsx` · `web:components/ui/input.tsx`

### 5. [Alto] Recuperar senha (web): input "Código" capitaliza a primeira letra e invalida o código — fluxo quebra mesmo com e-mail funcionando

**Local:** `web:app/(auth)/recover-password/page.tsx:125` · **Origem:** achado novo da auditoria

O input do código (etapa 2) não tem `type`, então cai no default "text" e o Input aplica capitalizeFirstChar a cada digitação/colagem. Os códigos são gerados pela API só com minúsculas e dígitos (`lettersAndNumbers = 'abcdefghijklmnopqrstuvwxyz0123456789'`) e a busca é `findFirst({ where: { code } })` no Postgres (case-sensitive). Resultado: todo código que começa com letra (~72% deles) é transformado (ex.: "k3x9p2" vira "K3x9p2"), não é encontrado e o usuário recebe "Código inválido ou expirado" — ou o "Resource not found" cru da API. Ou seja, mesmo depois de resolver o ZeptoMail, a recuperação de senha web continuará falhando para a maioria dos usuários.

**Evidência:**

```
<Input
  id="code"
  value={code}
  onChange={(e) => setCode(e.target.value)}
  required
  placeholder="Código recebido por email"
/>  // sem type => capitalizeFirstChar aplica

// api:src/utils/generateRandomString.ts:1
export const lettersAndNumbers = 'abcdefghijklmnopqrstuvwxyz0123456789';
// api:prismaRecoverPasswordCode.repository.ts:19-20
const recoverPasswordCode = await this.prisma.recoverPasswordCode.findFirst({
  where: { code, createdAt: { gte: moment().subtract(1, 'hour').toDate() } },
```

**Recomendação:** Adicionar `noAutoCapitalize` (e autoCapitalize="off") ao input de código. Na API, defensivamente, normalizar o código para lowercase antes de gravar e de buscar (ou gerar códigos só numéricos).

**Arquivos relacionados:** `api:src/utils/generateRandomString.ts` · `api:src/infra/shared/database/prisma/repositories/prismaRecoverPasswordCode.repository.ts` · `web:components/ui/input.tsx`

### 6. [Alto] Registro (web): campo "Código da clínica" capitaliza a primeira letra e quebra o vínculo à clínica

**Local:** `web:app/(auth)/register/page.tsx:233` · **Origem:** achado novo da auditoria

Mesma classe do achado anterior: o input companyCode não tem `type`, então o Input força a primeira letra maiúscula. O código da clínica é um `crypto.randomUUID()` (minúsculo — api:src/domain/enterprise/entities/company.ts:144 `code: props.code ?? crypto.randomUUID()`) e o lookup é `findUnique({ where: { code } })`, case-sensitive. Todo UUID que começa com letra a-f (~37,5%) é corrompido na digitação/colagem e o registro "Vincular a clínica" falha com "Resource not found".

**Evidência:**

```
<Input
  id="companyCode"
  value={payload.companyCode ?? ""}
  onChange={(e) =>
    setPayload((p) => ({ ...p, companyCode: e.target.value }))
  }
  required={!payload.newCompany}
  placeholder="Código fornecido pela clínica"
/>

// api:prismaCompany.repository.ts:82-86
async findByCode(code: string): Promise<Company | null> {
  const company = await this.prisma.company.findUnique({ where: { code } });
```

**Recomendação:** Adicionar `noAutoCapitalize` ao input; na API, comparar código com normalização (trim + lowercase) ou gerar códigos curtos case-insensitive.

**Arquivos relacionados:** `api:src/domain/application/services/account/services/User.service.ts` · `api:src/infra/shared/database/prisma/repositories/prismaCompany.repository.ts` · `api:src/domain/enterprise/entities/company.ts`

### 7. [Alto] App forgot-password: input "Código" sem autoCapitalize="none" — teclado capitaliza e invalida o código

**Local:** `app:app/(auth)/forgot-password.tsx:131` · **Origem:** achado novo da auditoria

No React Native, TextInput tem autoCapitalize default "sentences". Os inputs de email do app passam autoCapitalize="none", mas o input do código de recuperação não passa — o teclado do celular sugere/força a primeira letra maiúscula e, como os códigos são minúsculos e a validação (GET /client/password-code/:code) é case-sensitive, o usuário recebe "Código inválido ou expirado". Mesma classe do bug web, do lado mobile.

**Evidência:**

```
<Input label="Código" placeholder="Digite o código" leftIcon={KeyRound} value={code} onChangeText={setCode} containerClassName="mb-6" />  // sem autoCapitalize="none"
```

**Recomendação:** Adicionar autoCapitalize="none" autoCorrect={false} ao input do código (e considerar autoComplete="one-time-code").

**Arquivos relacionados:** `app:components/ui/Input.tsx` · `api:src/infra/shared/database/prisma/repositories/prismaRecoverPasswordCode.repository.ts`

### 8. [Alto] API devolve o código de recuperação no corpo da resposta HTTP (fluxo email+CPF) e loga o código no console

**Local:** `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts:56` · **Origem:** achado novo da auditoria

Em RecoverClientPasswordCodeService.create, quando o request traz CPF que bate com o cadastro, o código de reset é retornado direto na resposta (`return right({ code })`) e o controller o repassa (`return { code: result.value.code }`). O app usa isso no "Primeiro Acesso" (login.tsx linhas 112-121). Consequência: qualquer pessoa que saiba email+CPF de um cliente redefine a senha dele sem acesso ao e-mail (endpoint público, sem rate limit visível). Além disso, a linha 56 faz `console.log('RECOVERY CODE:', ...)` em TODO fluxo — inclusive no fluxo por e-mail — vazando códigos válidos nos logs do servidor.

**Evidência:**

```
console.log('RECOVERY CODE:', recoverPasswordCode.code);

if (cpfTrimmed) {
  return right({ code: recoverPasswordCode.code });
}

// app/(auth)/login.tsx:117-119
const code = (res.body as { code?: string })?.code;
if ((res.status === 200 || res.status === 201) && code) {
  setRecoveryCode(code);
```

**Recomendação:** Remover o console.log. Repensar o "primeiro acesso": em vez de devolver o código, validar server-side (endpoint dedicado que troca a senha após conferir email+CPF+senha-inicial=CPF), adicionar rate limiting, e nunca expor o código de reset em resposta HTTP.

**Arquivos relacionados:** `app:app/(auth)/login.tsx` · `api:src/infra/http/controllers/client/recoverClientPasswordCode.controller.ts`

### 9. [Médio] generateRandomString tem off-by-one: gera códigos com menos de 6 caracteres e nunca sorteia 'a'

**Local:** `api:src/utils/generateRandomString.ts:7` · **Origem:** achado novo da auditoria

`Math.ceil(Math.random() * 36)` produz índices 1..36, mas `charAt(36)` retorna string vazia — cada caractere tem ~1/36 de chance de "sumir", então ~15% dos códigos de recuperação saem com menos de 6 caracteres, e o índice 0 ('a') é praticamente inalcançável (viés). Também usa Math.random (não criptográfico) para um token de segurança. Afeta os códigos de recuperação de senha de user e client e o texto do e-mail.

**Evidência:**

```
const random = Math.ceil(Math.random() * lettersAndNumbers.length);
code += lettersAndNumbers.charAt(random);  // charAt(36) === ''
```

**Recomendação:** Usar Math.floor (índices 0..35) ou, melhor, crypto.randomInt/randomBytes para gerar o código.

**Arquivos relacionados:** `api:src/domain/application/services/account/services/RecoverPasswordCode.service.ts` · `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts`

### 10. [Médio] Mensagem "Resource not found" (inglês, HTTP 410) vaza crua para o usuário nas telas de auth

**Local:** `api:src/core/errors/errors/resourceNotFoundError.ts:4` · **Origem:** achado novo da auditoria

ResourceNotFoundError tem mensagem hardcoded em inglês ('Resource not found') e o ErrorHandler a converte em GoneException(410) repassando a mensagem. Os frontends exibem `body.message` cru: no recover-password web (linha 38, e-mail não cadastrado), no registro com código de clínica inválido (linha 112-114) e no forgot-password do app (linha 41). O usuário vê "Resource not found" em vez de um texto em português. De quebra, responder diferente para e-mail inexistente permite enumeração de e-mails cadastrados num endpoint público.

**Evidência:**

```
export class ResourceNotFoundError extends Error implements ServiceError {
  constructor() {
    super('Resource not found');
  }
}

// error.handler.ts
case ResourceNotFoundError:
  throw new GoneException(error.message);

// web recover-password/page.tsx:38
setError((data as { message?: string }).message ?? "Erro ao enviar código.");
```

**Recomendação:** Traduzir as mensagens de erro de domínio para PT-BR (como já feito nos DTOs e no AuthenticationError). No recover de senha, responder 200 genérico ("se o e-mail existir, enviaremos um código") para não permitir enumeração.

**Arquivos relacionados:** `api:src/infra/shared/handler/error.handler.ts` · `web:app/(auth)/recover-password/page.tsx` · `web:app/(auth)/register/page.tsx` · `app:app/(auth)/forgot-password.tsx`

### 11. [Médio] Recuperar senha (web): campos "Nova senha" e "Confirmar senha" também sem olhinho

**Local:** `web:app/(auth)/recover-password/page.tsx:135` · **Origem:** achado novo da auditoria

Mesma classe do bug reportado no registro: os dois inputs de senha da etapa 2 do recover são type="password" fixo, sem toggle Eye/EyeOff e sem autoComplete="new-password". O usuário define a nova senha às cegas — num fluxo em que ele acabou de errar/esquecer a senha.

**Evidência:**

```
<Input
  id="password"
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  required
  minLength={6}
  placeholder="••••••••"
/>  // idem confirmPassword (linhas 147-155), sem rightIcon
```

**Recomendação:** Aplicar o mesmo padrão de toggle do login (com noAutoCapitalize) nos dois campos.

**Arquivos relacionados:** `web:app/(auth)/login/page.tsx`

### 12. [Médio] App: inputs de senha ficam com autoCapitalize/autoCorrect default quando a senha é revelada

**Local:** `app:components/ui/Input.tsx:56` · **Origem:** achado novo da auditoria

O Input do app tem toggle de visibilidade (ok), mas quando visible=true o secureTextEntry vira false e o TextInput fica sem autoCapitalize/autoCorrect definidos — o default do RN é autoCapitalize="sentences", então o teclado passa a capitalizar a primeira letra e sugerir autocorreção enquanto o usuário digita com a senha visível (login, signup, forgot-password, primeiro acesso). É a versão mobile do bug reportado no login web.

**Evidência:**

```
<TextInput
  className={`flex-1 text-base text-text-primary ${className || ""}`}
  placeholderTextColor="#94A3B8"
  secureTextEntry={isPassword && !visible}
  ...
  {...props}
/>  // nenhum autoCapitalize="none"/autoCorrect={false} quando isPassword
```

**Recomendação:** No componente Input, quando isPassword, fixar autoCapitalize="none", autoCorrect={false} e textContentType/autoComplete adequados, independentemente do estado visible.

**Arquivos relacionados:** `app:app/(auth)/login.tsx` · `app:app/(auth)/signup.tsx` · `app:app/(auth)/forgot-password.tsx`

### 13. [Baixo] Logs de produção expõem dados do fluxo de registro (companyCode e dados da empresa)

**Local:** `api:src/domain/application/services/account/services/User.service.ts:307` · **Origem:** achado novo da auditoria

O registro com vínculo a clínica imprime via console.log o companyCode recebido e os dados da empresa encontrada. Junto com o console.log do RECOVERY CODE (já apontado em outro achado), indica falta de higiene de logs em fluxos públicos de auth — dados que permitem se vincular a uma clínica alheia ficam nos logs do servidor.

**Evidência:**

```
console.log('JOIN EXISTING COMPANY - companyCode received:', companyCode);
const existingCompany = await this.companyRepository.findByCode(companyCode);
console.log(
  'JOIN EXISTING COMPANY - existingCompany found:', ...
```

**Recomendação:** Remover os console.log ou trocar por Logger.debug sem o valor do código.

**Arquivos relacionados:** `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts`

### 14. [Baixo] Painel ADM: login sem olhinho na senha (padronização)

**Local:** `adm:src/app/login/page.tsx:94` · **Origem:** achado novo da auditoria

O login do painel administrativo usa AuthInput type="password" fixo, sem toggle de visibilidade — inconsistente com o login do web principal que já tem Eye/EyeOff. Sem risco de capitalização (o ADM não tem a lógica capitalizeFirstChar), é só padronização de UX.

**Evidência:**

```
<AuthInput
  id="password"
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  required
  autoComplete="current-password"
  placeholder="••••••••"
  leftIcon={<Lock className="h-5 w-5" />}
/>  // sem rightIcon/toggle
```

**Recomendação:** Adicionar o mesmo toggle Eye/EyeOff do web principal.

**Arquivos relacionados:** `web:app/(auth)/login/page.tsx`

### 15. [Baixo] E-mails de boas-vindas, inatividade e fim de trial JÁ estão protegidos contra falha do provedor (sem bug — mapeamento)

**Local:** `api:src/domain/application/services/account/services/User.service.ts:66` · **Origem:** achado novo da auditoria

Mapeamento dos demais fluxos que dependem de e-mail, para responder "o que mais quebra com ZeptoMail sem créditos": (a) boas-vindas no registro — User.service sendWelcomeSafe envolve o sendMail em try/catch e só loga a falha, o cadastro completa normalmente; (b) scheduler de usuários inativos — try/catch por usuário; (c) scheduler de fim de trial — notifyTrialEnded com try/catch. Não existe fluxo de convite por e-mail (o vínculo de usuário a clínica é feito por companyCode digitado). Ou seja, apenas os dois fluxos de recuperação de senha (user e client) vazam 500; os demais degradam silenciosamente (e-mail não chega, mas nada quebra).

**Evidência:**

```
private async sendWelcomeSafe(email: string, name: string): Promise<void> {
  try {
    const { subject, html } = welcomeEmail(name);
    await this.sendEmail.sendMail({ to: email, subject, html });
  } catch (error) {
    this.logger.error(`Falha ao enviar boas-vindas para ${email}: ${error}`);
  }
}
```

**Recomendação:** Nenhuma correção nesses fluxos; usar o mesmo padrão sendWelcomeSafe nos dois services de recovery. Considerar alerta/observabilidade quando a taxa de falha de e-mail subir (hoje a falha some nos logs).

**Arquivos relacionados:** `api:src/domain/application/services/account/services/inactiveUsers.scheduler.ts` · `api:src/domain/application/services/signature/service/expireTrialSignatures.scheduler.ts`

---

## Modais de cadastro

> As três modais de cadastro (CreateOwnerSheet, CreateAnimalSheet, NewPropertySheet/EditPropertySheet) compartilham o mesmo mecanismo de voz (AudioToFormButton → /api/audio/transcribe-to-form → Gemini via OpenRouter), e a maior parte dos bugs reportados tem causa raiz confirmada no código: o parser de voz devolve TEXTO (labels) e os forms esperam IDs, o casamento é por igualdade exata contra listas paginadas parcialmente carregadas, e campos não falados são preenchidos com o literal "Não Informado" que chega a ser SUBMETIDO à API (e, na edição de propriedade, sobrescreve dados reais já salvos). O CEP não é capturado por voz porque simplesmente não existe na lista de campos de áudio (é um estado separado do formData) e nem é persistido no banco. O filtro propriedade-por-cliente não existe em nenhuma camada (o endpoint GET /stud-farm nem aceita clientId) e, pior, criar um animal vincula silenciosamente o cliente à propriedade escolhida. Validação de data de nascimento é inexistente de ponta a ponta (front aceita string crua vinda do áudio; API valida birthDate só como @IsString e faz new Date() cego). Mensagens de erro da API vazam cruas em inglês ("Resource already exists", "Resource not found") porque o ApiContext repassa err.message sem tradução. Também confirmei bugs não reportados graves: POST /animal e POST /stud-farm não retornam a entidade criada, quebrando os fluxos aninhados de "+ Novo/Nova" que dependem de created.id.

### 1. [Crítico] Voz preenche campos não falados com o literal 'Não Informado' — que é submetido à API e sobrescreve dados na edição

**Local:** `web:app/(dashboard)/services/_components/AudioToFormButton.tsx:100` · **Origem:** achado novo da auditoria

O AudioToFormButton preenche TODO campo não-data que a IA devolveu null com a string literal 'Não Informado'. Efeitos: (a) CreateOwnerSheet: phone/cpf ficam com 'Não Informado' no estado — o MaskedInput exibe vazio (a máscara remove não-dígitos), mas o submit envia o valor cru: cliente salvo com phone='Não Informado' no banco (API não valida formato); (b) CreateAnimalSheet: 'if (next.name) updated.name = next.name' — animal ganha nome 'Não Informado'; (c) EditPropertySheet: o updater faz {...p, ...next}, então TODOS os campos já salvos que não foram falados no áudio são SOBRESCRITOS por 'Não Informado' — perda de dados reais na edição; (d) email 'Não Informado' trava o submit no input type=email sem o usuário entender por quê.

**Evidência:**

```
for (const key of Object.keys(data)) {
  const val = data[key];
  const str = val != null ? String(val).trim() : "";
  if (dateKeys.has(key)) { next[key] = str ? parseDateToApiFormat(str) || str : ""; }
  else { next[key] = str || "Não Informado"; }
}
// EditPropertySheet.tsx:164: return { ...p, ...next } as CreateStudFarmDto;  // sobrescreve tudo
// CreateOwnerSheet.tsx:69: phone: formData.phone || undefined,  // 'Não Informado' é truthy → enviado
```

**Recomendação:** Quando a IA devolver null, NÃO tocar no campo (manter valor anterior) em vez de gravar 'Não Informado'. Se quiser feedback visual, usar placeholder/aviso, nunca valor real do estado.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `web:app/(dashboard)/_components/sheets/EditPropertySheet.tsx` · `web:lib/masks.ts`

### 2. [Alto] Voz não preenche dropdowns de Cliente/Propriedade no Criar animal (match exato contra lista paginada parcial)

**Local:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:458` · **Origem:** reportado nos testes manuais

Causa raiz confirmada: o parser de áudio devolve clientName/studFarmName como TEXTO livre (fields tipo 'text') e o CreateAnimalSheet tenta converter texto→id fazendo igualdade exata case-insensitive contra dropdownClients/dropdownStudFarms — listas que contêm APENAS as páginas já carregadas (página 1 + scroll infinito). Se o cliente está na página 2+, ou a transcrição difere por acento/apelido/nome parcial ('João' vs 'Joao', 'Fazenda Boa Vista' vs 'Boa Vista'), não casa e o valor é DESCARTADO em silêncio, sem nenhum aviso ao usuário. Nunca é disparada a busca server-side (searchClientsForDropdown) com o nome transcrito.

**Evidência:**

```
if (next.clientName) {
  const match = dropdownClients.find(
    (c) => c.name.toLowerCase() === next.clientName.toLowerCase(),
  );
  if (match) updated.clientId = match.id;
}
if (next.studFarmName) {
  const match = dropdownStudFarms.find(
    (sf) => sf.name.toLowerCase() === next.studFarmName.toLowerCase(),
  );
  if (match) updated.studFarmId = match.id;
}
```

**Recomendação:** Ao receber clientName/studFarmName, chamar a busca server-side (GET /client?query= / GET /stud-farm?query=) com o texto transcrito, normalizar acentos (NFD) e usar match parcial/fuzzy; se não achar, mostrar aviso ('Cliente "X" não encontrado') em vez de descartar silenciosamente.

**Arquivos relacionados:** `web:context/GlobalContext.tsx` · `web:app/(dashboard)/services/_components/AudioToFormButton.tsx` · `web:app/api/audio/transcribe-to-form/route.ts`

### 3. [Alto] Dropdown de Propriedade no Criar animal não filtra pelas propriedades do cliente selecionado

**Local:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:686` · **Origem:** reportado nos testes manuais

O select de Propriedade usa dropdownStudFarms inteiro (todas as propriedades da empresa), ignorando o cliente já selecionado — permite escolher propriedade de outro cliente. A correção precisa dos dois lados: o endpoint GET /stud-farm (FetchStudFarmDto) só aceita page/query/city/state — NÃO existe filtro clientId na API, embora o presenter retorne clientId/clientName (daria para filtrar localmente ao menos). Agravante grave: ao criar o animal com studFarmId de outro cliente, o AnimalService cria SILENCIOSAMENTE um vínculo cliente↔propriedade na tabela clientStudFarm (linkClientToStudFarm), poluindo dados.

**Evidência:**

```
<Select id="studFarmId" options={dropdownStudFarms.map((sf) => ({ value: sf.id, label: sf.name }))} ... />
// api animal.service.ts:78-84
if (safeStudFarmId && safeClientId) {
  try { await this.studFarmRepository.linkClientToStudFarm(safeClientId, safeStudFarmId); } catch ...
}
// api studFarm.dto.ts:134-158 FetchStudFarmDto: só page, query, city, state (sem clientId)
```

**Recomendação:** Adicionar filtro clientId ao FetchStudFarmDto + repositório; no web, quando form.clientId estiver setado, buscar /stud-farm?clientId=... (ou filtrar dropdownStudFarms por sf.clientId, já disponível no presenter). Rever se o vínculo automático linkClientToStudFarm deve existir ou pedir confirmação.

**Arquivos relacionados:** `api:src/infra/http/controllers/studFarm/dto/studFarm.dto.ts` · `api:src/domain/application/services/animal/services/animal.service.ts` · `api:src/infra/http/presenters/studFarm.presenter.ts`

### 4. [Alto] Data de nascimento inválida ('60/92/9') passa sem validação de ponta a ponta

**Local:** `web:app/(dashboard)/services/_components/AudioToFormButton.tsx:98` · **Origem:** reportado nos testes manuais

Pelo áudio: parseDateToApiFormat('60/92/9') retorna '' (testei: inválida em todos os formatos), mas o AudioToFormButton tem fallback '|| str' que injeta a string CRUA no campo; o CreateAnimalSheet aceita sem validar (if (next.birthDate) updated.birthDate = next.birthDate) e envia à API. Na API, birthDate no CreateAnimalDto é validado apenas como @IsString (não @IsDateString), o controller faz new Date('60/92/9') = Invalid Date, o Prisma explode e o catch do service converte para ResourceNotFoundError → usuário recebe 'Resource not found' (410, inglês, sem relação com o problema). Pela digitação: o DateInput descarta silenciosamente datas incompletas/inválidas (onChange só dispara com 8 dígitos válidos) — o form submete sem a data e sem nenhum aviso, dando a impressão de que 'aceitou'.

**Evidência:**

```
next[key] = str ? parseDateToApiFormat(str) || str : "";  // fallback injeta string inválida crua
// api animal.dto.ts:72-74: @IsString({ message: 'Informe uma data de nascimento válida' }) @IsOptional() birthDate?: Date;
// api animal.controller.ts:47: birthDate: birthDate ? new Date(birthDate) : undefined,
// api animal.service.ts:85-88: catch (error) { ... return left(new ResourceNotFoundError()); }
```

**Recomendação:** Remover o fallback '|| str' (se a data não parseia, deixar vazio e avisar); validar birthDate no submit do CreateAnimalSheet (isValid + limite max=hoje); na API trocar @IsString por @IsDateString/@Type(()=>Date)+@IsDate e não mascarar erro Prisma como ResourceNotFoundError.

**Arquivos relacionados:** `web:lib/date-parse.ts` · `web:components/ui/date-input.tsx` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `api:src/infra/http/controllers/animal/dto/animal.dto.ts` · `api:src/infra/http/controllers/animal/animal.controller.ts` · `api:src/domain/application/services/animal/services/animal.service.ts`

### 5. [Alto] CEP não é capturado pelo preenchimento por áudio na modal de propriedade (campo ausente da lista de voz)

**Local:** `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx:18` · **Origem:** reportado nos testes manuais

Causa raiz confirmada: PROPERTY_FORM_FIELDS (lista enviada à IA) não contém nenhuma key 'cep' — a IA nunca é instruída a extrair o CEP falado. Além disso o CEP nem faz parte do formData: é um useState separado ('cep'), então mesmo que a IA devolvesse, o setFormData do AudioToFormButton não o alcançaria. Todos os outros campos (rua, número, cidade...) estão na lista, por isso 'todo o resto' funciona. Idêntico no EditPropertySheet (PROPERTY_AUDIO_FIELDS). Consequência extra: sem CEP por voz, o auto-preenchimento ViaCEP (que depende do CEP com 8 dígitos) nunca dispara no fluxo de voz.

**Evidência:**

```
const PROPERTY_FORM_FIELDS = [
  { key: "name", ... }, { key: "street", ... }, { key: "number", ... },
  { key: "city", ... }, { key: "state", ... }, { key: "neighborhood", ... },
  { key: "location", ... }, { key: "responsibleName", ... }, { key: "responsiblePhone", ... },
]; // sem "cep"
// linha 62: const [cep, setCep] = useState("");  // fora do formData
```

**Recomendação:** Incluir { key: 'cep', label: 'CEP (8 dígitos)' } nos fields de voz e, no retorno, extrair dígitos (digitsOnly) e chamar setCep() — o efeito ViaCEP existente completa o endereço automaticamente.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/EditPropertySheet.tsx` · `web:app/(dashboard)/services/_components/AudioToFormButton.tsx` · `web:lib/cep.ts`

### 6. [Alto] Dropdowns da modal de propriedade não são preenchidos por voz (Cliente ausente dos fields; Estado enviado como texto em vez de UF)

**Local:** `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx:23` · **Origem:** reportado nos testes manuais

Dois problemas: (1) o select de Cliente (clientId) não está em PROPERTY_FORM_FIELDS, então falar o nome do cliente não tem efeito nenhum — e diferente do CreateAnimalSheet, aqui não existe nem a lógica de casar nome→id; (2) o campo 'state' é declarado como type 'text' (label 'Estado (UF)'), então a IA pode devolver 'São Paulo' ou 'sp', mas o Select de estado espera exatamente os values 'SP', 'MG'... de BR_STATES — valor não reconhecido deixa o dropdown aparentemente vazio (e ainda pode virar 'Não Informado', ver achado do literal). Deveria ser type 'select' com options das UFs para a IA devolver o código exato.

**Evidência:**

```
{ key: "state", label: "Estado (UF)", type: "text" as const },  // deveria ser select c/ options
// clientId não aparece em PROPERTY_FORM_FIELDS (linhas 18-36)
// Select do estado (linhas 280-287): options={BR_STATES} → values "AC","AL",..."SP"
```

**Recomendação:** Adicionar clientName aos fields de voz com resolução nome→id via busca server-side; mudar 'state' para type 'select' com options ['AC','AL',...] ou mapear nome do estado→UF após a transcrição.

**Arquivos relacionados:** `web:lib/cep.ts` · `web:app/(dashboard)/_components/sheets/EditPropertySheet.tsx`

### 7. [Alto] POST /animal não retorna o animal criado — fluxo aninhado '+ Criar animal' nunca auto-seleciona

**Local:** `api:src/infra/http/controllers/animal/animal.controller.ts:56` · **Origem:** achado novo da auditoria

O controller de criação de animal não tem return no caminho de sucesso (só trata isLeft), então a resposta é vazia. O CreateAnimalSheet faz PostAPI<{id,name}>('/animal') e depende de created?.id para chamar onSuccess (usado por CreateNoteSheet e outros fluxos aninhados) — como created é undefined, onSuccess nunca dispara e o animal recém-criado não é selecionado no formulário pai, silenciosamente.

**Evidência:**

```
const result = await this.animalService.create({ ... });
if (result.isLeft()) return ErrorHandler(result.value);
// (sem return de sucesso)
// web CreateAnimalSheet.tsx:297-311:
const created = await PostAPI<{ id: string; name: string }>("/animal", body);
if (created?.id && onSuccess) { onSuccess({ id: created.id, ... }); }
```

**Recomendação:** Fazer o service retornar o animal criado e o controller devolver { animal: AnimalPresenter.toHTTP(...) }; ajustar o web para consumir o shape retornado.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateNoteSheet.tsx` · `api:src/domain/application/services/animal/services/animal.service.ts`

### 8. [Alto] POST /stud-farm não retorna a propriedade criada — '+ Nova propriedade' dentro do Criar animal não seleciona a criada

**Local:** `api:src/infra/http/controllers/studFarm/studFarm.controller.ts:55` · **Origem:** achado novo da auditoria

Mesmo padrão do animal: o controller de stud-farm cria e só retorna erro em isLeft — sucesso responde vazio. O NewPropertySheet faz PostAPI<StudFarm>('/stud-farm') e só chama onSuccess se created?.id — nunca acontece. Resultado: ao criar uma propriedade a partir da modal Criar animal, ela NÃO é auto-selecionada no dropdown (o onSuccess do CreateAnimalSheet que faria setForm studFarmId nunca roda). O CreateOwnerSheet contorna isso re-buscando /client?page=1 e procurando por email — workaround frágil e inconsistente (só acha se o novo cliente estiver na página 1).

**Evidência:**

```
const result = await this.studFarmService.create({ ... });
if (result.isLeft()) return ErrorHandler(result.value);
// (sem return)
// web NewPropertySheet.tsx:139,156:
const created = await PostAPI<StudFarm>("/stud-farm", body);
...
if (created?.id && onSuccess) onSuccess(created as StudFarm);
// workaround no CreateOwnerSheet.tsx:99-101 (busca page=1 e find por email)
```

**Recomendação:** Retornar a entidade criada em POST /stud-farm (e POST /client), eliminando o workaround por email do CreateOwnerSheet.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx`

### 9. [Alto] Criar animal sem selecionar Cliente falha com 'Resource not found' (410) — campo aparenta opcional mas é obrigatório

**Local:** `api:src/infra/http/controllers/animal/animal.controller.ts:49` · **Origem:** achado novo da auditoria

Para token de veterinário (tokenType != 'client'), o controller passa clientId direto ao service (não usa o finalClientId calculado); se o vet não selecionou cliente, clientId é undefined e o service devolve ResourceNotFoundError → usuário vê toast 'Resource not found' em inglês, sem indicar que faltou o cliente. No formulário web o campo Cliente não é marcado como obrigatório nem validado no submit. Nota: existe até a variável finalClientId (linha 35) calculada e depois ignorada na linha 49 — indício de regressão.

**Evidência:**

```
const finalClientId = clientId || userId;  // linha 35 — calculado...
...
clientId: tokenType === 'client' ? userId : clientId,  // linha 49 — ...mas ignorado
// animal.service.ts:56-59:
if (!safeClientId) { console.error('[AnimalService] ClientID inválido...'); return left(new ResourceNotFoundError()); }
```

**Recomendação:** Validar cliente obrigatório no frontend com mensagem clara ('Selecione o cliente') e/ou devolver BadRequest com mensagem PT-BR na API; decidir se finalClientId (fallback para userId) era o comportamento pretendido.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `api:src/domain/application/services/animal/services/animal.service.ts`

### 10. [Médio] Erro 'Resource already exists' exibido cru em inglês ao duplicar email/CPF de cliente

**Local:** `api:src/core/errors/errors/resourceAlreadyExistsError.ts:5` · **Origem:** reportado nos testes manuais

Quando email ou CPF duplicam, o service devolve ResourceAlreadyExistsError cuja mensagem hardcoded é 'Resource already exists' (inglês). O ErrorHandler joga ConflictException(error.message) e o frontend (ApiContext) repassa err.message cru para o toast do CreateOwnerSheet. O usuário vê mensagem em inglês sem saber qual campo duplicou (email? CPF?).

**Evidência:**

```
super('Resource already exists');  // api
// web ApiContext.tsx:42-43
const err = await res.json().catch(() => ({ message: res.statusText }));
throw new Error((err as { message?: string }).message ?? "Erro na requisição");
// CreateOwnerSheet.tsx:106-108: toast.error(err instanceof Error ? err.message : ...)
```

**Recomendação:** Traduzir mensagens de erro de domínio na API (ou mapear código de erro → mensagem PT-BR no frontend) e indicar o campo duplicado (email/CPF). Mesma classe atinge 'Resource not found', 'Not allowed' etc. via ErrorHandler (api:src/infra/shared/handler/error.handler.ts).

**Arquivos relacionados:** `web:context/ApiContext.tsx` · `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx` · `api:src/infra/shared/handler/error.handler.ts`

### 11. [Médio] Erro 'breed é obrigatório' (mensagem técnica meio inglês) — raça sem validação no frontend

**Local:** `api:src/infra/http/controllers/animal/dto/animal.dto.ts:36` · **Origem:** reportado nos testes manuais

O CreateAnimalSheet inicializa breed:'' e no handleSubmit valida apenas o nome (if (!form.name?.trim())) — a raça segue vazia para a API, que rejeita com a mensagem do class-validator 'breed é obrigatório' (nome do campo em inglês, sem contexto). O ApiContext repassa a mensagem crua para o toast. O usuário vê jargão técnico em vez de 'Selecione a raça'. Mesma classe: 'name é obrigatório', 'gender é obrigatório', 'Informe um studFarmId válido' etc.

**Evidência:**

```
@IsNotEmpty({ message: 'breed é obrigatório' })
breed!: string;
// web CreateAnimalSheet.tsx:251-254 (única validação client-side):
if (!form.name?.trim()) { toast.error("Informe o nome do animal."); return; }
```

**Recomendação:** Validar raça (e categoria/sexo) no frontend antes do submit com mensagem amigável; padronizar mensagens dos DTOs da API em PT-BR com nome de campo legível ('Raça é obrigatória').

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `web:context/ApiContext.tsx`

### 12. [Médio] Modal Criar propriedade não tem botão '+' para criar cliente novo (inconsistência entre modais)

**Local:** `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx:192` · **Origem:** reportado nos testes manuais

No CreateAnimalSheet, os selects de Cliente e Propriedade têm botões 'Novo'/'Nova' (UserPlus/Fence) que abrem CreateOwnerSheet/NewPropertySheet aninhados. No NewPropertySheet o select de Cliente NÃO tem esse botão — se o cliente ainda não existe, o usuário precisa abandonar o formulário. O NewAppointmentSheet também tem CreateOwnerSheet aninhado (linha 791), confirmando que o padrão existe em outras modais e só falta na propriedade (e no EditPropertySheet).

**Evidência:**

```
<Label htmlFor="clientId">Cliente</Label>
<Select options={dropdownClients.map(...)} ... />  // sem botão de criar
// Contraste — CreateAnimalSheet.tsx:633-642:
<Button ... onClick={() => setOpenClientSheet(true)}>
  <UserPlus className="h-3.5 w-3.5 mr-1" /> Novo
</Button>
```

**Recomendação:** Adicionar o mesmo botão 'Novo' ao lado do label Cliente no NewPropertySheet (e EditPropertySheet), abrindo CreateOwnerSheet com nestingLevel+1 e selecionando o cliente criado no onSuccess.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `web:app/(dashboard)/_components/sheets/EditPropertySheet.tsx` · `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx`

### 13. [Médio] Telefone/CPF vindos da voz são gravados com formatação inconsistente (máscara não normaliza o estado)

**Local:** `web:app/(dashboard)/services/_components/AudioToFormButton.tsx:96` · **Origem:** achado novo da auditoria

No preenchimento manual, o MaskedInput devolve só dígitos (unmaskValue) — phone/cpf ficam '11912345678'. No preenchimento por voz, o AudioToFormButton grava o texto cru da IA no estado ('(11) 91234-5678', '123.456.789-00') e o submit envia esse valor sem normalizar. Como a API não valida formato (CreateClientDto: phone/cpf strings livres) e o findByCpf compara string exata, um CPF com pontuação não colide com o mesmo CPF salvo só com dígitos — a checagem de duplicidade de CPF pode ser burlada pelo fluxo de voz, e o paymentId (Asaas) recebe cpfCnpj formatado.

**Evidência:**

```
const str = val != null ? String(val).trim() : "";
... next[key] = str || "Não Informado";  // sem unmask por tipo de campo
// CreateOwnerSheet.tsx:171-174: slice(0,11) só roda no onChange manual do input
// api client.service.ts:67-70: findByCpf(cpf) — comparação exata
```

**Recomendação:** Após a transcrição, normalizar campos mascarados com as próprias funções de lib/masks (unmaskPhone, digits do CPF); na API, normalizar/validar cpf e phone antes de persistir e de comparar.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx` · `web:lib/masks.ts` · `api:src/infra/http/controllers/client/dto/client.dto.ts` · `api:src/domain/application/services/client/services/client.service.ts`

### 14. [Médio] Modal 'Novo cliente' aninhada abre com mesmo z-index da modal pai (nestingLevel ignorado no CreateOwnerSheet)

**Local:** `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx:28` · **Origem:** achado novo da auditoria

O componente Modal calcula zIndex = 50 + nestingLevel, e o NewPropertySheet repassa nestingLevel corretamente ao Modal. Já o CreateOwnerSheet aceita a prop nestingLevel mas a descarta explicitamente (comentário eslint-disable 'aceito na API, não usado') e não a repassa ao Modal — quando aberto por cima do CreateAnimalSheet ou do NewAppointmentSheet, ambos os overlays ficam com z-index 50, e a ordem de empilhamento vira acaso da ordem no DOM (risco de a modal filha ficar visualmente misturada/atrás).

**Evidência:**

```
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- aceito na API, não usado
nestingLevel = 0,
...
<Modal open={open} onClose={onClose} title={...}>  // sem nestingLevel
// components/ui/modal.tsx:25: const z = 50 + nestingLevel;
```

**Recomendação:** Repassar nestingLevel ao Modal no CreateOwnerSheet, como o NewPropertySheet já faz (linha 171).

**Arquivos relacionados:** `web:components/ui/modal.tsx` · `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx`

### 15. [Médio] CEP não é persistido em lugar nenhum — na edição de propriedade o campo sempre volta vazio

**Local:** `web:app/(dashboard)/_components/sheets/EditPropertySheet.tsx:71` · **Origem:** achado novo da auditoria

O CEP digitado (ou futuramente falado) serve apenas para consultar o ViaCEP e preencher rua/bairro/cidade/estado; não existe campo cep no CreateStudFarmDto do web nem no da API, e a entidade StudFarm não o armazena. O próprio código admite: comentário no EditPropertySheet diz 'em edição não temos o CEP original armazenado na entidade, então parte vazio'. UX confusa: usuário preenche CEP no cadastro e ao editar o vê vazio.

**Evidência:**

```
// Auto-busca via ViaCEP — mesmo padrão do NewPropertySheet. Aqui só
// funciona se o usuário começar a digitar um CEP (em edição não temos
// o CEP original armazenado na entidade, então parte vazio).
// api studFarm.dto.ts CreateStudFarmDto: name, address, city, state, street, number, neighborhood... (sem cep)
```

**Recomendação:** Adicionar coluna/campo cep na entidade StudFarm (Prisma + DTOs + presenter) e persistir; exibir no editar/visualizar.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx` · `api:src/infra/http/controllers/studFarm/dto/studFarm.dto.ts`

### 16. [Médio] Cliente criado sem senha recebe senha previsível (CPF ou email) — derivada automaticamente no cadastro

**Local:** `api:src/domain/application/services/client/services/client.service.ts:73` · **Origem:** achado novo da auditoria

Ao criar cliente pelo modal web (que não envia password), a API gera o hash de senha a partir de 'password ?? cpf ?? email' — ou seja, a senha inicial do cliente para login no app é o próprio CPF (ou o email, se sem CPF). Valores publicamente conhecíveis usados como credencial, sem fluxo de convite/redefinição forçada.

**Evidência:**

```
const passwordHash = await this.hash.hash(password ?? cpf ?? email);
```

**Recomendação:** Gerar senha aleatória + fluxo de definição de senha por email/convite no primeiro acesso, ou marcar a conta como 'sem senha definida' até o cliente ativá-la.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx`

### 17. [Médio] Dropdowns de select por voz no Criar animal falham silenciosamente quando a opção não casa exatamente (raça/pelagem/sexo/categoria)

**Local:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:416` · **Origem:** achado novo da auditoria

Para breed/color o match é igualdade exata case-insensitive contra os names de constants/breads_colors; para sex/category são mapas fixos com poucas variações ('fêmea'/'femea'). Se a IA devolver qualquer variação ('Mangalarga' vs 'Mangalarga Marchador', 'égua' para fêmea, 'SRD' vs 'SRD (Sem Raça Definida)') ou 'Não Informado', o campo fica intocado SEM aviso — o usuário acha que preencheu e leva 'breed é obrigatório' no submit (conexão direta com o bug reportado). Não há feedback de quais campos a voz conseguiu ou não preencher.

**Evidência:**

```
if (next.breed) {
  const match = breeds.find((b) => b.name.toLowerCase() === next.breed.toLowerCase());
  if (match) updated.breed = match.id;
}  // sem else/aviso
// sexMap: { macho: "MALE", fêmea: "FEMALE", femea: "FEMALE" } — sem 'égua', 'garanhão' etc.
```

**Recomendação:** Normalizar acentos e usar matching tolerante (includes/startsWith) + exibir resumo pós-voz ('não reconhecido: Raça'); ampliar sinônimos dos mapas de sexo/categoria.

**Arquivos relacionados:** `web:constants/breads_colors.ts` · `web:app/(dashboard)/services/_components/AudioToFormButton.tsx`

### 18. [Baixo] Telefone duplicado entre clientes é aceito (sem unicidade de phone)

**Local:** `api:src/domain/application/services/client/services/client.service.ts:63` · **Origem:** reportado nos testes manuais

Na criação de cliente a API valida unicidade apenas de email e CPF; telefone nunca é checado, então dois clientes podem ter o mesmo telefone sem erro. O usuário ACEITA esse comportamento por decisão de negócio — mapeado apenas para registro. Não há nenhuma validação de formato de telefone na API (campo é string opcional livre).

**Evidência:**

```
const clientAlreadyExists = await this.clientRepository.findByEmail(email);
if (clientAlreadyExists) return left(new ResourceAlreadyExistsError());
if (cpf) {
  const cpfAlreadyExists = await this.clientRepository.findByCpf(cpf);
  if (cpfAlreadyExists) return left(new ResourceAlreadyExistsError());
}
```

**Recomendação:** Manter comportamento (decisão de negócio), mas documentar. Se um dia quiser alertar, fazer verificação soft (aviso, não bloqueio) no frontend.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx`

### 19. [Baixo] Data de nascimento aceita datas futuras (sem max=hoje) e DateInput descarta inválidas sem mensagem

**Local:** `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx:738` · **Origem:** achado novo da auditoria

O DateInput de nascimento no CreateAnimalSheet não passa a prop max, então o calendário e a digitação aceitam datas futuras (animal 'nasce' em 2030) — o badge de idade simplesmente não renderiza. Além disso, quando o usuário digita uma data incompleta/inválida, o handleInputChange só propaga onChange com 8 dígitos válidos e o blur reverte o texto silenciosamente — sem nenhuma mensagem de erro, o que explica a percepção de que a modal 'aceita' qualquer coisa.

**Evidência:**

```
<DateInput id="birthDate" calendarPosition="top" value={form.birthDate ?? ""} onChange={...} disabled={isViewMode} />  // sem max
// date-input.tsx:163-166: if (digits.length === 8) { const api = toApiDate(v); if (api) onChange(api); }  // inválida = silêncio
```

**Recomendação:** Passar max={hoje} no DateInput de nascimento e exibir erro visual quando a data digitada for inválida (borda vermelha + hint).

**Arquivos relacionados:** `web:components/ui/date-input.tsx`

### 20. [Baixo] Inconsistências de padrão entre as três modais (máscaras, validações, console.log, campos obrigatórios)

**Local:** `web:app/(dashboard)/_components/sheets/NewPropertySheet.tsx:126` · **Origem:** achado novo da auditoria

Varredura campo a campo: (1) CreateOwnerSheet valida required só em name/email; phone/cpf sem validação de comprimento/dígito verificador; (2) NewPropertySheet: apenas name required — clientId opcional cria propriedade órfã sem dono (agrava o problema do filtro por cliente, pois propriedades sem clientId nunca poderão ser filtradas); (3) telefone tem máscara nas 3 modais, mas CEP usa formatCep de lib/cep.ts enquanto lib/masks.ts tem formatCEP duplicado (duas implementações da mesma máscara); (4) console.log de dados criados em produção (CreateAnimalSheet:301 'created:', NewPropertySheet:140 'created'); (5) CreateOwnerSheet usa OWNER_FORM_FIELDS com labels genéricos ('Nome') enquanto animal usa labels descritivos ('Nome do animal') — no cliente, a IA pode confundir de quem é o nome falado.

**Evidência:**

```
const body: CreateStudFarmDto = { name: formData.name ?? "", ..., clientId: formData.clientId || undefined };  // clientId opcional → propriedade sem dono
// CreateAnimalSheet.tsx:301: console.log("created: ", created);
// lib/masks.ts:52 formatCEP vs lib/cep.ts:43 formatCep — duplicação
```

**Recomendação:** Padronizar: exigir cliente na criação de propriedade (ou exibir aviso), unificar máscara de CEP em um único util, remover console.log e revisar labels dos fields de voz do CreateOwnerSheet ('Nome do cliente').

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/CreateOwnerSheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateAnimalSheet.tsx` · `web:lib/masks.ts` · `web:lib/cep.ts`

---

## Nova atividade / Nova movimentação

> As duas modais vivem em equinology-web-v2/app/(dashboard)/_components/sheets: NewAppointmentSheet.tsx (Nova atividade) e NewPaymentSheet.tsx (Nova movimentação), ambas reutilizadas pela home, agenda, atendimentos e financeiro. Na Nova atividade, o encadeamento propriedade→cliente→animal já é server-side (usePaginatedSelect → GET /client?studFarmId e GET /animal?studFarmId&clientId), e o bug do cliente sumir é 100% backend: o filtro em prismaClient.repository.ts exige que o cliente tenha animal na propriedade (Animal.some.studFarmId), ignorando os vínculos diretos ClientStudFarm/StudFarm.clientId que o caminho inverso (prismaStudFarm.repository.ts) usa corretamente. Data retroativa é aceita em TODOS os pontos de criação (nenhum DateTimePicker recebe min e a API não valida passado); a falha percebida pela Rafaela provavelmente vem da home, onde o 'próximo horário livre' chega assíncrono e um useEffect sobrescreve silenciosamente a data que a usuária escolheu. Na Nova movimentação, o '1' que não apaga é o campo Parcelas (Number(...) || 1), o CurrencyInput zera/esvazia no blur para entradas inválidas e interpreta ponto como milhar (1.5 → 15), e o dropdown de Animal usa a lista global sem filtrar pelo cliente (padrão correto já existe em NewInvoiceSheet). O achado mais grave é novo: a API descarta clientId e scope da movimentação (DTO/controller/model Payment não os possuem), então o campo Cliente — obrigatório no front — é perdido, e o filtro por cliente só enxerga movimentações que têm animal.

### 1. [Crítico] API descarta clientId e scope da movimentação: campo Cliente é obrigatório no front mas o dado é perdido

**Local:** `api:src/infra/http/controllers/finance/dto/payment.dto.ts:13` · **Origem:** reportado nos testes manuais

A causa mais grave por trás de 'não consegue salvar/filtrar movimentação': o web exige selecionar cliente (NewPaymentSheet.tsx:110-113 bloqueia submit sem clientId) e envia clientId e scope no POST /payment (linhas 116-126; tipo CreatePaymentDto em types/dashboard.ts:264-265). Porém no backend o CreatePaymentDto (payment.dto.ts:13-78) NÃO possui clientId nem scope, o controller não os repassa (payment.controller.ts:23-52 destrutura só amount/categoryId/.../animalId) e o model Payment (schema.prisma:506-539) não tem coluna para nenhum dos dois. Resultado: o vínculo com o cliente e a categoria Profissional/Pessoal são silenciosamente jogados fora. Consequência direta: a listagem filtrada por cliente só funciona via relação com animal (prismaPayment.repository.ts:169-176 — OR appointmentAnimal.animal.clientId / animal.clientId), então uma movimentação criada com cliente mas sem animal (animal é opcional) nunca aparece ao filtrar por aquele cliente, e o filtro 'Categoria' (scope) do front não tem base real no banco.

**Evidência:**

```
payment.controller.ts:24-35 — const { amount, categoryId, firstDueDate, isTotalValue, status, name, quantity, type, appointmentAnimalId, animalId } = body; — clientId e scope enviados pelo web não existem no DTO nem são repassados ao service.
```

**Recomendação:** Adicionar clientId (opcional, FK para Client) e scope (enum PERSONAL/PROFESSIONAL) ao model Payment via migration, incluir no DTO/controller/service, e usar o clientId direto no whereFilter do fetch. Enquanto isso, o front não deveria exigir um campo que a API descarta.

**Arquivos relacionados:** `api:src/infra/http/controllers/finance/payment.controller.ts (linhas 23-52, create ignora clientId/scope)` · `api:src/domain/application/services/finance/services/payment.service.ts (linhas 28-52, create sem clientId/scope)` · `api:prisma/schema.prisma (linhas 506-539, model Payment sem clientId/scope)` · `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts (linhas 169-176, filtro por cliente só via animal)` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx (linhas 110-126, exige e envia clientId/scope)` · `web:types/dashboard.ts (linhas 264-265, CreatePaymentDto do front com clientId e scope)`

### 2. [Alto] Filtro de cliente por propriedade só retorna clientes que têm animal na propriedade

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaClient.repository.ts:136` · **Origem:** reportado nos testes manuais

Na modal Nova Atividade (NewAppointmentSheet), ao escolher uma propriedade, o select de cliente busca GET /client?studFarmId=... . No backend, o repositório de clientes implementa esse filtro exclusivamente via 'Animal: { some: { studFarmId } }', ou seja, o cliente precisa ter pelo menos um animal naquela propriedade para aparecer. Clientes vinculados diretamente à propriedade (tabela ClientStudFarm) ou que criaram a propriedade (StudFarm.clientId) mas não têm animal somem da lista. O caminho inverso (listar propriedades de um cliente) usa o filtro correto (OR entre clientId criador e ClientStudFarm) em prismaStudFarm.repository.ts:55-66, provando que a relação direta existe e é usada — o filtro do cliente é que está assimétrico/errado.

**Evidência:**

```
prismaClient.repository.ts:136-140 — ...(data.studFarmId ? { Animal: { some: { studFarmId: data.studFarmId } } } : {}),
```

**Recomendação:** Trocar o filtro por um OR cobrindo as três formas de vínculo: { studFarms: { some: { studFarmId } } } (ClientStudFarm), { studFarmsCreated: { some: { id: studFarmId } } } e opcionalmente { Animal: { some: { studFarmId } } }. Aplicar o mesmo em countByCompanyId (linhas 169-173).

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/repositories/prismaClient.repository.ts (linhas 169-173, count com o mesmo filtro errado)` · `api:src/infra/http/controllers/client/client.controller.ts (linhas 75-79, repassa studFarmId)` · `api:src/infra/shared/database/prisma/repositories/prismaStudFarm.repository.ts (linhas 55-66, filtro correto no sentido inverso)` · `api:prisma/schema.prisma (linha 1654 Client.studFarms ClientStudFarm[]; linha 313 StudFarm.ClientStudFarm)` · `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx (linhas 192-208, clientsSelect envia studFarmId)`

### 3. [Alto] Data retroativa É aceita em todos os pontos de criação — mas na Home o 'próximo horário livre' sobrescreve a data escolhida pelo usuário

**Local:** `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx:210` · **Origem:** reportado nos testes manuais

Mapeei todos os pontos de criação de atividade/atendimento no web. Nenhum passa min ao DateTimePicker (o componente suporta min/max em date-time-picker.tsx:53-54/155-156/258-260, mas ninguém usa) e a API não valida data passada (appointment.service.ts create linhas 54-94 e CreateAppointmentServiceRequestDto só usa @IsDateString). Pontos: (1) NewAppointmentSheet via Home (page.tsx:221), Agenda (calendar/page.tsx:54), Atendimentos (services/page.tsx:34) e ficha do animal (clients-equines/animals/[id]/page.tsx:865); (2) QuickStartAppointmentSheet.tsx:117; (3) ReturnAppointmentSheet.tsx:140 e ReturnAppointmentAnimalSheet.tsx:278; (4) RescheduleAppointmentSheet.tsx:425. Ou seja: retroativo passa em todos. A explicação mais provável para a Rafaela 'não conseguir': na Home, o card 'Novo Agendamento' abre a modal imediatamente e busca o próximo horário livre em background (page.tsx:85-97); quando a resposta chega, initialStart muda e o useEffect de NewAppointmentSheet.tsx:210-219 SOBRESCREVE silenciosamente o startDate do formulário com o slot futuro — se a usuária já tinha escolhido uma data passada enquanto carregava, a escolha dela é descartada sem aviso.

**Evidência:**

```
NewAppointmentSheet.tsx:210-217 — useEffect(() => { if (open && initialStart) { setForm((p) => ({ ...p, startDate: initialStart.toISOString(), endDate: (initialEnd ?? initialStart).toISOString() })); } ... }, [open, initialStart, initialEnd, user]); — dispara de novo quando o slot chega depois da modal aberta.
```

**Recomendação:** No efeito de NewAppointmentSheet, só aplicar initialStart se o usuário ainda não mexeu no campo (flag 'touched') ou aplicar apenas na abertura. Decidir o requisito de negócio sobre retroativo: se for permitido, nada a fazer na API; se não, adicionar min={new Date().toISOString()} nos pickers e validação no service.

**Arquivos relacionados:** `web:app/(dashboard)/page.tsx (linhas 85-97, openNewAppointmentAtNextSlot com setAppointmentSlot assíncrono)` · `web:services/appointmentService.ts (linhas 35-66, getNextAvailableSlot sempre parte de 'agora')` · `web:components/ui/date-time-picker.tsx (linhas 53-54 e 258-260, suporte a min nunca utilizado)` · `web:app/(dashboard)/_components/sheets/QuickStartAppointmentSheet.tsx (linha 117)` · `web:app/(dashboard)/_components/sheets/ReturnAppointmentSheet.tsx (linha 140)` · `api:src/domain/application/services/appointment/services/appointment.service.ts (linhas 54-94, create sem validação de passado)` · `api:src/infra/http/controllers/appointment/dto/appointment.dto.ts (linhas 42-45, apenas IsDateString)`

### 4. [Alto] Nova Movimentação: dropdown de Animal não filtra pelos animais do cliente selecionado

**Local:** `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx:321` · **Origem:** reportado nos testes manuais

Na modal Nova Movimentação, o select de Animal usa a lista global dropdownAnimals do GlobalContext, carregada sem nenhum filtro (loadAnimals(1) sem clientId — GlobalContext.tsx:221-263, e paginação/busca também sem filtro nas linhas 295-315/368-388). Selecionar um cliente não altera em nada a lista de animais — mostra animais de todos os clientes. A API já suporta o filtro (GET /animal?clientId=... — prismaAnimal.repository.ts:220-222) e o próprio sistema já faz certo em NewInvoiceSheet.tsx:149-165 (usePaginatedSelect com clientId na URL). Mesma classe de problema em UpdatePaymentSheet.tsx:180-196 (edição de movimentação) e na barra de filtros de PaymentsTable.tsx:281-300 (filtro Animal não encadeado ao filtro Cliente).

**Evidência:**

```
NewPaymentSheet.tsx:321-329 — {dropdownAnimals.length > 0 && ( ... options={dropdownAnimals.map((a) => ({ value: a.id, label: a.name }))} — sem qualquer referência a form.clientId.
```

**Recomendação:** Substituir dropdownAnimals por usePaginatedSelect com buildUrl incluindo clientId (mesmo padrão de NewInvoiceSheet), resetando o animalId ao trocar de cliente.

**Arquivos relacionados:** `web:context/GlobalContext.tsx (linhas 221-263 loadAnimals; 295-315 loadNextAnimalsPage sem filtros)` · `web:app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx (linhas 149-165, padrão correto com clientId)` · `web:app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx (linhas 180-196, mesmo problema)` · `web:app/(dashboard)/financial/_components/PaymentsTable.tsx (linhas 281-300, filtro Animal sem encadear Cliente)` · `api:src/infra/shared/database/prisma/repositories/prismaAnimal.repository.ts (linhas 212-224, filtro clientId disponível)`

### 5. [Médio] Parcelas: o número 1 não pode ser apagado (Number(...) || 1 reimpõe o valor a cada tecla)

**Local:** `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx:245` · **Origem:** reportado nos testes manuais

Na modal Nova Movimentação, o campo Parcelas usa onChange={(e) => setForm(p => ({...p, quantity: Number(e.target.value) || 1}))}. Ao apagar o conteúdo, e.target.value vira '' → Number('') = 0 → 0 || 1 = 1, e o input controlado volta a exibir '1' imediatamente. O usuário não consegue limpar o campo para digitar outro número (precisa posicionar o cursor e digitar antes/depois do 1). É exatamente o '1 que não pode ser apagado' reportado. Mesma classe de bug em: UpdatePaymentSheet.tsx:162, ServicePayments.tsx:391 e NewInvoiceSheet.tsx:524 (Math.max(1, Number(...) || 0)).

**Evidência:**

```
NewPaymentSheet.tsx:242-246 — onChange={(e) => setForm((p) => ({ ...p, quantity: Number(e.target.value) || 1, }))}
```

**Recomendação:** Guardar quantity como string no estado do formulário (permitindo '' durante a digitação) e converter/clampar para >=1 apenas no submit, ou usar padrão de input numérico com estado de texto intermediário como o priceTexts do NewInvoiceSheet.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx (linha 162)` · `web:app/(dashboard)/services/_components/ServicePayments.tsx (linha 391)` · `web:app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx (linha 524)`

### 6. [Médio] CurrencyInput: valor zerado exibe campo vazio no blur e entrada inválida vira 0 silenciosamente; ponto decimal multiplica por 10/100

**Local:** `web:components/ui/currency-input.tsx:61` · **Origem:** reportado nos testes manuais

No componente CurrencyInput (campo Valor da Nova Movimentação): (a) quando o valor parseado é 0, o display fica vazio ('' — linha 45 e 65), dando a impressão de que 'o valor sumiu' ao clicar fora; (b) parseBRL retorna 0 para qualquer entrada não numérica (linha 18-19: NaN → 0), então digitar algo como 'R$ 100' ou um caractere errado zera tudo no blur, sem aviso; (c) parseBRL remove TODOS os pontos como se fossem separador de milhar (linha 15), então quem digita '1.5' obtém 15 e '10.50' obtém 1050 — valor gravado 10x/100x maior sem feedback. Com amount=0 o input required (linha 93 + NewPaymentSheet.tsx:189) fica vazio e o submit é bloqueado só pela validação nativa do browser — 'sem valor não salva'. O handleSubmit de NewPaymentSheet (linhas 104-113) não valida amount > 0 nem mostra toast, então o fluxo de erro é todo silencioso. Observação: no código atual não reproduzi um '1' fixo no campo Valor — o '1' impossível de apagar é o campo Parcelas (achado separado); é plausível que o relato tenha misturado os dois campos da mesma modal.

**Evidência:**

```
currency-input.tsx:14-19 — const normalized = str.replace(/\s/g, "").replace(/\./g, "").replace(",", "."); ... if (Number.isNaN(value)) return 0;  |  linha 45 — const displayValue = focused ? inputValue : (value > 0 ? formatBRL(value) : "");
```

**Recomendação:** Tratar ponto como decimal quando for o último separador (heurística pt-BR), rejeitar/realçar entrada inválida em vez de zerar, exibir '0,00' quando value===0 em vez de vazio, e validar amount > 0 no handleSubmit com toast explícito.

**Arquivos relacionados:** `web:components/ui/currency-input.tsx (linhas 14-20 parseBRL; linha 45 displayValue; linhas 61-66 handleBlur)` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx (linhas 185-190 uso do CurrencyInput; 104-113 submit sem validação de amount)` · `web:app/(dashboard)/_components/sheets/UpdatePaymentSheet.tsx (mesmo componente)` · `web:app/(dashboard)/_components/sheets/BankAccountSheet.tsx (mesmo componente)`

### 7. [Médio] Nova Atividade também envia clientId que a API descarta

**Local:** `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx:349` · **Origem:** achado novo da auditoria

NewAppointmentSheet envia payload.clientId quando um cliente é escolhido (linha 349), mas o CreateAppointmentServiceRequestDto (appointment.dto.ts:41-80) não tem campo clientId e o controller (appointment.controller.ts:38-53) não o repassa. O campo 'Cliente (opcional)' da modal funciona somente como filtro local de animais — o vínculo atividade↔cliente não é persistido. Se a intenção do produto é registrar o cliente do atendimento, o dado está sendo perdido; se é só filtro, o payload envia lixo.

**Evidência:**

```
NewAppointmentSheet.tsx:349 — if (clientId) payload.clientId = clientId; — vs appointment.controller.ts:38 — const { animals, description, endDate, startDate, type, userId, studFarmId } = body;
```

**Recomendação:** Ou persistir clientId no Appointment (migration + DTO + service), ou remover o campo do payload deixando claro na UI que o cliente é apenas filtro de animais.

**Arquivos relacionados:** `api:src/infra/http/controllers/appointment/dto/appointment.dto.ts (linhas 41-80, DTO sem clientId)` · `api:src/infra/http/controllers/appointment/appointment.controller.ts (linhas 33-56, create sem clientId)`

### 8. [Médio] Botão Salvar da Nova Movimentação fica desabilitado sem categorias, sem explicação clara na modal da home

**Local:** `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx:358` · **Origem:** reportado nos testes manuais

O botão Salvar tem disabled={loading || categories.length === 0} (linha 358). Empresas sem nenhuma categoria de transação cadastrada não conseguem salvar de jeito nenhum — o único aviso é um texto pequeno 'Nenhuma categoria cadastrada. Cadastre em Financeiro → Categorias' (linhas 292-297), embora exista o botão 'Nova' de categoria na própria modal (linhas 267-279). Na Home isso é ainda mais confuso porque o usuário está fora do contexto do Financeiro. Combinado com o required silencioso do valor (achado do CurrencyInput), explica o relato 'não consegue salvar movimentação pela modal da home' — a mesma NewPaymentSheet é usada na home (page.tsx:213-216) e no financeiro (financial/page.tsx:249-253), a diferença é que a da home nem sequer tem onSuccess (nenhum card financeiro atualiza após salvar).

**Evidência:**

```
NewPaymentSheet.tsx:358 — <Button type="submit" disabled={loading || categories.length === 0}>
```

**Recomendação:** Em vez de desabilitar o Salvar, validar no submit com toast explicando; passar onSuccess na home para atualizar os cards financeiros; deixar o CTA 'Nova' categoria mais evidente quando a lista está vazia.

**Arquivos relacionados:** `web:app/(dashboard)/page.tsx (linhas 213-216, NewPaymentSheet sem onSuccess)` · `web:app/(dashboard)/financial/page.tsx (linhas 249-253, com onSuccess)`

### 9. [Baixo] Mensagens de validação da API de atividades vazam em inglês; tradução no front é parcial

**Local:** `api:src/infra/http/controllers/appointment/dto/appointment.dto.ts:30` · **Origem:** achado novo da auditoria

O CreateAppointmentServiceRequestDto usa decorators class-validator sem message customizada (ex.: @IsUUID('4'), @IsNotEmpty em appointment.dto.ts:29-38 e 63-66), gerando erros default em inglês ('animalId must be a UUID', 'userId should not be empty'). O NewAppointmentSheet mantém um dicionário de tradução manual (linhas 28-45) que cobre só 7 mensagens — qualquer outra (ex.: 'appointmentType must be shorter than or equal to 100 characters', erros de animals aninhados com prefixo 'animals.0.') chega crua ao toast. Já o payment.dto.ts tem mensagens em português (linhas 18-67), evidenciando o padrão inconsistente entre módulos. NewPaymentSheet e QuickStartAppointmentSheet exibem err.message sem tradução alguma.

**Evidência:**

```
appointment.dto.ts:30-31 — @IsUUID('4') @IsNotEmpty() animalId!: string; (sem message) vs NewAppointmentSheet.tsx:28-36 — const API_ERROR_TRANSLATIONS: Record<string, string> = { "userId should not be empty": ... }
```

**Recomendação:** Padronizar mensagens em português nos DTOs da API (como payment.dto.ts) e remover o dicionário de tradução frágil do front.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx (linhas 28-45, dicionário parcial de tradução)` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx (linhas 140-146, err.message cru)` · `api:src/infra/http/controllers/finance/dto/payment.dto.ts (linhas 18-67, contra-exemplo já em PT)`

### 10. [Baixo] Listas e dropdowns de cliente não filtram soft delete (deletedAt)

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaClient.repository.ts:128` · **Origem:** achado novo da auditoria

O model Client tem deletedAt para soft delete ('bloqueia o login no app, mas preserva os dados para a gestão dos veterinários no web' — comentário em schema.prisma:1647-1649), porém nenhum método do PrismaClientRepository filtra deletedAt (grep por 'deletedAt' no arquivo retorna zero ocorrências). Consequência: clientes excluídos continuam aparecendo nos dropdowns de criação de Nova Atividade e Nova Movimentação e podem ser vinculados a novos registros. Pode ser intencional para consulta histórica, mas para seleção em formulários de criação tende a confundir; vale confirmar o requisito de produto.

**Evidência:**

```
prismaClient.repository.ts:128-145 — findMany com where contendo apenas companies/nameIds/studFarmId; nenhuma cláusula deletedAt em todo o arquivo.
```

**Recomendação:** Confirmar o requisito; se clientes excluídos não devem ser selecionáveis, adicionar deletedAt: null nos fetch/count usados pelos dropdowns (mantendo-os visíveis apenas em telas de histórico).

**Arquivos relacionados:** `api:prisma/schema.prisma (linhas 1647-1649, comentário do soft delete)`

---

## Calendário e agenda

> O calendário da home e a tela /calendar compartilham os mesmos sheets (RescheduleAppointmentSheet, ReturnAppointmentAnimalSheet) e todos usam um único componente de data/hora (components/ui/date-time-picker.tsx), cujo dropdown de minutos é fixo em 00/15/30/45 — impossível marcar 13:20 em qualquer fluxo (reagendar, retorno, novo atendimento, lembrete, nota). O sintoma "00 vira 50" nasce da combinação desse dropdown com valores semeados fora da grade (ex.: hora atual `new Date()` no retorno/quick start): o select controlado recebe minuto 50/53 sem option correspondente, renderiza vazio e o minuto oculto persiste ao confirmar. Não existe NENHUM fluxo de edição de atendimento/compromisso no web — os modais de detalhes são somente leitura e o NewAppointmentSheet é só criação; o "editar" reportado não é um defeito pontual, é feature ausente. A modal de status sempre abre com "Finalizado" pré-selecionado (não recebe o status atual) e a opção "Reagendado" só muda a data via PUT /appointment/:id — a API ignora o campo status e nunca toca no status dos animais, que continuam "Em andamento" após reagendar. O card de estoque da home descarta o productId no handler onEntry e não passa a prop productId ao AddStockEntrySheet (a tela /stock faz o mesmo fluxo corretamente). Achados extras da mesma classe: reagendar pela modal de status move o atendimento inteiro (todos os animais), falta a opção "Agendado" na modal, e há inconsistência de fuso (brtTime UTC-3 fixo nos cards vs. formatação local nos modais/picker) e data de entrada de estoque exibida no dia anterior.

### 1. [Alto] Dropdown de minutos limitado a 00/15/30/45 em todos os seletores de horário

**Local:** `web:components/ui/date-time-picker.tsx:33` · **Origem:** reportado nos testes manuais

O componente único de data/hora do web define MINUTES = [0, 15, 30, 45]. É impossível marcar horários como 13:20 em qualquer fluxo que usa o componente: reagendar (RescheduleAppointmentSheet), retorno (ReturnAppointmentAnimalSheet e ReturnAppointmentSheet), modal de status (ChangeAppointmentStatusSheet), novo atendimento (NewAppointmentSheet), início rápido (QuickStartAppointmentSheet), lembretes (CreateReminderSheet) e notas (NoteDetailModal). O usuário reportou ver 'só 15/30/45' — o '00' existe no código, mas quando o minuto atual do valor não está na lista o select renderiza vazio (ver achado seguinte), o que explica a percepção.

**Evidência:**

```
const MINUTES = [0, 15, 30, 45].map((m) => ({
  value: m,
  label: String(m).padStart(2, "0"),
}));
```

**Recomendação:** Trocar o dropdown por input livre de minutos (0-59) ou gerar opções de 5 em 5 minutos; alternativamente aceitar digitação HH:mm. Ajuste único no componente corrige todos os fluxos.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/RescheduleAppointmentSheet.tsx` · `web:app/(dashboard)/_components/sheets/ReturnAppointmentAnimalSheet.tsx` · `web:app/(dashboard)/_components/sheets/ReturnAppointmentSheet.tsx` · `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx` · `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx` · `web:app/(dashboard)/_components/sheets/QuickStartAppointmentSheet.tsx` · `web:app/(dashboard)/_components/sheets/CreateReminderSheet.tsx` · `web:app/(dashboard)/notes/_components/NoteDetailModal.tsx`

### 2. [Alto] "00 vira 50": select de minuto controlado com valor fora da grade preserva minuto oculto

**Local:** `web:components/ui/date-time-picker.tsx:312` · **Origem:** reportado nos testes manuais

O select de minutos é controlado por `value={current.getMinutes()}` (linha 313). Quando o valor semeado tem minuto fora de {0,15,30,45} — ex.: ReturnAppointmentAnimalSheet usa `new Date()` +7 dias preservando o minuto do relógio (ex.: 17:50), QuickStartAppointmentSheet usa `new Date().toISOString()` cru, e ChangeAppointmentStatusSheet cai em `""` → agora — nenhuma <option> casa com o valor, o select renderiza VAZIO (selectedIndex -1) e o minuto real (ex.: 50) continua no estado. O usuário escolhe a hora 17, acredita que o minuto é 00 (campo em branco/primeira opção) e confirma: resultado 17:50, exatamente o exemplo reportado. Confirmei que não há nenhuma versão do componente no git com step de 10; a causa do "50" é o vazamento do minuto do relógio/valor original, não um index bug do dropdown.

**Evidência:**

```
<select
  value={current.getMinutes()}
  onChange={(e) => handleMinuteChange(Number(e.target.value))} ... >
  {MINUTES.map((m) => (<option key={m.value} value={m.value}>{m.label} min</option>))}
</select>  // MINUTES = [0,15,30,45]; valor 50 não casa com nenhuma option
```

**Recomendação:** Normalizar o valor semeado para a grade (arredondar minutos) OU, melhor, permitir qualquer minuto (input livre). Também corrigir as sementes: ReturnAppointmentAnimalSheet.defaultReturnDate (linhas 17-22) e QuickStartAppointmentSheet (linhas 36/45) devem zerar/arredondar minutos.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/ReturnAppointmentAnimalSheet.tsx` · `web:app/(dashboard)/_components/sheets/QuickStartAppointmentSheet.tsx` · `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx`

### 3. [Alto] Impossível editar atendimento ou compromisso pessoal pelo calendário (feature ausente)

**Local:** `web:app/(dashboard)/calendar/_components/CommitmentDetailsModal.tsx:13` · **Origem:** reportado nos testes manuais

Não existe fluxo de edição em lugar nenhum do web. No calendário da home (DashboardHomeDayAgenda, DashboardHomeMonthCalendar) e na tela /calendar (CalendarMain), as únicas ações são Reagendar, Retorno e Ver detalhes. O AppointmentDetailsModal e o CommitmentDetailsModal são somente leitura (o próprio comentário diz 'somente leitura'); o NewAppointmentSheet só cria (props: initialStart/initialEnd, sem prop de appointment para edição). O RescheduleAppointmentSheet permite mudar apenas data e descrição — o TÍTULO do compromisso é recombinado do valor antigo (linhas 95-99) e não é editável; tipo de atendimento, animais, propriedade e responsável não podem ser alterados. A API suporta edição completa (PUT /appointment/:id aceita description, dates, type, userId, studFarmId, animals — appointment.controller.ts:58-86), então a lacuna é 100% frontend.

**Evidência:**

```
/**
 * Modal de detalhes de um compromisso pessoal (type ACTIVITY) — somente
 * leitura, espelhando o modal de detalhes do atendimento. ... */
// Únicos botões: Reagendar (linha 74-83) e Fechar (84-86)
```

**Recomendação:** Criar um sheet de edição (ou modo edit no NewAppointmentSheet recebendo o appointment) acionável pelos modais de detalhes da home e do /calendar, chamando o PUT /appointment/:id já existente. Para compromissos, permitir editar título + descrição + data.

**Arquivos relacionados:** `web:app/(dashboard)/calendar/_components/AppointmentDetailsModal.tsx` · `web:app/(dashboard)/calendar/_components/CalendarMain.tsx` · `web:app/(dashboard)/_components/DashboardHomeDayAgenda.tsx` · `web:app/(dashboard)/_components/DashboardHomeMonthCalendar.tsx` · `web:app/(dashboard)/_components/sheets/NewAppointmentSheet.tsx` · `api:src/infra/http/controllers/appointment/appointment.controller.ts`

### 4. [Alto] Modal de alterar status sempre abre com "Finalizado" pré-selecionado, não com o status atual

**Local:** `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:83` · **Origem:** reportado nos testes manuais

ChangeAppointmentStatusSheet inicializa `useState<StatusOption>("FINISHED")` e o useEffect de abertura força `setSelected("FINISHED")` a cada open. O componente nem possui prop para receber o status atual, e o chamador (ServicesTable.openStatus, linha 301-310) tem `row.status` disponível mas não o repassa. Risco real: usuário abre a modal de um atendimento 'Agendado', clica Salvar sem reparar e finaliza o atendimento por engano (default FINISHED + submit = PUT /appointment-animal com status FINISHED).

**Evidência:**

```
useEffect(() => {
    if (open) {
      setSelected("FINISHED");
      setRescheduleDate(currentStartDate ?? "");
```

**Recomendação:** Adicionar prop `currentStatus` ao sheet, pré-selecionar com ela no useEffect e repassá-la em ServicesTable (openStatus já tem row.status).

**Arquivos relacionados:** `web:app/(dashboard)/services/_components/ServicesTable.tsx`

### 5. [Alto] Reagendar pela modal de status não volta o status do animal para "Agendado"

**Local:** `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:106` · **Origem:** reportado nos testes manuais

Na opção "Reagendado" da modal, o front envia apenas `PUT /appointment/{id}` com startDate/endDate/description (linhas 106-110). Do lado da API, `appointmentService.edit` atualiza somente os campos do appointment e nunca toca no status dos AppointmentAnimal — inclusive DESTRUTURA o parâmetro `status` (linha 104 do service) e nunca o usa. Resultado: um animal 'Em andamento' reagendado para outra data continua 'Em andamento' (e a opção chamada 'Reagendado' também nunca grava RESCHEDULED). A API já tem o endpoint certo para a correção: PUT /appointment-animal/:id aceita status 'PENDING' (appointmentAnimal.controller.ts:9,30-36).

**Evidência:**

```
await PutAPI(`/appointment/${appointmentId}`, {
          startDate: rescheduleDate,
          endDate: rescheduleDate,
          description: descDraft,
        });  // nenhum update de status; API edit() ignora até o campo status (appointment.service.ts:96-143)
```

**Recomendação:** Após o PUT da data, enviar PUT /appointment-animal/{appointmentAnimalId} com status 'PENDING' (ou exibir confirmação 'voltar para Agendado?'). Na API, aplicar o campo `status` recebido em edit() ou removê-lo da assinatura para não enganar.

**Arquivos relacionados:** `api:src/domain/application/services/appointment/services/appointment.service.ts` · `api:src/infra/http/controllers/appointment/appointmentAnimal.controller.ts`

### 6. [Alto] Reagendar pela modal de status move o atendimento INTEIRO, mesmo agindo sobre um animal

**Local:** `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:100` · **Origem:** achado novo da auditoria

A modal de status é aberta por linha de ANIMAL (recebe appointmentAnimalId), mas a opção 'Reagendado' faz PUT /appointment/{appointmentId}, mudando a data do atendimento inteiro — todos os animais vão junto, sem aviso. Isso contradiz o comportamento cuidadoso do RescheduleAppointmentSheet, que em atendimentos multi-animal usa o endpoint de split (POST /appointment/:id/reschedule) para mover só os animais selecionados. Cenário: atendimento com 3 animais, usuário reagenda o animal A pela tabela de atendimentos → os 3 animais mudam de data silenciosamente.

**Evidência:**

```
if (selected === "RESCHEDULED") {
        ...
        await PutAPI(`/appointment/${appointmentId}`, {
          startDate: rescheduleDate, ... });  // appointmentAnimalId só é usado no ramo FINISHED/IN_PROGRESS (linha 113)
```

**Recomendação:** Quando o atendimento tiver mais de um animal ativo, usar o fluxo de split (appointmentService.rescheduleSplit, já usado no RescheduleAppointmentSheet) ou abrir o RescheduleAppointmentSheet no lugar; no mínimo avisar que todos os animais serão movidos.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/RescheduleAppointmentSheet.tsx` · `api:src/domain/application/services/appointment/services/appointment.service.ts`

### 7. [Alto] Entrada de estoque registrada hoje aparece com data de ONTEM na tabela de movimentações

**Local:** `web:app/(dashboard)/_components/sheets/stock/AddStockEntrySheet.tsx:94` · **Origem:** achado novo da auditoria

AddStockEntrySheet guarda a data como 'yyyy-MM-dd' e envia `new Date(date).toISOString()` (linha 94) — 'yyyy-MM-dd' é interpretado como MEIA-NOITE UTC. A StockMovementsTable exibe com `new Date(iso).toLocaleDateString('pt-BR')` no fuso local (linhas 39-46): em UTC-3, '2026-07-30T00:00:00.000Z' vira 29/07/2026. Toda entrada registrada exibe o dia anterior. Mesma classe de bug de data/fuso dos achados do calendário.

**Evidência:**

```
await PostAPI("/product-stock", {
        productId,
        quantity,
        date: new Date(date).toISOString(),  // date = "yyyy-MM-dd" → meia-noite UTC
      });
// StockMovementsTable.tsx:39-46 formata em fuso local → dia anterior em UTC-3
```

**Recomendação:** Construir a data no fuso correto antes de serializar (ex.: `new Date(y, m-1, d, 12)` ou anexar 'T12:00:00-03:00'), ou exibir com getUTCDate/brtDayKey na tabela de movimentações.

**Arquivos relacionados:** `web:app/(dashboard)/stock/_components/StockMovementsTable.tsx`

### 8. [Médio] Card de estoque da home: botão "Entrada" da linha descarta o produto e abre a modal sem pré-seleção

**Local:** `web:app/(dashboard)/page.tsx:156` · **Origem:** reportado nos testes manuais

DashboardGeneralStockTable chama `onEntry(p.id)` (linha 243) e o próprio JSDoc do componente promete 'já chega com o produto pré-selecionado' (linhas 46-51). Porém a home (app/(dashboard)/page.tsx) ignora o argumento — `onEntry={() => { setStockProductId(null); setSheetStockEntry(true); }}` (linhas 156-159) — e renderiza `<AddStockEntrySheet>` SEM a prop productId (linhas 232-236). O AddStockEntrySheet suporta pré-seleção via prop productId (linhas 19-29, 111-123). A tela /stock faz o fluxo corretamente: `onEntry={(productId) => { setStockProductId(productId); ... }}` e passa `productId={stockProductId}` (stock/page.tsx linhas 81-83 e 114-116).

**Evidência:**

```
onEntry={() => {
              setStockProductId(null);
              setSheetStockEntry(true);
            }}
...
<AddStockEntrySheet
        open={sheetStockEntry}
        onClose={() => setSheetStockEntry(false)}
        onSuccess={onStockRefresh}
      />  // sem productId
```

**Recomendação:** Espelhar a tela /stock: `onEntry={(productId) => { setStockProductId(productId); setSheetStockEntry(true); }}` e passar `productId={stockProductId}` ao AddStockEntrySheet (limpando no onClose).

**Arquivos relacionados:** `web:app/(dashboard)/_components/DashboardGeneralStockTable.tsx` · `web:app/(dashboard)/_components/sheets/stock/AddStockEntrySheet.tsx` · `web:app/(dashboard)/stock/page.tsx`

### 9. [Médio] Modal de status não oferece a opção "Agendado" (PENDING)

**Local:** `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:15` · **Origem:** achado novo da auditoria

As opções da modal são apenas FINISHED, IN_PROGRESS e RESCHEDULED (linhas 15-41). Não há como voltar manualmente um atendimento para 'Agendado' (PENDING) — por exemplo, um atendimento marcado como 'Em andamento' ou 'Finalizado' por engano. A API aceita PENDING no PUT /appointment-animal/:id (appointmentAnimal.controller.ts linha 9: status?: 'PENDING' | 'IN_PROGRESS' | 'FINISHED'), então é só limitação de UI.

**Evidência:**

```
type StatusOption = "FINISHED" | "IN_PROGRESS" | "RESCHEDULED";
```

**Recomendação:** Incluir a opção 'Agendado' (PENDING) na lista, enviando-a pelo mesmo PUT /appointment-animal.

**Arquivos relacionados:** `api:src/infra/http/controllers/appointment/appointmentAnimal.controller.ts`

### 10. [Médio] API: appointmentService.edit destrutura `status` e nunca aplica

**Local:** `api:src/domain/application/services/appointment/services/appointment.service.ts:104` · **Origem:** achado novo da auditoria

O método edit (PUT /appointment/:id) recebe `status` no DTO e o destrutura na assinatura, mas o bloco de atribuições (linhas 118-124) nunca o usa — qualquer status enviado pelo cliente é silenciosamente descartado. Isso impede o frontend de corrigir o bug do reagendamento apenas enviando status no mesmo PUT, e é uma armadilha para futuros desenvolvedores (o contrato sugere que funciona). Além disso, se `animals` for enviado, o edit apaga e recria TODOS os AppointmentAnimal com status PENDING (linhas 128-140), destruindo status/histórico por animal.

**Evidência:**

```
async edit({ AppointmentId, companyId, description, endDate, startDate, type, userId, status, studFarmId, animals }: EditAppointmentServiceRequest) {
    ...
    appointment.companyId = companyId ?? appointment.companyId;
    ... // nenhuma linha usa `status`
    await this.appointmentAnimalRepository.deleteMany({ appointmentId: AppointmentId });
    // recria com status: 'PENDING'
```

**Recomendação:** Aplicar `status` quando enviado (ou removê-lo do DTO/assinatura), e no ramo de `animals` preservar status dos animais existentes em vez de delete+recreate cego.

**Arquivos relacionados:** `api:src/infra/http/controllers/appointment/appointment.controller.ts`

### 11. [Médio] Inconsistência de fuso: cards usam BRT fixo (brtTime) e modais/picker usam fuso do navegador

**Local:** `web:components/ui/date-time-picker.tsx:38` · **Origem:** achado novo da auditoria

O projeto criou lib/brt.ts exatamente para evitar divergência de fuso (o comentário do arquivo documenta o sintoma), e a agenda da home usa brtTime (DashboardHomeDayAgenda linhas 142 e 255). Porém os modais de detalhes e o DateTimePicker formatam no fuso LOCAL do navegador: AppointmentDetailsModal.tsx:75 e CommitmentDetailsModal.tsx:51 usam `format(new Date(startDate), ...)`, RescheduleAppointmentSheet.tsx:125-129 formata 'Data atual' local, e o picker inteiro trabalha com getHours/getMinutes locais. Para usuários fora de UTC-3 (Manaus/Cuiabá UTC-4, Acre UTC-5, viagens), o card mostra 17:00 e a modal de reagendamento mostra/edita 16:00 — mesma classe do sintoma '00 vira 50' na percepção do usuário.

**Evidência:**

```
function parseISOOrDate(value: string): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());  // interpretado no fuso do navegador
  ...
// vs. DashboardHomeDayAgenda.tsx:255: {brtTime(apt.startDate)} // UTC-3 fixo
```

**Recomendação:** Padronizar: modais e picker devem exibir/editar via helpers de lib/brt.ts (brtLocalDate para exibir, e conversão inversa ao salvar), como o próprio comentário de brt.ts recomenda.

**Arquivos relacionados:** `web:lib/brt.ts` · `web:app/(dashboard)/calendar/_components/AppointmentDetailsModal.tsx` · `web:app/(dashboard)/calendar/_components/CommitmentDetailsModal.tsx` · `web:app/(dashboard)/_components/sheets/RescheduleAppointmentSheet.tsx` · `web:app/(dashboard)/_components/DashboardHomeDayAgenda.tsx`

### 12. [Baixo] Fallback incorreto: modal de status envia appointmentId para o endpoint /appointment-animal

**Local:** `web:app/(dashboard)/_components/sheets/ChangeAppointmentStatusSheet.tsx:113` · **Origem:** achado novo da auditoria

No ramo FINISHED/IN_PROGRESS, `const targetId = appointmentAnimalId ?? appointmentId` faz PUT `/appointment-animal/{appointmentId}` quando o id do animal não veio — o endpoint espera id de AppointmentAnimal, então a chamada falha (recurso não encontrado) ou, pior, poderia atingir registro errado. Hoje o ServicesTable sempre passa appointmentAnimalId, mas o fallback é uma bomba latente para novos chamadores.

**Evidência:**

```
const targetId = appointmentAnimalId ?? appointmentId;
        await PutAPI(`/appointment-animal/${targetId}`, {
          status: selected,
        });
```

**Recomendação:** Remover o fallback: exigir appointmentAnimalId para os status por-animal e desabilitar o submit quando ausente.

**Arquivos relacionados:** `api:src/infra/http/controllers/appointment/appointmentAnimal.controller.ts`

---

## Financeiro e faturas

> A tela Financeiro (web) tem UI bem acabada, mas vários fluxos quebram na fronteira front↔API. Todos os 5 bugs reportados foram confirmados com causa raiz: (1) o filtro pessoal/profissional envia `scope` que a API nem lê — o campo não existe no DTO, no service nem no banco, e o mesmo dado coletado no formulário de criação é descartado; (2) o filtro de datas usa `lte` com meia-noite UTC do dia final (prismaPayment.repository.ts:122-131), excluindo registros do último dia porque as parcelas são gravadas com hora real; (3) o PDF de fatura (InvoiceDocument) é o único template sem o bloco PdfSignature, apesar de a assinatura já chegar via clinicFromCompany; (4) o 500 do 'Pagar parcelas' não envolve Asaas — a modal faz PUT /transaction/:id com paymentDate 'yyyy-MM-dd', que atravessa a validação sem conversão e é rejeitado pelo Prisma (o próprio NewPaymentSheet tem comentário admitindo essa restrição); (5) cancelar fatura existe pronto na API (PUT /invoice/:id com status CANCELED) mas não tem nenhum botão na UI, que só oferece excluir. No pente fino surgiram achados graves da mesma classe: KPIs/saldo/gráfico calculados só com a 1ª página (10 registros) de um endpoint sempre paginado, vencimento de faturas exibido com 1 dia a menos (formatDate local sem guarda de fuso, vazando para o PDF do cliente), filtro de data unilateral silenciosamente ignorado e cliente obrigatório no formulário que a API joga fora. Completam o quadro inconsistências de formatação (R$ 1.5k com ponto, helpers BRL triplicados) e mensagens de erro em inglês repassadas cruas nos toasts.

### 1. [Crítico] Modal 'Pagar parcelas' → 500 Internal server error: paymentDate 'yyyy-MM-dd' chega como string no Prisma

**Local:** `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx:93` · **Origem:** reportado nos testes manuais

O fluxo web NÃO passa pelo Asaas: a modal faz `PUT /transaction/:id` com `{ status: 'PAID', paymentDate: 'yyyy-MM-dd', bankAccountId }` (PayTransactionSheet.tsx:87-95). Na API, EditTransactionDto.paymentDate é validado com @IsDateString mas NÃO é convertido para Date — o ValidationPipe global usa `transform: true` sem `enableImplicitConversion` e o DTO não tem `@Type(() => Date)` (main.ts:11-15; transaction.dto.ts:161-164). A string 'yyyy-MM-dd' atravessa TransactionService.edit (transaction.service.ts:87 `transaction.paymentDate = paymentDate`) e o mapper (PrismaTransactionMapper.toPrisma repassa `paymentDate` cru) até `prisma.transaction.update` (prismaTransaction.repository.ts:28-31). Prisma exige DateTime ISO-8601 completo e lança PrismaClientValidationError ('Expected ISO-8601 DateTime') → exceção não tratada → 500 'Internal server error', que o front exibe cru no toast (ApiContext.tsx:90-91 + PayTransactionSheet.tsx:104-107). A prova de que o time conhece a restrição está no próprio NewPaymentSheet.tsx:120-121: '// Prisma DateTime exige ISO-8601 com hora; o DateInput só fornece YYYY-MM-DD' — lá converte com toISOString(); na modal de pagar, não. Wallet id não participa deste endpoint (walletId só entra em /transaction/pix e /invoice/:id/pay/*).

**Evidência:**

```
PayTransactionSheet.tsx:87-95 → `const dateStr = paymentDate.trim(); ... await PutAPI(`/transaction/${id}`, { status: "PAID", paymentDate: dateStr, bankAccountId });` — NewPaymentSheet.tsx:120-121 → `// Prisma DateTime exige ISO-8601 com hora; o DateInput só fornece YYYY-MM-DD. firstDueDate: new Date(form.firstDueDate).toISOString(),`
```

**Recomendação:** No front, enviar `new Date(dateStr).toISOString()` (como o NewPaymentSheet já faz). Na API, blindar: adicionar `@Type(() => Date)` nos campos de data dos DTOs de body ou habilitar `enableImplicitConversion`, e converter para Date no controller antes do service (padrão que o invoice.controller.ts:24 já segue com `new Date(body.dueDate)`).

**Arquivos relacionados:** `api:src/infra/http/controllers/finance/dto/transaction.dto.ts (linhas 161-164, EditTransactionDto.paymentDate)` · `api:src/infra/main.ts (linhas 11-15, ValidationPipe sem enableImplicitConversion)` · `api:src/domain/application/services/finance/services/transaction.service.ts (linha 87)` · `api:src/infra/shared/database/prisma/mappers/PrismaTransactionMapper.ts (toPrisma, paymentDate)` · `api:src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts (linhas 28-31)` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx (linhas 120-121, comentário que confirma a causa)` · `web:context/ApiContext.tsx (linhas 90-91)`

### 2. [Crítico] KPIs, saldo do mês e gráfico de evolução calculados só com a 1ª página (10 pagamentos)

**Local:** `web:app/(dashboard)/financial/_utils/useFinancialData.ts:75` · **Origem:** achado novo da auditoria

useFinancialData busca `/payment?...&page=1` uma única vez (useFinancialData.ts:72-79) e calcula os 4 KPIs (Recebido/A receber/Pago/A pagar), o MonthlyBalanceCard e o MonthlyEvolutionChart a partir desse retorno (linhas 94-99). Mas o endpoint /payment é SEMPRE paginado em 10 (prismaPayment.repository.ts:62-63, `skip: (page-1)*10, take: 10`). Qualquer clínica com mais de 10 movimentações no período vê Resumo, Saldo do mês e Evolução mensal com valores subestimados — silenciosamente errados, sem qualquer aviso. É o card mais visível da tela financeiro exibindo número errado.

**Evidência:**

```
useFinancialData.ts:72-76 → `const queryParams = new URLSearchParams({ startDate: ..., endDate: ..., page: "1" });` (uma chamada só) vs prismaPayment.repository.ts:62-63 → `skip: (data.page - 1) * 10, take: 10`.
```

**Recomendação:** Criar endpoint de agregação no backend (soma por status/tipo/mês via groupBy no Prisma) e consumi-lo no hook — nunca somar KPI em cima de lista paginada. Paliativo: iterar todas as páginas no hook.

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts (linhas 62-63)` · `web:app/(dashboard)/financial/_utils/financialSummary.ts (computeFinancialKpis/computeMonthlyEvolution)` · `web:app/(dashboard)/financial/_components/FinancialKPIs.tsx` · `web:app/(dashboard)/financial/_components/MonthlyBalanceCard.tsx` · `web:app/(dashboard)/financial/_components/MonthlyEvolutionChart.tsx`

### 3. [Alto] Filtro 'pessoal/profissional' do card Pagamentos é descartado pela API (campo nem existe no banco)

**Local:** `api:src/infra/http/controllers/finance/payment.controller.ts:75` · **Origem:** reportado nos testes manuais

O front envia `scope=PERSONAL|PROFESSIONAL` no GET /payment, mas o endpoint ignora o parâmetro: o controller destrutura apenas page/query/type/animalId/startDate/endDate (payment.controller.ts:75), o FetchPaymentDto não declara `scope` (payment.dto.ts:127-183) e o model Prisma `Payment` não tem nenhuma coluna de escopo (schema.prisma:506-539, apenas name/amount/type/quantity/etc). Pior: o formulário Nova Movimentação COLETA o campo 'Categoria da movimentação' (PROFESSIONAL/PERSONAL) e o envia no POST /payment (NewPaymentSheet.tsx:65, 125, 209-220), mas CreatePaymentDto também não tem `scope` — o dado que o usuário escolhe é silenciosamente jogado fora. Resultado: selecionar 'Só pessoal' ou 'Só profissional' retorna exatamente a mesma lista. A feature existe só na UI.

**Evidência:**

```
PaymentsTable.tsx:130-131 → `if (scopeFilter === "PERSONAL" || scopeFilter === "PROFESSIONAL") params.set("scope", scopeFilter);` — payment.controller.ts:75 → `const { page, query, type, animalId, startDate, endDate } = queryParams;` (scope nunca é lido). schema.prisma model Payment: nenhum campo scope.
```

**Recomendação:** Adicionar coluna `scope` (enum PERSONAL/PROFESSIONAL) no model Payment + migration, aceitar no CreatePaymentDto/FetchPaymentDto, propagar em PaymentService.create/fetch e no where do PrismaPaymentRepository. Alternativa: remover o filtro e o campo da UI até a feature existir.

**Arquivos relacionados:** `web:app/(dashboard)/financial/_components/PaymentsTable.tsx (linhas 130-131 e 250-259)` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx (linhas 65, 125, 209-220)` · `api:src/infra/http/controllers/finance/dto/payment.dto.ts (FetchPaymentDto, linhas 127-183)` · `api:prisma/schema.prisma (model Payment, linhas 506-539)` · `web:types/dashboard.ts (linha 265, PaymentScope)`

### 4. [Alto] Filtro de datas exclui registros do último dia: endDate vira meia-noite UTC sem fim-do-dia

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts:123` · **Origem:** reportado nos testes manuais

O front manda endDate como 'YYYY-MM-DD' (fmtDate em page.tsx:43-45; DateInput do PaymentsTable). Na API, `getTransactionDateFilter` faz `const end = new Date(endDate)` e usa `lte: end` (prismaPayment.repository.ts:122-131) — ou seja, o corte é 00:00:00 UTC do dia final. Como as parcelas são gravadas com hora real (NewPaymentSheet.tsx:121 envia `new Date(form.firstDueDate).toISOString()` = 03:00 UTC para BRT, e payment.service.ts:57 propaga via moment), qualquer transação do dia 29 (ex.: 2026-07-29T03:00:00Z) é MAIOR que 2026-07-29T00:00:00Z e fica fora do resultado. Exatamente o sintoma reportado: 'até dia 29' exclui o dia 29. O mesmo padrão `lte: endDate` sem normalizar fim-do-dia existe em /transaction/statistics (prismaTransaction.repository.ts:90-91) e no range custom do hook de KPIs (useFinancialData.ts:56-57, `new Date(params.endDate)` = meia-noite UTC do último dia).

**Evidência:**

```
prismaPayment.repository.ts:122-131 → `const end = new Date(endDate); return { OR: [ { paymentDate: { not: null, gte: start, lte: end } }, { paymentDate: null, dueDate: { gte: start, lte: end } } ] };` — sem setar 23:59:59.999 nem usar `lt: end + 1 dia`.
```

**Recomendação:** Na API, normalizar o fim do intervalo para fim-do-dia (ex.: `end.setUTCHours(23,59,59,999)` ou `lt: addDays(end,1)`) em prismaPayment.repository.getTransactionDateFilter e em prismaTransaction.getStatistics; no front, opcionalmente enviar endDate já como fim-do-dia ISO.

**Arquivos relacionados:** `web:app/(dashboard)/financial/page.tsx (linhas 43-45, 66-67)` · `web:app/(dashboard)/financial/_utils/useFinancialData.ts (linhas 56-57, 72-76)` · `api:src/infra/shared/database/prisma/repositories/prismaTransaction.repository.ts (linhas 90-91)` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx (linha 121)` · `api:src/domain/application/services/finance/services/payment.service.ts (linha 57)`

### 5. [Alto] PDF 'Exportar fatura' da modal Detalhes da cobrança não renderiza a assinatura do veterinário

**Local:** `web:lib/pdf/InvoiceDocument.tsx:358` · **Origem:** reportado nos testes manuais

O template InvoiceDocument.tsx não contém nenhum bloco de assinatura — o componente `PdfSignature` (definido em lib/pdf/shared.tsx:366) é usado em PrescriptionDocument.tsx:192, ReportDocument.tsx:203 e HealthRecordDocument.tsx:368, mas o InvoiceDocument termina em tabela de itens + total + dados de pagamento + PdfFooter (linhas 236-361), sem receber/renderizar `clinic.signatureUrl`. O dado da assinatura ESTÁ disponível: clinicFromCompany já devolve `signatureUrl: company.signatureUrl ?? settings.signatureDataUrl` (fromCompany.ts:35) e é passado ao doc tanto pela modal Detalhes da cobrança (ViewPaymentSheet.tsx:199-221) quanto pela exportação do card de Faturas (InvoicesTable.tsx:358-390). Ou seja: os dois PDFs de fatura saem sem assinatura, embora receita/laudo/manejo saiam assinados.

**Evidência:**

```
grep por 'PdfSignature|signature' em InvoiceDocument.tsx retorna vazio; o render (linhas 330-359) vai de `totalBand` direto para `<PdfFooter />`. Em contraste, PrescriptionDocument.tsx:192 → `<PdfSignature ... signatureUrl={clinic.signatureUrl} />`.
```

**Recomendação:** Adicionar `<PdfSignature vetName={...} crmv={...} signatureUrl={clinic.signatureUrl} />` antes do PdfFooter no InvoiceDocument (mesmo padrão dos outros documentos). Corrige de uma vez a exportação da modal e a do card de Faturas.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx (linhas 173-232)` · `web:app/(dashboard)/financial/_components/InvoicesTable.tsx (linhas 346-397)` · `web:lib/pdf/fromCompany.ts (linha 35)` · `web:lib/pdf/shared.tsx (linha 366, PdfSignature)` · `web:lib/pdf/PrescriptionDocument.tsx (linha 192, exemplo de uso correto)`

### 6. [Alto] Card de Faturas: não existe botão de cancelar, embora a API suporte e a UI exiba aba/status 'Canceladas'

**Local:** `web:app/(dashboard)/financial/_components/InvoicesTable.tsx:774` · **Origem:** reportado nos testes manuais

As ações por linha da tabela de faturas são apenas 'Gerar PDF', 'Receber pagamento' e 'Excluir' (InvoicesTable.tsx:774-794). Não há nenhuma ação de cancelamento em lugar algum da tela — porém a UI exibe a aba 'Canceladas' com contador (linha 433), o badge 'Cancelada' (STATUS_LABEL/STATUS_COLORS, linhas 74-84) e o resumo soma canceledCount/canceledAmount. A API suporta cancelamento por completo: EditInvoiceDto aceita `status?: 'PENDING'|'PAID'|'CANCELED'` (invoice.dto.ts:92) e InvoiceService.edit aplica `if (data.status !== undefined) invoice.status = data.status` (invoice.service.ts:254) via PUT /invoice/:id (invoice.controller.ts:36-58). Ou seja, é funcionalidade pronta no backend e órfã no frontend — o usuário só consegue excluir (destrutivo) quando queria cancelar (preserva histórico).

**Evidência:**

```
InvoicesTable.tsx:774-794 → `<TableActions>` contém só TableActionButton 'Gerar PDF', TableActionButton 'Receber pagamento' (se status !== PAID) e DeleteActionButton. Nenhum `status: 'CANCELED'` é enviado em lugar algum do arquivo (único PutAPI é o handleMarkPaid, linha 295, com paidAt).
```

**Recomendação:** Adicionar ação 'Cancelar fatura' (para status PENDING) que faça `PutAPI(/invoice/{id}, { status: 'CANCELED' })` com diálogo de confirmação, e opcionalmente 'Reabrir' (voltar para PENDING) nas canceladas.

**Arquivos relacionados:** `api:src/infra/http/controllers/invoice/dto/invoice.dto.ts (linha 92)` · `api:src/domain/application/services/invoice/invoice.service.ts (linha 254)` · `api:src/infra/http/controllers/invoice/invoice.controller.ts (linhas 36-58)`

### 7. [Alto] Vencimento das faturas exibido com 1 dia a menos (off-by-one de fuso) na tabela e no PDF

**Local:** `web:app/(dashboard)/financial/_components/InvoicesTable.tsx:122` · **Origem:** achado novo da auditoria

NewInvoiceSheet envia dueDate como 'yyyy-MM-dd' e a API grava `new Date(body.dueDate)` = meia-noite UTC (invoice.controller.ts:24). Na volta, o InvoicesTable usa um formatDate LOCAL (linhas 122-128) que faz `new Date(iso).toLocaleDateString('pt-BR')` sem a guarda de meia-noite-UTC — em Brasília (UTC-3), '2026-07-29T00:00:00.000Z' vira 28/07/2026. O lib/format.ts:20-43 compartilhado tem exatamente essa proteção (regex utcMidnight) e é usado no card de Pagamentos da MESMA tela — ou seja, Pagamentos mostra a data certa e Faturas mostra um dia a menos. O erro também vaza para o PDF da fatura (InvoicesTable.tsx:364-365 usa o mesmo formatDate local para issueDate/dueDate), imprimindo vencimento errado num documento enviado ao cliente.

**Evidência:**

```
InvoicesTable.tsx:122-128 → `function formatDate(iso: string) { return new Date(iso).toLocaleDateString("pt-BR", {...}); }` — sem tratamento de data-pura, diferente de lib/format.ts:24 → `const utcMidnight = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/.test(s);`.
```

**Recomendação:** Remover o formatDate local do InvoicesTable e importar o de @/lib/format (como o PaymentsTable.tsx:9 já faz).

**Arquivos relacionados:** `api:src/infra/http/controllers/invoice/invoice.controller.ts (linha 24)` · `web:lib/format.ts (linhas 20-43, versão correta não usada)` · `web:app/(dashboard)/financial/_components/InvoicesTable.tsx (linhas 364-365 e 712, usos)`

### 8. [Alto] Cliente escolhido em 'Nova Movimentação' é obrigatório na UI mas descartado pela API

**Local:** `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx:124` · **Origem:** achado novo da auditoria

O NewPaymentSheet bloqueia o submit sem cliente ('Selecione o cliente.', linhas 110-113) e envia `body.clientId` (linha 124), mas CreatePaymentDto não tem clientId (payment.dto.ts:13-78), o controller não repassa (payment.controller.ts:23-49) e o model Payment não tem coluna clientId (schema.prisma:506-539) — o vínculo só existe indiretamente via animal.clientId. Consequência: movimentação criada com cliente mas sem animal perde o vínculo para sempre, e o filtro 'Cliente' do card de Pagamentos (que filtra via animal/appointmentAnimal — prismaPayment.repository.ts:169-176) nunca a encontra. Dado informado pelo usuário é perdido silenciosamente.

**Evidência:**

```
NewPaymentSheet.tsx:110-113 → `if (!form.clientId) { toast.error("Selecione o cliente."); return; }` + linha 124 → `if (form.clientId) body.clientId = form.clientId;` vs CreatePaymentDto sem campo clientId.
```

**Recomendação:** Adicionar clientId opcional ao model Payment + DTO + service, ou remover a obrigatoriedade/campo da UI se o vínculo for sempre via animal.

**Arquivos relacionados:** `api:src/infra/http/controllers/finance/dto/payment.dto.ts (CreatePaymentDto, linhas 13-78)` · `api:src/infra/http/controllers/finance/payment.controller.ts (linhas 23-49)` · `api:prisma/schema.prisma (model Payment, linhas 506-539)` · `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts (linhas 169-176, filtro clientId via animal)`

### 9. [Médio] Fatura aparece como 'Vencida' no próprio dia do vencimento (e a partir das 21h da véspera)

**Local:** `web:app/(dashboard)/financial/_components/InvoicesTable.tsx:131` · **Origem:** achado novo da auditoria

isOverdue compara `new Date(inv.dueDate) < new Date()` (InvoicesTable.tsx:131-133). Como dueDate é meia-noite UTC do dia D, o instante de virada é 21:00 BRT do dia D-1 — a fatura fica marcada 'Vencida' (badge vermelho + aba Vencidas do summary no backend, prismaInvoice.repository.ts:174 `dueDate: { lt: new Date() }`) durante todo o dia do vencimento, quando o cliente ainda está no prazo. Combinado com o off-by-one do display, o usuário vê 'venceu dia 28' numa fatura que vence dia 29 e ainda está no prazo.

**Evidência:**

```
InvoicesTable.tsx:131-133 → `function isOverdue(inv) { return inv.status === "PENDING" && new Date(inv.dueDate) < new Date(); }` com dueDate armazenado como 00:00 UTC.
```

**Recomendação:** Considerar vencida apenas após o fim do dia do vencimento (comparar contra fim-do-dia local do dueDate), no front e no filtro overdue do backend.

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/repositories/prismaInvoice.repository.ts (linha 174, mesma regra no summary/aba overdue)`

### 10. [Médio] Preencher só 'Data início' OU só 'Data fim' no card Pagamentos é silenciosamente ignorado

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts:120` · **Origem:** achado novo da auditoria

A UI permite preencher os dois DateInputs de forma independente (PaymentsTable.tsx:301-314) e envia o que tiver (linhas 132-133), mas o backend descarta o filtro inteiro quando falta uma das pontas: `if (!startDate || !endDate) return undefined;` (prismaPayment.repository.ts:120). O usuário que põe só 'Data início' acha que filtrou e recebe a lista completa, sem nenhum aviso. O mesmo vale para o hook de KPIs (useFinancialData.ts:54 exige ambos para range custom).

**Evidência:**

```
prismaPayment.repository.ts:119-120 → `): Prisma.TransactionWhereInput | undefined { if (!startDate || !endDate) return undefined;`
```

**Recomendação:** Suportar intervalo aberto no repositório (gte sem lte e vice-versa), ou na UI exigir/auto-preencher a outra ponta antes de enviar.

**Arquivos relacionados:** `web:app/(dashboard)/financial/_components/PaymentsTable.tsx (linhas 132-133, 301-314)` · `web:app/(dashboard)/financial/_utils/useFinancialData.ts (linha 54)`

### 11. [Médio] Com filtro de período ativo, status 'Pago' e modais de detalhes/pagar enxergam só as parcelas do período

**Local:** `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts:88` · **Origem:** achado novo da auditoria

Quando há filtro de data, o include de `transactions` no fetch de /payment é filtrado pelo mesmo range (prismaPayment.repository.ts:85-93, `where: transactionDateFilter` — comentário admite que é para o KPI). Efeitos colaterais: (1) derivePaymentStatus considera 'PAID' se TODAS as parcelas retornadas estão pagas (PaymentsTable.tsx:55-60) — um parcelamento de 12x com só a parcela do mês paga aparece como 'Pago' na tabela; (2) a modal 'Detalhes da cobrança' lista apenas as parcelas do período como se fossem todas (ViewPaymentSheet.tsx:317-341, 'paid/total' errado); (3) a modal 'Pagar parcelas' monta pendingTransactions desse mesmo array truncado (PayTransactionSheet.tsx:36-39), escondendo parcelas pendentes fora do período — o usuário não consegue pagá-las por ali e o 'Todas' seleciona um subconjunto.

**Evidência:**

```
prismaPayment.repository.ts:85-93 → `transactions: { where: transactionDateFilter, include: {...} }` + PaymentsTable.tsx:58 → `const allPaid = payment.transactions.every((t) => t.status === "PAID");`
```

**Recomendação:** Retornar as transações completas (ou um agregado paidCount/totalCount calculado sobre todas) e manter o subconjunto do período em campo separado para os KPIs; nas modais, buscar o payment completo por id antes de exibir/pagar.

**Arquivos relacionados:** `web:app/(dashboard)/financial/_components/PaymentsTable.tsx (linhas 55-60)` · `web:app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx (linhas 88-91, 317-341)` · `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx (linhas 36-39)`

### 12. [Médio] Mensagens de erro da API em inglês repassadas cruas nos toasts do financeiro

**Local:** `api:src/infra/shared/handler/error.handler.ts:39` · **Origem:** achado novo da auditoria

O ErrorHandler devolve mensagens em inglês: default lança InternalServerErrorException → 'Internal server error' (error.handler.ts:38-39), ResourceNotFoundError → 'Resource not found' (resourceNotFoundError.ts:5, ainda por cima como 410 Gone), NotAllowedError → 'Not allowed' (notAllowedError.ts:5). O front repassa a message crua: ApiContext lança `new Error(err.message)` (ApiContext.tsx:90-91) e as telas fazem `toast.error(err.message)` — PayTransactionSheet.tsx:104-107 (é daqui que o usuário vê 'Internal server error' ao pagar parcelas), InvoicesTable.tsx:310 e 421, NewPaymentSheet.tsx:96. Usuário final vê jargão em inglês no meio de uma UI 100% pt-BR.

**Evidência:**

```
error.handler.ts:38-39 → `default: throw new InternalServerErrorException(error.message);` (sem message vira 'Internal server error') + PayTransactionSheet.tsx:105-107 → `toast.error(err instanceof Error ? err.message : "Erro ao registrar pagamento.");`
```

**Recomendação:** Padronizar mensagens dos core errors em pt-BR (ou mapear no front um dicionário status→mensagem amigável) e nunca exibir a message de um 500 cru ao usuário.

**Arquivos relacionados:** `api:src/core/errors/errors/resourceNotFoundError.ts (linha 5)` · `api:src/core/errors/errors/notAllowedError.ts (linha 5)` · `web:context/ApiContext.tsx (linhas 90-91)` · `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx (linhas 104-107)` · `web:app/(dashboard)/financial/_components/InvoicesTable.tsx (linhas 309-310)`

### 13. [Médio] Pagamento de várias parcelas em loop sequencial sem atomicidade: falha no meio deixa estado parcial

**Local:** `web:app/(dashboard)/_components/sheets/PayTransactionSheet.tsx:90` · **Origem:** achado novo da auditoria

handleSubmit itera `for (const id of selectedIds) await PutAPI(...)` (PayTransactionSheet.tsx:90-96). Se a 3ª de 5 parcelas falhar (ex.: o 500 do achado do paymentDate), as 2 primeiras já ficaram pagas, o catch mostra só o erro genérico e nem onSuccess nem refresh são chamados — a tabela continua mostrando as parcelas antigas como pendentes até o próximo reload, e o usuário não sabe quais foram efetivadas. Não existe endpoint de baixa em lote na API (transaction.controller.ts só tem PUT unitário).

**Evidência:**

```
PayTransactionSheet.tsx:90-96 → `for (const id of selectedIds) { await PutAPI(`/transaction/${id}`, {...}); }` dentro de um único try; catch único na linha 104.
```

**Recomendação:** Criar endpoint de baixa em lote transacional na API (PUT /transaction/pay-many com $transaction do Prisma) ou, no mínimo, informar quais parcelas foram pagas antes da falha e recarregar a lista mesmo em erro.

**Arquivos relacionados:** `api:src/infra/http/controllers/finance/transaction.controller.ts (linhas 60-90, só update unitário)`

### 14. [Médio] Preset 'Este ano' filtra só até o fim do mês atual (meses futuros do ano ficam de fora)

**Local:** `web:app/(dashboard)/financial/page.tsx:66` · **Origem:** achado novo da auditoria

rangeForPreset calcula o fim do intervalo como `new Date(y, m + 1, 0)` (fim do mês corrente) para TODOS os presets não-custom, inclusive 'year' (page.tsx:66). Com o rótulo 'Este ano', o usuário espera ver o ano inteiro — mas parcelas a vencer de agosto a dezembro somem dos KPIs e da tabela. Também vale notar que 'Trimestre'/'Semestre' na prática significam 'últimos 3/6 meses', o que o rótulo não deixa claro.

**Evidência:**

```
page.tsx:62-67 → `if (preset === "month") start = new Date(y, m, 1); ... else start = new Date(y, 0, 1); const end = new Date(y, m + 1, 0);` — end nunca é 31/12 para o preset 'year'.
```

**Recomendação:** Para preset 'year', usar `end = new Date(y, 11, 31)`; revisar rótulos dos presets ('Últimos 3 meses' em vez de 'Trimestre') se o comportamento rolling for o desejado.

**Arquivos relacionados:** `web:app/(dashboard)/financial/page.tsx (linhas 47-68, rangeForPreset completo)`

### 15. [Baixo] Formatação de R$ inconsistente: helpers duplicados e eixo do gráfico com decimal em ponto ('R$ 1.5k')

**Local:** `web:app/(dashboard)/financial/_components/MonthlyEvolutionChart.tsx:130` · **Origem:** achado novo da auditoria

Três implementações de formatação BRL convivem na mesma tela: lib/format.ts:4-9 (formatCurrency, usada em PaymentsTable/KPIs/MonthlyBalanceCard), um formatBRL local duplicado em InvoicesTable.tsx:115-120, um formatBrl local no NewInvoiceSheet, e Intl inline no tooltip do gráfico (MonthlyEvolutionChart.tsx:41-52). Todas produzem o mesmo output hoje, mas o eixo Y do gráfico usa template manual `R$ ${(v/1000).toFixed(1)}k` (MonthlyEvolutionChart.tsx:130) que gera 'R$ 1.5k' com PONTO decimal — em pt-BR seria 'R$ 1,5 mil'. Também sem separador de milhar nos valores < 1000 do eixo (`R$ ${v}`).

**Evidência:**

```
MonthlyEvolutionChart.tsx:128-132 → `tickFormatter={(v) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : v > 0 ? `R$ ${v}` : "R$ 0"}`
```

**Recomendação:** Centralizar tudo em formatCurrency de @/lib/format e criar um formatCompactBRL (Intl.NumberFormat com notation:'compact', locale pt-BR) para eixos de gráfico.

**Arquivos relacionados:** `web:app/(dashboard)/financial/_components/InvoicesTable.tsx (linhas 115-120)` · `web:lib/format.ts (linhas 4-9)` · `web:app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx (formatBrl local, uso na linha 597)`

---

## PDFs, laudos e anexos

> Toda a geração de PDF do sistema é client-side no WEB com @react-pdf/renderer, centralizada em lib/pdf (ReportDocument=laudo, PrescriptionDocument=receita, InvoiceDocument=fatura, HealthRecordDocument=manejo sanitário, StockProductsDocument=estoque), montada por app/(dashboard)/services/_data/servicePdf.tsx e baixada via lib/pdf/download.ts; a API não gera PDF nenhum, e o ADM e o APP mobile também não. A exportação hoje são dois botões achatados ("Exportar laudo (PDF)" e "Exportar prescrição (PDF)" em ServiceRecords.tsx:585-610; "Baixar laudo/prescrição" em AppointmentReportModal.tsx:250-272) — não existe dropdown nem seleção de seções, informação que embasa a pergunta à Rafaela. Anexos são N URLs do R2 (upload via POST /file) unidas por "\n" num único campo String que existe sob três nomes (fileUrl/attachmentUrl/resultFileUrl) conforme a entidade — o front manda o mesmo valor sob as 3 chaves contando com o ValidationPipe sem whitelist; no laudo, só anexos-imagem sobrevivem porque a conversão via canvas/image-proxy descarta PDFs silenciosamente (por isso 8 PDFs "somem"). Os bugs mais graves encontrados: 500 na vacinação sem próxima dose (o próprio front injeta data "YYYY-MM-DD" inválida para o Prisma), registros MOCK com dados clínicos falsos entrando no laudo exportado da tela de atendimento, e 6 seções de board sem config de API que salvam apenas em memória (dados clínicos perdidos e ausentes do laudo concluído). As datas em ISO nos laudos vêm de fieldsForRecord (servicePdf.tsx) que imprime o valor cru do registro sem aplicar formatDate nos campos type:"date" — o formato "T12:00:00.000Z" do exemplo do usuário nasce exatamente em boardRecordService.toISODate.

### 1. [Crítico] Vacinação sem próxima dose → 500 Internal server error (front injeta data inválida para o Prisma)

**Local:** `web:services/healthService.ts:75` · **Origem:** reportado nos testes manuais

Quando o veterinário NÃO preenche a próxima dose, ServiceHealthManagement envia nextDate: toISO('') = undefined → '' e o vaccineApi.create 'defaulta' silenciosamente para new Date().toISOString().split('T')[0], ou seja, a string 'YYYY-MM-DD' (sem hora). O DTO da API valida nextDate apenas com @IsString (tipado como Date mas sem @Type/transform), então a string date-only passa a validação e chega crua ao Prisma (vaccine.service.create → PrismaVaccineMapper.toPrisma repassa o valor). O campo vaccines.nextDate é DateTime NOT NULL e o Prisma rejeita string date-only sem hora (exige ISO-8601 completo) → PrismaClientValidationError não tratada → 500, que o front repassa cru ('Internal server error', em inglês) pelo toast (ApiContext lança Error com o message da API). Quando a próxima dose É preenchida, toISO gera ISO completo e funciona — batendo exatamente com o sintoma relatado. O mesmo padrão existe em dewormingApi.create (healthService.ts:123). Bugs correlatos no mesmo endpoint: o PUT /vaccine/:id valida com CreateVaccineDto em vez do EditVaccineDto existente (todos os campos viram obrigatórios na edição; EditVaccineDto é código morto), e o default silencioso registra uma 'próxima dose = hoje' falsa no histórico, poluindo o fetchSoon de vacinas a vencer.

**Evidência:**

```
nextDate: rest.nextDate || new Date().toISOString().split("T")[0],  // healthService.ts:75 → 'YYYY-MM-DD'.  API: vaccine.dto.ts:16-19 @IsString/@IsNotEmpty nextDate!: Date (sem transform p/ Date); PrismaVaccineMapper.ts:27 nextDate: vaccine.nextDate (string repassada); prisma/schema.prisma:1751 nextDate DateTime (NOT NULL). Front repassa erro cru: context/ApiContext.tsx:42-43 throw new Error(err.message ?? ...).
```

**Recomendação:** Tornar nextDate opcional de ponta a ponta (DTO @IsOptional + migração nextDate DateTime? no Prisma), converter strings para Date no service/mapper, remover o default 'hoje' do front, usar EditVaccineDto/EditExamDto nos PUTs e traduzir/normalizar mensagens de erro no ApiContext.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/dto/vaccine.dto.ts (linhas 16-19 e 55-100 EditVaccineDto morto)` · `api:src/infra/http/controllers/animal/vaccine.controller.ts (linha 30, PUT usa CreateVaccineDto; exam.controller.ts:30 idem)` · `api:src/domain/application/services/animal/services/vaccine.service.ts (linhas 23-47, sem conversão de data)` · `api:src/infra/shared/database/prisma/mappers/PrismaVaccineMapper.ts (linhas 21-33)` · `api:prisma/schema.prisma (linha 1751)` · `web:app/(dashboard)/services/_components/ServiceHealthManagement.tsx (linhas 481-494)` · `web:context/ApiContext.tsx (linhas 42-43, erro em inglês repassado cru)`

### 2. [Crítico] Laudo/prescrição exportados da tela de atendimento misturam registros MOCK (dados clínicos falsos) com dados reais

**Local:** `web:app/(dashboard)/services/_components/ServiceRecords.tsx:481` · **Origem:** achado novo da auditoria

Na tela do atendimento, o caminho de EXPORTAÇÃO usa recordsForSection que concatena [...api, ...mock], onde mock cai em MOCK_BOARD_RECORDS quando não há estado local — e MOCK_BOARD_RECORDS contém registros clínicos fictícios para general-service ('Claudicação leve no MAD'), general-test (temperatura 38.2°C etc.) e general-prescription ('Fenilbutazona 2g IV SID por 3 dias. Repouso.'). Ou seja, todo laudo/receita exportado de um atendimento tipo 'Geral' pela aba Atendimento inclui esses dados falsos junto dos reais, num documento assinado pelo veterinário. A tabela na tela NÃO exibe os mocks para seções com API (getRecordsForSection retorna só recordsMap quando há config, linhas 294-303) — a divergência é exclusiva do caminho de exportação. A modal de atendimento concluído usa fetchServiceRecordsMap (só API) e não sofre disso.

**Evidência:**

```
function recordsForSection(sectionKey) { const api = recordsMap[sectionKey] ?? []; const mock = mockRecordsMap[sectionKey] ?? MOCK_BOARD_RECORDS[sectionKey] ?? []; return [...api, ...mock]; }  // ServiceRecords.tsx:481-488. MOCK_BOARD_RECORDS em mock.ts:220-224 inclui 'Fenilbutazona 2g IV SID por 3 dias. Repouso.'
```

**Recomendação:** No recordsForSection da exportação, retornar apenas recordsMap quando getSectionApiConfig(sectionKey) existir (mesma regra da exibição); idealmente remover MOCK_BOARD_RECORDS do runtime de produção.

**Arquivos relacionados:** `web:app/(dashboard)/services/_data/mock.ts (linhas 220-224)` · `web:app/(dashboard)/services/_components/ServiceRecords.tsx (linhas 294-303, exibição correta)`

### 3. [Crítico] 6 seções de atendimento sem config de API salvam só em memória — dados clínicos perdidos e ausentes do laudo concluído

**Local:** `web:services/boardRecordService.ts:45` · **Origem:** achado novo da auditoria

As seções dentistry-prescription (Prescrições de Odontologia!), breeding-gyno, breeding-heat, breeding-hormones, breeding-cover e receptor-post existem nos forms (mock.ts) mas NÃO existem em SECTION_API_CONFIG. getSectionApiConfig retorna null, então handleSubmit cai no ramo mock e o registro fica apenas em estado React (toast 'Registro criado (mock).') — some ao recarregar a página. Pior: no laudo do atendimento concluído, fetchServiceRecordsMap pula seções sem config (if (!getSectionApiConfig(sec.key)) return;), então mesmo antes do refresh esses registros nunca entram no laudo baixado pela modal. Um veterinário que registra a prescrição odontológica ou a cobertura/inseminação de uma matriz perde o dado sem qualquer aviso claro (o sufixo '(mock)' no toast é o único indício). Isso também é uma possível explicação complementar para registros/anexos 'sumindo' do laudo relatado pelo usuário.

**Evidência:**

```
SECTION_API_CONFIG (boardRecordService.ts:45-1320) não possui as chaves 'dentistry-prescription', 'breeding-gyno', 'breeding-heat', 'breeding-hormones', 'breeding-cover', 'receptor-post' — todas presentes em mock.ts (linhas 283, 378, 393, 404, 416, 374). Ramo mock: ServiceRecords.tsx:416-443 ('Registro criado (mock).'). Laudo concluído pula: servicePdf.tsx:125 if (!getSectionApiConfig(sec.key)) return;
```

**Recomendação:** Mapear cada seção órfã para um endpoint real (criar endpoints se necessário — ex.: dentistry-prescription pode usar general-prescription ou ganhar entidade própria) e remover o fallback silencioso para mock em produção, bloqueando o submit com erro claro quando não houver API.

**Arquivos relacionados:** `web:app/(dashboard)/services/_data/mock.ts (linhas 283, 374, 376-426)` · `web:app/(dashboard)/services/_components/ServiceRecords.tsx (linhas 416-443)` · `web:app/(dashboard)/services/_data/servicePdf.tsx (linhas 122-141)` · `api:src/infra/http/controllers/animal/reproduction (controllers existentes para conferir cobertura)`

### 4. [Alto] Datas em ISO string nos PDFs de laudo (e no preview da modal de laudo)

**Local:** `web:app/(dashboard)/services/_data/servicePdf.tsx:67` · **Origem:** reportado nos testes manuais

Os registros de board chegam da API com campos de data em ISO completo (o próprio front grava assim: toISODate produz new Date(apiDate + 'T12:00:00.000Z').toISOString() — exatamente o formato do exemplo do usuário). Na montagem do laudo, fieldsForRecord faz String(record[f.key]) sem verificar f.type === 'date' e sem aplicar formatDate, então campos 'Data', 'Data Previsão Parto' etc. saem como 2026-07-30T12:00:00.000Z no PDF do laudo E no preview 'Dados do laudo' da modal de atendimento concluído (collectReportSections usa a mesma função). A tabela na tela formata corretamente (ServiceRecords.tsx:750-752 aplica formatDate quando f.type==='date'), provando que só o caminho do PDF/preview ficou sem formatação. Afeta todas as seções com campo de data: donor-heat, donor-ovulation, donor-insemination, donor-embryo, receptor-heat, receptor-hormones, receptor-inovulation, receptor-diagnosis-initial/final (date e expectancyDate), receptor-vaccines, receptor-monitoring (Acomp. Gestacional), receptor-final, breeding-*. Os demais PDFs (Invoice, HealthRecord, Prescription, Stock) recebem datas já formatadas pelos chamadores e estão corretos.

**Evidência:**

```
function fieldsForRecord(section, record) { return section.fields.map((f) => ({ label: f.label, value: String((record as Record<string, unknown>)[f.key] ?? "").trim() })); }  // servicePdf.tsx:67-75 — nenhum tratamento para f.type === 'date'. Origem do formato: boardRecordService.ts:19-23 → return new Date(apiDate + 'T12:00:00.000Z').toISOString();
```

**Recomendação:** Em fieldsForRecord, quando f.type === 'date', aplicar formatDate (lib/format.ts) ao valor; cobre de uma vez o PDF do laudo, a prescrição e o preview da modal.

**Arquivos relacionados:** `web:services/boardRecordService.ts (linhas 19-23 toISODate)` · `web:app/(dashboard)/services/_components/ServiceRecords.tsx (linhas 748-753, tabela formata certo)` · `web:app/(dashboard)/services/_components/AppointmentReportModal.tsx (linhas 214-226, preview exibe f.value cru)` · `web:app/(dashboard)/services/_data/mock.ts (linhas 316-374, campos type: 'date')`

### 5. [Alto] Anexos em PDF são descartados silenciosamente na geração do laudo (8 PDFs viram 0/1)

**Local:** `web:app/(dashboard)/services/_data/servicePdf.tsx:87` · **Origem:** reportado nos testes manuais

Os anexos de um registro são convertidos para imagem antes de entrar no laudo: recordImageDataUrls chama imageUrlToPngDataUrl para cada URL e filtra os nulls sem avisar. A conversão carrega a URL num <img> via /api/image-proxy e desenha em canvas — o image-proxy responde 415 para qualquer content-type que não comece com 'image/' (route.ts:28-30) e um <img> não decodifica PDF de qualquer forma, então TODO anexo PDF vira null e some do laudo. Só sobrevivem anexos que são imagens (por isso dos 8 PDFs do alazão castrado 'apareceu só 1' — o que aparece é apenas o que era imagem/convertível). O mesmo padrão existe no PDF de manejo sanitário: imageAttachments filtra explicitamente para PNG/JPG (HealthRecordDocument.tsx:114-122, comentário 'Outros anexos (PDF, webp, etc.) são ignorados aqui'). Não há merge de PDFs anexados nem página de links no documento final, e o usuário não recebe nenhum aviso de que anexos foram omitidos.

**Evidência:**

```
async function recordImageDataUrls(record) { const urls = attachmentUrlsForRecord(record); if (urls.length === 0) return []; const results = await Promise.all(urls.map((u) => imageUrlToPngDataUrl(u))); return results.filter((x): x is string => !!x); }  // + image-proxy/route.ts:28-30: if (!contentType.startsWith("image/")) { return new Response("O recurso não é uma imagem.", { status: 415 }); }
```

**Recomendação:** Curto prazo: listar no laudo os anexos não-imagem como bloco 'Anexos do atendimento' com nome do arquivo (fileNameFromUrl) e avisar o usuário quando anexos forem omitidos. Médio prazo: mesclar PDFs anexados ao laudo (ex.: pdf-lib no client, ou gerar o laudo na API com merge).

**Arquivos relacionados:** `web:lib/pdf/imageToDataUrl.ts (linhas 11-32, resolve null em erro)` · `web:app/api/image-proxy/route.ts (linhas 28-30, 415 para não-imagem)` · `web:lib/pdf/HealthRecordDocument.tsx (linhas 109-123, filtro PNG/JPG)` · `web:lib/pdf/ReportDocument.tsx (linhas 169-180, renderiza só section.images)`

### 6. [Alto] PDF de fatura exportada não inclui a assinatura do veterinário

**Local:** `web:lib/pdf/InvoiceDocument.tsx:236` · **Origem:** reportado nos testes manuais

InvoiceDocument monta o PDF da fatura com cabeçalho, itens, total, dados de pagamento e rodapé — mas não importa nem renderiza PdfSignature, e ignora clinic.signatureUrl (que já chega via clinicFromCompany, o mesmo helper usado pelos outros documentos). Laudo, receita e manejo sanitário têm assinatura (PdfSignature em shared.tsx:366-405, usado em ReportDocument.tsx:203-207); a fatura é o único documento oficial sem. Afeta os três pontos de exportação: InvoicesTable.handleExportPdf, NewInvoiceSheet e ViewPaymentSheet.

**Evidência:**

```
return (<Document title={`Fatura ${invoice.number}`} ...> <Page ...> ... <PdfFooter /> </Page></Document>);  // arquivo inteiro (208-362) não referencia PdfSignature nem clinic.signatureUrl; imports (linhas 12-17) trazem só PdfFooter/fontes.
```

**Recomendação:** Adicionar <PdfSignature veterinarianName={...} crmv={...} signatureUrl={clinic.signatureUrl} /> ao InvoiceDocument (e aumentar paddingBottom da página para a assinatura fixa, como no PdfShell que usa 105).

**Arquivos relacionados:** `web:lib/pdf/shared.tsx (linhas 366-405, PdfSignature pronto)` · `web:app/(dashboard)/financial/_components/InvoicesTable.tsx (linhas 346-397)` · `web:app/(dashboard)/_components/sheets/NewInvoiceSheet.tsx (linha 351)` · `web:app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx (linha 200)`

### 7. [Alto] Arquitetura de anexos frágil: N URLs em um campo String com 3 nomes diferentes ('Refatorar anexos')

**Local:** `web:app/(dashboard)/services/_components/ServiceRecords.tsx:375` · **Origem:** reportado nos testes manuais

Não existe tabela/entidade de Anexo. Cada upload vai para o R2 via POST /file e a URL é guardada num campo String da própria entidade clínica — que se chama fileUrl em ~40 modelos, resultFileUrl em Exam e attachmentUrl em nenhum (o nome só existe no front). Múltiplos arquivos são unidos por '\n' numa única string (MultiFileUpload → urls.join('\n') em ServiceRecords.tsx:936). Como o front não sabe qual nome cada entidade usa, envia o MESMO valor sob as três chaves e conta com o ValidationPipe sem whitelist para a API ignorar as desconhecidas (comentário explícito no código). Consequências: impossibilidade de metadados por arquivo (nome original, tipo, tamanho, ordem), risco de corrupção se uma URL contiver quebra de linha, leitura defensiva tripla espalhada por todo o código (attachmentUrl ?? fileUrl ?? resultFileUrl em pelo menos 4 lugares), e a geração de PDF precisa adivinhar o tipo do arquivo pela extensão. É a causa estrutural dos anexos 'sumindo' nos laudos.

**Evidência:**

```
// Anexo único — propagado para o body sob as três chaves possíveis no back (`fileUrl`, `attachmentUrl`, `resultFileUrl`). A API ignora chaves desconhecidas (ValidationPipe sem `whitelist`), então é seguro mandar todas; quem tiver o campo no schema persiste.  (ServiceRecords.tsx:375-388) + onChange={(urls) => setFormData((p) => ({ ...p, attachmentUrl: urls.join("\n") }))} (linha 936) + prisma/schema.prisma: fileUrl String? em ~40 modelos, resultFileUrl String? (linha 1736).
```

**Recomendação:** Criar tabela Attachment (id, url, fileName, mimeType, size, ownerType/ownerId ou FKs específicas) com migração dos campos atuais (split por '\n'); expor na API como array; unificar o nome do campo na resposta HTTP durante a transição.

**Arquivos relacionados:** `web:services/healthService.ts (linhas 25-42, pickAttachment/withAttachment)` · `web:services/boardRecordService.ts (linhas 1352-1362, leitura tripla no fetch)` · `web:lib/upload.ts (uploadFile → POST /file, R2)` · `api:prisma/schema.prisma (linhas 604-1782, dezenas de fileUrl String?)` · `api:src/infra/main.ts (linhas 12-15, ValidationPipe sem whitelist)`

### 8. [Alto] Diagnóstico Inicial e Diagnóstico Final da receptora leem/gravam o mesmo endpoint sem discriminador — registros duplicados no laudo

**Local:** `web:services/boardRecordService.ts:822` · **Origem:** reportado nos testes manuais

receptor-diagnosis-initial e receptor-diagnosis-final apontam ambos para path 'reproduction-receptor-diagnosis' com o mesmo fetchKey 'reproductionReceptorDiagnosiss', e nem o buildCreateBody nem o DTO da API têm qualquer campo que diferencie inicial de final. Resultado: os mesmos registros aparecem nas DUAS seções (tela e laudo/preview), e um diagnóstico criado como 'Inicial' também aparece como 'Final'. No laudo de reprodução de receptora — o caso do acompanhamento gestacional citado pelo usuário — isso gera seções duplicadas com datas em ISO (ver achado de datas).

**Evidência:**

```
"receptor-diagnosis-initial": { path: "reproduction-receptor-diagnosis", fetchKey: "reproductionReceptorDiagnosiss", ... }  (linhas 822-865) e "receptor-diagnosis-final": { path: "reproduction-receptor-diagnosis", fetchKey: "reproductionReceptorDiagnosiss", ... } (linhas 866-909) — nenhum campo 'stage/type' no body; reproductionReceptorDiagnosis.dto.ts não contém discriminador (grep por initial|final|type sem resultados).
```

**Recomendação:** Adicionar um campo discriminador (ex.: stage: 'INITIAL'|'FINAL') na entidade/DTO e filtrar por ele no fetch de cada seção; ou unificar em uma seção só no form.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/dto/reproduction/reproductionReceptorDiagnosis.dto.ts` · `web:app/(dashboard)/services/_data/mock.ts (linhas 369-370, duas seções distintas no form)`

### 9. [Alto] Atendimento 'Reprodução' de animal castrado gera laudo vazio na modal de concluído (sem aviso)

**Local:** `web:app/(dashboard)/services/_data/servicePdf.tsx:44` · **Origem:** reportado nos testes manuais

getServiceSections deriva as seções do gender do animal; para CASTRATED, getReproductionSubTypeFromGender retorna null e as seções ficam []. Na tela do atendimento há um aviso amigável (ServiceRecords.tsx:531-547 'Animal sem categoria reprodutiva válida'), mas a modal 'Laudo do atendimento' de um atendimento concluído usa o mesmo getServiceSections e simplesmente mostra 'Nenhum registro de laudo neste atendimento' com o botão 'Baixar laudo (PDF)' habilitado — baixando um laudo sem nenhuma seção, mesmo que registros e anexos tenham sido criados quando o animal tinha outra categoria (ou via papel trocado no atendimento). Relaciona-se diretamente ao caso do alazão castrado do usuário: registros/anexos existentes ficam invisíveis no laudo porque a lista de seções sai vazia para o gender atual.

**Evidência:**

```
case "Reprodução": { const sub = getReproductionSubTypeFromGender(service.animal.gender); return sub ? REPRODUCTION_SECTIONS[sub] : []; }  // servicePdf.tsx:50-53; mock.ts:40-49 default: return null para CASTRATED. AppointmentReportModal.tsx:263-271 mantém 'Baixar laudo (PDF)' habilitado mesmo com reportSections vazio.
```

**Recomendação:** No laudo de Reprodução, buscar registros em TODAS as sub-seções de reprodução (ou persistir o papel usado no atendimento) em vez de derivar apenas do gender atual; e desabilitar/alertar o download quando não houver seção aplicável.

**Arquivos relacionados:** `web:app/(dashboard)/services/_data/mock.ts (linhas 40-49)` · `web:app/(dashboard)/services/_components/ServiceRecords.tsx (linhas 205-216 e 531-547)` · `web:app/(dashboard)/services/_components/AppointmentReportModal.tsx (linhas 75-100, 263-271)`

### 10. [Alto] Edição de vacina e exame usa DTO de criação no PUT — edição parcial falha com 400 de campos 'obrigatórios'

**Local:** `api:src/infra/http/controllers/animal/vaccine.controller.ts:30` · **Origem:** achado novo da auditoria

PUT /vaccine/:id e PUT /exam/:id validam o body com CreateVaccineDto/CreateExamDto em vez dos EditVaccineDto/EditExamDto que existem no mesmo arquivo (código morto). Como o Create exige name, date, nextDate, location e animalId (@IsNotEmpty), qualquer edição que omita um deles — ex.: editar a vacina limpando a próxima dose, caso em que o front envia nextDate: undefined (toISO('') → undefined, removido do JSON) — é rejeitada com mensagens de validação, impedindo remover a próxima dose de uma vacina existente. Deworming usa o EditDewormingDto corretamente (deworming.controller.ts:29), provando que o padrão certo existe no projeto.

**Evidência:**

```
@Put(':id') async update(@Body() body: CreateVaccineDto, @Param('id') id: string) { ... }  // vaccine.controller.ts:29-46; EditVaccineDto definido e nunca usado (vaccine.dto.ts:55-100); exam.controller.ts:30 idem (CreateExamDto); front: ServiceHealthManagement.tsx:470-478 envia nextDate: toISO(formData.nextDate) (undefined quando vazio).
```

**Recomendação:** Trocar o @Body() dos PUTs para os Edit*Dto existentes e permitir nextDate null explícito para 'remover próxima dose'.

**Arquivos relacionados:** `api:src/infra/http/controllers/animal/exam.controller.ts (linha 30)` · `api:src/infra/http/controllers/animal/dto/vaccine.dto.ts (linhas 55-100)` · `api:src/infra/http/controllers/animal/deworming.controller.ts (linha 29, padrão correto)` · `web:app/(dashboard)/services/_components/ServiceHealthManagement.tsx (linhas 470-478)`

### 11. [Médio] Modal 'Laudo do atendimento' (concluído) não pré-visualiza os arquivos anexados

**Local:** `web:app/(dashboard)/services/_components/AppointmentReportModal.tsx:204` · **Origem:** reportado nos testes manuais

A modal de atendimento concluído monta o preview com collectReportSections, que é documentada como 'somente texto, sem imagens' e nem popula ReportSection.images; a renderização da modal itera apenas section.fields (dl/dt/dd) — nenhum thumb, link ou lista de anexos aparece, mesmo o registro tendo attachmentUrl com N arquivos. O veterinário só descobre os anexos baixando o PDF (onde PDFs anexados também somem, ver achado anterior) ou reabrindo o atendimento.

**Evidência:**

```
// servicePdf.tsx:150-153: /** Seções do laudo (somente texto, sem imagens) — usado para o preview na modal. */ export function collectReportSections(...)  // AppointmentReportModal.tsx:214-226 renderiza apenas section.fields; não há uso de attachmentUrl/MediaThumb na modal.
```

**Recomendação:** No fetch da modal, extrair attachmentUrl/fileUrl/resultFileUrl de cada registro (splitAttachments) e renderizar MediaThumb por seção, como já é feito na tabela de ServiceRecords (linhas 755-765).

**Arquivos relacionados:** `web:app/(dashboard)/services/_data/servicePdf.tsx (linhas 150-177)` · `web:components/ui/file-upload.tsx (MediaThumb, linhas 313-352 — componente pronto para isso)`

### 12. [Médio] Tela/fluxo de atendimento concluído: botão do olho com tooltip 'Ver detalhes' abre o laudo (label não descreve a ação)

**Local:** `web:app/(dashboard)/services/_components/ServicesTable.tsx:347` · **Origem:** reportado nos testes manuais

Não encontrei um botão com texto literalmente trocado na tela de atendimento concluído; o candidato mais forte para o reporte do usuário é o padrão da listagem de Atendimentos: para linhas FINISHED, o mesmo ícone de olho com tooltip padrão 'Ver detalhes' (ViewActionButton sem label custom) abre a modal 'Laudo do atendimento', enquanto para linhas abertas ele navega para a tela do atendimento — o comentário do próprio código admite a dualidade. Em ServiceHistory o mesmo ViewActionButton 'Ver detalhes' abre o laudo quando concluído. O usuário espera que o label diga 'Ver laudo' quando a ação é abrir o laudo. Se o reporte se referia a outro botão específico, não localizei label incorreto nos arquivos da tela de concluído (AppointmentReportModal, ServicesTable, services/[id]/page.tsx) — os demais labels conferem com as ações.

**Evidência:**

```
{row.status === "FINISHED" ? (<ViewActionButton onClick={() => openReport(row)} .../>) : (<ViewActionButton href={...} />)}  // ServicesTable.tsx:347-360; ViewActionButton default label = 'Ver detalhes' (table-action-button.tsx:123). ServiceHistory.tsx:281 idem.
```

**Recomendação:** Passar label explícito por status: label="Ver laudo" quando FINISHED e "Abrir atendimento" quando aberto.

**Arquivos relacionados:** `web:components/ui/table-action-button.tsx (linha 123)` · `web:app/(dashboard)/services/_components/ServiceHistory.tsx (linha 281)`

### 13. [Baixo] Card 'Cliente' (meio) da ficha do animal com email/telefone despadronizados

**Local:** `web:app/(dashboard)/clients-equines/animals/[id]/page.tsx:648` · **Origem:** reportado nos testes manuais

Na aba Detalhes da ficha do animal, os cards 'Dados do animal' e 'Propriedade' usam o componente Row (label à esquerda, valor alinhado à direita com justify-between). O card do meio ('Cliente') mistura padrões: email e telefone são linhas com ícone alinhadas à esquerda e sem label, enquanto o CPF logo abaixo usa Row com valor à direita — exatamente o desalinhamento relatado pelo usuário.

**Evidência:**

```
<div className="flex items-center gap-2 text-[var(--dash-text-muted)]"><Mail .../><span className="truncate">{orNotInformed(clientDetails?.email)}</span></div> ... <Row label="CPF" value={...} />  (linhas 648-665) vs Row com 'flex justify-between' (linhas 932-951).
```

**Recomendação:** Padronizar o card Cliente com Row label/valor ('E-mail', 'Telefone') ou aplicar o padrão de ícones aos três cards.

### 14. [Baixo] Mapeamento: como a exportação de laudo funciona hoje (base para a decisão do dropdown)

**Local:** `web:app/(dashboard)/services/_components/ServiceRecords.tsx:585` · **Origem:** reportado nos testes manuais

Situação atual para embasar a conversa com a Rafaela: (1) na tela do atendimento (aba Atendimento), dois botões lado a lado 'Exportar prescrição (PDF)' e 'Exportar laudo (PDF)' (ServiceRecords.tsx:585-610) geram o PDF no navegador via @react-pdf/renderer e disparam download direto (downloadPdf em lib/pdf/download.ts:10-24; existe openPdfInNewTab pronto e não usado, linhas 27-34); (2) na modal de atendimento concluído, botões 'Baixar prescrição (PDF)' e 'Baixar laudo (PDF)' (AppointmentReportModal.tsx:250-272); (3) manejo sanitário tem exportações próprias por escopo (carteira de vacinação, vermifugação, exames — HealthRecordDocument via ServiceHealthManagement.tsx:311-342). Não há dropdown, não há seleção de seções/registros a incluir, não há pré-visualização do PDF antes de baixar e não há opção de compartilhar/abrir em nova aba. Um dropdown único 'Exportar…' (laudo / prescrição / manejo) com preview resolveria a dispersão atual de 6+ botões.

**Evidência:**

```
<Button ... onClick={handleExportPrescription}>...Exportar prescrição (PDF)</Button> <Button ... onClick={handleExportReport}>...Exportar laudo (PDF)</Button>  (ServiceRecords.tsx:585-610); downloadPdf/openPdfInNewTab em lib/pdf/download.ts:10-34.
```

**Recomendação:** Sem correção agora — mapeamento para decisão de UX. Se optarem pelo dropdown, centralizar em um menu 'Exportar' com preview (openPdfInNewTab já existe) e escopos selecionáveis.

**Arquivos relacionados:** `web:lib/pdf/download.ts` · `web:app/(dashboard)/services/_components/AppointmentReportModal.tsx (linhas 250-272)` · `web:app/(dashboard)/services/_components/ServiceHealthManagement.tsx (linhas 311-342)`

---

## App mobile

> O app mobile (Expo/RN) é majoritariamente leitura, com poucos formulários: auth (login/signup/forgot), cadastro de animal, edição de perfil, anotações e o sheet de pagamento de faturas — que é onde a wallet id importa. A wallet id nunca aparece no app: ela vive na Company do backend e chega ao app apenas como o booleano `payable` (calculado como `!!company.walletId` na API), que controla se a UI de PIX/cartão aparece. O fluxo PIX trata bem a ausência de wallet (mensagem PT e tratamento de 404/410/502 no app), mas o fluxo de CARTÃO devolve "Resource not found" (410, inglês) quando a empresa não tem wallet, e o app exibe essa mensagem crua — mesma classe de bug de mensagem em inglês que o usuário achou no web, repetida também no login (senha errada = "Resource not found"), signup (email duplicado = "Resource already exists") e recuperação de senha ("Not allowed"). Achados graves adicionais: o endpoint público de "primeiro acesso" devolve o código de reset de senha no corpo da resposta mediante email+CPF (vetor de tomada de conta), um bug de precedência no mapper faz pagamentos vinculados via AppointmentAnimal perderem o animal (tela "Custos e Pagamentos" do animal fica vazia), e as listas financeiras só buscam a página 1 da API (10 itens) com paginação "Carregar mais" apenas local. Inputs de senha têm olhinho (diferente do web), mas perdem a proteção de autocapitalize quando o olhinho é ativado; o campo de código de recuperação capitaliza a primeira letra e o código gerado é minúsculo, invalidando a digitação. Não há dropdown encadeado cliente→animal no app (o usuário É o cliente); o único encadeamento (categoria→sexo no cadastro de animal) funciona corretamente.

### 1. [Crítico] Código de reset de senha é retornado no corpo da resposta pública mediante email+CPF (tomada de conta)

**Local:** `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts:58` · **Origem:** achado novo da auditoria

POST /client/password-code é público e, quando o body inclui cpf válido, o serviço devolve o código de recuperação diretamente na resposta HTTP ({ code }) em vez de enviá-lo por email. O fluxo 'Primeiro Acesso' do app consome isso (login.tsx recebe res.body.code e troca a senha via PUT). Consequência: qualquer pessoa que saiba email + CPF de um cliente (dados semi-públicos/vazados no Brasil) troca a senha da conta sem nunca acessar o email da vítima — vale para QUALQUER conta, não só primeiro acesso. Agravante: o código também é impresso em console.log no backend ('RECOVERY CODE:'), vazando códigos de reset nos logs do servidor.

**Evidência:**

```
console.log('RECOVERY CODE:', recoverPasswordCode.code); if (cpfTrimmed) { return right({ code: recoverPasswordCode.code }); }  // controller: if (... 'code' in result.value) { return { code: result.value.code }; } // app login.tsx: const code = (res.body as { code?: string })?.code; ... setRecoveryCode(code)
```

**Recomendação:** Nunca devolver o código na resposta. Para o fluxo de primeiro acesso, enviar o código por email/SMS mesmo quando CPF é informado, ou exigir um segredo real (a senha inicial = CPF já permite login normal). Remover o console.log do código.

**Arquivos relacionados:** `api:src/infra/http/controllers/client/recoverClientPasswordCode.controller.ts (linhas 31-33)` · `app:app/(auth)/login.tsx (linhas 112-121)`

### 2. [Alto] Pagamento com cartão sem wallet configurada mostra 'Resource not found' (inglês, HTTP 410)

**Local:** `api:src/domain/application/services/finance/services/transaction.service.ts:270` · **Origem:** reportado nos testes manuais

Quando a empresa emissora não tem walletId, os fluxos de cartão da API (transaction e invoice) retornam ResourceNotFoundError genérico, que o ErrorHandler converte em GoneException('Resource not found'). O app repassa res.body.message cru no toast. O fluxo PIX equivalente tem mensagem em português ('A empresa ainda não possui PIX configurado...') e o app ainda traduz 404/410 no caminho PIX — mas o caminho de cartão não tem nenhum desses tratamentos. O cliente que tenta pagar com cartão uma fatura de empresa sem wallet vê um erro em inglês sem instrução nenhuma. Nota: o app até esconde a UI de pagamento quando payable=false, mas o backend calcula payable no momento da listagem — se a wallet for removida depois, ou em corrida, o usuário cai nesse erro.

**Evidência:**

```
if (!transaction || !client || !creditCard || !company || !company.walletId) { ... return left(new ResourceNotFoundError()); }  // ResourceNotFoundError.constructor: super('Resource not found'); ErrorHandler: case ResourceNotFoundError: throw new GoneException(error.message); App: const msg = (res.body as { message?: string })?.message ?? 'Erro ao processar pagamento'; Toast.show({ type: 'error', text1: msg });
```

**Recomendação:** Nos serviços de cartão (transaction.service.ts existingCreditCard/newCreditCard e invoice.service.ts payExistingCreditCard/payNewCreditCard), separar o caso '!company.walletId' do 'not found' e retornar PaymentError com a mesma mensagem PT usada no PIX. No app, replicar no fluxo de cartão o tratamento de 404/410/502 que já existe em handleGeneratePixQr.

**Arquivos relacionados:** `api:src/domain/application/services/finance/services/transaction.service.ts (linhas 270-282 e 331-341)` · `api:src/domain/application/services/invoice/invoice.service.ts (linhas 389-390 e 442-443)` · `api:src/core/errors/errors/resourceNotFoundError.ts` · `api:src/infra/shared/handler/error.handler.ts (linhas 22-23)` · `app:components/sheets/InvoicePaymentSheet.tsx (linhas 325-328 e 405-408)`

### 3. [Alto] Login com senha errada exibe 'Resource not found' em inglês

**Local:** `api:src/domain/application/services/client/services/client.service.ts:209` · **Origem:** reportado nos testes manuais

ClientService.auth retorna ResourceNotFoundError tanto para email inexistente quanto para senha errada (em vez de AuthenticationError, que tem mensagem PT 'E-mail ou senha incorretos.'). O ErrorHandler transforma em 410 Gone com message 'Resource not found', e o login do app prioriza res.body.message sobre o fallback PT ('Email ou senha incorretos.'). Resultado: todo login com credencial errada mostra 'Resource not found' para o usuário. Mesma classe: signup com email/CPF duplicado mostra 'Resource already exists' (409) cru, e reset de senha com código expirado mostra 'Not allowed'.

**Evidência:**

```
if (!passwordMatch) { return left(new ResourceNotFoundError()); }  // login.tsx:86-89: setError((res.body as { message?: string })?.message ?? 'Email ou senha incorretos.');
```

**Recomendação:** No auth, retornar AuthenticationError (já tem mensagem PT). Traduzir as mensagens default de ResourceNotFoundError/ResourceAlreadyExistsError/NotAllowedError para PT na API (afeta os 3 frontends), ou no app deixar de repassar message cru nesses fluxos e usar mensagens locais por status.

**Arquivos relacionados:** `api:src/core/errors/errors/resourceNotFoundError.ts (mensagem 'Resource not found')` · `api:src/core/errors/errors/resourceAlreadyExistsError.ts (mensagem 'Resource already exists')` · `api:src/core/errors/errors/notAllowedError.ts (mensagem 'Not allowed')` · `api:src/domain/application/services/client/services/client.service.ts (linhas 231, 236, 299)` · `app:app/(auth)/login.tsx (linhas 86-89, 176)` · `app:app/(auth)/signup.tsx (linha 98)` · `app:app/(auth)/forgot-password.tsx (linha 78)`

### 4. [Alto] Bug de precedência no mapper: pagamento via AppointmentAnimal perde o animal e some da tela do animal

**Local:** `app:lib/api-mappers.ts:73` · **Origem:** achado novo da auditoria

Em mapClientPayment, a expressão `raw.animal ?? raw.AppointmentAnimal?.animal ? {...} : undefined` é avaliada como `(raw.animal ?? raw.AppointmentAnimal?.animal) ? {...} : undefined`, e o objeto construído lê apenas `raw.animal?.id / raw.animal?.name`. Quando o pagamento vem vinculado via AppointmentAnimal (sem raw.animal direto), o resultado é `animal = { id: undefined, name: undefined }`. Impacto: a tela 'Custos e Pagamentos' do animal filtra `p.animal?.id === id` e nunca casa — esses pagamentos desaparecem da ficha do animal; na aba Finanças o nome do animal aparece como '—'.

**Evidência:**

```
animal: raw.animal ?? raw.AppointmentAnimal?.animal
      ? { id: raw.animal?.id, name: raw.animal?.name }
      : undefined,
```

**Recomendação:** Extrair primeiro: `const a = raw.animal ?? raw.AppointmentAnimal?.animal;` e então `animal: a ? { id: a.id, name: a.name } : undefined`.

**Arquivos relacionados:** `app:app/(animal)/payments.tsx (linha 41: .filter((p) => p.animal?.id === id))` · `app:app/(tabs)/finances.tsx (linha 130)`

### 5. [Alto] Finanças busca só a página 1 da API (10 itens) — 'Carregar mais' pagina apenas localmente

**Local:** `app:app/(tabs)/finances.tsx:30` · **Origem:** achado novo da auditoria

Tanto a aba Finanças quanto 'Custos e Pagamentos' do animal chamam /client-payment?page=1 e /client-invoice?page=1 uma única vez. O backend pagina com take: 10 (prismaPayment.repository). O botão 'Carregar mais' da aba Finanças só aumenta o slice local (page * pageSize) sobre os itens já baixados. Cliente com mais de 10 movimentações (ou 10 faturas) nunca vê as demais, e os totais 'Pendente/Pago' dos StatCards ficam errados por serem calculados só sobre a página 1.

**Evidência:**

```
GetAPI(ApiRoutes.ClientPayment.list + "?page=1"),
          GetAPI(ApiRoutes.ClientInvoice.list + "?page=1"),  // ... const paged = filtered.slice(0, page * pageSize); // backend: take: 10 (prismaPayment.repository.ts:63)
```

**Recomendação:** Fazer 'Carregar mais' incrementar a página da API (o backend já devolve `pages`), ou buscar todas as páginas ao carregar. Para os totais, considerar endpoint de estatísticas agregadas.

**Arquivos relacionados:** `app:app/(animal)/payments.tsx (linhas 26-29)` · `api:src/infra/shared/database/prisma/repositories/prismaPayment.repository.ts (linha 63)`

### 6. [Alto] 'Manter conectado' não tem efeito — sessão é sempre restaurada

**Local:** `app:contexts/SessionContext.tsx:56` · **Origem:** achado novo da auditoria

O checkbox 'Manter conectado' do login grava KEEP_CONNECTED_KEY no SecureStore, mas o efeito de boot do SessionProvider restaura token+usuário incondicionalmente: a chave nunca é lida para decidir se a sessão deve persistir. Usuário que desmarca 'Manter conectado' continua logado ao reabrir o app — funcionalidade prometida na UI que não existe.

**Evidência:**

```
if (storedToken) { setToken(storedToken); ... }  // boot (linhas 50-90) nunca lê KEEP_CONNECTED_KEY; a chave só é escrita no signIn (linha 98): await SecureStore.setItemAsync(KEEP_CONNECTED_KEY, keepConnected ? 'true' : 'false');
```

**Recomendação:** No boot, ler KEEP_CONNECTED_KEY; se 'false', descartar o token armazenado (ou não persistir o token no signIn quando keepConnected=false).

**Arquivos relacionados:** `app:app/(auth)/login.tsx (linhas 313-325, checkbox)`

### 7. [Alto] Código de recuperação: teclado capitaliza a 1ª letra e o código gerado é minúsculo

**Local:** `app:app/(auth)/forgot-password.tsx:131` · **Origem:** achado novo da auditoria

O input 'Código' do forgot-password não define autoCapitalize="none" (default RN = 'sentences', capitaliza a primeira letra). O backend gera o código com charset exclusivamente minúsculo ('abcdefghijklmnopqrstuvwxyz0123456789') e o valida por busca exata (findByCode). Usuário digita o código recebido por email, o teclado transforma 'a1b2c3' em 'A1b2c3' e a validação falha com 'Código inválido ou expirado', sem pista do motivo. Bug relacionado no gerador: `Math.ceil(Math.random()*36)` produz índice 36 (fora do range, charAt devolve '') e nunca produz índice 0 — ~1 a cada 36 caracteres o código sai com menos de 6 caracteres.

**Evidência:**

```
<Input label="Código" placeholder="Digite o código" leftIcon={KeyRound} value={code} onChangeText={setCode} containerClassName="mb-6" />  // sem autoCapitalize; api generateRandomString.ts: const random = Math.ceil(Math.random() * lettersAndNumbers.length); code += lettersAndNumbers.charAt(random);
```

**Recomendação:** Adicionar autoCapitalize="none" e autoCorrect={false} ao input (ou normalizar toLowerCase antes de enviar/validar). No backend, corrigir para Math.floor(Math.random()*length).

**Arquivos relacionados:** `api:src/utils/generateRandomString.ts` · `api:src/domain/application/services/client/services/RecoverClientPasswordCode.service.ts (linha 71, validate)`

### 8. [Médio] Campos de senha perdem autocapitalize/autocorrect quando o 'olhinho' é ativado

**Local:** `app:components/ui/Input.tsx:59` · **Origem:** reportado nos testes manuais

O componente Input tem toggle de visibilidade (olhinho existe — diferente do web), mas implementa secureTextEntry={isPassword && !visible} sem fixar autoCapitalize="none" e autoCorrect={false}. Enquanto oculto, o próprio secureTextEntry inibe a capitalização; ao tocar o olhinho, secureTextEntry vira false e o TextInput volta ao default autoCapitalize='sentences' — a primeira letra digitada com a senha visível é capitalizada e o corretor pode alterar o texto. Afeta todos os campos de senha: login (2 telas internas), signup (senha + confirmação) e forgot-password.

**Evidência:**

```
secureTextEntry={isPassword && !visible}  // nenhum autoCapitalize/autoCorrect é definido para isPassword; toggle nas linhas 65-73
```

**Recomendação:** No Input, quando isPassword: forçar autoCapitalize="none", autoCorrect={false} e textContentType="password" independentemente de visible.

**Arquivos relacionados:** `app:app/(auth)/login.tsx (linhas 304-312, 406-423)` · `app:app/(auth)/signup.tsx (linhas 131-132)` · `app:app/(auth)/forgot-password.tsx (linhas 141-142)`

### 9. [Médio] Formulário de cartão novo sem validação: mês/ano de validade, email e CPF/CNPJ aceitam qualquer valor

**Local:** `app:components/sheets/InvoicePaymentSheet.tsx:355` · **Origem:** reportado nos testes manuais

handlePayWithNewCard só verifica campos não-vazios. expiryMonth aceita '99' (sem range 1-12), expiryYear aceita '0001' ou ano passado, email não é validado por formato, cpfCnpj e número do cartão não têm validação de tamanho/dígito verificador. O erro só aparece após o round-trip ao Asaas, cuja description é repassada crua no toast (InvoicePaymentSheet linhas 405-408) — podendo ser técnica ou em formato não amigável. Mesma classe dos bugs de input do web.

**Evidência:**

```
if (!holderName || !number || !expiryMonth || !expiryYear || !ccv || !name || !email || !cpfCnpj || !postalCode || !addressNumber || !phone) { Toast.show({ type: 'error', text1: 'Preencha todos os campos do cartão e do titular' }); return; }  // única validação; inputs: expiryMonth: t.replace(/\D/g, '').slice(0, 2) (linhas 750-757) sem checar 1-12
```

**Recomendação:** Validar antes do submit: mês 01-12, ano >= atual (e mês/ano não no passado), email por regex, CPF/CNPJ por tamanho (11/14) e número do cartão por tamanho mínimo (13-19 dígitos).

**Arquivos relacionados:** `app:components/sheets/InvoicePaymentSheet.tsx (linhas 747-793, 807-853)` · `api:src/infra/shared/bank/asaas.ts (linhas 148-214, repasse de errors[0].description)`

### 10. [Médio] Usuário com cartão salvo não consegue pagar com um cartão novo

**Local:** `app:components/sheets/InvoicePaymentSheet.tsx:665` · **Origem:** achado novo da auditoria

No método 'card' do sheet de pagamento, o formulário 'Adicionar cartão e pagar' só é renderizado no branch creditCards.length === 0. Se o cliente já tem um ou mais cartões salvos, aparece apenas a lista de cartões existentes + botão de pagar — não há caminho na UI para cadastrar outro cartão (cartão vencido/bloqueado obriga a usar PIX ou não pagar).

**Evidência:**

```
{creditCards.length > 0 ? (
  <>{creditCards.map((card) => (...))}<Button title="Pagar com cartão selecionado" .../></>
) : (
  <>{!showAddCardForm ? (<TouchableOpacity onPress={() => setShowAddCardForm(true)} ...>Adicionar cartão e pagar</TouchableOpacity>) : (formulário)}</>
)}
```

**Recomendação:** Renderizar o botão 'Adicionar cartão' também quando já existem cartões salvos (fora do else).

### 11. [Médio] Data de nascimento do animal aceita datas inexistentes (31/02) e futuras

**Local:** `app:components/sheets/AnimalRegistrationSheet.tsx:42` · **Origem:** reportado nos testes manuais

dateBrToIso valida apenas ranges independentes (dia 1-31, mês 1-12, ano 1900-2100): 31/02/2024 e 30/11/2030 (futuro) passam e são enviados à API como ISO. Data inexistente pode virar data deslocada ou erro no backend; data futura gera idade negativa nas telas que exibem a ficha. Mesma classe do bug de 'datas sem validação' do web.

**Evidência:**

```
if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  return `${yyyy}-${mm}-${dd}`;
```

**Recomendação:** Validar a data real (ex.: construir Date e conferir se dia/mês/ano batem) e rejeitar datas futuras para nascimento.

**Arquivos relacionados:** `app:components/sheets/AnimalRegistrationSheet.tsx (linhas 197-206, uso no submit)`

### 12. [Médio] Telefone em 'Meus dados' sem máscara nem normalização — formato inconsistente no banco

**Local:** `app:app/(tabs)/profile.tsx:306` · **Origem:** achado novo da auditoria

No signup o telefone é mascarado ((11) 99999-9999) e enviado só com dígitos (form.phone.replace(/\D/g,'')). Na edição de perfil, o Input de telefone não tem keyboardType, máscara nem strip de não-dígitos: o valor é enviado exatamente como digitado no PUT /client/:id. O mesmo cliente pode ficar com phone '11999999999' ou '(11) 9 9999-9999' dependendo de onde editou — quebra integrações que dependem do formato (ex.: mobilePhone do Asaas).

**Evidência:**

```
<Input
              label="Telefone"
              value={phone}
              onChangeText={setPhone}
              containerClassName="mb-4"
            />  // handleSave (linhas 82-85): PutAPI(ApiRoutes.Client.update(user.id), { name, phone })
```

**Recomendação:** Reusar a máscara formatPhone do signup no modal 'Meus dados' e enviar apenas dígitos.

**Arquivos relacionados:** `app:app/(auth)/signup.tsx (linhas 49-54 e 82, formatPhone + strip)`

### 13. [Médio] Salvar/excluir anotação falha silenciosamente — nenhum feedback de erro

**Local:** `app:app/(animal)/notes.tsx:79` · **Origem:** achado novo da auditoria

Em notes.tsx, se o POST/PUT/DELETE da anotação retornar status de erro ou lançar exceção, nada acontece: sem toast, sem mensagem. O catch está vazio ('keep modal open on error') e o branch de status != 2xx nem existe. O usuário vê o spinner parar e o modal continuar aberto (ou a anotação continuar na lista após 'Excluir') sem saber que a operação falhou nem por quê.

**Evidência:**

```
if (res.status === 200 || res.status === 204) { await load(); closeModal(); }
      // (sem else) ... } catch {
      // keep modal open on error
    }
```

**Recomendação:** Adicionar Toast de erro nos branches de falha (padrão já usado nas outras telas).

**Arquivos relacionados:** `app:app/(animal)/notes.tsx (linhas 110-117, delete com catch vazio)`

### 14. [Médio] Fatura chega ao app com nome do animal vazio

**Local:** `api:src/infra/http/presenters/clientInvoice.presenter.ts:36` · **Origem:** achado novo da auditoria

O ClientInvoicePresenter serializa animal como { id: invoice.animalId, name: '' } sem resolver o nome. No sheet 'Detalhes da Fatura' isso renderiza um <Text> vazio abaixo da categoria, e na lista de Finanças o nome cai no fallback '—'. O cliente não sabe a qual animal a fatura se refere — informação relevante para decidir pagar.

**Evidência:**

```
animal: invoice.animalId ? { id: invoice.animalId, name: '' } : undefined,  // app InvoicePaymentSheet.tsx:457-461: {selectedInvoice.animal && (<Text ...>{selectedInvoice.animal.name}</Text>)}
```

**Recomendação:** No controller/presenter, resolver o nome do animal (join no fetch de invoices) antes de serializar.

**Arquivos relacionados:** `app:components/sheets/InvoicePaymentSheet.tsx (linhas 457-461)` · `app:app/(tabs)/finances.tsx (linha 130)`

### 15. [Baixo] Logs de debug em produção, incluindo dados de pagamento

**Local:** `app:components/sheets/InvoicePaymentSheet.tsx:149` · **Origem:** achado novo da auditoria

O sheet de pagamento tem ~15 console.log '[PIX DEBUG]' (inclusive logando o body completo das respostas de pagamento) marcados como 'remover depois que resolver'. O backend tem '[PIX BACK DEBUG]' e '[CARTÃO EXISTENTE]/[CARTÃO NOVO]' equivalentes em transaction.service.ts. Além do ruído, vazam payload PIX e metadados de transação nos logs de dispositivo/servidor.

**Evidência:**

```
// [PIX DEBUG] Loga toda vez que pixQrData muda. ... console.log('[PIX DEBUG] pixQrData atualizado', {...})  // e linhas 185-287; api transaction.service.ts:162-207: console.log('[PIX BACK DEBUG] ...')
```

**Recomendação:** Remover os logs de debug ou condicioná-los a __DEV__/nível de log.

**Arquivos relacionados:** `api:src/domain/application/services/finance/services/transaction.service.ts (linhas 162-223, 271-280, 332-339)`

### 16. [Baixo] Valores monetários sem centavos e sem separador de milhar nos totais

**Local:** `app:app/(tabs)/finances.tsx:86` · **Origem:** achado novo da auditoria

Os StatCards de Finanças e da Home usam toFixed(0) (R$ 1234 — arredonda e esconde centavos) e a lista de Finanças mostra item.amount.toFixed(0). Nenhum valor usa separador de milhar nem Intl.NumberFormat pt-BR; dentro do sheet e na ficha do animal usa-se toFixed(2).replace('.', ','), sem milhar. Padrão inconsistente entre telas e valores grandes ficam ilegíveis (R$ 12345).

**Evidência:**

```
value={`R$ ${totalPending.toFixed(0)}`}  // linha 133: R$ {item.amount.toFixed(0)}; index.tsx:134: value={`R$ ${totalPending.toFixed(0)}`}
```

**Recomendação:** Centralizar formatação com Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }) num util e usar em todas as telas.

**Arquivos relacionados:** `app:app/(tabs)/index.tsx (linha 134)` · `app:components/cards/InvoiceCard.tsx (linha 85)` · `app:components/sheets/InvoicePaymentSheet.tsx (linhas 468, 497)`

### 17. [Baixo] Select de Propriedade exibe opção 'Carregando...' selecionável

**Local:** `app:components/sheets/AnimalRegistrationSheet.tsx:342` · **Origem:** achado novo da auditoria

Enquanto /stud-farm/client não responde (ou retorna vazio), o Select de Propriedade recebe options=[{ id: '', name: 'Carregando...' }]. A opção é clicável: o usuário pode 'selecionar' Carregando... (id vazio, não é enviado por ser falsy, mas o campo passa a exibir 'Carregando...' como se fosse a propriedade escolhida). Se o cliente não tem haras, nunca sai de 'Carregando...' — deveria mostrar estado vazio.

**Evidência:**

```
options={studFarms.length > 0 ? studFarms : [{ id: "", name: "Carregando..." }]}
```

**Recomendação:** Usar o prop loading do Select e um estado vazio real ('Nenhuma propriedade cadastrada') em vez de opção fake.

**Arquivos relacionados:** `app:components/ui/Select.tsx (sem suporte a item desabilitado)`

### 18. [Baixo] Wallet id no app: dependência mapeada (referência)

**Local:** `app:data/types.ts:109` · **Origem:** reportado nos testes manuais

Mapeamento solicitado: a wallet id NÃO aparece nem é digitada no app. Ela existe na Company (api:src/domain/enterprise/entities/company.ts) e chega ao app somente como o booleano `payable`: em movimentações via PrismaPaymentDetailsMapper (payable: !!paymentDetails.company.walletId) e em faturas via ClientInvoicePresenter (payable = isPending && !!company?.walletId, resolvida por companyRepository.findById no ClientInvoiceController). No app, ClientPayment.payable (data/types.ts:109-110, mapeado em lib/api-mappers.ts:86) controla se o InvoicePaymentSheet mostra as formas de pagamento (linha 520) ou o aviso 'O pagamento ainda não está disponível' (linhas 512-519). Nos pagamentos efetivos, a wallet entra no split 100% do Asaas (transaction.service/invoice.service). O elo frágil dessa cadeia é o achado nº 1 (cartão sem wallet → 'Resource not found').

**Evidência:**

```
/** Se a empresa que emitiu a fatura tem wallet configurada (chave PIX). Só mostra formas de pagamento quando true. */
  payable?: boolean;
```

**Recomendação:** Nenhuma correção aqui — item de mapeamento. Testar wallet id no app = testar payable=false (aviso âmbar), payable=true + PIX (mensagens já PT) e payable=true→wallet removida + cartão (achado nº 1).

**Arquivos relacionados:** `api:src/infra/shared/database/prisma/mappers/PrismaPaymentDetailsMapper.ts (linha 44)` · `api:src/infra/http/presenters/clientInvoice.presenter.ts (linhas 23-25)` · `api:src/infra/http/controllers/invoice/clientInvoice.controller.ts (linhas 58-71)` · `app:components/sheets/InvoicePaymentSheet.tsx (linhas 512-520)` · `app:lib/api-mappers.ts (linha 86)`

---

## Telas não testadas (varredura)

> As telas não cobertas pela bateria de testes repetem exatamente as classes de bug já conhecidas, com concentração em três problemas sistêmicos. (1) Timezone/off-by-one: vários pontos gravam datas como meia-noite UTC (new Date("yyyy-mm-dd").toISOString()) e exibem com toLocaleDateString local — entradas de estoque, vencimentos de pagamento do atendimento, validade de cupom e vencimentos no financeiro do ADM aparecem um dia antes do escolhido. (2) Erros crus/em inglês: o core da API tem mensagens em inglês ('Resource not found', 'Not allowed', 'Resource already exists') e o ValidationPipe não traduz o class-validator; o web repassa err.message direto ao toast e o ADM exibe res.body.message cru — em ads o ADM chega a mostrar "undefined, undefined". (3) A página pública fatura/[token], voltada ao cliente final, tem o problema mais grave: o link compartilhado nunca inclui a chave PIX salva na tela Clínica (lê de um localStorage legado que nada mais grava), então o cliente recebe uma fatura sem meio de pagamento; além disso o payload é base64 sem assinatura, permitindo forjar faturas com PIX arbitrário no domínio oficial. No ADM ainda há um crash de rede no ApiContext (err.response.data sem optional chaining em GET/PUT/PATCH/DELETE) e o campo "Pago em" do financeiro que na verdade mostra a data de vencimento.

### 1. [Crítico] Fatura pública nunca exibe a chave PIX salva na tela Clínica — cliente não consegue pagar

**Local:** `web:app/(dashboard)/_components/sheets/ViewPaymentSheet.tsx:133` · **Origem:** achado novo da auditoria

Ao compartilhar a fatura (botão de compartilhar em ViewPaymentSheet), a chave PIX é lida de getClinicSettings(company.id) — um localStorage legado (lib/clinicSettings.ts é explicitamente 'até que o backend tenha colunas') que NÃO tem mais nenhum chamador de escrita (setClinicSettings só é referenciado dentro do próprio lib). A tela Clínica (PdfSettingsCard) salva a pixKey na API via PUT /company, e o PDF usa o fallback correto (lib/pdf/fromCompany.ts:34 — company.pixKey ?? settings.pixKey), mas o payload da página pública usa só settings.pixKey. Resultado: o cliente final abre o link e vê 'Chave PIX não disponível neste link' com botão desabilitado — a fatura pública não serve para pagar.

**Evidência:**

```
ViewPaymentSheet.tsx:97 `const settings = getClinicSettings(company?.id ?? null);` e :133 `k: settings.pixKey || undefined,` — enquanto fromCompany.ts:34 usa `pixKey: company.pixKey ?? settings.pixKey`. PdfSettingsCard.tsx:50-53 salva na API: `clinicService.editCompany({PutAPI},{pixKey: pixKey.trim() || null})`. fatura/[token]/page.tsx:236 renderiza 'Chave PIX não disponível neste link' quando data.k é vazio.
```

**Recomendação:** Em ViewPaymentSheet, usar `clinic.pixKey` (já retornado por clinicFromCompany, que faz company.pixKey ?? settings.pixKey) em vez de settings.pixKey no campo `k` do payload.

**Arquivos relacionados:** `web:lib/clinicSettings.ts` · `web:app/(dashboard)/clinic/_components/PdfSettingsCard.tsx` · `web:lib/pdf/fromCompany.ts` · `web:app/fatura/[token]/page.tsx`

### 2. [Alto] Fatura pública é payload base64 sem assinatura — permite forjar fatura com PIX arbitrário no domínio oficial

**Local:** `web:lib/invoice-share.ts:61` · **Origem:** achado novo da auditoria

O token de /fatura/[token] é apenas JSON base64url do payload inteiro (nome da clínica, CNPJ, itens, total e chave PIX), sem HMAC/assinatura nem consulta ao backend. Qualquer pessoa pode montar uma URL app.equinology.com.br/fatura/... exibindo qualquer clínica com a chave PIX do golpista — página de phishing perfeita hospedada no domínio legítimo. Como a página é voltada ao cliente final (leigo), o risco é alto.

**Evidência:**

```
invoice-share.ts:61-70 `decodeInvoicePayload` só faz `JSON.parse(fromBase64Url(token))` e valida `parsed?.v !== 1 || !Array.isArray(parsed.it)`; page.tsx:21 `const data = decodeInvoicePayload(token);` renderiza qualquer payload decodificável, incluindo `data.k` (chave PIX) e botão 'Copiar código PIX'.
```

**Recomendação:** Assinar o payload (HMAC com segredo do servidor via rota /api) ou trocar por token opaco resolvido no backend; no mínimo, exibir aviso e validar a chave PIX contra a da empresa.

**Arquivos relacionados:** `web:app/fatura/[token]/page.tsx`

### 3. [Alto] Estoque: data da entrada/transferência gravada como meia-noite UTC e exibida um dia antes no relatório

**Local:** `web:app/(dashboard)/_components/sheets/stock/AddStockEntrySheet.tsx:94` · **Origem:** achado novo da auditoria

AddStockEntrySheet e SendGeneralToVolanteSheet enviam `new Date('yyyy-MM-dd').toISOString()` (= 00:00 UTC). O Relatório de movimentações formata com `new Date(iso).toLocaleDateString('pt-BR')` no fuso local (UTC-3), então uma entrada registrada dia 30 aparece como 29. Mesma classe do bug de datas já reportado pelo usuário em outras telas. Agrava: o valor default do campo usa `new Date().toISOString().slice(0,10)` (data UTC) — após 21h BRT o formulário já abre sugerindo o dia seguinte.

**Evidência:**

```
AddStockEntrySheet.tsx:94 `date: new Date(date).toISOString()` (date = 'yyyy-MM-dd' do DateInput); SendGeneralToVolanteSheet.tsx:87 idem; StockMovementsTable.tsx:39-46 `const d = new Date(iso); return d.toLocaleDateString('pt-BR', {...})` — sem tratamento de UTC-midnight (que lib/format.ts:24-34 trata, mas não é usado aqui). Default: AddStockEntrySheet.tsx:31 `new Date().toISOString().slice(0, 10)`.
```

**Recomendação:** Enviar meio-dia local ou usar o helper de lib/format/brt; na exibição, reusar formatDate de lib/format.ts que já trata 'T00:00:00.000Z' como data pura.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/stock/SendGeneralToVolanteSheet.tsx` · `web:app/(dashboard)/stock/_components/StockMovementsTable.tsx` · `web:app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx`

### 4. [Alto] Atendimento > Pagamentos: vencimento exibido um dia antes e crash 'Invalid time value' com data parcial

**Local:** `web:app/(dashboard)/services/_components/ServicePayments.tsx:142` · **Origem:** achado novo da auditoria

Na modal 'Nova movimentação' do atendimento, firstDueDate é enviado como `new Date(form.firstDueDate).toISOString()` (00:00 UTC) e a tabela usa um formatDate local que não trata UTC-midnight — o vencimento escolhido dia 30 é exibido como 29. Além disso, se o usuário digitar uma data parcial no DateInput (menos de 8 dígitos), o input fica visualmente preenchido (passa no `required` nativo) mas form.firstDueDate continua '' — `new Date('').toISOString()` lança RangeError e o catch mostra o toast cru em inglês 'Invalid time value'.

**Evidência:**

```
ServicePayments.tsx:142 `firstDueDate: new Date(form.firstDueDate).toISOString(),`; :53-60 formatDate local `new Date(iso).toLocaleDateString('pt-BR',...)`; :165-167 `toast.error(err instanceof Error ? err.message : ...)`. date-input.tsx:158-167: onChange só propaga com 8 dígitos, então valor parcial mantém form vazio com input não-vazio. Mesmo padrão em NewPaymentSheet.tsx:121.
```

**Recomendação:** Validar form.firstDueDate antes do submit (toast pt-BR) e corrigir a serialização/exibição de data (mesma correção do achado de estoque).

**Arquivos relacionados:** `web:components/ui/date-input.tsx` · `web:app/(dashboard)/_components/sheets/NewPaymentSheet.tsx`

### 5. [Alto] ADM: ApiContext quebra com erro de rede em GET/PUT/PATCH/DELETE (err.response.data sem optional chaining)

**Local:** `adm:src/context/ApiContext.tsx:141` · **Origem:** achado novo da auditoria

No ApiContext do painel ADM, apenas PostAPI protege o catch com `err.response?.status ?? 0`. GetAPI, PutAPI, PatchAPI e DeleteAPI acessam `err.response.data` direto — quando a API está fora do ar ou há falha de rede, err.response é undefined e o catch lança TypeError, rejeitando a promise. Como as páginas fazem `const res = await GetAPI(...)` sem try/catch (ex.: coupons/page.tsx:33), a tela fica travada em loading com unhandled rejection, sem nenhuma mensagem ao admin.

**Evidência:**

```
GetAPI catch (linhas 141-144): `const message = err.response.data; const status = err.response.status;` — sem `?.`. Compare com PostAPI (linhas 96-100): `const status = err.response?.status ?? 0; const message = err.response?.data ?? 'Não foi possível conectar ao servidor.'`. Mesmo padrão sem proteção em PutAPI (:164-168), PatchAPI (:186-190) e DeleteAPI (:208-212 aprox.).
```

**Recomendação:** Replicar o tratamento do PostAPI (optional chaining + mensagem de fallback) nos quatro métodos.

**Arquivos relacionados:** `adm:src/app/(private)/coupons/page.tsx` · `adm:src/app/(private)/financial/page.tsx`

### 6. [Alto] ADM Financeiro: coluna 'Pago em' mostra a data de vencimento, não a data real do pagamento

**Local:** `api:src/domain/application/services/admin/services/adminFinancial.service.ts:127` · **Origem:** achado novo da auditoria

No backend, o serviço financeiro do admin define paymentDate como o próprio dueDate sempre que o status é PAID/RECEIVED — não usa a data efetiva de pagamento do gateway. O painel exibe isso na coluna 'Pago em', então um pagamento quitado com atraso (ou adiantado) mostra data errada, distorcendo a leitura financeira do admin.

**Evidência:**

```
adminFinancial.service.ts:126-128: `const dueDate = payment.dueDate ? moment(payment.dueDate) : null; const paymentDate = payment.status === 'PAID' || payment.status === 'RECEIVED' ? dueDate : null;` — e :147 `paymentDate: paymentDate?.toISOString()`. financial/page.tsx:204-215 renderiza a coluna 'Pago em' com esse valor.
```

**Recomendação:** Usar o campo de data de pagamento real do Asaas (paymentDate/clientPaymentDate) quando disponível; se não houver, exibir '—' em vez do vencimento.

**Arquivos relacionados:** `adm:src/app/(private)/financial/page.tsx`

### 7. [Alto] ADM: datas 'YYYY-MM-DD' e UTC-midnight exibidas um dia antes (financeiro, assinaturas e validade de cupom)

**Local:** `adm:src/app/(private)/financial/page.tsx:140` · **Origem:** achado novo da auditoria

O Asaas devolve dueDate como 'YYYY-MM-DD' (repassado cru pela API em adminFinancial.service.ts:146) e cupons têm validFrom salvo como 'T00:00:00.000Z' (coupon.service.ts:50). O ADM formata tudo com `new Date(s).toLocaleDateString('pt-BR')`, que interpreta essas strings como UTC e exibe no fuso local (UTC-3) — resultado: 'Data de Vencimento' no Financeiro, vencimento das parcelas no detalhe da assinatura e 'Válido de' na lista de cupons aparecem um dia antes do real.

**Evidência:**

```
financial/page.tsx:140 `new Date(t.dueDate).toLocaleDateString('pt-BR', ...)` com dueDate vindo cru do Asaas (adminFinancial.service.ts:146 `dueDate: payment.dueDate || ''`). SubscriptionDetailModal.tsx:490 `new Date(p.dueDate).toLocaleDateString('pt-BR')`. coupons-api.ts:66-71 `new Date(c.validFrom).toLocaleDateString('pt-BR')` com validFrom = 'T00:00:00.000Z' (coupon.service.ts:50 `new Date(`${fromStr}T00:00:00.000Z`)`).
```

**Recomendação:** Criar um formatDate compartilhado no ADM que trate 'YYYY-MM-DD' e 'T00:00:00Z' como data pura (igual ao lib/format.ts do web) e usar em todas as colunas de data.

**Arquivos relacionados:** `adm:src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx` · `adm:src/lib/coupons-api.ts` · `api:src/domain/application/services/admin/services/coupon.service.ts` · `api:src/domain/application/services/admin/services/adminFinancial.service.ts`

### 8. [Alto] ADM: editar assinatura re-salva expirationDate como meia-noite UTC — perde horário e antecipa o vencimento

**Local:** `adm:src/app/(private)/subscriptions/_components/SubscriptionDetailModal.tsx:223` · **Origem:** achado novo da auditoria

No detalhe da assinatura, o campo de expiração é inicializado com `new Date(expirationDate).toISOString().slice(0,10)` (dia em UTC, que pode já diferir do dia local) e salvo como `new Date('yyyy-mm-dd').toISOString()` = 00:00 UTC = 21:00 BRT do dia anterior. Salvar o formulário sem alterar nada já muda o vencimento real da assinatura (perde as horas), e no fuso local a assinatura passa a expirar um dia antes do exibido.

**Evidência:**

```
SubscriptionDetailModal.tsx:208-212 `setEditExpiration(new Date(subscription.expirationDate).toISOString().slice(0, 10))`; :222-223 `if (editExpiration) payload.expirationDate = new Date(editExpiration).toISOString();` — enviado ao PATCH /admin/signature/:id (adminSignature.controller.ts:79).
```

**Recomendação:** Só enviar expirationDate se o admin alterou o campo, e serializar como fim do dia no fuso de Brasília (ou preservar o horário original).

**Arquivos relacionados:** `api:src/infra/http/controllers/admin/adminSignature.controller.ts`

### 9. [Médio] Mensagens de erro em inglês da API vazam cruas nos toasts (web e ADM) — classe sistêmica confirmada nas telas não testadas

**Local:** `api:src/core/errors/errors/resourceNotFoundError.ts:5` · **Origem:** reportado nos testes manuais

Os erros do core da API têm mensagem em inglês: 'Resource not found', 'Not allowed', 'Resource already exists', 'Animal already registered', 'Company user limit exceeded'. O ErrorHandler repassa error.message para as exceptions HTTP, e o ValidationPipe global não traduz o class-validator (DTOs do admin sem `message` pt-BR), gerando arrays como 'creditCardPrice must be a number'. No web, ApiContext lança `new Error(err.message)` e todas as telas de estoque/serviços/clínica/CRM fazem `toast.error(err.message)`; no ADM, os modais exibem `res.body.message` cru. Ex.: excluir produto usado, criar categoria duplicada ou salvar plano sem preço mostram inglês ao usuário.

**Evidência:**

```
resourceNotFoundError.ts:5 `super('Resource not found')`; notAllowedError/resourceAlreadyExists/animalAlreadyRegistered/companyUserLimitExceeded idem em inglês. error.handler.ts:22-23 `throw new GoneException(error.message)`. main.ts:12-14 ValidationPipe só com `transform: true`. web ApiContext.tsx:66 `throw new Error((err as {message?:string}).message ?? 'Erro na requisição')`; AddProductSheet.tsx:126-127 `toast.error(err instanceof Error ? err.message : ...)`. adm CouponCreateModal.tsx:36-41 exibe `res.body.message` cru.
```

**Recomendação:** Traduzir as mensagens dos core errors para pt-BR e adicionar exceptionFactory/i18n no ValidationPipe; opcionalmente mapear mensagens conhecidas no frontend.

**Arquivos relacionados:** `api:src/infra/shared/handler/error.handler.ts` · `api:src/infra/main.ts` · `api:src/infra/http/controllers/admin/dto/adminPlan.dto.ts` · `web:context/ApiContext.tsx` · `web:app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx` · `adm:src/app/(private)/coupons/_components/CouponCreateModal.tsx`

### 10. [Médio] ADM Anúncios: erro de validação em array vira toast 'undefined, undefined'

**Local:** `adm:src/app/(private)/ads/page.tsx:105` · **Origem:** achado novo da auditoria

Quando a API devolve erro de validação (message é array de strings do class-validator), o handler de criar/atualizar anúncio mapeia cada item por `m.defaultMessage` — propriedade que não existe em strings — produzindo toast 'undefined, undefined'. O admin não consegue saber o que corrigir.

**Evidência:**

```
ads/page.tsx:102-107: `Array.isArray(res.body?.message) ? res.body.message.map((m: { defaultMessage?: string }) => m.defaultMessage).join(', ') : ...` — mesmo código repetido em handleUpdate (:140-145). Mensagens do class-validator são strings simples.
```

**Recomendação:** Usar `res.body.message.join(', ')` quando for array de strings.

**Arquivos relacionados:** `adm:src/app/(private)/ads/_components/AdsForm.tsx`

### 11. [Médio] ADM Planos: formulário permite criar plano sem preço, mas a API exige — erro em inglês após submit

**Local:** `adm:src/app/(private)/plans/_components/PlansForm.tsx:13` · **Origem:** achado novo da auditoria

No PlansForm os preços são opcionais no schema zod (priceCardCents/pricePixCents `.optional()`), então o admin consegue submeter sem preço; o CreateSignaturePlanDto da API marca creditCardPrice e pixPrice como @IsNumber @IsNotEmpty — o submit falha com mensagem class-validator em inglês exibida crua no modal ('creditCardPrice must be a number conforming to...').

**Evidência:**

```
PlansForm.tsx:13-14 `priceCardCents: z.coerce.number().min(0).optional(), pricePixCents: z.coerce.number().min(0).optional()`; handleFormSubmit só inclui priceCard/pricePix se preenchidos (:92-99). adminPlan.dto.ts:28-36 `@IsNumber() @IsNotEmpty() creditCardPrice!: number; ... pixPrice!: number;`. PlanCreateModal.tsx:52-57 exibe res.body.message cru.
```

**Recomendação:** Tornar os preços obrigatórios no zod do formulário de criação, com mensagem pt-BR.

**Arquivos relacionados:** `api:src/infra/http/controllers/admin/dto/adminPlan.dto.ts` · `adm:src/app/(private)/plans/_components/PlanCreateModal.tsx`

### 12. [Médio] Estoque: entrada inicial e categoria recém-criada são localizadas por NOME — risco de registrar no produto errado

**Local:** `web:app/(dashboard)/_components/sheets/stock/AddProductSheet.tsx:94` · **Origem:** achado novo da auditoria

POST /product não retorna o id criado, então o AddProductSheet busca o produto por nome (`where[query]`) e pega o primeiro com `.find(p => p.name === productName)` para registrar a entrada inicial. Se existirem dois produtos com o mesmo nome (a API não impede), a entrada de estoque pode cair no produto errado; se a busca não retornar (paginação/atraso), a entrada é silenciosamente perdida (toast de erro, mas produto já criado). Mesma técnica é usada para selecionar a categoria recém-criada (match por nome).

**Evidência:**

```
AddProductSheet.tsx:87-107: `params.set('where[query]', productName); const created = (res?.products ?? []).find((p) => p.name === productName); if (created) { await PostAPI('/product-stock', {productId: created.id, ...}) }` — comentário no código (:83-86) admite a limitação 'Como POST /product não retorna o id'. Categoria: :152 `const created = next.find((c) => c.name === nameTrim)`.
```

**Recomendação:** Fazer o POST /product retornar o registro criado (mudança na API) e usar o id direto no frontend.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/stock/EditProductSheet.tsx` · `api:src/infra/http/controllers/stock/product.controller.ts`

### 13. [Médio] Middleware do web não protege /notes e /reminders — fura o gate de assinatura; matcher tem rotas mortas

**Local:** `web:middleware.ts:69` · **Origem:** achado novo da auditoria

O matcher do middleware lista as rotas do dashboard que passam pela checagem de token + /signature/validation (usuário sem assinatura é mandado a /plans). /notes e /reminders não estão no matcher, então um usuário sem assinatura ativa (ou trial expirado) acessa essas telas diretamente sem redirecionamento — os fetches funcionam se o token ainda for válido. O matcher também referencia '/stock2' e '/cooperators', rotas que não existem em app/(dashboard).

**Evidência:**

```
middleware.ts:68-87 `matcher: ['/', '/login', ..., '/calendar', '/clients-equines/:path*', '/services/:path*', '/financial', '/stock', '/stock2', '/crm', '/cooperators', '/subscription', '/clinic']` — sem '/notes' nem '/reminders'; '/stock2' e '/cooperators' não existem no ls de app/(dashboard).
```

**Recomendação:** Adicionar '/notes' e '/reminders' ao matcher e remover as entradas mortas.

**Arquivos relacionados:** `web:app/(dashboard)/notes/page.tsx` · `web:app/(dashboard)/reminders/page.tsx`

### 14. [Médio] Notes: filtro por data compara dia em UTC — anotações criadas à noite caem no dia errado

**Local:** `web:app/(dashboard)/notes/_components/NotesTable.tsx:364` · **Origem:** achado novo da auditoria

O filtro de data da tabela unificada de Anotações e Lembretes converte a data do registro com `new Date(n.date).toISOString().split('T')[0]` (dia em UTC) e compara com o dateFilter escolhido no fuso local. Uma anotação criada às 22h BRT do dia 29 tem dia UTC = 30, então filtrar pelo dia 29 não a encontra (e filtrar pelo 30 a mostra indevidamente).

**Evidência:**

```
NotesTable.tsx:362-367: `if (dateFilter) { filtered = filtered.filter((n) => { const noteDate = new Date(n.date).toISOString().split('T')[0]; return noteDate === dateFilter; }); }`
```

**Recomendação:** Comparar usando componentes locais da data (getFullYear/getMonth/getDate) ou date-fns format('yyyy-MM-dd').

### 15. [Médio] Saída de estoque sem validação de quantidade disponível no cliente (e typo 'disponivel')

**Local:** `web:app/(dashboard)/_components/sheets/stock/StockOutputSheet.tsx:90` · **Origem:** achado novo da auditoria

O StockOutputSheet exibe a quantidade disponível mas não valida quantity <= disponível antes do submit — só min=1 no input. A modal irmã SendVolanteToGeneralSheet valida ('Quantidade maior que a disponivel no volante.' — com typo, sem acento). A API recusa com 'Quantidade insuficiente em estoque' (pt, ok), mas a experiência é inconsistente: numa modal o erro é preventivo, na outra só depois do round-trip. O mesmo vale para SendGeneralToVolanteSheet (envio ao volante sem checar currentStock).

**Evidência:**

```
StockOutputSheet.tsx:88-100: validação só `if (!productId || quantity <= 0)`; a var `available` (:113-114) é usada apenas para exibição. SendVolanteToGeneralSheet.tsx:46-49: `if (quantity > maxQty) { toast.error('Quantidade maior que a disponivel no volante.'); }` (typo). fieldStock.service.ts:43 valida no backend.
```

**Recomendação:** Adicionar a mesma validação preventiva no StockOutputSheet e SendGeneralToVolanteSheet; corrigir o acento de 'disponível'.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/stock/SendVolanteToGeneralSheet.tsx` · `web:app/(dashboard)/_components/sheets/stock/SendGeneralToVolanteSheet.tsx` · `api:src/domain/application/services/stock/services/fieldStock.service.ts`

### 16. [Médio] Clínica: campo CEP sem máscara/maxLength e Nome sem obrigatoriedade na edição dos dados da clínica

**Local:** `web:app/(dashboard)/clinic/_components/CompanyInfoCard.tsx:187` · **Origem:** reportado nos testes manuais

No card 'Dados da Clínica', CNPJ e Telefone usam MaskedInput, mas o CEP é um Input de texto livre — sem máscara 00000-000, sem maxLength e sem validação de 8 dígitos (o ADM, na mesma operação, tem máscara e validação zod). O campo Nome também não é required — dá para salvar a clínica com nome vazio. Mesma classe 'máscaras sem maxLength' reportada pelo usuário em outras telas.

**Evidência:**

```
CompanyInfoCard.tsx:186-195: `<Input id='comp-postal' value={form.postalCode ?? ''} onChange={...} placeholder='00000-000' />` — sem mask/maxLength; :129-137 Nome sem `required`. Compare CompanyCreateModal.tsx (adm) :23-29 valida CEP com zod + formatCEP no onChange (:187).
```

**Recomendação:** Usar MaskedInput/formatCEP (já existe formatCEP em lib/masks.ts:52) e validar 8 dígitos + nome obrigatório antes do PUT.

**Arquivos relacionados:** `adm:src/app/(private)/companies/_components/CompanyCreateModal.tsx` · `web:lib/masks.ts`

### 17. [Médio] ADM Nova assinatura: empresa e plano pré-selecionados automaticamente com o primeiro da lista

**Local:** `adm:src/app/(private)/subscriptions/_components/SubscriptionCreateModal.tsx:57` · **Origem:** achado novo da auditoria

Ao abrir a modal 'Nova assinatura', companyId e planId são setados automaticamente para o primeiro item retornado pela API. Um admin apressado pode criar uma assinatura (que gera cobrança real no gateway) para a empresa errada sem nunca ter escolhido — clássico 'valor default preso'. O `<option value=''>Selecione</option>` existe mas nunca fica selecionado.

**Evidência:**

```
SubscriptionCreateModal.tsx:53-57: `if (companiesRes.status === 200) { ... setCompanies(arr); if (arr.length) setCompanyId(arr[0].id); }` e :66 `if (normalized.length) setPlanId(normalized[0].id);`. Além disso :242 exibe cupom fixo como `R$ ${c.discountFixedAmount?.toFixed(2)}` (ponto decimal, fora do padrão pt-BR).
```

**Recomendação:** Iniciar companyId/planId vazios (forçando escolha explícita — os selects já têm required) e formatar o cupom com Intl.NumberFormat pt-BR.

### 18. [Médio] DateInput sem validação de faixa de ano — aceita datas absurdas (ex.: 01/01/0202)

**Local:** `web:components/ui/date-input.tsx:163` · **Origem:** reportado nos testes manuais

O DateInput compartilhado do web só valida o parse dd/MM/yyyy; qualquer ano de 4 dígitos passa (0001-9999). Um erro de digitação como '01/01/0202' é aceito e enviado à API em telas de estoque, pagamentos, lembretes e retornos — sem nenhum aviso. Mesma classe 'inputs de data sem validação' reportada pelo usuário.

**Evidência:**

```
date-input.tsx:33-40 toApiDate: `const parsed = parse(value.trim(), DISPLAY_FORMAT, new Date(), {locale: ptBR}); if (!isValid(parsed)) return '';` — isValid aceita ano 0202; :163-166 propaga com 8 dígitos sem checagem de min/max default.
```

**Recomendação:** No DateInput, rejeitar (ou clampar) anos fora de uma janela razoável (ex.: 1900–2100) quando min/max não forem passados.

**Arquivos relacionados:** `web:app/(dashboard)/_components/sheets/stock/AddStockEntrySheet.tsx` · `web:app/(dashboard)/services/_components/ServicePayments.tsx`

### 19. [Médio] ADM Anúncios: sem validação de tamanho da imagem e de ordem das datas no cliente

**Local:** `adm:src/app/(private)/ads/_components/AdsForm.tsx:127` · **Origem:** achado novo da auditoria

O AdsForm promete 'Máx. 5 MB' mas não valida o tamanho do arquivo no onFileChange (só o mimetype); imagens grandes só falham na API, cujo MaxFileSizeValidator responde em inglês ('Validation failed (expected size is less than 5242880)') — exibido cru no toast. O superRefine também não valida validUntil >= validFrom (o CouponsForm valida); a ordem só é checada na API após o submit.

**Evidência:**

```
AdsForm.tsx:127-145 onFileChange só checa `file.type.startsWith('image/')`; :242 texto 'JPEG, PNG, GIF ou WebP. Máx. 5 MB.'; superRefine (:28-57) sem checagem de ordem. adminAds.controller.ts:26-31 `new MaxFileSizeValidator({ maxSize: IMAGE_MAX_BYTES })` sem mensagem customizada. advertisement.service.ts:93-95 valida ordem com mensagem pt (mas só pós-submit).
```

**Recomendação:** Checar file.size > 5MB no onFileChange com mensagem pt-BR e adicionar a validação de ordem das datas no zod (copiar do CouponsForm).

**Arquivos relacionados:** `api:src/infra/http/controllers/admin/adminAds.controller.ts` · `api:src/domain/application/services/admin/services/advertisement.service.ts`

### 20. [Baixo] Assinatura (web): botão 'Ver detalhes' deveria ser 'Ver planos'

**Local:** `web:app/(dashboard)/subscription/page.tsx:205` · **Origem:** reportado nos testes manuais

Quando o usuário não tem assinatura ativa, a tela mostra 'Escolha um plano para continuar' com um botão rotulado 'Ver detalhes' que leva a /plans — label não descreve a ação (classe 'botões/labels errados'). O mesmo link com o mesmo rótulo aparece no rodapé da tela.

**Evidência:**

```
subscription/page.tsx:204-206: `<Button asChild variant='primary'><Link href='/plans'>Ver detalhes</Link></Button>` logo após 'Nenhuma assinatura ativa encontrada. Escolha um plano para continuar.'; repetido em :362-364.
```

**Recomendação:** Renomear para 'Ver planos'.

### 21. [Baixo] ADM Cupons: criação sem toast de sucesso e exclusão com confirm() nativo

**Local:** `adm:src/app/(private)/coupons/_components/CouponCreateModal.tsx:32` · **Origem:** reportado nos testes manuais

Criar cupom fecha a modal silenciosamente (nenhum feedback de sucesso — classe 'ações sem feedback'); já criar plano mostra toast. A exclusão de cupom/plano/anúncio usa window.confirm() nativo, destoando do restante do sistema (web usa dialog customizado useConfirm).

**Evidência:**

```
CouponCreateModal.tsx:32-34: `if (res.status === 200 || res.status === 201) { onSaved(); onClose(); }` — sem toast.success (compare PlanCreateModal.tsx:48 `toast.success('Plano criado com sucesso.')`). coupons/page.tsx:70 `if (!confirm('Excluir este cupom?')) return;`.
```

**Recomendação:** Adicionar toast.success na criação e padronizar um dialog de confirmação.

**Arquivos relacionados:** `adm:src/app/(private)/coupons/page.tsx` · `adm:src/app/(private)/plans/page.tsx` · `adm:src/app/(private)/ads/page.tsx`

### 22. [Baixo] CRM: campo Estado (UF) do lead é texto livre sem maxLength

**Local:** `web:app/(dashboard)/crm/_components/CreateLeadModal.tsx:180` · **Origem:** reportado nos testes manuais

No modal de lead do CRM, o campo Estado tem placeholder 'UF' mas aceita qualquer texto de qualquer tamanho — sem maxLength=2, sem uppercase, sem select de UFs (o ADM tem BRAZIL_STATES pronto). Dados inconsistentes ('São Paulo', 'sp', 'SP ') poluem o kanban. Classe 'máscaras sem maxLength'.

**Evidência:**

```
CreateLeadModal.tsx:178-188: `<Input id='lead-state' value={form.state} onChange={...} placeholder='UF' />` — sem maxLength nem validação.
```

**Recomendação:** maxLength={2} + uppercase, ou um Select com as 27 UFs.

### 23. [Baixo] Clínica: limite de logo valida 5,5 MB mas mensagem diz 5 MB; ADM aninha <button> dentro de <button>

**Local:** `web:app/(dashboard)/clinic/_components/PdfSettingsCard.tsx:66` · **Origem:** achado novo da auditoria

Dois cosméticos: (1) PdfSettingsCard rejeita arquivos acima de 5,5 MB mas o toast e o texto de ajuda dizem 'no máximo 5 MB' — arquivos entre 5 e 5,5 MB passam contradizendo a mensagem. (2) No LocationTargeting do ADM, o botão 'limpar' de cada UF é renderizado dentro do botão de expandir a UF — HTML inválido (button aninhado), pode gerar warning de hidratação e comportamento inconsistente de clique/teclado.

**Evidência:**

```
PdfSettingsCard.tsx:66-68: `if (file.size > 5.5 * 1024 * 1024) { toast.error('Logo deve ter no máximo 5 MB.'); }`. LocationTargeting.tsx:280-313: `<button type='button' onClick={() => toggleUf(s.uf)}>...` contém `<button type='button' onClick={(e) => { e.stopPropagation(); clearUf(s.uf); }}>limpar</button>`.
```

**Recomendação:** Alinhar limite e mensagem (5 MB); trocar o botão externo por div com role=button ou mover o 'limpar' para fora.

**Arquivos relacionados:** `adm:src/app/(private)/ads/_components/LocationTargeting.tsx`
