import 'server-only';

import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { htmlToText } from './render';

/**
 * Email delivery (ARCHITECTURE §2): Resend REST API when `RESEND_API_KEY` is set, else SMTP via
 * nodemailer when `SMTP_HOST` is set, else status `skipped`. Every attempt is written to
 * `email_logs` (RPC `log_email`, service role only; skipped with a warning without it). Never throws.
 */

export type EmailProvider = 'resend' | 'smtp';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Overrides the display name part of `EMAIL_FROM`. */
  fromName?: string | null;
  replyTo?: string | null;
  /** For `email_logs`. */
  templateKey?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
};

export type SendEmailResult = {
  status: 'sent' | 'failed' | 'skipped';
  provider: EmailProvider | null;
  providerMessageId?: string | null;
  /** Internal reason (logged, never shown to users). */
  error?: string | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function emailProvider(): EmailProvider | null {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.SMTP_HOST?.trim()) return 'smtp';
  return null;
}

/** `EMAIL_FROM` with an optional display-name override: `Name <addr>`. */
function fromAddress(fromName?: string | null): string | null {
  const raw = process.env.EMAIL_FROM?.trim();
  if (!raw) return null;
  const match = /<([^>]+)>/.exec(raw);
  const address = (match ? match[1] : raw)!.trim();
  if (!EMAIL_RE.test(address)) return null;
  const name = (fromName ?? (match ? raw.slice(0, raw.indexOf('<')).trim().replace(/^"|"$/g, '') : '')).replace(/[\r\n"<>]/g, '');
  return name ? `"${name}" <${address}>` : address;
}

async function sendViaResend(input: SendEmailInput, from: string, text: string): Promise<SendEmailResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { status: 'failed', provider: 'resend', error: `HTTP ${res.status}: ${body.message ?? body.name ?? 'error'}` };
    return { status: 'sent', provider: 'resend', providerMessageId: body.id ?? null };
  } catch (error) {
    return { status: 'failed', provider: 'resend', error: error instanceof Error ? error.message : String(error) };
  }
}

type Transporter = { sendMail: (options: Record<string, unknown>) => Promise<{ messageId?: string }> };
let smtpTransport: Promise<Transporter> | null = null;

async function getSmtpTransport(): Promise<Transporter> {
  if (!smtpTransport) {
    smtpTransport = import('nodemailer').then((mod) => {
      const nodemailer = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      const port = Number(process.env.SMTP_PORT) || 587;
      const secure = (process.env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true' || port === 465;
      const user = process.env.SMTP_USER?.trim();
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure,
        auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      }) as unknown as Transporter;
    });
    smtpTransport.catch(() => {
      smtpTransport = null;
    });
  }
  return smtpTransport;
}

async function sendViaSmtp(input: SendEmailInput, from: string, text: string): Promise<SendEmailResult> {
  try {
    const transport = await getSmtpTransport();
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    return { status: 'sent', provider: 'smtp', providerMessageId: info.messageId ?? null };
  } catch (error) {
    return { status: 'failed', provider: 'smtp', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Writes `email_logs` through RPC `log_email`, which is executable by the service role only
 * (docs/DATABASE.md §11). Without `SUPABASE_SERVICE_ROLE_KEY` nothing is logged: a server-side
 * warning is printed and the send itself is unaffected.
 */
export async function recordEmail(input: SendEmailInput, result: SendEmailResult): Promise<void> {
  if (!isAdminClientConfigured()) {
    console.warn(`[email] email_logs not written (${result.status}): SUPABASE_SERVICE_ROLE_KEY is not configured`);
    return;
  }
  try {
    const { error } = await createAdminClient().rpc('log_email', {
      p_recipient: input.to || '-',
      p_status: result.status,
      p_subject: input.subject ?? undefined,
      p_template_key: input.templateKey ?? undefined,
      p_related_entity_type: input.relatedEntityType ?? undefined,
      p_related_entity_id: input.relatedEntityId ?? undefined,
      p_provider: result.provider ?? undefined,
      p_provider_message_id: result.providerMessageId ?? undefined,
      p_error: result.error ? result.error.slice(0, 1000) : undefined,
    });
    if (error) console.error('[email] log_email failed:', error.code, error.message);
  } catch (error) {
    console.error('[email] log_email threw:', error instanceof Error ? error.message : error);
  }
}

/** Sends one email and logs it (`email_logs` via RPC `log_email`, service role). Never throws. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  let result: SendEmailResult;
  const to = input.to?.trim() ?? '';
  const provider = emailProvider();
  const from = fromAddress(input.fromName);

  if (!EMAIL_RE.test(to)) {
    result = { status: 'failed', provider, error: 'invalid recipient address' };
  } else if (!provider) {
    result = { status: 'skipped', provider: null, error: 'no email provider configured (RESEND_API_KEY / SMTP_HOST)' };
  } else if (!from) {
    result = { status: 'skipped', provider, error: 'EMAIL_FROM is not set or invalid' };
  } else {
    const text = input.text ?? htmlToText(input.html);
    const payload = { ...input, to };
    result = provider === 'resend' ? await sendViaResend(payload, from, text) : await sendViaSmtp(payload, from, text);
  }

  if (result.status === 'failed') console.error('[email] send failed:', result.provider, result.error);
  await recordEmail({ ...input, to: to || input.to }, result);
  return result;
}
