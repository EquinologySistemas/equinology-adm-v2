"use client";

import Image from "next/image";

const LOGO_BLUR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 38'%3E%3Crect fill='%23154734' width='140' height='38' rx='4'/%3E%3C/svg%3E";

interface AuthLayoutShellProps {
  headerRight: React.ReactNode;
  children: React.ReactNode;
  showFooter?: boolean;
}

/**
 * Layout de duas colunas para login (igual ao sistema web).
 * Esquerda: formulário; direita: painel decorativo (lg+).
 */
export function AuthLayoutShell({
  headerRight,
  children,
  showFooter = true,
}: AuthLayoutShellProps) {
  return (
    <div className="flex h-screen max-h-dvh overflow-hidden">
      {/* Coluna esquerda */}
      <div className="flex h-full w-full min-w-0 shrink-0 flex-col bg-white lg:w-[52%]">
        <header className="flex shrink-0 items-center justify-between px-6 py-4 lg:px-12">
          <Image
            src="/logo-full-green.png"
            alt=""
            width={1000}
            height={1000}
            priority
            className="h-14 w-auto object-contain lg:h-16"
            placeholder="blur"
            blurDataURL={LOGO_BLUR}
          />
          <div className="text-sm text-[#27323F]/70">{headerRight}</div>
        </header>

        <main className="flex min-h-0 w-full flex-1 items-center overflow-x-hidden overflow-y-auto">
          <div className="flex w-full items-center justify-center px-6 py-6 lg:px-16 lg:py-8 xl:px-24">
            <div className="mx-auto w-full md:min-w-[380px] lg:mx-0">
              {children}
            </div>
          </div>
        </main>

        {showFooter && (
          <footer className="shrink-0 px-6 py-3 text-sm text-[#27323F]/60 lg:px-12">
            © {new Date().getFullYear()} Equinology
          </footer>
        )}
      </div>

      {/* Coluna direita decorativa */}
      <div
        className="auth-decor-panel relative hidden h-full overflow-hidden lg:flex lg:w-[48%] lg:shrink-0"
        aria-hidden
      >
        <div className="auth-decor-placeholder absolute inset-0" />
        <div className="login-gradient absolute inset-0" />
        <Image
          src="/side-login.png"
          alt=""
          width={2800}
          height={2800}
          priority
          className="z-10 h-full w-full object-cover opacity-60"
        />
        <Image
          src="/logo-full-green.png"
          alt=""
          width={1000}
          height={1000}
          priority
          className="absolute top-1/2 left-1/2 z-20 h-auto w-[60%] -translate-x-1/2 -translate-y-1/2 object-contain"
          placeholder="blur"
          blurDataURL={LOGO_BLUR}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[280px] w-[280px] rounded-full bg-white blur-3xl" />
        </div>
        <div className="absolute top-1/4 left-1/4 h-40 w-40 rounded-full bg-[#154734]/20 blur-2xl" />
        <div className="absolute right-1/4 bottom-1/3 h-56 w-56 rounded-full bg-[#154734]/20 blur-3xl" />
        <div className="absolute top-1/2 right-1/3 h-32 w-32 rounded-full bg-white/30 blur-2xl" />
        <div className="absolute bottom-1/4 left-1/3 h-48 w-48 rounded-full bg-[#154734]/20 blur-3xl" />
      </div>
    </div>
  );
}
