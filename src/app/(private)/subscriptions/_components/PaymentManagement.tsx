"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useApiContext } from "@/context/ApiContext";
import { formatDate } from "@/lib/date";
type Payment = {
  id: string;
  value: number;
  dueDate: string;
  paymentDate?: string | null;
  status: string;
  invoiceUrl?: string | null;
  billingType?: string | null;
};
const labels: Record<string, string> = {
  PENDING: "Pendente",
  OVERDUE: "Vencida",
  RECEIVED: "Recebida",
  CONFIRMED: "Confirmada",
  PAID: "Paga",
  RECEIVED_IN_CASH: "Recebida em dinheiro",
  REFUNDED: "Estornada",
  REFUND_REQUESTED: "Estorno solicitado",
  REFUND_IN_PROGRESS: "Estorno em andamento",
  DELETED: "Cancelada",
  AWAITING_RISK_ANALYSIS: "Em análise",
};
const buttonClass = "rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50";
function message(body: unknown, fallback: string) {
  if (typeof body === "string") return body;
  const msg = (body as { message?: unknown } | null)?.message;
  return typeof msg === "string" ? msg : fallback;
}
export function PaymentManagement({
  signatureId,
  onUpdated,
}: {
  signatureId: string;
  onUpdated: () => void;
}) {
  const { GetAPI, PostAPI, PatchAPI } = useApiContext();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [value, setValue] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await GetAPI(
      "/admin/signature/" + signatureId + "/history",
      true,
    );
    if (res.status === 200) setPayments(res.body.payments ?? []);
    else
      setError(
        message(
          res.body,
          "Não foi possível atualizar o histórico. Tente novamente.",
        ),
      );
    setLoading(false);
  }, [GetAPI, signatureId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function action(
    p: Payment,
    kind: "cancel" | "refund" | "reconcile" | "receipt" | "update",
  ) {
    if (busy) return;
    if (
      kind === "cancel" &&
      !confirm(
        "Cancelar esta cobrança? A renovação da assinatura será mantida.",
      )
    )
      return;
    if (
      kind === "refund" &&
      !confirm(
        "Solicitar o estorno integral desta cobrança? O acesso da empresa não será encerrado por esta ação.",
      )
    )
      return;
    const prefix =
      "/admin/signature/" +
      signatureId +
      "/payments/" +
      encodeURIComponent(p.id);
    setBusy(true);
    const res =
      kind === "receipt"
        ? await GetAPI(prefix + "/receipt", true)
        : kind === "update"
          ? await PatchAPI(
              prefix,
              { dueDate: dueDate || undefined, value: Number(value) },
              true,
            )
          : await PostAPI(prefix + "/" + kind, {}, true);
    if (res.status === 200 || res.status === 201) {
      if (kind === "receipt") {
        if (res.body?.invoiceUrl) {
          try {
            await navigator.clipboard.writeText(res.body.invoiceUrl);
            toast.success("Link copiado.");
          } catch {
            toast.error(
              "Não foi possível copiar. Abra o link exibido na cobrança.",
            );
          }
        } else toast.error("Link indisponível para esta cobrança.");
      } else {
        toast.success(message(res.body, "Operação concluída."));
        setEditing(null);
        await load();
        onUpdated();
      }
    } else
      toast.error(message(res.body, "Não foi possível concluir a operação."));
    setBusy(false);
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Cobranças e pagamentos</h3>
        <button
          type="button"
          disabled={busy || loading}
          className={buttonClass}
          onClick={() => void load()}
        >
          Atualizar histórico
        </button>
      </div>
      <p className="text-xs text-[var(--dash-text-muted)]">
        Inclui cobranças avulsas e recorrências anteriores. Conferir pagamento
        consulta o provedor antes de atualizar o acesso.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm">Carregando cobranças…</p>
      ) : payments.length === 0 ? (
        <p className="text-sm">Nenhuma cobrança encontrada.</p>
      ) : (
        <ul className="space-y-3">
          {payments.map((p) => {
            const open = [
              "PENDING",
              "OVERDUE",
              "AWAITING_RISK_ANALYSIS",
            ].includes(p.status);
            const paid = [
              "PAID",
              "RECEIVED",
              "CONFIRMED",
              "RECEIVED_IN_CASH",
            ].includes(p.status);
            return (
              <li key={p.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <strong>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(p.value)}
                  </strong>
                  <span>{labels[p.status] ?? p.status}</span>
                </div>
                <p className="text-xs">
                  {p.id} · {p.billingType ?? "Forma não informada"}
                </p>
                <p className="text-xs">
                  Vencimento: {p.dueDate ? formatDate(p.dueDate) : "—"} · Pago
                  em: {p.paymentDate ? formatDate(p.paymentDate) : "—"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {p.invoiceUrl && (
                    <a
                      href={p.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass}
                    >
                      Abrir cobrança
                    </a>
                  )}
                  {p.status !== "DELETED" && (
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass}
                      onClick={() => void action(p, "receipt")}
                    >
                      Copiar link
                    </button>
                  )}
                  {p.status !== "DELETED" && (
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass}
                      onClick={() => void action(p, "reconcile")}
                    >
                      Conferir pagamento
                    </button>
                  )}
                  {open && (
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass}
                      onClick={() => void action(p, "cancel")}
                    >
                      Cancelar cobrança
                    </button>
                  )}
                  {["PENDING", "OVERDUE"].includes(p.status) && (
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass}
                      onClick={() => {
                        setEditing(p);
                        setDueDate(p.dueDate);
                        setValue(String(p.value));
                      }}
                    >
                      Renegociar
                    </button>
                  )}
                  {paid && (
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass}
                      onClick={() => void action(p, "refund")}
                    >
                      Solicitar estorno
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(editing, "update");
          }}
          className="space-y-3 rounded-xl bg-[var(--dash-bg)] p-3"
        >
          <p className="text-sm font-medium">Renegociar {editing.id}</p>
          <label className="block text-sm">
            Vencimento
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border p-2"
            />
          </label>
          <label className="block text-sm">
            Valor (R$)
            <input
              type="number"
              min={5}
              step="0.01"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full rounded-lg border p-2"
            />
          </label>
          <p className="text-xs">
            Altera somente esta cobrança. Próximas mensalidades mantêm o valor
            do plano.
          </p>
          <div className="flex gap-2">
            <button disabled={busy} className={buttonClass}>
              Salvar cobrança
            </button>
            <button
              type="button"
              disabled={busy}
              className={buttonClass}
              onClick={() => setEditing(null)}
            >
              Voltar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
