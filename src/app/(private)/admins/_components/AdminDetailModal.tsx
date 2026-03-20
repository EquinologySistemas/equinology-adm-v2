"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { Admin, AdminUpdatePayload } from "@/types/admin";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "support", label: "Suporte" },
] as const;

const adminFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("Informe um e-mail válido (ex: nome@dominio.com)")
    .max(255, "E-mail muito longo"),
  role: z.enum(["super_admin", "support"]).optional(),
  newPassword: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim().length === 0 || v.trim().length >= 6,
      "Mínimo 6 caracteres",
    ),
});

type AdminFormData = z.infer<typeof adminFormSchema>;

interface AdminDetailModalProps {
  admin: Admin | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AdminDetailModal({
  admin,
  open,
  onClose,
  onSaved,
}: AdminDetailModalProps) {
  const { PatchAPI } = useApiContext();
  const [isEditing, setIsEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdminFormData>({
    resolver: zodResolver(adminFormSchema),
    defaultValues: {
      name: "",
      email: "",
      role: undefined,
      newPassword: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setIsEditing(false);
    setLoadError(null);
    if (admin) {
      reset({
        name: admin.name ?? "",
        email: admin.email ?? "",
        role: (admin.role as "super_admin" | "support") ?? undefined,
        newPassword: "",
      });
    }
  }, [open, admin, reset]);

  async function onSubmit(data: AdminFormData) {
    if (!admin) return;
    const payload: AdminUpdatePayload = {
      name: data.name,
      email: data.email.trim(),
      role: data.role,
    };
    if (data.newPassword?.trim()) {
      payload.newPassword = data.newPassword;
    }
    const res = await PatchAPI(`/admin/admins/${admin.id}`, payload, true);
    if (res.status === 200) {
      setIsEditing(false);
      onSaved();
      onClose();
    } else {
      const errorMessage =
        res.status === 404
          ? "A rota de atualização de administradores não está disponível no backend."
          : typeof res.body === "string"
            ? res.body
            : (res.body?.message ?? "Erro ao salvar");
      setLoadError(errorMessage);
    }
  }

  async function handleDeactivate() {
    if (!admin) return;
    if (!confirm("Tem certeza que deseja desativar este administrador?")) {
      return;
    }
    setIsDeactivating(true);
    const res = await PatchAPI(
      `/admin/admins/${admin.id}`,
      { active: false },
      true,
    );
    setIsDeactivating(false);
    if (res.status === 200) {
      onSaved();
      onClose();
    } else {
      const errorMessage =
        res.status === 404
          ? "A rota de desativação de administradores não está disponível no backend."
          : typeof res.body === "string"
            ? res.body
            : (res.body?.message ?? "Erro ao desativar");
      setLoadError(errorMessage);
    }
  }

  const roleLabel = (role: string | undefined) =>
    ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role ?? "—";

  if (!admin) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes do administrador"
      className="max-w-lg"
    >
      <div className="space-y-4">
        {!isEditing ? (
          <>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Nome
                </dt>
                <dd className="text-[var(--dash-text)]">{admin.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  E-mail
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {admin.email ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Função
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {roleLabel(admin.role)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Status
                </dt>
                <dd className="text-[var(--dash-text)]">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      admin.active !== false
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {admin.active !== false ? "Ativo" : "Inativo"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Data de cadastro
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {admin.createdAt
                    ? new Date(admin.createdAt).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
              >
                Editar
              </button>
              {admin.active !== false && (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={isDeactivating}
                  className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {isDeactivating ? "Desativando…" : "Desativar"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
              >
                Fechar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Nome *
              </label>
              <input
                {...register("name")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="Nome completo"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                E-mail *
              </label>
              <input
                type="email"
                {...register("email")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="email@exemplo.com"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Função
              </label>
              <select
                {...register("role")}
                className="w-full rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
              >
                <option value="">Selecione</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Nova senha (opcional)
              </label>
              <input
                type="password"
                {...register("newPassword")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.newPassword.message}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                Deixe em branco para não alterar a senha.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
              >
                {isSubmitting ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
