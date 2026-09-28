'use client';

import { AlertCircleIcon, BadgeCheckIcon, IdCardIcon, MailCheckIcon, MailIcon, PhoneIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { localeNames } from '@/lib/i18n/config';
import { registerWithForm } from '../form-actions';
import { initialFormState, type RegisterField, type RegisterFormState } from '../form-state';
import { registerSchema } from '../schemas';
import { AuthHeading } from './auth-heading';
import { PasswordInput } from './password-input';
import { PasswordRules } from './password-rules';
import { ProgressiveField, useProgressiveForm } from './progressive-form';

/**
 * Self-registration. Progressive: `<form action={…}>` bound to a Server Action, so a
 * submit before hydration / without JavaScript is a real POST (never a GET with the password in the
 * URL). Hydrated, the same zod schema validates first; the server validates again.
 */
export function RegisterForm() {
  const t = useTranslations('auth.register');
  const locale = useLocale() as 'ar' | 'en';
  const resolveError = useErrorMessage();
  const { state, formAction, pending, errors, onSubmit, onInput } = useProgressiveForm(
    registerSchema,
    registerWithForm,
    initialFormState<RegisterField, NonNullable<RegisterFormState['data']>>(),
  );
  const [password, setPassword] = useState('');
  const [language, setLanguage] = useState<'ar' | 'en'>(state.values.language === 'en' || state.values.language === 'ar' ? state.values.language : locale);
  const values = state.values;
  const fieldError = Object.values(errors).some(Boolean);
  const alertError = state.error && !(state.error === 'errors.validation' && fieldError) ? state.error : null;

  if (state.status === 'success' && state.data?.needsConfirmation) {
    return (
      <div>
        <AuthHeading icon={MailCheckIcon} tone="success" title={t('checkEmailTitle')} description={t('checkEmailDescription', { email: state.data.email })} />
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">{t('signIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      onInput={onInput}
      onReset={() => setPassword('')}
      noValidate
      className="flex flex-col gap-4"
      aria-busy={pending}
    >
      {alertError ? (
        <Alert variant="danger" aria-live="assertive">
          <AlertCircleIcon />
          <AlertDescription>{resolveError(alertError)}</AlertDescription>
        </Alert>
      ) : null}
      <ProgressiveField label={t('fullName')} required error={errors.fullName}>
        {(field) => (
          <InputGroup
            {...field}
            name="fullName"
            autoComplete="name"
            start={<UserRoundIcon />}
            placeholder={t('fullNamePlaceholder')}
            defaultValue={values.fullName ?? ''}
            readOnly={pending}
            required
          />
        )}
      </ProgressiveField>
      <ProgressiveField label={t('employeeNumber')} required description={t('employeeNumberHint')} error={errors.employeeNumber}>
        {(field) => (
          <InputGroup
            {...field}
            name="employeeNumber"
            dir="ltr"
            start={<IdCardIcon />}
            placeholder={t('employeeNumberPlaceholder')}
            defaultValue={values.employeeNumber ?? ''}
            readOnly={pending}
            required
          />
        )}
      </ProgressiveField>
      <div className="grid gap-4 sm:grid-cols-2">
        <ProgressiveField label={t('email')} required error={errors.email}>
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
              defaultValue={values.email ?? ''}
              readOnly={pending}
              required
            />
          )}
        </ProgressiveField>
        <ProgressiveField label={t('mobile')} required error={errors.mobile}>
          {(field) => (
            <InputGroup
              {...field}
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              start={<PhoneIcon />}
              placeholder={t('mobilePlaceholder')}
              defaultValue={values.mobile ?? ''}
              readOnly={pending}
              required
            />
          )}
        </ProgressiveField>
      </div>
      <ProgressiveField label={t('password')} required error={errors.password}>
        {(field) => (
          <>
            <PasswordInput
              {...field}
              name="password"
              autoComplete="new-password"
              readOnly={pending}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={[field['aria-describedby'], 'register-password-rules'].filter(Boolean).join(' ')}
              required
            />
            <PasswordRules id="register-password-rules" value={password} className="pt-1" />
          </>
        )}
      </ProgressiveField>
      <ProgressiveField label={t('confirmPassword')} required error={errors.confirmPassword}>
        {(field) => <PasswordInput {...field} name="confirmPassword" autoComplete="new-password" readOnly={pending} required />}
      </ProgressiveField>
      <div className="grid min-w-0 content-start gap-1.5">
        <span className="text-sm leading-none font-medium text-foreground">{t('language')}</span>
        <input type="hidden" name="language" value={language} />
        <div>
          <SegmentedTabs
            size="sm"
            value={language}
            onValueChange={(v) => setLanguage(v === 'en' ? 'en' : 'ar')}
            items={[
              { value: 'ar', label: <span lang="ar">{localeNames.ar}</span> },
              { value: 'en', label: <span lang="en">{localeNames.en}</span> },
            ]}
            aria-label={t('language')}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('languageHint')}</p>
      </div>
      <Button type="submit" size="lg" className="mt-2 h-11 w-full" loading={pending}>
        {!pending ? <BadgeCheckIcon /> : null}
        {pending ? t('submitting') : t('submit')}
      </Button>
      <p className="text-center text-meta text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </form>
  );
}
