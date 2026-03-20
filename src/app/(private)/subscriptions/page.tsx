"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import type { Subscription } from "@/types/admin";
import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { SubscriptionCreateModal } from "./_components/SubscriptionCreateModal";
import { SubscriptionDetailModal } from "./_components/SubscriptionDetailModal";

const API_SIGNATURE = "/admin/signature";
const PAGE_SIZE = 20;

const statusLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  TRIAL: "Trial",
};

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

export default function SubscriptionsPage() {
  const { GetAPI } = useApiContext();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailSubscription, setDetailSubscription] =
    useState<Subscription | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    const res = await GetAPI(API_SIGNATURE, true);
    setLoading(false);
    if (res.status === 200) {
      const data = res.body?.subscriptions ?? res.body?.data ?? [];
      const list = Array.isArray(data) ? data : [];
      setSubscriptions(
        list.map((row: Record<string, unknown>) => normalizeSubscription(row)),
      );
    } else {
      setSubscriptions([]);
      toast.error("Erro ao carregar assinaturas.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return subscriptions;
    const q = search.trim().toLowerCase();
    return subscriptions.filter(
      (s) =>
        s.companyName?.toLowerCase().includes(q) ||
        s.companyPrimaryEmail?.toLowerCase().includes(q) ||
        s.planName?.toLowerCase().includes(q) ||
        statusLabels[s.status]?.toLowerCase().includes(q),
    );
  }, [subscriptions, search]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns: ColumnDef<Subscription>[] = useMemo(
    () => [
      {
        key: "companyName",
        label: "Cliente",
        sortable: true,
        getValue: (s) => s.companyName ?? "",
      },
      {
        key: "companyPrimaryEmail",
        label: "E-mail",
        sortable: true,
        getValue: (s) => s.companyPrimaryEmail ?? "",
      },
      {
        key: "planName",
        label: "Plano",
        sortable: true,
        getValue: (s) => s.planName ?? "",
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        getValue: (s) => s.status ?? "INACTIVE",
        render: (s) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              s.status === "ACTIVE"
                ? "bg-green-100 text-green-800"
                : s.status === "TRIAL"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {statusLabels[s.status] ?? s.status}
          </span>
        ),
      },
      {
        key: "expirationDate",
        label: "Período",
        sortable: true,
        getValue: (s) => s.expirationDate ?? "",
        render: (s) =>
          s.expirationDate
            ? `Até ${new Date(s.expirationDate).toLocaleDateString("pt-BR")}`
            : "—",
      },
      {
        key: "createdAt",
        label: "Cadastro",
        sortable: true,
        getValue: (s) => s.createdAt ?? "",
        render: (s) =>
          s.createdAt
            ? new Date(s.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "—",
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">
            Assinaturas
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Listagem de assinaturas por cliente e plano
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Nova assinatura
        </button>
      </div>

      <div className="rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, e-mail, plano ou status..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>

      <DataTable<Subscription>
        data={paginatedData}
        columns={columns}
        keyExtractor={(s) => s.id}
        loading={loading}
        emptyMessage="Nenhuma assinatura encontrada."
        renderActions={(s) => (
          <button
            type="button"
            onClick={() => setDetailSubscription(s)}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            aria-label="Ver detalhes"
          >
            Detalhes
          </button>
        )}
      />
      {!loading && totalFiltered > 0 && (
        <Pagination
          currentPage={page}
          totalItems={totalFiltered}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      <SubscriptionCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={load}
      />
      <SubscriptionDetailModal
        subscription={detailSubscription}
        open={!!detailSubscription}
        onClose={() => setDetailSubscription(null)}
        onUpdated={load}
      />
    </div>
  );
}
