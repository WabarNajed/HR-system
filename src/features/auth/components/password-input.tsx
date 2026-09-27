'use client';

import { EyeIcon, EyeOffIcon, LockKeyholeIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';
import { InputGroup } from '@/components/ui/input-group';

/** Password field with a leading lock icon and a show/hide toggle (keyboard accessible). */
export function PasswordInput(props: Omit<ComponentProps<typeof InputGroup>, 'type' | 'start' | 'end'>) {
  const t = useTranslations('auth.login');
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup
      {...props}
      type={visible ? 'text' : 'password'}
      start={<LockKeyholeIcon />}
      interactiveEnd
      end={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          aria-pressed={visible}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      }
    />
  );
}
