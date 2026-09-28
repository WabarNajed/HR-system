'use client';

import { AlertCircleIcon, ArrowLeftIcon, MailCheckIcon, MailIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { forgotPasswordWithForm } from '../form-actions';
import { initialFormState } from '../form-state';
import { forgotPasswordSchema } from '../schemas';
import { AuthHeading } from './auth-heading';
import { ProgressiveField, useProgressiveForm } from './progressive-form';

/** Request a password-reset link. Progressive: works as a plain POST before hydration / without JS. */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const resolveError = useErrorMessage();
  const { state, formAction, pending, errors, onSubmit, onInput } = useProgressiveForm(
    forgotPasswordSchema,
    forgotPasswordWithForm,
    initialFormState<'email', { email: string }>(),
  );
  const alertError = state.error && !(state.error === 'errors.validation' && errors.email) ? state.error : null;

  const back = (
    <Button asChild variant="ghost" className="w-full">
      <Link href="/login">
        <ArrowLeftIcon className="rtl:rotate-180" />
        {t('backToLogin')}
      </Link>
    </Button>
  );

  if (state.status === 'success') {
    const sentTo = state.data?.email ?? state.values.email ?? '';
    return (
      <div>
        <AuthHeading icon={MailCheckIcon} tone="success" title={t('sentTitle')} description={t('sentDescription', { email: sentTo })} />
        {back}
      </div>
    );
  }

  return (
    <>
      <AuthHeading title={t('title')} description={t('subtitle')} />
      <form method="POST" action={formAction} onSubmit={onSubmit} onInput={onInput} noValidate className="flex flex-col gap-4" aria-busy={pending}>
        {alertError ? (
          <Alert variant="danger" aria-live="assertive">
            <AlertCircleIcon />
            <AlertDescription>{resolveError(alertError)}</AlertDescription>
          </Alert>
        ) : null}
        <ProgressiveField label={t('email')} error={errors.email}>
          {(field) => (
            <InputGroup
              {...field}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              start={<MailIcon />}
              className="h-10"
              defaultValue={state.values.email ?? ''}
              readOnly={pending}
              autoFocus
              required
            />
          )}
        </ProgressiveField>
        <Button type="submit" size="lg" className="mt-2 h-11 w-full" loading={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
        {back}
      </form>
    </>
  );
}
