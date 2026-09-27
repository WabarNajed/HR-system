'use client';

import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { mergeSearchParams } from '@/lib/list-params';

/**
 * Quick-view sheet for a certificate request, driven by `?request=<id>` so the server renders the
 * certificate panel inside it. Closing removes the param (keeps the table's page/filters).
 */
export function RequestSheet({
  requestId,
  title,
  subtitle,
  children,
}: {
  requestId: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('certificates.sheet');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const close = () => {
    const next = mergeSearchParams(searchParams, { request: null, page: searchParams.get('page') });
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent side="end" className="w-full gap-0 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="border-b border-border px-5 pt-5 pb-4">
          <SheetTitle className="pe-8">{title ?? t('title')}</SheetTitle>
          {subtitle ? <SheetDescription asChild><div>{subtitle}</div></SheetDescription> : <SheetDescription className="sr-only">{t('title')}</SheetDescription>}
          <div className="pt-1">
            <Button asChild variant="outline" size="sm">
              <Link href={`/requests/${requestId}`}>
                <ExternalLinkIcon />
                {t('openFullRequest')}
              </Link>
            </Button>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
