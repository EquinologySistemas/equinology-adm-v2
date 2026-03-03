"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import { mockDashboardKpis } from "@/data/mock";
import {
  Users,
  CreditCard,
  Ticket,
  Megaphone,
  TrendingUp,
  FileText,
  DollarSign,
} from "lucide-react";

interface DashboardMetrics {
  usersTotal: number;
  plansActive: number;
  couponsTotal: number;
  adsActive: number;
  mrr: number;
  subscriptionsActive: number;
  subscriptionsNewMonth: number;
  subscriptionsCancelledMonth: number;
  churnRate: number;
}

const defaultMetrics: DashboardMetrics = {
  usersTotal: 0,
  plansActive: 0,
  couponsTotal: 0,
  adsActive: 0,
  mrr: 0,
  subscriptionsActive: 0,
  subscriptionsNewMonth: 0,
  subscriptionsCancelledMonth: 0,
  churnRate: 0,
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

export default function DashboardPage() {
  const { GetAPI } = useApiContext();
  const [metrics, setMetrics] = useState<DashboardMetrics>(defaultMetrics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [usersRes, plansRes, couponsRes, adsRes] = await Promise.all([
          GetAPI("/admin/users", true),
          GetAPI("/signature-plan", true),
          GetAPI("/admin/coupons", true),
          GetAPI("/admin/ads", true),
        ]);

        if (cancelled) return;

        const users = usersRes.status === 200 ? usersRes.body?.users ?? [] : [];
        const plans = plansRes.status === 200 ? (Array.isArray(plansRes.body) ? plansRes.body : plansRes.body?.plans ?? []) : [];
        const coupons = couponsRes.status === 200 ? (Array.isArray(couponsRes.body) ? couponsRes.body : couponsRes.body?.coupons ?? []) : [];
        const ads = adsRes.status === 200 ? (Array.isArray(adsRes.body) ? adsRes.body : adsRes.body?.advertisements ?? []) : [];

        const plansList = Array.isArray(plans) ? plans : [];
        const activePlans = plansList.filter((p: { active?: boolean }) => p.active !== false);

        const adsList = Array.isArray(ads) ? ads : [];
        const activeAds = adsList.filter((a: { active?: boolean }) => a.active !== false);

        const hasRealKpis = false;
        setMetrics((prev) => ({
          ...prev,
          usersTotal: Array.isArray(users) ? users.length : 0,
          plansActive: activePlans.length,
          couponsTotal: Array.isArray(coupons) ? coupons.length : 0,
          adsActive: activeAds.length,
          subscriptionsActive: hasRealKpis ? 0 : mockDashboardKpis.subscriptionsActive,
          mrr: hasRealKpis ? 0 : mockDashboardKpis.mrr,
          subscriptionsNewMonth: hasRealKpis ? 0 : mockDashboardKpis.subscriptionsNewMonth,
          subscriptionsCancelledMonth: hasRealKpis ? 0 : mockDashboardKpis.subscriptionsCancelledMonth,
          churnRate: hasRealKpis ? 0 : mockDashboardKpis.churnRate,
        }));
      } catch {
        if (!cancelled) setMetrics(defaultMetrics);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [GetAPI]);

  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">
          Visão geral
        </h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Métricas e indicadores do painel administrativo
        </p>
      </div>

      <div>
        <h3 className="mb-4 text-sm font-medium text-[var(--dash-text-muted)]">
          Contagens
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Usuários"
            value={metrics.usersTotal}
            icon={Users}
          />
          <MetricCard
            title="Planos ativos"
            value={metrics.plansActive}
            icon={CreditCard}
          />
          <MetricCard
            title="Cupons"
            value={metrics.couponsTotal}
            icon={Ticket}
          />
          <MetricCard
            title="Anúncios ativos"
            value={metrics.adsActive}
            icon={Megaphone}
          />
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--dash-text-muted)]">
            KPIs de negócio
          </h3>
          <MockIndicator variant="badge" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="MRR"
            value={
              metrics.mrr > 0
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(metrics.mrr)
                : "—"
            }
            icon={DollarSign}
            subtitle="Receita recorrente mensal"
          />
          <MetricCard
            title="Assinaturas ativas"
            value={metrics.subscriptionsActive}
            icon={FileText}
          />
          <MetricCard
            title="Novas no mês"
            value={metrics.subscriptionsNewMonth}
            icon={TrendingUp}
            subtitle="Assinaturas"
          />
          <MetricCard
            title="Churn"
            value={
              metrics.churnRate > 0 ? `${metrics.churnRate.toFixed(1)}%` : "—"
            }
            icon={TrendingUp}
            subtitle="Taxa de cancelamento"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-[var(--dash-text-muted)]">
            Atividade recente
          </h3>
          <MockIndicator variant="badge" />
        </div>
        <ul className="mt-3 space-y-2 text-sm text-[var(--dash-text-muted)]">
          <li>• Plano Profissional — alterado por admin (mock)</li>
          <li>• Cupom PROMO20 — criado (mock)</li>
          <li>• Usuário Ana Oliveira — status ativado (mock)</li>
        </ul>
      </div>
    </div>
  );
}
