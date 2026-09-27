'use client';

import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const THEME_OPTIONS = [
  { value: 'light', icon: SunIcon, key: 'themeLight' },
  { value: 'dark', icon: MoonIcon, key: 'themeDark' },
  { value: 'system', icon: MonitorIcon, key: 'themeSystem' },
] as const;

/**
 * Light / dark / system switch. The trigger icon swaps with CSS (`dark:` variants) instead of
 * reading `resolvedTheme`, so server and client markup always match (no hydration mismatch).
 */
export function ThemeToggle({ className, align = 'end' }: { className?: string; align?: 'start' | 'end' | 'center' }) {
  const t = useTranslations('nav.header');
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <SimpleTooltip content={t('toggleTheme')}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('text-muted-foreground hover:text-foreground', className)} aria-label={t('toggleTheme')}>
            <SunIcon className="dark:hidden" />
            <MoonIcon className="hidden dark:block" />
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent align={align} className="min-w-40">
        {THEME_OPTIONS.map(({ value, icon: Icon, key }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} aria-checked={theme === value} role="menuitemradio">
            <Icon />
            <span className="flex-1">{t(key)}</span>
            {theme === value ? <CheckIcon className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
