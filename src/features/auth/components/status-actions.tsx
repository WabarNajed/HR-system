'use client';

import { LogOutIcon, RotateCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signOut } from '../actions';

function SignOutSubmit({ variant, className }: { variant: ButtonProps['variant']; className?: string }) {
  const t = useTranslations('auth');
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={cn('w-full', className)} loading={pending}>
      {!pending ? <LogOutIcon className="rtl:rotate-180" /> : null}
      {pending ? t('signingOut') : t('signOut')}
    </Button>
  );
}

/**
 * Sign-out button (server action: audit `auth.logout`, sign out, → /login). A form POST, so it also
 * works before hydration / without JavaScript.
 */
export function SignOutButton({ variant = 'outline', className }: { variant?: ButtonProps['variant']; className?: string }) {
  return (
    <form action={signOut} className={cn('flex', className)}>
      <SignOutSubmit variant={variant} />
    </form>
  );
}

/**
 * Re-checks the account status (server re-render redirects once HR activates the account). A real
 * link to the page, so without JavaScript it simply reloads it.
 */
export function RefreshStatusButton({ className }: { className?: string }) {
  const t = useTranslations('auth.pending');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button asChild className={className}>
      <a
        href="/pending-approval"
        aria-disabled={pending || undefined}
        onClick={(e) => {
          e.preventDefault();
          if (pending) return;
          startTransition(() => {
            router.refresh();
            toast.info(t('stillPending'));
          });
        }}
      >
        <RotateCwIcon className={pending ? 'animate-spin' : undefined} />
        {t('refresh')}
      </a>
    </Button>
  );
}
