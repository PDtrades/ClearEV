import { requestOrigin } from "@/lib/admin/origin";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/admin/auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(`${requestOrigin(req)}/admin/login`, 303);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/admin", maxAge: 0 });
  return res;
}
