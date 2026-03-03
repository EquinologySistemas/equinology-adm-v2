"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface SidebarContextValue {
  /** Em telas <=1024px: overlay aberta ou fechada */
  open: boolean;
  /** Em telas >1024px: sidebar estreita (só ícones) ou expandida */
  collapsed: boolean;
  setOpen: (value: boolean) => void;
  setCollapsed: (value: boolean) => void;
  toggleOpen: () => void;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const toggleOpen = useCallback(() => setOpen((prev) => !prev), []);
  const toggleCollapsed = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <SidebarContext.Provider
      value={{
        open,
        collapsed,
        setOpen,
        setCollapsed,
        toggleOpen,
        toggleCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
