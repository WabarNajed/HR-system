'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckCircle2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  LockIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  UndoIcon,
  XCircleIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FileDropzone, fileKey } from '@/components/shared/file-dropzone';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { LoadingButton } from '@/components/shared/loading-button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { formatFileSize } from '@/lib/format';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { fileRouteUrl, BUCKETS } from '@/lib/storage';
import {
  archiveDocument,
  commitReplaceFile,
  deleteDocument,
  discardReplaceFile,
  prepareReplaceFile,
  restoreDocument,
  reviewDocument,
  updateDocument,
} from '../actions';
import { DOCUMENT_ACCEPT, DOCUMENT_UPLOAD } from '../constants';
import type { DocumentAccess, DocumentSummary } from '../types';
import { uploadErrorKey, uploadToStorage } from '../upload-client';
import { DocumentFormFields, documentFormSchema, toMetadataPayload, type DocumentFormValues } from './document-form-fields';
import { ExpiryBadge, useDocumentTypeLabel } from './labels';

/* ─── Permissions per row ─────────────────────────────────────────────────── */

export type DocumentPermissions = {
  access: Pick<DocumentAccess, 'edit' | 'approve' | 'ownEmployeeId'>;
  userId?: string | null;
};

export function documentAbilities(doc: DocumentSummary, { access }: DocumentPermissions) {
  const archived = doc.status === 'archived';
  const own = Boolean(access.ownEmployeeId) && doc.employee_id === access.ownEmployeeId;
  return {
    hasFile: Boolean(doc.storage_path),
    edit: access.edit && !archived,
    replace: access.edit && !archived,
    review: access.approve && doc.status === 'pending_review',
    selfReview: own,
    // pending/rejected uploads are reviewed or deleted, never archived (restore would make them valid)
    archive: access.edit && (doc.status === 'valid' || doc.status === 'expired'),
    restore: access.edit && archived,
    delete: access.edit,
    withdraw: !access.edit && own && doc.status === 'pending_review' && Boolean(doc.self_uploaded),
  };
}

/* ─── Context: one host renders every document dialog ─────────────────────── */

export type DocumentDialogKind = 'details' | 'edit' | 'replace' | 'approve' | 'reject' | 'archive' | 'restore' | 'delete' | 'withdraw';

type DialogState = { kind: DocumentDialogKind; doc: DocumentSummary } | null;

type DocumentDialogsApi = {
  open: (kind: DocumentDialogKind, doc: DocumentSummary) => void;
  permissions: DocumentPermissions;
  today: string;
};

const DocumentDialogsContext = createContext<DocumentDialogsApi | null>(null);

export function useDocumentDialogs(): DocumentDialogsApi {
  const ctx = useContext(DocumentDialogsContext);
  if (!ctx) throw new Error('useDocumentDialogs must be used inside <DocumentDialogsProvider>');
  return ctx;
}

export function DocumentDialogsProvider({ permissions, today, children }: { permissions: DocumentPermissions; today: string; children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const open = useCallback((kind: DocumentDialogKind, doc: DocumentSummary) => setState({ kind, doc }), []);
  const close = useCallback(() => setState(null), []);
  const api = useMemo(() => ({ open, permissions, today }), [open, permissions, today]);

  return (
    <DocumentDialogsContext.Provider value={api}>
      {children}
      <DocumentDetailsSheet
        doc={state?.kind === 'details' ? state.doc : null}
        onClose={close}
        onAction={(kind, doc) => setState({ kind, doc })}
        permissions={permissions}
        today={today}
      />
      {state?.kind === 'edit' ? <EditDocumentDialog doc={state.doc} onClose={close} /> : null}
      {state?.kind === 'replace' ? <ReplaceFileDialog doc={state.doc} onClose={close} /> : null}
      {state?.kind === 'approve' || state?.kind === 'reject' ? (
        <ReviewDocumentDialog doc={state.doc} decision={state.kind} onClose={close} />
      ) : null}
      {state && ['archive', 'restore', 'delete', 'withdraw'].includes(state.kind) ? (
        <SimpleActionDialog kind={state.kind as 'archive' | 'restore' | 'delete' | 'withdraw'} doc={state.doc} onClose={close} />
      ) : null}
    </DocumentDialogsContext.Provider>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function useEmployeeName() {
  const locale = useLocale() as 'ar' | 'en';
  return (doc: Pick<DocumentSummary, 'employee_name_ar' | 'employee_name_en' | 'employee_number'>) =>
    employeeDisplayName({ name_ar: doc.employee_name_ar, name_en: doc.employee_name_en }, locale) || doc.employee_number || '';
}

function isImage(doc: Pick<DocumentSummary, 'mime_type' | 'file_name'>) {
  return (doc.mime_type ?? '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(doc.file_name ?? '');
}

export function FileTypeIcon({ doc, className }: { doc: Pick<DocumentSummary, 'mime_type' | 'file_name'>; className?: string }) {
  const Icon = isImage(doc) ? FileImageIcon : /pdf/i.test(doc.mime_type ?? doc.file_name ?? '') ? FileTextIcon : FileIcon;
  return <Icon className={className} aria-hidden />;
}

function useResultToast() {
  const resolve = useErrorMessage();
  const router = useRouter();
  return (result: { ok: boolean; message?: string; error?: string }, fallback: string) => {
    if (result.ok) {
      toast.success(resolve(result.message ?? fallback));
      router.refresh();
      return true;
    }
    toast.error(resolve(result.error ?? 'errors.generic'));
    return false;
  };
}

/* ─── Details sheet ───────────────────────────────────────────────────────── */

function DocumentDetailsSheet({
  doc,
  onClose,
  onAction,
  permissions,
  today,
}: {
  doc: DocumentSummary | null;
  onClose: () => void;
  onAction: (kind: DocumentDialogKind, doc: DocumentSummary) => void;
  permissions: DocumentPermissions;
  today: string;
}) {
  const t = useTranslations('documents');
  const [lastDoc, setLastDoc] = useState<DocumentSummary | null>(doc);
  if (doc && doc !== lastDoc) setLastDoc(doc);
  const current = doc ?? lastDoc;

  return (
    <Sheet open={Boolean(doc)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="end" className="sm:max-w-lg">
        {current ? (
          <DetailsBody doc={current} onAction={onAction} permissions={permissions} today={today} />
        ) : (
          <SheetHeader>
            <SheetTitle>{t('details.title')}</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailsBody({
  doc: d,
  onAction: act,
  permissions: perms,
  today: day,
}: {
  doc: DocumentSummary;
  onAction: (kind: DocumentDialogKind, doc: DocumentSummary) => void;
  permissions: DocumentPermissions;
  today: string;
}) {
  const t = useTranslations('documents');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const typeLabel = useDocumentTypeLabel();
  const nameOf = useEmployeeName();
  const can = documentAbilities(d, perms);
  const department = localized({ name_ar: d.department_name_ar, name_en: d.department_name_en }, 'name', locale);
  const fileUrl = d.storage_path ? fileRouteUrl(BUCKETS.employeeDocuments, d.storage_path) : null;
  const downloadUrl = d.storage_path ? fileRouteUrl(BUCKETS.employeeDocuments, d.storage_path, { download: true }) : null;

  return (
    <>
      <SheetHeader className="gap-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="document" status={d.status} />
          {d.is_confidential ? (
            <Badge variant="neutral" size="sm">
              <LockIcon className="size-3" />
              {t('fields.confidential')}
            </Badge>
          ) : null}
          {d.status !== 'archived' ? <ExpiryBadge date={d.expiry_date} today={day} /> : null}
        </div>
        <SheetTitle>{typeLabel(d.document_type)}</SheetTitle>
        <SheetDescription>
          {nameOf(d)}
          {d.employee_number ? (
            <>
              {' · '}
              <bdi className="numeric">{d.employee_number}</bdi>
            </>
          ) : null}
          {department ? ` · ${department}` : null}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5 py-4">
        {d.status === 'rejected' && d.review_note ? (
          <Alert variant="danger">
            <XCircleIcon />
            <AlertDescription>
              <span className="font-medium">{t('fields.rejectionReason')}: </span>
              <bdi>{d.review_note}</bdi>
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-meta font-semibold text-muted-foreground">{t('details.fileSection')}</h3>
          {d.storage_path ? (
            <div className="overflow-hidden rounded-lg border border-border bg-subtle">
              {isImage(d) && fileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived private URL
                <img src={fileUrl} alt={d.file_name ?? typeLabel(d.document_type)} className="max-h-72 w-full bg-card object-contain" />
              ) : null}
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <FileTypeIcon doc={d} className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground" dir="auto">
                    {d.file_name}
                  </div>
                  <div className="text-xs text-muted-foreground numeric">{formatFileSize(d.file_size, locale)}</div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button asChild size="sm" variant="outline">
                    <a href={fileUrl ?? '#'} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon />
                      <span className="max-sm:sr-only">{t('actions.open')}</span>
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={downloadUrl ?? '#'}>
                      <DownloadIcon />
                      <span className="max-sm:sr-only">{t('actions.download')}</span>
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('details.noFile')}</p>
          )}
        </section>

        <KeyValueGrid
          columns={2}
          items={[
            { label: t('fields.documentNumber'), value: d.document_number, ltr: true, span: 'full' },
            { label: t('fields.issueDate'), value: d.issue_date ? fmt.date(d.issue_date) : null },
            {
              label: t('fields.expiryDate'),
              value: d.expiry_date ? fmt.date(d.expiry_date) : null,
              hint: d.expiry_date && ['iqama', 'national_id'].includes(d.document_type ?? '') ? t('fields.hijri', { date: fmt.hijri(d.expiry_date) }) : undefined,
            },
            { label: t('fields.uploadedBy'), value: d.self_uploaded ? t('details.selfUploaded') : d.uploaded_by_name },
            { label: t('fields.uploadedAt'), value: d.created_at ? fmt.dateTime(d.created_at) : null },
            { label: t('fields.notes'), value: d.notes, span: 'full' },
          ]}
        />

        {d.reviewed_at || d.status === 'pending_review' ? (
          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-meta font-semibold text-muted-foreground">{t('details.reviewSection')}</h3>
            {d.reviewed_at ? (
              <KeyValueGrid
                columns={2}
                items={[
                  { label: t('fields.reviewedBy'), value: d.reviewed_by_name },
                  { label: t('fields.reviewedAt'), value: fmt.dateTime(d.reviewed_at) },
                  { label: t('fields.reviewNote'), value: d.review_note, span: 'full', hidden: d.status === 'rejected' },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('details.notReviewed')}</p>
            )}
          </section>
        ) : null}

        {d.is_confidential ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockIcon className="size-3.5" aria-hidden />
            {t('details.confidentialNotice')}
          </p>
        ) : null}
      </SheetBody>
      {can.review || can.edit || can.replace || can.archive || can.restore || can.delete || can.withdraw ? (
        <SheetFooter className="flex-row flex-wrap gap-2 border-t border-border">
          {can.review ? (
            can.selfReview ? (
              <p className="w-full text-xs text-muted-foreground">{t('review.selfReview')}</p>
            ) : (
              <>
                <Button size="sm" onClick={() => act('approve', d)}>
                  <CheckCircle2Icon />
                  {t('actions.approve')}
                </Button>
                <Button size="sm" variant="outline" className="text-danger" onClick={() => act('reject', d)}>
                  <XCircleIcon />
                  {t('actions.reject')}
                </Button>
              </>
            )
          ) : null}
          {can.edit ? (
            <Button size="sm" variant="outline" onClick={() => act('edit', d)}>
              <PencilIcon />
              {t('actions.edit')}
            </Button>
          ) : null}
          {can.replace ? (
            <Button size="sm" variant="outline" onClick={() => act('replace', d)}>
              <RefreshCwIcon />
              {t('actions.replace')}
            </Button>
          ) : null}
          {can.restore ? (
            <Button size="sm" variant="outline" onClick={() => act('restore', d)}>
              <ArchiveRestoreIcon />
              {t('actions.restore')}
            </Button>
          ) : null}
          {can.archive ? (
            <Button size="sm" variant="ghost" onClick={() => act('archive', d)}>
              <ArchiveIcon />
              {t('actions.archive')}
            </Button>
          ) : null}
          {can.delete ? (
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => act('delete', d)}>
              <Trash2Icon />
              {t('actions.delete')}
            </Button>
          ) : null}
          {can.withdraw ? (
            <Button size="sm" variant="outline" className="text-danger" onClick={() => act('withdraw', d)}>
              <UndoIcon />
              {t('actions.withdraw')}
            </Button>
          ) : null}
        </SheetFooter>
      ) : null}
    </>
  );
}

/* ─── Edit metadata ───────────────────────────────────────────────────────── */

function EditDocumentDialog({ doc, onClose }: { doc: DocumentSummary; onClose: () => void }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const ts = useTranslations('statuses.document');
  const report = useResultToast();
  const [pending, startTransition] = useTransition();
  const statusEditable = doc.status === 'valid' || doc.status === 'expired';
  const [status, setStatus] = useState<'valid' | 'expired' | 'auto'>('auto');

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      documentType: doc.document_type ?? '',
      documentNumber: doc.document_number ?? '',
      issueDate: doc.issue_date,
      expiryDate: doc.expiry_date,
      isConfidential: Boolean(doc.is_confidential),
      notes: doc.notes ?? '',
    },
  });
  const documentType = useWatch({ control: form.control, name: 'documentType' });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateDocument({
        ...toMetadataPayload(values),
        documentId: doc.id!,
        status: statusEditable && status !== 'auto' ? status : undefined,
      });
      if (!result.ok && result.fieldErrors) {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          if (key in values) form.setError(key as keyof DocumentFormValues, { message });
        }
      }
      if (report(result, 'documents.toast.updated')) onClose();
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="lg">
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <DialogHeader>
              <DialogTitle>{t('edit.title')}</DialogTitle>
              <DialogDescription>{t('edit.description')}</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-5 pb-5">
              <DocumentFormFields control={form.control} showConfidential disabled={pending} documentType={documentType} />
              {statusEditable ? (
                <div className="flex flex-col gap-2 sm:max-w-[calc(50%-0.5rem)]">
                  <Label htmlFor="document-status">{t('edit.statusLabel')}</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)} disabled={pending}>
                    <SelectTrigger id="document-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{`${tc('reset')} · ${ts(doc.status === 'expired' ? 'expired' : 'valid')}`}</SelectItem>
                      <SelectItem value="valid">{ts('valid')}</SelectItem>
                      <SelectItem value="expired">{ts('expired')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('edit.statusHint')}</p>
                </div>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
                {tc('cancel')}
              </Button>
              <LoadingButton type="submit" pending={pending}>
                {tc('saveChanges')}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Replace file ────────────────────────────────────────────────────────── */

function ReplaceFileDialog({ doc, onClose }: { doc: DocumentSummary; onClose: () => void }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const resolve = useErrorMessage();
  const report = useResultToast();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const file = files[0] ?? null;

  const submit = async () => {
    if (!file) {
      setError('documents.validation.fileRequired');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const prepared = await prepareReplaceFile({ documentId: doc.id!, fileName: file.name, fileSize: file.size, mimeType: file.type });
      if (!prepared.ok || !prepared.data) {
        toast.error(resolve(prepared.ok ? 'errors.generic' : prepared.error));
        return;
      }
      const { path, bucket } = prepared.data;
      try {
        await uploadToStorage(bucket, path, file, setProgress);
      } catch (e) {
        toast.error(resolve(uploadErrorKey(e)));
        return;
      }
      const committed = await commitReplaceFile({ documentId: doc.id!, path, fileName: file.name, fileSize: file.size, mimeType: file.type });
      if (!committed.ok) await discardReplaceFile({ documentId: doc.id!, path }).catch(() => undefined);
      if (report(committed, 'documents.toast.fileReplaced')) onClose();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent size="md" onInteractOutside={(e) => busy && e.preventDefault()} onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('replace.title')}</DialogTitle>
          <DialogDescription>{t('replace.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-5">
          {doc.storage_path ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle px-3 py-2.5">
              <FileTypeIcon doc={doc} className="size-4.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{t('replace.current')}</div>
                <div className="truncate text-sm font-medium" dir="auto">
                  {doc.file_name}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground numeric">{formatFileSize(doc.file_size, locale)}</span>
            </div>
          ) : null}
          <FileDropzone
            value={files}
            onChange={(next) => {
              setFiles(next);
              setError(null);
            }}
            accept={DOCUMENT_ACCEPT}
            maxSize={DOCUMENT_UPLOAD.maxBytes}
            disabled={busy}
            compact
            aria-invalid={Boolean(error)}
            fileStates={file && progress !== null ? { [fileKey(file)]: { status: progress >= 100 ? 'done' : 'uploading', progress } } : undefined}
          />
          {error ? <p className="text-xs font-medium text-danger">{resolve(error)}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {tc('cancel')}
          </Button>
          <LoadingButton
            pending={busy}
            onClick={submit}
            pendingText={progress !== null && progress < 100 ? t('upload.uploading', { progress }) : tc('saving')}
          >
            <RefreshCwIcon />
            {t('replace.submit')}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Approve / reject ────────────────────────────────────────────────────── */

function ReviewDocumentDialog({ doc, decision, onClose }: { doc: DocumentSummary; decision: 'approve' | 'reject'; onClose: () => void }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const nameOf = useEmployeeName();
  const typeLabel = useDocumentTypeLabel();
  const report = useResultToast();
  const [pending, startTransition] = useTransition();
  const form = useForm<{ note: string }>({ defaultValues: { note: '' } });
  const reject = decision === 'reject';

  const onSubmit = form.handleSubmit(({ note }) => {
    if (reject && !note.trim()) {
      form.setError('note', { message: 'documents.validation.reasonRequired' });
      return;
    }
    startTransition(async () => {
      const result = await reviewDocument({ documentId: doc.id!, decision, note: note.trim() || null });
      if (!result.ok && result.fieldErrors?.note) form.setError('note', { message: result.fieldErrors.note });
      if (report(result, reject ? 'documents.toast.rejected' : 'documents.toast.approved')) onClose();
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="sm">
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>{reject ? t('review.rejectTitle') : t('review.approveTitle')}</DialogTitle>
              <DialogDescription>
                {reject ? t('review.rejectDescription', { name: nameOf(doc) }) : t('review.approveDescription', { name: nameOf(doc) })}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4 pb-5">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-subtle px-3 py-2.5">
                <FileTypeIcon doc={doc} className="size-4.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{typeLabel(doc.document_type)}</div>
                  <div className="truncate text-xs text-muted-foreground" dir="auto">
                    {doc.file_name}
                  </div>
                </div>
                {doc.storage_path ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={fileRouteUrl(BUCKETS.employeeDocuments, doc.storage_path)} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon />
                      {t('actions.open')}
                    </a>
                  </Button>
                ) : null}
              </div>
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required={reject} optional={!reject}>
                      {reject ? t('review.reasonLabel') : t('review.noteLabel')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        maxLength={1000}
                        placeholder={reject ? t('placeholders.rejectReason') : t('placeholders.approveNote')}
                        disabled={pending}
                        autoFocus={reject}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
                {tc('cancel')}
              </Button>
              <LoadingButton type="submit" pending={pending} variant={reject ? 'destructive' : 'default'}>
                {reject ? <XCircleIcon /> : <CheckCircle2Icon />}
                {reject ? t('actions.reject') : t('actions.approve')}
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Archive / restore / delete / withdraw ───────────────────────────────── */

function SimpleActionDialog({ kind, doc, onClose }: { kind: 'archive' | 'restore' | 'delete' | 'withdraw'; doc: DocumentSummary; onClose: () => void }) {
  const t = useTranslations('documents');
  const tc = useTranslations('common');
  const report = useResultToast();
  const config = {
    archive: { title: t('archive.title'), description: t('archive.description'), confirm: t('actions.archive'), danger: false, run: archiveDocument, ok: 'documents.toast.archived' },
    restore: { title: tc('confirmActionTitle'), description: undefined, confirm: t('actions.restore'), danger: false, run: restoreDocument, ok: 'documents.toast.restored' },
    delete: { title: t('delete.title'), description: t('delete.description'), confirm: t('actions.delete'), danger: true, run: deleteDocument, ok: 'documents.toast.deleted' },
    withdraw: { title: t('delete.withdrawTitle'), description: t('delete.withdrawDescription'), confirm: t('actions.withdraw'), danger: true, run: deleteDocument, ok: 'documents.toast.withdrawn' },
  }[kind];

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={config.title}
      description={config.description}
      confirmLabel={config.confirm}
      variant={config.danger ? 'danger' : 'default'}
      onConfirm={async () => {
        const result = await config.run({ documentId: doc.id! });
        return report(result, config.ok);
      }}
    />
  );
}
