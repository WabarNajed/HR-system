import { ShieldAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

export type ForbiddenProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Show a "Back to dashboard" link (default true). */
  showHomeLink?: boolean;
  homeHref?: string;
  variant?: 'inline' | 'card' | 'page';
  className?: string;
};

/** Shared "no permission" state rendered by `requirePermission()` guards. */
export function Forbidden({
  title,
  description,
  showHomeLink = true,
  homeHref = '/dashboard',
  variant = 'page',
  className,
}: ForbiddenProps) {
  const t = useTranslations('common.states');
  return (
    <EmptyState
      icon={ShieldAlertIcon}
      tone="warning"
      variant={variant}
      className={className}
      title={title ?? t('forbiddenTitle')}
      description={description ?? t('forbiddenDescription')}
      action={
        showHomeLink ? (
          <Button asChild variant="outline" size="sm">
            <Link href={homeHref}>{t('backToDashboard')}</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
