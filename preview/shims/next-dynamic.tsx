import { lazy, Suspense, type ComponentType } from "react";

// Minimal stand-in for next/dynamic: lazy-load a client component and show its loading element meanwhile.
export default function dynamic<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, opts: { loading?: () => React.ReactNode; ssr?: boolean } = {}) {
  const Lazy = lazy(loader);
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={opts.loading?.() ?? null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
