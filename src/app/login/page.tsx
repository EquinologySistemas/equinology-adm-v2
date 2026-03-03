"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, User } from "lucide-react";
import { useApiContext } from "@/context/ApiContext";
import { useCookies } from "next-client-cookies";
import { AuthLayoutShell } from "@/components/auth/AuthLayoutShell";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthLabel } from "@/components/auth/AuthLabel";
import { AuthButton } from "@/components/auth/AuthButton";

const TOKEN_COOKIE =
  process.env.NEXT_PUBLIC_USER_TOKEN || "equinology_admin_token";
const AUTH_API = "/admin/auth/signin";

export default function LoginPage() {
  const router = useRouter();
  const cookies = useCookies();
  const { PostAPI } = useApiContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { status, body } = await PostAPI(
        AUTH_API,
        { email, password },
        false,
      );
      if (status === 200 && body?.accessToken) {
        cookies.set(TOKEN_COOKIE, body.accessToken, { path: "/" });
        router.push("/");
        router.refresh();
      } else {
        setError(
          typeof body?.message === "string"
            ? body.message
            : body?.message?.[0] ||
                "E-mail ou senha inválidos. Tente novamente.",
        );
      }
    } catch {
      setError("Erro ao conectar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayoutShell
      headerRight={
        <span className="font-medium text-[#154734]">
          Painel Administrativo
        </span>
      }
    >
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#27323F]/10">
        <User className="h-7 w-7 text-[#154734]" />
      </div>
      <h1 className="mb-1 text-2xl font-bold text-[#27323F]">
        Faça login na sua conta
      </h1>
      <p className="mb-8 text-sm text-[#27323F]/70">
        Insira seus dados para entrar.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <AuthLabel htmlFor="email">Email</AuthLabel>
          <AuthInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="seu@email.com"
            leftIcon={<Mail className="h-5 w-5" />}
          />
        </div>

        <div className="space-y-1.5">
          <AuthLabel htmlFor="password">Senha</AuthLabel>
          <AuthInput
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            leftIcon={<Lock className="h-5 w-5" />}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <AuthButton type="submit" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </AuthButton>
      </form>
    </AuthLayoutShell>
  );
}
