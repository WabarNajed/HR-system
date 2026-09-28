'use client';

import { RotateCcwIcon, SaveIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { type DropzoneFileState } from '@/components/shared/file-dropzone';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useErrorMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addRequestComment, deleteAttachment, saveRequestDraft, submitRequest } from '../actions';
import { attachmentsFor, buildRequestPayload, validateRequestValues } from '../form-logic';
import type { AttachmentItem, FormLookups, RequestField } from '../types';
import { uploadPendingAttachments } from '../upload';
import { LeaveInsight, type LeaveInsightState } from './leave-insight';
import { RequestFormRenderer } from './request-form-renderer';

type Existing = AttachmentItem & { kind: 'existing' };
type Pending = AttachmentItem & { kind: 'pending' };

/**
 * "Edit & resubmit" for a returned request (and quick edits of a draft): the same dynamic form as
 * the wizard, attachment uploads, then update_request_draft → submit_request (the workflow resumes
 * at the step that returned it). An optional note is posted as a comment first.
 */
export function RequestEditForm({
  requestId,
  typeId,
  employeeId,
  status,
  fields,
  initialValues,
  attachments,
  lookups,
  allowAttachments,
}: {
  requestId: string;
  typeId: string;
  employeeId: string;
  status: 'returned' | 'draft';
  fields: RequestField[];
  initialValues: Record<string, unknown>;
  attachments: Existing[];
  lookups: FormLookups;
  allowAttachments: boolean;
}) {
  const t = useTranslations('requests.edit');
  const tr = useTranslations('requests');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const router = useRouter();
  const noteId = useId();
  const active = fields.filter((f) => f.is_active !== false);
  const attachmentKeys = new Set(active.filter((f) => f.field_type === 'attachment').map((f) => f.key));

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v = { ...initialValues };
    for (const a of attachments) if (a.fieldKey && attachmentKeys.has(a.fieldKey)) v[a.fieldKey] = [...attachmentsFor(v[a.fieldKey]), a];
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<string, DropzoneFileState>>({});
  const [leave, setLeave] = useState<LeaveInsightState>({ preview: null, blocking: [] });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState('');
  const isLeave = active.some((f) => f.field_type === 'leave_type');
  const generalCount = attachments.filter((a) => !a.fieldKey || !attachmentKeys.has(a.fieldKey)).length;

  const onChange = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)));
  };

  const save = async (): Promise<boolean> => {
    const payload = buildRequestPayload(active, values);
    const res = await saveRequestDraft({ requestId, typeId, values: payload.values, subtype: payload.subtype });
    if (!res.ok) {
      if (res.fieldErrors) setErrors((e) => ({ ...e, ...res.fieldErrors }));
      toast.error(resolve(res.error));
      return false;
    }
    const pending: Pending[] = active
      .filter((f) => f.field_type === 'attachment')
      .flatMap((f) => attachmentsFor(values[f.key]).filter((a): a is Pending => a.kind === 'pending'));
    if (pending.length) {
      const out = await uploadPendingAttachments(requestId, pending, (key, s) => setUploadStates((m) => ({ ...m, [key]: s.error ? { ...s, error: resolve(s.error) } : s })));
      setValues((v) => {
        const copy = { ...v };
        for (const key of attachmentKeys) copy[key] = attachmentsFor(copy[key]).map((a) => (a.kind === 'pending' && out.uploaded.has(a.id) ? out.uploaded.get(a.id)! : a));
        return copy;
      });
      if (out.failed.length) {
        toast.error(tr('wizard.uploadFailed', { name: out.failed[0]!.item.file.name }), { description: resolve(out.failed[0]!.error) });
        return false;
      }
    }
    return true;
  };

  const onSave = async () => {
    setBusy('save');
    try {
      if (await save()) {
        toast.success(tr('toast.changesSaved'));
        router.refresh();
      }
    } catch {
      toast.error(resolve('errors.network'));
    } finally {
      setBusy(null);
    }
  };

  const openResubmit = () => {
    const errs = validateRequestValues(active, values, { generalAttachments: generalCount });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error(tc('form.fixErrors'));
      return;
    }
    if (isLeave && leave.blocking.length) {
      toast.error(resolve(`errors.${leave.blocking[0]!}`));
      return;
    }
    setConfirmOpen(true);
  };

  const onResubmit = async () => {
    if (busy) return;
    setBusy('submit');
    try {
      if (!(await save())) return;
      if (note.trim()) {
        const c = await addRequestComment({ requestId, body: note.trim(), internal: false });
        if (!c.ok) toast.error(resolve(c.error));
        // Posted: a retry after a failed submit must not post the same note twice.
        else setNote('');
      }
      const res = await submitRequest({ requestId });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(resolve(res.error));
        setConfirmOpen(false);
        return;
      }
      setConfirmOpen(false);
      toast.success(status === 'returned' ? tr('toast.resubmitted', { number: res.data?.number ?? '' }) : tr('toast.submittedNumber', { number: res.data?.number ?? '' }));
      router.replace(`/requests/${requestId}`);
      router.refresh();
    } catch {
      toast.error(resolve('errors.network'));
    } finally {
      setBusy(null);
    }
  };

  const computed =
    isLeave && leave.preview?.days !== null && leave.preview?.days !== undefined && values.start_date && values.end_date
      ? { days: leave.preview.basis === 'calendar' ? tr('leave.calendarDaysCount', { count: leave.preview.days }) : tr('leave.workingDaysCount', { count: leave.preview.days }) }
      : undefined;

  return (
    <SectionCard
      title={t('title')}
      description={status === 'returned' ? t('descriptionReturned') : t('descriptionDraft')}
      icon={<RotateCcwIcon />}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button asChild variant="ghost" className="me-auto">
            <Link href={`/requests/${requestId}`}>
              <XIcon />
              {t('discard')}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void onSave()} loading={busy === 'save'} disabled={busy !== null}>
            <SaveIcon />
            {t('save')}
          </Button>
          <Button onClick={openResubmit} disabled={busy !== null} className="min-w-32">
            <RotateCcwIcon />
            {status === 'returned' ? t('resubmit') : t('submit')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {isLeave ? (
          <LeaveInsight
            employeeId={employeeId}
            leaveTypeId={typeof values.leave_type === 'string' ? values.leave_type : null}
            start={typeof values.start_date === 'string' ? values.start_date : null}
            end={typeof values.end_date === 'string' ? values.end_date : null}
            requestId={requestId}
            leaveTypes={lookups.leaveTypes}
            onChange={setLeave}
          />
        ) : null}
        <RequestFormRenderer
          fields={active}
          values={values}
          onChange={onChange}
          errors={errors}
          context={{
            employeeId,
            lookups,
            computed,
            uploadStates,
            disabled: busy !== null,
            allowAttachments,
            onRemoveAttachment: async (item) => {
              const res = await deleteAttachment({ attachmentId: item.id });
              if (!res.ok) {
                toast.error(resolve(res.error));
                return false;
              }
              toast.success(tr('toast.attachmentRemoved'));
              return true;
            },
          }}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => busy === null && setConfirmOpen(o)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{status === 'returned' ? t('confirmTitle') : t('confirmSubmitTitle')}</DialogTitle>
            <DialogDescription>{status === 'returned' ? t('confirmDescription') : t('confirmSubmitDescription')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5 pb-4">
            <Label htmlFor={noteId}>{t('noteLabel')}</Label>
            <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder={t('notePlaceholder')} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy !== null}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void onResubmit()} loading={busy === 'submit'} className="min-w-28">
              {status === 'returned' ? t('resubmit') : t('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
