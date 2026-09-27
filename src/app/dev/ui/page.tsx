import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Gallery } from './gallery';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.dev');
  return { title: t('galleryTitle'), robots: { index: false, follow: false } };
}

/** Development-only design-system gallery. 404 in production builds. */
export default function DevUiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Gallery />;
}
