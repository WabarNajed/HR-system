'use client';

import { CircleDotIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type StickyFormFooterProps = {
  /** Shows the "Unsaved changes" indicator. */
  dirty?: boolean;
  /** Submit button loading state. */
  pending?: boolean;
  /** Associates the submit button with a form outside this footer. */
  formId?: string;
  submitLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Cancel behaviour: link (`cancelHref`) or callback (`onCancel`). Hidden when neither is set. */
  cancelHref?: string;
  onCancel?: () => void;
  /** Disable submit (e.g. nothing changed). */
  submitDisabled?: boolean;
  /** Extra content at the logical start (e.g. "Delete" or help text). */
  start?: ReactNode;
  /** Replace the default buttons entirely. */
  children?: ReactNode;
  className?: string;
};

/**
 * Sticky bottom action bar for forms: Cancel / Save aligned at the logical end, stays visible
 * while scrolling long forms (and on mobile).
 */
export function StickyFormFooter({
  dirty,
  pending,
  formId,
  submitLabel,
  cancelLabel,
  cancelHref,
  onCancel,
  submitDisabled,
  start,
  children,
  className,
}: StickyFormFooterProps) {
  const t = useTranslations('common');
  return (
    <div
      data-slot="sticky-form-footer"
      className={cn(
        'sticky bottom-0 z-20 -mx-4 mt-2 border-t border-border bg-card/92 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 md:-mx-6 md:px-6',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-form items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-meta text-muted-foreground">
          {start}
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <CircleDotIcon className="size-3.5" aria-hidden />
              <span className="truncate">{t('unsavedChanges')}</span>
            </span>
          ) : null}
        </div>
        {children ?? (
          <div className="flex items-center gap-2">
            {cancelHref ? (
              <Button asChild variant="outline">
                <Link href={cancelHref}>{cancelLabel ?? t('cancel')}</Link>
              </Button>
            ) : onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
                {cancelLabel ?? t('cancel')}
              </Button>
            ) : null}
            <Button type="submit" form={formId} loading={pending} disabled={submitDisabled} className="min-w-28">
              {pending ? t('saving') : (submitLabel ?? t('saveChanges'))}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
