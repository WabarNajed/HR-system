'use client';

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  FilePlus2Icon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UploadIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { UploadDocumentDialog } from '@/features/documents/components/upload-document-dialog';
import { ArchiveEmployeeDialog, type ArchiveTarget } from '../archive-employee-dialog';

export type ProfileActionsProps = {
  employeeId: string;
  name: string;
  employeeNumber: string | null;
  archived: boolean;
  canEdit: boolean;
  /** `/requests/new?...` target, or null when the viewer can't file a request for this employee. */
  requestHref: string | null;
  canUploadDocument: boolean;
  /** Anchor of the portal access card (HR only). */
  portalHref: string | null;
};

/** Header actions: Edit · New request · Upload document · More (portal access, copy ID, archive/restore). */
export function ProfileActions({
  employeeId,
  name,
  employeeNumber,
  archived,
  canEdit,
  requestHref,
  canUploadDocument,
  portalHref,
}: ProfileActionsProps) {
  const t = useTranslations('employees.actions');
  const tc = useTranslations('common');
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);
  const hasMore = canEdit || Boolean(portalHref) || Boolean(employeeNumber);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit ? (
        <Button asChild variant="outline">
          <Link href={`/employees/${employeeId}/edit`}>
            <PencilIcon />
            {t('edit')}
          </Link>
        </Button>
      ) : null}
      {canUploadDocument ? (
        <UploadDocumentDialog
          employeeId={employeeId}
          trigger={
            <Button variant="outline">
              <UploadIcon />
              <span className="max-sm:sr-only">{t('uploadDocument')}</span>
            </Button>
          }
        />
      ) : null}
      {requestHref ? (
        archived ? (
          <SimpleTooltip content={t('requestDisabled')}>
            <span tabIndex={0} className="inline-flex">
              <Button disabled>
                <FilePlus2Icon />
                {t('newRequest')}
              </Button>
            </span>
          </SimpleTooltip>
        ) : (
          <Button asChild>
            <Link href={requestHref}>
              <FilePlus2Icon />
              {t('newRequest')}
            </Link>
          </Button>
        )
      ) : null}
      {hasMore ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t('more')}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {portalHref ? (
              <DropdownMenuItem asChild>
                <Link href={portalHref}>
                  <KeyRoundIcon />
                  {t('portalAccess')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {employeeNumber ? (
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard
                    ?.writeText(employeeNumber)
                    .then(() => toast.success(tc('copied')))
                    .catch(() => toast.error(tc('states.errorTitle')));
                }}
              >
                <CopyIcon />
                {t('copyEmployeeNumber')}
              </DropdownMenuItem>
            ) : null}
            {canEdit ? (
              <>
                {portalHref || employeeNumber ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  variant={archived ? 'default' : 'destructive'}
                  onSelect={() => setArchiveTarget({ id: employeeId, name, archived })}
                >
                  {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  {archived ? t('restore') : t('archive')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ArchiveEmployeeDialog target={archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)} />
    </div>
  );
}
