'use client';

import { LogOutIcon, RotateCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { signOut } from '../actions';

/** Sign-out button (server action: audit `auth.logout`, sign out, → /login). */
export function SignOutButton({ variant = 'outline', className }: { variant?: ButtonProps['variant']; className?: string }) {
  const t = useTranslations('auth');
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      className={className}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
        })
      }
    >
      {!pending ? <LogOutIcon className="rtl:rotate-180" /> : null}
      {pending ? t('signingOut') : t('signOut')}
    </Button>
  );
}

/** Re-checks the account status (server re-render redirects once HR activates the account). */
export function RefreshStatusButton({ className }: { className?: string }) {
  const t = useTranslations('auth.pending');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className={className}
      loading={pending}
      onClick={() =>
        startTransition(() => {
          router.refresh();
          toast.info(t('stillPending'));
        })
      }
    >
      {!pending ? <RotateCwIcon /> : null}
      {t('refresh')}
    </Button>
  );
}
