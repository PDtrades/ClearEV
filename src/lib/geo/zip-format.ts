/** Pure ZIP string validation (safe for the browser; no data files). */
export function normalizeZip(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  const m = /^(\d{5})(?:-?\d{4})?$/.exec(s);
  return m ? m[1] : null;
}
