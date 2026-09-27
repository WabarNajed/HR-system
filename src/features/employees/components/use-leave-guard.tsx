'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

/**
 * Unsaved-changes guard for long forms: the browser's own prompt on reload/close, and a confirm
 * dialog when an in-app link (sidebar, breadcrumbs, Cancel …) is clicked while the form is dirty.
 * Returns the dialog element to render next to the form.
 */
export function useLeaveGuard(dirty: boolean) {
  const t = useTranslations('common');
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page (hash jumps such as the section index) never leaves the form.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  return (
    <ConfirmDialog
      open={Boolean(target)}
      onOpenChange={(open) => !open && setTarget(null)}
      variant="danger"
      title={t('unsavedChanges')}
      description={t('unsavedChangesDescription')}
      confirmLabel={t('discardChanges')}
      onConfirm={() => {
        if (target) router.push(target);
      }}
    />
  );
}
