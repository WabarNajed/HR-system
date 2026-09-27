import type { Metadata } from 'next';
import { MasterDataPage } from '@/features/master-data/components/master-data-page';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.jobTitles');

/** Settings › HR setup › Job titles (master data pattern, see features/master-data). */
export default function SettingsJobTitlesPage() {
  return <MasterDataPage entity="job_titles" />;
}
