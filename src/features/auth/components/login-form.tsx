'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircleIcon, CheckCircle2Icon, InfoIcon, MailIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { signIn } from '../actions';
import { loginSchema, type LoginInput } from '../schemas';
import { PasswordInput } from './password-input';

export type LoginNotice = 'sessionExpired' | 'linkExpired' | 'passwordUpdated' | 'signedOut';

export function LoginForm({ next, notice, allowRegister }: { next?: string; notice?: LoginNotice | null; allowRegister: boolean }) {
  const t = useTranslations('auth.login');
  const resolveError = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', next: next ?? '' },
    mode: 'onSubmit',
  });

  const onSubmit = (values: LoginInput) =>
    startTransition(async () => {
      setError(null);
      const result = await signIn(values);
      // Success redirects on the server; only failures return here.
      if (result && !result.ok) {
        setError(result.error);
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          if (field === 'email' || field === 'password') form.setError(field, { message: key });
        }
        if (result.error === 'errors.invalidCredentials') form.setFocus('password');
      }
    });

  const noticeAlert =
    !error && notice ? (
      <Alert variant={notice === 'passwordUpdated' || notice === 'signedOut' ? 'success' : notice === 'linkExpired' ? 'warning' : 'info'} className="mb-5">
        {notice === 'passwordUpdated' || notice === 'signedOut' ? <CheckCircle2Icon /> : <InfoIcon />}
        <AlertDescription>{t(notice)}</AlertDescription>
      </Alert>
    ) : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-busy={pending}>
        {noticeAlert}
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
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  dir="ltr"
                  start={<MailIcon />}
                  placeholder={t('emailPlaceholder')}
                  className="h-10"
                  disabled={pending}
                  autoFocus
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>{t('password')}</FormLabel>
                <Link href="/forgot-password" className="text-meta font-medium text-primary hover:underline" tabIndex={0}>
                  {t('forgotPassword')}
                </Link>
              </div>
              <FormControl>
                <PasswordInput {...field} autoComplete="current-password" placeholder={t('passwordPlaceholder')} className="h-10" disabled={pending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
    </Form>
  );
}
