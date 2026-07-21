"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { Tutorial } from "@/types/admin";
import {
  ExternalLink,
  FileText,
  Film,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  TutorialsForm,
  type TutorialSubmitPayload,
} from "./_components/TutorialsForm";

const API_TUTORIALS = "/admin/tutorials";

function extractErrorMessage(
  body: { message?: unknown } | null | undefined,
  fallback: string,
) {
  if (typeof body?.message === "string") return body.message;
  if (Array.isArray(body?.message)) {
    return body.message
      .map((m: { defaultMessage?: string }) => m.defaultMessage)
      .filter(Boolean)
      .join(", ");
  }
  return fallback;
}

function TypeBadge({ tutorial }: { tutorial: Tutorial }) {
  if (tutorial.type === "PDF") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
        <FileText className="h-3 w-3" /> PDF
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
      <Film className="h-3 w-3" /> Vídeo
    </span>
  );
}

export default function TutorialsPage() {
  const { GetAPI, PostAPI, PutAPI, DeleteAPI } = useApiContext();
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadTutorials() {
    setLoading(true);
    const res = await GetAPI(API_TUTORIALS, true);
    setLoading(false);
    if (res.status === 200) {
      const data = Array.isArray(res.body)
        ? res.body
        : (res.body?.tutorials ?? []);
      setTutorials(Array.isArray(data) ? data : []);
    } else {
      toast.error("Erro ao carregar tutoriais.");
    }
  }

  useEffect(() => {
    loadTutorials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(data: TutorialSubmitPayload) {
    const res = await PostAPI(API_TUTORIALS, data, true);
    if (res.status === 200 || res.status === 201) {
      toast.success("Tutorial criado com sucesso.");
      setCreateOpen(false);
      loadTutorials();
    } else {
      toast.error(extractErrorMessage(res.body, "Erro ao criar tutorial."));
    }
  }

  async function handleUpdate(data: TutorialSubmitPayload) {
    if (!editingTutorial?.id) return;
    const res = await PutAPI(
      `${API_TUTORIALS}/${editingTutorial.id}`,
      data,
      true,
    );
    if (res.status === 200) {
      toast.success("Tutorial atualizado.");
      setEditingTutorial(null);
      loadTutorials();
    } else {
      toast.error(extractErrorMessage(res.body, "Erro ao atualizar tutorial."));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este tutorial?")) return;
    setDeletingId(id);
    const res = await DeleteAPI(`${API_TUTORIALS}/${id}`, true);
    setDeletingId(null);
    if (res.status === 200 || res.status === 204) {
      toast.success("Tutorial excluído.");
      loadTutorials();
    } else {
      toast.error(extractErrorMessage(res.body, "Erro ao excluir tutorial."));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">
            Tutoriais
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Vídeos e PDFs de apoio exibidos no site institucional
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Novo tutorial
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : tutorials.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--dash-text-muted)]">
            Nenhum tutorial cadastrado. Enquanto não houver tutorial ativo, a
            seção não aparece no site.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Capa
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Título
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Tipo
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Ordem
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
                {tutorials.map((tutorial) => (
                  <tr
                    key={tutorial.id}
                    className="border-b border-[var(--dash-border)]/60 transition-colors hover:bg-[var(--dash-bg)]/40"
                  >
                    <td className="px-4 py-3">
                      {tutorial.posterUrl ? (
                        <img
                          src={tutorial.posterUrl}
                          alt=""
                          className="h-12 w-20 rounded-lg bg-[var(--dash-bg)] object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-20 items-center justify-center rounded-lg bg-[var(--dash-bg)] text-[var(--dash-text-muted)]">
                          {tutorial.type === "PDF" ? (
                            <FileText className="h-5 w-5" />
                          ) : (
                            <Film className="h-5 w-5" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">
                      <div className="flex items-center gap-2">
                        {tutorial.featured && (
                          <Star
                            className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400"
                            aria-label="Destacado"
                          />
                        )}
                        <span>{tutorial.title}</span>
                      </div>
                      {tutorial.durationLabel && (
                        <span className="mt-0.5 block text-xs font-normal text-[var(--dash-text-muted)]">
                          {tutorial.durationLabel}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge tutorial={tutorial} />
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)] tabular-nums">
                      {tutorial.sortOrder ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          tutorial.active !== false
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tutorial.active !== false ? "Sim" : "Não"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {tutorial.mediaUrl && (
                          <a
                            href={tutorial.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
                            aria-label="Abrir conteúdo"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingTutorial(tutorial)}
                          className="rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tutorial.id)}
                          disabled={deletingId === tutorial.id}
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
        title="Novo tutorial"
      >
        <TutorialsForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={!!editingTutorial}
        onClose={() => setEditingTutorial(null)}
        title="Editar tutorial"
      >
        {editingTutorial && (
          <TutorialsForm
            key={editingTutorial.id}
            initialData={editingTutorial}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTutorial(null)}
          />
        )}
      </Modal>
    </div>
  );
}
