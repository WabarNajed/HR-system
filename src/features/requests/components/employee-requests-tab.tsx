import { ArrowUpRightIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/auth/session';
import { parseListParams } from '@/lib/list-params';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { OPEN_STATUSES } from '../constants';
import { getRequestAccess, listRequests, loadRequestTypes, subtypeMap } from '../queries';
import { EmployeeRequestsTable } from './employee-requests-table';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8): the employee's requests (RLS decides
 * what the viewer sees), a compact table linking to the details, and "New request" on their behalf.
 */
export async function EmployeeRequestsTab({ employeeId }: { employeeId: string }) {
  const t = await getTranslations('requests.employeeTab');
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const [access, types] = await Promise.all([getRequestAccess(supabase, ctx.user.id), loadRequestTypes(supabase, { withFields: false })]);
  const params = parseListParams({}, { defaultSort: 'created_at', defaultDir: 'desc', defaultPageSize: 100, maxPageSize: 100 });
  const [{ rows, total }, openRes] = await Promise.all([
    listRequests(supabase, params, { tab: 'all', access, typeIdsByKey: new Map(), employeeId, subtypes: subtypeMap(types) }),
    supabase
      .from('hr_requests')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', employeeId)
      .in('status', [...OPEN_STATUSES, 'returned']),
  ]);
  const isSelf = ctx.employee?.id === employeeId;
  const newHref = isSelf && (can(ctx, 'requests.create') || can(ctx, 'leave.create')) ? '/requests/new' : access.orgCreate ? `/requests/new?employee=${employeeId}` : null;
  const seesOthers = access.orgView || ctx.isManager;

  return (
    <SectionCard
      title={t('title')}
      description={t('summary', { total, open: openRes.count ?? 0 })}
      flush
      actions={
        <>
          {seesOthers && total > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/requests?employee=${employeeId}`}>
                {t('viewAll')}
                <ArrowUpRightIcon className="rtl:-scale-x-100" />
              </Link>
            </Button>
          ) : null}
          {newHref ? (
            <Button asChild size="sm">
              <Link href={newHref}>
                <PlusIcon />
                {t('newRequest')}
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <EmployeeRequestsTable rows={rows} />
    </SectionCard>
  );
}
