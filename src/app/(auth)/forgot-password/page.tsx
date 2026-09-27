import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.forgot.title');

/** Request a password-reset email (never reveals whether the account exists). */
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
