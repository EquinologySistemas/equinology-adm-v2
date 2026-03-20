import type { Coupon } from "@/types/admin";

/** Payload alinhado ao CreateCouponDto / EditCouponDto da API */
export type CouponWritePayload = {
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountPercentage?: number;
  discountFixedAmount?: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUsages: number | null;
  isActive: boolean;
};

export function couponFromApi(raw: Record<string, unknown>): Coupon {
  const discountType =
    raw.discountType === "FIXED" || raw.discountType === "PERCENT"
      ? raw.discountType
      : "PERCENT";
  const discountPercentage =
    typeof raw.discountPercentage === "number"
      ? raw.discountPercentage
      : Number(raw.discountPercentage) || 0;
  const discountFixedAmount =
    raw.discountFixedAmount === null || raw.discountFixedAmount === undefined
      ? null
      : Number(raw.discountFixedAmount);

  return {
    id: String(raw.id ?? ""),
    code: String(raw.code ?? ""),
    discountType,
    discountPercentage,
    discountFixedAmount: Number.isFinite(discountFixedAmount as number)
      ? (discountFixedAmount as number)
      : null,
    validFrom: raw.validFrom != null ? String(raw.validFrom) : null,
    validUntil: raw.validUntil != null ? String(raw.validUntil) : null,
    maxUsages:
      raw.maxUsages === null || raw.maxUsages === undefined
        ? null
        : Number(raw.maxUsages),
    currentUsages:
      typeof raw.currentUsages === "number"
        ? raw.currentUsages
        : Number(raw.currentUsages) || 0,
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

export function formatCouponValue(c: Coupon): string {
  if (c.discountType === "FIXED" && c.discountFixedAmount != null) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c.discountFixedAmount);
  }
  return `${c.discountPercentage}%`;
}

export function formatCouponValidity(c: Coupon): string {
  if (!c.validFrom && !c.validUntil) return "Indefinida";
  const from = c.validFrom
    ? new Date(c.validFrom).toLocaleDateString("pt-BR")
    : "—";
  const until = c.validUntil
    ? new Date(c.validUntil).toLocaleDateString("pt-BR")
    : "—";
  return `${from} – ${until}`;
}

export function parseMaxUsagesInput(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "")
    return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/** Converte saída do formulário para payload da API */
export function couponFormToPayload(values: {
  code: string;
  discountType: "PERCENT" | "FIXED";
  value: number;
  validFrom: string;
  validUntil: string;
  maxUsagesInput: string;
  isActive: boolean;
}): CouponWritePayload {
  const validFrom = values.validFrom?.trim() || null;
  const validUntil = values.validUntil?.trim() || null;
  const maxUsages = parseMaxUsagesInput(values.maxUsagesInput);

  const base: CouponWritePayload = {
    code: values.code.trim().toUpperCase(),
    discountType: values.discountType,
    validFrom,
    validUntil,
    maxUsages,
    isActive: values.isActive,
  };

  if (values.discountType === "FIXED") {
    return {
      ...base,
      discountPercentage: 0,
      discountFixedAmount: values.value,
    };
  }
  return {
    ...base,
    discountPercentage: values.value,
    discountFixedAmount: undefined,
  };
}
