'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircleIcon, BadgeCheckIcon, IdCardIcon, MailCheckIcon, MailIcon, PhoneIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { signUp } from '../actions';
import { registerSchema, type RegisterInput } from '../schemas';
import { AuthHeading } from './auth-heading';
import { PasswordInput } from './password-input';

const FIELDS = ['fullName', 'employeeNumber', 'email', 'mobile', 'password', 'confirmPassword'] as const;

export function RegisterForm() {
  const t = useTranslations('auth.register');
  const resolveError = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', employeeNumber: '', email: '', mobile: '', password: '', confirmPassword: '' },
  });

  const onSubmit = (values: RegisterInput) =>
    startTransition(async () => {
      setError(null);
      const result = await signUp(values);
      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          if ((FIELDS as readonly string[]).includes(field)) form.setError(field as (typeof FIELDS)[number], { message: key });
        }
        return;
      }
      setSentTo(result.data?.email ?? values.email);
    });

  if (sentTo) {
    return (
      <div>
        <AuthHeading icon={MailCheckIcon} tone="success" title={t('checkEmailTitle')} description={t('checkEmailDescription', { email: sentTo })} />
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">{t('signIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-busy={pending}>
        {error ? (
          <Alert variant="danger" aria-live="assertive">
            <AlertCircleIcon />
            <AlertDescription>{resolveError(error)}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t('fullName')}</FormLabel>
              <FormControl>
                <InputGroup {...field} autoComplete="name" start={<UserRoundIcon />} placeholder={t('fullNamePlaceholder')} disabled={pending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="employeeNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t('employeeNumber')}</FormLabel>
              <FormControl>
                <InputGroup {...field} dir="ltr" start={<IdCardIcon />} placeholder={t('employeeNumberPlaceholder')} disabled={pending} />
              </FormControl>
              <FormDescription>{t('employeeNumberHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('email')}</FormLabel>
                <FormControl>
                  <InputGroup {...field} type="email" inputMode="email" autoComplete="email" dir="ltr" start={<MailIcon />} disabled={pending} />
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
                <FormLabel required>{t('mobile')}</FormLabel>
                <FormControl>
                  <InputGroup
                    {...field}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    start={<PhoneIcon />}
                    placeholder={t('mobilePlaceholder')}
                    disabled={pending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t('password')}</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="new-password" disabled={pending} />
              </FormControl>
              <FormDescription>{t('passwordHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t('confirmPassword')}</FormLabel>
              <FormControl>
                <PasswordInput {...field} autoComplete="new-password" disabled={pending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
    </Form>
  );
}
