"use client";

import { useEffect, useState, useMemo } from "react";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import { mockUsers } from "@/data/mock";
import { Modal } from "@/components/ui/Modal";
import { Search, User } from "lucide-react";
import type { User as UserType } from "@/types/admin";

const API_USERS = "/admin/users";

export default function UsersPage() {
  const { GetAPI } = useApiContext();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [detailUser, setDetailUser] = useState<UserType | null>(null);

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
      const useMock = list.length === 0;
      setUsers(useMock ? mockUsers : list);
      setIsMockData(useMock);
    } else {
      setUsers(mockUsers);
      setIsMockData(true);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.company?.toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      list = list.filter((u) => (u.status ?? "active") === statusFilter);
    }
    return list;
  }, [users, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">
          Usuários
        </h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Listagem e gestão de usuários do sistema
        </p>
      </div>

      {isMockData && <MockIndicator />}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm text-[var(--dash-text)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="blocked">Bloqueado</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--dash-text-muted)]">
            Nenhum usuário encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Nome
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    E-mail
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Telefone
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Empresa
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Função
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Plano
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Cadastro
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-[var(--dash-text)]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--dash-border)]/60 transition-colors hover:bg-[var(--dash-bg)]/40"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">
                      {u.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {u.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {u.company ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {u.role ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {u.planName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          (u.status ?? "active") === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {(u.status ?? "active") === "active"
                          ? "Ativo"
                          : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailUser(u)}
                        className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
                        aria-label="Ver detalhes"
                      >
                        <User className="h-4 w-4" />
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        title="Detalhes do usuário"
      >
        {detailUser && (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Nome
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  E-mail
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.email ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Telefone
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.phone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Empresa
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.company ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Função
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.role ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Plano
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.planName ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Status
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {(detailUser.status ?? "active") === "active"
                    ? "Ativo"
                    : "Bloqueado"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--dash-text-muted)]">
                  Data de cadastro
                </dt>
                <dd className="text-[var(--dash-text)]">
                  {detailUser.createdAt
                    ? new Date(detailUser.createdAt).toLocaleString("pt-BR")
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-[var(--dash-text-muted)]">
              Edição e bloqueio podem ser habilitados quando a API expuser os
              endpoints correspondentes.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
