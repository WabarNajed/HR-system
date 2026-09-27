'use client';

import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Dev-gallery-only bilingual label helper. The gallery is excluded from production
 * (`notFound()`), so its section captions are not part of the product's i18n catalogue.
 */
export function useDevLabel() {
  const locale = useLocale();
  return (ar: string, en: string) => (locale === 'ar' ? ar : en);
}

export function GallerySection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-2.5">
        <div>
          <h2 className="text-section-title">{title}</h2>
          {description ? <p className="mt-0.5 text-meta text-muted-foreground">{description}</p> : null}
        </div>
        <span className="font-mono text-xs text-faint-foreground" dir="ltr">
          #{id}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Small caption above a demo block. */
export function DemoLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium tracking-wide text-faint-foreground uppercase">{children}</p>;
}
