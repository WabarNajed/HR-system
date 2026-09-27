import type { Metadata } from 'next';
import { MasterDataPage } from '@/features/master-data/components/master-data-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.costCenters');

/** Settings › HR setup › Cost centers (master data pattern, see features/master-data). */
export default function SettingsCostCentersPage() {
  return <MasterDataPage entity="cost_centers" />;
}
