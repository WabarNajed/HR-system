import { UserRoundXIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { AuthHeading } from '@/features/auth/components/auth-heading';
import { RegisterForm } from '@/features/auth/components/register-form';
import { getPublicBranding } from '@/lib/branding';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.register.title');

/** Employee self-registration (account stays `pending` until HR approves). */
export default async function RegisterPage() {
  const [t, branding] = await Promise.all([getTranslations('auth.register'), getPublicBranding()]);
  if (!branding.allowSelfRegistration) {
    return (
      <div>
        <AuthHeading icon={UserRoundXIcon} tone="warning" title={t('disabledTitle')} description={t('disabledDescription')} />
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">{t('signIn')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <AuthHeading title={t('title')} description={t('subtitle')} />
      <RegisterForm />
    </>
  );
}
