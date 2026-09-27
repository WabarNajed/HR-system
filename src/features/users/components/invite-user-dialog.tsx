'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailIcon, SendIcon, UserRoundIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { localeNames } from '@/lib/i18n/config';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { inviteUserAction } from '../actions';
import { inviteUserSchema, type InviteUserInput } from '../schemas';
import type { RoleOption } from '../types';
import { EmployeePicker, type PickedEmployee } from './employee-picker';
import { RoleChecklist } from './role-checklist';
import { useActionFeedback } from './use-action-feedback';

export type InviteDefaults = { email?: string | null; fullName?: string | null; employee?: PickedEmployee | null };

type InviteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: readonly RoleOption[];
  isSuperAdmin: boolean;
  defaults?: InviteDefaults;
  /** Hide the employee picker (the card already fixes the employee). */
  lockEmployee?: boolean;
};

/** Invite a user: e-mail, name, roles, optional employee link and e-mail language. */
export function InviteUserDialog({ open, onOpenChange, roles, isSuperAdmin, defaults, lockEmployee }: InviteUserDialogProps) {
  const t = useTranslations('users.invite');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();

  const initial = (): InviteUserInput => ({
    email: defaults?.email ?? '',
    fullName: defaults?.fullName ?? '',
    roleKeys: ['employee'],
    employeeId: defaults?.employee?.id ?? null,
    locale,
  });
  const form = useForm<InviteUserInput>({ resolver: zodResolver(inviteUserSchema), defaultValues: initial() });

  useEffect(() => {
    if (open) form.reset(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open]);

  const onSubmit = (values: InviteUserInput) =>
    startTransition(async () => {
      const result = await run(inviteUserAction(values), { warnOn: ['users.toast.invitedNoEmail'] });
      if (result.ok) {
        onOpenChange(false);
        return;
      }
      for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'email' || field === 'fullName' || field === 'roleKeys' || field === 'employeeId') form.setError(field, { message: key });
      }
    });

  const selectableRoles = roles.filter((r) => r.key !== 'super_admin' || isSuperAdmin);

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col" aria-busy={pending}>
            <DialogBody className="flex flex-col gap-4 pb-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('email')}</FormLabel>
                      <FormControl>
                        <InputGroup {...field} type="email" inputMode="email" autoComplete="off" dir="ltr" start={<MailIcon />} placeholder={t('emailPlaceholder')} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fullName')}</FormLabel>
                      <FormControl>
                        <InputGroup {...field} autoComplete="off" start={<UserRoundIcon />} disabled={pending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {!lockEmployee ? (
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel optional>{t('employee')}</FormLabel>
                      <FormControl>
                        <EmployeePicker
                          value={field.value ?? null}
                          selected={defaults?.employee ?? null}
                          disabled={pending}
                          onChange={(picked) => {
                            field.onChange(picked?.id ?? null);
                            if (picked && !form.getValues('fullName')) form.setValue('fullName', picked.label, { shouldValidate: true });
                          }}
                        />
                      </FormControl>
                      <FormDescription>{t('employeeHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="roleKeys"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('roles')}</FormLabel>
                    <RoleChecklist roles={selectableRoles} value={field.value} onChange={field.onChange} isSuperAdmin={isSuperAdmin} disabled={pending} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="locale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('language')}</FormLabel>
                    <div>
                      <SegmentedTabs
                        size="sm"
                        value={field.value}
                        onValueChange={(v) => field.onChange(v)}
                        items={[
                          { value: 'ar', label: <span lang="ar">{localeNames.ar}</span> },
                          { value: 'en', label: <span lang="en">{localeNames.en}</span> },
                        ]}
                        aria-label={t('language')}
                      />
                    </div>
                    <FormDescription>{t('languageHint')}</FormDescription>
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter className="mt-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={pending} className="min-w-32">
                {!pending ? <SendIcon className="rtl:-scale-x-100" /> : null}
                {pending ? t('sending') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
