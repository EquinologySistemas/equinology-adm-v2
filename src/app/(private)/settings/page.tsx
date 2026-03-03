"use client";

import { useState } from "react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const [productName, setProductName] = useState("Equinology");
  const [termsUrl, setTermsUrl] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Placeholder: integrar com API quando existir PUT /admin/settings
      await new Promise((r) => setTimeout(r, 500));
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--dash-text)]">Configurações</h2>
        <p className="mt-1 text-sm text-[var(--dash-text-muted)]">
          Configurações globais do produto
        </p>
      </div>

      <form onSubmit={handleSave} className="max-w-xl space-y-6 rounded-xl border border-[var(--dash-border)] bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            Nome do produto
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
            placeholder="Equinology"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            URL dos termos de uso
          </label>
          <input
            type="url"
            value={termsUrl}
            onChange={(e) => setTermsUrl(e.target.value)}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            URL da política de privacidade
          </label>
          <input
            type="url"
            value={privacyUrl}
            onChange={(e) => setPrivacyUrl(e.target.value)}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--dash-text)]">
            URL de suporte
          </label>
          <input
            type="url"
            value={supportUrl}
            onChange={(e) => setSupportUrl(e.target.value)}
            className="w-full rounded-xl border border-[var(--dash-border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dash-accent)]/30"
            placeholder="https://..."
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="maintenance"
            checked={maintenanceMode}
            onChange={(e) => setMaintenanceMode(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--dash-border)] text-[var(--dash-accent)] focus:ring-[var(--dash-accent)]"
          />
          <label htmlFor="maintenance" className="text-sm text-[var(--dash-text)]">
            Modo manutenção (exibe aviso para usuários)
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[var(--dash-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--dash-accent-muted)] disabled:opacity-60"
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      </form>
    </div>
  );
}
