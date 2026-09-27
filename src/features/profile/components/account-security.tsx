'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRoundIcon, LogOutIcon, MonitorSmartphoneIcon, PhoneIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { signOut } from '@/features/auth/actions';
import { PasswordInput } from '@/features/auth/components/password-input';
import { PasswordRules } from '@/features/auth/components/password-rules';
import { changePasswordSchema, type ChangePasswordInput } from '@/features/auth/schemas';
import { RelativeTime } from '@/features/users/components/relative-time';
import { useActionFeedback } from '@/features/users/components/use-action-feedback';
import { changePasswordAction, signOutEverywhereAction, updateAccountDetailsAction } from '../actions';
import { accountDetailsSchema, type AccountDetailsInput } from '../schemas';

/** Account details: e-mail (read-only), full name and mobile (self-editable). */
export function AccountDetailsForm({ email, fullName, mobile }: { email: string | null; fullName: string; mobile: string }) {
  const t = useTranslations('profile.account');
  const tc = useTranslations('common');
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<AccountDetailsInput>({ resolver: zodResolver(accountDetailsSchema), defaultValues: { fullName, mobile } });
  const dirty = form.formState.isDirty;

  const onSubmit = (values: AccountDetailsInput) =>
    startTransition(async () => {
      const result = await run(updateAccountDetailsAction(values));
      if (result.ok) form.reset(values);
    });

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<UserRoundIcon />}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-busy={pending}>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{tc('email')}</span>
            <bdi dir="ltr" className="flex h-9 items-center rounded-md border border-border bg-subtle px-3 text-sm text-muted-foreground">
              {email ?? '—'}
            </bdi>
            <span className="text-xs text-muted-foreground">{t('emailHint')}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('fullName')}</FormLabel>
                  <FormControl>
                    <InputGroup {...field} autoComplete="name" start={<UserRoundIcon />} disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mobile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel optional>{tc('mobile')}</FormLabel>
                  <FormControl>
                    <InputGroup {...field} type="tel" inputMode="tel" dir="ltr" autoComplete="tel" start={<PhoneIcon />} disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => form.reset()} disabled={!dirty || pending}>
              {tc('cancel')}
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={!dirty} className="min-w-24">
              {pending ? tc('saving') : tc('saveChanges')}
            </Button>
          </div>
        </form>
      </Form>
    </SectionCard>
  );
}

/** Change password: current password (re-authentication) + new password with the live policy checklist. */
export function ChangePasswordForm({ email }: { email: string | null }) {
  const t = useTranslations('profile.security');
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });
  const password = useWatch({ control: form.control, name: 'password' });

  const onSubmit = (values: ChangePasswordInput) =>
    startTransition(async () => {
      const result = await run(changePasswordAction(values), { refresh: false });
      if (result.ok) {
        form.reset();
        return;
      }
      for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'currentPassword' || field === 'password' || field === 'confirmPassword') form.setError(field, { message: key });
      }
      if (result.error === 'profile.security.currentIncorrect') form.setFocus('currentPassword');
    });

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<KeyRoundIcon />}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex max-w-xl flex-col gap-4" aria-busy={pending}>
          {email ? <input type="email" name="username" autoComplete="username" value={email} readOnly hidden /> : null}
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('current')}</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="current-password" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('new')}</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="new-password" disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t('confirm')}</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="new-password" disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <PasswordRules value={password} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={pending} className="min-w-32">
              {pending ? t('updating') : t('submit')}
            </Button>
          </div>
        </form>
      </Form>
    </SectionCard>
  );
}

/** Current session info + sign out (this device / all devices). */
export function SessionsCard({ lastLoginAt }: { lastLoginAt: string | null }) {
  const t = useTranslations('profile.sessions');
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();

  return (
    <SectionCard title={t('title')} description={t('description')} icon={<MonitorSmartphoneIcon />}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-md bg-subtle px-3 py-2.5 text-meta">
          <span className="text-muted-foreground">{t('lastSignIn')}</span>
          {lastLoginAt ? <RelativeTime value={lastLoginAt} className="font-medium text-foreground" /> : <span>—</span>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="flex-1" loading={pending} onClick={() => startTransition(async () => signOut())}>
            {!pending ? <LogOutIcon className="rtl:-scale-x-100" /> : null}
            {t('signOut')}
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="flex-1 text-danger hover:bg-danger-soft hover:text-danger">
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
