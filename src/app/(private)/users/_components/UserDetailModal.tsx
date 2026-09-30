"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import { formatDate } from "@/lib/date";
import { formatPhone, unmaskPhone } from "@/lib/utils";
import type { CompanyOption, User, UserUpdatePayload } from "@/types/admin";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GESTOR", label: "Gestor" },
  { value: "COLABORADOR", label: "Colaborador" },
] as const;

const userFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("Informe um e-mail válido (ex: nome@dominio.com)")
    .max(255, "E-mail muito longo"),
  phone: z.string().optional(),
  role: z.enum(["ADMIN", "GESTOR", "COLABORADOR"]).optional(),
  companyId: z.string().optional(),
  newPassword: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim().length === 0 || v.trim().length >= 6,
      "Mínimo 6 caracteres",
    ),
});

type UserFormData = z.infer<typeof userFormSchema>;

interface UserDetailModalProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserDetailModal({
  user,
  open,
  onClose,
  onSaved,
}: UserDetailModalProps) {
  const { GetAPI, PatchAPI, DeleteAPI, PostAPI } = useApiContext();
  const [isEditing, setIsEditing] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: undefined,
      companyId: "",
      newPassword: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setIsEditing(false);
    setLoadError(null);
    if (user) {
      reset({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: user.phone ? formatPhone(user.phone) : "",
        role: (user.role as "ADMIN" | "GESTOR" | "COLABORADOR") ?? undefined,
        companyId: user.companyId ?? "",
        newPassword: "",
      });
    }
  }, [open, user, reset]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await GetAPI("/admin/companies", true);
      if (res.status === 200 && res.body?.companies) {
        setCompanies(
          Array.isArray(res.body.companies) ? res.body.companies : [],
        );
      } else {
        setCompanies([]);
      }
    })();
  }, [open, GetAPI]);

  async function onSubmit(data: UserFormData) {
    if (!user) return;
    const payload: UserUpdatePayload = {
      name: data.name,
      email: data.email.trim(),
      phone: data.phone ? unmaskPhone(data.phone) || undefined : undefined,
      role: data.role,
      companyId: data.companyId || undefined,
    };
    if (data.newPassword?.trim()) {
      payload.newPassword = data.newPassword;
    }
    const res = await PatchAPI(`/admin/users/${user.id}`, payload, true);
    if (res.status === 200) {
      setIsEditing(false);
      onSaved();
      onClose();
    } else {
      setLoadError(
        typeof res.body === "string"
          ? res.body
          : (res.body?.message ?? "Erro ao salvar"),
      );
    }
  }

  function errorMessage(body: unknown, fallback: string) {
    if (typeof body === "string") return body;
    const msg = (body as { message?: unknown } | null)?.message;
    return typeof msg === "string" ? msg : fallback;
  }

  async function handleDelete() {
    if (!user) return;
    if (
      !confirm(
        `Excluir ${user.name}? O acesso é bloqueado na hora e a vaga do plano é liberada. O histórico de atendimentos é mantido e a exclusão pode ser desfeita.`,
      )
    )
      return;
    setStatusBusy(true);
    const res = await DeleteAPI(`/admin/users/${user.id}`, true);
    setStatusBusy(false);
    if (res.status === 200) {
      toast.success("Usuário excluído.");
      onSaved();
    } else {
      toast.error(errorMessage(res.body, "Erro ao excluir usuário."));
    }
  }

  async function handleRestore() {
    if (!user) return;
    setStatusBusy(true);
    const res = await PostAPI(`/admin/users/${user.id}/restore`, {}, true);
    setStatusBusy(false);
    if (res.status === 200) {
      toast.success("Usuário restaurado.");
      onSaved();
    } else {
      toast.error(errorMessage(res.body, "Erro ao restaurar usuário."));
    }
  }

  const roleLabel = (role: string | undefined) =>
    ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role ?? "—";

  if (!user) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes do usuário"
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
                <dd className="text-[var(--dash-text)]">{user.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  E-mail
                </dt>
                <dd className="text-[var(--dash-text)]">{user.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Telefone
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {user.phone ? formatPhone(user.phone) : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Empresa
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {user.companyId ? (
                    <Link
                      href={`/companies/${user.companyId}`}
                      className="text-[var(--dash-accent)] hover:underline"
                    >
                      {user.company ?? "Ver empresa"}
                    </Link>
                  ) : (
                    (user.company ?? "—")
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Função
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {roleLabel(user.role)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Plano da empresa
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {user.planName ?? "Sem assinatura vigente"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Status
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {user.isDeleted
                    ? `Excluído em ${formatDate(user.deletedAt)}`
                    : "Ativo"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Último acesso
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString("pt-BR")
                    : "Nunca acessou"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Data de cadastro
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              {user.isDeleted ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={statusBusy}
                  className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
                >
                  {statusBusy ? "Restaurando…" : "Restaurar"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={statusBusy}
                    className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {statusBusy ? "Excluindo…" : "Excluir"}
                  </button>
                </>
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
                Telefone
              </label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="tel"
                    className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                    placeholder="(00) 00000-0000"
                    onChange={(e) =>
                      field.onChange(formatPhone(e.target.value))
                    }
                  />
                )}
              />
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
                Empresa
              </label>
              <select
                {...register("companyId")}
                className="w-full rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
              >
                <option value="">Selecione a empresa</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
