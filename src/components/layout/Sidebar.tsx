"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  Megaphone,
  Menu,
  Settings,
  Shield,
  Ticket,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Usuários", icon: Users },
  { href: "/plans", label: "Planos", icon: CreditCard },
  { href: "/coupons", label: "Cupons", icon: Ticket },
  { href: "/ads", label: "Anúncios", icon: Megaphone },
  { href: "/subscriptions", label: "Assinaturas", icon: FileText },
  { href: "/financial", label: "Financeiro", icon: DollarSign },
  { href: "/audit-logs", label: "Auditoria", icon: ClipboardList },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/settings", label: "Configurações", icon: Settings },
  { href: "/admins", label: "Administradores", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const { open, collapsed, setOpen, toggleCollapsed } = useSidebar();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const closeOverlay = () => setOpen(false);

  return (
    <>
      {/* Backdrop: apenas em telas pequenas quando overlay está aberta */}
      <div
        role="presentation"
        aria-hidden={!open}
        onClick={closeOverlay}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen shrink-0 flex-col border-r border-white/10 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] transition-[width,transform] duration-200 ease-out",
          "w-64 lg:translate-x-0",
          collapsed && "lg:w-16",
          !collapsed && "lg:w-64",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Navegação principal"
      >
        <div className="flex h-full min-w-0 flex-col">
          {/* Header: logo + botão fechar (overlay) / botão collapse (desktop) */}
          <div
            className={cn(
              "flex h-16 shrink-0 items-center border-b border-white/10 transition-[padding]",
              collapsed ? "justify-center px-0 lg:px-0" : "justify-between gap-2 px-4 lg:px-3"
            )}
          >
            {!collapsed && (
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <Image
                  src="/logo-full-white.png"
                  alt="Equinology Admin"
                  width={500}
                  height={100}
                  className="h-8 w-auto max-w-[180px] object-contain object-left"
                />
              </div>
            )}
            {/* Botão fechar no overlay (mobile) */}
            <button
              type="button"
              onClick={closeOverlay}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            {/* Botão collapse no desktop */}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white lg:flex"
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeOverlay}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2 lg:justify-center lg:px-2",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/80 hover:bg-[var(--sidebar-hover)] hover:text-white"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

export function SidebarTrigger() {
  const { toggleOpen } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleOpen}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--dash-text-muted)] hover:bg-[var(--dash-accent-soft)] hover:text-[var(--dash-accent)] lg:hidden"
      aria-label="Abrir menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
