"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import { mockAdmins } from "@/data/mock";
import type { Admin } from "@/types/admin";
import { Plus, Search, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminCreateModal } from "./_components/AdminCreateModal";
import { AdminDetailModal } from "./_components/AdminDetailModal";

const API_ADMINS = "/admin/admins";
const API_ADMIN_ME = "/admin/auth/me";
const PAGE_SIZE = 20;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  support: "Suporte",
};

function roleLabel(role: string | undefined): string {
  return (role && ROLE_LABELS[role]) || role || "—";
}

function normalizeAdmin(a: Record<string, unknown>): Admin {
  return {
    ...a,
    id: a.id as string,
    email: a.email as string,
    name: (a.name as string) ?? undefined,
    role: (a.role as string) ?? undefined,
    active: a.active !== undefined ? (a.active as boolean) : true,
    createdAt: (a.createdAt as string) ?? undefined,
  } as Admin;
}

export default function AdminsPage() {
  const { GetAPI } = useApiContext();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);
  const [search, setSearch] = useState("");
  const [detailAdmin, setDetailAdmin] = useState<Admin | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [canManageAdmins, setCanManageAdmins] = useState(false);

  async function loadAdmins() {
    setLoading(true);
    const [meRes, res] = await Promise.all([
      GetAPI(API_ADMIN_ME, true),
      GetAPI(API_ADMINS, true),
    ]);
    setLoading(false);

    if (meRes.status === 200 && meRes.body?.admin?.role === "super_admin") {
      setCanManageAdmins(true);
    } else {
      setCanManageAdmins(false);
    }

    if (res.status === 200) {
      const data =
        res.body?.admins ??
        res.body?.data ??
        (Array.isArray(res.body) ? res.body : []);
      const list = Array.isArray(data) ? data : [];
      setAdmins(list.map((a: Record<string, unknown>) => normalizeAdmin(a)));
      setIsMockData(false);
    } else {
      setAdmins(mockAdmins.map((a) => normalizeAdmin(a)));
      setIsMockData(true);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return admins;
    const q = search.trim().toLowerCase();
    return admins.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        roleLabel(a.role).toLowerCase().includes(q),
    );
  }, [admins, search]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns: ColumnDef<Admin>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        getValue: (a) => a.name ?? "",
      },
      {
        key: "email",
        label: "E-mail",
        sortable: true,
        getValue: (a) => a.email ?? "",
      },
      {
        key: "role",
        label: "Função",
        sortable: true,
        getValue: (a) => roleLabel(a.role),
      },
      {
        key: "active",
        label: "Status",
        sortable: true,
        getValue: (a) => (a.active !== false ? "active" : "inactive"),
        render: (a) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              a.active !== false
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {a.active !== false ? "Ativo" : "Inativo"}
          </span>
        ),
      },
      {
        key: "createdAt",
        label: "Cadastro",
        sortable: true,
        getValue: (a) => a.createdAt ?? "",
        render: (a) =>
          a.createdAt
            ? new Date(a.createdAt).toLocaleDateString("pt-BR", {
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
            Administradores
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Listagem e gestão de contas administrativas
          </p>
        </div>
        {canManageAdmins && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
          >
            <Plus className="h-4 w-4" />
            Novo administrador
          </button>
        )}
      </div>

      {isMockData && <MockIndicator />}

      <div className="rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou função..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>

      <DataTable<Admin>
        data={paginatedData}
        columns={columns}
        keyExtractor={(a) => a.id}
        loading={loading}
        emptyMessage="Nenhum administrador encontrado."
        renderActions={(a) => (
          <button
            type="button"
            onClick={() => setDetailAdmin(a)}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            aria-label="Ver detalhes"
          >
            <Shield className="h-4 w-4" />
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

      <AdminDetailModal
        admin={detailAdmin}
        open={!!detailAdmin}
        canManageAdmins={canManageAdmins}
        onClose={() => setDetailAdmin(null)}
        onSaved={() => {
          setDetailAdmin(null);
          loadAdmins();
        }}
      />

      <AdminCreateModal
        open={createOpen}
        canManageAdmins={canManageAdmins}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          loadAdmins();
        }}
      />
    </div>
  );
}
