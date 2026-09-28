import 'server-only';

import { emailProvider } from '@/lib/email/send';

export type EmailProviderStatus = {
  provider: 'resend' | 'smtp' | null;
  /** Sender address from `EMAIL_FROM` (display only; null when missing or invalid). */
  from: string | null;
  /** SMTP host (no credentials) when SMTP is used. */
  host: string | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email delivery configuration read from the server environment (never exposes secrets). */
export function getEmailProviderStatus(): EmailProviderStatus {
  const provider = emailProvider();
  const raw = process.env.EMAIL_FROM?.trim() ?? '';
  const match = /<([^>]+)>/.exec(raw);
  const address = (match ? match[1] : raw)?.trim() ?? '';
  return {
    provider,
    from: EMAIL_RE.test(address) ? raw : null,
    host: provider === 'smtp' ? (process.env.SMTP_HOST?.trim() ?? null) : null,
  };
}
