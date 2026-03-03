"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { Modal } from "@/components/ui/Modal";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Coupon } from "@/types/admin";
import { CouponsForm } from "./_components/CouponsForm";

const API_COUPONS = "/admin/coupons";

export default function CouponsPage() {
  const { GetAPI, PostAPI, PutAPI, DeleteAPI } = useApiContext();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadCoupons() {
    setLoading(true);
    const res = await GetAPI(API_COUPONS, true);
    setLoading(false);
    if (res.status === 200) {
      const data = Array.isArray(res.body) ? res.body : res.body?.coupons ?? res.body?.data ?? [];
      setCoupons(Array.isArray(data) ? data : []);
    } else {
      toast.error("Erro ao carregar cupons.");
    }
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  async function handleCreate(data: Partial<Coupon>) {
    const res = await PostAPI(API_COUPONS, data, true);
    if (res.status === 200 || res.status === 201) {
      toast.success("Cupom criado com sucesso.");
      setCreateOpen(false);
      loadCoupons();
    } else {
      toast.error(res.body?.message ?? "Erro ao criar cupom.");
    }
  }

  async function handleUpdate(data: Partial<Coupon>) {
    if (!editingCoupon?.id) return;
    const res = await PutAPI(`${API_COUPONS}/${editingCoupon.id}`, data, true);
    if (res.status === 200) {
      toast.success("Cupom atualizado.");
      setEditingCoupon(null);
      loadCoupons();
    } else {
      toast.error(res.body?.message ?? "Erro ao atualizar cupom.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cupom?")) return;
    setDeletingId(id);
    const res = await DeleteAPI(`${API_COUPONS}/${id}`, true);
    setDeletingId(null);
    if (res.status === 200 || res.status === 204) {
      toast.success("Cupom excluído.");
      loadCoupons();
    } else {
      toast.error(res.body?.message ?? "Erro ao excluir cupom.");
    }
  }

  function formatValue(c: Coupon) {
    if (c.type === "percent") return `${c.value}%`;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.value);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">Cupons</h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Gerencie cupons de desconto
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Novo cupom
        </button>
      </div>

      <div className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--dash-text-muted)]">
            Nenhum cupom cadastrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Código</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Valor</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Usos</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Validade</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Ativo</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)] text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)] uppercase">{c.code}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {c.type === "percent" ? "Percentual" : "Fixo"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">{formatValue(c)}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {(c.currentUses ?? 0)} / {(c.maxUses ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {c.validUntil ? new Date(c.validUntil).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.active !== false ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.active !== false ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingCoupon(c)}
                          className="rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={deletingId === c.id}
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

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo cupom">
        <CouponsForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
      </Modal>

      <Modal
        open={!!editingCoupon}
        onClose={() => setEditingCoupon(null)}
        title="Editar cupom"
      >
        {editingCoupon && (
          <CouponsForm
            initialData={editingCoupon}
            onSubmit={handleUpdate}
            onCancel={() => setEditingCoupon(null)}
          />
        )}
      </Modal>
    </div>
  );
}
