import { useTranslations } from 'next-intl';
import { ProfileHeaderSkeleton, TabSkeleton } from '@/features/employees/components/profile/tab-skeleton';

/** Employee profile skeleton: header card + tab content. */
export default function EmployeeProfileLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <ProfileHeaderSkeleton />
      <TabSkeleton />
    </div>
  );
}
