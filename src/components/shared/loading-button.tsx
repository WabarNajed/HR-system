'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui/button';

export type LoadingButtonProps = ButtonProps & {
  /** Explicit pending state (e.g. from useTransition). When omitted and type="submit",
   * the button follows the enclosing <form action>'s pending status. */
  pending?: boolean;
  /** Label while pending (defaults to children). */
  pendingText?: ReactNode;
};

/** Button with spinner + disabled state while an action runs. Pair with `useTransition`. */
export function LoadingButton({ pending, pendingText, children, type = 'button', ...props }: LoadingButtonProps) {
  const status = useFormStatus();
  const isPending = pending ?? (type === 'submit' ? status.pending : false);
  return (
    <Button type={type} loading={isPending} {...props}>
      {isPending && pendingText ? pendingText : children}
    </Button>
  );
}
