'use client';

import { AlertTriangleIcon, RotateCwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

export type ErrorStateProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Retry handler (e.g. Next error boundary `reset`, or a refetch). Shows a Retry button. */
  onRetry?: () => void | Promise<void>;
  variant?: 'inline' | 'card' | 'page';
  /** Extra actions next to Retry. */
  action?: ReactNode;
  className?: string;
};

/** Error state with retry — never exposes raw error details. */
export function ErrorState({ title, description, onRetry, variant = 'card', action, className }: ErrorStateProps) {
  const t = useTranslations('common');
  const [pending, startTransition] = useTransition();
  return (
    <EmptyState
      icon={AlertTriangleIcon}
      tone="danger"
      variant={variant}
      className={className}
      title={title ?? t('states.errorTitle')}
      description={description ?? t('states.errorDescription')}
      action={
        onRetry || action ? (
          <>
            {onRetry ? (
              <Button
                variant="outline"
                size="sm"
                loading={pending}
                onClick={() => startTransition(async () => { await onRetry(); })}
              >
                {!pending ? <RotateCwIcon /> : null}
                {t('tryAgain')}
              </Button>
            ) : null}
            {action}
          </>
        ) : undefined
      }
    />
  );
}
