import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type AuthHeadingProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: 'primary' | 'warning' | 'danger' | 'success';
  className?: string;
};

const toneClass = {
  primary: 'bg-primary-soft text-primary',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
} as const;

/** Title block for auth pages (optional icon tile). */
export function AuthHeading({ title, description, icon: Icon, tone = 'primary', className }: AuthHeadingProps) {
  return (
    <div className={cn('mb-7', className)}>
      {Icon ? (
        <span className={cn('mb-5 flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ring-current/10', toneClass[tone])}>
          <Icon className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
      ) : null}
      <h1 className="text-[1.625rem] leading-9 font-semibold tracking-tight text-foreground">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
  );
}
