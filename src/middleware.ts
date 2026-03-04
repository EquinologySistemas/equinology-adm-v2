import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTokenCookieName } from "@/lib/auth-cookies";

export function middleware(request: NextRequest) {
  const tokenCookieName = getTokenCookieName();
  const token = request.cookies.get(tokenCookieName)?.value;

  if (request.nextUrl.pathname === "/login") {
    if (token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Executa em rotas de página; não executa em arquivos estáticos (imagens, etc.),
     * para que /logo-full-green.png e /side-login.png carreguem na tela de login.
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$).*)",
  ],
};
