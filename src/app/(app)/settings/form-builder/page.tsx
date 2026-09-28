import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { fingerprint } from '@/features/request-config/builder-logic';
import { FormBuilder } from '@/features/request-config/components/form-builder';
import { loadBuilderFields, loadLeaveTypesLite, loadRequestTypeRows } from '@/features/request-config/queries';
import type { BuilderField, LeaveTypeLite, RequestTypeRow } from '@/features/request-config/types';
import { requireAccess } from '@/lib/auth/guards';
import { otherLocale } from '@/lib/i18n/config';
import { getMessages, pickNamespaces } from '@/lib/i18n/messages';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.formBuilder');

type Loaded = { rows: RequestTypeRow[]; type: RequestTypeRow | null; fields: BuilderField[]; leaveTypes: LeaveTypeLite[] };

async function load(supabase: ServerSupabaseClient, requested: string | null): Promise<Loaded> {
  const rows = await loadRequestTypeRows(supabase);
  const type = rows.find((r) => r.key === requested) ?? rows.find((r) => r.is_active) ?? rows[0] ?? null;
  if (!type) return { rows, type: null, fields: [], leaveTypes: [] };
  const [fields, leaveTypes] = await Promise.all([loadBuilderFields(supabase, type.id), loadLeaveTypesLite(supabase)]);
  return { rows, type, fields, leaveTypes };
}

/** Settings › Requests › Form builder (`?type=<request type key>`). */
export default async function SettingsFormBuilderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/form-builder']);
  const sp = await searchParams;
  const t = await getTranslations('requestConfig.builder');
  const supabase = await createClient({ timeoutMs: 10000 });

  let data: Loaded;
  try {
    data = await load(supabase, typeof sp.type === 'string' ? sp.type : null);
  } catch (error) {
    console.error('[request-config] form builder load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }

  const { rows, type, fields, leaveTypes } = data;
  if (!type) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <EmptyState variant="card" title={t('noTypesTitle')} description={t('noTypesDescription')} />
      </div>
    );
  }
  const ar = getMessages('ar');
  const en = getMessages('en');
  return (
    <FormBuilder
      key={`${type.id}:${fingerprint(fields)}`}
      types={rows.map((r) => ({
        id: r.id,
        key: r.key,
        name_ar: r.name_ar,
        name_en: r.name_en,
        icon: r.icon,
        color: r.color,
        is_active: r.is_active,
        meta: r.activeFieldsCount,
      }))}
      type={{
        id: type.id,
        key: type.key,
        name_ar: type.name_ar,
        name_en: type.name_en,
        icon: type.icon,
        color: type.color,
        is_active: type.is_active,
        allow_attachments: type.allow_attachments,
      }}
      initialFields={fields}
      leaveTypes={leaveTypes}
      canEdit={can(ctx, 'settings.edit')}
      otherMessages={pickNamespaces(otherLocale(ctx.locale), ['common', 'requests', 'enums', 'validation', 'errors'])}
      typeNames={{ ar: ar.enums.fieldType, en: en.enums.fieldType }}
      wordings={{
        copyAr: ar.requestConfig.builder.copySuffix,
        copyEn: en.requestConfig.builder.copySuffix,
        optionAr: ar.requestConfig.builder.options.defaultLabel,
        optionEn: en.requestConfig.builder.options.defaultLabel,
      }}
    />
  );
}
