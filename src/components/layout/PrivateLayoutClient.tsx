"use client";

import { Sidebar } from "./Sidebar";
import { SidebarContent } from "./SidebarContent";
import { Header } from "./Header";
import { SidebarProvider } from "@/context/SidebarContext";

export function PrivateLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[var(--dash-bg)]">
        <Sidebar />
        <SidebarContent>
          <Header />
          <main className="dash-page min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        </SidebarContent>
      </div>
    </SidebarProvider>
  );
}
