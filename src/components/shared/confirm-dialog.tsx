'use client';

import { AlertTriangleIcon, HelpCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { actionErrorKey } from './safe-action';

export type ConfirmDialogProps = {
  /** Uncontrolled usage: the element that opens the dialog. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** `danger` = red confirm + warning icon (delete, archive, reset). */
  variant?: 'default' | 'danger';
  /** Require typing this exact phrase to enable Confirm (e.g. "RESET ORGANIZATION"). */
  confirmationPhrase?: string;
  /**
   * Called on confirm. The dialog shows a spinner until it settles, then closes.
   * Return `false` (or throw) to keep it open (e.g. the action failed and showed a toast).
   */
  onConfirm: () => void | boolean | Promise<void | boolean>;
  /** Extra content (reason textarea, consequences list …). */
  children?: ReactNode;
};

/** Confirmation dialog for approve/reject/archive/delete/dangerous actions. */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  confirmationPhrase,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const t = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  const setOpen = (next: boolean) => {
    if (pending) return;
    if (!next) setTyped('');
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const phraseOk = !confirmationPhrase || typed.trim() === confirmationPhrase;
  const Icon = variant === 'danger' ? AlertTriangleIcon : HelpCircleIcon;

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        const result = await onConfirm();
        if (result !== false) {
          setTyped('');
          setInternalOpen(false);
          onOpenChange?.(false);
        }
      } catch (error) {
        // Keep the dialog open. A thrown Server Action (offline, 5xx, stale deployment) would otherwise
        // fail silently — callers only toast the `ActionResult` failures they receive.
        toast.error(tErrors(actionErrorKey(error).slice('errors.'.length) as 'generic'));
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              variant === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary',
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1 pt-0.5">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
          </div>
        </AlertDialogHeader>
        {children || confirmationPhrase ? (
          <div className="space-y-4 px-5 pb-4">
            {children}
            {confirmationPhrase ? (
              <div className="space-y-1.5">
                <Label htmlFor={inputId} className="font-normal text-muted-foreground">
                  {t('typeToConfirm', { phrase: confirmationPhrase })}
                </Label>
                <Input
                  id={inputId}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  className="font-mono text-meta"
                  placeholder={confirmationPhrase}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel ?? t('cancel')}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            loading={pending}
            disabled={!phraseOk}
            className="min-w-24"
          >
            {confirmLabel ?? t('confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
