# Deploy em produção — checagem feita antes de subir

Revisão do SQL real e do impacto no front já publicado. Atualizado depois das
quatro levas de correção e do trabalho de pagamento.

## Resumo

**Vai quebrar?** Não, se você seguir a ordem e rodar as duas consultas de
pré-checagem abaixo. Uma delas pode **abortar a migration**; a outra muda o que
aparece na tela.

**Precisa de portabilidade de dados?** Não. Nenhuma migration move, converte ou
apaga dado. São 6 migrations, todas aditivas ou relaxando restrição:

| Migration | O que faz | Risco |
|---|---|---|
| `receptor_diagnosis_expectancy_date_nullable` | coluna aceita vazio | nenhum |
| `soft_delete_stud_farm_animal_appointment` | 3 colunas novas + `companyId` em `stud_farms` **com backfill** | ver checagem 2 |
| `segunda_leva` | 5 tabelas novas + 2 colunas novas | nenhum |
| `add_used_at_to_recover_password_code` | 1 coluna nova | nenhum |
| `unique_bank_payment_id` | 2 índices **UNIQUE** | ver checagem 1 |
| `add_stock_transfer_audit` | 1 tabela nova | nenhum |

Verificado: **zero** `DROP TABLE`, `DROP COLUMN`, `DELETE`, `TRUNCATE` ou
`SET NOT NULL` nas seis.

A branch `fix/lancamento` **mescla na main sem conflito** (7 commits).

---

## Antes de rodar o migrate: duas consultas

### 1. Duplicatas que fazem a migration ABORTAR

`unique_bank_payment_id` cria índice único. Se produção tiver dois registros com
o mesmo `bankPaymentId`, o `CREATE UNIQUE INDEX` **falha e o deploy para no
meio**.

```sql
SELECT 'invoices' tabela, "bankPaymentId", COUNT(*) FROM invoices
 WHERE "bankPaymentId" IS NOT NULL GROUP BY 2 HAVING COUNT(*) > 1
UNION ALL
SELECT 'transactions', "bankPaymentId", COUNT(*) FROM transactions
 WHERE "bankPaymentId" IS NOT NULL GROUP BY 2 HAVING COUNT(*) > 1;
```

**Zero linhas = pode seguir.** Se vier alguma, resolva antes: são duas cobranças
apontando para o mesmo id do gateway, o que já é um problema de conciliação
independente do deploy.

(No banco local: zero.)

### 2. Propriedades que vão sumir das telas

`soft_delete_stud_farm_animal_appointment` dá dono próprio às propriedades,
derivando de cliente, animal ou atendimento. As que não têm **nenhum** vínculo
ficam sem dono e **deixam de aparecer para qualquer clínica**.

```sql
SELECT COUNT(*) FROM stud_farms sf
WHERE sf."clientId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM animals a WHERE a."studFarmId" = sf.id)
  AND NOT EXISTS (SELECT 1 FROM appointments ap WHERE ap."studFarmId" = sf.id)
  AND NOT EXISTS (SELECT 1 FROM client_stud_farms cs WHERE cs."studFarmId" = sf.id);
```

Esse é o comportamento **correto** — hoje essas propriedades vazam para todas as
clínicas, que é o furo que a migration fecha. Mas se o número for alto, alguém
vai perguntar por que sumiram. Decida antes: atribuir a empresa na mão ou
aceitar.

(No banco local: 8 de 42.)

---

## A ordem

```
1. Backup do banco de produção
2. npx prisma migrate deploy
3. Deploy da API
4. Deploy do web / ADM / app
```

**Nunca inverta 2 e 3.** A API nova espera colunas que só existem depois da
migration; subindo antes, ela quebra na primeira requisição.

Entre 3 e 4 há uma janela em que o **front antigo** conversa com a **API nova**.
Verifiquei e é seguro: as mudanças são aditivas.

- `POST` passou a devolver corpo — o front antigo ignora, sem efeito
- Exclusão lógica — o front antigo não tem botão de excluir
- `includeDeleted` — parâmetro novo e opcional
- Pipe de uuid — **conferido**: todas as colunas `id` do banco são uuid; as de
  texto são `code`, que o pipe exclui de propósito
- Senha mínima de 8 caracteres — vale só para senha nova; **quem já tem senha
  curta continua entrando** (testado)

---

## Depois de subir, olhe estes dois

**Latência.** A revogação de sessão faz uma consulta por requisição (busca por
chave primária, uma coluna). É barato e foi decisão consciente — cache com TTL
reintroduziria, em escala menor, o bug que estávamos corrigindo. Mas é uma
query a mais em toda rota autenticada: vale acompanhar o tempo de resposta nas
primeiras horas.

**Sessões.** Se o `JWT_SECRET` for rotacionado junto (não é obrigatório para o
deploy), **todos os usuários são deslogados**. Se não rotacionar, ninguém é
afetado.

---

## O que continua em aberto

**Segredos no histórico do Git.** `JWT_SECRET`, senha do RDS, chaves do R2, SMTP
e token do webhook estão num commit já enviado ao remoto. O arquivo saiu do
índice; o histórico não. Decisão do dono foi não rotacionar.

A consequência técnica, registrada sem insistir: enquanto essa chave for
conhecida, a revogação de sessão vale menos do que deveria — quem a tiver assina
um token novo e passa por todas as checagens.

**Rotas de demonstração públicas no web:** `/odontograma-novo`,
`/odontograma-novo-v2`, `/odontograma-pdf-check`, `/logo-pdf-check`. Acessíveis
sem login.

**Nenhum dos três fronts foi testado em navegador.** Toda a validação foi por
chamada de API. Os botões de exclusão e o filtro de excluídos criados agora
nunca foram clicados.
