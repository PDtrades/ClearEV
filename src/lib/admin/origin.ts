/** Origin as the browser sees it (Next.js may rewrite req.url's host to localhost). */
export function requestOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}
