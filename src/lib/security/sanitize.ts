import sanitizeHtml from "sanitize-html";

/** Sanitizes source-provided HTML before it is stored or rendered. Only https links survive. */
export function sanitizeSourceHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "a", "sup", "sub", "table", "thead", "tbody", "tr", "th", "td"],
    allowedAttributes: { a: ["href", "rel", "target"] },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href,
  });
}

export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain-text cleanup for short strings from external sources (names, descriptions). */
export function cleanText(s: string | null | undefined, max = 600): string {
  if (!s) return "";
  const t = htmlToText(s);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Only absolute https URLs are kept from external data. */
export function safeHttpsUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
