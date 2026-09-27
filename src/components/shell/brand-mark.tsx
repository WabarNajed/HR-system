import { cn, getInitials } from '@/lib/utils';

export type BrandMarkProps = {
  name: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  /** `onDark`: sits on the sidebar / brand panel (light ring, translucent tile). */
  tone?: 'onDark' | 'default';
  className?: string;
};

const sizes = {
  sm: 'size-8 rounded-md text-[0.8125rem]',
  md: 'size-9 rounded-lg text-sm',
  lg: 'size-12 rounded-xl text-lg',
} as const;

/** Organization logo, or a monogram tile derived from the portal name when no logo is set. */
export function BrandMark({ name, logoUrl, size = 'md', tone = 'default', className }: BrandMarkProps) {
  if (logoUrl) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden',
          sizes[size],
          tone === 'onDark' ? 'bg-white/95 p-1 shadow-xs' : 'bg-card p-1 ring-1 ring-border',
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- public branding asset from Supabase Storage */}
        <img src={logoUrl} alt="" className="size-full object-contain" />
      </span>
    );
  }
  const initials = getInitials(name, 1) || '•';
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden font-bold',
        sizes[size],
        tone === 'onDark'
          ? 'bg-gradient-to-br from-secondary to-[color-mix(in_oklab,var(--secondary)_70%,black)] text-secondary-foreground shadow-xs ring-1 ring-white/15'
          : 'bg-primary text-primary-foreground shadow-xs',
        className,
      )}
    >
      <span className="relative">{initials}</span>
    </span>
  );
}
