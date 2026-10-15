"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { useApiContext } from "@/context/ApiContext";
export function AccountAccessActions({ id }: { id: string }) {
  const { PostAPI } = useApiContext();
  const [busy, setBusy] = useState(false);
  async function run(action: string) {
    setBusy(true);
    const res = await PostAPI("/admin/users/" + id + "/" + action, {}, true);
    setBusy(false);
    if (res.status === 200)
      toast.success(res.body?.message ?? "Operação concluída.");
    else
      toast.error(
        typeof res.body === "string"
          ? res.body
          : typeof res.body?.message === "string"
            ? res.body.message
            : "Não foi possível concluir.",
      );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("recover-password")}
        className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
      >
        Enviar recuperação por e-mail
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("revoke-sessions")}
        className="rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
      >
        Encerrar sessões
      </button>
    </div>
  );
}
