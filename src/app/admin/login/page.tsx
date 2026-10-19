import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdminSession()) redirect("/admin");
  const { error } = await searchParams;
  await headers();
  return (
    <div className="card section" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>Admin sign in</h1>
      {error === "1" && <p className="notice" data-tone="red" role="alert">Incorrect password.</p>}
      {error === "2" && <p className="notice" data-tone="red" role="alert">Too many attempts. Try again in 15 minutes.</p>}
      <form action="/admin/api/login" method="post" className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" className="input" autoComplete="current-password" required minLength={12} />
        <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}>Sign in</button>
      </form>
    </div>
  );
}
