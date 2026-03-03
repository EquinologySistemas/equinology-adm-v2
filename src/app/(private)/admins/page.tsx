"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import { mockAdmins } from "@/data/mock";
import type { AdminUserMock } from "@/data/mock";
import { Shield } from "lucide-react";

const API_ADMINS = "/admin/admins";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  support: "Suporte",
};

export default function AdminsPage() {
  const { GetAPI } = useApiContext();
  const [admins, setAdmins] = useState<AdminUserMock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  async function load() {
    setLoading(true);
    const res = await GetAPI(API_ADMINS, true);
    setLoading(false);
    if (res.status === 200) {
      const data =
        res.body?.admins ??
        res.body?.data ??
        (Array.isArray(res.body) ? res.body : []);
      const list = Array.isArray(data) ? data : [];
      const useMock = list.length === 0;
      setAdmins(useMock ? mockAdmins : list);
      setIsMockData(useMock);
    } else {
      setAdmins(mockAdmins);
      setIsMockData(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">
          Administradores
        </h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Contas com acesso ao painel administrativo
        </p>
      </div>

      {isMockData && <MockIndicator />}

      <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="mb-4 h-12 w-12 text-[var(--dash-text-muted)]/50" />
            <p className="text-sm text-[var(--dash-text-muted)]">
              Nenhum administrador listado. A gestão de contas admin aparecerá
              aqui quando a API expuser o endpoint.
            </p>
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
                    Função
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">
                    Cadastro
                  </th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--dash-border)]/60 transition-colors hover:bg-[var(--dash-bg)]/40"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">
                      {a.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {a.email}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {roleLabels[a.role ?? ""] ?? a.role ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.active !== false
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {a.active !== false ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleDateString("pt-BR")
                        : "—"}
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
