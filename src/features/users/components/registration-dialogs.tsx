'use client';

import { CheckCircle2Icon, MessageCircleQuestionIcon, TriangleAlertIcon, XCircleIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { approveRegistrationAction, rejectRegistrationAction, requestRegistrationInfoAction } from '../actions';
import type { RegistrationRow, RoleOption } from '../types';
import { EmployeePicker } from './employee-picker';
import { useActionFeedback } from './use-action-feedback';

function applicantName(r: Pick<RegistrationRow, 'fullName' | 'email'>): string {
  return r.fullName?.trim() || r.email || '—';
}

/** Approve: link to an employee (defaults to the suggested unlinked match), primary role, optional Manager. */
export function ApproveRegistrationDialog({
  registration,
  roles,
  isSuperAdmin,
  canAdminister,
  onOpenChange,
  onDone,
}: {
  registration: RegistrationRow | null;
  roles: readonly RoleOption[];
  isSuperAdmin: boolean;
  canAdminister: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const t = useTranslations('users.registrations.approve');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const initialSuggestion = registration?.match && !registration.match.linked ? registration.match : null;
  const [employeeId, setEmployeeId] = useState<string | null>(initialSuggestion?.id ?? null);
  const [roleKey, setRoleKey] = useState('employee');
  const [alsoManager, setAlsoManager] = useState(false);
  // Reset when another registration opens; keep the last one while the dialog animates out.
  const [shown, setShown] = useState(registration);
  if (registration && registration !== shown) {
    setShown(registration);
    setEmployeeId(registration.match && !registration.match.linked ? registration.match.id : null);
    setRoleKey('employee');
    setAlsoManager(false);
  }
  const suggestion = shown?.match && !shown.match.linked ? shown.match : null;

  const submit = () =>
    startTransition(async () => {
      if (!shown) return;
      const result = await run(approveRegistrationAction({ profileId: shown.id, employeeId, roleKey, alsoManager }), {
        warnOn: ['users.toast.approvedWithoutManager'],
      });
      if (result.ok) {
        onOpenChange(false);
        onDone?.();
      }
    });

  const selectable = roles.filter((r) => r.key !== 'super_admin' || isSuperAdmin);

  return (
    <Dialog open={Boolean(registration)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: shown ? applicantName(shown) : '' })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="approve-employee">{t('employee')}</Label>
            <EmployeePicker
              id="approve-employee"
              value={employeeId}
              onChange={(p) => setEmployeeId(p?.id ?? null)}
              selected={
                suggestion
                  ? {
                      id: suggestion.id,
                      label: employeeDisplayName(suggestion, locale),
                      description: [suggestion.employee_number, localized(suggestion.department ?? null, 'name', locale)].filter(Boolean).join(' · '),
                    }
                  : null
              }
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">{suggestion ? t('employeeSuggested') : t('employeeHint')}</p>
          </div>
          {!employeeId ? (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>{t('noEmployeeWarning')}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="approve-role">{t('role')}</Label>
            <Select value={roleKey} onValueChange={setRoleKey} disabled={pending}>
              <SelectTrigger id="approve-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectable.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {localized({ name_ar: r.nameAr, name_en: r.nameEn }, 'name', locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {roleKey !== 'manager' && canAdminister ? (
            <label htmlFor="approve-manager" className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 hover:bg-subtle">
              <Checkbox id="approve-manager" checked={alsoManager} onCheckedChange={(v) => setAlsoManager(v === true)} disabled={pending} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-foreground">{t('alsoManager')}</span>
                <span className="block text-xs text-muted-foreground">{t('alsoManagerHint')}</span>
              </span>
            </label>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} loading={pending} className="min-w-32">
            {!pending ? <CheckCircle2Icon /> : null}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reject (reason required) or request more information (note required). */
export function ReviewNoteDialog({
  mode,
  registration,
  onOpenChange,
  onDone,
}: {
  mode: 'reject' | 'info';
  registration: RegistrationRow | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const t = useTranslations(mode === 'reject' ? 'users.registrations.reject' : 'users.registrations.info');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState(registration);
  if (registration && registration !== shown) {
    setShown(registration);
    setNote('');
    setTouched(false);
  }

  const invalid = note.trim().length < 3;

  const submit = () => {
    setTouched(true);
    if (invalid || !shown) return;
    startTransition(async () => {
      const action = mode === 'reject' ? rejectRegistrationAction : requestRegistrationInfoAction;
      const result = await run(action({ profileId: shown.id, note: note.trim() }));
      if (result.ok) {
        onOpenChange(false);
        onDone?.();
      }
    });
  };

  const Icon = mode === 'reject' ? XCircleIcon : MessageCircleQuestionIcon;

  return (
    <Dialog open={Boolean(registration)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: shown ? applicantName(shown) : '' })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-1.5 pb-4">
          <Label htmlFor="review-note">
            {t('label')}
            <span aria-hidden className="text-danger">
              *
            </span>
          </Label>
          <Textarea
            id="review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t('placeholder')}
            rows={4}
            maxLength={1000}
            aria-invalid={touched && invalid}
            disabled={pending}
            autoFocus
          />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-danger">{touched && invalid ? tv('required') : ''}</span>
            <span className="text-faint-foreground numeric">{note.length}/1000</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('visibility')}</p>
        </DialogBody>
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button variant={mode === 'reject' ? 'destructive' : 'default'} onClick={submit} loading={pending} className="min-w-32">
            {!pending ? <Icon /> : null}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
