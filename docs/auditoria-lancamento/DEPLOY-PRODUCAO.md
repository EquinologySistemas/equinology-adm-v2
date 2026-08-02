# Deploy em produção — o que precisa acontecer, e em que ordem

Escrito antes do lançamento, a partir da revisão do SQL real. Nenhuma das
migrations abaixo rodou em produção ainda.

## Ordem obrigatória

**Migrar o banco primeiro, subir a aplicação depois.** Se subir invertido, a API
pede colunas que ainda não existem e quebra na primeira requisição.

```
1. backup do banco de produção
2. npx prisma migrate deploy
3. deploy da API
4. deploy do web / ADM / app
```

## As 3 migrations pendentes

Nenhuma apaga dado. Todas são aditivas ou relaxam restrição — não há `DROP
TABLE`, `DROP COLUMN` nem `DELETE`.

### `20260802163632_receptor_diagnosis_expectancy_date_nullable`
Uma linha: `expectancyDate` do diagnóstico da receptora passa a aceitar vazio.
Relaxa restrição, não rejeita dado existente. Risco: nenhum.

### `20260802184137_soft_delete_stud_farm_animal_appointment`
Colunas de exclusão lógica em `animals`, `appointments` e `stud_farms`, mais a
coluna `companyId` em `stud_farms` com **backfill**.

**Atenção — este é o único ponto que exige conferência antes.** O backfill
deriva a empresa dona da propriedade a partir dos vínculos existentes (animais,
atendimentos, cliente). No banco local, 35 de 42 propriedades ganharam dono e
**7 ficaram sem**, por não terem nenhum vínculo do qual derivar.

Consequência: propriedade sem dono derivável **fica invisível para todo mundo**.
São exatamente as que hoje vazam para todas as clínicas, então o comportamento
novo é o correto — mas se houver propriedades assim em produção, elas somem da
tela e alguém vai perguntar por quê.

Rode isto **antes** do deploy para saber o tamanho:

```sql
SELECT COUNT(*) FROM stud_farms sf
WHERE sf."clientId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM animals a WHERE a."studFarmId" = sf.id)
  AND NOT EXISTS (SELECT 1 FROM appointments ap WHERE ap."studFarmId" = sf.id)
  AND NOT EXISTS (SELECT 1 FROM client_stud_farms cs WHERE cs."studFarmId" = sf.id);
```

Se o número for zero, siga sem preocupação. Se não for, decida antes: atribuir
manualmente a empresa correta, ou aceitar que sumam.

### `20260802192218_segunda_leva`
5 tabelas novas de reprodução (as seções da Matriz e o Pós-parto da Receptora),
mais as colunas de exclusão lógica em `users` e `products`. Tabelas novas nascem
vazias; as colunas são nulas. Risco: nenhum.

## Variáveis de ambiente

Nenhuma variável nova foi introduzida. O `.env` de produção continua válido.

## O que NÃO está resolvido e afeta o deploy

**Segredos no histórico do Git.** `JWT_SECRET`, senha do RDS de produção, chaves
do R2, SMTP e o token do webhook Asaas estão num commit do repositório. O
arquivo foi removido do índice, mas o histórico permanece e já está no remoto.
Enquanto o `JWT_SECRET` não for rotacionado, a revogação de sessão implementada
hoje vale menos do que deveria: quem tiver a chave assina um token novo.

**Rotas de demonstração públicas no web:** `/odontograma-novo`,
`/odontograma-novo-v2`, `/odontograma-pdf-check` e `/logo-pdf-check`. Ficam
acessíveis sem login.

**O bucket de dinheiro/Asaas** — 48 achados, 15 bloqueadores — segue intocado
por decisão do dono. Ver `DINHEIRO-E-ASAAS.md`. Vários só se manifestam quando
entra dinheiro real: reembolso que não cancela a recorrência, troca de plano que
deixa o cliente sem cobrança, e o trial que vira assinatura paga sem pagamento.

**Os três fronts nunca foram testados em navegador.** Toda a validação até aqui
foi por chamada de API. Botões e telas criados hoje — exclusão e filtro de
excluídos — não foram clicados por ninguém.
