"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { planFromApi } from "@/lib/plans-api";
import type { Plan } from "@/types/admin";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { PlanCreateModal } from "./_components/PlanCreateModal";
import { PlanDetailModal } from "./_components/PlanDetailModal";

const API_PLANS = "/signature-plan";
const API_PLANS_DELETE = "/admin/plans";
const PAGE_SIZE = 20;

function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function PlansPage() {
  const { GetAPI, DeleteAPI } = useApiContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPlan, setDetailPlan] = useState<Plan | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  async function loadPlans() {
    setLoading(true);
    const res = await GetAPI(API_PLANS, true);
    setLoading(false);
    if (res.status === 200) {
      const data = Array.isArray(res.body)
        ? res.body
        : (res.body?.plans ?? res.body?.data ?? []);
      const list = Array.isArray(data) ? data : [];
      setPlans(list.map((p: Record<string, unknown>) => planFromApi(p)));
    } else {
      toast.error("Erro ao carregar planos.");
    }
  }

  useEffect(() => {
    loadPlans();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este plano? Assinaturas ativas podem ser afetadas."))
      return;
    setDeletingId(id);
    const res = await DeleteAPI(`${API_PLANS_DELETE}/${id}`, true);
    setDeletingId(null);
    if (res.status === 200 || res.status === 204) {
      toast.success("Plano excluído.");
      loadPlans();
    } else {
      toast.error(res.body?.message ?? "Erro ao excluir plano.");
    }
  }

  const paginatedData = useMemo(
    () => plans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [plans, page],
  );

  const columns: ColumnDef<Plan>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        getValue: (p) => p.name ?? "",
      },
      {
        key: "activeClientsCount",
        label: "Clientes ativos",
        sortable: true,
        getValue: (p) => p.activeClientsCount ?? 0,
        render: (p) => p.activeClientsCount ?? 0,
      },
      {
        key: "priceCard",
        label: "Preço cartão",
        sortable: true,
        getValue: (p) => p.priceCard ?? 0,
        render: (p) => formatBRL(p.priceCard),
      },
      {
        key: "pricePix",
        label: "Preço PIX",
        sortable: true,
        getValue: (p) => p.pricePix ?? 0,
        render: (p) => formatBRL(p.pricePix),
      },
      {
        key: "active",
        label: "Ativo",
        sortable: true,
        getValue: (p) => (p.active !== false ? "sim" : "não"),
        render: (p) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              p.active !== false
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {p.active !== false ? "Sim" : "Não"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">
            Planos
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Gerencie os planos de assinatura
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Novo plano
        </button>
      </div>

      <DataTable<Plan>
        data={paginatedData}
        columns={columns}
        keyExtractor={(p) => p.id}
        loading={loading}
        emptyMessage="Nenhum plano cadastrado. Crie o primeiro plano."
        renderActions={(plan) => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDetailPlan(plan)}
              className="rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(plan.id)}
              disabled={deletingId === plan.id}
              className="rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      />
      {!loading && plans.length > 0 && (
        <Pagination
          currentPage={page}
          totalItems={plans.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      <PlanDetailModal
        plan={detailPlan}
        open={!!detailPlan}
        onClose={() => setDetailPlan(null)}
        onSaved={() => {
          setDetailPlan(null);
          loadPlans();
        }}
      />

      <PlanCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          loadPlans();
        }}
      />
    </div>
  );
}
