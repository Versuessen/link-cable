import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const uid = await verifySession(req.cookies.get(COOKIE)?.value).catch(() => null);
  if (uid) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // public: the user picker / login / sign-up, Next internals, the icon
  matcher: ["/((?!login|api/login|api/users|_next/|favicon.ico|icon.svg).*)"],
};
