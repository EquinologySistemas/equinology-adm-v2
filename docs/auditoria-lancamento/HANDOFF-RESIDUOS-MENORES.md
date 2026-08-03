# Passagem de bastão — resíduos menores

Documento para uma sessão **separada** trabalhar os resíduos, enquanto a sessão
principal cuida de PIX / Asaas. Escrito para ser lido sem nenhum histórico de
conversa.

> **Divisão de trabalho:** esta sessão NÃO toca em nada de pagamento,
> assinatura, PIX, Asaas, cartão, cupom, plano ou cobrança. Isso é da outra
> sessão e as duas mexendo nos mesmos arquivos vão se atropelar.

## O produto

Equinology, SaaS veterinário equino. Quatro repositórios, todos na branch
`fix/lancamento`, tudo commitado e no GitHub:

| Repo | Caminho |
|---|---|
| API (NestJS + Prisma + Postgres) | `New Equinollogy/vetequus-api` |
| Web da clínica (Next.js) | `New Equinollogy/equinology-web-v2` |
| App do proprietário (Expo) | `New Equinollogy/equinology-app-v2` |
| Painel interno (Next.js) | `New Equinollogy/equinology-adm-v2` |

Três personas: a **equipe Equinology** (usa o ADM), a **clínica** (usa o web) e
o **proprietário do cavalo** (usa o app).

## Ambiente de teste

Já montado. Não precisa criar nada.

```
API:   http://localhost:3333    (npm run start:dev na vetequus-api)
Banco: docker exec vetequus-local psql -U postgres -d vetequus -c "SQL"
Asaas: SANDBOX  — não gera cobrança real
Email: MAIL_DRIVER=log — não dispara e-mail
```

Se o container estiver parado: `docker start vetequus-local`.

Comandos prisma **sempre** com override explícito, e confirme que a saída diz
`localhost:5442` antes de aplicar:
```
export DATABASE_URL="postgresql://postgres:docker@localhost:5442/vetequus?schema=public"
```
Proibido `prisma db push` e `prisma migrate reset`.

## Receita de fixture (validada, não redescubra)

```bash
# CNPJ válido — a API valida no Asaas, inválido dá 400
node -e "const n=[];for(let i=0;i<12;i++)n.push(Math.floor(Math.random()*9));const c=(a,p)=>{let s=0;for(let i=0;i<p.length;i++)s+=a[i]*p[i];const r=s%11;return r<2?0:11-r};n.push(c(n,[5,4,3,2,9,8,7,6,5,4,3,2]));n.push(c(n,[6,5,4,3,2,9,8,7,6,5,4,3,2]));console.log(n.join(''))"

# CPF válido e ÚNICO para cliente — repetido dá 409
node -e "const n=[];for(let i=0;i<9;i++)n.push(Math.floor(Math.random()*9));const c=(a,w)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*(w-i);const r=(s*10)%11;return r===10?0:r};n.push(c(n,10));n.push(c(n,11));console.log(n.join(''))"
```

`POST /user/register` exige também `address`, `number` e `postalCode` — sem eles
devolve 404 com mensagem enganosa. Senha mínima: 8 caracteres.

`POST /appointment`: o `appointmentType` vai **dentro** de `animals[]`, não na
raiz. Devolve 201 com **corpo vazio** — pegue o id em
`GET /appointment/fetch?page=1`; o `animals[0].id` é o `appointmentAnimalId` que
as fichas usam.

Login do proprietário: `POST /client/auth {email, password}` — a senha inicial é
o CPF dele.

Campo da vacina chama-se `location`, não `local`.

## Armadilhas que já custaram tempo

**Acentos no shell do Windows corrompem o payload.** Um teste deu 400 em
`"Ótima"` e parecia bug da API; era o terminal. Monte o JSON com Python e
`ensure_ascii=True`, ou use `--data-binary @arquivo.json`.

**Não use `git stash`.** Há trabalho de várias frentes no working tree.

**Se um `curl` devolver 000**, a API está recompilando (watch do Nest). Espere
~15s e repita — não conclua que quebrou.

**Se rodar agentes em paralelo, eles não podem editar a API enquanto alguém
testa.** Cada save reinicia o Nest e derruba o teste dos outros. Separe as fases:
testar, consolidar, corrigir, retestar.

**Cada agente usa a própria empresa e o próprio arquivo de token.** Dois agentes
já se atropelaram por compartilhar `token.txt`.

## O padrão de defeito desta base

Já apareceu **sete vezes**: *a checagem existe e nunca funciona*. Compara
`companyId` com `userId`; testa `tokenType === 'company'` num token `'user'`;
calcula a variável e ignora; ou — o caso mais recente — checa se a linha existe
enquanto a exclusão passou a ser lógica e a linha continua lá.

Sempre que encontrar uma validação, pergunte: **ela realmente dispara?** E
prove com `curl`.

## O que JÁ foi feito (não refaça)

Exclusão lógica em cliente, propriedade, animal, atendimento, usuário e produto,
com `includeDeleted` e botão/toggle no web. Revogação de sessão. Posse do animal
(fim do sequestro por código). Propriedade órfã. Acesso do proprietário às telas
de Saúde. Gravações silenciosas (ovulação, `nextDate`, parcelas, categoria).
Blindagem de negativos. As 5 seções de reprodução. Fichas: de 15 para 40
salvando. Fim dos 500 em entrada malformada (pipe global de uuid). Política de
senha e código de recuperação de uso único.

**Confirme antes de mexer.** A lista abaixo veio da varredura original e parte
dela já pode estar resolvida. Reproduza primeiro; se já estiver certo, marque e
siga.

## Os resíduos

Fonte completa com reprodução: `BLINDAGEM-API.md`. Agrupados:

### Contrato de resposta
- `POST` devolve 201 com **corpo vazio** em `/appointment`, `/user`,
  `/product-category`, `/note`, `/animal-note`, `/reminder`. Quem cria não
  recebe o id, então o front não consegue auto-selecionar nem navegar.
  (`/product`, `/animal`, `/client` e `/stud-farm` já devolvem.)

### Validação e mensagem
- **90 campos com a mesma mensagem em dois decorators** (`@IsString` e
  `@IsNotEmpty` com texto idêntico) — o usuário vê o erro duas vezes. Atinge
  login, cadastro, pagamento e CRM.
- Mensagens com nome técnico em inglês dentro de frase em português:
  *"amount deve ser um número"*, *"O campo utero é obrigatório"*,
  *"O campo spermogramVolume..."*.
- `CreateLeadDto.animalQuantity` diz *"Insira uma valor de crédito válida"* —
  mensagem de outro campo.
- `gender` e `sex` inválidos em `/animal` devolvem 404 *"Registro não
  encontrado"* em vez de 400 dizendo o valor aceito.
- Nenhum campo de texto tem limite de tamanho.
- `photoUrl` do animal aceita qualquer string.

### Filtros que mentem
- `GET /animal?color=` é aceito e **descartado em silêncio**.
- `city` e `breed` de `/appointment-animal` são case-sensitive e exigem
  igualdade exata: "campinas" não acha "Campinas".
- `status=RESCHEDULED` é rejeitado em `/appointment/fetch`, embora o status
  exista e seja usado.
- `GET /note/by-date` filtra por `createdAt` e ignora a data da anotação.
- `leadQuantity` do kanban ignora o filtro — o contador da coluna mente.
- Kanban entrega no máximo 10 leads por coluna e `GET /board` não pagina.
- `/animal-note/company` e `/animal-note/by-date` não paginam.

### Consistência de dado
- `endDate` anterior ao `startDate` é aceito e gravado em `POST`, `PUT` e
  reagendamento de atendimento.
- `PUT /animal` grava string vazia onde cliente e propriedade normalizam para
  `null`.
- `updatedAt` da empresa nunca é atualizado.
- Transferência geral↔volante não gera movimentação no extrato.
- Fases do CRM aceitam posição duplicada e mais de uma marcada como última.
- Animal pode ser criado em propriedade de outro cliente, sem aviso.

### Posse residual dentro da mesma empresa
- As 41 fichas aceitam e gravam `userId` (e `stallionId`) de **outra empresa** —
  vínculo cross-tenant no campo de responsável.
- `companyId` é aceito no Edit DTO das 41 e descartado em silêncio.
- `PUT /deworming/:id` exige o id repetido no corpo, quebrando o padrão dos
  outros módulos.

### Funcionalidade ausente
- `/reminder` **não notifica nada**: não existe job, push nem e-mail.
- Nenhuma ficha de saúde tem vínculo com atendimento.

## Decisões já tomadas pelo dono (respeite)

- `/note` e `/reminder` editáveis entre colegas da mesma clínica: **deixar como
  está**.
- Separação de papéis no ADM: **não mexer** — todos do ADM são da equipe interna.
- Campo que a tela não marca como obrigatório **não pode** ser `@IsNotEmpty` na
  API. Padrão: `@IsOptional()` + `@Transform(({value}) => value ?? '')` +
  default `''` (as colunas são NOT NULL; sem o transform, troca-se 400 por 500).
- Booleano clínico **nunca** recebe valor fabricado: um `false` inventado vira
  afirmação falsa em laudo assinado.
- O front **não** manda `"-"` para campo vazio; manda string vazia. O laudo
  filtra vazio e a tabela mostra travessão — o traço é decisão de exibição, não
  dado gravado.

## Como verificar (o método importa)

Para cada item: reproduza **antes**, corrija, reproduza **depois**, e reporte o
código HTTP que você **viu** — não o esperado. Onde a resposta for ambígua,
confirme no banco com SQL.

O teste mais valioso é o **ida e volta campo a campo**: envie, leia de volta,
compare. Foi assim que se achou o `cpf` que o controller aceitava e nunca
gravava, com a API respondendo "atualizado com sucesso".

Ao liberar qualquer acesso, teste o **lado negativo**: outra empresa, outro
cliente. Liberar demais é pior que o bug original.

`npx tsc --noEmit` exit 0 nos repos tocados. No web, também `npm run build` — o
tsc não pega erro de renderização do Next.
