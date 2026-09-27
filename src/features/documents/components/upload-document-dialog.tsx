'use client';

import type { ReactNode } from 'react';

/**
 * Upload-document dialog (cross-module contract — owned by the documents module).
 * Stub: renders the trigger only; the documents module replaces the implementation.
 */
export function UploadDocumentDialog({
  trigger,
}: {
  employeeId?: string;
  trigger?: ReactNode;
  defaultType?: string;
}) {
  return <>{trigger ?? null}</>;
}
