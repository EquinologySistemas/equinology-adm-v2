"use client";

import { formatPriceFromCents, parsePriceToCents } from "@/lib/utils";
import type { Plan } from "@/types/admin";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const planSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  maxUsers: z.coerce.number().int().min(0).optional(),
  priceCardCents: z.coerce.number().min(0).optional(),
  pricePixCents: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
  annualDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  trialDays: z.coerce.number().int().min(0).optional(),
});

type PlanFormData = z.infer<typeof planSchema>;

export interface DefaultValuesForCreate {
  annualDiscountPercent?: number;
  trialDays?: number;
  maxUsers?: number;
}

interface PlansFormProps {
  initialData?: Plan;
  defaultValuesForCreate?: DefaultValuesForCreate;
  onSubmit: (data: Partial<Plan>) => void | Promise<void>;
  onCancel: () => void;
}

export function PlansForm({
  initialData,
  defaultValuesForCreate,
  onSubmit,
  onCancel,
}: PlansFormProps) {
  const defaults = initialData
    ? {
        name: initialData.name ?? "",
        description: initialData.description ?? "",
        maxUsers: initialData.maxUsers ?? undefined,
        priceCardCents:
          initialData.priceCard != null
            ? Math.round(initialData.priceCard * 100)
            : undefined,
        pricePixCents:
          initialData.pricePix != null
            ? Math.round(initialData.pricePix * 100)
            : undefined,
        active: initialData.active !== false,
        annualDiscountPercent: initialData.annualDiscountPercent ?? undefined,
        trialDays: initialData.trialDays ?? undefined,
      }
    : {
        name: "",
        description: "",
        maxUsers: defaultValuesForCreate?.maxUsers ?? undefined,
        priceCardCents: undefined,
        pricePixCents: undefined,
        active: true,
        annualDiscountPercent:
          defaultValuesForCreate?.annualDiscountPercent ?? 10,
        trialDays: defaultValuesForCreate?.trialDays ?? 7,
      };

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: defaults,
  });

  function handleFormSubmit(data: PlanFormData) {
    const payload: Partial<Plan> = {
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
      maxUsers:
        data.maxUsers === undefined || Number.isNaN(Number(data.maxUsers))
          ? undefined
          : Number(data.maxUsers),
      active: data.active,
      annualDiscountPercent: data.annualDiscountPercent,
      trialDays: data.trialDays,
    };
    const cardCents = Number(data.priceCardCents);
    if (data.priceCardCents != null && !Number.isNaN(cardCents)) {
      payload.priceCard = cardCents / 100;
    }
    const pixCents = Number(data.pricePixCents);
    if (data.pricePixCents != null && !Number.isNaN(pixCents)) {
      payload.pricePix = pixCents / 100;
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Nome *
        </label>
        <input
          {...register("name")}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          placeholder="Ex: Plano Profissional"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Descrição
        </label>
        <textarea
          {...register("description")}
          rows={2}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          placeholder="Descrição do plano"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Máx. usuários
          </label>
          <input
            type="number"
            {...register("maxUsers")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            placeholder="Vazio = ilimitado"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Preço cartão (R$)
          </label>
          <Controller
            name="priceCardCents"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="0,00"
                value={
                  field.value != null
                    ? formatPriceFromCents(Number(field.value))
                    : ""
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  const cents = parsePriceToCents(raw);
                  field.onChange(raw.trim() === "" ? undefined : cents);
                }}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Preço PIX (R$)
          </label>
          <Controller
            name="pricePixCents"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                placeholder="0,00"
                value={
                  field.value != null
                    ? formatPriceFromCents(Number(field.value))
                    : ""
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  const cents = parsePriceToCents(raw);
                  field.onChange(raw.trim() === "" ? undefined : cents);
                }}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Desconto anual (%)
          </label>
          <input
            type="number"
            {...register("annualDiscountPercent")}
            min={0}
            max={100}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Trial (dias)
          </label>
          <input
            type="number"
            {...register("trialDays")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
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
        <label htmlFor="active" className="text-sm text-[var(--dash-text)]">
          Plano ativo
        </label>
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
