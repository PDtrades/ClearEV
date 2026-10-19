import type { AnchorHTMLAttributes } from "react";

// Internal hrefs ("/program/…", "/coverage") are intercepted by the preview's router in main.tsx.
export default function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...rest} />;
}
