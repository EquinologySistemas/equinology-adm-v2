"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import type { FinancialSummary, SubscriptionTransaction } from "@/types/admin";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { TransactionDetailModal } from "./_components/TransactionDetailModal";

const API_FINANCIAL_SUMMARY = "/admin/financial/summary";
const API_FINANCIAL_TRANSACTIONS = "/admin/financial/transactions";
const PAGE_SIZE = 20;

const statusLabels: Record<string, string> = {
  PAID: "Pago",
  RECEIVED: "Recebido",
  PENDING: "Pendente",
  OVERDUE: "Vencido",
  failed: "Falhou",
  refunded: "Reembolsado",
  CANCELLED: "Cancelado",
};

function normalizeTransaction(
  row: Record<string, unknown>,
): SubscriptionTransaction {
  return {
    id: String(row.id ?? ""),
    signatureId: String(row.signatureId ?? ""),
    companyName: String(row.companyName ?? ""),
    planName: String(row.planName ?? ""),
    value: typeof row.value === "number" ? row.value : 0,
    dueDate: String(row.dueDate ?? ""),
    paymentDate: row.paymentDate ? String(row.paymentDate) : undefined,
    status: String(row.status ?? "PENDING"),
    paymentMethod: String(row.paymentMethod ?? ""),
    createdAt: String(row.createdAt ?? ""),
  };
}

export default function FinancialPage() {
  const { GetAPI } = useApiContext();
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>(
    [],
  );
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailTransaction, setDetailTransaction] =
    useState<SubscriptionTransaction | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [summaryRes, transactionsRes] = await Promise.all([
        GetAPI(API_FINANCIAL_SUMMARY, true),
        GetAPI(API_FINANCIAL_TRANSACTIONS, true),
      ]);

      if (summaryRes.status === 200 && summaryRes.body) {
        setSummary({
          revenueMonth:
            typeof summaryRes.body.revenueMonth === "number"
              ? summaryRes.body.revenueMonth
              : 0,
          revenuePreviousMonth:
            typeof summaryRes.body.revenuePreviousMonth === "number"
              ? summaryRes.body.revenuePreviousMonth
              : 0,
          activeSubscriptions:
            typeof summaryRes.body.activeSubscriptions === "number"
              ? summaryRes.body.activeSubscriptions
              : 0,
          trialSubscriptions:
            typeof summaryRes.body.trialSubscriptions === "number"
              ? summaryRes.body.trialSubscriptions
              : 0,
        });
      }

      if (transactionsRes.status === 200) {
        const data =
          transactionsRes.body?.transactions ??
          transactionsRes.body?.data ??
          [];
        const list = Array.isArray(data) ? data : [];
        setTransactions(
          list.map((row: Record<string, unknown>) => normalizeTransaction(row)),
        );
      } else {
        setTransactions([]);
        toast.error("Erro ao carregar transações.");
      }
    } catch (error) {
      console.error("Erro ao carregar dados financeiros:", error);
      toast.error("Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.trim().toLowerCase();
    return transactions.filter(
      (t) =>
        t.companyName?.toLowerCase().includes(q) ||
        t.planName?.toLowerCase().includes(q) ||
        statusLabels[t.status.toUpperCase()]?.toLowerCase().includes(q) ||
        t.paymentMethod?.toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns: ColumnDef<SubscriptionTransaction>[] = useMemo(
    () => [
      {
        key: "dueDate",
        label: "Data de Vencimento",
        sortable: true,
        getValue: (t) => t.dueDate ?? "",
        render: (t) =>
          t.dueDate
            ? new Date(t.dueDate).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "—",
      },
      {
        key: "companyName",
        label: "Empresa",
        sortable: true,
        getValue: (t) => t.companyName ?? "",
      },
      {
        key: "planName",
        label: "Plano",
        sortable: true,
        getValue: (t) => t.planName ?? "",
      },
      {
        key: "value",
        label: "Valor",
        sortable: true,
        getValue: (t) => t.value ?? 0,
        render: (t) =>
          new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(t.value),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        getValue: (t) => t.status.toUpperCase() ?? "PENDING",
        render: (t) => {
          const statusUpper = t.status.toUpperCase();
          const isPaid = statusUpper === "PAID" || statusUpper === "RECEIVED";
          const isPending = statusUpper === "PENDING";
          const isOverdue = statusUpper === "OVERDUE";
          return (
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
              {statusLabels[statusUpper] ?? t.status}
            </span>
          );
        },
      },
      {
        key: "paymentMethod",
        label: "Forma de pagamento",
        sortable: true,
        getValue: (t) => t.paymentMethod ?? "",
      },
      {
        key: "paymentDate",
        label: "Pago em",
        sortable: true,
        getValue: (t) => t.paymentDate ?? "",
        render: (t) =>
          t.paymentDate
            ? new Date(t.paymentDate).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "—",
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">
          Financeiro
        </h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Transações e resumo financeiro
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--dash-border)] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[var(--dash-text-muted)]">
              Receita do mês
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-2xl font-semibold text-[var(--dash-text)]">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(summary.revenueMonth)}
              </p>
              {summary.revenuePreviousMonth > 0 && (
                <span
                  className={`flex items-center gap-1 text-xs ${
                    summary.revenueMonth >= summary.revenuePreviousMonth
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {summary.revenueMonth >= summary.revenuePreviousMonth ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(
                    ((summary.revenueMonth - summary.revenuePreviousMonth) /
                      summary.revenuePreviousMonth) *
                      100,
                  ).toFixed(1)}
                  %
                </span>
              )}
            </div>
            {summary.revenuePreviousMonth > 0 && (
              <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                Mês anterior:{" "}
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(summary.revenuePreviousMonth)}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-[var(--dash-border)] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[var(--dash-text-muted)]">
              Assinaturas Ativas
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
              {summary.activeSubscriptions}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--dash-border)] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[var(--dash-text-muted)]">
              Em Trial
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
              {summary.trialSubscriptions}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por empresa, plano, status ou forma de pagamento..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>

      <DataTable<SubscriptionTransaction>
        data={paginatedData}
        columns={columns}
        keyExtractor={(t) => t.id}
        loading={loading}
        emptyMessage="Nenhuma transação encontrada."
        renderActions={(t) => (
          <button
            type="button"
            onClick={() => setDetailTransaction(t)}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            aria-label="Ver detalhes"
          >
            Detalhes
          </button>
        )}
      />
      {!loading && totalFiltered > 0 && (
        <Pagination
          currentPage={page}
          totalItems={totalFiltered}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      <TransactionDetailModal
        transaction={detailTransaction}
        open={!!detailTransaction}
        onClose={() => setDetailTransaction(null)}
      />
    </div>
  );
}
