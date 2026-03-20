"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import { mockUsers } from "@/data/mock";
import { formatPhone } from "@/lib/utils";
import type { User as UserType } from "@/types/admin";
import { Plus, Search, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UserCreateModal } from "./_components/UserCreateModal";
import { UserDetailModal } from "./_components/UserDetailModal";

const API_USERS = "/admin/users";
const PAGE_SIZE = 20;

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  COLABORADOR: "Colaborador",
};

function roleLabel(role: string | undefined): string {
  return (role && ROLE_LABELS[role]) || role || "—";
}

function normalizeUser(u: Record<string, unknown>): UserType {
  return {
    ...u,
    company: (u.company as string) ?? (u.companyName as string) ?? undefined,
    companyId: u.companyId as string | undefined,
    createdAt: u.createdAt as string | undefined,
  } as UserType;
}

export default function UsersPage() {
  const { GetAPI } = useApiContext();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailUser, setDetailUser] = useState<UserType | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  async function loadUsers() {
    setLoading(true);
    const res = await GetAPI(API_USERS, true);
    setLoading(false);
    if (res.status === 200) {
      const data =
        res.body?.users ??
        res.body?.data ??
        (Array.isArray(res.body) ? res.body : []);
      const list = Array.isArray(data) ? data : [];
      setUsers(list.map((u: Record<string, unknown>) => normalizeUser(u)));
    } else {
      setUsers(mockUsers);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.company?.toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns: ColumnDef<UserType>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Nome",
        sortable: true,
        getValue: (u) => u.name ?? "",
      },
      {
        key: "email",
        label: "E-mail",
        sortable: true,
        getValue: (u) => u.email ?? "",
      },
      {
        key: "phone",
        label: "Telefone",
        sortable: true,
        getValue: (u) => u.phone ?? "",
        render: (u) => (u.phone ? formatPhone(u.phone) : "—"),
      },
      {
        key: "company",
        label: "Empresa",
        sortable: true,
        getValue: (u) => u.company ?? "",
      },
      {
        key: "role",
        label: "Função",
        sortable: true,
        getValue: (u) => roleLabel(u.role),
      },
      {
        key: "planName",
        label: "Plano",
        sortable: true,
        getValue: (u) => u.planName ?? "",
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        getValue: (u) =>
          (u.status ?? "active") === "active" ? "active" : "blocked",
        render: (u) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              (u.status ?? "active") === "active"
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {(u.status ?? "active") === "active" ? "Ativo" : "Bloqueado"}
          </span>
        ),
      },
      {
        key: "createdAt",
        label: "Cadastro",
        sortable: true,
        getValue: (u) => u.createdAt ?? "",
        render: (u) =>
          u.createdAt
            ? new Date(u.createdAt).toLocaleDateString("pt-BR", {
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
            Usuários
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Listagem e gestão de usuários do sistema
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Novo usuário
        </button>
      </div>

      <div className="rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou empresa..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>

      <DataTable<UserType>
        data={paginatedData}
        columns={columns}
        keyExtractor={(u) => u.id}
        loading={loading}
        emptyMessage="Nenhum usuário encontrado."
        renderActions={(u) => (
          <button
            type="button"
            onClick={() => setDetailUser(u)}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
            aria-label="Ver detalhes"
          >
            <User className="h-4 w-4" />
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

      <UserDetailModal
        user={detailUser}
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        onSaved={() => {
          setDetailUser(null);
          loadUsers();
        }}
      />

      <UserCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          loadUsers();
        }}
      />
    </div>
  );
}
