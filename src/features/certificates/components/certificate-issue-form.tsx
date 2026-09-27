'use client';

import { CheckCircle2Icon, DownloadIcon, EyeIcon, FileSignatureIcon, InfoIcon, PlusIcon, ShieldCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { localized } from '@/lib/i18n/localized';
import { issueCertificate, previewCertificate, type IssuedResult } from '../actions';
import type { IssuableTemplate } from '../server/queries';
import { CERTIFICATE_LANGUAGES, templateSupportsLanguage, type CertificateLanguage } from '../variables';
import { DocumentPreview } from './document-preview';
import { useActionToast } from './use-action-toast';
import { useCertificateLabels } from './use-certificate-labels';

export type IssueFormRequest = {
  id: string;
  subtype: string | null;
  language: CertificateLanguage | null;
  addressed_to: string | null;
  purpose: string | null;
  include_salary: boolean;
  include_allowances: boolean;
};

function pickTemplate(templates: IssuableTemplate[], subtype: string | null, language: CertificateLanguage): string {
  const compatible = templates.filter((t) => templateSupportsLanguage(t.language, language));
  const matching = compatible.filter((t) => t.certificate_type === subtype);
  const best = matching.find((t) => t.is_default) ?? matching[0] ?? compatible.find((t) => t.is_default) ?? compatible[0];
  return best?.id ?? '';
}

/** HR issuing form on a certificate request: template, language, addressee, purpose → preview / generate. */
export function CertificateIssueForm({
  request,
  templates,
  alreadyIssued,
  salaryUnavailable,
}: {
  request: IssueFormRequest;
  templates: IssuableTemplate[];
  alreadyIssued: boolean;
  salaryUnavailable: boolean;
}) {
  const t = useTranslations('certificates.panel');
  const tp = useTranslations('certificates.preview');
  const ta = useTranslations('certificates.actions');
  const locale = useLocale() as 'ar' | 'en';
  const labels = useCertificateLabels();
  const { run } = useActionToast();
  const [expanded, setExpanded] = useState(!alreadyIssued);
  const [language, setLanguage] = useState<CertificateLanguage>(request.language ?? 'ar');
  const [templateId, setTemplateId] = useState(() => pickTemplate(templates, request.subtype, request.language ?? 'ar'));
  const [addressedTo, setAddressedTo] = useState(request.addressed_to ?? '');
  const [purpose, setPurpose] = useState(request.purpose ?? '');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [issued, setIssued] = useState<IssuedResult | null>(null);
  const [pending, startTransition] = useTransition();

  const compatible = useMemo(() => templates.filter((tpl) => templateSupportsLanguage(tpl.language, language)), [templates, language]);
  const matching = compatible.filter((tpl) => tpl.certificate_type === request.subtype);
  const others = compatible.filter((tpl) => tpl.certificate_type !== request.subtype);
  const selectedValid = compatible.some((tpl) => tpl.id === templateId);
  const salaryRequested = request.include_salary || request.include_allowances;

  const input = () => ({ requestId: request.id, templateId, language, addressedTo: addressedTo.trim(), purpose: purpose.trim() });

  const generate = () =>
    startTransition(async () => {
      const result = await run(issueCertificate(input()));
      if (result.ok && result.data) {
        setIssued(result.data);
        setExpanded(false);
      }
    });

  const templateName = (tpl: IssuableTemplate) => localized(tpl, 'name', locale);

  if (!expanded) {
    return (
      <div className="flex flex-col gap-3">
        {issued ? (
          <Alert variant="success">
            <CheckCircle2Icon />
            <AlertTitle>{t('issuedHeadline', { number: issued.number })}</AlertTitle>
            <AlertDescription>{t('issuedDescription')}</AlertDescription>
            <AlertActions>
              <Button asChild size="sm">
                <a href={issued.downloadUrl}>
                  <DownloadIcon />
                  {ta('download')}
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={issued.verifyUrl} target="_blank" rel="noopener noreferrer">
                  <ShieldCheckIcon />
                  {ta('openVerification')}
                </a>
              </Button>
            </AlertActions>
          </Alert>
        ) : null}
        <div>
          <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
            <PlusIcon />
            {t('reissue')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-subtle/60 p-4">
      <div className="flex items-center gap-2">
        <FileSignatureIcon className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">{t('issueTitle')}</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="issue-language">{t('language')}</Label>
          <Select
            value={language}
            onValueChange={(v) => {
              const next = v as CertificateLanguage;
              setLanguage(next);
              if (!templates.some((tpl) => tpl.id === templateId && templateSupportsLanguage(tpl.language, next))) {
                setTemplateId(pickTemplate(templates, request.subtype, next));
              }
            }}
          >
            <SelectTrigger id="issue-language" className="w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CERTIFICATE_LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {labels.language(l)}
                  {l === request.language ? <span className="ms-1.5 text-meta text-muted-foreground">· {t('requested')}</span> : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-template">{t('template')}</Label>
          <Select value={selectedValid ? templateId : ''} onValueChange={setTemplateId} disabled={!compatible.length}>
            <SelectTrigger id="issue-template" className="w-full bg-card">
              <SelectValue placeholder={t('templatePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {matching.length ? (
                <SelectGroup>
                  <SelectLabel>{t('matchingTemplates')}</SelectLabel>
                  {matching.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {templateName(tpl)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {matching.length && others.length ? <SelectSeparator /> : null}
              {others.length ? (
                <SelectGroup>
                  <SelectLabel>{t('otherTemplates')}</SelectLabel>
                  {others.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {templateName(tpl)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-addressed">{t('addressedTo')}</Label>
          <Input
            id="issue-addressed"
            value={addressedTo}
            onChange={(e) => setAddressedTo(e.target.value)}
            placeholder={t('addressedToPlaceholder')}
            maxLength={200}
            className="bg-card"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-purpose">{t('purpose')}</Label>
          <Input id="issue-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('purposePlaceholder')} maxLength={300} className="bg-card" />
        </div>
      </div>

      {!compatible.length ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{t('noTemplates')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {salaryRequested ? (
          <>
            {request.include_salary ? (
              <Badge variant="info" size="sm">
                {t('salaryIncluded')}
              </Badge>
            ) : null}
            {request.include_allowances ? (
              <Badge variant="info" size="sm">
                {t('allowancesIncluded')}
              </Badge>
            ) : null}
          </>
        ) : (
          <Badge variant="neutral" size="sm">
            {t('salaryNotRequested')}
          </Badge>
        )}
      </div>
      {salaryRequested && salaryUnavailable ? (
        <Alert variant="warning">
          <InfoIcon />
          <AlertDescription>{t('salaryHidden')}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          variant="outline"
          disabled={!selectedValid || pending}
          onClick={() => {
            setPreviewVersion((v) => v + 1);
            setPreviewOpen(true);
          }}
        >
          <EyeIcon />
          {t('preview')}
        </Button>
        <Button onClick={generate} loading={pending} disabled={!selectedValid}>
          <FileSignatureIcon />
          {pending ? t('generating') : t('generate')}
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent size="xl" className="h-[calc(100dvh-2rem)] sm:h-[90dvh]">
          <DialogHeader>
            <DialogTitle>{tp('title')}</DialogTitle>
            <DialogDescription>{tp('description')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col pb-5">
            {previewOpen ? (
              <DocumentPreview
                title={tp('title')}
                version={previewVersion}
                load={(format) => previewCertificate({ ...input(), format })}
                labels={{
                  page: tp('page'),
                  pdf: tp('pdf'),
                  loading: tp('loading'),
                  failed: tp('failed'),
                  openInNewTab: tp('openInNewTab'),
                  download: tp('download'),
                }}
              />
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
