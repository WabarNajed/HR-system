'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * True while the observed container is narrower than `threshold` px. The builders use it to render the
 * properties panel in exactly one place (side pane when wide, sheet when narrow), so form controls and
 * their ids/labels are never duplicated in the DOM.
 */
export function useContainerNarrow(ref: RefObject<HTMLElement | null>, threshold = 640): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // ResizeObserver reports the initial size as soon as observation starts.
    const observer = new ResizeObserver(() => setNarrow(el.clientWidth < threshold));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return narrow;
}
