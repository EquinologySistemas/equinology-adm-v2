"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Ad } from "@/types/admin";

const adSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  redirectUrl: z.string().url("URL inválida").or(z.literal("")),
  imageUrl: z.string().min(1, "URL da imagem é obrigatória"),
  active: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

type AdFormData = z.infer<typeof adSchema>;

interface AdsFormProps {
  initialData?: Ad;
  onSubmit: (data: Partial<Ad>) => void | Promise<void>;
  onCancel: () => void;
}

export function AdsForm({ initialData, onSubmit, onCancel }: AdsFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdFormData>({
    resolver: zodResolver(adSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      redirectUrl: initialData?.redirectUrl ?? "",
      imageUrl: initialData?.imageUrl ?? "",
      active: initialData?.active !== false,
      displayOrder: initialData?.displayOrder ?? undefined,
      validFrom: initialData?.validFrom
        ? initialData.validFrom.slice(0, 10)
        : "",
      validUntil: initialData?.validUntil
        ? initialData.validUntil.slice(0, 10)
        : "",
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => onSubmit(data))}
      className="space-y-4"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Nome *
        </label>
        <input
          {...register("name")}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          placeholder="Ex: Promoção Black Friday"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          URL de redirecionamento
        </label>
        <input
          {...register("redirectUrl")}
          type="url"
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          placeholder="https://..."
        />
        {errors.redirectUrl && (
          <p className="mt-1 text-xs text-red-600">
            {errors.redirectUrl.message}
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          URL da imagem *
        </label>
        <input
          {...register("imageUrl")}
          type="url"
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          placeholder="https://..."
        />
        {errors.imageUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.imageUrl.message}</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Ordem de exibição
        </label>
        <input
          type="number"
          {...register("displayOrder")}
          min={0}
          className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Válido de
          </label>
          <input
            type="date"
            {...register("validFrom")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Válido até
          </label>
          <input
            type="date"
            {...register("validUntil")}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          {...register("active")}
          className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
        />
        <label htmlFor="active" className="text-sm text-[var(--dash-text)]">
          Anúncio ativo
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--dash-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--dash-text)] hover:bg-[var(--dash-bg)]/80"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
        >
          {isSubmitting ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
