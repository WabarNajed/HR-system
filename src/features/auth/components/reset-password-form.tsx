'use client';

import { AlertCircleIcon, ArrowRightIcon, CheckCircle2Icon, KeyRoundIcon, PartyPopperIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { resetPasswordWithForm } from '../form-actions';
import { initialFormState } from '../form-state';
import { resetPasswordSchema } from '../schemas';
import { AuthHeading } from './auth-heading';
import { PasswordInput } from './password-input';
import { PasswordRules } from './password-rules';
import { ProgressiveField, useProgressiveForm } from './progressive-form';

/**
 * Sets the password of the signed-in account. `mode="invite"` is the first-time "Set your password"
 * step of an invitation; `mode="recovery"` is a password reset. Progressive: a plain POST to the
 * Server Action before hydration / without JavaScript.
 */
export function ResetPasswordForm({ mode = 'recovery', email }: { mode?: 'invite' | 'recovery'; email?: string | null }) {
  const t = useTranslations('auth.reset');
  const tc = useTranslations('common');
  const resolveError = useErrorMessage();
  const router = useRouter();
  const invite = mode === 'invite';
  const { state, formAction, pending, errors, onSubmit, onInput } = useProgressiveForm(
    resetPasswordSchema,
    resetPasswordWithForm,
    initialFormState<'password' | 'confirmPassword'>(),
  );
  const [password, setPassword] = useState('');
  const done = state.status === 'success';
  const alertError = state.error && !(state.error === 'errors.validation' && (errors.password || errors.confirmPassword)) ? state.error : null;

  const announced = useRef(false);
  useEffect(() => {
    if (!done || announced.current) return;
    announced.current = true;
    toast.success(invite ? t('inviteSuccess') : t('success'));
    router.replace('/dashboard');
    router.refresh();
  }, [done, invite, router, t]);

  if (done) {
    return (
      <div>
        <AuthHeading icon={CheckCircle2Icon} tone="success" title={invite ? t('inviteSuccess') : t('success')} />
        <Button asChild className="w-full">
          <Link href="/dashboard">
            {tc('continue')}
            <ArrowRightIcon className="rtl:rotate-180" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        icon={invite ? PartyPopperIcon : KeyRoundIcon}
        tone={invite ? 'success' : 'primary'}
        title={invite ? t('inviteTitle') : t('title')}
        description={invite ? t('inviteSubtitle') : t('subtitle')}
      />
      <form
        action={formAction}
        onSubmit={onSubmit}
        onInput={onInput}
        onReset={() => setPassword('')}
        noValidate
        className="flex flex-col gap-4"
        aria-busy={pending}
      >
        {email ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-subtle px-3 py-2 text-meta">
            <span className="text-muted-foreground">{t('account')}</span>
            <bdi dir="ltr" className="truncate font-medium text-foreground">
              {email}
            </bdi>
          </div>
        ) : null}
        {alertError ? (
          <Alert variant="danger" aria-live="assertive">
            <AlertCircleIcon />
            <AlertDescription>{resolveError(alertError)}</AlertDescription>
          </Alert>
        ) : null}
        {/* Lets password managers associate the new password with the account (not submitted). */}
        {email ? <input type="email" autoComplete="username" value={email} readOnly hidden /> : null}
        <ProgressiveField label={t('password')} required error={errors.password}>
          {(field) => (
            <>
              <PasswordInput
                {...field}
                name="password"
                autoComplete="new-password"
                className="h-10"
                readOnly={pending}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
              <PasswordRules value={password} className="pt-1" />
            </>
          )}
        </ProgressiveField>
        <ProgressiveField label={t('confirmPassword')} required error={errors.confirmPassword}>
          {(field) => <PasswordInput {...field} name="confirmPassword" autoComplete="new-password" className="h-10" readOnly={pending} required />}
        </ProgressiveField>
        <Button type="submit" size="lg" className="mt-2 h-11 w-full" loading={pending}>
          {pending ? t('submitting') : invite ? t('inviteSubmit') : t('submit')}
        </Button>
      </form>
    </>
  );
}
