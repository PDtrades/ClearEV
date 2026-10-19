import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // MapLibre needs blob: workers and inline styles for its canvas; no external hosts are contacted by the browser.
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  outputFileTracingIncludes: { "/": ["./data/**/*", "./drizzle/**/*"], "/api/**": ["./data/**/*", "./drizzle/**/*"], "/program/**": ["./data/**/*", "./drizzle/**/*"], "/coverage": ["./data/**/*", "./drizzle/**/*"], "/admin/**": ["./data/**/*", "./drizzle/**/*"] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
