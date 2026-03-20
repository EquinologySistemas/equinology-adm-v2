"use client";

import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useApiContext } from "@/context/ApiContext";
import {
  couponFromApi,
  formatCouponValidity,
  formatCouponValue,
} from "@/lib/coupons-api";
import type { Coupon } from "@/types/admin";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CouponCreateModal } from "./_components/CouponCreateModal";
import { CouponEditModal } from "./_components/CouponEditModal";

const API_COUPONS = "/admin/coupons";
const PAGE_SIZE = 20;

export default function CouponsPage() {
  const { GetAPI, DeleteAPI } = useApiContext();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  async function loadCoupons() {
    setLoading(true);
    const res = await GetAPI(API_COUPONS, true);
    setLoading(false);
    if (res.status === 200) {
      const raw = Array.isArray(res.body)
        ? res.body
        : (res.body?.coupons ?? res.body?.data ?? []);
      const list = Array.isArray(raw) ? raw : [];
      setCoupons(
        list.map((row: Record<string, unknown>) => couponFromApi(row)),
      );
    } else {
      toast.error("Erro ao carregar cupons.");
      setCoupons([]);
    }
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return coupons;
    const q = search.trim().toLowerCase();
    return coupons.filter((c) => c.code?.toLowerCase().includes(q));
  }, [coupons, search]);

  const totalFiltered = filtered.length;
  const paginatedData = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cupom?")) return;
    setDeletingId(id);
    const res = await DeleteAPI(`${API_COUPONS}/${id}`, true);
    setDeletingId(null);
    if (res.status === 200 || res.status === 204) {
      toast.success("Cupom excluído.");
      loadCoupons();
    } else {
      toast.error(
        typeof res.body === "string"
          ? res.body
          : ((res.body as { message?: string })?.message ??
              "Erro ao excluir cupom."),
      );
    }
  }

  const columns: ColumnDef<Coupon>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Código",
        sortable: true,
        getValue: (c) => c.code ?? "",
        render: (c) => (
          <span className="font-medium text-[var(--dash-text)] uppercase">
            {c.code}
          </span>
        ),
      },
      {
        key: "discountType",
        label: "Tipo",
        sortable: true,
        getValue: (c) => (c.discountType === "FIXED" ? "Fixo" : "Percentual"),
      },
      {
        key: "value",
        label: "Valor",
        sortable: true,
        getValue: (c) => formatCouponValue(c),
      },
      {
        key: "usages",
        label: "Usos",
        sortable: true,
        getValue: (c) => {
          const max = c.maxUsages;
          const cur = c.currentUsages ?? 0;
          if (max == null) return `${cur} / ∞`;
          return `${cur} / ${max}`;
        },
      },
      {
        key: "validity",
        label: "Validade",
        sortable: true,
        getValue: (c) => formatCouponValidity(c),
      },
      {
        key: "isActive",
        label: "Ativo",
        sortable: true,
        getValue: (c) => (c.isActive ? "Sim" : "Não"),
        render: (c) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              c.isActive
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {c.isActive ? "Sim" : "Não"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--dash-text)]">
            Cupons
          </h2>
          <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
            Gerencie cupons de desconto
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)]"
        >
          <Plus className="h-4 w-4" />
          Novo cupom
        </button>
      </div>

      <div className="rounded-xl border border-[var(--dash-border)] bg-white p-4 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código..."
            className="w-full rounded-xl border border-[var(--dash-border)] bg-white py-2.5 pr-4 pl-9 text-sm text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>

      <DataTable<Coupon>
        data={paginatedData}
        columns={columns}
        keyExtractor={(c) => c.id}
        loading={loading}
        emptyMessage="Nenhum cupom encontrado."
        renderActions={(c) => (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setEditingCoupon(c)}
              className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
              aria-label="Editar"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              disabled={deletingId === c.id}
              className="inline-flex items-center gap-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          </div>
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

      <CouponCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          loadCoupons();
        }}
      />

      <CouponEditModal
        coupon={editingCoupon}
        open={!!editingCoupon}
        onClose={() => setEditingCoupon(null)}
        onSaved={() => {
          setEditingCoupon(null);
          loadCoupons();
        }}
      />
    </div>
  );
}
