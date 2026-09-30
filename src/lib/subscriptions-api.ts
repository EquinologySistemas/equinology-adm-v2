/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Subscription } from "@/types/admin";

export const API_SIGNATURE = "/admin/signature";

/** Maior página aceita por GET /admin/signature. */
const MAX_PAGE_SIZE = 200;

export const subscriptionStatusLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  TRIAL: "Trial",
};

export function subscriptionFromApi(
  row: Record<string, unknown>,
): Subscription {
  return {
    id: (row.id as string) ?? "",
    companyId: (row.companyId as string) ?? "",
    companyName: (row.companyName as string) ?? undefined,
    companyPrimaryEmail: (row.companyPrimaryEmail as string) ?? undefined,
    planId: (row.planId as string) ?? "",
    planName: (row.planName as string) ?? undefined,
    status: (row.status as Subscription["status"]) ?? "INACTIVE",
    expirationDate: row.expirationDate as string | undefined,
    yearly: row.yearly as boolean | undefined,
    isAutoRenewActivated: row.isAutoRenewActivated as boolean | undefined,
    hasRecurrence: row.hasRecurrence as boolean | undefined,
    createdAt: (row.createdAt as string) ?? "",
  };
}

/** Como a assinatura renova — o operador precisa ver cobrança avulsa. */
export function renewalLabel(s: Subscription): string {
  if (s.status === "TRIAL") return "Período de teste";
  // Recorrência aberta que ainda não recebeu o primeiro pagamento: o webhook
  // ativa quando o cliente pagar.
  if (
    s.status === "INACTIVE" &&
    s.isAutoRenewActivated !== false &&
    s.hasRecurrence !== false
  )
    return "Aguardando pagamento";
  if (s.hasRecurrence === false) return "Avulsa (não renova)";
  if (s.isAutoRenewActivated === false) return "Renovação desligada";
  return "Automática";
}

/**
 * Busca TODAS as assinaturas, página a página. A API pagina em no máximo
 * 200; a tela antes pedia só a primeira página (20) e escondia o resto.
 */
export async function fetchAllSubscriptions(
  GetAPI: (
    url: string,
    auth: boolean,
  ) => Promise<{ status: number; body: any }>,
  filters: { companyId?: string } = {},
): Promise<Subscription[] | null> {
  const all: Subscription[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(MAX_PAGE_SIZE),
    });
    if (filters.companyId) params.set("companyId", filters.companyId);
    const res = await GetAPI(`${API_SIGNATURE}?${params.toString()}`, true);
    if (res.status !== 200) return null;
    const list = Array.isArray(res.body?.subscriptions)
      ? res.body.subscriptions
      : [];
    all.push(
      ...list.map((row: Record<string, unknown>) => subscriptionFromApi(row)),
    );
    const total = typeof res.body?.total === "number" ? res.body.total : 0;
    if (list.length === 0 || all.length >= total) return all;
  }
}
