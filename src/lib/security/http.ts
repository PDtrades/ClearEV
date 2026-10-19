/**
 * Server-side HTTP for source adapters and link checks.
 *
 * Protections:
 *  - https only, and only to hosts on an explicit allowlist (adapters declare their hosts), so user
 *    input can never steer a server-side request (SSRF).
 *  - no credentials in logs: query strings are redacted from error messages.
 *  - timeouts, bounded response size, retry with exponential backoff for 429/5xx/network errors,
 *    and a per-host minimum interval between requests.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchOptions {
  allowedHosts: string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  maxBytes?: number;
  method?: "GET" | "HEAD";
  /** Accept non-2xx statuses without throwing (link checks). */
  acceptAnyStatus?: boolean;
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

const lastRequestAt = new Map<string, number>();
const MIN_INTERVAL_MS = Number(process.env.SOURCE_MIN_INTERVAL_MS ?? 1000);
const RETRY_BASE_MS = Number(process.env.SOURCE_RETRY_BASE_MS ?? 500);

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}${u.search ? "?[redacted]" : ""}`;
  } catch {
    return "[invalid url]";
  }
}

export function assertAllowedUrl(raw: string, allowedHosts: string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError("Invalid URL");
  }
  if (u.protocol !== "https:") throw new HttpError(`Blocked non-https URL ${redactUrl(raw)}`);
  if (u.username || u.password) throw new HttpError("Blocked URL with credentials");
  if (u.port && u.port !== "443") throw new HttpError(`Blocked non-standard port ${redactUrl(raw)}`);
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.some((h) => host === h || (h.startsWith(".") && host.endsWith(h)))) {
    throw new HttpError(`Blocked host ${host}`);
  }
  // Literal IPs are never allowed, even if they slipped into an allowlist.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) throw new HttpError("Blocked IP literal");
  return u;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function safeFetch(
  url: string,
  opts: FetchOptions,
  fetchImpl: FetchImpl = fetch,
): Promise<{ status: number; body: string; finalUrl: string }> {
  const u = assertAllowedUrl(url, opts.allowedHosts);
  const retries = opts.retries ?? 3;
  let attempt = 0;
  for (;;) {
    const wait = (lastRequestAt.get(u.host) ?? 0) + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(u.host, Date.now());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await fetchImpl(u.toString(), {
        method: opts.method ?? "GET",
        headers: { "User-Agent": "ClearEV/0.1 (+program discovery; contact via site)", ...opts.headers },
        signal: ctrl.signal,
        // Redirects are followed manually so every hop is re-checked against the allowlist.
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = new URL(res.headers.get("location")!, u).toString();
        assertAllowedUrl(next, opts.allowedHosts);
        return safeFetch(next, { ...opts, retries: retries - attempt }, fetchImpl);
      }
      const body = opts.method === "HEAD" ? "" : await readLimited(res, opts.maxBytes ?? 25_000_000);
      if (!res.ok && !opts.acceptAnyStatus) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new HttpError(`HTTP ${res.status} from ${redactUrl(url)}`, res.status, retryable);
      }
      return { status: res.status, body, finalUrl: u.toString() };
    } catch (e) {
      const err =
        e instanceof HttpError
          ? e
          : new HttpError(`Network error for ${redactUrl(url)}: ${(e as Error).name === "AbortError" ? "timeout" : (e as Error).message}`, undefined, true);
      if (err.retryable && attempt < retries) {
        attempt++;
        await sleep(Math.min(30_000, RETRY_BASE_MS * 2 ** attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(`Response too large (${len} bytes)`);
  const text = await res.text();
  if (text.length > maxBytes) throw new HttpError(`Response too large`);
  return text;
}

export async function safeFetchJson<T>(url: string, opts: FetchOptions, fetchImpl?: FetchImpl): Promise<T> {
  const { body } = await safeFetch(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } }, fetchImpl);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new HttpError(`Invalid JSON from ${redactUrl(url)}`);
  }
}
