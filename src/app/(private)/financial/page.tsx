"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { formatDate } from "@/lib/date";
import {
  getFinancialSummary,
  getSubscriptionTransactions,
} from "@/lib/financial-api";
import type { FinancialSummary, SubscriptionTransaction } from "@/types/admin";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { TransactionDetailModal } from "./_components/TransactionDetailModal";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

const statusLabels: Record<string, string> = {
  PAID: "Pago",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  PENDING: "Pendente",
  OVERDUE: "Vencido",
  failed: "Falhou",
  refunded: "Reembolsado",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
};

const statusFilterOptions = [
  { value: "", label: "Todos os status" },
  { value: "RECEIVED", label: "Recebido" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "PENDING", label: "Pendente" },
  { value: "OVERDUE", label: "Vencido" },
  { value: "REFUNDED", label: "Reembolsado" },
];

function firstDayOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export default function FinancialPage() {
  const { GetAPI } = useApiContext();
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>(
    [],
  );
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [startDate, setStartDate] = useState(firstDayOfCurrentMonth());
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("");
  const [detailTransaction, setDetailTransaction] =
    useState<SubscriptionTransaction | null>(null);

  // A listagem é paginada e filtrada NO SERVIDOR. Antes a tela pedia a rota
  // sem nenhum parâmetro, recebia as 10 primeiras (default da API) e filtrava
  // só essas 10 no navegador — era impossível auditar o que foi recebido.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResult, transactionsResult] = await Promise.all([
        getFinancialSummary(GetAPI),
        getSubscriptionTransactions(GetAPI, {
          page,
          pageSize,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          status: status || undefined,
        }),
      ]);

      if (summaryResult) setSummary(summaryResult);

      if (transactionsResult) {
        setTransactions(transactionsResult.transactions);
        setTotal(transactionsResult.total);
      } else {
        setTransactions([]);
        setTotal(0);
        toast.error("Erro ao carregar transações.");
      }
    } catch (error) {
      console.error("Erro ao carregar dados financeiros:", error);
      toast.error("Erro ao carregar dados financeiros.");
    } finally {
      setLoading(false);
    }
  }, [GetAPI, page, pageSize, startDate, endDate, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, status, pageSize]);

  // Busca textual: a API não tem busca por texto, então ela refina apenas a
  // página já carregada. O rótulo do campo diz isso para não enganar.
  const paginatedData = useMemo(() => {
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

  const columns: ColumnDef<SubscriptionTransaction>[] = useMemo(
    () => [
      {
        key: "dueDate",
        label: "Data de Vencimento",
        sortable: true,
        getValue: (t) => t.dueDate ?? "",
        render: (t) => formatDate(t.dueDate),
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
          // Mesmos estados que a API conta como liquidados em "Recebido no mês"
          // — CONFIRMED (cartão aprovado) aparecia em cinza, como se não fosse
          // dinheiro entrado.
          const isPaid = [
            "PAID",
            "RECEIVED",
            "CONFIRMED",
            "RECEIVED_IN_CASH",
          ].includes(statusUpper);
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
        // Data real de liquidação do provedor. Sem ela, "—": nunca o
        // vencimento, que é o que a tela mostrava antes.
        render: (t) => formatDate(t.paymentDate),
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
              Recebido no mês
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
            <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
              Soma dos pagamentos liquidados, pela data de pagamento informada
              pelo provedor.
            </p>
            {summary.revenuePreviousMonth > 0 && (
              <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
                Mês anterior:{" "}
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(summary.revenuePreviousMonth)}
              </p>
            )}
            {summary.settledWithoutDate > 0 && (
              <p className="mt-2 rounded-lg bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
                {summary.settledWithoutDate} pagamento(s) liquidado(s) sem data
                informada pelo provedor ficaram fora deste total.
              </p>
            )}
            {summary.signaturesNotRead > 0 && (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800">
                Total incompleto: {summary.signaturesNotRead} assinatura(s) não
                puderam ser consultadas no provedor de pagamento agora. Atualize
                a página em alguns minutos.
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

      <div className="space-y-3 rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--dash-text-muted)]">
            Período — de
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--dash-text-muted)]">
            Período — até
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--dash-text-muted)]">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            >
              {statusFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--dash-text-muted)]">
            Itens por página
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Refinar os resultados desta página (empresa, plano, status)..."
              className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setStatus("");
              setSearch("");
            }}
            className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]"
          >
            Limpar filtros
          </button>
        </div>
        <p className="text-xs text-[var(--dash-text-muted)]">
          O período filtra pela data de pagamento quando ela existe; nas
          cobranças ainda não pagas, pelo vencimento.
        </p>
      </div>

      <DataTable<SubscriptionTransaction>
        data={paginatedData}
        columns={columns}
        keyExtractor={(t) => t.id}
        loading={loading}
        emptyMessage="Nenhuma transação encontrada para os filtros selecionados."
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
      {!loading && total > 0 && (
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={pageSize}
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
