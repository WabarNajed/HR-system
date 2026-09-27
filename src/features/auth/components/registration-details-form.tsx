'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IdCardIcon, PencilIcon, PhoneIcon, SendIcon, UserRoundIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { Textarea } from '@/components/ui/textarea';
import { updateRegistrationDetails } from '../registration-actions';
import { registrationDetailsSchema, type RegistrationDetailsInput } from '../schemas';

type Props = {
  defaults: { fullName: string; employeeNumber: string; mobile: string; note: string };
  /** Answering an information request (form open, "Resubmit"); otherwise a collapsible edit. */
  infoRequested: boolean;
};

/** Applicant updates their registration details (answers HR's information request → back to review). */
export function RegistrationDetailsForm({ defaults, infoRequested }: Props) {
  const t = useTranslations('auth.pending');
  const tr = useTranslations('auth.register');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(infoRequested);
  const [pending, startTransition] = useTransition();
  const form = useForm<RegistrationDetailsInput>({ resolver: zodResolver(registrationDetailsSchema), defaultValues: defaults });

  const onSubmit = (values: RegistrationDetailsInput) =>
    startTransition(async () => {
      const result = await updateRegistrationDetails(values);
      if (!result.ok) {
        toast.error(resolve(result.error));
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          if (field in defaults) form.setError(field as keyof RegistrationDetailsInput, { message: key });
        }
        return;
      }
      toast.success(resolve(result.message ?? 'common.saved'));
      if (!infoRequested) setOpen(false);
      router.refresh();
    });

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setOpen(true)}>
        <PencilIcon />
        {t('editDetails')}
      </Button>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-border bg-card p-4 shadow-card">
      <h2 className="text-card-title text-foreground">{infoRequested ? t('updateTitle') : t('editDetails')}</h2>
      <p className="mt-0.5 text-meta text-muted-foreground">{infoRequested ? t('updateDescription') : t('editDescription')}</p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-4 flex flex-col gap-3.5" aria-busy={pending}>
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{tr('fullName')}</FormLabel>
                <FormControl>
                  <InputGroup {...field} autoComplete="name" start={<UserRoundIcon />} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="employeeNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{tr('employeeNumber')}</FormLabel>
                  <FormControl>
                    <InputGroup {...field} dir="ltr" start={<IdCardIcon />} disabled={pending} />
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
                  <FormLabel required>{tr('mobile')}</FormLabel>
                  <FormControl>
                    <InputGroup {...field} type="tel" inputMode="tel" dir="ltr" start={<PhoneIcon />} disabled={pending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel optional>{t('noteToHr')}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} maxLength={1000} placeholder={t('notePlaceholder')} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!infoRequested ? (
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {tc('cancel')}
              </Button>
            ) : null}
            <Button type="submit" loading={pending} className="min-w-32">
              {!pending ? <SendIcon className="rtl:-scale-x-100" /> : null}
              {infoRequested ? t('resubmit') : tc('saveChanges')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
