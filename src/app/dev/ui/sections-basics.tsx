'use client';

import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  DownloadIcon,
  InfoIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
  XCircleIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Forbidden } from '@/components/shared/forbidden';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { SlaBadge } from '@/components/shared/sla-badge';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DemoLabel, GallerySection, useDevLabel } from './dev-label';

export function KpiSection() {
  const t = useTranslations();
  const L = useDevLabel();
  return (
    <GallerySection id="kpis" title={L('ترويسة الصفحة والمؤشرات', 'Page header & KPIs')}>
      <div className="flex flex-col gap-5">
        <PageHeader
          breadcrumbs={[{ label: t('nav.breadcrumb.home'), href: '/dev/ui' }, { label: t('nav.groups.people'), href: '/dev/ui' }, { label: t('employees.title') }]}
          title={t('employees.title')}
          description={t('employees.description')}
          actions={
            <>
              <Button variant="outline">
                <UploadIcon />
                {t('common.import')}
              </Button>
              <Button variant="outline">
                <DownloadIcon />
                {t('common.export')}
              </Button>
              <Button>
                <PlusIcon />
                {t('nav.header.addEmployee')}
              </Button>
            </>
          }
          tabs={
            <LinkTabs
              items={[
                { value: 'all', label: t('common.all'), count: 248 },
                { value: 'active', label: t('statuses.employment.active'), count: 231 },
                { value: 'probation', label: t('statuses.employment.probation'), count: 9 },
                { value: 'on_leave', label: t('statuses.employment.on_leave'), count: 8 },
              ]}
            />
          }
        />
        <KpiGrid count={4}>
          <StatCard label={t('employees.title')} value="248" icon={UsersIcon} tone="primary" delta={{ value: '+4', direction: 'up', label: L('منذ الشهر الماضي', 'vs last month') }} href="#kpis" />
          <StatCard label={t('requests.title')} value="37" icon={ClipboardListIcon} tone="info" hint={L('12 بانتظار مراجعة الموارد البشرية', '12 pending HR review')} />
          <StatCard label={t('statuses.sla.overdue')} value="5" icon={AlertTriangleIcon} tone="danger" delta={{ value: '+2', direction: 'up', positive: false }} />
          <StatCard label={t('enums.documentType.iqama')} value="14" icon={CalendarClockIcon} tone="warning" hint={t('enums.expiryBucket.within30')} />
        </KpiGrid>
        <KpiGrid count={4}>
          <StatCard label="" value="" loading />
          <StatCard label={t('statuses.request.approved')} value="112" icon={CheckCircle2Icon} tone="success" />
          <StatCard label={t('statuses.request.returned')} value="3" icon={InfoIcon} tone="secondary" />
          <StatCard label={t('statuses.request.cancelled')} value="0" icon={XCircleIcon} tone="neutral" />
        </KpiGrid>
      </div>
    </GallerySection>
  );
}

export function ButtonsSection() {
  const t = useTranslations();
  const L = useDevLabel();
  const requestStatuses = ['draft', 'submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'];
  return (
    <GallerySection id="buttons" title={L('الأزرار والشارات', 'Buttons & badges')}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <DemoLabel>{L('الأنماط', 'Variants')}</DemoLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Button>{t('common.save')}</Button>
            <Button variant="secondary">{t('common.cancel')}</Button>
            <Button variant="outline">{t('common.edit')}</Button>
            <Button variant="soft">{t('common.preview')}</Button>
            <Button variant="ghost">{t('common.more')}</Button>
            <Button variant="link">{t('common.viewAll')}</Button>
            <Button variant="destructive">
              <Trash2Icon />
              {t('common.delete')}
            </Button>
          </div>
          <DemoLabel>
            <span className="mt-5 block">{L('الأحجام والحالات', 'Sizes & states')}</span>
          </DemoLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t('common.submit')}</Button>
            <Button size="md">{t('common.submit')}</Button>
            <Button size="lg">
              <SendIcon />
              {t('common.submit')}
            </Button>
            <Button loading>{t('common.saving')}</Button>
            <Button disabled variant="outline">
              {t('common.disabled')}
            </Button>
            <Button size="icon" variant="outline" aria-label={t('common.add')}>
              <PlusIcon />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={t('common.add')}>
              <PlusIcon />
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <DemoLabel>{L('الشارات', 'Badges')}</DemoLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{t('common.new')}</Badge>
            <Badge variant="solid">{t('common.active')}</Badge>
            <Badge variant="secondary">{t('statuses.request.returned')}</Badge>
            <Badge variant="outline">{t('common.optional')}</Badge>
            <Badge variant="success" dot>
              {t('statuses.document.valid')}
            </Badge>
            <Badge variant="warning" dot>
              {t('statuses.sla.due_soon')}
            </Badge>
            <Badge variant="danger" dot>
              {t('statuses.document.expired')}
            </Badge>
            <Badge variant="info" dot>
              {t('statuses.request.submitted')}
            </Badge>
            <Badge variant="neutral">{t('statuses.request.draft')}</Badge>
          </div>
          <DemoLabel>
            <span className="mt-5 block">{L('حالات الطلبات', 'Request statuses')}</span>
          </DemoLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {requestStatuses.map((s) => (
              <StatusBadge key={s} domain="request" status={s} />
            ))}
          </div>
          <DemoLabel>
            <span className="mt-5 block">{L('مستوى الخدمة', 'SLA')}</span>
          </DemoLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            <SlaBadge state="on_track" daysRemaining={4} dueLabel="04 Oct 2026" />
            <SlaBadge state="due_soon" daysRemaining={1} />
            <SlaBadge state="overdue" daysRemaining={-3} />
            <SlaBadge state={null} />
          </div>
        </div>
      </div>
    </GallerySection>
  );
}

export function FeedbackSection() {
  const t = useTranslations();
  const L = useDevLabel();
  return (
    <GallerySection id="feedback" title={L('الحالات والتنبيهات', 'States & feedback')}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Alert variant="info">
            <InfoIcon />
            <AlertTitle>{t('errors.notConfigured')}</AlertTitle>
            <AlertDescription>{t('nav.settings.descriptions.emailTemplates')}</AlertDescription>
          </Alert>
          <Alert variant="success">
            <CheckCircle2Icon />
            <AlertTitle>{t('common.saved')}</AlertTitle>
          </Alert>
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertTitle>{t('enums.expiryBucket.within30')}</AlertTitle>
            <AlertDescription>{t('errors.insufficientBalance')}</AlertDescription>
            <AlertActions>
              <Button size="sm" variant="outline">
                {t('common.viewDetails')}
              </Button>
            </AlertActions>
          </Alert>
          <Alert variant="danger">
            <XCircleIcon />
            <AlertTitle>{t('errors.generic')}</AlertTitle>
          </Alert>
          <div className="rounded-lg border border-border bg-card p-5 shadow-card">
            <DemoLabel>{L('التقدم والتحميل', 'Progress & skeleton')}</DemoLabel>
            <div className="space-y-3">
              <Progress value={64} />
              <Progress value={82} tone="success" />
              <Progress value={30} tone="warning" />
              <Progress indeterminate />
              <div className="flex items-center gap-3 pt-2">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </div>
            <DemoLabel>
              <span className="mt-5 block">{L('الإشعارات المنبثقة', 'Toasts')}</span>
            </DemoLabel>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => toast.success(t('common.saved'))}>
                {L('نجاح', 'Success')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast.error(t('errors.generic'))}>
                {L('خطأ', 'Error')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast.info(t('common.processing'), { description: t('common.table.exportHint') })}>
                {L('معلومة', 'Info')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast.warning(t('errors.sessionExpired'))}>
                {L('تحذير', 'Warning')}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <EmptyState
            variant="card"
            icon={ClipboardListIcon}
            title={t('common.table.emptyTitle')}
            description={t('common.table.emptyDescription')}
            action={
              <Button size="sm">
                <PlusIcon />
                {t('nav.items.newRequest')}
              </Button>
            }
          />
          <ErrorState onRetry={() => new Promise((r) => setTimeout(r, 800))} />
          <Forbidden variant="card" />
        </div>
      </div>
    </GallerySection>
  );
}
