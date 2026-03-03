"use client";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/context/SidebarContext";

export function SidebarContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "flex min-h-screen flex-1 flex-col pl-0 transition-[padding] duration-200",
        collapsed ? "lg:pl-16" : "lg:pl-64",
      )}
    >
      {children}
    </div>
  );
}
