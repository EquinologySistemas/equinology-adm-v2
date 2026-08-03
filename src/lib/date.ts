/**
 * Formatação de datas vindas da API/provedor de pagamento.
 *
 * O Asaas devolve datas puras no formato `YYYY-MM-DD` (vencimento e data de
 * liquidação). `new Date("2026-08-03")` é interpretado como meia-noite UTC e,
 * no fuso do Brasil (UTC-3), `toLocaleDateString("pt-BR")` imprime
 * **02/08/2026** — um dia a menos. Numa tela de dinheiro isso significa
 * mostrar o pagamento no dia errado (e, na virada do mês, no mês errado).
 *
 * `formatDate` trata a data pura como data local e só cai para `new Date`
 * quando o valor tem hora (ISO completo, como `createdAt`).
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDate(value?: string | null): string {
  if (!value) return "—";

  const match = DATE_ONLY.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
