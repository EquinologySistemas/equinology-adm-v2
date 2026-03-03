"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { Modal } from "@/components/ui/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Plan } from "@/types/admin";
import { PlansForm } from "./_components/PlansForm";

const API_PLANS = "/signature-plan";
const API_PLANS_DELETE = "/admin/plans";

export default function PlansPage() {
  const { GetAPI, PostAPI, PutAPI, DeleteAPI } = useApiContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadPlans() {
    setLoading(true);
    const res = await GetAPI(API_PLANS, true);
    setLoading(false);
    if (res.status === 200) {
      const data = Array.isArray(res.body) ? res.body : res.body?.plans ?? res.body?.data ?? [];
      setPlans(Array.isArray(data) ? data : []);
    } else {
      toast.error("Erro ao carregar planos.");
    }
  }

  useEffect(() => {
    loadPlans();
  }, []);

  async function handleCreate(data: Partial<Plan>) {
    const res = await PostAPI(API_PLANS, data, true);
    if (res.status === 200 || res.status === 201) {
      toast.success("Plano criado com sucesso.");
      setCreateOpen(false);
      loadPlans();
    } else {
      toast.error(res.body?.message ?? "Erro ao criar plano.");
    }
  }

  async function handleUpdate(data: Partial<Plan>) {
    if (!editingPlan?.id) return;
    const res = await PutAPI(`${API_PLANS}/${editingPlan.id}`, data, true);
    if (res.status === 200) {
      toast.success("Plano atualizado.");
      setEditingPlan(null);
      loadPlans();
    } else {
      toast.error(res.body?.message ?? "Erro ao atualizar plano.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este plano? Assinaturas ativas podem ser afetadas.")) return;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">Planos</h2>
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

      <div className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : plans.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--dash-text-muted)]">
            Nenhum plano cadastrado. Crie o primeiro plano.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Nome</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Usuários</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Preço cartão</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Preço PIX</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Ativo</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)] text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan.id}
                    className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">{plan.name}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {plan.maxUsers ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {plan.priceCard != null
                        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.priceCard)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {plan.pricePix != null
                        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.pricePix)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          plan.active !== false
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {plan.active !== false ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingPlan(plan)}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo plano">
        <PlansForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
      </Modal>

      <Modal
        open={!!editingPlan}
        onClose={() => setEditingPlan(null)}
        title="Editar plano"
      >
        {editingPlan && (
          <PlansForm
            initialData={editingPlan}
            onSubmit={handleUpdate}
            onCancel={() => setEditingPlan(null)}
          />
        )}
      </Modal>
    </div>
  );
}
