import { FileQuestionIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

/** Compact 404 inside the shell (e.g. `notFound()` for a record the user can't see). */
export default function AppNotFound() {
  const t = useTranslations('common.states');
  return (
    <EmptyState
      variant="page"
      icon={FileQuestionIcon}
      tone="neutral"
      title={t('notFoundTitle')}
      description={t('notFoundDescription')}
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">{t('backToDashboard')}</Link>
        </Button>
      }
    />
  );
}
