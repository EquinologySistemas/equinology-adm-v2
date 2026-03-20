"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { CouponWritePayload } from "@/lib/coupons-api";
import type { Coupon } from "@/types/admin";
import { useEffect, useState } from "react";
import { CouponsForm } from "./CouponsForm";

const API_COUPONS = "/admin/coupons";

interface CouponEditModalProps {
  coupon: Coupon | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function CouponEditModal({
  coupon,
  open,
  onClose,
  onSaved,
}: CouponEditModalProps) {
  const { PutAPI } = useApiContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open]);

  async function handleSubmit(payload: CouponWritePayload) {
    if (!coupon?.id) return;
    setSubmitError(null);
    const res = await PutAPI(`${API_COUPONS}/${coupon.id}`, payload, true);
    if (res.status === 200) {
      onSaved();
      onClose();
    } else {
      const msg =
        typeof res.body === "string"
          ? res.body
          : ((res.body as { message?: string })?.message ??
            "Erro ao atualizar cupom.");
      setSubmitError(msg);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar cupom"
      className="max-w-lg"
    >
      {submitError && (
        <p className="mb-3 text-sm text-red-600">{submitError}</p>
      )}
      {open && coupon && (
        <CouponsForm
          key={coupon.id}
          initialCoupon={coupon}
          submitLabel="Salvar alterações"
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
