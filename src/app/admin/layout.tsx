import Link from "next/link";
import { adminConfigured } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!adminConfigured()) {
    return (
      <div className="container">
        <h1>Admin</h1>
        <div className="notice" data-tone="amber">
          The admin interface is disabled until <code>ADMIN_PASSWORD_HASH</code> and <code>ADMIN_SESSION_SECRET</code> (32+ characters) are set. Generate a hash with <code>npm run admin:hash -- &apos;your password&apos;</code>. See docs/ADMIN.md.
        </div>
      </div>
    );
  }
  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <nav className="row small" aria-label="Admin">
        <Link href="/admin">Dashboard</Link>
        <Link href="/admin/review">Review queue</Link>
        <Link href="/admin/runs">Ingestion runs</Link>
        <form action="/admin/api/logout" method="post" style={{ marginLeft: "auto" }}>
          <button className="btn btn-sm" type="submit">Sign out</button>
        </form>
      </nav>
      {children}
    </div>
  );
}
