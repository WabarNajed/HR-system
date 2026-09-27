import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { SettingsHome } from '@/features/settings/components/settings-home';
import { SettingsHomeSkeleton } from '@/features/settings/components/settings-skeletons';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.title');

/**
 * Settings console home: organization snapshot, grouped cards with live status, configuration
 * health. (No segment `loading.tsx` here — it would also cover every nested settings route.)
 */
export default async function SettingsHomePage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings']);
  return (
    <Suspense fallback={<SettingsHomeSkeleton />}>
      <SettingsHome ctx={ctx} />
    </Suspense>
  );
}
