'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircleIcon, ArrowLeftIcon, MailCheckIcon, MailIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { requestPasswordReset } from '../actions';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../schemas';
import { AuthHeading } from './auth-heading';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const resolveError = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = (values: ForgotPasswordInput) =>
    startTransition(async () => {
      setError(null);
      const result = await requestPasswordReset(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSentTo(values.email);
    });

  const back = (
    <Button asChild variant="ghost" className="w-full">
      <Link href="/login">
        <ArrowLeftIcon className="rtl:rotate-180" />
        {t('backToLogin')}
      </Link>
    </Button>
  );

  if (sentTo) {
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
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-busy={pending}>
          {error ? (
            <Alert variant="danger" aria-live="assertive">
              <AlertCircleIcon />
              <AlertDescription>{resolveError(error)}</AlertDescription>
            </Alert>
          ) : null}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('email')}</FormLabel>
                <FormControl>
                  <InputGroup
                    {...field}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    dir="ltr"
                    start={<MailIcon />}
                    className="h-10"
                    disabled={pending}
                    autoFocus
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="mt-2 h-11 w-full" loading={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
          {back}
        </form>
      </Form>
    </>
  );
}
