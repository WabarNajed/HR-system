import { MailIcon, ShieldOffIcon, UserXIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AuthHeading } from '@/features/auth/components/auth-heading';
import { SignOutButton } from '@/features/auth/components/status-actions';
import { requireUser } from '@/lib/auth/guards';
import { getPublicBranding } from '@/lib/branding';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.disabled.title');

/** Account disabled by HR, or registration rejected. */
export default async function AccountDisabledPage() {
  const ctx = await requireUser();
  const { status } = ctx.profile;
  if (status === 'active') redirect('/dashboard');
  if (status === 'pending' || status === 'info_requested') redirect('/pending-approval');

  const [t, branding] = await Promise.all([getTranslations('auth.disabled'), getPublicBranding()]);
  const rejected = status === 'rejected';

  return (
    <div>
      <AuthHeading
        icon={rejected ? UserXIcon : ShieldOffIcon}
        tone="danger"
        title={rejected ? t('rejectedTitle') : t('title')}
        description={rejected ? t('rejectedDescription') : t('description')}
      />

      {rejected && ctx.profile.reviewNote ? (
        <Alert variant="danger" className="mb-5">
          <UserXIcon />
          <AlertTitle>{t('reason')}</AlertTitle>
          <AlertDescription>
            <p dir="auto" className="whitespace-pre-line text-start">{ctx.profile.reviewNote}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <bdi dir="ltr" className="min-w-0 truncate text-meta font-medium text-foreground">
            {ctx.user.email}
          </bdi>
          <StatusBadge domain="profile" status={status} />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <div className="text-sm font-medium text-foreground">{t('contactHr')}</div>
          {branding.hrEmail ? (
            <>
              <p className="mt-1 text-meta text-muted-foreground">{t('contactHrDescription')}</p>
              <Button asChild variant="soft" size="sm" className="mt-3">
                <a href={`mailto:${branding.hrEmail}`}>
                  <MailIcon />
                  <bdi dir="ltr">{branding.hrEmail}</bdi>
                </a>
              </Button>
            </>
          ) : (
            <p className="mt-1 text-meta text-muted-foreground">{t('noContact')}</p>
          )}
        </div>
      </div>

      <SignOutButton className="mt-5 w-full" />
    </div>
  );
}
