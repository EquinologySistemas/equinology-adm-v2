# R2 — Mensagens que confundem

Frente R2 da auditoria de lançamento. Escopo de edição: **apenas DTOs**
(`vetequus-api/src/infra/http/controllers/**/dto/**`). Nenhum controller,
service ou repositório foi tocado.

Módulos de **pagamento / assinatura / PIX / Asaas / fatura / transação / cupom /
plano** foram deliberadamente **pulados** — outra sessão trabalha neles em
paralelo e editar lá geraria conflito.

Ambiente: API em `http://localhost:3333`, empresa e token próprios criados para
esta sessão. Toda mensagem abaixo foi vista de fato no `curl`, não deduzida do
código.

---

## Placar

| Item | Situação |
|---|---|
| 1. Mensagem duplicada | **CORRIGIDO** — 21 campos no meu escopo, agora 0 |
| 2. Nome técnico em inglês | **PARTE JÁ ESTAVA OK** — os 8 citados já tinham sido corrigidos; achei e corrigi 5 sobras |
| 3. Mensagem de outro campo | **CORRIGIDO** — `animalQuantity` |
| 4. Enum inválido devolve 404 | **CORRIGIDO** — agora 400 com a lista de valores |
| 5. Campo de texto sem limite | **CORRIGIDO nas entidades centrais** — 113 campos ganharam limite; fichas clínicas ficaram de fora de propósito |

`npx tsc --noEmit` no `vetequus-api`: **exit 0** nos meus arquivos. Os erros que
sobram em `adminSignature.*` são da outra sessão (módulo de assinatura), não
meus. O `equinology-web-v2` **não foi tocado** — `npx tsc --noEmit` lá segue
limpo.

---

## Item 1 — Mensagem duplicada

### Contagem real (varredura sobre os 91 arquivos de DTO)

Um script leu cada campo, juntou os decorators que o precedem e comparou os
textos de `message`. "Campo duplicado" = campo com dois ou mais decorators
carregando **texto idêntico**.

| | Antes | Depois |
|---|---|---|
| Campos com mensagem duplicada — total | 48 | 27 |
| — no meu escopo | **21** | **0** |
| — em pagamento/transação (outra sessão) | 27 | 27 |

Os 27 restantes estão em `finance/dto/payment.dto.ts`,
`finance/dto/transaction.dto.ts` e `finance/dto/transactionCategory.dto.ts`.
Não toquei.

> O relatório original falava em "90 campos". A varredura mediu 48 campos, que
> correspondem a ~96 linhas de decorator com texto repetido — é a mesma coisa
> contada de outro jeito. Parte também já havia caído nas levas anteriores.

### Regra aplicada

O decorator de **tipo** fala do formato; o de **obrigatoriedade** fala da
ausência. Onde havia decorator redundante (`@IsString` junto de `@IsEmail`, que
já recusa não-texto), o redundante foi **removido** em vez de ganhar frase nova.

### Prova — login (`POST /user/signin`) com `{}`

ANTES (HTTP 400) — 5 mensagens, 3 iguais:
```json
["Insira um email válido","Insira um email válido","Insira um email válido",
 "Insira uma senha válida","Insira uma senha válida"]
```

DEPOIS (HTTP 400) — 4 mensagens, todas diferentes:
```json
["E-mail inválido. Use o formato nome@dominio.com.",
 "Informe o e-mail da sua conta.",
 "A senha deve ser preenchida como texto.",
 "Informe a sua senha."]
```

### Prova — fase do CRM (`POST /board`) com `{}`

ANTES (HTTP 400) — 10 mensagens, 5 pares idênticos:
```json
["Insira um nome valido","Insira um nome valido",
 "Insira uma ordem valida","Insira uma ordem valida",
 "Escolha uma opção válida","Escolha uma opção válida",
 "Insira uma cor valida","Insira uma cor valida",
 "Escolha uma opção valida","Escolha uma opção valida"]
```

DEPOIS (HTTP 400) — 10 mensagens, nenhuma repetida:
```json
["O nome da fase deve ser preenchido como texto.","Informe o nome da fase.",
 "A ordem da fase deve ser um número inteiro, como 1 ou 2.","Informe a ordem da fase no funil.",
 "Para a fase de leads perdidos, escolha Sim ou Não.","Informe se esta é a fase de leads perdidos.",
 "A cor da fase deve ser preenchida como texto, ex.: #FF0000.","Escolha a cor da fase.",
 "Para a última fase do funil, escolha Sim ou Não.","Informe se esta é a última fase do funil."]
```

### Prova — recuperação de senha (`POST /password-code`) com `{}`

ANTES: `["Insira um email válido","Insira um email válido","Insira um email válido"]`
DEPOIS: `["E-mail inválido. Use o formato nome@dominio.com.","Informe o e-mail da sua conta para receber o código."]`

### Prova — conta bancária (`POST /bank-account`) com `{}`

ANTES: `["Insira um balanço válido","Insira um balanço válido","Insira um nome válido","Insira um nome válido"]`
DEPOIS: `["O saldo inicial deve ser um número, ex.: 330 ou 330.50.","Informe o saldo inicial da conta.","O nome da conta deve ser preenchido como texto.","Informe o nome da conta."]`

### Arquivos

`account/dto/User.dto.ts`, `account/dto/RecoverPasswordCode.dto.ts`,
`client/dto/RecoverClientPasswordCode.dto.ts`, `admin/dto/adminAuth.dto.ts`,
`crm/dto/boardDto.ts`, `crm/dto/leadDto.ts`, `finance/dto/bankAccount.dto.ts`,
`tag/dto/tag.dto.ts`.

---

## Item 2 — Nome técnico em inglês dentro de frase em português

### Os 8 casos citados: **JÁ ESTAVAM OK**

Grep por `message:` contendo cada nome não retornou nada. As mensagens de hoje:

| Campo | Mensagem atual |
|---|---|
| `utero` / `uterus` | "Informe uma condição válida para o útero" |
| `bodyScore` | "Informe um escore corporal válido" |
| `inspection` | "Informe uma inspeção válida" |
| `spermogramVolume` | "Informe um volume válido" |
| `angle` | "Informe um ângulo válido" |
| `cyto` | "Informe um resultado de citologia válido" |
| `behavior` | "Informe uma observação comportamental válida" |
| `destination` | "Informe um destino válido" |

Uma leva anterior já tinha resolvido. **Não refiz.**

### Sobras que a varredura achou e eu corrigi

O script cruzou cada mensagem com o nome do próprio campo, procurando o nome
técnico vazando para a frase. Depois de descartar os falsos positivos — palavras
que são português de verdade (`vulva`, `vigor`, `placenta`, `volume`, `email`) —
sobraram 5 ocorrências reais:

| Arquivo | Antes | Depois |
|---|---|---|
| `stock/dto/fieldStock.dto.ts` | "O campo page é obrigatório" | "Informe o número da página." |
| `stock/dto/fieldStock.dto.ts` | "Insira uma query válida" | "O termo de busca deve ser preenchido como texto." |
| `crm/dto/boardDto.ts` | "Insira um Query de busca valido" | "O termo de busca deve ser preenchido como texto." |
| `crm/dto/leadDto.ts` (2x) | "Insira um Query de busca valido" | "O termo de busca deve ser preenchido como texto." |
| `animal/dto/dentistry/dentistryOral.dto.ts` (2x) | "Informe wolf válido" | "Informe uma condição válida para o dente de lobo." |

Bônus da mesma varredura, em `crm/dto/leadDto.ts`:
"Insira um Pagina de busca valida" → "A página deve ser um número inteiro, ex.: 1."

Prova (`GET /field-stock` sem `page`):
```
ANTES:  ["O campo page é obrigatório", ...]
DEPOIS: ["A página deve ser um número inteiro, ex.: 1.",
         "A página deve ser maior ou igual a 1",
         "Informe o número da página."]      HTTP 400
```

Prova (`GET /board?query[]=a&query[]=b`):
```
ANTES:  ["Insira um Query de busca valido"]
DEPOIS: ["O termo de busca deve ser preenchido como texto."]   HTTP 400
```

### Relatado, não corrigido

- **`"amount deve ser um número"` no `POST /invoice`** — módulo `invoice`, da
  outra sessão. **Não editei.**
- `"Tags deve ser uma lista"` em `stock/dto/product.dto.ts` — "Tags" é como o
  campo aparece na tela, não é vazamento técnico. Deixado.

---

## Item 3 — Mensagem de outro campo

`crm/dto/leadDto.ts`, `CreateLeadDto.animalQuantity`:

```
ANTES:  @IsNotEmpty({ message: 'Insira uma valor de crédito válida' })
DEPOIS: @IsNotEmpty({ message: 'Informe a quantidade de animais.' })
        @IsNumber({}, { message: 'A quantidade de animais deve ser um número, ex.: 10.' })
```

Prova (`POST /lead` com `{}`) — a frase de crédito sumiu:
```json
["O nome do lead deve ser preenchido como texto.","Informe o nome do lead.",
 "O telefone deve ser preenchido como texto, ex.: (11) 99999-9999.","Informe o telefone do lead.",
 "A cidade deve ser preenchida como texto.","Informe a cidade do lead.",
 "O estado deve ser preenchido como texto, ex.: SP.","Informe o estado do lead.",
 "Fase do funil inválida. Selecione uma fase da lista.","Escolha a fase do funil em que o lead entra.",
 "A quantidade de animais deve ser um número, ex.: 10.","Informe a quantidade de animais.",
 "A categoria deve ser preenchida como texto.","Informe a categoria do lead.",
 "O procedimento deve ser preenchido como texto.","Informe o procedimento de interesse."]
```

### Varredura por outros erros de cópia

Cruzei todas as mensagens contra os nomes dos campos e listei toda mensagem
usada por mais de um campo com nome diferente. Resultado: **nenhum outro caso
como o do `animalQuantity`**. As repetições encontradas são legítimas
(`utero`/`uterus`, `spermogramVolume`/`volume`, `newTags`/`oldTags` etc. —
campos irmãos com a mesma semântica).

Achado adjacente, **não corrigido** (é regra, não mensagem):
`admin/dto/adminPanelAccount.dto.ts` e `admin/dto/adminUser.dto.ts` usam
`@MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })`, enquanto
a política do web é 8 (`MIN_PASSWORD_LENGTH`). A mensagem **combina** com a
regra local, então não é mensagem errada — é política divergente no painel
interno. Decisão do dono.

---

## Item 4 — Enum inválido devolvia 404

`animal/dto/animal.dto.ts`. `gender` e `sex` eram `@IsString()`: qualquer texto
passava pelo DTO, o Prisma recusava o enum lá na frente e o usuário levava **404
"Registro não encontrado"** — mensagem que não tem nada a ver com o problema.

Correção: `@IsEnum` no Create e no Edit, com a lista de valores na frase. E o
enum local do DTO ganhou `BREEDING`, que existe no `schema.prisma` e no tipo do
campo mas faltava aqui — por isso `GET /animal?gender=BREEDING` também era
recusado.

### Prova

| Requisição | ANTES | DEPOIS |
|---|---|---|
| `POST /animal {"gender":"XPTO",...}` | 404 "Registro não encontrado…" | **400** "Categoria inválida. Escolha uma destas: STALLION, CASTRATED, MATRIX, DONOR, RECEPTOR ou BREEDING." |
| `POST /animal {"sex":"NAOSEI",...}` | 404 "Registro não encontrado…" | **400** "Sexo inválido. Escolha MALE (macho) ou FEMALE (fêmea)." |
| `PUT /animal/:id {"gender":"XPTO"}` | 404 | **400** mesma frase |
| `PUT /animal/:id {"sex":"NAOSEI"}` | 404 | **400** mesma frase |
| `POST /animal` com `gender:"BREEDING"` | — | **201** (grava `"gender":"BREEDING"`) |
| `PUT /animal/:id {"gender":"CASTRATED","sex":"MALE","color":"Alazao"}` | — | **200** |

O web só envia valores do enum (`CreateAnimalSheet.tsx` tem `GENDERS` e `SEXES`
fixos, com default `STALLION`/`MALE`), então nada quebra na tela.

---

## Item 5 — Nenhum campo de texto tinha limite

As colunas no Postgres são `text` (sem limite) — nada barrava um payload de 1 MB
num campo de nome.

### O decorator: `MaxTextLength`, não `@MaxLength`

Primeira tentativa usou `@MaxLength` e **piorou a tela**: o `@MaxLength` do
class-validator reprova qualquer valor que não seja string, inclusive
`undefined`. Num campo obrigatório ausente ele disparava junto do `@IsNotEmpty`
e o login com `{}` passou a responder:

```json
["O e-mail deve ter no máximo 254 caracteres.", "E-mail inválido...", "Informe o e-mail da sua conta.", ...]
```

Ou seja: trocaria uma mensagem confusa por outra. Criei então
`MaxTextLength` (e `MinTextLength`) em
`src/infra/http/controllers/dto/fieldLimits.ts`, que **só julga texto**:
ausência é assunto do `@IsNotEmpty`, tipo errado é assunto do `@IsString`,
tamanho só é cobrado de quem mandou texto de verdade.

O `MinTextLength` também limpou o `PUT /user/password` com `{}`, que trazia
"A senha deve ter no mínimo 8 caracteres" para um campo não preenchido. A
política de senha continua idêntica — confirmado abaixo.

### Limites escolhidos (`dto/fieldLimits.ts`)

| Constante | Valor | Onde |
|---|---|---|
| `MAX_NAME_LENGTH` | 150 | nome de pessoa, animal, empresa, conta, responsável |
| `MAX_TITLE_LENGTH` | 150 | título de anotação/lembrete, categoria, tag, cidade, bairro, procedimento |
| `MAX_SHORT_TEXT_LENGTH` | 100 | estado, raça, pelagem, cor, CRMV, termo de busca |
| `MAX_ADDRESS_LENGTH` | 200 | endereço, rua, localização |
| `MAX_EMAIL_LENGTH` | 254 | e-mail (limite do RFC) |
| `MAX_PHONE_LENGTH` | 30 | telefone |
| `MAX_DOCUMENT_LENGTH` | 20 | CPF / CNPJ |
| `MAX_CODE_LENGTH` | 60 | código de recuperação, código de empresa/propriedade |
| `MAX_PASSWORD_LENGTH` | 128 | senha |
| `MAX_URL_LENGTH` | 2048 | `photoUrl` do animal |
| `MAX_NOTE_LENGTH` | 5000 | observação, descrição, conteúdo de anotação |

**113 campos** ganharam limite, em: `User.dto`, `client.dto`,
`RecoverPasswordCode.dto`, `RecoverClientPasswordCode.dto`, `adminAuth.dto`,
`animal.dto`, `animalNote.dto`, `studFarm.dto`, `note.dto`, `reminder.dto`,
`productCategory.dto`, `boardDto`, `leadDto`, `tag.dto`, `bankAccount.dto`,
`fieldStock.dto`.

### Prova

| Requisição | Resultado |
|---|---|
| `POST /animal` com nome de 300 chars | **400** "O nome deve ter no máximo 150 caracteres." |
| `POST /client` com nome de 300 chars | **400** "O nome deve ter no máximo 150 caracteres." |
| `POST /animal-note` com 6000 chars | **400** "O texto deve ter no máximo 5000 caracteres." |
| `POST /animal-note` com texto normal | **201** |

### O que ficou de fora, de propósito

- **As 41 fichas clínicas** (reprodução, ortopedia, odontologia, geral). São
  campos de texto livre de laudo, com uso real imprevisível, e o dono foi
  explícito: "se tiver dúvida sobre um campo, deixe e relate". Um limite errado
  ali trunca laudo assinado. **Relatado, não mexido.**
- **`account/dto/company.dto.ts`** — o DTO tem `walletId` e `pixKey`, que são do
  Asaas. É território da outra sessão. Nenhum campo da empresa ganhou limite.
- **`photoUrl`** ganhou limite de tamanho (2048), mas **não** ganhou `@IsUrl` —
  o item "photoUrl aceita qualquer string" não estava na minha lista e não sei
  se o front manda caminho relativo. Relatado.

---

## Caminho feliz — continua passando

Rodado depois de todas as mudanças, com token próprio:

| Requisição | HTTP |
|---|---|
| `POST /user/register` (nova empresa) | 201 |
| `POST /user/signin` (credenciais válidas) | 201 |
| `POST /password-code` (e-mail cadastrado) | 201 |
| `POST /client` | 201 |
| `POST /animal` (`STALLION`/`MALE`) | 201 |
| `POST /animal` (`BREEDING`/`FEMALE`) | 201 |
| `PUT /animal/:id` | 200 |
| `POST /stud-farm` | 201 |
| `POST /animal-note` | 201 |
| `POST /board` | 201 |
| `POST /lead` | 201 |
| `POST /note` | 201 |
| `POST /reminder` (com `recurrence: DAILY`) | 201 |
| `POST /product-category` | 201 |
| `POST /bank-account` | 201 |
| `POST /tag` | 201 |
| `POST /user` (colaborador) | 201 |
| `GET /field-stock?page=1` | 200 |

## Lado negativo — nada foi afrouxado

Todas as mudanças **apertam** a validação (enum no lugar de string livre,
limites de tamanho) ou só trocam texto. Mesmo assim, testado com uma **segunda
empresa** criada para isso:

| Requisição com token da OUTRA empresa | Resultado |
|---|---|
| `GET /animal/:id` (animal meu) | **404** — barrado |
| `PUT /animal/:id` (animal meu) | **404** — barrado |
| `GET /animal/fetch?page=1` | **404** — não vaza nada meu |
| `GET /animal/:id` **sem token** | **401** "Você precisa estar autenticado…" |

Política de senha, depois da troca de `@MinLength` por `MinTextLength`:

| Requisição | Resultado |
|---|---|
| `PUT /user/password {"password":"123","code":"000000"}` | **400** "A senha deve ter no mínimo 8 caracteres." |
| `POST /user/register` com `"password":"123"` | **400** "A senha deve ter no mínimo 8 caracteres." |
| `PUT /user/password {}` | **400**, sem a frase de mínimo (é `@IsNotEmpty` quem fala) |

---

## Pendências para o dono decidir

1. **`"amount deve ser um número"` no `POST /invoice`** — módulo da outra
   sessão. Precisa ser passado para ela.
2. **27 campos com mensagem duplicada** em `payment.dto.ts`,
   `transaction.dto.ts` e `transactionCategory.dto.ts` — mesma correção do item
   1, mas em arquivos da outra sessão. Passar adiante.
3. **`@MaxLength`/`@MinLength` pré-existentes** em `appointment.dto.ts` e
   `product.dto.ts` sofrem do mesmo problema descrito no item 5 (disparam em
   campo ausente). Não foram tocados por não estarem na lista. Trocar por
   `MaxTextLength` resolveria.
4. **`PageNumber`** (`src/infra/shared/decorators/`) devolve 3 mensagens quando
   a página vem ausente. É decorator compartilhado, fora do escopo "só DTOs".
5. **Limite de tamanho nas 41 fichas clínicas** — precisa de alguém que conheça
   o uso real de cada campo de laudo.
6. **`photoUrl` sem validação de formato** — decidir se aceita caminho relativo
   antes de aplicar `@IsUrl`.
7. **Senha mínima 6 no painel interno** (`adminPanelAccount.dto.ts`,
   `adminUser.dto.ts`) contra 8 no web. Divergência de política.
