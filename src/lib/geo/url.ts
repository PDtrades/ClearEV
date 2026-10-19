/** URL of a static file under /geo, or under the preview build's base when it sets one. Browser only. */
export function geoUrl(p: string) {
  const base = (window as unknown as { __CLEAREV_GEO_BASE__?: string }).__CLEAREV_GEO_BASE__;
  return base ? `${base.replace(/\/$/, "")}/${p}` : `${window.location.origin}/geo/${p}`;
}
