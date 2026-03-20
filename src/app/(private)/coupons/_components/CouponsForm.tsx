"use client";

import {
  couponFormToPayload,
  type CouponWritePayload,
} from "@/lib/coupons-api";
import type { Coupon } from "@/types/admin";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const couponSchema = z
  .object({
    code: z.string().min(1, "Código é obrigatório"),
    discountType: z.enum(["PERCENT", "FIXED"]),
    value: z.coerce.number(),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    maxUsagesInput: z.string().optional(),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const hasFrom = Boolean(data.validFrom?.trim());
    const hasUntil = Boolean(data.validUntil?.trim());
    if (hasFrom !== hasUntil) {
      ctx.addIssue({
        code: "custom",
        message:
          "Informe data inicial e final, ou deixe as duas em branco para validade indefinida.",
        path: ["validUntil"],
      });
    }
    if (hasFrom && hasUntil) {
      const a = new Date(data.validFrom!);
      const b = new Date(data.validUntil!);
      if (b < a) {
        ctx.addIssue({
          code: "custom",
          message: "Validade final deve ser igual ou posterior à inicial.",
          path: ["validUntil"],
        });
      }
    }
    if (data.discountType === "PERCENT") {
      if (data.value <= 0 || data.value > 100) {
        ctx.addIssue({
          code: "custom",
          message: "Informe um percentual entre 1 e 100.",
          path: ["value"],
        });
      }
    } else if (data.value <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Informe um valor fixo maior que zero.",
        path: ["value"],
      });
    }
  });

export type CouponFormValues = z.infer<typeof couponSchema>;

function defaultValuesFromCoupon(c?: Coupon | null): CouponFormValues {
  if (!c) {
    return {
      code: "",
      discountType: "PERCENT",
      value: 0,
      validFrom: "",
      validUntil: "",
      maxUsagesInput: "",
      isActive: true,
    };
  }
  const value =
    c.discountType === "FIXED"
      ? (c.discountFixedAmount ?? 0)
      : c.discountPercentage;
  return {
    code: c.code ?? "",
    discountType: c.discountType,
    value,
    validFrom: c.validFrom ? c.validFrom.slice(0, 10) : "",
    validUntil: c.validUntil ? c.validUntil.slice(0, 10) : "",
    maxUsagesInput:
      c.maxUsages != null && c.maxUsages >= 1 ? String(c.maxUsages) : "",
    isActive: c.isActive !== false,
  };
}

interface CouponsFormProps {
  initialCoupon?: Coupon | null;
  submitLabel?: string;
  onSubmit: (payload: CouponWritePayload) => void | Promise<void>;
  onCancel: () => void;
}

export function CouponsForm({
  initialCoupon,
  submitLabel = "Salvar",
  onSubmit,
  onCancel,
}: CouponsFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: defaultValuesFromCoupon(initialCoupon),
  });

  const discountType = watch("discountType");

  async function onValid(data: CouponFormValues) {
    const payload = couponFormToPayload({
      code: data.code,
      discountType: data.discountType,
      value: data.value,
      validFrom: data.validFrom ?? "",
      validUntil: data.validUntil ?? "",
      maxUsagesInput: data.maxUsagesInput ?? "",
      isActive: data.isActive,
    });
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-4">
      <p className="text-xs text-[var(--dash-text-muted)]">
        Deixe as datas em branco para validade indefinida. Deixe &quot;Uso
        máximo&quot; vazio para uso ilimitado.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Código *
        </label>
        <input
          {...register("code")}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm uppercase focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          placeholder="EX: PROMO20"
        />
        {errors.code && (
          <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Tipo
          </label>
          <select
            {...register("discountType")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          >
            <option value="PERCENT">Percentual</option>
            <option value="FIXED">Valor fixo</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            {discountType === "PERCENT" ? "Percentual (%)" : "Valor (R$)"} *
          </label>
          <input
            type="number"
            step={discountType === "PERCENT" ? 1 : 0.01}
            {...register("value")}
            min={0}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
          {errors.value && (
            <p className="mt-1 text-xs text-red-600">{errors.value.message}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Válido de
          </label>
          <input
            type="date"
            {...register("validFrom")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Válido até
          </label>
          <input
            type="date"
            {...register("validUntil")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
          {errors.validUntil && (
            <p className="mt-1 text-xs text-red-600">
              {errors.validUntil.message}
            </p>
          )}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Uso máximo (cupom)
        </label>
        <input
          type="text"
          inputMode="numeric"
          {...register("maxUsagesInput")}
          placeholder="Ilimitado se vazio"
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <Controller
          name="isActive"
          control={control}
          render={({ field: { value, onChange } }) => (
            <input
              type="checkbox"
              id="coupon-active"
              checked={value}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
            />
          )}
        />
        <label
          htmlFor="coupon-active"
          className="text-sm text-[var(--dash-text)]"
        >
          Cupom ativo
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
          {isSubmitting ? "Salvando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
