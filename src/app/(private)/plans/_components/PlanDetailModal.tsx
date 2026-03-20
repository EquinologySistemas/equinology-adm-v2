"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { Plan } from "@/types/admin";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { PlansForm } from "./PlansForm";

const API_ADMIN_PLANS = "/admin/plans";

function mapPlanToAdminPayload(data: Partial<Plan>) {
  return {
    name: data.name,
    description: data.description || undefined,
    userQuantity: data.maxUsers ?? null,
    creditCardPrice: data.priceCard,
    pixPrice: data.pricePix,
    isActive: data.active ?? true,
    yearlyDiscount: data.annualDiscountPercent ?? 0,
    trialDays: data.trialDays ?? 0,
  };
}

interface PlanDetailModalProps {
  plan: Plan | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PlanDetailModal({
  plan,
  open,
  onClose,
  onSaved,
}: PlanDetailModalProps) {
  const { PutAPI } = useApiContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open]);

  async function handleSubmit(data: Partial<Plan>) {
    if (!plan?.id) return;
    setSubmitError(null);
    const payload = mapPlanToAdminPayload(data);
    const res = await PutAPI(`${API_ADMIN_PLANS}/${plan.id}`, payload, true);
    if (res.status === 200) {
      toast.success("Plano atualizado.");
      onSaved();
      onClose();
    } else {
      const message =
        typeof res.body === "string"
          ? res.body
          : (res.body?.message ?? "Erro ao atualizar plano.");
      setSubmitError(message);
      toast.error(message);
    }
  }

  if (!plan) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar plano"
      className="max-w-lg"
    >
      {submitError && (
        <p className="mb-4 text-sm text-red-600">{submitError}</p>
      )}
      <PlansForm
        key={plan.id}
        initialData={plan}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}
