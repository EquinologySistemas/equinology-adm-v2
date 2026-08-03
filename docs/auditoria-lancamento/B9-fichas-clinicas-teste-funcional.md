# B9 — Fichas clínicas: teste funcional contra a API real

## Método

Para cada seção eu montei o payload que o veterinário produz na prática: **todos os
campos que a tela marca como obrigatórios** (`required: true` no `mock.ts`), mais
`animalId`, `userId` e a observação. Exatamente o que o front envia. Então disparei
contra a API rodando local.

Isso não é leitura de código — é a requisição real, com o corpo real.

## Resultado

| | |
|---|---|
| Seções testadas | 40 |
| **Salvam normalmente** | **15** |
| **Recusam salvar (400)** | **25** |

O veterinário preenche tudo que a tela pede, clica em Salvar e recebe uma lista de
erros técnicos sobre campos que não têm asterisco, aviso nem destaque na tela. O
registro não é criado — o dado clínico não existe nem em memória.

## As 25 seções que recusam salvar

| Seção | Campos que a API exige e a tela não marca |
|---|---|
| `general-service` | Queixa |
| `general-test` | Temperatura |
| `dentistry-exam` | Intestinal, Mucosa |
| `dentistry-assessment` | Gengiva |
| `dentistry-oral` | Mucosa, Vestíbulo |
| `ortho-service` | Pescoço, Queixa |
| `donor-gyno` | Ultrassom, utero |
| `donor-heat` | Ovário Esquerdo |
| `donor-ovulation` | Hormônio, Horário |
| `donor-insemination` | Garanhão, Horário |
| `donor-embryo` | Horário |
| `receptor-gyno` | ultrasound, utero |
| `receptor-heat` | Ovário Esquerdo |
| `receptor-hormones` | Hormônio, Horário |
| `receptor-inovulation` | Embrião, Horário |
| `receptor-diagnosis-initial` | Embrião, Freq. Cardíaca |
| `receptor-diagnosis-final` | Embrião, Freq. Cardíaca |
| `receptor-vaccines` | Tipo |
| `receptor-monitoring` | Ultrassom |
| `breeding-vaccines` | Tipo |
| `breeding-pregnancy` | Ultrassom |
| `breeding-post` | Potro |
| `stallion-physical` | behavior, inspection |
| `stallion-collections` | destination |
| `stallion-shipping` | Destinatário, Tipo |

## As 15 que funcionam

`general-info`, `general-prescription`, `dentistry-odontogram`, `dentistry-sedation`, `dentistry-prescription`, `ortho-dynamic`, `ortho-block`, `ortho-info`, `ortho-extra`, `ortho-prescription`, `receptor-final`, `breeding-initial`, `breeding-final`, `breeding-birth`, `stallion-storage`

## Achado paralelo: rótulos técnicos em inglês na mensagem

Algumas seções devolvem o nome interno do campo dentro de uma frase em português —
o veterinário lê *"O campo utero é obrigatório"*, *"O campo bodyScore é obrigatório"*,
*"O campo inspection é obrigatório"*, *"O campo spermogramVolume é obrigatório"*.
Atinge `donor-gyno`, `receptor-gyno`, `stallion-physical` e `stallion-collections`.

## Como corrigir

Para cada campo da tabela, decidir uma das duas:

1. **É clinicamente obrigatório** → marcar `required: true` no `mock.ts` para a tela
   avisar ANTES do envio.
2. **Não é obrigatório** → trocar `@IsNotEmpty()` por `@IsOptional()` no Create DTO,
   seguindo o padrão que o campo `observation` já usa.

A segunda opção é a mais provável na maioria: um exame físico em que o veterinário
mede só temperatura e peso é rotina, e hoje a API exige os 15 parâmetros.
