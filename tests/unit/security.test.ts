import { describe, expect, it } from "vitest";
import { assertAllowedUrl, redactUrl, safeFetch } from "@/lib/security/http";
import { cleanText, safeHttpsUrl, sanitizeSourceHtml } from "@/lib/security/sanitize";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "@/lib/admin/auth";
import { cronAuthorized } from "@/lib/admin/cron-auth";

describe("server-side fetch protections", () => {
  it("only allows https to allowlisted hosts", () => {
    expect(() => assertAllowedUrl("http://developer.nrel.gov/x", ["developer.nrel.gov"])).toThrow(/non-https/);
    expect(() => assertAllowedUrl("https://evil.com/x", ["developer.nrel.gov"])).toThrow(/Blocked host/);
    expect(() => assertAllowedUrl("https://169.254.169.254/latest", ["169.254.169.254"])).toThrow(/IP literal/);
    expect(() => assertAllowedUrl("https://user:pw@developer.nrel.gov/x", ["developer.nrel.gov"])).toThrow(/credentials/);
    expect(() => assertAllowedUrl("https://developer.nrel.gov:8443/x", ["developer.nrel.gov"])).toThrow(/port/);
    expect(assertAllowedUrl("https://developer.nrel.gov/api", ["developer.nrel.gov"]).hostname).toBe("developer.nrel.gov");
  });
  it("re-validates redirects against the allowlist", async () => {
    const fetchImpl = async () => new Response("", { status: 302, headers: { location: "https://evil.com/steal" } });
    await expect(safeFetch("https://developer.nrel.gov/x", { allowedHosts: ["developer.nrel.gov"], retries: 0 }, fetchImpl)).rejects.toThrow(/Blocked host/);
  });
  it("retries retryable failures then surfaces the error", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      return new Response("busy", { status: 429 });
    };
    await expect(safeFetch("https://developer.nrel.gov/x", { allowedHosts: ["developer.nrel.gov"], retries: 2 }, fetchImpl)).rejects.toThrow(/HTTP 429/);
    expect(n).toBe(3);
  });
  it("redacts query strings (which can carry API keys) from messages", () => {
    expect(redactUrl("https://developer.nrel.gov/api?api_key=SECRET")).toBe("https://developer.nrel.gov/api?[redacted]");
  });
});

describe("sanitizing external content", () => {
  it("strips scripts and non-https links", () => {
    const out = sanitizeSourceHtml('<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://ok.gov/p">ok</a></p>');
    expect(out).not.toMatch(/script|javascript|onclick/);
    expect(out).toMatch(/href="https:\/\/ok.gov\/p"/);
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
  });
  it("cleans text and keeps only https URLs", () => {
    expect(cleanText("<b>Hello</b>&nbsp;world  ")).toBe("Hello world");
    expect(safeHttpsUrl("http://x.gov")).toBeUndefined();
    expect(safeHttpsUrl("https://x.gov/a")).toBe("https://x.gov/a");
  });
});

describe("admin auth", () => {
  it("hashes and verifies passwords, rejecting bad input", () => {
    const h = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("x", undefined)).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
  it("signs and expires session tokens", () => {
    process.env.ADMIN_SESSION_SECRET = "a".repeat(40);
    const t = createSessionToken(1000);
    expect(verifySessionToken(t, 2000)).toBe(true);
    expect(verifySessionToken(t, 1000 + 9 * 3_600_000)).toBe(false);
    expect(verifySessionToken(`${t}x`, 2000)).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });
  it("requires a bearer secret for cron routes", () => {
    process.env.CRON_SECRET = "s".repeat(20);
    expect(cronAuthorized(`Bearer ${"s".repeat(20)}`)).toBe(true);
    expect(cronAuthorized("Bearer nope")).toBe(false);
    expect(cronAuthorized(null)).toBe(false);
  });
});
