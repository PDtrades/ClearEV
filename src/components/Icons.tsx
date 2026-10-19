import type { IconKind } from "@/lib/domain/program";

/** Category icons: distinct shapes so category is never conveyed by color alone. */
export function CategoryIcon({ kind, size = 20, title }: { kind: IconKind; size?: number; title?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": title ? undefined : true, role: title ? "img" : undefined };
  switch (kind) {
    case "bolt":
      return (
        <svg {...common}>{title && <title>{title}</title>}<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
      );
    case "solar":
      return (
        <svg {...common}>{title && <title>{title}</title>}<rect x="3" y="4" width="18" height="11" rx="1.5" /><path d="M3 9.5h18M9 4v11M15 4v11M12 15v5M8 20h8" /></svg>
      );
    case "battery":
      return (
        <svg {...common}>{title && <title>{title}</title>}<rect x="2.5" y="7" width="17" height="10" rx="2" /><path d="M22 10.5v3M6 10.5v3M10 10.5v3M14 10.5v3" /></svg>
      );
    case "plug":
      return (
        <svg {...common}>{title && <title>{title}</title>}<path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5" /></svg>
      );
    default:
      return (
        <svg {...common}>{title && <title>{title}</title>}<circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
      );
  }
}

export function CloudLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#dcedf9" />
      <path d="M20 44a9 9 0 0 1-1-17.9A12 12 0 0 1 42 23a8 8 0 0 1 4 15.5V44H20z" fill="#ffffff" stroke="#b9d5ec" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
