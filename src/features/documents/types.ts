import type { Database } from '@/types/database';

type Views = Database['public']['Views'];

/** Row of `public.employee_document_list` (Document Center, employee tab). */
export type DocumentListRow = Views['employee_document_list']['Row'];

/** Row of `public.expiry_items` (expiry monitor). */
export type ExpiryItemRow = Views['expiry_items']['Row'];

/** Row of `public.employee_document_gaps` (missing documents). */
export type DocumentGapRow = Views['employee_document_gaps']['Row'];

/** Which document actions the current user may take (org scope = HR; own = self-service). */
export type DocumentAccess = {
  /** Org-scope permissions (HR). Super admins have all of them. */
  view: boolean;
  create: boolean;
  edit: boolean;
  approve: boolean;
  export: boolean;
  /** The caller's linked employee (self-service uploads land in review). */
  ownEmployeeId: string | null;
};

/** Minimal document shape the client dialogs work with (serializable). */
export type DocumentSummary = Pick<
  DocumentListRow,
  | 'id'
  | 'employee_id'
  | 'document_type'
  | 'document_number'
  | 'issue_date'
  | 'expiry_date'
  | 'status'
  | 'storage_path'
  | 'file_name'
  | 'file_size'
  | 'mime_type'
  | 'notes'
  | 'is_confidential'
  | 'created_at'
  | 'updated_at'
  | 'review_note'
  | 'reviewed_at'
  | 'reviewed_by_name'
  | 'uploaded_by_name'
  | 'self_uploaded'
  | 'employee_number'
  | 'employee_name_ar'
  | 'employee_name_en'
  | 'department_name_ar'
  | 'department_name_en'
>;

/** Upload dialog context resolved on the server when the dialog opens. */
export type UploadContext =
  | {
      mode: 'hr' | 'self';
      /** Pre-selected employee (fixed when the dialog was opened for one employee, or self mode). */
      employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null } | null;
    }
  | { mode: 'none'; reason: 'forbidden' | 'notLinked' };
