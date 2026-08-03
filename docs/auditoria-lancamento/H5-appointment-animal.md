# H5 — appointment-animal: validação e estado

Escopo: `PUT /appointment-animal/:id` e `PUT /appointment-animal/details/:id`.
Módulo `appointment` **não** foi tocado.

Ambiente: API local `http://localhost:3333`, empresa criada só para esta
frente, animal `Trovao H5`, 3 vínculos animal-atendimento.

## Arquivos alterados (vetequus-api)

- `src/infra/http/controllers/appointment/dto/appointmentAnimal.dto.ts`
- `src/infra/http/controllers/appointment/appointmentAnimal.controller.ts`
- `src/domain/application/services/appointment/services/appointmentAnimal.service.ts`
- `src/domain/application/services/appointment/interfaces/appointmentAnimalProps.ts`

## Caso 1 — o DTO existia e nunca era aplicado (CONFIRMADO, corrigido)

Causa raiz: o `ValidationPipe` global (`src/infra/main.ts`) só roda quando o
`@Body()` é tipado por uma **classe**. As duas rotas de PUT usavam um `type`
inline (`EditBodyProps`), então nenhum decorator do `class-validator` era
avaliado. O DTO `AnimalAppointmentDto` do arquivo
`dto/appointmentAnimal.dto.ts` não era importado em lugar nenhum do projeto.

Reprodução ANTES:

| corpo | antes | depois |
|---|---|---|
| `{"status":"BANANA"}` | **500** genérico (estouro do Prisma) | **400** com mensagem |
| `{"appointmentType":"<300 chars>"}` | **200**, gravou 300 caracteres | **400** |
| `{"appointmentType":""}` | **200**, apagava o tipo | **400** |
| `{}` | **200** sem gravar nada (gravação silenciosa) | **400** |
| `{"status":"RESCHEDULED"}` | **200**, gravava `RESCHEDULED` com `rescheduledTo = null` | **400** |
| `PUT details/:id {"status":"XPTO"}` | **500** | **400** |

O que foi feito:

- DTO renomeado para `EditAppointmentAnimalDto` e ligado nas duas rotas.
- `status`: `@IsEnum` com `PENDING | IN_PROGRESS | FINISHED`.
- `appointmentType`: `@IsString` + `@IsNotEmpty` + `@MaxLength(100)` (o mesmo
  limite que o `AnimalAppointmentDto` do POST /appointment já usava).
- Corpo sem nenhum dos dois campos é recusado (`assertHasChanges` no
  controller), em vez de devolver 200 fingindo que salvou.

### Por que `RESCHEDULED` ficou de fora do enum

`RESCHEDULED` existe no enum do Prisma, mas é um **estado derivado**: quem o
grava é o reagendamento em `appointment.service.ts`, que na mesma operação
preenche `rescheduledTo` e cria a linha-fantasma no atendimento de origem.
Aceitá-lo pelo `appointment-animal` produzia o par inconsistente
`status = RESCHEDULED` / `rescheduledTo = null` — o animal some da agenda
(`DashboardHomeDayAgenda` filtra `status !== "RESCHEDULED"`) e a tag
"Reagendado p/ DD/MM" fica sem data.

A web nunca manda `RESCHEDULED` nesta rota: o `ChangeAppointmentStatusSheet`
converte a opção "Reagendado" em `PUT /appointment` (datas) + `PUT
/appointment-animal {status:"PENDING"}`.

## Caso 2 — transição de status

Estado medido: dava para pular etapa (`PENDING -> FINISHED`) e finalizar duas
vezes.

### O que foi IMPLEMENTADO

Uma única regra de estado, a que não conflita com a interface real:
**linha com `status = RESCHEDULED` é histórico e não aceita mais edição.**

```
PUT /appointment-animal/<linha RESCHEDULED> {"status":"IN_PROGRESS"}
-> 400 "Este atendimento foi reagendado para outra data e ficou como
   histórico. Altere o status na nova data do atendimento."
```

Essa linha é o registro-fantasma que o reagendamento deixa no atendimento de
ORIGEM; o atendimento de verdade seguiu para outra data, em outra linha.
Editá-la ressuscitava um atendimento na data velha. A web já esconde os botões
"Reagendar", "Retorno" e a mudança de status nessas linhas
(`AppointmentDetailsModal.tsx`, `ReturnAppointmentAnimalSheet.tsx`,
`RescheduleAppointmentSheet.tsx`, `DashboardHomeDayAgenda.tsx`) — aqui fechamos
pela API. Zero impacto na tela.

### O que NÃO foi imposto — proposta, não imposição

A máquina estrita `PENDING -> IN_PROGRESS -> FINISHED` **quebraria a interface
que o dono já usa**. Levantamento dos chamadores reais:

| tela | transição que produz |
|---|---|
| `ChangeAppointmentStatusSheet` | qualquer um dos 3 a partir de qualquer um dos 3 — a opção "Agendado" é descrita como "Volta para a agenda" |
| `ChangeAppointmentStatusSheet` (reagendar) | `FINISHED -> PENDING` |
| `services/[id]/page.tsx` | `PENDING -> IN_PROGRESS`; finalizar já é travado na tela (`"Inicie o atendimento antes de finalizá-lo."`) |
| `QuickStartAppointmentSheet` | `PENDING -> IN_PROGRESS` |
| `ReturnAppointmentAnimalSheet` | `-> FINISHED` a partir de **qualquer** status, inclusive `PENDING` |
| `ReturnAppointmentSheet` | `-> FINISHED`, com guarda de já-finalizado na tela |

Ou seja: `PENDING -> FINISHED` e `FINISHED -> PENDING` são fluxos que a
interface produz de propósito (retorno agendado sem iniciar o atendimento;
correção de status marcado por engano). Travar isso na API viraria erro em
botão que hoje funciona.

`FINISHED -> FINISHED` também foi mantido como 200 de propósito: o
`ChangeAppointmentStatusSheet` abre com o status atual já marcado, então salvar
sem trocar nada manda o mesmo status. Recusar isso mostraria toast de erro numa
ação inofensiva. O efeito é idempotente — não duplica nada no banco.

**Proposta para o dono decidir**, se quiser endurecer depois (exige mexer na
web junto):

1. Só permitir `-> FINISHED` a partir de `IN_PROGRESS`, e o
   `ReturnAppointmentAnimalSheet` passar a fazer `IN_PROGRESS` antes de
   `FINISHED`. Ganho clínico: nenhum atendimento consta como executado sem ter
   sido aberto.
2. Exigir confirmação explícita para `FINISHED -> PENDING` (reabrir
   atendimento), gravando quem reabriu. Hoje a web já pede confirmação para
   sair de `IN_PROGRESS`, mas não para reabrir um finalizado.

Nenhuma das duas foi implementada — ambas mudam o comportamento de botões que
o veterinário já usa.

## Verificação ao vivo

Recusas (todas retestadas depois do reload do watch):

```
{"status":"BANANA"}              -> 400 "Status inválido. Use PENDING (agendado),
                                    IN_PROGRESS (em andamento) ou FINISHED
                                    (finalizado). Para reagendar, use a opção
                                    'Reagendado' da tela de atendimento..."
{"appointmentType":"<300>"}      -> 400 "O tipo de atendimento deve ter no
                                    máximo 100 caracteres"
{"appointmentType":""}           -> 400 "O tipo de atendimento não pode ficar
                                    em branco"
{}                               -> 400 "Informe o novo status ou o tipo de
                                    atendimento para alterar."
{"status":"RESCHEDULED"}         -> 400 (mesma mensagem do enum)
details/:id {"status":"XPTO"}    -> 400 (mesma mensagem)
linha RESCHEDULED, qualquer body -> 400 "Este atendimento foi reagendado..."
```

Caminho feliz — exatamente o que a web manda:

```
{"status":"IN_PROGRESS"}    -> 200
{"status":"FINISHED"}       -> 200
{"status":"PENDING"}        -> 200
{"status":"FINISHED"}       -> 200  (idempotente, sem duplicar)
{"appointmentType":"Odontologia"} -> 200
banco: status=FINISHED, appointmentType='Odontologia'
```

Fluxo completo do `ChangeAppointmentStatusSheet` (opção "Reagendado"):

```
PUT /appointment/:id {startDate,endDate,description} -> 200
PUT /appointment-animal/:id {"status":"PENDING"}     -> 200
banco: status=PENDING
```

Segurança (lado negativo, depois da correção):

```
outra empresa  -> 403 "Você não tem permissão para realizar esta ação."
sem token      -> 401
```

`npx tsc --noEmit`: nenhum erro nos 4 arquivos desta frente. O repositório
acusa erros em `crm/leadProps.ts` e `crm/lead.controller.ts`, de outro agente
editando em paralelo.
