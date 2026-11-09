import { NextResponse } from "next/server";
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const bad = (msg: string, status = 400) => json({ error: msg }, status);
export function guard<T extends any[]>(fn: (...a: T) => Promise<Response>) {
  return async (...a: T) => {
    try { return await fn(...a); }
    catch (e: any) {
      if (e?.status && e.status < 500) return bad(e.message, e.status);
      console.error(e); return bad(e?.message || "server error", 500);
    }
  };
}
