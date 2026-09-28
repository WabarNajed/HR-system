'use client';

import { AlertCircleIcon, CheckCircle2Icon, InfoIcon, MailIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/features/auth/components/password-input';
import { signInWithForm, type LoginFormState } from './actions';
import type { LoginNotice } from './notice';

const INITIAL: LoginFormState = { error: null, fieldErrors: {}, email: '' };

/**
 * Sign-in form. Progressive enhancement: `<form action={serverAction}>` — React itself renders
 * `method="POST"` + the action id for a Server Action (setting `method` here is a React error), so a
 * submit before hydration POSTs to the Server Action —
 * e-mail and password are never put in a URL. Uncontrolled inputs keep what the user typed across
 * a failed attempt; field errors and the alert come back from the server as i18n keys.
 */
export function LoginForm({ next, notice, allowRegister }: { next?: string; notice?: LoginNotice | null; allowRegister: boolean }) {
  const t = useTranslations('auth.login');
  const resolveError = useErrorMessage();
  const [state, formAction, pending] = useActionState(signInWithForm, { ...INITIAL });
  const passwordRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const { error, fieldErrors } = state;
  // A validation failure is explained next to the fields; other failures get the alert.
  const alertError = error && !(error === 'errors.validation' && (fieldErrors.email || fieldErrors.password)) ? error : null;

  useEffect(() => {
    if (!error) return;
    if (fieldErrors.email) emailRef.current?.focus();
    else passwordRef.current?.focus();
  }, [state, error, fieldErrors.email]);

  const noticeTone = notice === 'passwordUpdated' || notice === 'signedOut' ? 'success' : notice === 'linkExpired' ? 'warning' : 'info';

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="next" value={next ?? ''} />

      {!error && notice ? (
        <Alert variant={noticeTone} className="mb-1">
          {noticeTone === 'success' ? <CheckCircle2Icon /> : <InfoIcon />}
          <AlertDescription>{t(notice)}</AlertDescription>
        </Alert>
      ) : null}
      {alertError ? (
        <Alert variant="danger" aria-live="assertive">
          <AlertCircleIcon />
          <AlertDescription>{resolveError(alertError)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="login-email">{t('email')}</Label>
        <InputGroup
          ref={emailRef}
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          start={<MailIcon />}
          placeholder={t('emailPlaceholder')}
          className="h-10"
          defaultValue={state.email}
          readOnly={pending}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
          autoFocus
          required
        />
        {fieldErrors.email ? (
          <p id="login-email-error" className="text-xs font-medium text-danger">
            {resolveError(fieldErrors.email)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="login-password">{t('password')}</Label>
          <Link href="/forgot-password" className="text-meta font-medium text-primary hover:underline">
            {t('forgotPassword')}
          </Link>
        </div>
        <PasswordInput
          ref={passwordRef}
          id="login-password"
          name="password"
          autoComplete="current-password"
          placeholder={t('passwordPlaceholder')}
          className="h-10"
          readOnly={pending}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
          required
        />
        {fieldErrors.password ? (
          <p id="login-password-error" className="text-xs font-medium text-danger">
            {resolveError(fieldErrors.password)}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="mt-2 h-11 w-full text-[0.9375rem]" loading={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>

      {allowRegister ? (
        <p className="mt-2 text-center text-meta text-muted-foreground">
          {t('noAccount')}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {t('register')}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
