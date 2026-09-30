"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { SubscriptionStatusBadge } from "@/components/ui/SubscriptionStatusBadge";
import { formatDate } from "@/lib/date";
import { subscriptionStatusLabels } from "@/lib/subscriptions-api";
import { formatCNPJ } from "@/lib/utils";
import type {
  CompanyCurrentSignature,
  Company as CompanyType,
} from "@/types/admin";
import { Building2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CompanyCreateModal } from "./_components/CompanyCreateModal";

const API_COMPANIES = "/admin/companies";
const PAGE_SIZE = 20;

function normalizeCompany(c: Record<string, unknown>): CompanyType {
  return {
    id: (c.id as string) ?? "",
    name: (c.name as string) ?? "",
    code: c.code as string | undefined,
    cnpj: c.cnpj as string | null | undefined,
    address: c.address as string | undefined,
    number: c.number as string | undefined,
    postalCode: c.postalCode as string | undefined,
    walletId: c.walletId as string | null | undefined,
    paymentId: c.paymentId as string | undefined,
    paymentType: c.paymentType as string | undefined,
    paymentResponsibleId: c.paymentResponsibleId as string | null | undefined,
    usersCount: typeof c.usersCount === "number" ? c.usersCount : 0,
    currentSignature:
      (c.currentSignature as CompanyCurrentSignature | null) ?? null,
    createdAt: c.createdAt as string | undefined,
    updatedAt: c.updatedAt as string | undefined,
  };
}

export default function CompaniesPage() {
  const { GetAPI } = useApiContext();
  const [companies, setCompanies] = useState<CompanyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  async function loadCompanies() {
    setLoading(true);
    const res = await GetAPI(API_COMPANIES, true);
    setLoading(false);
    if (res.status === 200) {
      const data =
        res.body?.companies ?? (Array.isArray(res.body) ? res.body : []);
      const list = Array.isArray(data) ? data : [];
      setCompanies(
        list.map((c: Record<string, unknown>) => normalizeCompany(c)),
      );
    } else {
      setCompanies([]);
      toast.error("Erro ao carregar empresas.");
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  const filtered = useMemo(() => {
    const byStatus = !statusFilter
      ? companies
      : statusFilter === "NONE"
        ? companies.filter((c) => !c.currentSignature)
        : companies.filter((c) => c.currentSignature?.status === statusFilter);
    if (!search.trim()) return byStatus;
    const q = search.trim().toLowerCase();
    return byStatus.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        (c.cnpj && formatCNPJ(c.cnpj).toLowerCase().includes(q)) ||
        (c.cnpj && c.cnpj.replace(/\D/g, "").includes(q)) ||
        c.address?.toLowerCase().includes(q) ||
        c.currentSignature?.planName?.toLowerCase().includes(q),
    );
  }, [companies, search, statusFilter]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns: ColumnDef<CompanyType>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        getValue: (c) => c.name ?? "",
        render: (c) => (
          <Link
            href={`/companies/${c.id}`}
            className="font-medium text-[var(--dash-accent)] hover:underline"
          >
            {c.name}
          </Link>
        ),
      },
      {
        key: "cnpj",
        label: "CNPJ",
        sortable: true,
        getValue: (c) => c.cnpj ?? "",
        render: (c) => (c.cnpj ? formatCNPJ(c.cnpj) : "—"),
      },
      {
        key: "plan",
        label: "Plano",
        sortable: true,
        getValue: (c) => c.currentSignature?.planName ?? "",
        render: (c) => c.currentSignature?.planName ?? "Sem assinatura",
      },
      {
        key: "status",
        label: "Assinatura",
        sortable: true,
        getValue: (c) =>
          subscriptionStatusLabels[c.currentSignature?.status ?? ""] ?? "",
        render: (c) =>
          c.currentSignature ? (
            <SubscriptionStatusBadge status={c.currentSignature.status} />
          ) : (
            "—"
          ),
      },
      {
        key: "expirationDate",
        label: "Validade",
        sortable: true,
        getValue: (c) => c.currentSignature?.expirationDate ?? "",
        render: (c) => formatDate(c.currentSignature?.expirationDate),
      },
      {
        key: "usersCount",
        label: "Usuários",
        sortable: true,
        getValue: (c) => c.usersCount ?? 0,
      },
      {
        key: "createdAt",
        label: "Cadastro",
        sortable: true,
        getValue: (c) => c.createdAt ?? "",
        render: (c) => formatDate(c.createdAt),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">
            Empresas
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Listagem e gestão de empresas do sistema
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Nova empresa
        </button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CNPJ, endereço ou plano..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por assinatura"
          className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
        >
          <option value="">Todas as assinaturas</option>
          <option value="ACTIVE">Ativa</option>
          <option value="TRIAL">Trial</option>
          <option value="INACTIVE">Inativa</option>
          <option value="NONE">Sem assinatura</option>
        </select>
      </div>

      <DataTable<CompanyType>
        data={paginatedData}
        columns={columns}
        keyExtractor={(c) => c.id}
        loading={loading}
        emptyMessage="Nenhuma empresa encontrada."
        renderActions={(c) => (
          <Link
            href={`/companies/${c.id}`}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            aria-label="Abrir empresa"
          >
            <Building2 className="h-4 w-4" />
            Abrir
          </Link>
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

      <CompanyCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          loadCompanies();
        }}
      />
    </div>
  );
}
