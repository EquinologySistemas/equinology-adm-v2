"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  getValue: (row: T) => string | number | null;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  renderActions?: (row: T) => React.ReactNode;
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: "asc" | "desc",
): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA && emptyB) return 0;
  if (emptyA) return dir === "asc" ? 1 : -1;
  if (emptyB) return dir === "asc" ? -1 : 1;
  const numA = typeof a === "number" ? a : NaN;
  const numB = typeof b === "number" ? b : NaN;
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
    return dir === "asc" ? numA - numB : numB - numA;
  }
  const strA = String(a);
  const strB = String(b);
  const cmp = strA.localeCompare(strB, "pt-BR", { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyMessage = "Nenhum registro encontrado.",
  renderActions,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{
    sortKey: string | null;
    sortDir: "asc" | "desc";
  }>({ sortKey: null, sortDir: "asc" });

  const { sortKey, sortDir } = sort;

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortable) return data;
    return [...data].sort((rowA, rowB) => {
      const a = col.getValue(rowA);
      const b = col.getValue(rowB);
      return compareValues(a, b, sortDir);
    });
  }, [data, columns, sortKey, sortDir]);

  function handleSort(key: string) {
    setSort((prev) => {
      if (prev.sortKey !== key) return { sortKey: key, sortDir: "asc" };
      if (prev.sortDir === "asc") return { sortKey: key, sortDir: "desc" };
      return { sortKey: null, sortDir: "asc" };
    });
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--dash-accent)] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
        <div className="py-12 text-center text-sm text-[var(--dash-text-muted)]">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--dash-border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--dash-border)] bg-[var(--dash-bg)]/60">
              {columns.map((col) => {
                const isActive = sortKey === col.key;
                const alignRight = col.align === "right";
                const thClass = `px-4 py-3 font-semibold text-[var(--dash-text)] ${alignRight ? "text-right" : ""}`;
                return (
                  <th
                    key={col.key}
                    className={thClass}
                    aria-sort={
                      col.sortable && isActive
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {col.sortable !== false ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded hover:text-[var(--dash-accent)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
                      >
                        {col.label}
                        {isActive &&
                          (sortDir === "asc" ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          ))}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
              {renderActions && (
                <th className="px-4 py-3 text-right font-semibold text-[var(--dash-text)]">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-[var(--dash-border)]/60 transition-colors hover:bg-[var(--dash-bg)]/40"
              >
                {columns.map((col) => {
                  const alignRight = col.align === "right";
                  const content = col.render
                    ? col.render(row)
                    : (col.getValue(row) ?? "—");
                  const isFirst = col.key === columns[0].key;
                  const tdClass = `px-4 py-3 ${alignRight ? "text-right" : ""} ${isFirst ? "font-medium text-[var(--dash-text)]" : "text-[var(--dash-text-muted)]"}`;
                  return (
                    <td key={col.key} className={tdClass}>
                      {content}
                    </td>
                  );
                })}
                {renderActions && (
                  <td className="px-4 py-3 text-right">{renderActions(row)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
