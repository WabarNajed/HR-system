import type { Metadata } from 'next';
import { MasterDataPage } from '@/features/master-data/components/master-data-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.locations');

/** Settings › HR setup › Locations (master data pattern, see features/master-data). */
export default function SettingsLocationsPage() {
  return <MasterDataPage entity="locations" />;
}
