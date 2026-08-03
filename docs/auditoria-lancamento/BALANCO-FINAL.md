# Balanço final — o que foi feito e o que ficou

Escrito no fim do dia de trabalho, com o dono ausente. Tudo commitado e enviado
para o GitHub na branch `fix/lancamento` dos quatro repositórios.

## Como o dia foi medido

| | |
|---|---|
| Rotas da API | 391 |
| Rotas exercitadas por chamada real | 363 (93%) |
| Chamadas de verificação | ~1.300 |
| Achados catalogados | 180 (44 bloqueadores) |

Tudo foi testado contra a API rodando com banco real, Asaas em sandbox e e-mail
em modo log. Nenhuma conclusão veio só de leitura de código — e quando veio,
está marcada como tal.

## Commits

| Repo | Commits |
|---|---|
| vetequus-api | `eeeec4b`, `25e622e`, `5d79b1e` |
| equinology-web-v2 | `2e67427`, `07bff32` |
| equinology-app-v2 | `7e3729c`, `cc5121e` |
| equinology-adm-v2 | `8db7f3a`, `63af58a` (documentação) |

## O que foi corrigido e verificado

**Exclusão.** Cliente, propriedade, animal, atendimento, usuário e produto. Era
impossível antes: `DELETE /appointment` falhava em 100% dos casos e
`DELETE /client` sempre que havia animal. Agora é exclusão lógica, o histórico
sobrevive, o registro some das listas e volta com o filtro. Com botão e toggle
no web — que não existiam em tela nenhuma.

**Sessão revogada.** Usuário ou admin excluído perde acesso na hora. Antes o
token valia 90 dias e o excluído continuava gravando.

**Isolamento.** Fechados: sequestro de animal por código, propriedade órfã
visível e editável por todas as clínicas, anotação do proprietário gravada no
atendimento de outra clínica, lead e movimentação aceitando id de outra empresa,
e o vazamento de dados entre dois proprietários no app.

**Acesso do proprietário.** As 5 telas de Saúde do app devolviam 403 em 100% dos
casos, e a ficha do animal apontava para a rota errada. As duas coisas
funcionam.

**O que respondia "salvo" sem salvar.** Ovulação, próxima dose, parcelas da
movimentação, categoria de produto. A próxima dose exigiu correção nos dois
lados — a API aceitava o pedido de limpar e o front nunca o enviava.

**Fichas clínicas.** De 15 para 40 seções aceitando o que a tela pede. As 5
seções de reprodução que não existiam foram implementadas. O front parou de
gravar `"-"` em 173 campos — traço fabricado que virava achado clínico falso em
laudo assinado.

**Nenhum 500 em entrada malformada.** Era o pedido explícito do dono. Resolvido
de forma sistêmica, não com remendos: um pipe global de uuid, um tradutor de
erro do Prisma e decorators de paginação em 64 DTOs. Verificado em 11 rotas.

**Senha.** Mínimo de 8 caracteres nos três pontos de escrita, sem quebrar o
login de quem já tem senha curta. Código de recuperação passou a valer uma vez
só — era reutilizável para sempre.

## O que ficou, e por quê

### Dinheiro e Asaas — 48 achados, 15 bloqueadores
Parado por decisão do dono, que vai tratar por último. Ver
`DINHEIRO-E-ASAAS.md`. Os que mais pesam quando entrar dinheiro real: reembolso
que não cancela a recorrência, troca de plano que deixa o cliente sem cobrança,
trial que vira assinatura paga sem pagamento, e cartão salvo que não repassa à
clínica.

### Os três fronts nunca foram abertos num navegador
A lacuna mais relevante. Web, ADM e app foram validados apenas por chamada de
API. **Os botões de excluir e o toggle de excluídos criados hoje não foram
clicados por ninguém.** Bug de renderização, máscara que corrompe valor no
submit e modal que reabre vazia não aparecem em teste de API.

O dono adiou para depois das correções. É o próximo passo natural.

### Segredos no histórico do Git
`JWT_SECRET`, senha do RDS de produção, chaves do R2, SMTP e token do webhook
Asaas estão num commit do repositório, já no remoto. O arquivo saiu do índice,
o histórico não. O dono avaliou e decidiu não rotacionar.

Registro a consequência técnica, sem insistir: enquanto o `JWT_SECRET` for
conhecido, a revogação de sessão implementada hoje vale menos do que deveria —
quem tiver a chave assina um token novo e passa por todas as checagens.

### Ação de estoque pela linha — não reproduzido
O dono relatou que a modal aberta a partir de um item da lista ainda pede para
escolher o produto. Investiguei o caminho inteiro: as ações de linha das duas
tabelas passam o id do produto, as duas páginas repassam, e as quatro modais já
ramificam — com produto vindo da linha, mostram o nome como texto fixo e **não**
renderizam o seletor.

Ou seja, nesta branch o comportamento já é o desejado. Três hipóteses: o
ambiente observado é um deploy antigo; a modal fica presa em "Carregando…"
porque a busca do produto por id falha (não consegui testar, a API estava
reiniciando); ou é outra tela. **Não alterei nada** — mexer aqui arriscaria
quebrar o caminho do cabeçalho do card, onde o seletor é legítimo.

Precisa que o dono aponte a tela exata.

### Itens menores em aberto
Ver `BLINDAGEM-API.md`. Os graves e menores que sobraram são de menor impacto:
mensagens duplicadas de validação (90 campos com o mesmo texto em dois
decorators), rótulos técnicos em inglês em algumas mensagens, filtros
case-sensitive, e o `POST /appointment` devolvendo 201 com corpo vazio.

Decisões do dono que deixaram itens de fora, de propósito:
- `/note` e `/reminder` editáveis entre colegas da mesma clínica ("pode deixar
  assim")
- separação de papéis no ADM ("todos do adm vão ser da empresa interna")

## Antes de subir para produção

Ler `DEPLOY-PRODUCAO.md`. O resumo:

1. Backup, depois `prisma migrate deploy`, depois a aplicação. Nunca invertido.
2. **Rodar antes a consulta que conta as propriedades sem dono derivável.** Elas
   ficam invisíveis após a migration. No banco local foram 7 de 42.
3. Nenhuma variável de ambiente nova.
4. As rotas de demonstração do web (`/odontograma-novo`, `/odontograma-novo-v2`,
   `/odontograma-pdf-check`, `/logo-pdf-check`) ficam públicas.
