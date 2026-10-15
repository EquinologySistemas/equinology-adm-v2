"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useApiContext } from "@/context/ApiContext";
import { DataTable, type ColumnDef } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";

type Owner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  deletedAt: string | null;
  accessBlocked: boolean;
  credentialSetAt: string | null;
  lastLoginAt: string | null;
  companies: { company: { id: string; name: string } }[];
  _count: { Animal: number };
  Animal?: {
    id: string;
    name: string;
    code: string;
    company: { id: string; name: string } | null;
    studFarm: { id: string; name: string } | null;
  }[];
};
const inputClass =
  "w-full rounded-xl border border-[var(--dash-border)] bg-white px-3 py-2 text-sm";
const buttonClass =
  "rounded-xl border border-[var(--dash-border)] px-3 py-2 text-sm disabled:opacity-50";
function message(body: unknown, fallback: string): string {
  if (typeof body === "string") return body;
  const msg = (body as { message?: unknown } | null)?.message;
  return typeof msg === "string" ? msg : fallback;
}
function status(o: Owner) {
  return o.deletedAt
    ? "Conta excluída"
    : o.accessBlocked
      ? "Acesso bloqueado"
      : !o.email
        ? "Sem e-mail de acesso"
        : "Acesso disponível";
}

export default function OwnersPage() {
  const { GetAPI, PatchAPI, PostAPI } = useApiContext();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Owner | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", cpf: "" });
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await GetAPI(
      "/admin/owners?" +
        new URLSearchParams({ search, page: String(page), pageSize: "20" }),
      true,
    );
    if (res.status === 200) {
      setOwners(res.body.owners);
      setTotal(res.body.total);
    } else {
      setOwners([]);
      setError(
        message(res.body, "Não foi possível carregar os proprietários."),
      );
    }
    setLoading(false);
  }, [GetAPI, search, page]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);
  async function open(owner: Owner) {
    setBusy(true);
    const res = await GetAPI("/admin/owners/" + owner.id, true);
    setBusy(false);
    if (res.status !== 200) {
      toast.error(message(res.body, "Erro ao carregar detalhes."));
      return;
    }
    const value: Owner = res.body.owner;
    setSelected(value);
    setPassword("");
    setConfirmation("");
    setForm({
      name: value.name,
      email: value.email ?? "",
      phone: value.phone ?? "",
      cpf: value.cpf ?? "",
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    if (password && (password.length < 6 || password !== confirmation)) {
      toast.error("Confirme a nova senha com no mínimo 6 caracteres.");
      return;
    }
    setBusy(true);
    const res = await PatchAPI(
      "/admin/owners/" + selected.id,
      {
        ...form,
        email: form.email || undefined,
        ...(password ? { newPassword: password } : {}),
      },
      true,
    );
    setBusy(false);
    if (res.status === 200) {
      setSelected(res.body.owner);
      setPassword("");
      setConfirmation("");
      toast.success(
        "Cadastro salvo." +
          (password ? " Senha alterada e sessões encerradas." : ""),
      );
      void load();
    } else toast.error(message(res.body, "Erro ao salvar proprietário."));
  }
  async function action(
    kind: "recover-password" | "revoke-sessions" | "block",
  ) {
    if (!selected || busy) return;
    if (
      kind === "block" &&
      !confirm(
        selected.accessBlocked
          ? "Liberar o acesso ao app?"
          : "Bloquear o acesso ao app e encerrar as sessões?",
      )
    )
      return;
    setBusy(true);
    const res =
      kind === "block"
        ? await PatchAPI(
            "/admin/owners/" + selected.id,
            { accessBlocked: !selected.accessBlocked },
            true,
          )
        : await PostAPI("/admin/owners/" + selected.id + "/" + kind, {}, true);
    setBusy(false);
    if (res.status === 200) {
      if (kind === "block") {
        setSelected(res.body.owner);
        void load();
      }
      toast.success(message(res.body, "Operação concluída."));
    } else
      toast.error(message(res.body, "Não foi possível concluir a operação."));
  }
  const columns: ColumnDef<Owner>[] = [
    { key: "name", label: "Nome", getValue: (o) => o.name },
    {
      key: "email",
      label: "E-mail",
      getValue: (o) => o.email ?? "",
      render: (o) => o.email || "Não informado",
    },
    {
      key: "phone",
      label: "Telefone",
      getValue: (o) => o.phone ?? "",
      render: (o) => o.phone || "—",
    },
    { key: "status", label: "Acesso", getValue: status, render: status },
    {
      key: "animals",
      label: "Cavalos",
      getValue: (o) => o._count.Animal,
      render: (o) => o._count.Animal,
    },
    {
      key: "companies",
      label: "Empresas",
      getValue: (o) => o.companies.map((c) => c.company.name).join(", "),
      render: (o) =>
        o.companies.map((c) => c.company.name).join(", ") || "Sem vínculo",
    },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Proprietários</h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Gerencie os cadastros e o acesso dos donos dos cavalos ao app.
        </p>
      </div>
      <input
        aria-label="Buscar proprietários"
        className={inputClass}
        placeholder="Buscar por nome, e-mail, telefone ou CPF"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {error && (
        <div role="alert" className="text-sm text-red-600">
          {error}{" "}
          <button className={buttonClass} onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      <DataTable
        data={owners}
        columns={columns}
        keyExtractor={(o) => o.id}
        loading={loading}
        emptyMessage="Nenhum proprietário encontrado."
        renderActions={(o) => (
          <button
            disabled={busy}
            className={buttonClass}
            onClick={() => void open(o)}
          >
            Gerenciar
          </button>
        )}
      />
      {total > 0 && (
        <Pagination
          currentPage={page}
          totalItems={total}
          pageSize={20}
          onPageChange={setPage}
        />
      )}
      <Modal
        open={!!selected}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title="Gerenciar proprietário"
        className="max-w-3xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-xl bg-[var(--dash-bg)] p-3 text-sm">
              <strong>{status(selected)}</strong>
              <p>
                Último acesso:{" "}
                {selected.lastLoginAt
                  ? new Date(selected.lastLoginAt).toLocaleString("pt-BR")
                  : "Sem acesso registrado"}
              </p>
              <p>
                Senha:{" "}
                {selected.credentialSetAt
                  ? "Definida em " +
                    new Date(selected.credentialSetAt).toLocaleString("pt-BR")
                  : "Data de definição não registrada"}
              </p>
            </div>
            {!selected.deletedAt && (
              <form className="space-y-4" onSubmit={save}>
                <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Nome
                    <input
                      required
                      className={inputClass}
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    E-mail de acesso
                    <input
                      type="email"
                      className={inputClass}
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Telefone
                    <input
                      type="tel"
                      className={inputClass}
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    CPF
                    <input
                      className={inputClass}
                      value={form.cpf}
                      onChange={(e) =>
                        setForm({ ...form, cpf: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Nova senha
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      maxLength={100}
                      className={inputClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    Confirmar nova senha
                    <input
                      type="password"
                      autoComplete="new-password"
                      required={!!password}
                      className={inputClass}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                </fieldset>
                <p className="text-xs text-[var(--dash-text-muted)]">
                  Deixe a senha em branco para mantê-la. Alterações de acesso
                  encerram as sessões existentes. O e-mail cadastrado é usado
                  para entrar no app e recuperar a senha.
                </p>
                <button
                  disabled={busy}
                  className="rounded-xl bg-[var(--dash-accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {busy ? "Aguarde…" : "Salvar alterações"}
                </button>
              </form>
            )}
            {!selected.deletedAt && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonClass}
                  disabled={busy || !selected.email || selected.accessBlocked}
                  onClick={() => void action("recover-password")}
                >
                  Enviar recuperação por e-mail
                </button>
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void action("revoke-sessions")}
                >
                  Encerrar sessões
                </button>
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void action("block")}
                >
                  {selected.accessBlocked
                    ? "Liberar acesso"
                    : "Bloquear acesso"}
                </button>
              </div>
            )}
            <div>
              <h3 className="font-semibold">Empresas vinculadas</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {selected.companies.map(({ company }) => (
                  <li key={company.id}>
                    <Link
                      className="text-[var(--dash-accent)] underline"
                      href={"/companies/" + company.id}
                    >
                      {company.name}
                    </Link>
                  </li>
                ))}
              </ul>
              {!selected.companies.length && (
                <p className="text-sm">Nenhuma empresa vinculada.</p>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Cavalos vinculados</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {selected.Animal?.map((a) => (
                  <li key={a.id} className="rounded-lg border p-2">
                    <strong>{a.name}</strong> · {a.code}
                    <p>
                      {a.company?.name ?? "Sem empresa"} ·{" "}
                      {a.studFarm?.name ?? "Sem propriedade"}
                    </p>
                  </li>
                ))}
              </ul>
              {!selected.Animal?.length && (
                <p className="text-sm">Nenhum cavalo vinculado.</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
