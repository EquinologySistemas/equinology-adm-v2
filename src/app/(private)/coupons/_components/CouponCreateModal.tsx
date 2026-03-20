"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { CouponWritePayload } from "@/lib/coupons-api";
import { useEffect, useState } from "react";
import { CouponsForm } from "./CouponsForm";

const API_COUPONS = "/admin/coupons";

interface CouponCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function CouponCreateModal({
  open,
  onClose,
  onSaved,
}: CouponCreateModalProps) {
  const { PostAPI } = useApiContext();
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSubmitError(null);
  }, [open]);

  async function handleSubmit(payload: CouponWritePayload) {
    setSubmitError(null);
    const res = await PostAPI(API_COUPONS, payload, true);
    if (res.status === 200 || res.status === 201) {
      onSaved();
      onClose();
    } else {
      const msg =
        typeof res.body === "string"
          ? res.body
          : ((res.body as { message?: string })?.message ??
            "Erro ao criar cupom.");
      setSubmitError(msg);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo cupom"
      className="max-w-lg"
    >
      {submitError && (
        <p className="mb-3 text-sm text-red-600">{submitError}</p>
      )}
      {open && (
        <CouponsForm
          key="create"
          submitLabel="Criar cupom"
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
