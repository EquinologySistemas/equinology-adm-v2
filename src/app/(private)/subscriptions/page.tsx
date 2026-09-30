"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { SubscriptionStatusBadge } from "@/components/ui/SubscriptionStatusBadge";
import {
  fetchAllSubscriptions,
  renewalLabel,
  subscriptionStatusLabels as statusLabels,
} from "@/lib/subscriptions-api";
import type { Subscription } from "@/types/admin";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { SubscriptionCreateModal } from "./_components/SubscriptionCreateModal";
import { SubscriptionDetailModal } from "./_components/SubscriptionDetailModal";

const PAGE_SIZE = 20;

export default function SubscriptionsPage() {
  const { GetAPI } = useApiContext();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailSubscription, setDetailSubscription] =
    useState<Subscription | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    const list = await fetchAllSubscriptions(GetAPI);
    setLoading(false);
    if (list) {
      setSubscriptions(list);
    } else {
      setSubscriptions([]);
      toast.error("Erro ao carregar assinaturas.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const byStatus = statusFilter
      ? subscriptions.filter((s) => s.status === statusFilter)
      : subscriptions;
    if (!search.trim()) return byStatus;
    const q = search.trim().toLowerCase();
    return byStatus.filter(
      (s) =>
        s.companyName?.toLowerCase().includes(q) ||
        s.companyPrimaryEmail?.toLowerCase().includes(q) ||
        s.planName?.toLowerCase().includes(q) ||
        statusLabels[s.status]?.toLowerCase().includes(q),
    );
  }, [subscriptions, search, statusFilter]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns: ColumnDef<Subscription>[] = useMemo(
    () => [
      {
        key: "companyName",
        label: "Cliente",
        sortable: true,
        getValue: (s) => s.companyName ?? "",
        render: (s) => (
          <Link
            href={`/companies/${s.companyId}`}
            className="text-[var(--dash-accent)] hover:underline"
          >
            {s.companyName ?? "—"}
          </Link>
        ),
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
        render: (s) => <SubscriptionStatusBadge status={s.status} />,
      },
      {
        key: "renewal",
        label: "Renovação",
        sortable: true,
        getValue: (s) => renewalLabel(s),
        render: (s) => (
          <span
            className={
              s.hasRecurrence === false && s.status !== "TRIAL"
                ? "font-medium text-amber-700"
                : undefined
            }
          >
            {renewalLabel(s)}
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

      <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por status"
          className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativa</option>
          <option value="TRIAL">Trial</option>
          <option value="INACTIVE">Inativa</option>
        </select>
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
