'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircleIcon, KeyRoundIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { updatePassword } from '../actions';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas';
import { AuthHeading } from './auth-heading';
import { PasswordInput } from './password-input';

export function ResetPasswordForm() {
  const t = useTranslations('auth.reset');
  const tRegister = useTranslations('auth.register');
  const resolveError = useErrorMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = (values: ResetPasswordInput) =>
    startTransition(async () => {
      setError(null);
      const result = await updatePassword(values);
      if (!result.ok) {
        setError(result.error);
        if (result.fieldErrors?.password) form.setError('password', { message: result.fieldErrors.password });
        return;
      }
      toast.success(t('success'));
      router.replace('/dashboard');
      router.refresh();
    });

  return (
    <>
      <AuthHeading icon={KeyRoundIcon} title={t('title')} description={t('subtitle')} />
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('password')}</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="new-password" className="h-10" disabled={pending} autoFocus />
                </FormControl>
                <FormDescription>{tRegister('passwordHint')}</FormDescription>
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
                  <PasswordInput {...field} autoComplete="new-password" className="h-10" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="mt-2 h-11 w-full" loading={pending}>
            {pending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </Form>
    </>
  );
}
