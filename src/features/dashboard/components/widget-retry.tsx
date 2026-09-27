'use client';

import { RotateCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

/** Re-renders the dashboard route (server widgets re-fetch). */
export function WidgetRetry() {
  const t = useTranslations('common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" size="sm" loading={pending} onClick={() => startTransition(() => router.refresh())}>
      {!pending ? <RotateCwIcon /> : null}
      {t('tryAgain')}
    </Button>
  );
}
