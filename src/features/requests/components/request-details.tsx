'use client';

import {
  ArrowLeftRightIcon,
  BanIcon,
  CheckCircle2Icon,
  CircleCheckBigIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  FilePenLineIcon,
  FlagIcon,
  LockIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  PencilLineIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  SkipForwardIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  UserRoundCogIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { FileDropzone, type DropzoneFileState } from '@/components/shared/file-dropzone';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Timeline, type TimelineItem } from '@/components/shared/timeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { UPLOAD_LIMITS } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { addRequestComment, deleteAttachment, deleteDraft, submitRequest } from '../actions';
import { ATTACHMENT_ACCEPT } from '../constants';
import type { RequestComment, RequestHistoryEntry, WorkflowStepState } from '../queries';
import type { RequestActionKind } from '../schemas';
import type { AttachmentItem, RequestCapabilities } from '../types';
import { uploadPendingAttachments } from '../upload';
import { DecisionDialog, type DecisionTarget } from './decision-dialog';
import { AttachmentList } from './request-form-renderer';

/* ─── Actions panel ───────────────────────────────────────────────────────── */

/** Only the actions the viewer may perform now (get_request_capabilities), each behind a dialog. */
export function RequestActionsPanel({
  requestId,
  number,
  summary,
  status,
  caps,
  compact,
  editing,
}: {
  requestId: string;
  number: string | null;
  summary: string;
  status: string;
  caps: RequestCapabilities;
  compact?: boolean;
  /** The edit & resubmit form is open (hide the button that opens it). */
  editing?: boolean;
}) {
  const t = useTranslations('requests.actions');
  const tr = useTranslations('requests');
  const resolve = useErrorMessage();
  const router = useRouter();
  const [action, setAction] = useState<RequestActionKind | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'submit' | null>(null);
  const target: DecisionTarget = { id: requestId, number, summary };

  const buttons: { key: string; label: string; icon: LucideIcon; variant: 'default' | 'outline' | 'destructive' | 'soft' | 'ghost'; onClick?: () => void; href?: string; primary?: boolean }[] = [];
  if (caps.can_approve) buttons.push({ key: 'approve', label: t('approve'), icon: CheckCircle2Icon, variant: 'default', onClick: () => setAction('approve'), primary: true });
  if (caps.can_return) buttons.push({ key: 'return', label: t('return'), icon: Undo2Icon, variant: 'outline', onClick: () => setAction('return') });
  if (caps.can_reject) buttons.push({ key: 'reject', label: t('reject'), icon: XCircleIcon, variant: 'outline', onClick: () => setAction('reject') });
  if (caps.can_start) buttons.push({ key: 'start', label: t('start'), icon: PlayIcon, variant: 'default', onClick: () => setAction('start'), primary: true });
  if (caps.can_complete) buttons.push({ key: 'complete', label: t('complete'), icon: CircleCheckBigIcon, variant: caps.can_start ? 'outline' : 'default', onClick: () => setAction('complete'), primary: !caps.can_start });
  if (caps.can_edit && status === 'returned' && !editing) buttons.push({ key: 'edit', label: t('editResubmit'), icon: FilePenLineIcon, variant: 'default', href: `/requests/${requestId}?edit=1`, primary: true });
  if (caps.can_edit && status === 'draft') {
    buttons.push({ key: 'continue', label: t('continueDraft'), icon: FilePenLineIcon, variant: 'default', href: `/requests/new?draft=${requestId}`, primary: true });
    buttons.push({ key: 'submit', label: t('submitDraft'), icon: SendIcon, variant: 'outline', onClick: () => setConfirm('submit') });
  }
  if (caps.can_reassign) buttons.push({ key: 'reassign', label: t('reassign'), icon: UserRoundCogIcon, variant: 'outline', onClick: () => setAction('reassign') });
  if (caps.can_cancel && status !== 'draft') buttons.push({ key: 'cancel', label: t('cancel'), icon: BanIcon, variant: 'ghost', onClick: () => setAction('cancel') });
  if (caps.can_delete) buttons.push({ key: 'delete', label: t('deleteDraft'), icon: Trash2Icon, variant: 'ghost', onClick: () => setConfirm('delete') });

  if (!buttons.length) {
    return compact ? null : (
      <SectionCard title={t('title')} dense>
        <p className="flex items-start gap-2 text-meta text-muted-foreground">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(`none.${status in NONE_KEYS ? NONE_KEYS[status as keyof typeof NONE_KEYS] : 'generic'}`)}
        </p>
      </SectionCard>
    );
  }

  const hasPrimary = buttons.some((b) => b.primary);
  const hintKey = status in NONE_KEYS ? NONE_KEYS[status as keyof typeof NONE_KEYS] : 'generic';
  const list = (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-1')}>
      {!hasPrimary && !compact && !editing ? (
        <p className="mb-1 flex items-start gap-2 rounded-md bg-subtle px-3 py-2 text-meta text-muted-foreground">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(`none.${hintKey}`)}
        </p>
      ) : null}
      {buttons.map((b) => {
        const Icon = b.icon;
        const cls = cn('w-full justify-center', b.variant === 'ghost' && b.key !== 'reassign' && 'text-danger hover:bg-danger-soft hover:text-danger', compact && b.primary && 'col-span-2');
        return b.href ? (
          <Button key={b.key} asChild variant={b.variant} className={cls}>
            <Link href={b.href}>
              <Icon />
              {b.label}
            </Link>
          </Button>
        ) : (
          <Button key={b.key} variant={b.variant} className={cls} onClick={b.onClick}>
            <Icon className={b.key === 'submit' ? 'rtl:-scale-x-100' : undefined} />
            {b.label}
          </Button>
        );
      })}
    </div>
  );

  return (
    <>
      {compact ? (
        <div className="rounded-lg border border-border bg-card p-3 shadow-card">{list}</div>
      ) : (
        <SectionCard title={t('title')} description={t('description')} dense>
          {list}
        </SectionCard>
      )}
      <DecisionDialog
        action={action}
        target={target}
        open={Boolean(action)}
        onOpenChange={(o) => !o && setAction(null)}
        reassignScope={caps.reassign_scope}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant="danger"
        title={tr('deleteDraft.title')}
        description={tr('deleteDraft.description')}
        confirmLabel={tr('deleteDraft.confirm')}
        onConfirm={async () => {
          const res = await deleteDraft({ requestId });
          if (!res.ok) {
            toast.error(resolve(res.error));
            return false;
          }
          toast.success(tr('toast.draftDeleted'));
          router.push('/requests?tab=drafts');
        }}
      />
      <ConfirmDialog
        open={confirm === 'submit'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('submitConfirmTitle')}
        description={t('submitConfirmDescription')}
        confirmLabel={t('submitDraft')}
        onConfirm={async () => {
          const res = await submitRequest({ requestId });
          if (!res.ok) {
            toast.error(resolve(res.error));
            return false;
          }
          toast.success(tr('toast.submittedNumber', { number: res.data?.number ?? '' }));
        }}
      />
    </>
  );
}

const NONE_KEYS = {
  completed: 'completed',
  rejected: 'rejected',
  cancelled: 'cancelled',
  pending_manager_approval: 'pending',
  pending_hr_review: 'pending',
  submitted: 'pending',
  approved: 'approved',
  in_progress: 'approved',
  returned: 'returned',
} as const;

/* ─── Workflow progress ───────────────────────────────────────────────────── */

const STATE_VISUAL: Record<string, { icon: LucideIcon; ring: string }> = {
  approved: { icon: CheckCircle2Icon, ring: 'bg-success-soft text-success' },
  current: { icon: CircleDotIcon, ring: 'bg-primary text-primary-foreground ring-primary/25' },
  rejected: { icon: XCircleIcon, ring: 'bg-danger-soft text-danger' },
  returned: { icon: Undo2Icon, ring: 'bg-warning-soft text-warning' },
  skipped: { icon: SkipForwardIcon, ring: 'bg-muted text-muted-foreground' },
  upcoming: { icon: CircleDashedIcon, ring: 'bg-muted text-faint-foreground' },
};

export function WorkflowProgress({
  steps,
  status,
  submittedAt,
  completedAt,
  requesterName,
  assigneeName,
}: {
  steps: WorkflowStepState[];
  status: string;
  submittedAt: string | null;
  completedAt: string | null;
  requesterName: string | null;
  assigneeName: string | null;
}) {
  const t = useTranslations('requests.workflow');
  const ts = useTranslations('enums.stepType');
  const tsk = useTranslations('requests.timeline.skipReasons');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const approvedAll = ['approved', 'in_progress', 'completed'].includes(status);
  type Node = { key: string; icon: LucideIcon; ring: string; title: string; subtitle: ReactNode; state: string; time?: string | null };
  const nodes: Node[] = [
    {
      key: 'submit',
      icon: SendIcon,
      ring: submittedAt ? 'bg-primary-soft text-primary' : 'bg-muted text-faint-foreground',
      title: t('submitted'),
      subtitle: requesterName ?? '—',
      state: submittedAt ? 'done' : 'upcoming',
      time: submittedAt,
    },
    ...steps.map((s) => {
      const v = STATE_VISUAL[s.state] ?? STATE_VISUAL.upcoming!;
      const typeLabel = ts.has(s.step_type as never) ? ts(s.step_type as never) : s.step_type;
      const who =
        s.state === 'skipped'
          ? s.comment && tsk.has(s.comment as never)
            ? tsk(s.comment as never)
            : t('skipped')
          : s.approver_name ?? (s.step_type === 'hr' && assigneeName ? assigneeName : typeLabel);
      return {
        key: `s${s.step_order}`,
        icon: v.icon,
        ring: v.ring,
        title: localized({ name_ar: s.name_ar, name_en: s.name_en }, 'name', locale),
        subtitle: who,
        state: s.state,
        time: s.decided_at,
      };
    }),
    {
      key: 'done',
      icon: FlagIcon,
      ring: status === 'completed' ? 'bg-success-soft text-success' : approvedAll ? 'bg-info-soft text-info' : 'bg-muted text-faint-foreground',
      title: status === 'completed' ? t('completed') : status === 'in_progress' ? t('inProgress') : t('completion'),
      subtitle: status === 'completed' ? t('completedHint') : approvedAll ? t('fulfilmentHint') : t('completionHint'),
      state: status === 'completed' ? 'done' : 'upcoming',
      time: completedAt,
    },
  ];

  return (
    <SectionCard title={t('title')} dense>
      <ol className="flex flex-col">
        {nodes.map((n, i) => {
          const Icon = n.icon;
          const last = i === nodes.length - 1;
          return (
            <li key={n.key} className={cn('relative flex gap-3', !last && 'pb-4')}>
              {!last ? <span aria-hidden className={cn('absolute start-[0.9375rem] top-8 bottom-0 w-px', n.state === 'upcoming' ? 'bg-border' : 'bg-border-strong')} /> : null}
              <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card', n.ring)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-medium', n.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>{n.title}</p>
                  {n.state === 'current' ? (
                    <Badge variant="default" size="sm" className="shrink-0">
                      {t('current')}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{n.subtitle}</p>
                {n.time ? <p className="mt-0.5 text-xs text-faint-foreground numeric">{fmt.dateTime(n.time)}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

/* ─── Attachments card ────────────────────────────────────────────────────── */

export function RequestAttachmentsCard({
  requestId,
  items,
  fieldLabels,
  canAttach,
  allowAttachments,
}: {
  requestId: string;
  items: (AttachmentItem & { kind: 'existing' })[];
  fieldLabels: Record<string, string>;
  canAttach: boolean;
  allowAttachments: boolean;
}) {
  const t = useTranslations('requests.attachments');
  const tr = useTranslations('requests');
  const resolve = useErrorMessage();
  const [files, setFiles] = useState<File[]>([]);
  const [states, setStates] = useState<Record<string, DropzoneFileState>>({});
  const [uploading, startUpload] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  const upload = () =>
    startUpload(async () => {
      const pending = files.map((file) => ({ kind: 'pending' as const, id: crypto.randomUUID(), file, fieldKey: null }));
      const out = await uploadPendingAttachments(requestId, pending, (key, s) => setStates((m) => ({ ...m, [key]: s.error ? { ...s, error: resolve(s.error) } : s })));
      if (out.failed.length) toast.error(tr('wizard.uploadFailed', { name: out.failed[0]!.item.file.name }), { description: resolve(out.failed[0]!.error) });
      if (out.uploaded.size) {
        toast.success(t('uploaded', { count: out.uploaded.size }));
        setFiles((f) => f.filter((file) => out.failed.some((x) => x.item.file === file)));
      }
    });

  const groups = new Map<string, (AttachmentItem & { kind: 'existing' })[]>();
  for (const item of items) {
    const label = (item.fieldKey && fieldLabels[item.fieldKey]) || t('general');
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  return (
    <SectionCard
      title={t('title')}
      icon={<PaperclipIcon />}
      actions={items.length ? <Badge variant="neutral" size="sm" className="numeric">{items.length}</Badge> : null}
      dense
    >
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-meta text-muted-foreground">{t('none')}</p>
        ) : (
          Array.from(groups.entries()).map(([label, list]) => (
            <div key={label} className="space-y-1.5">
              {groups.size > 1 ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
              <AttachmentList
                items={list}
                removingId={removing}
                onRemove={async (item) => {
                  setRemoving(item.id);
                  const res = await deleteAttachment({ attachmentId: item.id });
                  setRemoving(null);
                  if (!res.ok) {
                    toast.error(resolve(res.error));
                    return;
                  }
                  toast.success(tr('toast.attachmentRemoved'));
                }}
              />
            </div>
          ))
        )}
        {canAttach && allowAttachments ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <FileDropzone
              multiple
              compact
              maxFiles={10}
              maxSize={UPLOAD_LIMITS.attachment.maxBytes}
              accept={ATTACHMENT_ACCEPT}
              value={files}
              onChange={setFiles}
              fileStates={states}
              disabled={uploading}
            />
            {files.length ? (
              <div className="flex justify-end">
                <Button size="sm" onClick={upload} loading={uploading}>
                  <PaperclipIcon />
                  {t('upload', { count: files.length })}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

/* ─── Comments ────────────────────────────────────────────────────────────── */

export function RequestComments({
  requestId,
  comments,
  canComment,
  canInternal,
  currentUserId,
}: {
  requestId: string;
  comments: RequestComment[];
  canComment: boolean;
  canInternal: boolean;
  currentUserId: string;
}) {
  const t = useTranslations('requests.comments');
  const publicComments = comments.filter((c) => !c.is_internal);
  const internal = comments.filter((c) => c.is_internal);

  const body = (list: RequestComment[], isInternal: boolean) => (
    <div className="flex flex-col gap-4">
      {list.length ? (
        <ol className="flex flex-col gap-3.5">
          {list.map((c) => (
            <CommentItem key={c.id} comment={c} mine={c.author_id === currentUserId} />
          ))}
        </ol>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border-strong bg-subtle px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
            {isInternal ? <LockIcon className="size-4" aria-hidden /> : <MessageSquareTextIcon className="size-4" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{isInternal ? t('emptyInternalTitle') : t('emptyTitle')}</p>
            <p className="text-xs text-muted-foreground">{isInternal ? t('emptyInternalDescription') : t('emptyDescription')}</p>
          </div>
        </div>
      )}
      {canComment ? <CommentComposer requestId={requestId} internal={isInternal} /> : null}
    </div>
  );

  return (
    <SectionCard title={t('title')} icon={<MessageSquareTextIcon />} dense>
      {canInternal ? (
        <Tabs defaultValue="discussion" className="gap-4">
          <TabsList>
            <TabsTrigger value="discussion">
              {t('discussion')}
              <span className="ms-1 text-xs text-muted-foreground numeric">{publicComments.length}</span>
            </TabsTrigger>
            <TabsTrigger value="internal">
              <LockIcon className="size-3.5" aria-hidden />
              {t('internal')}
              <span className="ms-1 text-xs text-muted-foreground numeric">{internal.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="discussion">{body(publicComments, false)}</TabsContent>
          <TabsContent value="internal">
            <p className="mb-3 flex items-center gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
              <LockIcon className="size-3.5 shrink-0" aria-hidden />
              {t('internalHint')}
            </p>
            {body(internal, true)}
          </TabsContent>
        </Tabs>
      ) : (
        body(publicComments, false)
      )}
    </SectionCard>
  );
}

function CommentItem({ comment, mine }: { comment: RequestComment; mine: boolean }) {
  const t = useTranslations('requests.comments');
  const fmt = useDateFormat();
  const name = comment.author_name ?? t('unknownAuthor');
  return (
    <li className="flex gap-3">
      <EmployeeAvatar name={name} seed={comment.author_id ?? name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{name}</span>
          {mine ? <span className="text-xs text-muted-foreground">{t('you')}</span> : null}
          <time className="text-xs text-faint-foreground numeric" dateTime={comment.created_at}>
            {fmt.dateTime(comment.created_at)}
          </time>
        </div>
        <p
          dir="auto"
          className={cn(
            'mt-1 rounded-lg rounded-ss-sm border px-3 py-2 text-start text-sm whitespace-pre-line text-foreground',
            comment.is_internal ? 'border-warning/25 bg-warning-soft/50' : 'border-border bg-subtle',
          )}
        >
          {comment.body}
        </p>
      </div>
    </li>
  );
}

function CommentComposer({ requestId, internal }: { requestId: string; internal: boolean }) {
  const t = useTranslations('requests.comments');
  const resolve = useErrorMessage();
  const tAll = useTranslations();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  const post = () => {
    // Ctrl/⌘+Enter bypasses the disabled button: never post twice while a comment is in flight.
    if (!value.trim() || pending) return;
    start(async () => {
      const res = await addRequestComment({ requestId, body: value, internal });
      if (!res.ok) {
        toast.error(resolve(res.error));
        return;
      }
      toast.success(tAll(res.message as never));
      setValue('');
    });
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={internal ? t('internalPlaceholder') : t('placeholder')}
        rows={2}
        maxLength={5000}
        aria-label={internal ? t('internalPlaceholder') : t('placeholder')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post();
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-faint-foreground max-sm:hidden">{t('shortcut')}</span>
        <Button size="sm" onClick={post} loading={pending} disabled={!value.trim() || pending} variant={internal ? 'outline' : 'default'} className="ms-auto">
          {internal ? <LockIcon /> : <SendIcon className="rtl:-scale-x-100" />}
          {internal ? t('postInternal') : t('post')}
        </Button>
      </div>
    </div>
  );
}

/* ─── History timeline ────────────────────────────────────────────────────── */

const ACTION_VISUAL: Record<string, { icon: LucideIcon; tone: TimelineItem['tone'] }> = {
  create: { icon: SparklesIcon, tone: 'neutral' },
  update: { icon: PencilLineIcon, tone: 'info' },
  submit: { icon: SendIcon, tone: 'primary' },
  resubmit: { icon: RotateCcwIcon, tone: 'primary' },
  approve: { icon: CheckCircle2Icon, tone: 'success' },
  reject: { icon: XCircleIcon, tone: 'danger' },
  return: { icon: Undo2Icon, tone: 'warning' },
  reassign: { icon: ArrowLeftRightIcon, tone: 'info' },
  start: { icon: PlayIcon, tone: 'primary' },
  complete: { icon: CircleCheckBigIcon, tone: 'success' },
  cancel: { icon: BanIcon, tone: 'neutral' },
  comment: { icon: MessageSquareTextIcon, tone: 'neutral' },
  skip: { icon: SkipForwardIcon, tone: 'neutral' },
};

export function RequestHistory({ entries }: { entries: RequestHistoryEntry[] }) {
  const t = useTranslations('requests.timeline');
  const ta = useTranslations('enums.requestAction');
  const tb = useTranslations('statuses.leaveBalanceEffect');
  const locale = useLocale() as Locale;
  const items: TimelineItem[] = entries.map((h) => {
    const v = ACTION_VISUAL[h.action] ?? { icon: CircleIcon, tone: 'neutral' as const };
    const m = h.metadata ?? {};
    const stepName = typeof m.step_name_ar === 'string' || typeof m.step_name_en === 'string'
      ? localized({ name_ar: (m.step_name_ar as string) ?? null, name_en: (m.step_name_en as string) ?? null }, 'name', locale)
      : null;
    const leaveEffect = (m.effects as { leave?: { balance_effect?: { old?: string; new?: string }; days?: number } } | undefined)?.leave;
    const details: ReactNode[] = [];
    if (h.action === 'skip' && typeof m.reason === 'string') {
      const key = m.reason;
      details.push(t.has(`skipReasons.${key}` as never) ? t(`skipReasons.${key}` as never) : key);
    }
    if (h.action === 'reassign' && typeof m.target_name === 'string') details.push(t('reassignedTo', { name: m.target_name }));
    if (leaveEffect?.balance_effect?.new && leaveEffect.balance_effect.old !== leaveEffect.balance_effect.new) {
      const label = (s?: string) => (s && tb.has(s as never) ? tb(s as never) : s ?? '—');
      details.push(
        t('balanceEffect', {
          from: label(leaveEffect.balance_effect.old),
          to: label(leaveEffect.balance_effect.new),
          days: Number(leaveEffect.days ?? 0),
        }),
      );
    }
    const title = ta.has(h.action as never) ? ta(h.action as never) : h.action;
    return {
      id: h.id,
      title: stepName && ['approve', 'skip'].includes(h.action) ? `${title} · ${stepName}` : title,
      actor: h.actor_name ?? (h.action === 'skip' ? t('system') : undefined),
      time: h.created_at,
      icon: v.icon,
      tone: v.tone,
      description: details.length ? details.join(' · ') : undefined,
      content:
        h.note || (h.from_status && h.to_status && h.from_status !== h.to_status) ? (
          <div className="flex flex-col gap-2">
            {h.from_status && h.to_status && h.from_status !== h.to_status ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge domain="request" status={h.from_status} size="sm" dot={false} />
                <span className="text-xs text-faint-foreground rtl:rotate-180" aria-hidden>
                  →
                </span>
                <StatusBadge domain="request" status={h.to_status} size="sm" dot={false} />
              </div>
            ) : null}
            {h.note ? (
              <p dir="auto" className="rounded-md border border-border bg-subtle px-3 py-2 text-start text-meta whitespace-pre-line text-foreground">
                {h.note}
              </p>
            ) : null}
          </div>
        ) : undefined,
    };
  });
  return (
    <SectionCard title={t('title')} description={t('description')} dense>
      {items.length ? <Timeline items={items} dense /> : <p className="text-meta text-muted-foreground">{t('empty')}</p>}
    </SectionCard>
  );
}
