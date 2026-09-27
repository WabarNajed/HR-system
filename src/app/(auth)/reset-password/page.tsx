import { LinkIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { AuthHeading } from '@/features/auth/components/auth-heading';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { getSessionState } from '@/lib/auth/session';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.reset.title');

/**
 * Set a new password. Reached from the recovery / invitation link (`/auth/callback` or
 * `/auth/confirm` establish the session first). Without a session the link is invalid/expired.
 */
export default async function ResetPasswordPage() {
  const [state, t] = await Promise.all([getSessionState(), getTranslations('auth.reset')]);
  if (state.status !== 'authenticated') {
    return (
      <div>
        <AuthHeading icon={LinkIcon} tone="warning" title={t('invalidTitle')} description={t('invalidDescription')} />
        <Button asChild className="w-full">
          <Link href="/forgot-password">{t('requestNew')}</Link>
        </Button>
      </div>
    );
  }
  return <ResetPasswordForm />;
}
