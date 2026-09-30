import type { Plan } from "@/types/admin";

/** Normaliza um item retornado por GET `/admin/plans` (ou `/signature-plan`) para o tipo `Plan` da UI. */
export function planFromApi(apiPlan: Record<string, unknown>): Plan {
  const uq = apiPlan.userQuantity;
  const maxUsers = typeof uq === "number" && !Number.isNaN(uq) ? uq : undefined;
  const ac = apiPlan.activeClientsCount;
  const activeClientsCount =
    typeof ac === "number" && !Number.isNaN(ac) ? ac : 0;

  return {
    id: apiPlan.id as string,
    name: (apiPlan.name as string) ?? "",
    description: apiPlan.description as string | undefined,
    maxUsers,
    activeClientsCount,
    priceCard: apiPlan.creditCardPrice as number | undefined,
    pricePix: apiPlan.pixPrice as number | undefined,
    active: apiPlan.isActive as boolean | undefined,
    annualDiscountPercent: apiPlan.yearlyDiscount as number | undefined,
    trialDays: apiPlan.trialDays as number | undefined,
  };
}

/** Planos para o painel: GET /admin/plans traz ativos e inativos. */
export const API_ADMIN_PLANS = "/admin/plans";

export async function fetchAdminPlans(
  GetAPI: (
    url: string,
    auth: boolean,
  ) => Promise<{ status: number; body: { plans?: unknown } | null }>,
): Promise<Plan[] | null> {
  const res = await GetAPI(API_ADMIN_PLANS, true);
  if (res.status !== 200) return null;
  const raw = res.body?.plans;
  const list = Array.isArray(raw) ? raw : [];
  return list.map((p: Record<string, unknown>) => planFromApi(p));
}
