"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Ad } from "@/types/admin";
import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

const adSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    redirectUrl: z.string().url("URL inválida").or(z.literal("")),
    active: z.boolean().optional(),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const from = data.validFrom?.trim() ?? "";
    const until = data.validUntil?.trim() ?? "";
    const hasFrom = Boolean(from);
    const hasUntil = Boolean(until);
    if (hasFrom !== hasUntil) {
      const message =
        "Preencha a data inicial e a final, ou deixe as duas em branco (exibição sem prazo).";
      if (!hasFrom) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["validFrom"] });
      }
      if (!hasUntil) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["validUntil"] });
      }
    }
  });

type AdFormData = z.infer<typeof adSchema>;

export type AdsFormSubmitPayload = AdFormData & {
  imageFile: File | null;
};

interface AdsFormProps {
  initialData?: Ad;
  onSubmit: (data: AdsFormSubmitPayload) => void | Promise<void>;
  onCancel: () => void;
}

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function AdsForm({ initialData, onSubmit, onCancel }: AdsFormProps) {
  const isEdit = Boolean(initialData);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    clearErrors,
  } = useForm<AdFormData>({
    resolver: zodResolver(adSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      redirectUrl: initialData?.redirectUrl ?? "",
      active: initialData?.active !== false,
      validFrom: formatDateInput(initialData?.validFrom),
      validUntil: formatDateInput(initialData?.validUntil),
    },
  });

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    clearErrors("root");
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    if (!file) {
      setImageFile(null);
      setImagePreview(initialData?.imageUrl ?? null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("root", { message: "Selecione um arquivo de imagem." });
      e.target.value = "";
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    if (initialData?.imageUrl && !imagePreview) {
      setImagePreview(initialData.imageUrl);
    }
  }, [initialData?.imageUrl, imagePreview]);

  return (
    <form
      onSubmit={handleSubmit((data) => {
        if (!isEdit && !imageFile) {
          setError("root", { message: "Selecione uma imagem para o anúncio." });
          return;
        }
        void onSubmit({ ...data, imageFile });
      })}
      className="space-y-4"
    >
      {errors.root?.message && (
        <p className="text-sm text-red-600">{errors.root.message}</p>
      )}
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
          Imagem {!isEdit ? "*" : ""}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border)] bg-[var(--dash-bg)]/40 px-4 py-6 text-sm text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-bg)]/80">
            <ImageIcon className="h-5 w-5 shrink-0" />
            <span>
              {isEdit
                ? "Escolher nova imagem (opcional)"
                : "Clique para enviar uma imagem"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              onChange={onFileChange}
            />
          </label>
          {imagePreview ? (
            <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-[var(--dash-border)] bg-[var(--dash-bg)]">
              <img
                src={imagePreview}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
          JPEG, PNG, GIF ou WebP. Máx. 5 MB.
        </p>
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
          {errors.validFrom && (
            <p className="mt-1 text-xs text-red-600">
              {errors.validFrom.message}
            </p>
          )}
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
          {errors.validUntil && (
            <p className="mt-1 text-xs text-red-600">
              {errors.validUntil.message}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--dash-text-muted)]">
        Deixe as duas datas em branco para o anúncio permanecer válido sem limite de tempo
        (enquanto estiver ativo). Se preencher uma data, a outra também é obrigatória.
      </p>
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
