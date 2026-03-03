"use client";

import { MockIndicator } from "@/components/ui/MockIndicator";
import { BarChart3, Download } from "lucide-react";

const mockUsersByPlan = [
  { planName: "Profissional", count: 12, growth: "+2 este mês" },
  { planName: "Empresarial", count: 5, growth: "+1 este mês" },
  { planName: "Trial", count: 3, growth: "—" },
];

const mockRevenueByMonth = [
  { month: "Jan/2025", revenue: 4240.5, subscriptions: 28 },
  { month: "Fev/2025", revenue: 549.8, subscriptions: 3 },
  { month: "Mar/2025", revenue: 549.8, subscriptions: 3 },
];

const mockCouponUsage = [
  { code: "PROMO20", uses: 15, discountTotal: 449.7 },
  { code: "BEMVINDO", uses: 8, discountTotal: 199.2 },
  { code: "BLACK30", uses: 3, discountTotal: 134.97 },
];

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">Relatórios</h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Relatórios de usuários, receita e uso de cupons
        </p>
      </div>

      <MockIndicator />

      <section className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--dash-text)]">Usuários por plano</h3>
            <MockIndicator variant="badge" />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/40">
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Plano</th>
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Total</th>
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Variação</th>
              </tr>
            </thead>
            <tbody>
              {mockUsersByPlan.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40"
                >
                  <td className="px-4 py-3 font-medium text-[var(--dash-text)]">{row.planName}</td>
                  <td className="px-4 py-3 text-[var(--dash-text-muted)]">{row.count}</td>
                  <td className="px-4 py-3 text-[var(--dash-text-muted)]">{row.growth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--dash-text)]">Receita mensal</h3>
            <MockIndicator variant="badge" />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/40">
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Mês</th>
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Receita</th>
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Assinaturas ativas</th>
              </tr>
            </thead>
            <tbody>
              {mockRevenueByMonth.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40"
                >
                  <td className="px-4 py-3 font-medium text-[var(--dash-text)]">{row.month}</td>
                  <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.revenue)}
                  </td>
                  <td className="px-4 py-3 text-[var(--dash-text-muted)]">{row.subscriptions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--dash-text)]">Uso de cupons</h3>
            <MockIndicator variant="badge" />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/40">
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Cupom</th>
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Usos</th>
                <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Desconto total</th>
              </tr>
            </thead>
            <tbody>
              {mockCouponUsage.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40"
                >
                  <td className="px-4 py-3 font-medium text-[var(--dash-text)]">{row.code}</td>
                  <td className="px-4 py-3 text-[var(--dash-text-muted)]">{row.uses}</td>
                  <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.discountTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
        <BarChart3 className="h-4 w-4" />
        Gráficos e exportação em PDF serão habilitados quando a API de relatórios estiver disponível.
      </p>
    </div>
  );
}
