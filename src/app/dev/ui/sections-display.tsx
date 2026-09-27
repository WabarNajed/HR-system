'use client';

import { CheckCircle2Icon, FileUpIcon, MessageSquareIcon, SendIcon, UndoIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { useState } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Timeline } from '@/components/shared/timeline';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Kbd } from '@/components/ui/kbd';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GallerySection, useDevLabel } from './dev-label';

export function DisplaySection() {
  const t = useTranslations();
  const L = useDevLabel();
  const fmt = useDateFormat();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 8, 27));

  return (
    <GallerySection id="display" title={L('عرض البيانات', 'Data display')}>
      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title={L('البيانات الشخصية', 'Personal information')}
          description={t('profile.description')}
          actions={
            <Button variant="outline" size="sm">
              {t('common.edit')}
            </Button>
          }
        >
          <div className="mb-5 flex flex-wrap items-center gap-4">
            <EmployeeAvatar name="Noura Al-Qahtani" seed="sample-2" size="xl" />
            <div className="min-w-0">
              <p className="text-base font-semibold">نورة القحطاني</p>
              <p className="text-meta text-muted-foreground">Noura Al-Qahtani</p>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge domain="employment" status="active" size="sm" />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <bdi>E-01043</bdi>
                  <CopyButton value="E-01043" />
                </span>
              </div>
            </div>
          </div>
          <KeyValueGrid
            items={[
              { label: t('common.email'), value: 'noura.alqahtani@example.com', ltr: true },
              { label: t('common.mobile'), value: '0551234567', ltr: true },
              { label: t('enums.idType.iqama'), value: '2456789012', ltr: true, hint: fmt.hijri('2027-03-14') },
              { label: t('enums.gender.female'), value: t('enums.maritalStatus.married') },
              { label: t('common.department'), value: t('nav.items.employees') },
              { label: t('common.manager'), value: null },
              { label: t('common.notes'), value: t('nav.settings.descriptions.organization'), span: 'full' },
            ]}
          />
        </SectionCard>

        <SectionCard title={L('سجل الطلب', 'Request history')} dense>
          <Timeline
            dense
            items={[
              { id: '1', title: t('enums.requestAction.complete'), actor: 'Reem Al-Harbi', time: '2026-09-24T10:20:00Z', icon: CheckCircle2Icon, tone: 'success' },
              { id: '2', title: t('enums.requestAction.comment'), actor: 'Khalid Al-Shehri', time: '2026-09-23T13:05:00Z', icon: MessageSquareIcon, tone: 'info', content: <p className="rounded-md bg-muted px-3 py-2 text-meta">{t('errors.notFound')}</p> },
              { id: '3', title: t('enums.requestAction.return'), actor: 'Khalid Al-Shehri', time: '2026-09-22T08:40:00Z', icon: UndoIcon, tone: 'secondary' },
              { id: '4', title: t('enums.requestAction.submit'), actor: 'Noura Al-Qahtani', time: '2026-09-21T07:15:00Z', icon: SendIcon, tone: 'primary' },
              { id: '5', title: t('dataManagement.title'), time: '2026-09-20T07:00:00Z', icon: FileUpIcon },
            ]}
          />
        </SectionCard>

        <SectionCard title={L('التبويبات', 'Tabs')} className="xl:col-span-2">
          <Tabs defaultValue="overview">
            <TabsList variant="line">
              <TabsTrigger value="overview">{L('نظرة عامة', 'Overview')}</TabsTrigger>
              <TabsTrigger value="leave">{t('nav.items.leave')}</TabsTrigger>
              <TabsTrigger value="documents">{t('nav.items.documents')}</TabsTrigger>
              <TabsTrigger value="requests">{t('nav.items.requests')}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-sm text-muted-foreground">
              {t('employees.description')}
            </TabsContent>
            <TabsContent value="leave" className="text-sm text-muted-foreground">
              {t('leave.description')}
            </TabsContent>
            <TabsContent value="documents" className="text-sm text-muted-foreground">
              {t('documents.description')}
            </TabsContent>
            <TabsContent value="requests" className="text-sm text-muted-foreground">
              {t('requests.description')}
            </TabsContent>
          </Tabs>
          <Separator className="my-5" />
          <div className="flex flex-wrap items-center gap-4">
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
                <TabsTrigger value="pending">{t('statuses.approval.pending')}</TabsTrigger>
                <TabsTrigger value="done">{t('statuses.request.completed')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <SegmentedTabs
              size="sm"
              value={period}
              onValueChange={setPeriod}
              items={[
                { value: 'week', label: L('أسبوع', 'Week') },
                { value: 'month', label: L('شهر', 'Month') },
                { value: 'year', label: L('سنة', 'Year') },
              ]}
            />
          </div>
          <Separator className="my-5" />
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="a">
              <AccordionTrigger>{t('nav.settings.items.security')}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{t('nav.settings.descriptions.security')}</AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>{t('nav.settings.items.workflows')}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{t('nav.settings.descriptions.workflows')}</AccordionContent>
            </AccordionItem>
          </Accordion>
          <Collapsible className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('common.showMore')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="text-sm text-muted-foreground">{t('nav.settings.descriptions.backup')}</CollapsibleContent>
          </Collapsible>
        </SectionCard>

        <SectionCard title={L('التقويم', 'Calendar')} bodyClassName="flex justify-center">
          <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border border-border" />
        </SectionCard>

        <SectionCard title={L('جدول بسيط', 'Basic table')} flush className="xl:col-span-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.employee')}</TableHead>
                <TableHead>{t('common.type')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-end">{L('الأيام', 'Days')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['sample-1', 'عبدالله العتيبي', 'Abdullah Al-Otaibi', 'annual', 'approved', 5],
                ['sample-4', 'سارة الدوسري', '', 'sick', 'pending_hr_review', 2],
                ['sample-7', 'خالد الشهري', 'Khalid Al-Shehri', 'emergency', 'rejected', 1],
              ].map(([id, ar, en, type, status, days]) => (
                <TableRow key={id as string}>
                  <TableCell>
                    <EmployeeCell employee={{ id: id as string, name_ar: ar as string, name_en: en as string }} size="sm" />
                  </TableCell>
                  <TableCell>{L(type === 'annual' ? 'سنوية' : type === 'sick' ? 'مرضية' : 'اضطرارية', String(type))}</TableCell>
                  <TableCell>
                    <StatusBadge domain="request" status={status as string} />
                  </TableCell>
                  <TableCell className="text-end">{days}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              <Kbd>Esc</Kbd>
            </span>
            <Pagination className="justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#display" label={t('common.previous')} />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#display">1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#display" isActive>
                    2
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#display" label={t('common.next')} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </SectionCard>

        <SectionCard title={L('ألوان الرسوم البيانية', 'Chart palette')}>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="space-y-1">
                <div className="h-10 rounded-md" style={{ backgroundColor: `var(--chart-${n})` }} />
                <p className="text-center font-mono text-[0.6875rem] text-muted-foreground">chart-{n}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            {(['xs', 'sm', 'md', 'lg'] as const).map((s, i) => (
              <EmployeeAvatar key={s} name={['Sultan Al-Harbi', 'ريم الزهراني', 'Faisal', 'لمى الدوسري'][i]!} size={s} />
            ))}
          </div>
        </SectionCard>
      </div>
    </GallerySection>
  );
}
