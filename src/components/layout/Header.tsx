"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useCookies } from "next-client-cookies";
import { SidebarTrigger } from "./Sidebar";
import { getTokenCookieName } from "@/lib/auth-cookies";

export function Header() {
  const router = useRouter();
  const cookies = useCookies();

  function handleLogout() {
    cookies.remove(getTokenCookieName());
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[var(--dash-border)] bg-[var(--dash-card)] px-4 shadow-sm sm:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <h1 className="text-lg font-semibold text-[var(--dash-text)]">
          Painel Administrativo
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)]"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </header>
  );
}
