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

interface PlanCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PlanCreateModal({
  open,
  onClose,
  onSaved,
}: PlanCreateModalProps) {
  const { PostAPI } = useApiContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open]);

  async function handleSubmit(data: Partial<Plan>) {
    setSubmitError(null);
    const payload = mapPlanToAdminPayload(data);
    const res = await PostAPI(API_ADMIN_PLANS, payload, true);
    if (res.status === 200 || res.status === 201) {
      toast.success("Plano criado com sucesso.");
      onSaved();
      onClose();
    } else {
      const message =
        typeof res.body === "string"
          ? res.body
          : (res.body?.message ?? "Erro ao criar plano.");
      setSubmitError(message);
      toast.error(message);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo plano"
      className="max-w-lg"
    >
      {submitError && (
        <p className="mb-4 text-sm text-red-600">{submitError}</p>
      )}
      <PlansForm
        key="create"
        defaultValuesForCreate={{
          annualDiscountPercent: 10,
          trialDays: 7,
          maxUsers: undefined,
        }}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Modal>
  );
}
