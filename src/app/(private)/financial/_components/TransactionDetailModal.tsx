"use client";

import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/date";
import type { SubscriptionTransaction } from "@/types/admin";

const statusLabels: Record<string, string> = {
  PAID: "Pago",
  RECEIVED: "Recebido",
  // Estados liquidados que a listagem já reconhece e o modal ignorava,
  // mostrando o código cru do provedor.
  CONFIRMED: "Confirmado",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  REFUNDED: "Reembolsado",
  PENDING: "Pendente",
  OVERDUE: "Vencido",
  failed: "Falhou",
  refunded: "Reembolsado",
  CANCELLED: "Cancelado",
};

interface TransactionDetailModalProps {
  transaction: SubscriptionTransaction | null;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetailModal({
  transaction,
  open,
  onClose,
}: TransactionDetailModalProps) {
  if (!transaction) return null;

  const statusUpper = transaction.status.toUpperCase();
  // Mesmos estados que a API conta como liquidados em "Recebido no mês".
  const isPaid = ["PAID", "RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(
    statusUpper,
  );
  const isPending = statusUpper === "PENDING";
  const isOverdue = statusUpper === "OVERDUE";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes da transação"
      className="max-w-lg"
    >
      <div className="space-y-4">
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-[var(--dash-text-muted)]">Empresa</dt>
            <dd className="font-medium text-[var(--dash-text)]">
              {transaction.companyName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Plano</dt>
            <dd className="text-[var(--dash-text)]">
              {transaction.planName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Valor</dt>
            <dd className="font-medium text-[var(--dash-text)]">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(transaction.value)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Status</dt>
            <dd>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  isPaid
                    ? "bg-green-100 text-green-800"
                    : isPending
                      ? "bg-yellow-100 text-yellow-800"
                      : isOverdue
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-600"
                }`}
              >
                {statusLabels[statusUpper] ?? transaction.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">
              Data de Vencimento
            </dt>
            <dd className="text-[var(--dash-text)]">
              {formatDate(transaction.dueDate)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Pago em</dt>
            <dd className="text-[var(--dash-text)]">
              {/* Sem data do provedor mostra "—". Nunca o vencimento. */}
              {formatDate(transaction.paymentDate)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">
              Forma de pagamento
            </dt>
            <dd className="text-[var(--dash-text)]">
              {transaction.paymentMethod || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--dash-text-muted)]">Criado em</dt>
            <dd className="text-[var(--dash-text)]">
              {formatDate(transaction.createdAt)}
            </dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
