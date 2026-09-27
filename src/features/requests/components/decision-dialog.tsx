'use client';

import {
  BanIcon,
  CheckCircle2Icon,
  CircleCheckBigIcon,
  PlayIcon,
  Undo2Icon,
  UserRoundCogIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useErrorMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { actOnRequest, searchAssignees, type AssigneeOption } from '../actions';
import type { RequestActionKind } from '../schemas';

export type DecisionTarget = {
  id: string;
  number: string | null;
  /** Localized "type · employee" line shown under the title. */
  summary?: string;
};

const META: Record<RequestActionKind, { icon: LucideIcon; tone: 'primary' | 'danger' | 'warning' | 'success'; comment: 'required' | 'optional' | 'none' }> = {
  approve: { icon: CheckCircle2Icon, tone: 'success', comment: 'optional' },
  reject: { icon: XCircleIcon, tone: 'danger', comment: 'required' },
  return: { icon: Undo2Icon, tone: 'warning', comment: 'required' },
  reassign: { icon: UserRoundCogIcon, tone: 'primary', comment: 'optional' },
  start: { icon: PlayIcon, tone: 'primary', comment: 'none' },
  complete: { icon: CircleCheckBigIcon, tone: 'success', comment: 'optional' },
  cancel: { icon: BanIcon, tone: 'danger', comment: 'optional' },
};

const TONE_CLASS = {
  primary: 'bg-primary-soft text-primary',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
} as const;

/**
 * Confirm dialog for a workflow action (act_on_request): approve / reject / return (comment
 * required) / reassign (pick an eligible user) / start / complete / cancel. Toasts the result and
 * refreshes the current route.
 */
export function DecisionDialog({
  action,
  target,
  open,
  onOpenChange,
  reassignScope,
  onDone,
}: {
  action: RequestActionKind | null;
  target: DecisionTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reassignScope?: 'fulfilment' | 'hr' | 'approver';
  onDone?: (status: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!action || !target) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent size="sm">
        {/* The form lives inside the content so its state resets every time the dialog opens. */}
        <DecisionForm
          action={action}
          target={target}
          reassignScope={reassignScope}
          busy={busy}
          setBusy={setBusy}
          onClose={() => onOpenChange(false)}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  );
}

function DecisionForm({
  action,
  target,
  reassignScope,
  busy,
  setBusy,
  onClose,
  onDone,
}: {
  action: RequestActionKind;
  target: DecisionTarget;
  reassignScope?: 'fulfilment' | 'hr' | 'approver';
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
  onDone?: (status: string | null) => void;
}) {
  const t = useTranslations('requests.decision');
  const tc = useTranslations('common');
  const tAll = useTranslations();
  const resolve = useErrorMessage();
  const router = useRouter();
  const locale = useLocale() as Locale;
  const commentId = useId();
  const [comment, setComment] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = META[action];
  const Icon = meta.icon;
  const needsComment = meta.comment === 'required';

  const submit = async () => {
    if (needsComment && !comment.trim()) {
      setError('validation.required');
      return;
    }
    if (action === 'reassign' && !assignee) {
      setError('validation.selectOne');
      return;
    }
    setBusy(true);
    try {
      const res = await actOnRequest({ requestId: target.id, action, comment: comment.trim() || null, targetUserId: assignee });
      if (!res.ok) {
        const fieldError = res.fieldErrors?.comment ?? res.fieldErrors?.targetUserId;
        if (fieldError) setError(fieldError);
        toast.error(resolve(res.error));
        return;
      }
      toast.success(tAll(res.message as never, { number: target.number ?? '' } as never));
      setBusy(false);
      onClose();
      onDone?.(res.data?.status ?? null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const assigneeOption = (a: AssigneeOption): ComboboxOption => {
    const name = (locale === 'en' ? a.name_en || a.name_ar : a.name_ar || a.name_en) || a.full_name || a.email || '—';
    const job = locale === 'en' ? a.job_title_en || a.job_title_ar : a.job_title_ar || a.job_title_en;
    return { value: a.id, label: name, description: [a.employee_number, job, a.email].filter(Boolean).join(' · ') || undefined };
  };

  return (
    <>
      <DialogHeader className="flex-row items-start gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', TONE_CLASS[meta.tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1 pt-0.5">
          <DialogTitle>{t(`${action}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`${action}.description`)}
            {target.number || target.summary ? (
              <span className="mt-1.5 block text-xs text-muted-foreground">
                {target.number ? <bdi className="font-medium text-foreground numeric">{target.number}</bdi> : null}
                {target.number && target.summary ? ' · ' : null}
                {target.summary}
              </span>
            ) : null}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody className="space-y-4 pb-4">
        {action === 'reassign' ? (
          <div className="space-y-1.5">
            <Label>
              {t(`reassign.${reassignScope === 'approver' ? 'approverLabel' : 'handlerLabel'}`)}
              <span aria-hidden className="text-danger">
                *
              </span>
            </Label>
            <Combobox
              value={assignee}
              onChange={(v) => {
                setAssignee(v);
                setError(null);
              }}
              loadOptions={async (q) => {
                const res = await searchAssignees({ requestId: target.id, q });
                if (!res.ok) throw new Error(res.error);
                return (res.data ?? []).map(assigneeOption);
              }}
              timeout={20000}
              placeholder={t('reassign.placeholder')}
              searchPlaceholder={t('reassign.search')}
              emptyText={t('reassign.empty')}
              aria-invalid={error === 'validation.selectOne' || undefined}
            />
          </div>
        ) : null}
        {meta.comment !== 'none' ? (
          <div className="space-y-1.5">
            <Label htmlFor={commentId}>
              {needsComment ? t(`${action}.commentLabel` as never) : t('commentOptional')}
              {needsComment ? (
                <span aria-hidden className="text-danger">
                  *
                </span>
              ) : null}
            </Label>
            <Textarea
              id={commentId}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (error === 'validation.required') setError(null);
              }}
              rows={3}
              maxLength={2000}
              placeholder={needsComment ? t(`${action}.commentPlaceholder` as never) : t('commentPlaceholder')}
              aria-invalid={error === 'validation.required' || undefined}
              autoFocus={action !== 'reassign'}
            />
            {action === 'return' ? <p className="text-xs text-muted-foreground">{t('return.hint')}</p> : null}
          </div>
        ) : null}
        {error ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {resolve(error)}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {tc('cancel')}
        </Button>
        <Button variant={meta.tone === 'danger' ? 'destructive' : 'default'} onClick={() => void submit()} loading={busy} className="min-w-28">
          {t(`${action}.confirm`)}
        </Button>
      </DialogFooter>
    </>
  );
}
