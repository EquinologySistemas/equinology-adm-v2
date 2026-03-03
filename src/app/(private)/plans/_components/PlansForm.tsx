"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Plan } from "@/types/admin";

const planSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  maxUsers: z.coerce.number().int().min(0).optional(),
  priceCard: z.coerce.number().min(0).optional(),
  pricePix: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
  annualDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  trialDays: z.coerce.number().int().min(0).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
});

type PlanFormData = z.infer<typeof planSchema>;

interface PlansFormProps {
  initialData?: Plan;
  onSubmit: (data: Partial<Plan>) => void | Promise<void>;
  onCancel: () => void;
}

export function PlansForm({ initialData, onSubmit, onCancel }: PlansFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      maxUsers: initialData?.maxUsers ?? undefined,
      priceCard: initialData?.priceCard ?? undefined,
      pricePix: initialData?.pricePix ?? undefined,
      active: initialData?.active !== false,
      annualDiscountPercent: initialData?.annualDiscountPercent ?? undefined,
      trialDays: initialData?.trialDays ?? undefined,
      displayOrder: initialData?.displayOrder ?? undefined,
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data))} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Nome *</label>
        <input
          {...register("name")}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          placeholder="Ex: Plano Profissional"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Descrição</label>
        <textarea
          {...register("description")}
          rows={2}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          placeholder="Descrição do plano"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Máx. usuários</label>
          <input
            type="number"
            {...register("maxUsers")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Ordem exibição</label>
          <input
            type="number"
            {...register("displayOrder")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Preço cartão (R$)</label>
          <input
            type="number"
            step="0.01"
            {...register("priceCard")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Preço PIX (R$)</label>
          <input
            type="number"
            step="0.01"
            {...register("pricePix")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Desconto anual (%)</label>
          <input
            type="number"
            {...register("annualDiscountPercent")}
            min={0}
            max={100}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Trial (dias)</label>
          <input
            type="number"
            {...register("trialDays")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          {...register("active")}
          className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
        />
        <label htmlFor="active" className="text-sm text-[var(--dash-text)]">Plano ativo</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
        >
          {isSubmitting ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
