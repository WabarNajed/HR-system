import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthHeading } from '@/features/auth/components/auth-heading';
import { getPublicBranding } from '@/lib/branding';
import { pageMetadata } from '@/lib/metadata';
import { LoginForm } from './login-form';
import type { LoginNotice } from './notice';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.title', 'auth.description');

function noticeFrom(params: Record<string, string | string[] | undefined>): LoginNotice | null {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const error = first(params.error);
  if (error === 'link_expired' || error === 'auth_callback' || error === 'otp_expired') return 'linkExpired';
  if (error === 'session_expired') return 'sessionExpired';
  if (first(params.reset) === '1') return 'passwordUpdated';
  if (first(params.signedout) === '1') return 'signedOut';
  return null;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, t, branding] = await Promise.all([searchParams, getTranslations('auth.login'), getPublicBranding()]);
  const next = typeof params.next === 'string' ? params.next : undefined;
  return (
    <>
      <AuthHeading title={t('title')} description={t('subtitle')} />
      <LoginForm next={next} notice={noticeFrom(params)} allowRegister={branding.allowSelfRegistration} />
    </>
  );
}
