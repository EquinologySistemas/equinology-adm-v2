"use client";

import { useEffect, useState } from "react";
import { useApiContext } from "@/context/ApiContext";
import { MockIndicator } from "@/components/ui/MockIndicator";
import { mockAuditLogs } from "@/data/mock";
import type { AuditLogMock } from "@/data/mock";
import { ClipboardList } from "lucide-react";

const API_AUDIT = "/admin/audit-logs";

export default function AuditLogsPage() {
  const { GetAPI } = useApiContext();
  const [logs, setLogs] = useState<AuditLogMock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMockData, setIsMockData] = useState(false);

  async function load() {
    setLoading(true);
    const res = await GetAPI(API_AUDIT, true);
    setLoading(false);
    if (res.status === 200) {
      const data = res.body?.logs ?? res.body?.data ?? (Array.isArray(res.body) ? res.body : []);
      const list = Array.isArray(data) ? data : [];
      const useMock = list.length === 0;
      setLogs(useMock ? mockAuditLogs : list);
      setIsMockData(useMock);
    } else {
      setLogs(mockAuditLogs);
      setIsMockData(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">Auditoria</h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Logs de alterações realizadas no painel
        </p>
      </div>

      {isMockData && <MockIndicator />}

      <div className="rounded-xl border border-[var(--dash-border)] bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="mb-4 h-12 w-12 text-[var(--dash-text-muted)]/50" />
            <p className="text-sm text-[var(--dash-text-muted)]">
              Nenhum registro de auditoria. Os logs aparecerão aqui quando a API expuser o endpoint.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Data</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Entidade</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Ação</th>
                  <th className="px-4 py-3 font-semibold text-[var(--dash-text)]">Administrador</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-[var(--dash-border)]/60 hover:bg-[var(--dash-bg)]/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {log.createdAt
                        ? new Date(log.createdAt).toLocaleString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--dash-text)]">
                      {log.entity} {log.entityId ? `#${log.entityId}` : ""}
                    </td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">{log.action}</td>
                    <td className="px-4 py-3 text-[var(--dash-text-muted)]">
                      {log.adminEmail ?? log.adminId ?? "—"}
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
