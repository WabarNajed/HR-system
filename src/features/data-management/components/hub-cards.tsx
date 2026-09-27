import {
  ChevronRightIcon,
  DatabaseIcon,
  FileDownIcon,
  FileSpreadsheetIcon,
  FileWarningIcon,
  HistoryIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

type Card = { key: 'importEmployees' | 'importMasterData' | 'exportData' | 'downloadTemplates' | 'importHistory' | 'errorReports'; href: string; icon: LucideIcon; tone: string; disabled?: boolean };

/** Quick-action tiles (PRODUCT-SPEC §7): import employees / master data, export, templates, history, error reports. */
export async function HubCards({ canEmployees, canMaster }: { canEmployees: boolean; canMaster: boolean }) {
  const t = await getTranslations('dataManagement.hub.cards');
  const cards: Card[] = [
    { key: 'importEmployees', href: '/admin/data-management/import?type=employees', icon: UsersIcon, tone: 'bg-primary-soft text-primary', disabled: !canEmployees },
    { key: 'importMasterData', href: '/admin/data-management/import?group=master', icon: DatabaseIcon, tone: 'bg-secondary-soft text-secondary-soft-foreground', disabled: !canMaster },
    { key: 'exportData', href: '/admin/data-management?tab=export', icon: FileDownIcon, tone: 'bg-info-soft text-info' },
    { key: 'downloadTemplates', href: '/admin/data-management?tab=templates', icon: FileSpreadsheetIcon, tone: 'bg-success-soft text-success' },
    { key: 'importHistory', href: '/admin/data-management?tab=history', icon: HistoryIcon, tone: 'bg-muted text-muted-foreground' },
    { key: 'errorReports', href: '/admin/data-management?tab=history&errors=1', icon: FileWarningIcon, tone: 'bg-danger-soft text-danger' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards
        .filter((c) => !c.disabled)
        .map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.key}
              href={card.href}
              data-dm-card={card.key}
              className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 shadow-card transition-[border-color,box-shadow] outline-none hover:border-border-strong hover:shadow-raised focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:px-4 sm:py-3.5"
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-current/10 ring-inset sm:size-10', card.tone)}>
                <Icon className="size-[1.125rem] sm:size-5" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm leading-snug font-semibold text-foreground sm:truncate sm:text-card-title">{t(`${card.key}.title`)}</span>
                <span className="mt-0.5 line-clamp-2 hidden text-meta text-muted-foreground sm:block">{t(`${card.key}.description`)}</span>
              </span>
              <ChevronRightIcon className="hidden size-4 shrink-0 text-faint-foreground transition-transform group-hover:text-primary sm:block rtl:rotate-180" aria-hidden />
            </Link>
          );
        })}
    </div>
  );
}
