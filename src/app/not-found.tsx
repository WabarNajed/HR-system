import { CompassIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

/** Compact translated 404 for unmatched URLs (rendered without the shell). */
export default function NotFound() {
  const t = useTranslations('common.states');
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <EmptyState
        variant="page"
        icon={CompassIcon}
        tone="neutral"
        className="w-full max-w-md"
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
        action={
          <Button asChild size="sm">
            <Link href="/dashboard">{t('backToDashboard')}</Link>
          </Button>
        }
      />
    </main>
  );
}
