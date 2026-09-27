'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Dynamic breadcrumb labels. The header derives crumbs from the pathname; pages with dynamic
 * segments register a human label for the current path:
 *
 *   useBreadcrumbLabel(employeeName)            // client component
 *   <BreadcrumbLabel label={request.request_number} />   // from a Server Component
 */

type Ctx = {
  labels: Readonly<Record<string, string>>;
  setLabel: (path: string, label: string | null) => void;
};

const BreadcrumbContext = createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  // setLabel must keep a stable identity: consumers list it as an effect dependency, so a new
  // function per `labels` change would re-run their cleanup/effect pair forever.
  const setLabel = useCallback<Ctx['setLabel']>(
    (path, label) =>
      setLabels((prev) => {
        if (label === null) {
          if (!(path in prev)) return prev;
          const next = { ...prev };
          delete next[path];
          return next;
        }
        return prev[path] === label ? prev : { ...prev, [path]: label };
      }),
    [],
  );
  const value = useMemo<Ctx>(() => ({ labels, setLabel }), [labels, setLabel]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbLabels(): Readonly<Record<string, string>> {
  return useContext(BreadcrumbContext)?.labels ?? {};
}

/** Sets the last breadcrumb label for the current path (or `path` when given). */
export function useBreadcrumbLabel(label: string | null | undefined, path?: string) {
  const ctx = useContext(BreadcrumbContext);
  const pathname = usePathname();
  const target = path ?? pathname;
  const setLabel = ctx?.setLabel;
  useEffect(() => {
    if (!setLabel || !label) return;
    setLabel(target, label);
    return () => setLabel(target, null);
  }, [setLabel, target, label]);
}

/** Render-less helper so Server Components can set the dynamic crumb label. */
export function BreadcrumbLabel({ label, path }: { label: string | null | undefined; path?: string }) {
  useBreadcrumbLabel(label, path);
  return null;
}
