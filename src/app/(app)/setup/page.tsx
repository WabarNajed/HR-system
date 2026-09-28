import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { SetupWizard } from '@/features/setup/components/setup-wizard';
import { loadSetupData, type SetupData } from '@/features/setup/queries';
import { isSetupStep, SETUP_STEPS } from '@/features/setup/steps';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can, checkAccess, hasAll } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('setup.title');

/** Setup wizard (`settings.administer`): resumable via `?step=`; opens the first incomplete step. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/setup']);
  const sp = await searchParams;
  const supabase = await createClient({ timeoutMs: 10000 });

  let data: SetupData;
  try {
    data = await loadSetupData(supabase);
  } catch (error) {
    console.error('[setup] load failed', error);
    const t = await getTranslations('setup');
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }

  const step = isSetupStep(sp.step) ? sp.step : (SETUP_STEPS.find((s) => !data.completion[s]) ?? SETUP_STEPS[0]);
  return (
    <SetupWizard
      step={step}
      data={data}
      perms={{
        canEditSettings: can(ctx, 'settings.edit'),
        canInvite: hasAll(ctx, ['users.create', 'users.administer']),
        canImport: checkAccess(ctx, ROUTE_ACCESS['/admin/data-management']),
        userEmail: ctx.profile.email,
      }}
    />
  );
}
