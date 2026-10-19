export function usePathname(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}
