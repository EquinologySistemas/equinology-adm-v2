"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApiContext } from "@/context/ApiContext";
import {
  getFinancialSummary,
  getSubscriptionTransactions,
} from "@/lib/financial-api";
import type { FinancialSummary, Subscription, SubscriptionTransaction } from "@/types/admin";
import {
  Users,
  CreditCard,
  Ticket,
  Megaphone,
  TrendingUp,
  TrendingDown,
  FileText,
  Building2,
  ArrowRight,
} from "lucide-react";

const API_USERS = "/admin/users";
const API_COMPANIES = "/admin/companies";
const API_PLANS = "/signature-plan";
const API_COUPONS = "/admin/coupons";
const API_ADS = "/admin/ads";
const API_SIGNATURE = "/admin/signature";
const API_ADMIN_ME = "/admin/auth/me";

const txStatusLabels: Record<string, string> = {
  PAID: "Pago",
  RECEIVED: "Recebido",
  PENDING: "Pendente",
  OVERDUE: "Vencido",
};

const subscriptionStatusLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  TRIAL: "Trial",
};

interface OperationalCounts {
  usersTotal: number;
  companiesTotal: number;
  plansActive: number;
  couponsTotal: number;
  adsActive: number;
}

const defaultOperational: OperationalCounts = {
  usersTotal: 0,
  companiesTotal: 0,
  plansActive: 0,
  couponsTotal: 0,
  adsActive: 0,
};

function MetricCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--dash-text-muted)]">
            {title}
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function normalizeSubscription(row: Record<string, unknown>): Subscription {
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
    createdAt: (row.createdAt as string) ?? "",
  };
}

export default function DashboardPage() {
  const { GetAPI } = useApiContext();

  /** Compatível com a assinatura esperada por financial-api (2º parâmetro opcional). */
  function getApiLoose(path: string, auth?: boolean) {
    return GetAPI(path, auth ?? true);
  }

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [operational, setOperational] =
    useState<OperationalCounts>(defaultOperational);
  const [recentTransactions, setRecentTransactions] = useState<
    SubscriptionTransaction[]
  >([]);
  const [recentSubscriptions, setRecentSubscriptions] = useState<
    Subscription[]
  >([]);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [
          summaryData,
          txData,
          usersRes,
          companiesRes,
          plansRes,
          couponsRes,
          adsRes,
          signatureRes,
          meRes,
        ] = await Promise.all([
          getFinancialSummary(getApiLoose),
          getSubscriptionTransactions(getApiLoose, { page: 1, pageSize: 5 }),
          GetAPI(API_USERS, true),
          GetAPI(API_COMPANIES, true),
          GetAPI(API_PLANS, true),
          GetAPI(API_COUPONS, true),
          GetAPI(API_ADS, true),
          GetAPI(API_SIGNATURE, true),
          GetAPI(API_ADMIN_ME, true),
        ]);

        if (cancelled) return;

        if (meRes.status === 200 && meRes.body?.admin) {
          const a = meRes.body.admin as {
            name?: string;
            email?: string;
          };
          setWelcomeName(a.name?.trim() || a.email || null);
        } else {
          setWelcomeName(null);
        }

        if (summaryData) {
          setSummary(summaryData);
        } else {
          setSummary(null);
        }

        setRecentTransactions(txData?.transactions ?? []);

        if (signatureRes.status === 200) {
          const data =
            signatureRes.body?.subscriptions ?? signatureRes.body?.data ?? [];
          const list = Array.isArray(data) ? data : [];
          const subs = list.map((row: Record<string, unknown>) =>
            normalizeSubscription(row),
          );
          const sorted = [...subs].sort((a, b) => {
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            return tb - ta;
          });
          setRecentSubscriptions(sorted.slice(0, 5));
        } else {
          setRecentSubscriptions([]);
        }

        const users =
          usersRes.status === 200 ? (usersRes.body?.users ?? []) : [];
        const companiesRaw =
          companiesRes.status === 200
            ? companiesRes.body?.companies ??
              (Array.isArray(companiesRes.body) ? companiesRes.body : [])
            : [];
        const plans =
          plansRes.status === 200
            ? Array.isArray(plansRes.body)
              ? plansRes.body
              : (plansRes.body?.plans ?? [])
            : [];
        const coupons =
          couponsRes.status === 200
            ? Array.isArray(couponsRes.body)
              ? couponsRes.body
              : (couponsRes.body?.coupons ?? [])
            : [];
        const ads =
          adsRes.status === 200
            ? Array.isArray(adsRes.body)
              ? adsRes.body
              : (adsRes.body?.advertisements ?? [])
            : [];

        const plansList = Array.isArray(plans) ? plans : [];
        const activePlans = plansList.filter(
          (p: { active?: boolean }) => p.active !== false,
        );
        const adsList = Array.isArray(ads) ? ads : [];
        const activeAds = adsList.filter(
          (a: { active?: boolean }) => a.active !== false,
        );
        const companiesList = Array.isArray(companiesRaw) ? companiesRaw : [];

        setOperational({
          usersTotal: Array.isArray(users) ? users.length : 0,
          companiesTotal: companiesList.length,
          plansActive: activePlans.length,
          couponsTotal: Array.isArray(coupons) ? coupons.length : 0,
          adsActive: activeAds.length,
        });
      } catch {
        if (!cancelled) {
          setSummary(null);
          setOperational(defaultOperational);
          setRecentTransactions([]);
          setRecentSubscriptions([]);
          setWelcomeName(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [GetAPI]);

  const revenueTrendPercent = useMemo(() => {
    if (!summary || summary.revenuePreviousMonth <= 0) return null;
    return Math.abs(
      ((summary.revenueMonth - summary.revenuePreviousMonth) /
        summary.revenuePreviousMonth) *
        100,
    );
  }, [summary]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--dash-border)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)]"
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">
          {welcomeName ? `Olá, ${welcomeName}` : "Visão geral"}
        </h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          {welcomeName
            ? "Resumo financeiro, cadastros e atividade recente do painel."
            : "Métricas e indicadores do painel administrativo"}
        </p>
      </div>

      <div>
        <h3 className="mb-4 text-sm font-medium text-[var(--dash-text-muted)]">
          Financeiro e carteira de assinaturas
        </h3>
        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
              <p className="text-sm font-medium text-[var(--dash-text-muted)]">
                Receita do mês
              </p>
              <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
                Pagamentos confirmados no mês corrente
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-semibold text-[var(--dash-text)]">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(summary.revenueMonth)}
                </p>
                {summary.revenuePreviousMonth > 0 &&
                  revenueTrendPercent !== null && (
                    <span
                      className={`flex items-center gap-1 text-xs ${
                        summary.revenueMonth >= summary.revenuePreviousMonth
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {summary.revenueMonth >= summary.revenuePreviousMonth ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {revenueTrendPercent.toFixed(1)}%
                    </span>
                  )}
              </div>
              {summary.revenuePreviousMonth > 0 && (
                <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                  Mês anterior:{" "}
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(summary.revenuePreviousMonth)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
              <p className="text-sm font-medium text-[var(--dash-text-muted)]">
                Assinaturas ativas
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
                {summary.activeSubscriptions}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
              <p className="text-sm font-medium text-[var(--dash-text-muted)]">
                Em trial
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
                {summary.trialSubscriptions}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--dash-text-muted)]">
            Não foi possível carregar o resumo financeiro.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-4 text-sm font-medium text-[var(--dash-text-muted)]">
          Cadastro e catálogo
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            title="Usuários"
            value={operational.usersTotal}
            icon={Users}
          />
          <MetricCard
            title="Empresas"
            value={operational.companiesTotal}
            icon={Building2}
          />
          <MetricCard
            title="Planos ativos"
            value={operational.plansActive}
            icon={CreditCard}
          />
          <MetricCard
            title="Cupons"
            value={operational.couponsTotal}
            icon={Ticket}
          />
          <MetricCard
            title="Anúncios ativos"
            value={operational.adsActive}
            icon={Megaphone}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-[var(--dash-text-muted)]">
              Últimas transações
            </h3>
            <Link
              href="/financial"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--dash-accent)] hover:underline"
            >
              Ver todas
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--dash-text-muted)]">
              Nenhuma transação encontrada.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--dash-border)]">
              {recentTransactions.map((t) => {
                const statusUpper = (t.status ?? "").toUpperCase();
                const label =
                  txStatusLabels[statusUpper] ?? t.status ?? "—";
                return (
                  <li
                    key={t.id}
                    className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--dash-text)]">
                        {t.companyName || "—"}
                      </p>
                      <p className="text-xs text-[var(--dash-text-muted)]">
                        {t.planName} · {label}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-[var(--dash-text)] tabular-nums">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(t.value)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-[var(--dash-text-muted)]">
              Assinaturas recentes
            </h3>
            <Link
              href="/subscriptions"
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--dash-accent)] hover:underline"
            >
              Ver todas
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {recentSubscriptions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--dash-text-muted)]">
              Nenhuma assinatura encontrada.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--dash-border)]">
              {recentSubscriptions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--dash-text)]">
                      {s.companyName || "—"}
                    </p>
                    <p className="text-xs text-[var(--dash-text-muted)]">
                      {s.planName ?? "—"} ·{" "}
                      {subscriptionStatusLabels[s.status] ?? s.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {s.createdAt
                      ? new Date(s.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })
                      : "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
