"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import { formatPhone, unmaskPhone } from "@/lib/utils";
import type { CompanyOption, UserCreatePayload } from "@/types/admin";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GESTOR", label: "Gestor" },
  { value: "COLABORADOR", label: "Colaborador" },
] as const;

const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z
    .string()
    .min(1, "E-mail é obrigatório")
    .email("Informe um e-mail válido (ex: nome@dominio.com)")
    .max(255, "E-mail muito longo"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  role: z.enum(["ADMIN", "GESTOR", "COLABORADOR"]).optional(),
  companyId: z.string().min(1, "Selecione a empresa"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

interface UserCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function UserCreateModal({
  open,
  onClose,
  onSaved,
}: UserCreateModalProps) {
  const { GetAPI, PostAPI } = useApiContext();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "COLABORADOR",
      companyId: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!open) {
      setSubmitError(null);
      reset({
        name: "",
        email: "",
        phone: "",
        role: "COLABORADOR",
        companyId: "",
        password: "",
      });
    }
  }, [open, reset]);

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

  async function onSubmit(data: CreateUserFormData) {
    setSubmitError(null);
    const payload: UserCreatePayload = {
      name: data.name.trim(),
      email: data.email.trim(),
      phone: unmaskPhone(data.phone) || data.phone,
      role: data.role,
      companyId: data.companyId,
      password: data.password,
    };
    const res = await PostAPI("/admin/users", payload, true);
    if (res.status === 200) {
      onSaved();
      onClose();
    } else {
      setSubmitError(
        typeof res.body === "string"
          ? res.body
          : (res.body?.message ?? "Erro ao criar usuário"),
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo usuário"
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
            Telefone *
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
                onChange={(e) => field.onChange(formatPhone(e.target.value))}
              />
            )}
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
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
            Empresa *
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
          {errors.companyId && (
            <p className="mt-1 text-xs text-red-600">
              {errors.companyId.message}
            </p>
          )}
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
            {isSubmitting ? "Criando…" : "Criar usuário"}
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
