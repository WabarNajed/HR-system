'use client';

import { AlertCircleIcon, CheckCircle2Icon, KeyRoundIcon, LogOutIcon, MonitorSmartphoneIcon, PhoneIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SectionCard } from '@/components/shared/section-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { signOut } from '@/features/auth/actions';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordRules } from '@/features/auth/components/password-rules';
import { ProgressiveField, useFormResultToast, useHydrated, useProgressiveForm } from '@/features/auth/components/progressive-form';
import { initialFormState, type FormActionState } from '@/features/auth/form-state';
import { changePasswordSchema } from '@/features/auth/schemas';
import { RelativeTime } from '@/features/users/components/relative-time';
import { changePasswordForm, saveAccountDetailsForm, signOutEverywhereAction } from '../actions';
import { accountDetailsSchema } from '../schemas';

/** Inline result for the no-JavaScript fallback (hydrated forms confirm with toasts). */
function NoScriptResult({ state }: { state: FormActionState<string, unknown> }) {
  const hydrated = useHydrated();
  const resolve = useErrorMessage();
  if (hydrated) return null;
  if (state.status === 'success') {
    return (
      <Alert variant="success">
        <CheckCircle2Icon />
        <AlertDescription>{resolve(state.message ?? 'common.saved')}</AlertDescription>
      </Alert>
    );
  }
  // Skip errors already explained next to a field (validation, wrong current password).
  if (state.error && state.error !== 'errors.validation' && !Object.values(state.fieldErrors).includes(state.error)) {
    return (
      <Alert variant="danger">
        <AlertCircleIcon />
        <AlertDescription>{resolve(state.error)}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

/**
 * Account details: e-mail (read-only), full name and mobile (self-editable). Progressive form: a plain
 * POST to the Server Action before hydration / without JavaScript.
 */
export function AccountDetailsForm({ email, fullName, mobile }: { email: string | null; fullName: string; mobile: string }) {
  const t = useTranslations('profile.account');
  const tc = useTranslations('common');
  const hydrated = useHydrated();
  const { state, formAction, pending, errors, onSubmit, onInput } = useProgressiveForm(
    accountDetailsSchema,
    saveAccountDetailsForm,
    initialFormState<'fullName' | 'mobile'>(),
  );
  const saved = { fullName: state.values.fullName ?? fullName, mobile: state.values.mobile ?? mobile };
  const [dirty, setDirty] = useState(false);
  useFormResultToast(state, { onSuccess: () => setDirty(false) });

  const trackDirty = (form: HTMLFormElement) => {
    const data = new FormData(form);
    setDirty(String(data.get('fullName') ?? '') !== saved.fullName || String(data.get('mobile') ?? '') !== saved.mobile);
  };

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<UserRoundIcon />}>
      <form
        action={formAction}
        onSubmit={onSubmit}
        onInput={(e) => {
          onInput(e);
          trackDirty(e.currentTarget);
        }}
        onReset={() => setDirty(false)}
        noValidate
        className="flex flex-col gap-4"
        aria-busy={pending}
      >
        <NoScriptResult state={state} />
        <div className="flex flex-col gap-1.5">
          <span className="text-meta leading-5 font-medium text-foreground">{tc('email')}</span>
          <bdi dir="ltr" className="flex h-9 items-center rounded-md border border-border bg-subtle px-3 text-sm text-muted-foreground">
            {email ?? '—'}
          </bdi>
          <span className="text-xs text-muted-foreground">{t('emailHint')}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProgressiveField label={t('fullName')} required error={errors.fullName}>
            {(field) => (
              <InputGroup {...field} name="fullName" autoComplete="name" start={<UserRoundIcon />} defaultValue={saved.fullName} readOnly={pending} required />
            )}
          </ProgressiveField>
          <ProgressiveField label={tc('mobile')} optional error={errors.mobile}>
            {(field) => (
              <InputGroup
                {...field}
                name="mobile"
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel"
                start={<PhoneIcon />}
                defaultValue={saved.mobile}
                readOnly={pending}
              />
            )}
          </ProgressiveField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="reset" variant="outline" size="sm" disabled={hydrated && (!dirty || pending)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" size="sm" loading={pending} disabled={hydrated && !dirty} className="min-w-24">
            {pending ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/**
 * Change password: current password (re-authentication) + new password with the live policy
 * checklist. Progressive form; the fields are cleared after every attempt (React form reset).
 */
export function ChangePasswordForm({ email }: { email: string | null }) {
  const t = useTranslations('profile.security');
  const formRef = useRef<HTMLFormElement>(null);
  const { state, formAction, pending, errors, onSubmit, onInput } = useProgressiveForm(
    changePasswordSchema,
    changePasswordForm,
    initialFormState<'currentPassword' | 'password' | 'confirmPassword'>(),
  );
  const [password, setPassword] = useState('');
  useFormResultToast(state, {
    onError: () => {
      if (state.fieldErrors.currentPassword || state.error === 'profile.security.currentIncorrect') {
        formRef.current?.querySelector<HTMLInputElement>('[name="currentPassword"]')?.focus();
      }
    },
  });

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<KeyRoundIcon />}>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={onSubmit}
        onInput={onInput}
        onReset={() => setPassword('')}
        noValidate
        className="flex max-w-xl flex-col gap-4"
        aria-busy={pending}
      >
        <NoScriptResult state={state} />
        {/* Lets password managers associate the new password with the account (not submitted). */}
        {email ? <input type="email" autoComplete="username" value={email} readOnly hidden /> : null}
        <ProgressiveField label={t('current')} required error={errors.currentPassword}>
          {(field) => <PasswordInput {...field} name="currentPassword" autoComplete="current-password" readOnly={pending} required />}
        </ProgressiveField>
        <div className="grid gap-4 sm:grid-cols-2">
          <ProgressiveField label={t('new')} required error={errors.password}>
            {(field) => (
              <PasswordInput {...field} name="password" autoComplete="new-password" readOnly={pending} onChange={(e) => setPassword(e.target.value)} required />
            )}
          </ProgressiveField>
          <ProgressiveField label={t('confirm')} required error={errors.confirmPassword}>
            {(field) => <PasswordInput {...field} name="confirmPassword" autoComplete="new-password" readOnly={pending} required />}
          </ProgressiveField>
        </div>
        <PasswordRules value={password} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending} className="min-w-32">
            {pending ? t('updating') : t('submit')}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** Submit button of the sign-out form (pending state from the enclosing form). */
function SignOutSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" loading={pending}>
      {!pending ? <LogOutIcon className="rtl:-scale-x-100" /> : null}
      {label}
    </Button>
  );
}

/** Current session info + sign out (this device / all devices). */
export function SessionsCard({ lastLoginAt }: { lastLoginAt: string | null }) {
  const t = useTranslations('profile.sessions');
  const resolve = useErrorMessage();

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<MonitorSmartphoneIcon />}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2.5 text-meta">
          <span className="text-muted-foreground">{t('lastSignIn')}</span>
          {lastLoginAt ? <RelativeTime value={lastLoginAt} className="font-medium text-foreground" /> : <span>—</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <form action={signOut}>
            <SignOutSubmit label={t('signOut')} />
          </form>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="w-full text-danger hover:bg-danger-soft hover:text-danger">
                <LogOutIcon className="rtl:-scale-x-100" />
                {t('signOutEverywhere')}
              </Button>
            }
            variant="danger"
            title={t('signOutEverywhereTitle')}
            description={t('signOutEverywhereDescription')}
            confirmLabel={t('signOutEverywhere')}
            onConfirm={async () => {
              // Success redirects to /login; only failures return here.
              const result = await signOutEverywhereAction({});
              if (result && !result.ok) {
                toast.error(resolve(result.error));
                return false;
              }
            }}
          />
        </div>
      </div>
    </SectionCard>
  );
}
