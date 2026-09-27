'use client';

import { ArrowRightIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** "Verify another certificate": navigates to /verify/<number>. */
export function VerifyLookup({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations('verify.lookup');
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? '');
  const [pending, startTransition] = useTransition();
  const normalized = value.trim().toUpperCase();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!normalized) return;
        startTransition(() => router.push(`/verify/${encodeURIComponent(normalized)}`));
      }}
    >
      <Label htmlFor="verify-number" className="text-meta font-medium text-muted-foreground">
        {t('label')}
      </Label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" aria-hidden />
          <Input
            id="verify-number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('placeholder')}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            className="numeric ps-9 text-start uppercase placeholder:normal-case"
          />
        </div>
        <Button type="submit" loading={pending} disabled={!normalized} className="shrink-0">
          {t('submit')}
          <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
