import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/health открыт без пароля: он нужен, чтобы проверять доступность сайта
  // снаружи, и ничего кроме времени работы и объёма памяти не показывает.
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health"
  ) {
    return NextResponse.next();
  }

  const expected = process.env.APP_PASSWORD ?? "";
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (!expected || session !== expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Skip /api/extract — middleware buffering breaks large multipart PDF uploads.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/extract).*)"],
};
