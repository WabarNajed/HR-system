import { AwardIcon, TriangleAlertIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionCard } from '@/components/shared/section-card';
import { getSessionContext } from '@/lib/auth/session';
import { hasAny } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { listEmployeeCertificates } from '../server/queries';
import { IssuedCertificateList } from './issued-certificate-list';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8): that employee's certificates with
 * download. RLS decides visibility (the employee sees their valid certificates; HR sees all).
 */
export async function EmployeeCertificatesTab({ employeeId }: { employeeId: string }) {
  const [ctx, t, tc, supabase] = await Promise.all([
    getSessionContext(),
    getTranslations('certificates.employeeTab'),
    getTranslations('common.states'),
    createClient(),
  ]);
  const certificates = await listEmployeeCertificates(supabase, employeeId).catch((error) => {
    console.error('[certificates] employee tab failed:', error instanceof Error ? error.message : error);
    return null;
  });
  const canRevoke = Boolean(ctx?.isHR && hasAny(ctx, ['certificates.edit', 'certificates.create']));

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<AwardIcon />}>
      <div className="pt-2">
        {certificates === null ? (
          <EmptyState icon={TriangleAlertIcon} title={tc('errorTitle')} description={tc('errorDescription')} className="min-h-40 py-6" />
        ) : certificates.length ? (
          <IssuedCertificateList certificates={certificates} canRevoke={canRevoke} />
        ) : (
          <EmptyState icon={AwardIcon} title={t('emptyTitle')} description={t('emptyDescription')} className="min-h-40 py-6" />
        )}
      </div>
    </SectionCard>
  );
}
