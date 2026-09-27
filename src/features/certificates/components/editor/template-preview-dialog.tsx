'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { previewTemplate, searchPreviewEmployees } from '../../actions';
import type { TemplateDraft } from '../../types';
import { CERTIFICATE_LANGUAGES, templateSupportsLanguage, type CertificateLanguage } from '../../variables';
import { DocumentPreview } from '../document-preview';
import { useCertificateLabels } from '../use-certificate-labels';

/** Editor preview: renders the unsaved draft for a chosen employee (or with variable names). */
export function TemplatePreviewDialog({ open, onOpenChange, getDraft }: { open: boolean; onOpenChange: (open: boolean) => void; getDraft: () => TemplateDraft }) {
  const t = useTranslations('templates.preview');
  const labels = useCertificateLabels();
  const [employee, setEmployee] = useState<ComboboxOption | null>(null);
  const [language, setLanguage] = useState<CertificateLanguage | null>(null);
  const [includeSalary, setIncludeSalary] = useState(true);
  const [includeAllowances, setIncludeAllowances] = useState(true);
  const [addressedTo, setAddressedTo] = useState('');
  const [version, setVersion] = useState(1);

  const draft = open ? getDraft() : null;
  const languages = CERTIFICATE_LANGUAGES.filter((l) => (draft ? templateSupportsLanguage(draft.language, l) : true));
  const lang: CertificateLanguage = language && languages.includes(language) ? language : (draft?.language ?? 'bilingual');
  const bump = () => setVersion((v) => v + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="h-[calc(100dvh-1rem)] sm:h-[92dvh] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{employee ? t('description') : t('placeholderNote')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 pb-5">
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-subtle p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label>{t('employee')}</Label>
              <Combobox
                value={employee?.value ?? null}
                selectedOptions={employee ? [employee] : []}
                onChange={(_, option) => {
                  setEmployee(option);
                  bump();
                }}
                loadOptions={async (q) => {
                  const result = await searchPreviewEmployees({ q });
                  return result.ok ? (result.data ?? []) : [];
                }}
                placeholder={t('employeePlaceholder')}
                searchPlaceholder={t('employeeSearch')}
                className="bg-card"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('language')}</Label>
              <Select
                value={lang}
                onValueChange={(v) => {
                  setLanguage(v as CertificateLanguage);
                  bump();
                }}
              >
                <SelectTrigger className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l} value={l}>
                      {labels.language(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preview-addressed">{t('addressedTo')}</Label>
              <Input
                id="preview-addressed"
                value={addressedTo}
                onChange={(e) => setAddressedTo(e.target.value)}
                onBlur={bump}
                onKeyDown={(e) => e.key === 'Enter' && bump()}
                placeholder={t('addressedToPlaceholder')}
                className="bg-card"
                maxLength={200}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-1 lg:h-9">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={includeSalary}
                  onCheckedChange={(v) => {
                    setIncludeSalary(v);
                    bump();
                  }}
                />
                {t('includeSalary')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={includeAllowances}
                  onCheckedChange={(v) => {
                    setIncludeAllowances(v);
                    bump();
                  }}
                />
                {t('includeAllowances')}
              </label>
            </div>
          </div>
          {open ? (
            <DocumentPreview
              title={t('title')}
              version={version}
              toolbar={
                <Button variant="ghost" size="sm" onClick={bump}>
                  <RefreshCwIcon />
                  {t('refresh')}
                </Button>
              }
              load={(format) =>
                previewTemplate({
                  draft: getDraft(),
                  employeeId: employee?.value ?? null,
                  language: lang,
                  includeSalary,
                  includeAllowances,
                  addressedTo: addressedTo.trim(),
                  format,
                })
              }
              labels={{
                page: t('page'),
                pdf: t('pdf'),
                loading: t('loading'),
                failed: t('failed'),
                openInNewTab: t('openInNewTab'),
                download: t('download'),
              }}
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
