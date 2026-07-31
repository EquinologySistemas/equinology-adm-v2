# Auditoria do módulo de Atendimentos — 72 achados

> **Documento-fonte C** da consolidação. Extraído do artifact `397a59f2-7d7d-4a91-b63e-29f091e4b760`.
> Varredura campo a campo das fichas clínicas: formulário → envio → validação da API → banco → releitura na tela → edição → exclusão → exportação em PDF.
> Cobre Geral, Odontologia, Ortopedia e Reprodução nas quatro categorias reprodutivas, mais anexos e geração de laudo.
> **Nenhuma correção foi aplicada.** Frentes: Geral · Odontologia · Ortopedia · Reprodução Doadora e Garanhão · Reprodução Receptora e Matriz · PDF e datas · Anexos.

**Distribuição:** 17 críticos · 23 altos · 19 médios · 13 baixos (72 total)

---

## 1. Os três bugs já mapeados na bateria manual

### 1.1 Data em ISO cru no PDF — 21 campos, não 1
O gerador de PDF converte todo campo com `String(valor)` e **ignora o tipo `date`** que a definição da seção declara — enquanto a tabela da tela usa esse tipo e formata corretamente. Por isso a data sai como `2026-07-30T12:00:00.000Z`.

O alcance é toda a Reprodução, incluindo **Data Previsão Parto** — não apenas a ginecológica. Geral, Odontologia e Ortopedia não possuem campo de data, e é só por isso que o problema nunca apareceu lá. O preview do laudo na modal de histórico mostra o mesmo ISO cru.

**Onde:** `services/_data/servicePdf.tsx:71-74`

### 1.2 Várias imagens anexadas, só uma aparece — raiz de modelagem
Não existe tabela de anexos. Cada ficha tem uma única coluna `fileUrl`, e o multi-anexo foi implementado colando as URLs com quebra de linha dentro dessa mesma coluna — `"url1\nurl2"`.

Registros criados antes de 25/05/2026 têm no máximo um anexo: o componente antigo pegava só o primeiro arquivo e cada upload sobrescrevia o anterior, em silêncio. Hoje ainda reproduz em quatro cenários:
- o upload em lote **aborta no primeiro erro** e descarta o resto;
- o botão Salvar **não bloqueia durante o upload**, então salvar cedo grava o registro sem os anexos pendentes;
- **fotos HEIC de iPhone** sobem mas não renderizam em lugar nenhum;
- as seções mock perdem tudo no reload.

No app do cliente o efeito é pior: a string inteira com a quebra de linha é entregue ao abridor de links dentro de um tratamento de erro vazio — em registro com dois ou mais anexos o cliente **não abre nenhum e não vê mensagem alguma**.

**Onde:** `ServiceRecords.tsx:90-99, 379-388` · `components/ui/file-upload.tsx:150-175` · `app-v2/components/ui/AttachmentChip.tsx:20, 30-32`

### 1.3 Imagens difíceis de ver — levantamento do estado atual

| Onde | Comportamento atual |
|---|---|
| Formulário | Card de 56px com nome clicável que abre em nova aba |
| Tabela de registros | Miniatura de **36px**; o clique abre o arquivo cru em outra aba — sem lightbox, zoom ou carrossel |
| PDF | Miniatura fixa de 150×150pt com corte quadrado — **imagem retangular sai cortada**; um ultrassom fica ilegível |
| PDF · anexos | **Não existe** página dedicada nem visualização em tamanho grande |
| Preview da modal | Só texto, sem imagem — inconsistente com o PDF baixado, que traz as imagens |
| Não-imagens | PDF e vídeo anexados são **descartados do laudo em silêncio**, sem menção de que existiam |

---

## 2. O achado mais grave: o sistema inventa dado clínico

Quando o veterinário **não escolhe** uma opção, o código não envia "vazio" — envia uma afirmação clínica. Um laudo assinado pode declarar que o potro nasceu vivo, macho, de parto normal, sem ninguém ter respondido isso.

**11 ocorrências, todas em `boardRecordService.ts`:**

| Ficha | Campo | Grava sozinho |
|---|---|---|
| Parto — Receptora e Matriz | Tipo · Situação · Sexo | **Normal · Vivo · Macho** |
| Diagnóstico de gestação | Resultado | **Positivo** |
| Diagnóstico Final — Matriz | Batimento fetal · Compatível | **Sim · Sim** |
| Coleta de Embrião — Doadora | Coleta | **Positivo** |
| Exame Andrológico — Garanhão | Coleta | **Feita** |
| Teste de Armazenamento | Resultado | **Refrigerado** |
| Indução Hormonal — Doadora | Via de administração | **Intravenoso** |
| Avaliação Ginecológica | Paridade · Vulva · Vulvoplastia | **Primípara · Ótima · Não** |
| Exame Físico Ortopédico | Sensibilidade *(nem aparece na tela)* | **false** |
| Avaliação Periodontal | Raio-X *(nem aparece na tela)* | **false** |
| Diagnóstico de gestação | Data Previsão Parto | **a data do próprio exame** |

---

## 3. Funcionalidades quebradas de ponta a ponta

| O quê | Sintoma | Causa |
|---|---|---|
| **Coletas de Envio** (Garanhão) | Todo salvamento retorna erro | A API exige 9 campos de espermograma que o formulário não possui |
| **Editar Avaliação Periodontal** | Toda edição falha | A API exige `xRay`, que o front não envia |
| **Editar Diagnóstico Inicial** (Receptora) | Toda edição falha | Envia data de previsão vazia, rejeitada pelo validador |
| **Sêmen "Fresco"** | Impossível registrar | A opção existe na tela, mas a API só aceita Congelado e Refrigerado |
| **9 seções são mock puro** | Salvam com aviso de sucesso e **somem no F5** | Prescrições de Odontologia; Ginecológica, CIO, Indução e Cobertura da Matriz; Pós-parto da Receptora |
| **Diagnóstico Inicial e Final** (Receptora) | Registro duplica nas duas abas; excluir numa apaga o da outra | As duas abas gravam na mesma tabela, sem nada que as diferencie |

---

## 4. Dados que o usuário digita e o sistema descarta

- **OE / OD** — Ovário esquerdo e direito na Avaliação Ginecológica de Doadora e Receptora: os campos existem na tela, mas não há coluna no banco e o envio nem os inclui.
- **Método** — Inseminação, monta natural ou dirigida: a distinção que justifica a seção existir é perdida em 100% dos casos.
- **Garanhão e Volume** — Gravam no banco, mas a releitura não os traz: colunas sempre vazias e o modal de edição abre em branco.
- **Arquivo de ultrassom** — Existe coluna própria no banco; o front nunca lê nem grava nela.

---

## 5. Laudo com dado fictício e placeholder

### 5.1 [Crítico] Dados de demonstração vazam para o documento real
O laudo e a receita de atendimento Geral incluem registros de demonstração — *"Fenilbutazona 2g IV SID"*, *"Claudicação leve no MAD"* — de um animal que não é o do atendimento. O documento sai assinado com prescrição de outro paciente.

**Onde:** `ServiceRecords.tsx:481-488`

### 5.2 [Alto] Placeholders impressos no documento entregue ao cliente
Sem logo cadastrada, o PDF imprime literalmente `LOGO DO VETERINARIO AQUI`. Sem nome, imprime `Nome do veterinario`. Sem CRMV, imprime `CRMV` sozinho.

**Onde:** `lib/pdf/shared.tsx:228-235, 394-399`

### 5.3 [Crítico] Editar o Exame Físico Geral apaga dados
Editar pelo web sobrescreve com `-` os dez campos clínicos que o formulário não exibe: TPC, atitude, linfonodos, pulmonar, pulso, intestino, fezes, urina, tosse e narinas. Se foram preenchidos por outra via, são **destruídos permanentemente**.

**Onde:** `boardRecordService.ts:105-122` × `generalTest.service.ts:113-132`

### 5.4 [Crítico · Segurança] Prontuário de uma clínica acessível por outra
Editar, excluir e listar fichas não valida a empresa dona do registro: um usuário autenticado de outra clínica pode ler, alterar e apagar prontuários alheios conhecendo os identificadores. Agravante: a edição aceita receber a empresa e o animal, permitindo **reapontar** um registro para outra conta. Confirmado em todos os módulos de ficha.

---

## 6. Problemas que atravessam todas as fichas

| Problema | Efeito prático |
|---|---|
| **Do 11º registro em diante, o dado some** | A API entrega de dez em dez, a tela sempre pede a primeira página e não há paginador. Some da tela **e do laudo**. Como nenhuma consulta tem ordenação, quais dez aparecem é indefinido. |
| **Campos obrigatórios sem indicação** | Todos os campos são obrigatórios na API e nenhum é marcado na tela. Deixar um em branco gera erro com mensagem técnica emendada: `cervix é obrigatório,cyto é obrigatório…` |
| **Impossível limpar um campo** | A edição ignora valor vazio: apagar o texto e salvar mostra sucesso, mas o valor antigo volta. |
| **Impossível remover um anexo** | Mesmo padrão: remover todos os anexos e salvar não persiste; o anexo reaparece. |
| **Data volta um dia** | Campos de data pura exibem **um dia a menos** na tabela, enquanto o modal de edição mostra o dia certo. |
| **Data vazia vira "hoje"** | Em várias fichas de Reprodução, deixar a data em branco grava a data de hoje sem avisar. |
| **Salvar com sessão não carregada** | Se o contexto do usuário ainda não carregou, o salvamento cai no caminho mock: aviso de sucesso e o dado evapora. |
| **Troca de papel não persiste** | Ao atender uma égua doadora como Matriz, os registros vão para as tabelas de matriz — mas o reload volta para "Doadora" e os registros **somem da vista e do laudo**. |
| **Arquivos órfãos no armazenamento** | Não existe nenhuma exclusão no storage: trocar anexo, remover ou apagar o registro deixa o arquivo público para sempre. |
| **Upload sem validação de tipo** | A API aceita qualquer binário de até 200 MB carregado em memória — inclusive executável, com URL pública. |

---

## 7. Ordem sugerida de correção (do documento original)

Ordenada por risco assistencial e jurídico, depois por esforço.

1. **Defaults que inventam dado clínico** — risco assistencial e jurídico direto; a correção é localizada.
2. **Mock vazando para laudo e receita reais** — documento assinado com prescrição de outro animal.
3. **Data em ISO no PDF** — uma correção resolve os 21 campos de uma vez.
4. **As quatro funcionalidades que sempre falham** — Coletas de Envio, edição de Periodontal, edição de Diagnóstico Inicial e sêmen Fresco.
5. **Edição do Exame Físico Geral apagando os campos ocultos** — perda permanente e silenciosa.
6. **Isolamento entre clínicas** — antes de a base de clientes crescer.
7. **Paginação e ordenação** — dado invisível é indistinguível de dado perdido.
8. **Modelagem de anexos em tabela própria** — resolve o multi-imagem no web, no app e no PDF, e destrava miniaturas e visualização em tamanho grande.
9. **As nove seções mock** — decidir entre implementar a API ou remover da tela; hoje mentem sucesso.
