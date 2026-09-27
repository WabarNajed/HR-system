import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { NewRequestWizard } from '@/features/requests/components/new-request-wizard';
import { getDraftForWizard, getRequestAccess, loadFormLookups, loadRequestTypes } from '@/features/requests/queries';
import type { EmployeeOption } from '@/features/requests/types';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.items.newRequest');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadEmployee(supabase: ServerSupabaseClient, id: string | null): Promise<EmployeeOption | null> {
  if (!id || !UUID_RE.test(id)) return null;
  const { data } = await supabase
    .from('employees')
    .select('id, employee_number, name_ar, name_en, archived_at, department:departments!department_id(name_ar, name_en)')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.archived_at) return null;
  return {
    id: data.id,
    employee_number: data.employee_number,
    name_ar: data.name_ar,
    name_en: data.name_en,
    department: (data.department as EmployeeOption['department']) ?? null,
  };
}

/** New Request wizard: Type → Details (dynamic form) → Review. `?type=<key>`, `?employee=<id>` (HR), `?draft=<id>`. */
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/requests/new']);
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const t = await getTranslations('requests');
  const supabase = await createClient();

  const [access, types] = await Promise.all([getRequestAccess(supabase, ctx.user.id), loadRequestTypes(supabase, { activeOnly: true })]);
  const self = ctx.employee
    ? {
        id: ctx.employee.id,
        employee_number: ctx.employee.employee_number,
        name_ar: ctx.employee.name_ar,
        name_en: ctx.employee.name_en,
        department: ctx.employee.department,
      }
    : null;

  const draftRow = first(sp.draft) ? await getDraftForWizard(supabase, first(sp.draft)!, ctx.user.id) : null;
  const requestedEmployee = access.orgCreate ? first(sp.employee) : null;
  const targetId = draftRow?.employeeId ?? (requestedEmployee && requestedEmployee !== self?.id ? requestedEmployee : (self?.id ?? null));
  const target = targetId === self?.id ? self : await loadEmployee(supabase, targetId);

  const [lookups, managerRes] = await Promise.all([
    loadFormLookups(supabase, target?.id ?? null),
    target ? supabase.rpc('get_employee_manager', { p_employee_id: target.id }) : Promise.resolve({ data: null }),
  ]);
  const manager = managerRes.data as { name_ar?: string | null; name_en?: string | null } | null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        compact
        title={draftRow ? t('wizard.continueDraftTitle') : t('wizard.title')}
        description={t('wizard.description')}
      />
      <NewRequestWizard
        key={draftRow?.id ?? 'new'}
        types={types}
        initialTypeKey={first(sp.type)}
        self={self}
        canFileOnBehalf={access.orgCreate}
        initialTarget={target}
        initialLookups={lookups}
        initialManager={manager ? { name_ar: manager.name_ar ?? null, name_en: manager.name_en ?? null } : null}
        draft={draftRow ? { id: draftRow.id, typeId: draftRow.typeId, employee: target, values: draftRow.values, attachments: draftRow.attachments } : null}
      />
    </div>
  );
}
