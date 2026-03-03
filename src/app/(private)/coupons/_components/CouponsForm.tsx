"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Coupon } from "@/types/admin";

const couponSchema = z.object({
  code: z.string().min(1, "Código é obrigatório"),
  type: z.enum(["percent", "fixed"]),
  value: z.coerce.number().min(0, "Valor deve ser positivo"),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  maxUses: z.coerce.number().int().min(0).optional(),
  maxUsesPerUser: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
}).refine(
  (data) => {
    if (!data.validFrom || !data.validUntil) return true;
    return new Date(data.validUntil) >= new Date(data.validFrom);
  },
  { message: "Validade final deve ser após a inicial", path: ["validUntil"] }
);

type CouponFormData = z.infer<typeof couponSchema>;

interface CouponsFormProps {
  initialData?: Coupon;
  onSubmit: (data: Partial<Coupon>) => void | Promise<void>;
  onCancel: () => void;
}

export function CouponsForm({ initialData, onSubmit, onCancel }: CouponsFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormData>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      code: initialData?.code ?? "",
      type: initialData?.type ?? "percent",
      value: initialData?.value ?? 0,
      validFrom: initialData?.validFrom ? initialData.validFrom.slice(0, 10) : "",
      validUntil: initialData?.validUntil ? initialData.validUntil.slice(0, 10) : "",
      maxUses: initialData?.maxUses ?? undefined,
      maxUsesPerUser: initialData?.maxUsesPerUser ?? undefined,
      active: initialData?.active !== false,
    },
  });

  const type = watch("type");

  return (
    <form onSubmit={handleSubmit((data) => onSubmit(data))} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Código *</label>
        <input
          {...register("code")}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          placeholder="EX: PROMO20"
        />
        {errors.code && (
          <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Tipo</label>
          <select
            {...register("type")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          >
            <option value="percent">Percentual</option>
            <option value="fixed">Valor fixo</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            {type === "percent" ? "Percentual (%)" : "Valor (R$)"} *
          </label>
          <input
            type="number"
            step={type === "percent" ? 1 : 0.01}
            {...register("value")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
          {errors.value && (
            <p className="mt-1 text-xs text-red-600">{errors.value.message}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Válido de</label>
          <input
            type="date"
            {...register("validFrom")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Válido até</label>
          <input
            type="date"
            {...register("validUntil")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
          {errors.validUntil && (
            <p className="mt-1 text-xs text-red-600">{errors.validUntil.message}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Uso máximo (cupom)</label>
          <input
            type="number"
            {...register("maxUses")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">Uso máx. por usuário</label>
          <input
            type="number"
            {...register("maxUsesPerUser")}
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
        <label htmlFor="active" className="text-sm text-[var(--dash-text)]">Cupom ativo</label>
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
