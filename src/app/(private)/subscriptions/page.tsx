"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import { mockSubscriptions } from "@/data/mock";
import { FileText } from "lucide-react";
import type { Subscription } from "@/types/admin";

const API_SUBSCRIPTIONS = "/admin/subscriptions";

const statusLabels: Record<string, string> = {
  active: "Ativa",
  cancelled: "Cancelada",
  trial: "Trial",
  past_due: "Vencida",
};

export default function SubscriptionsPage() {
  const { GetAPI } = useApiContext();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  async function load() {
    setLoading(true);
    const res = await GetAPI(API_SUBSCRIPTIONS, true);
    setLoading(false);
    if (res.status === 200) {
      const data = res.body?.subscriptions ?? res.body?.data ?? (Array.isArray(res.body) ? res.body : []);
      const list = Array.isArray(data) ? data : [];
      const useMock = list.length === 0;
      setSubscriptions(useMock ? mockSubscriptions : list);
      setIsMockData(useMock);
    } else {
      setSubscriptions(mockSubscriptions);
      setIsMockData(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">Assinaturas</h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Listagem de assinaturas por cliente e plano
        </p>
      </div>

      {isMockData && <MockIndicator />}

      <div className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="mb-4 h-12 w-12 text-[var(--dash-text-muted)]/50" />
            <p className="text-sm text-[var(--dash-text-muted)]">
              Nenhuma assinatura encontrada. Os dados aparecerão aqui quando a API expuser o endpoint de assinaturas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Cliente</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">E-mail</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Plano</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Período</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">{s.userName ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">{s.userEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">{s.planName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "active"
                            ? "bg-green-100 text-green-800"
                            : s.status === "trial"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {statusLabels[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {s.currentPeriodStart && s.currentPeriodEnd
                        ? `${new Date(s.currentPeriodStart).toLocaleDateString("pt-BR")} – ${new Date(s.currentPeriodEnd).toLocaleDateString("pt-BR")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
