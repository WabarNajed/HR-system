'use client';

import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/shared/copy-button';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { revealEmployeeIban } from '../../actions';

/** Masked IBAN (`•••• 7519`); permitted viewers can reveal the full value (audited server-side). */
export function IbanReveal({ employeeId, masked, audited }: { employeeId: string; masked: string; audited: boolean }) {
  const t = useTranslations('employees.profile.personal');
  const resolve = useErrorMessage();
  const [full, setFull] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reveal = () =>
    startTransition(async () => {
      const result = await revealEmployeeIban({ id: employeeId });
      if (!result.ok || !result.data) {
        toast.error(resolve(result.ok ? 'errors.generic' : result.error));
        return;
      }
      setFull(result.data.iban);
    });

  const button = full ? (
    <Button type="button" variant="ghost" size="icon-xs" onClick={() => setFull(null)} aria-label={t('hide')}>
      <EyeOffIcon />
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="sm" onClick={reveal} loading={pending} className="h-7 px-2">
      <EyeIcon />
      {t('reveal')}
    </Button>
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <bdi dir="ltr" className="font-mono text-sm tracking-wide text-foreground tabular-nums">
        {full ?? masked}
      </bdi>
      {audited && !full ? <SimpleTooltip content={t('revealHint')}>{button}</SimpleTooltip> : button}
      {full ? <CopyButton value={full.replace(/\s+/g, '')} size="icon-xs" /> : null}
    </span>
  );
}
