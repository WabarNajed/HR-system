'use client';

import { CheckIcon, ShieldAlertIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { resetOrganizationAction } from '../actions';
import { RESET_PHRASE } from '../lib/constants';
import { BackupDownloadButton } from './backup-download-button';

const DELETED = ['people', 'operations', 'structure', 'configuration', 'accounts', 'files'] as const;
const KEPT = ['admins', 'roles', 'audit', 'code'] as const;

export function ResetOrganization({ canReset, canBackup, lastReset }: { canReset: boolean; canBackup: boolean; lastReset: string | null }) {
  const t = useTranslations('backup.reset');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [backupDone, setBackupDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = backupDone && password.length > 0 && phrase === RESET_PHRASE && !pending;

  const close = (next: boolean) => {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setPassword('');
      setPhrase('');
      setBackupDone(false);
      setError(null);
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await resetOrganizationAction({ password, confirmation: phrase });
      } catch {
        res = { ok: false as const, error: 'errors.network' };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(resolve(res.message ?? 'backup.toast.resetDone'));
      // Full reload after the reset: the session is gone and every cached client state is stale.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login?next=%2Fsetup');
    });
  };

  const startButton = (
    <Button variant="destructive" onClick={() => setOpen(true)} disabled={!canReset}>
      <ShieldAlertIcon />
      {t('start')}
    </Button>
  );

  return (
    <section className="rounded-lg border border-danger/35 bg-card shadow-card" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-3 border-b border-danger/20 bg-danger-soft/40 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger ring-1 ring-danger/20 ring-inset">
            <TriangleAlertIcon className="size-[1.125rem]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-card-title text-foreground">
              {t('title')}
            </h2>
            <p className="mt-0.5 max-w-2xl text-meta text-muted-foreground">{t('description')}</p>
            {lastReset ? <p className="mt-1 text-xs text-muted-foreground">{lastReset}</p> : null}
          </div>
        </div>
        <div className="shrink-0">
          {canReset ? (
            startButton
          ) : (
            <SimpleTooltip content={t('onlySuperAdmin')}>
              <span tabIndex={0} className="inline-flex">
                {startButton}
              </span>
            </SimpleTooltip>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <h3 className="mb-2 text-xs font-semibold text-danger">{t('deletedTitle')}</h3>
          <ul className="flex flex-col gap-1.5">
            {DELETED.map((k) => (
              <li key={k} className="flex items-start gap-2 text-meta text-foreground">
                <XIcon className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
                {t(`deleted.${k}`)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold text-success">{t('keptTitle')}</h3>
          <ul className="flex flex-col gap-1.5">
            {KEPT.map((k) => (
              <li key={k} className="flex items-start gap-2 text-meta text-foreground">
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {t(`kept.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-meta font-medium text-foreground">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t('backupFirst')}
        </p>
        {canBackup ? <BackupDownloadButton variant="outline" size="sm" className="shrink-0" /> : null}
      </div>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <TriangleAlertIcon className="size-5" aria-hidden />
              {t('dialogTitle')}
            </DialogTitle>
            <DialogDescription>{t('dialogDescription')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft/50 p-3">
              <p className="text-meta text-foreground">{t('backupFirst')}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`${id}-backup`} className="flex items-center gap-2 font-normal">
                  <Checkbox id={`${id}-backup`} checked={backupDone} onCheckedChange={(v) => setBackupDone(v === true)} />
                  {t('backupDone')}
                </Label>
                {canBackup ? <BackupDownloadButton variant="outline" size="sm" onDownloaded={() => setBackupDone(true)} /> : null}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-password`}>{t('password')}</Label>
              <Input
                id={`${id}-password`}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error === 'backup.errors.wrongPassword' || undefined}
              />
              <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-phrase`} className="font-normal text-muted-foreground">
                {t('phrase', { phrase: RESET_PHRASE })}
              </Label>
              <Input
                id={`${id}-phrase`}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                placeholder={RESET_PHRASE}
                className="font-mono text-meta"
              />
            </div>
            {error ? (
              <Alert variant="danger">
                <AlertDescription>{resolve(error)}</AlertDescription>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)} disabled={pending}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={submit} disabled={!ready} loading={pending}>
              {pending ? t('resetting') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
