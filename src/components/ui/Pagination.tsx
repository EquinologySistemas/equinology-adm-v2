"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  if (totalItems === 0 || totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--dash-border)] bg-[var(--dash-bg)]/40 px-4 py-3">
      <p className="text-sm text-[var(--dash-text-muted)]">
        Mostrando {start}–{end} de {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)] disabled:pointer-events-none disabled:opacity-50"
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="text-sm text-[var(--dash-text-muted)]">
          Página {safePage} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--dash-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)] disabled:pointer-events-none disabled:opacity-50"
          aria-label="Próxima página"
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
