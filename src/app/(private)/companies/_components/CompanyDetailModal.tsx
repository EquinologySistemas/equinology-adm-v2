"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import { formatCEP, formatCNPJ, unmaskCEP, unmaskCNPJ } from "@/lib/utils";
import type { Company, CompanyUpdatePayload } from "@/types/admin";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";

const companyFormSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  cnpj: z
    .string()
    .optional()
    .refine(
      (v) => !v || unmaskCNPJ(v).length === 0 || unmaskCNPJ(v).length === 14,
      "CNPJ deve ter 14 dígitos",
    ),
  address: z.string().optional(),
  number: z.string().optional(),
  postalCode: z
    .string()
    .optional()
    .refine(
      (v) => !v || unmaskCEP(v).length === 0 || unmaskCEP(v).length === 8,
      "CEP deve ter 8 dígitos",
    ),
  walletId: z.string().optional(),
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

interface CompanyDetailModalProps {
  company: Company | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function CompanyDetailModal({
  company,
  open,
  onClose,
  onSaved,
}: CompanyDetailModalProps) {
  const { PutAPI } = useApiContext();
  const [isEditing, setIsEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: "",
      cnpj: "",
      address: "",
      number: "",
      postalCode: "",
      walletId: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setIsEditing(false);
    setSubmitError(null);
    if (company) {
      reset({
        name: company.name ?? "",
        cnpj: company.cnpj ? formatCNPJ(company.cnpj) : "",
        address: company.address ?? "",
        number: company.number ?? "",
        postalCode: company.postalCode ? formatCEP(company.postalCode) : "",
        walletId: company.walletId ?? "",
      });
    }
  }, [open, company, reset]);

  async function onSubmit(data: CompanyFormData) {
    if (!company) return;
    setSubmitError(null);
    const cnpjDigits = data.cnpj ? unmaskCNPJ(data.cnpj) : "";
    const payload: CompanyUpdatePayload = {
      name: data.name.trim(),
      address: data.address?.trim() || undefined,
      number: data.number?.trim() || undefined,
      postalCode: data.postalCode
        ? unmaskCEP(data.postalCode) || undefined
        : undefined,
      walletId: data.walletId?.trim() || undefined,
      ...(cnpjDigits.length === 14
        ? { cnpj: cnpjDigits }
        : cnpjDigits.length === 0
          ? { cnpj: null }
          : {}),
    };
    const res = await PutAPI(`/admin/companies/${company.id}`, payload, true);
    if (res.status === 200) {
      setIsEditing(false);
      onSaved();
      onClose();
    } else {
      setSubmitError(
        typeof res.body === "string"
          ? res.body
          : (res.body?.message ?? "Erro ao salvar"),
      );
    }
  }

  if (!company) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes da empresa"
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
                <dd className="text-[var(--dash-text)]">
                  {company.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  CNPJ
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {company.cnpj ? formatCNPJ(company.cnpj) : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Endereço
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {company.address ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Número
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {company.number ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  CEP
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {company.postalCode ? formatCEP(company.postalCode) : "—"}
                </dd>
              </div>
              {company.walletId && (
                <div>
                  <dt className="font-medium text-[var(--dash-text-muted)]">
                    Wallet ID
                  </dt>
                  <dd className="text-[var(--dash-text)]">
                    {company.walletId}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Data de cadastro
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {company.createdAt
                    ? new Date(company.createdAt).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
              {company.updatedAt && (
                <div>
                  <dt className="font-medium text-[var(--dash-text-muted)]">
                    Última atualização
                  </dt>
                  <dd className="text-[var(--dash-text)]">
                    {new Date(company.updatedAt).toLocaleString("pt-BR")}
                  </dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
              >
                Editar
              </button>
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
            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Nome *
              </label>
              <input
                {...register("name")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="Nome da empresa"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                CNPJ
              </label>
              <Controller
                name="cnpj"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                    placeholder="00.000.000/0000-00"
                    onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                  />
                )}
              />
              {errors.cnpj && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.cnpj.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Endereço
              </label>
              <input
                {...register("address")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="Rua, bairro"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Número
              </label>
              <input
                {...register("number")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="Número"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                CEP
              </label>
              <Controller
                name="postalCode"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                    placeholder="00000-000"
                    onChange={(e) => field.onChange(formatCEP(e.target.value))}
                  />
                )}
              />
              {errors.postalCode && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.postalCode.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
                Wallet ID (opcional)
              </label>
              <input
                {...register("walletId")}
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="ID da carteira"
              />
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
