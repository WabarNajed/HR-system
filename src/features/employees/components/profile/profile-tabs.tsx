'use client';

import { useEffect, useRef } from 'react';
import { LinkTabs, type LinkTabItem } from '@/components/shared/link-tabs';

/**
 * Profile tab strip. On phones the strip scrolls horizontally; the active tab (e.g. `?tab=insurance`
 * opened from a link) is brought into view instead of hiding past the edge. Rect-based, so it works
 * the same in RTL and LTR, and it never scrolls the page vertically.
 */
export function ProfileTabs({ items, value, label }: { items: LinkTabItem[]; value: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = ref.current?.querySelector<HTMLElement>('[data-slot="link-tabs"]');
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const n = nav.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    const pad = 24;
    const delta = a.left < n.left ? a.left - n.left - pad : a.right > n.right ? a.right - n.right + pad : 0;
    if (delta) nav.scrollBy({ left: delta });
  }, [value]);

  return (
    <div ref={ref}>
      <LinkTabs items={items} value={value} aria-label={label} className="border-b-0" />
    </div>
  );
}
