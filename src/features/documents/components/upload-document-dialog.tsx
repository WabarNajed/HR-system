'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { InfoIcon, ShieldAlertIcon, UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { FileDropzone, fileKey } from '@/components/shared/file-dropzone';
import { LoadingButton } from '@/components/shared/loading-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, useErrorMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { employeeDisplayName } from '@/lib/i18n/localized';
import {
  abortDocumentUpload,
  createDocumentUpload,
  finalizeDocumentUpload,
  getUploadContext,
  searchUploadEmployees,
  type EmployeeOption,
} from '../actions';
import { DOCUMENT_ACCEPT, DOCUMENT_UPLOAD, isDocumentType } from '../constants';
import type { UploadContext } from '../types';
import { uploadErrorKey, uploadToStorage } from '../upload-client';
import { DocumentFormFields, documentFormSchema, toMetadataPayload, type DocumentFormValues } from './document-form-fields';

export type UploadDocumentDialogProps = {
  /** Upload for this employee (HR, or the employee themselves). Absent → HR picks the employee. */
  employeeId?: string;
  /** Element that opens the dialog (defaults to an "Upload document" button). */
  trigger?: ReactNode;
  /** Pre-selected document type (e.g. from the Missing documents list). */
  defaultType?: string;
  /** Controlled mode (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after a successful upload (the route is refreshed either way). */
  onUploaded?: () => void;
};

/**
 * Upload dialog (cross-module contract, used by the Employees module header):
 * `<UploadDocumentDialog employeeId={id} trigger={<Button …/>} defaultType="passport" />`.
 * The server decides the mode when it opens: HR (org documents.create) files documents directly;
 * an employee uploading their own document sends it to HR review.
 */
export function UploadDocumentDialog({ employeeId, trigger, defaultType, open: controlledOpen, onOpenChange, onUploaded }: UploadDocumentDialogProps) {
  const t = useTranslations('documents');
  const [internalOpen, setInternalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next && busy) return; // never close mid-upload
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [busy, controlledOpen, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined || trigger ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <UploadIcon />
              {t('actions.upload')}
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent size="lg" onInteractOutside={(e) => busy && e.preventDefault()} onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        {open ? (
          <UploadForm
            employeeId={employeeId}
            defaultType={defaultType}
            onBusyChange={setBusy}
            onDone={() => {
              setBusy(false);
              if (controlledOpen === undefined) setInternalOpen(false);
              onOpenChange?.(false);
              onUploaded?.();
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; context: UploadContext };

function toOption(e: EmployeeOption, locale: 'ar' | 'en'): ComboboxOption {
  const name = employeeDisplayName(e, locale) || e.employee_number || '';
  return {
    value: e.id,
    label: name,
    description: e.employee_number ?? undefined,
    keywords: [e.name_ar ?? '', e.name_en ?? '', e.employee_number ?? ''],
    icon: <EmployeeAvatar name={name} seed={e.id} size="xs" />,
  };
}

function UploadForm({
  employeeId,
  defaultType,
  onBusyChange,
  onDone,
  onCancel,
}: {
  employeeId?: string;
  defaultType?: string;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const resolveError = useErrorMessage();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [pickedEmployee, setPickedEmployee] = useState<string | null>(null);
  const [pickedOption, setPickedOption] = useState<ComboboxOption | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      documentType: defaultType && isDocumentType(defaultType) ? defaultType : '',
      documentNumber: '',
      issueDate: null,
      expiryDate: null,
      isConfidential: false,
      notes: '',
    },
  });
  const documentType = useWatch({ control: form.control, name: 'documentType' });

  useEffect(() => {
    let cancelled = false;
    getUploadContext({ employeeId: employeeId ?? null })
      .then((result) => {
        if (cancelled) return;
        setState(result.ok && result.data ? { status: 'ready', context: result.data } : { status: 'error' });
      })
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [employeeId, attempt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadEmployees = useCallback(
    async (query: string) => {
      const result = await searchUploadEmployees({ query });
      if (!result.ok) throw new Error(result.error);
      return (result.data ?? []).map((e) => toOption(e, locale));
    },
    [locale],
  );

  if (state.status === 'loading') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('upload.title')}</DialogTitle>
          <DialogDescription>{t('upload.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-5" aria-busy>
          <Skeleton className="h-9 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
          <Skeleton className="h-24 w-full" />
        </DialogBody>
      </>
    );
  }

  if (state.status === 'error' || state.context.mode === 'none') {
    const reason = state.status === 'ready' && state.context.mode === 'none' ? state.context.reason : null;
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('upload.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-4">
          <Alert variant={reason ? 'warning' : 'danger'}>
            <ShieldAlertIcon />
            <AlertDescription>
              {reason === 'forbidden' ? t('upload.noAccess') : reason === 'notLinked' ? t('upload.notLinked') : t('upload.loadFailed')}
            </AlertDescription>
          </Alert>
        </DialogBody>
        <DialogFooter>
          {state.status === 'error' ? (
            <Button variant="outline" onClick={() => (setState({ status: 'loading' }), setAttempt((n) => n + 1))}>
              {tc('retry')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onCancel}>
            {tc('close')}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const context = state.context;
  const isHr = context.mode === 'hr';
  const fixedEmployee = context.employee;
  const targetId = fixedEmployee?.id ?? pickedEmployee;
  const file = files[0] ?? null;

  /** Employee + file are outside the zod form; validate them together with it. */
  const checkExtra = () => {
    if (!targetId) setEmployeeError('documents.validation.employeeRequired');
    if (!file) setFileError('documents.validation.fileRequired');
    return Boolean(targetId && file);
  };

  const submit = async (values: DocumentFormValues) => {
    if (!checkExtra() || !file || !targetId) return;

    setSubmitting(true);
    onBusyChange(true);
    setProgress(0);
    let documentId: string | null = null;
    try {
      const created = await createDocumentUpload({
        ...toMetadataPayload(values),
        employeeId: targetId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      if (!created.ok || !created.data) {
        if (!created.ok && created.fieldErrors?.file) setFileError(created.fieldErrors.file);
        toast.error(resolveError(created.ok ? 'errors.generic' : created.error));
        return;
      }
      documentId = created.data.documentId;
      abortRef.current = new AbortController();
      try {
        await uploadToStorage(created.data.bucket, created.data.path, file, setProgress, abortRef.current.signal);
      } catch (error) {
        await abortDocumentUpload({ documentId });
        toast.error(resolveError(uploadErrorKey(error)));
        return;
      }
      const finalized = await finalizeDocumentUpload({ documentId });
      if (!finalized.ok) {
        await abortDocumentUpload({ documentId });
        toast.error(resolveError(finalized.error));
        return;
      }
      toast.success(resolveError(finalized.message ?? 'documents.toast.uploaded'));
      router.refresh();
      onDone();
    } catch {
      if (documentId) await abortDocumentUpload({ documentId }).catch(() => undefined);
      toast.error(resolveError('errors.generic'));
    } finally {
      setSubmitting(false);
      onBusyChange(false);
      setProgress(null);
    }
  };

  const employeeName = fixedEmployee ? employeeDisplayName(fixedEmployee, locale) || fixedEmployee.employee_number || '' : '';

  return (
    <Form {...form}>
      <form onSubmit={(event) => void form.handleSubmit(submit, () => checkExtra())(event)} className="flex min-h-0 flex-1 flex-col" noValidate>
        <DialogHeader>
          <DialogTitle>{isHr && fixedEmployee ? t('upload.titleFor', { name: employeeName }) : t('upload.title')}</DialogTitle>
          <DialogDescription>{t('upload.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5 pb-5">
          {!isHr ? (
            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>{t('upload.selfNotice')}</AlertDescription>
            </Alert>
          ) : null}

          {isHr && !fixedEmployee ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="upload-employee" className={employeeError ? 'text-danger' : undefined}>
                {t('fields.employee')}
                <span aria-hidden className="text-danger">
                  *
                </span>
              </Label>
              <Combobox
                id="upload-employee"
                value={pickedEmployee}
                selectedOptions={pickedOption ? [pickedOption] : []}
                onChange={(value, option) => {
                  setPickedEmployee(value);
                  setPickedOption(option);
                  setEmployeeError(null);
                }}
                loadOptions={loadEmployees}
                placeholder={t('placeholders.selectEmployee')}
                searchPlaceholder={t('placeholders.selectEmployee')}
                disabled={submitting}
                aria-invalid={Boolean(employeeError)}
                className="w-full"
              />
              {employeeError ? <p className="text-xs font-medium text-danger">{resolveError(employeeError)}</p> : null}
            </div>
          ) : fixedEmployee ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle px-3 py-2.5">
              <EmployeeAvatar name={employeeName} seed={fixedEmployee.id} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{employeeName}</div>
                {fixedEmployee.employee_number ? (
                  <div className="text-xs text-muted-foreground numeric">
                    <bdi>{fixedEmployee.employee_number}</bdi>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DocumentFormFields control={form.control} showConfidential={isHr} disabled={submitting} documentType={documentType} />

          <div className="flex flex-col gap-2">
            <Label className={fileError ? 'text-danger' : undefined}>
              {t('upload.fileLabel')}
              <span aria-hidden className="text-danger">
                *
              </span>
            </Label>
            <FileDropzone
              value={files}
              onChange={(next) => {
                setFiles(next);
                setFileError(null);
              }}
              accept={DOCUMENT_ACCEPT}
              maxSize={DOCUMENT_UPLOAD.maxBytes}
              disabled={submitting}
              compact
              aria-invalid={Boolean(fileError)}
              fileStates={
                file && progress !== null
                  ? { [fileKey(file)]: { status: progress >= 100 ? 'done' : 'uploading', progress } }
                  : undefined
              }
            />
            {fileError ? <p className="text-xs font-medium text-danger">{resolveError(fileError)}</p> : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            {tc('cancel')}
          </Button>
          <LoadingButton
            type="submit"
            pending={submitting}
            pendingText={progress !== null && progress < 100 ? t('upload.uploading', { progress }) : tc('saving')}
          >
            <UploadIcon />
            {isHr ? t('upload.submit') : t('upload.submitSelf')}
          </LoadingButton>
        </DialogFooter>
      </form>
    </Form>
  );
}
