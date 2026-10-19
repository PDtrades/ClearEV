import { NextResponse } from "next/server";
import { adminConfigured, createSessionToken, loginAllowed, recordLoginFailure, SESSION_COOKIE, verifyPassword } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!adminConfigured()) return NextResponse.json({ error: "Admin not configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const base = new URL(req.url).origin;
  if (!loginAllowed(ip)) return NextResponse.redirect(`${base}/admin/login?error=2`, 303);
  const form = await req.formData();
  const pw = String(form.get("password") ?? "");
  if (!verifyPassword(pw, process.env.ADMIN_PASSWORD_HASH)) {
    recordLoginFailure(ip);
    return NextResponse.redirect(`${base}/admin/login?error=1`, 303);
  }
  const res = NextResponse.redirect(`${base}/admin`, 303);
  res.cookies.set(SESSION_COOKIE, createSessionToken(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/admin", maxAge: 8 * 3600 });
  return res;
}
