"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { SubscriptionStatusBadge } from "@/components/ui/SubscriptionStatusBadge";
import { useApiContext } from "@/context/ApiContext";
import { formatDate } from "@/lib/date";
import { getSubscriptionTransactions } from "@/lib/financial-api";
import { fetchAllSubscriptions, renewalLabel } from "@/lib/subscriptions-api";
import { formatCEP, formatCNPJ, formatPhone } from "@/lib/utils";
import type {
  Company,
  Subscription,
  SubscriptionTransaction,
  User,
} from "@/types/admin";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { SubscriptionCreateModal } from "../../subscriptions/_components/SubscriptionCreateModal";
import { SubscriptionDetailModal } from "../../subscriptions/_components/SubscriptionDetailModal";
import { UserDetailModal } from "../../users/_components/UserDetailModal";
import { CompanyDetailModal } from "../_components/CompanyDetailModal";

const PAYMENTS_PAGE_SIZE = 10;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  COLABORADOR: "Colaborador",
};

/** Status de cobrança do Asaas, como a tela Financeiro exibe. */
const paymentStatusLabels: Record<string, string> = {
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  RECEIVED_IN_CASH: "Recebido em dinheiro",
  PENDING: "Pendente",
  OVERDUE: "Vencido",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
};

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--dash-text)]">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--dash-text-muted)]">
        {label}
      </dt>
      <dd className="text-sm break-words text-[var(--dash-text)]">
        {value || "—"}
      </dd>
    </div>
  );
}

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const { GetAPI } = useApiContext();

  const [company, setCompany] = useState<Company | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [payments, setPayments] = useState<SubscriptionTransaction[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [createSubOpen, setCreateSubOpen] = useState(false);
  const [detailSub, setDetailSub] = useState<Subscription | null>(null);
  const [detailUser, setDetailUser] = useState<User | null>(null);

  const loadCompany = useCallback(async () => {
    const res = await GetAPI(`/admin/companies/${id}`, true);
    if (res.status === 200 && res.body?.company) setCompany(res.body.company);
    else if (res.status === 404) setNotFound(true);
    else toast.error("Erro ao carregar a empresa.");
  }, [GetAPI, id]);

  const loadSubscriptions = useCallback(async () => {
    const list = await fetchAllSubscriptions(GetAPI, { companyId: id });
    if (list) setSubscriptions(list);
    else toast.error("Erro ao carregar assinaturas.");
  }, [GetAPI, id]);

  const loadUsers = useCallback(async () => {
    // A API não filtra usuários por empresa: a base é pequena, filtra aqui.
    const res = await GetAPI("/admin/users?includeDeleted=true", true);
    if (res.status !== 200) {
      toast.error("Erro ao carregar usuários.");
      return;
    }
    const list: Record<string, unknown>[] = Array.isArray(res.body?.users)
      ? res.body.users
      : [];
    setUsers(
      list
        .filter((u) => u.companyId === id)
        .map(
          (u) =>
            ({
              ...u,
              company: (u.companyName as string) ?? undefined,
            }) as unknown as User,
        ),
    );
  }, [GetAPI, id]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    const res = await getSubscriptionTransactions(GetAPI, {
      companyId: id,
      page: paymentsPage,
      pageSize: PAYMENTS_PAGE_SIZE,
    });
    setPaymentsLoading(false);
    if (res) {
      setPayments(res.transactions);
      setPaymentsTotal(res.total);
    } else {
      setPayments([]);
      setPaymentsTotal(0);
      toast.error("Erro ao carregar pagamentos.");
    }
  }, [GetAPI, id, paymentsPage]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadCompany(), loadSubscriptions(), loadUsers()]);
      setLoading(false);
    })();
  }, [loadCompany, loadSubscriptions, loadUsers]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const subscriptionColumns: ColumnDef<Subscription>[] = [
    {
      key: "planName",
      label: "Plano",
      getValue: (s) => s.planName ?? "",
    },
    {
      key: "cycle",
      label: "Ciclo",
      getValue: (s) => (s.yearly ? "Anual" : "Mensal"),
    },
    {
      key: "status",
      label: "Status",
      getValue: (s) => s.status,
      render: (s) => <SubscriptionStatusBadge status={s.status} />,
    },
    {
      key: "renewal",
      label: "Renovação",
      getValue: (s) => renewalLabel(s),
    },
    {
      key: "expirationDate",
      label: "Validade",
      getValue: (s) => s.expirationDate ?? "",
      render: (s) => formatDate(s.expirationDate),
    },
    {
      key: "createdAt",
      label: "Criada em",
      getValue: (s) => s.createdAt ?? "",
      render: (s) => formatDate(s.createdAt),
    },
  ];

  const userColumns: ColumnDef<User>[] = [
    { key: "name", label: "Nome", sortable: true, getValue: (u) => u.name },
    { key: "email", label: "E-mail", sortable: true, getValue: (u) => u.email },
    {
      key: "role",
      label: "Função",
      sortable: true,
      getValue: (u) => (u.role && ROLE_LABELS[u.role]) || u.role || "",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      getValue: (u) => (u.isDeleted ? "Excluído" : "Ativo"),
      render: (u) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            u.isDeleted
              ? "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {u.isDeleted ? "Excluído" : "Ativo"}
        </span>
      ),
    },
    {
      key: "lastLoginAt",
      label: "Último acesso",
      sortable: true,
      getValue: (u) => u.lastLoginAt ?? "",
      render: (u) => formatDate(u.lastLoginAt),
    },
  ];

  const paymentColumns: ColumnDef<SubscriptionTransaction>[] = [
    {
      key: "dueDate",
      label: "Vencimento",
      getValue: (t) => t.dueDate,
      render: (t) => formatDate(t.dueDate),
    },
    { key: "planName", label: "Plano", getValue: (t) => t.planName },
    {
      key: "value",
      label: "Valor",
      getValue: (t) => t.value,
      render: (t) => formatMoney(t.value),
    },
    {
      key: "status",
      label: "Status",
      getValue: (t) => t.status,
      render: (t) => paymentStatusLabels[t.status.toUpperCase()] ?? t.status,
    },
    {
      key: "paymentMethod",
      label: "Forma",
      getValue: (t) => t.paymentMethod,
    },
    {
      key: "paymentDate",
      label: "Pago em",
      getValue: (t) => t.paymentDate ?? "",
      render: (t) => formatDate(t.paymentDate),
    },
  ];

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link
          href="/companies"
          className="inline-flex items-center gap-1 text-sm text-[var(--dash-accent)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Empresas
        </Link>
        <p className="text-sm text-[var(--dash-text-muted)]">
          Empresa não encontrada.
        </p>
      </div>
    );
  }

  const activeUsers = users.filter((u) => !u.isDeleted).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/companies"
            className="inline-flex items-center gap-1 text-sm text-[var(--dash-accent)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Empresas
          </Link>
          <h2 className="mt-2 text-xl font-semibold text-[var(--dash-text)]">
            {company?.name ?? (loading ? "Carregando…" : "—")}
          </h2>
        </div>
        {company && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
          >
            Editar dados
          </button>
        )}
      </div>

      <dl className="grid gap-4 rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="CNPJ"
          value={company?.cnpj ? formatCNPJ(company.cnpj) : null}
        />
        <Field
          label="Telefone"
          value={company?.phone ? formatPhone(company.phone) : null}
        />
        <Field
          label="Endereço"
          value={
            company?.address
              ? `${company.address}${company.number ? `, ${company.number}` : ""}`
              : null
          }
        />
        <Field
          label="CEP"
          value={company?.postalCode ? formatCEP(company.postalCode) : null}
        />
        <Field label="Cadastro" value={formatDate(company?.createdAt)} />
        <Field label="Usuários ativos" value={String(activeUsers)} />
        <Field
          label="Cliente no Asaas"
          value={
            // Empresa criada pelo painel nasce com um id provisório
            // `admin-...`; o cliente real é criado na primeira cobrança.
            company?.paymentId?.startsWith("admin-")
              ? "Criado na primeira cobrança"
              : company?.paymentId
          }
        />
        <Field label="Wallet ID" value={company?.walletId} />
      </dl>

      <Section
        title="Assinaturas"
        action={
          <button
            type="button"
            onClick={() => setCreateSubOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
          >
            <Plus className="h-4 w-4" /> Nova assinatura
          </button>
        }
      >
        <p className="text-xs text-[var(--dash-text-muted)]">
          Para bloquear o acesso da empresa, abra a assinatura vigente e use
          &quot;Cancelar&quot;.
        </p>
        <DataTable<Subscription>
          data={subscriptions}
          columns={subscriptionColumns}
          keyExtractor={(s) => s.id}
          loading={loading}
          emptyMessage="Esta empresa não tem assinaturas."
          renderActions={(s) => (
            <button
              type="button"
              onClick={() => setDetailSub(s)}
              className="rounded-lg p-2 text-sm text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            >
              Gerenciar
            </button>
          )}
        />
      </Section>

      <Section title="Histórico de pagamentos">
        <DataTable<SubscriptionTransaction>
          data={payments}
          columns={paymentColumns}
          keyExtractor={(t) => t.id}
          loading={paymentsLoading}
          emptyMessage="Nenhuma cobrança encontrada para esta empresa."
        />
        {!paymentsLoading && paymentsTotal > PAYMENTS_PAGE_SIZE && (
          <Pagination
            currentPage={paymentsPage}
            totalItems={paymentsTotal}
            pageSize={PAYMENTS_PAGE_SIZE}
            onPageChange={setPaymentsPage}
          />
        )}
      </Section>

      <Section title="Usuários">
        <DataTable<User>
          data={users}
          columns={userColumns}
          keyExtractor={(u) => u.id}
          loading={loading}
          emptyMessage="Nenhum usuário nesta empresa."
          renderActions={(u) => (
            <button
              type="button"
              onClick={() => setDetailUser(u)}
              className="rounded-lg p-2 text-sm text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            >
              Detalhes
            </button>
          )}
        />
      </Section>

      <CompanyDetailModal
        company={company}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={loadCompany}
      />
      <SubscriptionCreateModal
        open={createSubOpen}
        defaultCompanyId={id}
        onClose={() => setCreateSubOpen(false)}
        onSaved={() => {
          loadCompany();
          loadSubscriptions();
          loadPayments();
        }}
      />
      <SubscriptionDetailModal
        subscription={detailSub}
        open={!!detailSub}
        onClose={() => setDetailSub(null)}
        onUpdated={() => {
          loadCompany();
          loadSubscriptions();
          loadPayments();
        }}
      />
      <UserDetailModal
        user={detailUser}
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        onSaved={() => {
          setDetailUser(null);
          loadUsers();
        }}
      />
    </div>
  );
}
