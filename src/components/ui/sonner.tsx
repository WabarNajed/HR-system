'use client';

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Toast host — themed with Oasis tokens and anchored at the inline end
 * (bottom-left in RTL, bottom-right in LTR). Use `toast.success(t(...))` / `toast.error(t(...))`.
 */
function Toaster({ dir = 'rtl', ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const t = useTranslations('common.toast');
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps['theme']) ?? 'system'}
      dir={dir}
      position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'}
      className="toaster group"
      closeButton
      visibleToasts={4}
      offset={16}
      mobileOffset={12}
      containerAriaLabel={t('region')}
      icons={{
        success: <CheckCircle2Icon className="size-4.5 text-success" />,
        info: <InfoIcon className="size-4.5 text-info" />,
        warning: <AlertTriangleIcon className="size-4.5 text-warning" />,
        error: <XCircleIcon className="size-4.5 text-danger" />,
        loading: <Loader2Icon className="size-4.5 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        closeButtonAriaLabel: t('close'),
        classNames: {
          toast:
            'group toast !rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-overlay !font-sans !gap-2.5 !py-3 !px-3.5',
          title: '!text-sm !font-semibold',
          description: '!text-meta !text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground !rounded-md !text-meta !font-medium',
          cancelButton: '!bg-muted !text-foreground !rounded-md !text-meta',
          closeButton: '!bg-popover !border-border !text-muted-foreground hover:!text-foreground',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-lg)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
