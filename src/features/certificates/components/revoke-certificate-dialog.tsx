'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { revokeCertificate } from '../actions';
import { useActionToast } from './use-action-toast';

type Props = {
  certificate: { id: string; certificate_number: string } | null;
  onOpenChange: (open: boolean) => void;
};

/** Revoke with a mandatory reason (danger confirm). Controlled: open when `certificate` is set. */
export function RevokeCertificateDialog({ certificate, onOpenChange }: Props) {
  const t = useTranslations('certificates.revoke');
  const tv = useTranslations('validation');
  const { run } = useActionToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  return (
    <ConfirmDialog
      open={Boolean(certificate)}
      onOpenChange={(open) => {
        if (!open) {
          setReason('');
          setError(null);
        }
        onOpenChange(open);
      }}
      variant="danger"
      title={t('title', { number: certificate?.certificate_number ?? '' })}
      description={t('description')}
      confirmLabel={t('confirm')}
      onConfirm={async () => {
        if (!certificate) return false;
        if (reason.trim().length < 3) {
          setError(tv('required'));
          return false;
        }
        const result = await run(revokeCertificate({ id: certificate.id, reason: reason.trim() }));
        if (!result.ok) return false;
        setReason('');
        return true;
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={id}>
          {t('reason')} <span className="text-danger">*</span>
        </Label>
        <Textarea
          id={id}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t('reasonPlaceholder')}
          rows={3}
          maxLength={500}
          aria-invalid={Boolean(error)}
        />
        {error ? <p className="text-meta text-danger">{error}</p> : null}
      </div>
    </ConfirmDialog>
  );
}
