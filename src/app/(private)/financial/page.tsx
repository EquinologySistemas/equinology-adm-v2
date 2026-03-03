"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import {
  mockTransactions,
  mockFinancialSummary,
} from "@/data/mock";
import { DollarSign } from "lucide-react";
import type { Transaction } from "@/types/admin";

const API_TRANSACTIONS = "/admin/transactions";
const API_FINANCIAL_SUMMARY = "/admin/financial/summary";

const statusLabels: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  failed: "Falhou",
  refunded: "Reembolsado",
};

export default function FinancialPage() {
  const { GetAPI } = useApiContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<{ mrr?: number; revenueMonth?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  async function load() {
    setLoading(true);
    const [txRes, summaryRes] = await Promise.all([
      GetAPI(API_TRANSACTIONS, true),
      GetAPI(API_FINANCIAL_SUMMARY, true),
    ]);
    setLoading(false);
    let mockTx = false;
    if (txRes.status === 200) {
      const data = txRes.body?.transactions ?? txRes.body?.data ?? (Array.isArray(txRes.body) ? txRes.body : []);
      const list = Array.isArray(data) ? data : [];
      mockTx = list.length === 0;
      setTransactions(mockTx ? mockTransactions : list);
    } else {
      setTransactions(mockTransactions);
      mockTx = true;
    }
    const mockSummary = summaryRes.status !== 200 || !summaryRes.body;
    if (mockSummary) {
      setSummary(mockFinancialSummary);
    } else {
      setSummary(summaryRes.body);
    }
    setIsMockData(mockTx || mockSummary);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">Financeiro</h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Transações e resumo financeiro
        </p>
      </div>

      {isMockData && <MockIndicator />}

      {summary && (summary.mrr != null || summary.revenueMonth != null) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {summary.mrr != null && (
            <div className="rounded-xl border border-[var(--dash-border)] bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-[var(--dash-text-muted)]">MRR</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.mrr)}
              </p>
            </div>
          )}
          {summary.revenueMonth != null && (
            <div className="rounded-xl border border-[var(--dash-border)] bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-[var(--dash-text-muted)]">Receita do mês</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--dash-text)]">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.revenueMonth)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <DollarSign className="mb-4 h-12 w-12 text-[var(--dash-text-muted)]/50" />
            <p className="text-sm text-[var(--dash-text-muted)]">
              Nenhuma transação encontrada. Os dados aparecerão aqui quando a API expuser o endpoint de transações.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Data</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Valor</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Forma de pagamento</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Pago em</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(t.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : t.status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {statusLabels[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">{t.paymentMethod ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {t.paidAt ? new Date(t.paidAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
