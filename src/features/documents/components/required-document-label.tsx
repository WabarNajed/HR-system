'use client';

import { useDocumentTypeLabel } from './labels';

/** Translated document type (client helper for server components). */
export function RequiredDocumentLabel({ type }: { type: string }) {
  const label = useDocumentTypeLabel();
  return <span className="truncate">{label(type)}</span>;
}
