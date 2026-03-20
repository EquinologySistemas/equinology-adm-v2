"use client";

import { Modal } from "@/components/ui/Modal";
import { useApiContext } from "@/context/ApiContext";
import type { Plan, Subscription } from "@/types/admin";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const API_SIGNATURE = "/admin/signature";
const API_PLANS = "/signature-plan";

const statusLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  TRIAL: "Trial",
};

/** Status de cobrança retornados pela API Asaas (pagamentos da assinatura) */
const paymentHistoryStatusLabels: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  OVERDUE: "Vencido",
  REFUNDED: "Estornado",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  REFUND_REQUESTED: "Estorno solicitado",
  REFUND_IN_PROGRESS: "Estorno em andamento",
  CHARGEBACK_REQUESTED: "Chargeback solicitado",
  CHARGEBACK_DISPUTE: "Chargeback em disputa",
  AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão do chargeback",
  DUNNING_REQUESTED: "Cobrança extrajudicial solicitada",
  DUNNING_RECEIVED: "Cobrança extrajudicial recebida",
  AWAITING_RISK_ANALYSIS: "Aguardando análise de risco",
  APPROVED: "Aprovado",
  CANCELLED: "Cancelado",
  DELETED: "Excluído",
  CHARGEDBACK: "Chargeback",
  SPLIT_DIVERGENCE_BLOCK: "Bloqueado por divergência de split",
  SPLIT_DIVERGENCE_BLOCK_FINISHED: "Divergência de split finalizada",
};

function formatPaymentHistoryStatus(status: string): string {
  if (!status) return "—";
  const key = status.trim().toUpperCase();
  return paymentHistoryStatusLabels[key] ?? status;
}

interface SubscriptionDetailModalProps {
  subscription: Subscription | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function SubscriptionDetailModal({
  subscription,
  open,
  onClose,
  onUpdated,
}: SubscriptionDetailModalProps) {
  const { GetAPI, PostAPI, PatchAPI } = useApiContext();
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [changePlanId, setChangePlanId] = useState("");
  const [changeYearly, setChangeYearly] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [historyPayments, setHistoryPayments] = useState<
    { id: string; value: number; dueDate: string; status: string }[] | null
  >(null);
  const [editStatus, setEditStatus] = useState<"ACTIVE" | "INACTIVE">(
    "INACTIVE",
  );
  const [editExpiration, setEditExpiration] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAction(
    action: () => Promise<{
      status: number;
      body?: { message?: string; invoiceUrl?: string; payments?: unknown[] };
    }>,
  ) {
    if (!subscription) return;
    setLoading(true);
    try {
      const res = await action();
      if (res.status === 200 || res.status === 201) {
        toast.success("Ação concluída.");
        onUpdated();
        onClose();
        if (res.body?.invoiceUrl) {
          toast.success("Link de pagamento disponível.");
          if (res.body.invoiceUrl)
            navigator.clipboard.writeText(res.body.invoiceUrl);
        }
      } else {
        toast.error(res.body?.message ?? "Erro ao executar ação.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!subscription || !confirm("Cancelar esta assinatura?")) return;
    await handleAction(() =>
      PostAPI(`${API_SIGNATURE}/cancel/${subscription.id}`, {}, true),
    );
  }

  async function reactivate() {
    if (!subscription) return;
    await handleAction(() =>
      PostAPI(`${API_SIGNATURE}/reactivate/${subscription.id}`, {}, true),
    );
  }

  async function renewYearly() {
    if (!subscription) return;
    await handleAction(() =>
      PostAPI(`${API_SIGNATURE}/renew-yearly/${subscription.id}`, {}, true),
    );
  }

  async function charge() {
    if (!subscription) return;
    const res = await PostAPI(
      `${API_SIGNATURE}/charge/${subscription.id}`,
      {},
      true,
    );
    if (res.status === 200 && res.body?.invoiceUrl) {
      navigator.clipboard.writeText(res.body.invoiceUrl);
      toast.success("Link de cobrança copiado.");
      onUpdated();
    } else {
      toast.error(res.body?.message ?? "Erro ao gerar cobrança.");
    }
  }

  async function changePlanSubmit() {
    if (!subscription || !changePlanId) return;
    const res = await PostAPI(
      `${API_SIGNATURE}/change-plan/${subscription.id}`,
      {
        planId: changePlanId,
        yearly: changeYearly,
      },
      true,
    );
    if (res.status === 200) {
      toast.success("Plano alterado.");
      setShowChangePlan(false);
      onUpdated();
      onClose();
    } else {
      toast.error(res.body?.message ?? "Erro ao alterar plano.");
    }
  }

  async function loadHistory() {
    if (!subscription) return;
    const res = await GetAPI(
      `${API_SIGNATURE}/${subscription.id}/history`,
      true,
    );
    if (res.status === 200) setHistoryPayments(res.body?.payments ?? []);
    else setHistoryPayments([]);
  }

  async function loadReceipt() {
    if (!subscription) return;
    const res = await GetAPI(
      `${API_SIGNATURE}/${subscription.id}/receipt`,
      true,
    );
    if (res.status === 200 && res.body?.invoiceUrl) {
      window.open(res.body.invoiceUrl, "_blank");
    } else {
      toast.error("Recibo não disponível.");
    }
  }

  async function loadPlans() {
    const res = await GetAPI(API_PLANS, true);
    if (res.status === 200) {
      const raw = res.body?.plans ?? res.body ?? [];
      const list = Array.isArray(raw) ? raw : [];
      setPlans(
        list.map((p: Record<string, unknown>) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          maxUsers: p.userQuantity,
          priceCard: p.creditCardPrice,
          pricePix: p.pixPrice,
          active: p.isActive,
          annualDiscountPercent: p.yearlyDiscount,
          trialDays: p.trialDays,
        })),
      );
    }
  }

  function openChangePlan() {
    setShowChangePlan(true);
    setChangePlanId(subscription?.planId ?? "");
    setChangeYearly(subscription?.yearly ?? false);
    loadPlans();
  }

  useEffect(() => {
    if (subscription) {
      setEditStatus(
        subscription.status === "TRIAL"
          ? "ACTIVE"
          : (subscription.status as "ACTIVE" | "INACTIVE"),
      );
      setEditExpiration(
        subscription.expirationDate
          ? new Date(subscription.expirationDate).toISOString().slice(0, 10)
          : "",
      );
    }
  }, [subscription]);

  async function saveUpdate() {
    if (!subscription) return;
    setSaving(true);
    const payload: { status?: string; expirationDate?: string } = {};
    if (editStatus && editStatus !== subscription.status)
      payload.status = editStatus;
    if (editExpiration)
      payload.expirationDate = new Date(editExpiration).toISOString();
    if (Object.keys(payload).length === 0) {
      setSaving(false);
      return;
    }
    const res = await PatchAPI(
      `${API_SIGNATURE}/${subscription.id}`,
      payload,
      true,
    );
    setSaving(false);
    if (res.status === 200) {
      toast.success("Atualizado.");
      onUpdated();
    } else {
      toast.error(res.body?.message ?? "Erro ao atualizar.");
    }
  }

  if (!subscription) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes da assinatura"
      className="max-w-lg"
    >
      <div className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-[var(--dash-text-muted)]">Cliente</dt>
            <dd className="font-medium text-[var(--dash-text)]">
              {subscription.companyName ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">E-mail</dt>
            <dd className="text-[var(--dash-text)]">
              {subscription.companyPrimaryEmail ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Plano</dt>
            <dd className="text-[var(--dash-text)]">
              {subscription.planName ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Ciclo</dt>
            <dd className="text-[var(--dash-text)]">
              {subscription.yearly ? "Anual" : "Mensal"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Status</dt>
            <dd>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  subscription.status === "ACTIVE"
                    ? "bg-green-100 text-green-800"
                    : subscription.status === "TRIAL"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {statusLabels[subscription.status] ?? subscription.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Validade</dt>
            <dd className="text-[var(--dash-text)]">
              {subscription.expirationDate
                ? new Date(subscription.expirationDate).toLocaleDateString(
                    "pt-BR",
                  )
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Cadastro</dt>
            <dd className="text-[var(--dash-text)]">
              {subscription.createdAt
                ? new Date(subscription.createdAt).toLocaleDateString("pt-BR")
                : "—"}
            </dd>
          </div>
        </dl>

        <div className="border-t border-[var(--dash-border)] pt-4">
          <button
            type="button"
            onClick={() => setShowUpdate((v) => !v)}
            className="text-sm font-medium text-[var(--dash-accent)] hover:underline"
          >
            {showUpdate ? "Ocultar" : "Alterar status ou validade"}
          </button>
          {showUpdate && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--dash-text-muted)]">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as "ACTIVE" | "INACTIVE")
                  }
                  className="rounded-lg border border-[var(--dash-border)] px-3 py-2 text-sm"
                >
                  <option value="ACTIVE">Ativa</option>
                  <option value="INACTIVE">Inativa</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--dash-text-muted)]">
                  Validade
                </label>
                <input
                  type="date"
                  value={editExpiration}
                  onChange={(e) => setEditExpiration(e.target.value)}
                  className="rounded-lg border border-[var(--dash-border)] px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={saveUpdate}
                disabled={saving}
                className="rounded-xl bg-[var(--dash-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          )}
        </div>

        {!showChangePlan ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--dash-border)] pt-4">
            {subscription.status === "INACTIVE" && (
              <button
                type="button"
                onClick={reactivate}
                disabled={loading}
                className="rounded-xl bg-[var(--dash-accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
              >
                Reativar
              </button>
            )}
            {subscription.status !== "INACTIVE" && (
              <button
                type="button"
                onClick={cancel}
                disabled={loading}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Cancelar
              </button>
            )}
            {subscription.status === "ACTIVE" && !subscription.yearly && (
              <button
                type="button"
                onClick={renewYearly}
                disabled={loading}
                className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80 disabled:opacity-60"
              >
                Renovar anual
              </button>
            )}
            <button
              type="button"
              onClick={charge}
              disabled={loading}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80 disabled:opacity-60"
            >
              Gerar cobrança
            </button>
            <button
              type="button"
              onClick={openChangePlan}
              disabled={loading}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80 disabled:opacity-60"
            >
              Trocar plano
            </button>
            <button
              type="button"
              onClick={loadHistory}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
            >
              Histórico
            </button>
            <button
              type="button"
              onClick={loadReceipt}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
            >
              Recibo
            </button>
          </div>
        ) : (
          <div className="space-y-3 border-t border-[var(--dash-border)] pt-4">
            <p className="text-sm font-medium text-[var(--dash-text)]">
              Trocar plano
            </p>
            <select
              value={changePlanId}
              onChange={(e) => setChangePlanId(e.target.value)}
              className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="changeYearly"
                checked={changeYearly}
                onChange={(e) => setChangeYearly(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--dash-border)]"
              />
              <label htmlFor="changeYearly" className="text-sm">
                Ciclo anual
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={changePlanSubmit}
                disabled={loading}
                className="rounded-xl bg-[var(--dash-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setShowChangePlan(false)}
                className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2 text-sm font-medium"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {historyPayments !== null && !showChangePlan && (
          <div className="border-t border-[var(--dash-border)] pt-4">
            <p className="mb-2 text-sm font-medium text-[var(--dash-text)]">
              Histórico de pagamentos
            </p>
            {historyPayments.length === 0 ? (
              <p className="text-sm text-[var(--dash-text-muted)]">
                Nenhum pagamento listado.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {historyPayments.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between text-[var(--dash-text)]"
                  >
                    <span>
                      {p.dueDate
                        ? new Date(p.dueDate).toLocaleDateString("pt-BR")
                        : p.id}
                    </span>
                    <span>
                      R$ {Number(p.value).toFixed(2)} —{" "}
                      {formatPaymentHistoryStatus(p.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
