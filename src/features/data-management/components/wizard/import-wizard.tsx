'use client';

import { ArrowLeftIcon, ArrowRightIcon, FileSpreadsheetIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { LoadingButton } from '@/components/shared/loading-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { cancelImportAction, inspectImportAction, runImportBatchAction, validateImportAction } from '../../actions';
import { missingRequired } from '../../lib/mapping';
import { getSchema } from '../../lib/schemas';
import { EXTRA, IGNORE, type ColumnMapping, type ImportOptions, type ImportType } from '../../lib/types';
import type { SheetInspection, ValidationView } from '../../types';
import { importHref, TYPE_ICONS } from '../type-meta';
import { useRunAction } from '../use-dm';
import type { OptionCaps } from './import-options';
import { StepMapping } from './step-mapping';
import { StepReview } from './step-review';
import { StepRun, type RunState } from './step-run';
import { StepSheet } from './step-sheet';
import { StepType } from './step-type';
import { StepUpload } from './step-upload';
import { WIZARD_STEPS, WizardStepper, type WizardStep } from './wizard-stepper';

export type WizardInitial = {
  step: WizardStep;
  type: ImportType | null;
  group: 'master' | null;
  importId: string | null;
  fileName: string | null;
  inspection: SheetInspection | null;
  mapping: ColumnMapping[] | null;
  options: ImportOptions;
  validation: ValidationView | null;
  run: RunState | null;
  notice: string | null;
};

export type WizardCaps = {
  allowed: ImportType[];
  canUpdate: Partial<Record<ImportType, boolean>>;
  settingsEdit: boolean;
  leaveEdit: boolean;
};

function suggestionMapping(inspection: SheetInspection): ColumnMapping[] {
  return inspection.columns.map((c) => ({ index: c.index, label: c.label, target: c.target }));
}

function replaceUrl(href: string) {
  try {
    window.history.replaceState(null, '', href);
  } catch {
    /* ignore */
  }
}

export function ImportWizard({ initial, caps }: { initial: WizardInitial; caps: WizardCaps }) {
  const t = useTranslations('dataManagement');
  const resolve = useErrorMessage();
  const run = useRunAction();

  const [step, setStep] = useState<WizardStep>(initial.step);
  const [type, setType] = useState<ImportType | null>(initial.type);
  const [importId, setImportId] = useState<string | null>(initial.importId);
  const [fileName, setFileName] = useState<string | null>(initial.fileName);
  const [inspection, setInspection] = useState<SheetInspection | null>(initial.inspection);
  const [mapping, setMapping] = useState<ColumnMapping[]>(initial.mapping ?? (initial.inspection ? suggestionMapping(initial.inspection) : []));
  const [manual, setManual] = useState<Set<number>>(() => {
    if (!initial.mapping || !initial.inspection) return new Set();
    const suggested = new Map(initial.inspection.columns.map((c) => [c.index, c.target]));
    return new Set(initial.mapping.filter((m) => suggested.get(m.index) !== m.target).map((m) => m.index));
  });
  const [options, setOptions] = useState<ImportOptions>(initial.options);
  const [appliedOptions, setAppliedOptions] = useState<ImportOptions>(initial.options);
  const [validation, setValidation] = useState<ValidationView | null>(initial.validation);
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial.notice);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [runState, setRunState] = useState<RunState>(initial.run ?? { phase: 'running', done: 0, total: 0, last: null, error: null });
  const runnerId = useRef<string>('');
  const running = useRef(false);

  useEffect(() => {
    runnerId.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);

  const optionCaps: OptionCaps = useMemo(
    () => ({ canUpdate: type ? Boolean(caps.canUpdate[type]) : false, settingsEdit: caps.settingsEdit, leaveEdit: caps.leaveEdit }),
    [type, caps],
  );

  const discardImport = useCallback((id: string | null) => {
    if (id) void cancelImportAction({ importId: id }).catch(() => undefined);
  }, []);

  const resetImport = useCallback(() => {
    setImportId(null);
    setFileName(null);
    setInspection(null);
    setMapping([]);
    setManual(new Set());
    setValidation(null);
    setNotice(null);
  }, []);

  /* ─── Steps ─────────────────────────────────────────────────────────────── */

  const selectType = (next: ImportType) => {
    if (importId && next !== type) {
      discardImport(importId);
      resetImport();
    }
    setType(next);
    setStep('upload');
    replaceUrl(importHref({ type: next }));
  };

  const upload = async (file: File) => {
    if (!type) return;
    setUploading(true);
    setFileName(file.name);
    setNotice(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const body = new FormData();
      body.set('type', type);
      body.set('file', file);
      const res = await fetch('/api/data-management/imports', { method: 'POST', body, signal: controller.signal });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { importId: string; fileName: string; inspection: SheetInspection } }
        | { ok: false; error: string }
        | null;
      if (!json || !json.ok) {
        toast.error(resolve(json && !json.ok ? json.error : 'errors.generic'));
        setFileName(importId ? fileName : null);
        return;
      }
      if (importId) discardImport(importId);
      setImportId(json.data.importId);
      setFileName(json.data.fileName);
      setInspection(json.data.inspection);
      setMapping(suggestionMapping(json.data.inspection));
      setManual(new Set());
      setValidation(null);
      setStep('sheet');
      replaceUrl(importHref({ id: json.data.importId }));
      toast.success(t('toast.uploaded', { file: json.data.fileName, count: json.data.inspection.records }));
    } catch (error) {
      toast.error(resolve(error instanceof DOMException && error.name === 'AbortError' ? 'errors.timeout' : 'errors.network'));
    } finally {
      window.clearTimeout(timer);
      setUploading(false);
    }
  };

  const changeSheet = async (next: { sheetIndex: number; headerRow: number }) => {
    if (!importId) return;
    setInspecting(true);
    const res = await run(
      inspectImportAction({ importId, sheetIndex: next.sheetIndex, headerRow: next.headerRow >= 0 ? next.headerRow : undefined }),
    );
    setInspecting(false);
    if (res.ok && res.data) {
      setInspection(res.data);
      setMapping(suggestionMapping(res.data));
      setManual(new Set());
      setValidation(null);
    }
  };

  const changeMapping = (index: number, target: string) => {
    if (!type) return;
    const fallback = getSchema(type).extraData ? EXTRA : IGNORE;
    setMapping((prev) =>
      prev.map((m) => {
        if (m.index === index) return { ...m, target };
        if (target !== IGNORE && target !== EXTRA && m.target === target) return { ...m, target: fallback };
        return m;
      }),
    );
    setManual((prev) => new Set(prev).add(index));
    setValidation(null);
  };

  const resetMapping = () => {
    if (!inspection) return;
    setMapping(suggestionMapping(inspection));
    setManual(new Set());
    setValidation(null);
  };

  const validate = async (opts: ImportOptions = options) => {
    if (!importId || !inspection) return false;
    setValidating(true);
    const res = await run(
      validateImportAction({
        importId,
        sheetIndex: inspection.sheetIndex,
        headerRow: inspection.headerRow,
        headerRows: inspection.headerRows,
        mapping,
        options: opts,
      }),
    );
    setValidating(false);
    if (res.ok && res.data) {
      setValidation(res.data);
      setAppliedOptions(opts);
      setReloadKey((k) => k + 1);
      return true;
    }
    return false;
  };

  const runLoop = useCallback(
    async (id: string, total: number) => {
      if (running.current) return;
      running.current = true;
      setRunState((s) => ({ ...s, phase: 'running', error: null, total: total || s.total }));
      try {
        for (;;) {
          let res;
          try {
            res = await runImportBatchAction({ importId: id, runnerId: runnerId.current || 'runner-fallback' });
          } catch {
            res = { ok: false as const, error: 'errors.network' };
          }
          if (!res.ok || !res.data) {
            const error = res.ok ? 'errors.generic' : res.error;
            setRunState((s) => ({ ...s, phase: 'paused', error }));
            return;
          }
          const batch = res.data;
          setRunState((s) => {
            const done = s.done + batch.processed;
            const size = Math.max(s.total, done + batch.pending);
            return { phase: batch.done ? 'done' : 'running', done, total: size, last: batch, error: null };
          });
          if (batch.done) {
            const saved = (batch.result?.created ?? 0) + (batch.result?.updated ?? 0);
            if (batch.failed) toast.warning(t('toast.importedWithErrors', { count: batch.failed }));
            else toast.success(t('toast.imported', { count: saved }));
            return;
          }
        }
      } finally {
        running.current = false;
      }
    },
    [t],
  );

  useEffect(() => {
    if (initial.step === 'run' && initial.run?.phase === 'running' && initial.importId) {
      const id = initial.importId;
      const timer = window.setTimeout(() => void runLoop(id, initial.run?.total ?? 0), 50);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [initial, runLoop]);

  const start = () => {
    if (!importId || !validation) return;
    setConfirmStart(false);
    setStep('run');
    const total = validation.totals.valid + validation.totals.warning;
    setRunState({ phase: 'running', done: 0, total, last: null, error: null });
    void runLoop(importId, total);
  };

  const cancelImport = async () => {
    if (!importId) return false;
    const res = await run(cancelImportAction({ importId }));
    if (!res.ok) return false;
    resetImport();
    setStep(type ? 'upload' : 'type');
    replaceUrl(importHref(type ? { type } : {}));
    return true;
  };

  const newImport = () => {
    resetImport();
    setRunState({ phase: 'running', done: 0, total: 0, last: null, error: null });
    setStep('type');
    replaceUrl(importHref());
  };

  /* ─── Navigation ────────────────────────────────────────────────────────── */

  const missing = type ? missingRequired(type, mapping) : [];
  const index = WIZARD_STEPS.indexOf(step);
  const reachable = (s: WizardStep): boolean => {
    if (step === 'run') return false;
    const i = WIZARD_STEPS.indexOf(s);
    if (i < index) return true;
    if (s === 'upload') return Boolean(type);
    if (s === 'sheet' || s === 'mapping') return Boolean(inspection);
    if (s === 'review') return Boolean(validation);
    return false;
  };
  const jump = (s: WizardStep) => {
    if (s === 'type' && importId) {
      setConfirmCancel(true);
      return;
    }
    setStep(s);
  };

  const back = () => {
    if (step === 'upload') {
      if (importId) setConfirmCancel(true);
      else setStep('type');
    } else if (step === 'sheet') setStep('upload');
    else if (step === 'mapping') setStep('sheet');
    else if (step === 'review') setStep('mapping');
  };

  const next = async () => {
    if (step === 'type' && type) setStep('upload');
    else if (step === 'upload' && inspection) setStep('sheet');
    else if (step === 'sheet') setStep('mapping');
    else if (step === 'mapping') {
      if (await validate()) setStep('review');
    }
  };

  const nextDisabled =
    (step === 'type' && !type) ||
    (step === 'upload' && (!inspection || uploading)) ||
    (step === 'sheet' && (!inspection || inspection.records === 0 || inspecting)) ||
    (step === 'mapping' && missing.length > 0);

  const TypeIcon = type ? TYPE_ICONS[type] : null;
  const hasLeaveColumn = mapping.some((m) => m.target === 'leave_balance');

  return (
    <div className="flex flex-col gap-4">
      <WizardStepper step={step} reachable={reachable} onJump={jump} />

      {type && step !== 'type' ? (
        <div className="flex flex-wrap items-center gap-2 text-meta">
          {TypeIcon ? (
            <Badge variant="secondary" size="md">
              <TypeIcon />
              {t(`types.${type}.title`)}
            </Badge>
          ) : null}
          {fileName && importId ? (
            <Badge variant="outline" size="md" className="max-w-full">
              <FileSpreadsheetIcon className="text-success" />
              <bdi className="truncate">{fileName}</bdi>
            </Badge>
          ) : null}
          {inspection && step !== 'upload' ? (
            <span className="text-muted-foreground numeric">{t('wizard.sheet.records', { count: inspection.records })}</span>
          ) : null}
        </div>
      ) : null}

      <section className={cn('rounded-lg border border-border bg-card p-4 shadow-card sm:p-5', step === 'review' && 'border-0 bg-transparent p-0 shadow-none sm:p-0')}>
        {notice ? (
          <Alert variant="warning" className="mb-4">
            <AlertDescription>{resolve(notice)}</AlertDescription>
          </Alert>
        ) : null}
        {step === 'type' ? <StepType allowed={caps.allowed} selected={type} focusGroup={initial.group} onSelect={selectType} /> : null}
        {step === 'upload' && type ? <StepUpload type={type} uploading={uploading} fileName={fileName} onFile={(f) => void upload(f)} /> : null}
        {step === 'sheet' && type && inspection ? <StepSheet type={type} inspection={inspection} busy={inspecting} onChange={(n) => void changeSheet(n)} /> : null}
        {step === 'mapping' && type && inspection ? (
          <StepMapping type={type} inspection={inspection} mapping={mapping} manual={manual} onChange={changeMapping} onReset={resetMapping} />
        ) : null}
        {step === 'review' && type && importId && validation ? (
          <StepReview
            importId={importId}
            type={type}
            validation={validation}
            validating={validating}
            reloadKey={reloadKey}
            options={options}
            appliedOptions={appliedOptions}
            caps={optionCaps}
            hasLeaveColumn={hasLeaveColumn}
            onOptionsChange={setOptions}
            onRecheck={() => void validate(options)}
            onStart={() => setConfirmStart(true)}
          />
        ) : null}
        {step === 'run' && type && importId ? (
          <StepRun
            importId={importId}
            type={type}
            fileName={fileName ?? ''}
            state={runState}
            warnings={validation?.totals.warning ?? 0}
            onResume={() => void runLoop(importId, runState.total)}
            onNewImport={newImport}
          />
        ) : null}
      </section>

      {step !== 'run' && step !== 'review' && step !== 'type' ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:border sm:bg-card sm:px-4 sm:shadow-xs">
          <Button variant="ghost" onClick={back} disabled={uploading || validating}>
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t('wizard.back')}
          </Button>
          {importId ? (
            <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmCancel(true)} disabled={uploading || validating}>
              <Trash2Icon />
              <span className="hidden sm:inline">{t('wizard.cancelImport')}</span>
            </Button>
          ) : null}
          {step !== 'upload' || inspection ? (
            <LoadingButton className="ms-auto" onClick={() => void next()} pending={validating} disabled={nextDisabled || uploading}>
              {step === 'mapping' ? t('wizard.mapping.validate') : t('wizard.next')}
              <ArrowRightIcon className="rtl:rotate-180" />
            </LoadingButton>
          ) : null}
        </div>
      ) : null}
      {step === 'review' ? (
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={back} disabled={validating}>
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t('wizard.back')}
          </Button>
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmCancel(true)} disabled={validating}>
            <Trash2Icon />
            {t('wizard.cancelImport')}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmStart}
        onOpenChange={setConfirmStart}
        title={t('wizard.review.confirmTitle', { count: (validation?.totals.create ?? 0) + (validation?.totals.update ?? 0) })}
        description={
          <>
            {t('wizard.review.confirmDescription', {
              create: validation?.totals.create ?? 0,
              update: validation?.totals.update ?? 0,
              errors: validation?.totals.error ?? 0,
              skip: validation?.totals.skip ?? 0,
            })}
            {type === 'employees' ? <span className="mt-2 block text-muted-foreground">{t('wizard.review.confirmNoLogins')}</span> : null}
          </>
        }
        confirmLabel={t('wizard.review.confirm')}
        onConfirm={() => {
          // Start outside the dialog's transition so the progress view renders immediately.
          window.setTimeout(start, 0);
          return true;
        }}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('wizard.cancelConfirmTitle')}
        description={t('wizard.cancelConfirmDescription')}
        confirmLabel={t('wizard.cancelImport')}
        variant="danger"
        onConfirm={async () => {
          const ok = await cancelImport();
          if (ok && step === 'upload') setStep('type');
          return ok;
        }}
      />
    </div>
  );
}
