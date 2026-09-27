import { EyeIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { Button } from '@/components/ui/button';
import { BrandingEditor } from '@/features/branding/components/branding-editor';
import type { PreviewStrings } from '@/features/branding/components/brand-preview';
import { getBrandingSettings } from '@/features/branding/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { getTranslator } from '@/lib/i18n/translator';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.branding');

/** Preview labels in one language (the preview can switch language independently of the UI). */
function previewStrings(locale: Locale): PreviewStrings {
  const t = getTranslator(locale);
  return {
    dashboard: t('nav.items.dashboard'),
    employees: t('nav.items.employees'),
    requests: t('nav.items.requests'),
    approvals: t('nav.items.approvals'),
    leave: t('nav.items.leave'),
    search: t('nav.header.search'),
    newRequest: t('nav.header.newRequest'),
    approve: t('common.approve'),
    return: t('common.return'),
    approved: t('statuses.request.approved'),
    pending: t('settings.branding.preview.pending'),
    viewAll: t('common.viewAll'),
    recent: t('settings.branding.preview.recent'),
    signInTitle: t('auth.login.title'),
    signInSubtitle: t('auth.login.subtitle'),
    email: t('auth.login.email'),
    password: t('auth.login.password'),
    signIn: t('auth.login.submit'),
    forgot: t('auth.login.forgotPassword'),
    defaultLoginTitle: t('auth.brand.defaultTitle'),
    defaultLoginSubtitle: t('auth.brand.defaultSubtitle'),
    secure: t('auth.brand.secure'),
    highlightRequests: t('auth.brand.highlights.requests'),
    highlightLeave: t('auth.brand.highlights.leave'),
    letterSubject: t('settings.branding.preview.letterSubject'),
    letterDate: t('common.date'),
    letterRef: t('settings.branding.preview.letterRef'),
    signatory: t('settings.branding.preview.signatory'),
    signature: t('settings.branding.fields.signature'),
    stamp: t('settings.branding.fields.stamp'),
    cr: t('settings.branding.preview.cr'),
    vat: t('settings.branding.preview.vat'),
  };
}

/** Settings › General › Branding: portal identity, colours, sign-in page, stamp & signature + live preview. */
export default async function SettingsBrandingPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/branding']);
  const [t, supabase] = await Promise.all([getTranslations('settings.branding'), createClient()]);
  const data = await getBrandingSettings(supabase);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        title={t('title')}
        description={t('description')}
        actions={
          <>
            {data.updatedAt ? (
              <span className="text-meta text-muted-foreground">{t('lastUpdated', { date: formatDateTime(data.updatedAt, ctx.locale) })}</span>
            ) : null}
            <Button asChild variant="outline" size="sm" className="xl:hidden">
              <a href="#brand-preview">
                <EyeIcon />
                {t('preview.jump')}
              </a>
            </Button>
          </>
        }
      />
      <BrandingEditor
        defaultValues={data.values}
        images={{
          logo: data.images.logo.url,
          loginImage: data.images.loginImage.url,
          stamp: data.images.stamp.url,
          signature: data.images.signature.url,
        }}
        company={data.company}
        canEdit={can(ctx, 'settings.edit')}
        canAdminister={can(ctx, 'settings.administer')}
        locale={ctx.locale}
        previewStrings={{ ar: previewStrings('ar'), en: previewStrings('en') }}
      />
    </div>
  );
}
