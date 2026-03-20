"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { AdminCreatePayload } from "@/types/admin";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "support", label: "Suporte" },
] as const;

const createAdminSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("Informe um e-mail válido (ex: nome@dominio.com)")
    .max(255, "E-mail muito longo"),
  role: z.enum(["super_admin", "support"]).optional(),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

type CreateAdminFormData = z.infer<typeof createAdminSchema>;

interface AdminCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AdminCreateModal({
  open,
  onClose,
  onSaved,
}: AdminCreateModalProps) {
  const { PostAPI } = useApiContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAdminFormData>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "support",
      password: "",
    },
  });

  useEffect(() => {
    if (!open) {
      setSubmitError(null);
      reset({
        name: "",
        email: "",
        role: "support",
        password: "",
      });
    }
  }, [open, reset]);

  async function onSubmit(data: CreateAdminFormData) {
    setSubmitError(null);
    const payload: AdminCreatePayload = {
      name: data.name.trim(),
      email: data.email.trim(),
      password: data.password,
      role: data.role,
    };
    const res = await PostAPI("/admin/admins", payload, true);
    if (res.status === 200) {
      onSaved();
      onClose();
    } else {
      const errorMessage =
        res.status === 404
          ? "A rota de criação de administradores não está disponível no backend."
          : typeof res.body === "string"
            ? res.body
            : (res.body?.message ?? "Erro ao criar administrador");
      setSubmitError(errorMessage);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo administrador"
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
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
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
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
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
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
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Senha inicial *
          </label>
          <input
            type="password"
            {...register("password")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">
              {errors.password.message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
          >
            {isSubmitting ? "Criando…" : "Criar administrador"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
