import type { FinancialSummary, SubscriptionTransaction } from "@/types/admin";

const API_FINANCIAL_SUMMARY = "/admin/financial/summary";
const API_FINANCIAL_TRANSACTIONS = "/admin/financial/transactions";

export interface GetSubscriptionTransactionsParams {
  startDate?: string;
  endDate?: string;
  status?: string;
  companyId?: string;
  page?: number;
  pageSize?: number;
}

export interface GetSubscriptionTransactionsResponse {
  transactions: SubscriptionTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getFinancialSummary(
  GetAPI: (
    path: string,
    showError?: boolean,
  ) => Promise<{
    status: number;
    body?: unknown;
  }>,
): Promise<FinancialSummary | null> {
  const res = await GetAPI(API_FINANCIAL_SUMMARY, true);
  if (res.status === 200 && res.body && typeof res.body === "object") {
    return financialSummaryFromApi(res.body as Record<string, unknown>);
  }
  return null;
}

export async function getSubscriptionTransactions(
  GetAPI: (
    path: string,
    showError?: boolean,
  ) => Promise<{
    status: number;
    body?: unknown;
  }>,
  params?: GetSubscriptionTransactionsParams,
): Promise<GetSubscriptionTransactionsResponse | null> {
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.append("startDate", params.startDate);
  if (params?.endDate) queryParams.append("endDate", params.endDate);
  if (params?.status) queryParams.append("status", params.status);
  if (params?.companyId) queryParams.append("companyId", params.companyId);
  if (params?.page) queryParams.append("page", String(params.page));
  if (params?.pageSize) queryParams.append("pageSize", String(params.pageSize));

  const url = queryParams.toString()
    ? `${API_FINANCIAL_TRANSACTIONS}?${queryParams.toString()}`
    : API_FINANCIAL_TRANSACTIONS;

  const res = await GetAPI(url, true);
  if (res.status === 200 && res.body && typeof res.body === "object") {
    const body = res.body as Record<string, unknown>;
    const rawList = body.transactions;
    return {
      transactions: Array.isArray(rawList)
        ? rawList.map((t: unknown) =>
            subscriptionTransactionFromApi(t as Record<string, unknown>),
          )
        : [],
      total: typeof body.total === "number" ? body.total : 0,
      page: typeof body.page === "number" ? body.page : 1,
      pageSize: typeof body.pageSize === "number" ? body.pageSize : 20,
    };
  }
  return null;
}

function financialSummaryFromApi(
  raw: Record<string, unknown>,
): FinancialSummary {
  return {
    revenueMonth: typeof raw.revenueMonth === "number" ? raw.revenueMonth : 0,
    revenuePreviousMonth:
      typeof raw.revenuePreviousMonth === "number"
        ? raw.revenuePreviousMonth
        : 0,
    activeSubscriptions:
      typeof raw.activeSubscriptions === "number" ? raw.activeSubscriptions : 0,
    trialSubscriptions:
      typeof raw.trialSubscriptions === "number" ? raw.trialSubscriptions : 0,
  };
}

function subscriptionTransactionFromApi(
  raw: Record<string, unknown>,
): SubscriptionTransaction {
  return {
    id: String(raw.id ?? ""),
    signatureId: String(raw.signatureId ?? ""),
    companyName: String(raw.companyName ?? ""),
    planName: String(raw.planName ?? ""),
    value: typeof raw.value === "number" ? raw.value : 0,
    dueDate: String(raw.dueDate ?? ""),
    paymentDate: raw.paymentDate ? String(raw.paymentDate) : undefined,
    status: String(raw.status ?? "PENDING"),
    paymentMethod: String(raw.paymentMethod ?? ""),
    createdAt: String(raw.createdAt ?? ""),
  };
}
