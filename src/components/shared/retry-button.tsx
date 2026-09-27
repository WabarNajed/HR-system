'use client';

import { RotateCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

/** Refreshes the current route (server components re-render). `labels` are joined with " · ". */
export function RetryButton({ labels, onRetry }: { labels: string[]; onRetry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() =>
        startTransition(() => {
          onRetry?.();
          router.refresh();
        })
      }
    >
      {!pending ? <RotateCwIcon /> : null}
      {labels.join(' · ')}
    </Button>
  );
}
