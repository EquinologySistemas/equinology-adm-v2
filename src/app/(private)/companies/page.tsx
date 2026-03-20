"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { formatCEP, formatCNPJ } from "@/lib/utils";
import type { Company as CompanyType } from "@/types/admin";
import { Building2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CompanyCreateModal } from "./_components/CompanyCreateModal";
import { CompanyDetailModal } from "./_components/CompanyDetailModal";

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
    createdAt: c.createdAt as string | undefined,
    updatedAt: c.updatedAt as string | undefined,
  };
}

export default function CompaniesPage() {
  const { GetAPI } = useApiContext();
  const [companies, setCompanies] = useState<CompanyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailCompany, setDetailCompany] = useState<CompanyType | null>(null);
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
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.trim().toLowerCase();
    return companies.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        (c.cnpj && formatCNPJ(c.cnpj).toLowerCase().includes(q)) ||
        (c.cnpj && c.cnpj.replace(/\D/g, "").includes(q)) ||
        c.address?.toLowerCase().includes(q),
    );
  }, [companies, search]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns: ColumnDef<CompanyType>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        getValue: (c) => c.name ?? "",
      },
      {
        key: "cnpj",
        label: "CNPJ",
        sortable: true,
        getValue: (c) => c.cnpj ?? "",
        render: (c) => (c.cnpj ? formatCNPJ(c.cnpj) : "—"),
      },
      {
        key: "address",
        label: "Endereço",
        sortable: true,
        getValue: (c) => c.address ?? "",
      },
      {
        key: "number",
        label: "Número",
        sortable: true,
        getValue: (c) => c.number ?? "",
      },
      {
        key: "postalCode",
        label: "CEP",
        sortable: true,
        getValue: (c) => c.postalCode ?? "",
        render: (c) => (c.postalCode ? formatCEP(c.postalCode) : "—"),
      },
      {
        key: "createdAt",
        label: "Cadastro",
        sortable: true,
        getValue: (c) => c.createdAt ?? "",
        render: (c) =>
          c.createdAt
            ? new Date(c.createdAt).toLocaleDateString("pt-BR", {
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

      <div className="rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou endereço..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>

      <DataTable<CompanyType>
        data={paginatedData}
        columns={columns}
        keyExtractor={(c) => c.id}
        loading={loading}
        emptyMessage="Nenhuma empresa encontrada."
        renderActions={(c) => (
          <button
            type="button"
            onClick={() => setDetailCompany(c)}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            aria-label="Ver detalhes"
          >
            <Building2 className="h-4 w-4" />
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

      <CompanyDetailModal
        company={detailCompany}
        open={!!detailCompany}
        onClose={() => setDetailCompany(null)}
        onSaved={() => {
          setDetailCompany(null);
          loadCompanies();
        }}
      />

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
