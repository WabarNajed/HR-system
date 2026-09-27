'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2Icon, EyeIcon, IdCardIcon, MessageCircleQuestionIcon, UserCheckIcon, XCircleIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type RowAction } from '@/components/data-table';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import type { MatchKind, RegistrationRow, RegistrationTab, RoleOption } from '../types';
import { ApproveRegistrationDialog, ReviewNoteDialog } from './registration-dialogs';
import { RelativeTime } from './relative-time';

type RegistrationsViewProps = {
  tab: RegistrationTab;
  rows: RegistrationRow[];
  total: number;
  roles: RoleOption[];
  canApprove: boolean;
  canAdminister: boolean;
  isSuperAdmin: boolean;
  /** Registration opened via `?review=<id>` (may be outside the current page). */
  initialReview: RegistrationRow | null;
};

function applicantName(r: Pick<RegistrationRow, 'fullName' | 'email'>): string {
  return r.fullName?.trim() || r.email || '—';
}

export function MatchBadge({ kind, linked }: { kind: MatchKind; linked?: boolean }) {
  const t = useTranslations('users.registrations.match');
  if (linked) return <Badge variant="warning" size="sm">{t('linked')}</Badge>;
  if (kind === 'number') return <Badge variant="success" size="sm">{t('number')}</Badge>;
  if (kind === 'nationalId') return <Badge variant="info" size="sm">{t('nationalId')}</Badge>;
  return <Badge variant="neutral" size="sm">{t('none')}</Badge>;
}

function MatchCell({ row }: { row: RegistrationRow }) {
  const locale = useLocale() as 'ar' | 'en';
  const t = useTranslations('users.registrations.match');
  const m = row.match;
  if (!m) {
    return (
      <div className="flex flex-col items-start gap-1">
        <MatchBadge kind="none" />
      </div>
    );
  }
  const dept = localized(m.department ?? null, 'name', locale);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <EmployeeAvatar name={employeeDisplayName(m, locale)} seed={m.id} size="sm" />
      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-meta font-medium text-foreground">{employeeDisplayName(m, locale)}</span>
          <MatchBadge kind={row.matchKind} linked={m.linked} />
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {[m.employee_number, dept].filter(Boolean).join(' · ') || t('noDepartment')}
        </div>
      </div>
    </div>
  );
}

export function RegistrationsView({ tab, rows, total, roles, canApprove, canAdminister, isSuperAdmin, initialReview }: RegistrationsViewProps) {
  const t = useTranslations('users.registrations');
  const tc = useTranslations('common');
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [details, setDetails] = useState<RegistrationRow | null>(initialReview);
  const [approve, setApprove] = useState<RegistrationRow | null>(null);
  const [reject, setReject] = useState<RegistrationRow | null>(null);
  const [info, setInfo] = useState<RegistrationRow | null>(null);

  const [prevInitial, setPrevInitial] = useState(initialReview);
  if (initialReview !== prevInitial) {
    setPrevInitial(initialReview);
    setDetails(initialReview);
  }

  const closeDetails = () => {
    setDetails(null);
    if (searchParams.get('review')) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('review');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  const reviewable = (r: RegistrationRow) => canApprove && (r.status === 'pending' || r.status === 'info_requested');

  const actionsFor = (r: RegistrationRow): RowAction<RegistrationRow>[] => [
    { label: t('actions.review'), icon: EyeIcon, onSelect: () => setDetails(r) },
    { label: t('actions.approve'), icon: CheckCircle2Icon, onSelect: () => setApprove(r), hidden: !reviewable(r), separatorBefore: true },
    { label: t('actions.requestInfo'), icon: MessageCircleQuestionIcon, onSelect: () => setInfo(r), hidden: !reviewable(r) },
    { label: t('actions.reject'), icon: XCircleIcon, variant: 'destructive', onSelect: () => setReject(r), hidden: !reviewable(r) },
    { label: t('actions.approve'), icon: CheckCircle2Icon, onSelect: () => setApprove(r), hidden: !(canApprove && r.status === 'rejected'), separatorBefore: true },
  ];

  const columns = useMemo<ColumnDef<RegistrationRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => applicantName(r),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.applicant')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <EmployeeAvatar name={applicantName(r)} seed={r.id} size="md" />
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium text-foreground">{applicantName(r)}</div>
                <bdi dir="ltr" className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {r.email}
                </bdi>
                {r.mobile ? (
                  <bdi dir="ltr" className="block truncate text-xs text-faint-foreground numeric">
                    {r.mobile}
                  </bdi>
                ) : null}
              </div>
            </div>
          );
        },
        meta: { label: t('columns.applicant'), width: '16rem' },
        enableHiding: false,
      },
      {
        id: 'enteredId',
        header: t('columns.enteredId'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.enteredId ? (
            <bdi className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-meta text-foreground">{row.original.enteredId}</bdi>
          ) : (
            <span className="text-faint-foreground">—</span>
          ),
        meta: { label: t('columns.enteredId') },
      },
      {
        id: 'match',
        header: t('columns.match'),
        enableSorting: false,
        cell: ({ row }) => <MatchCell row={row.original} />,
        meta: { label: t('columns.match'), width: '17rem' },
      },
      {
        id: 'submitted',
        accessorKey: tab === 'rejected' ? 'reviewedAt' : 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tab === 'rejected' ? t('columns.reviewed') : t('columns.submitted')} />,
        cell: ({ row }) => {
          const value = tab === 'rejected' ? (row.original.reviewedAt ?? row.original.updatedAt) : row.original.createdAt;
          return (
            <div className="leading-tight">
              <RelativeTime value={value} className="text-meta text-foreground" />
              <div className="text-xs text-muted-foreground numeric">{fmt.date(value)}</div>
            </div>
          );
        },
        meta: { label: t('columns.submitted') },
      },
      {
        id: 'status',
        header: tc('status'),
        enableSorting: false,
        cell: ({ row }) => <StatusBadge domain="profile" status={row.original.status} />,
        meta: { label: tc('status') },
      },
      actionsColumn<RegistrationRow>(actionsFor),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialog setters are stable
    [t, tc, tab, fmt, canApprove],
  );

  const emptyCopy = {
    pending: { title: t('empty.pending.title'), description: t('empty.pending.description') },
    info_requested: { title: t('empty.info_requested.title'), description: t('empty.info_requested.description') },
    rejected: { title: t('empty.rejected.title'), description: t('empty.rejected.description') },
  }[tab];

  return (
    <>
      <DataTable
        tableId={`registrations-${tab}`}
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDetails(r)}
        searchPlaceholder={t('searchPlaceholder')}
        defaultSort={{ id: 'submitted', desc: tab === 'rejected' }}
        maxHeight="none"
        emptyState={{ icon: UserCheckIcon, ...emptyCopy }}
        renderMobileCard={(r) => (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <EmployeeAvatar name={applicantName(r)} seed={r.id} size="md" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-medium text-foreground">{applicantName(r)}</div>
                  <bdi dir="ltr" className="block truncate text-xs text-muted-foreground">
                    {r.email}
                  </bdi>
                </div>
              </div>
              <RelativeTime value={r.createdAt} className="shrink-0 text-xs text-muted-foreground" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <IdCardIcon className="size-3.5" aria-hidden />
              <bdi className="font-mono text-foreground">{r.enteredId ?? '—'}</bdi>
              <MatchBadge kind={r.matchKind} linked={r.match?.linked} />
            </div>
          </div>
        )}
      />

      <RegistrationSheet
        registration={details}
        canReview={details ? reviewable(details) : false}
        canReapprove={Boolean(details && canApprove && details.status === 'rejected')}
        onOpenChange={(o) => !o && closeDetails()}
        onApprove={(r) => setApprove(r)}
        onReject={(r) => setReject(r)}
        onInfo={(r) => setInfo(r)}
      />
      <ApproveRegistrationDialog
        registration={approve}
        roles={roles}
        isSuperAdmin={isSuperAdmin}
        canAdminister={canAdminister}
        onOpenChange={(o) => !o && setApprove(null)}
        onDone={closeDetails}
      />
      <ReviewNoteDialog mode="reject" registration={reject} onOpenChange={(o) => !o && setReject(null)} onDone={closeDetails} />
      <ReviewNoteDialog mode="info" registration={info} onOpenChange={(o) => !o && setInfo(null)} onDone={closeDetails} />
    </>
  );
}

function RegistrationSheet({
  registration,
  canReview,
  canReapprove,
  onOpenChange,
  onApprove,
  onReject,
  onInfo,
}: {
  registration: RegistrationRow | null;
  canReview: boolean;
  canReapprove: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (r: RegistrationRow) => void;
  onReject: (r: RegistrationRow) => void;
  onInfo: (r: RegistrationRow) => void;
}) {
  const t = useTranslations('users.registrations');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  // Keep the last registration while the sheet animates out.
  const [r, setR] = useState(registration);
  if (registration && registration !== r) setR(registration);

  return (
    <Sheet open={Boolean(registration)} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-lg">
        {r ? (
          <>
            <SheetHeader className="flex-row items-center gap-3">
              <EmployeeAvatar name={applicantName(r)} seed={r.id} size="lg" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{applicantName(r)}</SheetTitle>
                <SheetDescription>{t('sheet.submittedOn', { date: fmt.dateTime(r.createdAt) })}</SheetDescription>
                <div className="mt-1.5">
                  <StatusBadge domain="profile" status={r.status} />
                </div>
              </div>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5">
              {r.reviewNote && r.status !== 'pending' ? (
                <Alert variant={r.status === 'rejected' ? 'danger' : 'warning'}>
                  {r.status === 'rejected' ? <XCircleIcon /> : <MessageCircleQuestionIcon />}
                  <AlertTitle>{r.status === 'rejected' ? t('sheet.rejectionReason') : t('sheet.infoNote')}</AlertTitle>
                  <AlertDescription>
                    <p className="whitespace-pre-line">{r.reviewNote}</p>
                    {r.reviewedAt ? <p className="mt-1 text-xs opacity-80 numeric">{fmt.dateTime(r.reviewedAt)}</p> : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-faint-foreground uppercase">{t('sheet.applicant')}</h3>
                <KeyValueGrid
                  columns={2}
                  items={[
                    { label: tc('email'), value: r.email, ltr: true, span: 2 },
                    { label: tc('mobile'), value: r.mobile, ltr: true },
                    { label: t('columns.enteredId'), value: r.enteredId, ltr: true },
                    { label: t('sheet.note'), value: r.note, span: 2, hidden: !r.note },
                    { label: t('sheet.updated'), value: fmt.dateTime(r.updatedAt), hidden: r.updatedAt === r.createdAt },
                  ]}
                />
              </section>

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wide text-faint-foreground uppercase">{t('sheet.suggested')}</h3>
                {r.match ? (
                  <div className="rounded-lg border border-border bg-subtle p-3.5">
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={employeeDisplayName(r.match, locale)} seed={r.match.id} size="md" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-sm font-medium text-foreground">{employeeDisplayName(r.match, locale)}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[r.match.employee_number, localized(r.match.job_title ?? null, 'name', locale), localized(r.match.department ?? null, 'name', locale)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <MatchBadge kind={r.matchKind} linked={r.match.linked} />
                    </div>
                    {r.match.linked ? <p className="mt-2.5 text-xs text-warning">{t('sheet.matchLinked')}</p> : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-3.5 py-3 text-meta text-muted-foreground">{t('sheet.noSuggestion')}</div>
                )}
              </section>
            </SheetBody>
            {canReview || canReapprove ? (
              <SheetFooter className="flex-wrap">
                {canReview ? (
                  <>
                    <Button variant="outline" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onReject(r)}>
                      <XCircleIcon />
                      {t('actions.reject')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onInfo(r)}>
                      <MessageCircleQuestionIcon />
                      {t('actions.requestInfo')}
                    </Button>
                  </>
                ) : null}
                <Button size="sm" onClick={() => onApprove(r)}>
                  <CheckCircle2Icon />
                  {t('actions.approve')}
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
