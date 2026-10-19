import { cookies } from "next/headers";
import { adminConfigured, SESSION_COOKIE, verifySessionToken } from "./auth";

export async function isAdminSession(): Promise<boolean> {
  if (!adminConfigured()) return false;
  const jar = await cookies();
  try {
    return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return false;
  }
}
