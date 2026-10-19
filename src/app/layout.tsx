import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { CloudBackground } from "@/components/CloudBackground";

export const metadata: Metadata = {
  title: { default: "ClearEV — EV, charging, solar, battery and utility savings programs", template: "%s · ClearEV" },
  description: "Find live electric-vehicle, home charging, solar, home battery, utility, and company savings programs by ZIP code or state, with sources and last-verified dates.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#dcedf9", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <CloudBackground />
        <header className="site-header">
          <Link href="/" className="brand" aria-label="ClearEV home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt="" width={32} height={32} />
            ClearEV
          </Link>
          <nav className="site-nav" aria-label="Site">
            <Link href="/">Explore</Link>
            <Link href="/coverage">Coverage &amp; sources</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <p>ClearEV lists programs from official and reputable sources and shows where each value came from and when it was last checked. It does not promise eligibility, approval, or savings; always confirm with the program administrator.</p>
          <p>Incentive data by <a href="https://www.rewiringamerica.org" rel="noopener noreferrer">Rewiring America</a> where noted · U.S. DOE <a href="https://afdc.energy.gov/laws" rel="noopener noreferrer">Alternative Fuels Data Center</a> · <a href="https://openei.org/wiki/Utility_Rate_Database" rel="noopener noreferrer">OpenEI Utility Rate Database</a> · U.S. Census Bureau geography.</p>
        </footer>
      </body>
    </html>
  );
}
