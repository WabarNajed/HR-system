import type { CertificateLanguage, CertificateType } from './variables';

/** Editable template fields (editor state, create/save payloads). */
export type TemplateDraft = {
  name_ar: string;
  name_en: string;
  certificate_type: CertificateType;
  variant: string;
  language: CertificateLanguage;
  content_ar: string;
  content_en: string;
  header_html: string;
  footer_html: string;
  show_logo: boolean;
  show_stamp: boolean;
  show_signature: boolean;
  show_qr: boolean;
};

export type TemplateStatus = 'draft' | 'published' | 'inactive';

export type TemplateListItem = {
  id: string;
  key: string;
  certificate_type: CertificateType;
  variant: string;
  name_ar: string;
  name_en: string;
  language: CertificateLanguage;
  is_active: boolean;
  is_default: boolean;
  current_version: number;
  published_version: number | null;
  published_at: string | null;
  updated_at: string;
  status: TemplateStatus;
  /** Saved versions not yet published. */
  has_unpublished_changes: boolean;
  last_editor: string | null;
  issued_count: number;
};

export type TemplateVersion = {
  version: number;
  change_notes: string | null;
  changed_at: string;
  changed_by_name: string | null;
  snapshot: Partial<TemplateDraft>;
};

export type TemplateDetail = TemplateListItem & TemplateDraft & { versions: TemplateVersion[] };

export type IssuedCertificateRow = {
  id: string;
  certificate_number: string;
  employee_id: string;
  employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null } | null;
  request_id: string | null;
  certificate_type: CertificateType;
  language: CertificateLanguage;
  addressed_to: string | null;
  purpose: string | null;
  issue_date: string;
  status: 'valid' | 'revoked';
  storage_path: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  template_name_ar: string | null;
  template_name_en: string | null;
};

export type CertificateRequestRow = {
  id: string;
  request_number: string | null;
  status: string;
  subtype: string | null;
  language: CertificateLanguage | null;
  addressed_to: string | null;
  submitted_at: string | null;
  created_at: string;
  due_at: string | null;
  completed_at: string | null;
  employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null } | null;
  issued_count: number;
  sla: 'on_track' | 'due_soon' | 'overdue' | null;
};

export type CertificateKpis = {
  issuedThisMonth: number;
  pendingRequests: number;
  revoked: number;
  totalValid: number;
};
