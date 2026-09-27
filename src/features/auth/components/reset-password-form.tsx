'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircleIcon, KeyRoundIcon, PartyPopperIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { updatePassword } from '../actions';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas';
import { AuthHeading } from './auth-heading';
import { PasswordInput } from './password-input';
import { PasswordRules } from './password-rules';

/**
 * Sets the password of the signed-in account. `mode="invite"` is the first-time "Set your password"
 * step of an invitation; `mode="recovery"` is a password reset.
 */
export function ResetPasswordForm({ mode = 'recovery', email }: { mode?: 'invite' | 'recovery'; email?: string | null }) {
  const t = useTranslations('auth.reset');
  const resolveError = useErrorMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });
  const password = useWatch({ control: form.control, name: 'password' });
  const invite = mode === 'invite';

  const onSubmit = (values: ResetPasswordInput) =>
    startTransition(async () => {
      setError(null);
      const result = await updatePassword(values);
      if (!result.ok) {
        setError(result.error);
        if (result.fieldErrors?.password) form.setError('password', { message: result.fieldErrors.password });
        return;
      }
      toast.success(invite ? t('inviteSuccess') : t('success'));
      router.replace('/dashboard');
      router.refresh();
    });

  return (
    <>
      <AuthHeading
        icon={invite ? PartyPopperIcon : KeyRoundIcon}
        tone={invite ? 'success' : 'primary'}
        title={invite ? t('inviteTitle') : t('title')}
        description={invite ? t('inviteSubtitle') : t('subtitle')}
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-busy={pending}>
          {email ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-subtle px-3 py-2 text-meta">
              <span className="text-muted-foreground">{t('account')}</span>
              <bdi dir="ltr" className="truncate font-medium text-foreground">
                {email}
              </bdi>
            </div>
          ) : null}
          {error ? (
            <Alert variant="danger" aria-live="assertive">
              <AlertCircleIcon />
              <AlertDescription>{resolveError(error)}</AlertDescription>
            </Alert>
          ) : null}
          {/* Lets password managers associate the new password with the account. */}
          {email ? <input type="email" name="username" autoComplete="username" value={email} readOnly hidden /> : null}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t('password')}</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="new-password" className="h-10" disabled={pending} autoFocus />
                </FormControl>
                <PasswordRules value={password} className="pt-1" />
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
            {pending ? t('submitting') : invite ? t('inviteSubmit') : t('submit')}
          </Button>
        </form>
      </Form>
    </>
  );
}
