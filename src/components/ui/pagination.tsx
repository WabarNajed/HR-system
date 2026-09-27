import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, MoreHorizontalIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { buttonVariants, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Low-level pagination primitives (links or buttons). Labels are passed by the caller
 * (translated); directional icons mirror in RTL. The DataTable uses its own footer built on these.
 */
function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return <nav role="navigation" data-slot="pagination" className={cn('flex', className)} {...props} />;
}

function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
  return <ul data-slot="pagination-content" className={cn('flex flex-row items-center gap-1', className)} {...props} />;
}

function PaginationItem(props: ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = { isActive?: boolean } & Pick<ButtonProps, 'size'> & ComponentProps<'a'>;

function PaginationLink({ className, isActive, size = 'icon-sm', ...props }: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }),
        'numeric',
        isActive && 'border-primary/40 text-primary',
        className,
      )}
      {...props}
    />
  );
}

type DirectionalProps = ComponentProps<typeof PaginationLink> & { label: string; showLabel?: boolean };

function PaginationPrevious({ className, label, showLabel = true, ...props }: DirectionalProps) {
  return (
    <PaginationLink aria-label={label} size="sm" className={cn('gap-1 px-2.5', className)} {...props}>
      <ChevronLeftIcon className="rtl:rotate-180" />
      {showLabel ? <span className="hidden sm:block">{label}</span> : null}
    </PaginationLink>
  );
}

function PaginationNext({ className, label, showLabel = true, ...props }: DirectionalProps) {
  return (
    <PaginationLink aria-label={label} size="sm" className={cn('gap-1 px-2.5', className)} {...props}>
      {showLabel ? <span className="hidden sm:block">{label}</span> : null}
      <ChevronRightIcon className="rtl:rotate-180" />
    </PaginationLink>
  );
}

function PaginationFirst({ label, ...props }: Omit<DirectionalProps, 'showLabel'>) {
  return (
    <PaginationLink aria-label={label} title={label} {...props}>
      <ChevronsLeftIcon className="rtl:rotate-180" />
    </PaginationLink>
  );
}

function PaginationLast({ label, ...props }: Omit<DirectionalProps, 'showLabel'>) {
  return (
    <PaginationLink aria-label={label} title={label} {...props}>
      <ChevronsRightIcon className="rtl:rotate-180" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, label, ...props }: ComponentProps<'span'> & { label?: string }) {
  return (
    <span aria-hidden data-slot="pagination-ellipsis" className={cn('flex size-8 items-center justify-center', className)} {...props}>
      <MoreHorizontalIcon className="size-4 text-muted-foreground" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** Page numbers with ellipses: e.g. [1, '…', 4, 5, 6, '…', 12]. */
export function paginationRange(page: number, pages: number, siblings = 1): (number | 'ellipsis')[] {
  const total = siblings * 2 + 5;
  if (pages <= total) return Array.from({ length: pages }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, pages);
  const showLeftDots = left > 2;
  const showRightDots = right < pages - 1;
  if (!showLeftDots && showRightDots) {
    const count = 3 + 2 * siblings;
    return [...Array.from({ length: count }, (_, i) => i + 1), 'ellipsis', pages];
  }
  if (showLeftDots && !showRightDots) {
    const count = 3 + 2 * siblings;
    return [1, 'ellipsis', ...Array.from({ length: count }, (_, i) => pages - count + i + 1)];
  }
  return [1, 'ellipsis', ...Array.from({ length: right - left + 1 }, (_, i) => left + i), 'ellipsis', pages];
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
