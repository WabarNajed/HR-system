'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type CopyButtonProps = Omit<ButtonProps, 'onClick' | 'value'> & {
  value: string;
  /** Visible label; icon-only when omitted. */
  label?: string;
};

/** Copies `value` to the clipboard with a transient check mark. */
export function CopyButton({ value, label, className, size, variant = 'ghost', ...props }: CopyButtonProps) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const Icon = copied ? CheckIcon : CopyIcon;
  const button = (
    <Button
      type="button"
      variant={variant}
      size={size ?? (label ? 'sm' : 'icon-xs')}
      onClick={copy}
      aria-label={label ?? (copied ? t('copied') : t('copyToClipboard'))}
      className={cn(copied && 'text-success', className)}
      {...props}
    >
      <Icon className={cn(!label && 'size-3.5')} />
      {label ? <span>{copied ? t('copied') : label}</span> : null}
    </Button>
  );
  return label ? button : <SimpleTooltip content={copied ? t('copied') : t('copyToClipboard')}>{button}</SimpleTooltip>;
}
