"use client";

import { useApiContext } from "@/context/ApiContext";
import type { Tutorial, TutorialType } from "@/types/admin";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Film, ImageIcon, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const MAX_CHAPTERS = 12;

const tutorialSchema = z.object({
  type: z.enum(["VIDEO", "PDF"]),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().max(1000, "Máximo de 1000 caracteres").optional(),
  mediaUrl: z.string().url("URL inválida").or(z.literal("")),
  posterUrl: z.string().url("URL inválida").or(z.literal("")),
  captionsUrl: z.string().url("URL inválida").or(z.literal("")),
  durationLabel: z.string().max(60, "Máximo de 60 caracteres").optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1, "Título do capítulo é obrigatório"),
        description: z.string().optional(),
        timecode: z.string().optional(),
      }),
    )
    .max(MAX_CHAPTERS, `Máximo de ${MAX_CHAPTERS} capítulos`),
});

type TutorialFormData = z.infer<typeof tutorialSchema>;

/** Corpo JSON pronto para POST/PUT em /admin/tutorials (arquivos já convertidos em URL). */
export interface TutorialSubmitPayload {
  type: TutorialType;
  title: string;
  description?: string;
  mediaUrl: string;
  posterUrl?: string;
  captionsUrl?: string;
  durationLabel?: string;
  isActive: boolean;
  featured: boolean;
  sortOrder: number;
  chapters: {
    title: string;
    description?: string;
    timecode?: string;
    sortOrder: number;
  }[];
}

interface TutorialsFormProps {
  initialData?: Tutorial;
  onSubmit: (data: TutorialSubmitPayload) => void | Promise<void>;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none";

export function TutorialsForm({
  initialData,
  onSubmit,
  onCancel,
}: TutorialsFormProps) {
  const { PostAPI } = useApiContext();
  const isEdit = Boolean(initialData);

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [captionsFile, setCaptionsFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    setError,
    watch,
  } = useForm<TutorialFormData>({
    resolver: zodResolver(tutorialSchema),
    defaultValues: {
      type: initialData?.type ?? "VIDEO",
      title: initialData?.title ?? "",
      description: initialData?.description ?? "",
      mediaUrl: initialData?.mediaUrl ?? "",
      posterUrl: initialData?.posterUrl ?? "",
      captionsUrl: initialData?.captionsUrl ?? "",
      durationLabel: initialData?.durationLabel ?? "",
      featured: initialData?.featured === true,
      active: initialData?.active !== false,
      sortOrder: initialData?.sortOrder ?? 0,
      chapters: (initialData?.chapters ?? []).map((c) => ({
        title: c.title,
        description: c.description ?? "",
        timecode: c.timecode ?? "",
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "chapters",
  });
  const type = watch("type");

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await PostAPI("/file", fd, true);
    if (res.status === 200 || res.status === 201) {
      const fullUrl = res.body?.fullUrl;
      return typeof fullUrl === "string" ? fullUrl : null;
    }
    return null;
  }

  async function resolveUrl(
    file: File | null,
    urlFromForm: string,
    label: string,
  ): Promise<string | undefined> {
    if (file) {
      const uploaded = await uploadFile(file);
      if (!uploaded) {
        throw new Error(`Falha ao enviar ${label}. Tente novamente.`);
      }
      return uploaded;
    }
    const trimmed = urlFromForm.trim();
    return trimmed || undefined;
  }

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        try {
          setUploading(true);
          const mediaUrl = await resolveUrl(
            mediaFile,
            data.mediaUrl,
            data.type === "VIDEO" ? "o vídeo" : "o PDF",
          );
          if (!mediaUrl) {
            setError("root", {
              message:
                data.type === "VIDEO"
                  ? "Envie o arquivo de vídeo ou informe a URL."
                  : "Envie o arquivo PDF ou informe a URL.",
            });
            return;
          }
          const posterUrl = await resolveUrl(
            posterFile,
            data.posterUrl,
            "a capa",
          );
          const captionsUrl =
            data.type === "VIDEO"
              ? await resolveUrl(captionsFile, data.captionsUrl, "a legenda")
              : undefined;

          await onSubmit({
            type: data.type,
            title: data.title,
            description: data.description?.trim() || undefined,
            mediaUrl,
            posterUrl,
            captionsUrl,
            durationLabel: data.durationLabel?.trim() || undefined,
            isActive: data.active !== false,
            featured: data.featured === true,
            sortOrder: data.sortOrder ?? 0,
            chapters:
              data.type === "VIDEO"
                ? data.chapters.map((c, index) => ({
                    title: c.title,
                    description: c.description?.trim() || undefined,
                    timecode: c.timecode?.trim() || undefined,
                    sortOrder: index,
                  }))
                : [],
          });
        } catch (err) {
          setError("root", {
            message:
              err instanceof Error ? err.message : "Erro ao enviar arquivos.",
          });
        } finally {
          setUploading(false);
        }
      })}
      className="space-y-4"
    >
      {errors.root?.message && (
        <p className="text-sm text-red-600">{errors.root.message}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Tipo *
          </label>
          <select
            {...register("type")}
            className={inputClass}
            disabled={isEdit}
          >
            <option value="VIDEO">Vídeo</option>
            <option value="PDF">PDF</option>
          </select>
          {isEdit && (
            <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
              O tipo não pode ser alterado após a criação.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            {type === "VIDEO"
              ? "Duração (ex: 08:32)"
              : "Tamanho (ex: 12 páginas)"}
          </label>
          <input
            {...register("durationLabel")}
            className={inputClass}
            placeholder={type === "VIDEO" ? "08:32" : "12 páginas"}
          />
          {errors.durationLabel && (
            <p className="mt-1 text-xs text-red-600">
              {errors.durationLabel.message}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Título *
        </label>
        <input
          {...register("title")}
          className={inputClass}
          placeholder="Ex: Primeiros passos na Equinology"
        />
        {errors.title && (
          <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          Descrição
        </label>
        <textarea
          {...register("description")}
          rows={3}
          className={`${inputClass} resize-y`}
          placeholder="Texto curto exibido junto ao tutorial no site."
        />
        {errors.description && (
          <p className="mt-1 text-xs text-red-600">
            {errors.description.message}
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
          {type === "VIDEO" ? "Arquivo de vídeo" : "Arquivo PDF"}{" "}
          {!isEdit ? "*" : ""}
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border)] bg-[var(--dash-bg)]/40 px-4 py-5 text-sm text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-bg)]/80">
          {type === "VIDEO" ? (
            <Film className="h-5 w-5 shrink-0" />
          ) : (
            <FileText className="h-5 w-5 shrink-0" />
          )}
          <span>
            {mediaFile
              ? mediaFile.name
              : isEdit
                ? "Escolher novo arquivo (opcional)"
                : "Clique para enviar o arquivo"}
          </span>
          <input
            type="file"
            accept={type === "VIDEO" ? "video/*" : "application/pdf"}
            className="sr-only"
            onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
          Máx. 200 MB. Alternativamente, informe a URL abaixo.
        </p>
        <input
          {...register("mediaUrl")}
          type="url"
          className={`${inputClass} mt-2`}
          placeholder="https://... (URL do conteúdo, se já hospedado)"
        />
        {errors.mediaUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.mediaUrl.message}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Capa (imagem)
          </label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border)] bg-[var(--dash-bg)]/40 px-4 py-4 text-sm text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-bg)]/80">
            <ImageIcon className="h-5 w-5 shrink-0" />
            <span className="truncate">
              {posterFile ? posterFile.name : "Enviar capa (opcional)"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <input
            {...register("posterUrl")}
            type="url"
            className={`${inputClass} mt-2`}
            placeholder="https://... (URL da capa)"
          />
          {errors.posterUrl && (
            <p className="mt-1 text-xs text-red-600">
              {errors.posterUrl.message}
            </p>
          )}
        </div>
        {type === "VIDEO" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
              Legenda (.vtt)
            </label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--dash-border)] bg-[var(--dash-bg)]/40 px-4 py-4 text-sm text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-bg)]/80">
              <FileText className="h-5 w-5 shrink-0" />
              <span className="truncate">
                {captionsFile ? captionsFile.name : "Enviar legenda (opcional)"}
              </span>
              <input
                type="file"
                accept=".vtt,text/vtt"
                className="sr-only"
                onChange={(e) => setCaptionsFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <input
              {...register("captionsUrl")}
              type="url"
              className={`${inputClass} mt-2`}
              placeholder="https://... (URL da legenda)"
            />
            {errors.captionsUrl && (
              <p className="mt-1 text-xs text-red-600">
                {errors.captionsUrl.message}
              </p>
            )}
          </div>
        )}
      </div>

      {type === "VIDEO" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium text-[var(--dash-text)]">
              Capítulos ({fields.length}/{MAX_CHAPTERS})
            </label>
            <button
              type="button"
              onClick={() =>
                append({ title: "", description: "", timecode: "" })
              }
              disabled={fields.length >= MAX_CHAPTERS}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--dash-accent)] hover:bg-[var(--dash-accent-soft)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar capítulo
            </button>
          </div>
          {fields.length === 0 && (
            <p className="text-xs text-[var(--dash-text-muted)]">
              Opcional: divida o vídeo em capítulos para facilitar a navegação
              (a ordem dos cards é a ordem de exibição).
            </p>
          )}
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-bg)]/30 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-6 shrink-0 text-center text-xs font-bold text-[var(--dash-text-muted)] tabular-nums">
                    {index + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-[1fr_90px] gap-2">
                      <input
                        {...register(`chapters.${index}.title`)}
                        className={inputClass}
                        placeholder="Título do capítulo *"
                      />
                      <input
                        {...register(`chapters.${index}.timecode`)}
                        className={inputClass}
                        placeholder="02:15"
                      />
                    </div>
                    <input
                      {...register(`chapters.${index}.description`)}
                      className={inputClass}
                      placeholder="Descrição curta (opcional)"
                    />
                    {errors.chapters?.[index]?.title && (
                      <p className="text-xs text-red-600">
                        {errors.chapters[index]?.title?.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="mt-1 rounded-lg p-2 text-[var(--dash-text-muted)] hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover capítulo ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="tutorial-active"
            {...register("active")}
            className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
          />
          <label
            htmlFor="tutorial-active"
            className="text-sm text-[var(--dash-text)]"
          >
            Ativo (visível no site)
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="tutorial-featured"
            {...register("featured")}
            className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
          />
          <label
            htmlFor="tutorial-featured"
            className="text-sm text-[var(--dash-text)]"
          >
            Destacado (player principal da LP)
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="tutorial-order"
            className="text-sm text-[var(--dash-text)]"
          >
            Ordem
          </label>
          <input
            id="tutorial-order"
            type="number"
            min={0}
            {...register("sortOrder")}
            className="w-20 rounded-xl border border-[var(--dash-border)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--dash-accent)]/30 focus:outline-none"
          />
        </div>
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
          {uploading
            ? "Enviando arquivos…"
            : isSubmitting
              ? "Salvando…"
              : "Salvar"}
        </button>
      </div>
    </form>
  );
}
