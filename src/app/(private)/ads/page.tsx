"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { Ad } from "@/types/admin";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AdsForm } from "./_components/AdsForm";

const API_ADS = "/admin/ads";

export default function AdsPage() {
  const { GetAPI, PostAPI, PutAPI, DeleteAPI } = useApiContext();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadAds() {
    setLoading(true);
    const res = await GetAPI(API_ADS, true);
    setLoading(false);
    if (res.status === 200) {
      const data = Array.isArray(res.body)
        ? res.body
        : (res.body?.advertisements ?? res.body?.ads ?? res.body?.data ?? []);
      setAds(Array.isArray(data) ? data : []);
    } else {
      toast.error("Erro ao carregar anúncios.");
    }
  }

  useEffect(() => {
    loadAds();
  }, []);

  async function handleCreate(data: Partial<Ad>) {
    const res = await PostAPI(API_ADS, data, true);
    if (res.status === 200 || res.status === 201) {
      toast.success("Anúncio criado com sucesso.");
      setCreateOpen(false);
      loadAds();
    } else {
      toast.error(res.body?.message ?? "Erro ao criar anúncio.");
    }
  }

  async function handleUpdate(data: Partial<Ad>) {
    if (!editingAd?.id) return;
    const res = await PutAPI(`${API_ADS}/${editingAd.id}`, data, true);
    if (res.status === 200) {
      toast.success("Anúncio atualizado.");
      setEditingAd(null);
      loadAds();
    } else {
      toast.error(res.body?.message ?? "Erro ao atualizar anúncio.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este anúncio?")) return;
    setDeletingId(id);
    const res = await DeleteAPI(`${API_ADS}/${id}`, true);
    setDeletingId(null);
    if (res.status === 200 || res.status === 204) {
      toast.success("Anúncio excluído.");
      loadAds();
    } else {
      toast.error(res.body?.message ?? "Erro ao excluir anúncio.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">
            Anúncios
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Gerencie anúncios e banners
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Novo anúncio
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : ads.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--dash-text-muted)]">
            Nenhum anúncio cadastrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Preview
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Nome
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Link
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Ativo
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-[var(--dash-text)]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr
                    key={ad.id}
                    className="border-b border-[var(--dash-border)]/60 transition-colors hover:bg-[var(--dash-bg)]/40"
                  >
                    <td className="px-4 py-3">
                      {ad.imageUrl ? (
                        <img
                          src={ad.imageUrl}
                          alt=""
                          className="h-12 w-20 rounded-lg bg-[var(--dash-bg)] object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-20 items-center justify-center rounded-lg bg-[var(--dash-bg)] text-xs text-[var(--dash-text-muted)]">
                          Sem imagem
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">
                      {ad.name}
                    </td>
                    <td className="px-4 py-3">
                      {ad.redirectUrl ? (
                        <a
                          href={ad.redirectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--dash-accent)] hover:underline"
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-[var(--dash-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ad.active !== false
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {ad.active !== false ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingAd(ad)}
                          className="rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ad.id)}
                          disabled={deletingId === ad.id}
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

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo anúncio"
      >
        <AdsForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={!!editingAd}
        onClose={() => setEditingAd(null)}
        title="Editar anúncio"
      >
        {editingAd && (
          <AdsForm
            initialData={editingAd}
            onSubmit={handleUpdate}
            onCancel={() => setEditingAd(null)}
          />
        )}
      </Modal>
    </div>
  );
}
