'use client';

import { ArrowRightIcon, KeyRoundIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { certificateVerifyPath, normalizeVerificationCode } from '@/features/certificates/verification-code';

type Props = {
  defaultNumber?: string;
  defaultCode?: string;
  /** Focus the code field (the number is already known and only the code is missing or wrong). */
  focusCode?: boolean;
};

/**
 * Manual verification: certificate number + the verification code printed next to the QR code.
 * Navigates to /verify/<number>?code=<code>; without a code the page confirms only existence and status.
 */
export function VerifyLookup({ defaultNumber, defaultCode, focusCode }: Props) {
  const t = useTranslations('verify.lookup');
  const router = useRouter();
  const [number, setNumber] = useState(defaultNumber ?? '');
  const [code, setCode] = useState(defaultCode ?? '');
  const [pending, startTransition] = useTransition();
  const normalizedNumber = number.trim().toUpperCase();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!normalizedNumber) return;
        const normalizedCode = normalizeVerificationCode(code);
        startTransition(() => router.push(certificateVerifyPath(normalizedNumber, normalizedCode || null)));
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="verify-number" className="text-meta font-medium text-muted-foreground">
            {t('label')}
          </Label>
          <div className="relative" dir="ltr">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" aria-hidden />
            <Input
              id="verify-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={t('placeholder')}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              className="numeric ps-9 text-start uppercase placeholder:normal-case"
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="verify-code" className="text-meta font-medium text-muted-foreground">
            {t('codeLabel')}
          </Label>
          <div className="relative" dir="ltr">
            <KeyRoundIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint-foreground" aria-hidden />
            <Input
              id="verify-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('codePlaceholder')}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              autoFocus={focusCode}
              aria-describedby="verify-code-hint"
              className="numeric ps-9 text-start tracking-wide uppercase"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="verify-code-hint" className="text-meta text-muted-foreground">
          {t('codeHint')}
        </p>
        <Button type="submit" loading={pending} disabled={!normalizedNumber} className="shrink-0">
          {t('submit')}
          <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
