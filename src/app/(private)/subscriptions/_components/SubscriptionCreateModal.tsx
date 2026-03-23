"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { Company, Plan, Coupon } from "@/types/admin";
import { couponFromApi } from "@/lib/coupons-api";
import { planFromApi } from "@/lib/plans-api";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const API_COMPANIES = "/admin/companies";
const API_PLANS = "/signature-plan";
const API_SIGNATURE = "/admin/signature";
const API_COUPONS = "/admin/coupons";

interface SubscriptionCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SubscriptionCreateModal({
  open,
  onClose,
  onSaved,
}: SubscriptionCreateModalProps) {
  const { GetAPI, PostAPI } = useApiContext();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [planId, setPlanId] = useState("");
  const [couponId, setCouponId] = useState("");
  const [yearly, setYearly] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInvoiceUrl(null);
    setCompanyId("");
    setPlanId("");
    setCouponId("");
    setYearly(false);
    setIsTrial(false);
    (async () => {
      const [companiesRes, plansRes, couponsRes] = await Promise.all([
        GetAPI(API_COMPANIES, true),
        GetAPI(API_PLANS, true),
        GetAPI(API_COUPONS, true),
      ]);
      if (companiesRes.status === 200) {
        const list = companiesRes.body?.companies ?? [];
        const arr = Array.isArray(list) ? list : [];
        setCompanies(arr);
        if (arr.length) setCompanyId(arr[0].id);
      }
      if (plansRes.status === 200) {
        const raw = plansRes.body?.plans ?? plansRes.body ?? [];
        const list = Array.isArray(raw) ? raw : [];
        const normalized: Plan[] = list.map((p: Record<string, unknown>) =>
          planFromApi(p),
        );
        setPlans(normalized);
        if (normalized.length) setPlanId(normalized[0].id);
      }
      if (couponsRes.status === 200) {
        const raw = couponsRes.body?.coupons ?? couponsRes.body ?? [];
        const list = Array.isArray(raw) ? raw : [];
        const activeCoupons = list
          .map((c: Record<string, unknown>) => couponFromApi(c))
          .filter((c: Coupon) => c.isActive);
        setCoupons(activeCoupons);
      }
    })();
  }, [open, GetAPI]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !planId) {
      toast.error("Selecione empresa e plano.");
      return;
    }
    setSubmitting(true);
    const payload: { yearly: boolean; isTrial: boolean; couponId?: string } = {
      yearly,
      isTrial,
    };
    if (couponId) {
      payload.couponId = couponId;
    }
    const res = await PostAPI(
      `${API_SIGNATURE}/create/${companyId}/${planId}`,
      payload,
      true,
    );
    setSubmitting(false);
    if (res.status === 200 || res.status === 201) {
      const url = res.body?.invoiceUrl;
      if (url) setInvoiceUrl(url);
      else {
        onSaved();
        onClose();
        toast.success("Assinatura criada.");
      }
    } else {
      toast.error(res.body?.message ?? "Erro ao criar assinatura.");
    }
  }

  function handleClose() {
    setInvoiceUrl(null);
    onClose();
    onSaved();
  }

  function copyInvoiceUrl() {
    if (invoiceUrl) {
      navigator.clipboard.writeText(invoiceUrl);
      toast.success("Link copiado.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova assinatura"
      className="max-w-lg"
    >
      {invoiceUrl ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--dash-text-muted)]">
            Assinatura criada. Envie o link abaixo ao cliente para pagamento:
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={invoiceUrl}
              className="flex-1 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-bg)]/40 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={copyInvoiceUrl}
              className="rounded-xl bg-[var(--dash-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
            >
              Copiar
            </button>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
              Empresa (Cliente) *
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
              required
            >
              <option value="">Selecione</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
              Plano *
            </label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
              required
            >
              <option value="">Selecione</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
              Ciclo
            </label>
            <select
              value={yearly ? "yearly" : "monthly"}
              onChange={(e) => setYearly(e.target.value === "yearly")}
              className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            >
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isTrial"
              checked={isTrial}
              onChange={(e) => setIsTrial(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--dash-border)]"
            />
            <label
              htmlFor="isTrial"
              className="text-sm text-[var(--dash-text)]"
            >
              Período de trial
            </label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
              Cupom (opcional)
            </label>
            <select
              value={couponId}
              onChange={(e) => setCouponId(e.target.value)}
              className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            >
              <option value="">Nenhum cupom</option>
              {coupons.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}{" "}
                  {c.discountType === "PERCENT"
                    ? `(${c.discountPercentage}%)`
                    : `(R$ ${c.discountFixedAmount?.toFixed(2)})`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
            >
              {submitting ? "Criando…" : "Criar assinatura"}
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
      )}
    </Modal>
  );
}
