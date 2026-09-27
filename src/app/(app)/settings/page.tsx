import { ChevronRightIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS, SETTINGS_HOME_CARDS, SETTINGS_ITEMS_BY_KEY } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { checkAccess } from '@/lib/permissions';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.title');

const chevron = 'size-4 shrink-0 text-faint-foreground transition-transform rtl:rotate-180';

/** Settings console home: grouped cards (PRODUCT-SPEC §16) linking to each section the user may open. */
export default async function SettingsHomePage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings']);
  const t = await getTranslations('nav.settings');
  const cards = SETTINGS_HOME_CARDS.map((card) => ({
    ...card,
    items: card.items.filter((key) => checkAccess(ctx, SETTINGS_ITEMS_BY_KEY[key].access)),
  })).filter((card) => card.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="columns-1 gap-4 md:columns-2 2xl:columns-3 [&>*]:mb-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const single = card.items.length === 1 ? SETTINGS_ITEMS_BY_KEY[card.items[0]!] : null;
          const header = (
            <div className="flex items-start gap-3 px-5 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-inset ring-current/10">
                <Icon className="size-[1.125rem]" strokeWidth={1.8} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-card-title text-foreground">{t(`cards.${card.key}`)}</h2>
                <p className="mt-0.5 text-meta text-muted-foreground">
                  {single ? t(`descriptions.${single.key}`) : t(`cardDescriptions.${card.key}`)}
                </p>
              </div>
              {single ? <ChevronRightIcon className={`${chevron} mt-2.5 group-hover:text-primary`} aria-hidden /> : null}
            </div>
          );

          if (single) {
            return (
              <Link
                key={card.key}
                href={single.href}
                data-settings-card={card.key}
                className="group block break-inside-avoid rounded-lg border border-border bg-card shadow-card transition-colors outline-none hover:border-border-strong hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {header}
              </Link>
            );
          }

          return (
            <section key={card.key} data-settings-card={card.key} className="break-inside-avoid rounded-lg border border-border bg-card shadow-card">
              {header}
              <ul className="border-t border-border px-2 py-1.5">
                {card.items.map((key) => {
                  const item = SETTINGS_ITEMS_BY_KEY[key];
                  const ItemIcon = item.icon;
                  return (
                    <li key={key}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <ItemIcon className="size-4 shrink-0 text-faint-foreground group-hover:text-primary" strokeWidth={1.85} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">{t(`items.${key}`)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{t(`descriptions.${key}`)}</span>
                        </span>
                        <ChevronRightIcon className={`${chevron} group-hover:text-primary`} aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
