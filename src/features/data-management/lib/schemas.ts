/**
 * Import entity schemas: human-readable columns (never UUIDs — employees are referenced by employee
 * number or Iqama, master data by code or name), their value types, header synonyms (Arabic and
 * English spellings; the localized labels from `locales/*\/dataManagement.json` are added
 * automatically) and template examples.
 */
import arDataManagement from '../../../../locales/ar/dataManagement.json';
import arEnums from '../../../../locales/ar/enums.json';
import arStatuses from '../../../../locales/ar/statuses.json';
import enDataManagement from '../../../../locales/en/dataManagement.json';
import enEnums from '../../../../locales/en/enums.json';
import enStatuses from '../../../../locales/en/statuses.json';
import { matchKey } from './normalize';
import type { ImportType, JsonCell } from './types';

export type FieldType =
  | 'text'
  | 'identifier'
  | 'date'
  | 'hijri'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'gender'
  | 'email'
  | 'phone'
  | 'enum'
  | 'outsideKingdom'
  | 'insideKingdom'
  | 'reference';

export type ReferenceKind = 'department' | 'job_title' | 'location' | 'cost_center' | 'employee' | 'leave_type';

export type EnumKind =
  | 'maritalStatus'
  | 'employmentType'
  | 'employmentStatus'
  | 'idType'
  | 'relationship'
  | 'documentType'
  | 'documentStatus'
  | 'dependentInsuranceStatus'
  | 'insuranceStatus';

export type FieldDef = {
  key: string;
  type: FieldType;
  /** Label key under `dataManagement.fields` (defaults to `key`). */
  label?: string;
  required?: boolean;
  enumKind?: EnumKind;
  reference?: ReferenceKind;
  /** Extra header spellings (Arabic and English). */
  synonyms: readonly string[];
  /** Template example (by locale). */
  example?: { ar: JsonCell; en: JsonCell };
  /** Shown in templates (default true). Informational columns (e.g. employee name on sub-records) are not stored. */
  template?: boolean;
  /** Informational only — accepted and shown, never written. */
  informational?: boolean;
};

export type EntitySchema = {
  type: ImportType;
  fields: readonly FieldDef[];
  /** At least one field of each group must be mapped and filled. */
  requiredAnyOf: readonly (readonly string[])[];
  /** Unmapped columns are kept in `employees.extra_data`. */
  extraData: boolean;
};

/* ─── Enums ───────────────────────────────────────────────────────────────── */

type EnumSource = { values: readonly string[]; ar: Record<string, string>; en: Record<string, string>; extra?: Record<string, readonly string[]> };

export const ENUMS: Record<EnumKind, EnumSource> = {
  maritalStatus: {
    values: ['single', 'married', 'divorced', 'widowed'],
    ar: arEnums.maritalStatus,
    en: enEnums.maritalStatus,
    extra: { single: ['عزباء', 'اعزب', 'غير متزوج'], married: ['متزوجة'], divorced: ['مطلقة'], widowed: ['أرملة', 'widow', 'widower'] },
  },
  employmentType: {
    values: ['full_time', 'part_time', 'contract', 'temporary', 'intern'],
    ar: arEnums.employmentType,
    en: enEnums.employmentType,
    extra: { full_time: ['full time', 'fulltime', 'دائم', 'كامل'], part_time: ['part time', 'parttime', 'جزئي'], contract: ['عقد', 'contractor'], temporary: ['temp'], intern: ['internship', 'trainee', 'تدريب'] },
  },
  employmentStatus: {
    values: ['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated'],
    ar: arStatuses.employment,
    en: enStatuses.employment,
    extra: {
      active: ['نشط', 'فعال', 'على راس العمل', 'يعمل', 'working', 'employed'],
      probation: ['فترة تجربة', 'فتره التجربه', 'تجربة', 'probationary'],
      on_leave: ['اجازة', 'في اجازه', 'leave', 'vacation'],
      suspended: ['موقوف عن العمل', 'ايقاف'],
      resigned: ['استقالة', 'resignation'],
      terminated: ['منتهي الخدمة', 'انتهت خدمته', 'مفصول', 'خروج نهائي', 'end of service', 'fired'],
    },
  },
  idType: {
    values: ['iqama', 'national_id'],
    ar: arEnums.idType,
    en: enEnums.idType,
    extra: { iqama: ['residence permit', 'resident id', 'مقيم'], national_id: ['هوية', 'national id', 'nid', 'سعودي', 'saudi id', 'citizen'] },
  },
  relationship: {
    values: ['spouse', 'son', 'daughter', 'father', 'mother', 'other'],
    ar: arEnums.relationship,
    en: enEnums.relationship,
    extra: { spouse: ['زوج', 'زوجة', 'wife', 'husband'], son: ['الابن', 'ولد'], daughter: ['بنت', 'الابنة', 'البنت'], father: ['اب', 'والد', 'الوالد'], mother: ['ام', 'والدة', 'الوالدة'], other: ['اخرى', 'اخر'] },
  },
  documentType: {
    values: ['employment_contract', 'national_id', 'iqama', 'passport', 'medical_insurance', 'iban_certificate', 'educational_certificate', 'professional_certificate', 'medical_report', 'visa', 'signed_hr_form', 'other'],
    ar: arEnums.documentType,
    en: enEnums.documentType,
    extra: {
      employment_contract: ['contract', 'عقد'],
      national_id: ['هوية', 'national id'],
      passport: ['جواز', 'الجواز'],
      medical_insurance: ['تامين', 'بطاقة التامين', 'insurance card'],
      iban_certificate: ['iban', 'ايبان', 'شهادة ايبان'],
      educational_certificate: ['degree', 'مؤهل', 'شهادة جامعية'],
      professional_certificate: ['certification', 'شهادة مهنية'],
      medical_report: ['تقرير طبي', 'medical'],
      visa: ['تاشيرة', 'visa'],
      other: ['اخرى'],
    },
  },
  documentStatus: {
    values: ['valid', 'expired', 'pending_review', 'rejected', 'archived'],
    ar: arStatuses.document,
    en: enStatuses.document,
    extra: { valid: ['سارية', 'ساري المفعول', 'active'], expired: ['منتهية'], pending_review: ['pending', 'قيد المراجعة'] },
  },
  dependentInsuranceStatus: {
    values: ['insured', 'not_insured', 'pending'],
    ar: arEnums.insuranceStatus,
    en: enEnums.insuranceStatus,
    extra: { insured: ['مؤمن', 'yes', 'نعم'], not_insured: ['غير مؤمن', 'no', 'لا'], pending: ['قيد الاجراء'] },
  },
  insuranceStatus: {
    values: ['active', 'expired', 'pending', 'cancelled'],
    ar: arStatuses.insurance,
    en: enStatuses.insurance,
    extra: { active: ['سارية', 'فعال', 'valid'], expired: ['منتهية'], cancelled: ['ملغي', 'ملغاة', 'canceled'] },
  },
};

const enumSynonymCache = new Map<EnumKind, Map<string, string>>();

/** matchKey(label/value/synonym) → enum value. */
export function enumSynonyms(kind: EnumKind): Map<string, string> {
  const cached = enumSynonymCache.get(kind);
  if (cached) return cached;
  const src = ENUMS[kind];
  const map = new Map<string, string>();
  for (const value of src.values) {
    for (const s of [value, value.replace(/_/g, ' '), src.ar[value], src.en[value], ...(src.extra?.[value] ?? [])]) {
      if (!s) continue;
      const key = matchKey(s);
      if (key && !map.has(key)) map.set(key, value);
      // "الزوج / الزوجة" style labels: each part too.
      for (const part of s.split('/')) {
        const pk = matchKey(part);
        if (pk && !map.has(pk)) map.set(pk, value);
      }
    }
  }
  enumSynonymCache.set(kind, map);
  return map;
}

export function enumLabel(kind: EnumKind, value: string, locale: 'ar' | 'en'): string {
  const src = ENUMS[kind];
  return (locale === 'ar' ? src.ar[value] : src.en[value]) ?? value;
}

/* ─── Shared field fragments ──────────────────────────────────────────────── */

const EMPLOYEE_REF: FieldDef[] = [
  {
    key: 'employee_number',
    type: 'identifier',
    synonyms: ['employee number', 'employee no', 'employee id', 'emp no', 'emp id', 'staff id', 'staff number', 'الرقم الوظيفي', 'رقم الموظف', 'الرقم الوظيفى', 'كود الموظف'],
    example: { ar: 'EMP-0001', en: 'EMP-0001' },
  },
  {
    key: 'employee_national_id',
    type: 'identifier',
    synonyms: ['employee iqama', 'employee iqama number', 'employee national id', 'employee id number', 'iqama number', 'iqama', 'national id', 'رقم إقامة الموظف', 'رقم هوية الموظف', 'رقم الإقامة', 'رقم الهوية', 'هوية الموظف'],
    example: { ar: '2123456789', en: '2123456789' },
  },
  {
    key: 'employee_name',
    type: 'text',
    informational: true,
    synonyms: ['employee name', 'employee', 'اسم الموظف', 'الموظف'],
    example: { ar: 'محمد عبدالله', en: 'Mohammed Abdullah' },
  },
];

const IS_ACTIVE: FieldDef = {
  key: 'is_active',
  type: 'boolean',
  synonyms: ['active', 'is active', 'enabled', 'status', 'نشط', 'فعال', 'الحالة', 'مفعل'],
  example: { ar: 'نعم', en: 'Yes' },
};

function masterFields(nameExampleAr: string, nameExampleEn: string, codeExample: string): FieldDef[] {
  return [
    { key: 'code', type: 'identifier', synonyms: ['code', 'short code', 'الرمز', 'الكود', 'رمز', 'كود'], example: { ar: codeExample, en: codeExample } },
    {
      key: 'name_ar',
      type: 'text',
      synonyms: ['name ar', 'arabic name', 'name arabic', 'name (arabic)', 'الاسم', 'الاسم بالعربي', 'الاسم بالعربية', 'الاسم العربي'],
      example: { ar: nameExampleAr, en: nameExampleAr },
    },
    {
      key: 'name_en',
      type: 'text',
      synonyms: ['name en', 'english name', 'name english', 'name (english)', 'name', 'الاسم بالانجليزي', 'الاسم بالإنجليزية', 'الاسم الانجليزي'],
      example: { ar: nameExampleEn, en: nameExampleEn },
    },
  ];
}

/* ─── Entities ────────────────────────────────────────────────────────────── */

const EMPLOYEES: EntitySchema = {
  type: 'employees',
  extraData: true,
  requiredAnyOf: [['name_ar', 'name_en']],
  fields: [
    {
      key: 'employee_number',
      type: 'identifier',
      synonyms: ['employee number', 'employee no', 'employee id', 'emp no', 'emp id', 'emp code', 'employee code', 'staff id', 'staff number', 'الرقم الوظيفي', 'رقم الموظف', 'كود الموظف', 'الرقم الوظيفى', 'رقم وظيفي'],
      example: { ar: 'EMP-0001', en: 'EMP-0001' },
    },
    {
      key: 'name_ar',
      type: 'text',
      label: 'employeeNameAr',
      synonyms: [
        'employee name', 'name', 'full name', 'employee full name', 'arabic name', 'name arabic', 'name ar', 'employee name arabic', 'employee name (arabic)',
        'اسم الموظف', 'الاسم', 'الاسم الكامل', 'اسم الموظف بالعربي', 'الاسم بالعربي', 'الاسم بالعربية', 'الاسم العربي', 'اسم الموظف عربي', 'الاسم رباعي', 'الاسم الرباعي', 'اسم العامل', 'اسم المقيم',
      ],
      example: { ar: 'محمد عبدالله الأحمد', en: 'محمد عبدالله الأحمد' },
    },
    {
      key: 'name_en',
      type: 'text',
      label: 'employeeNameEn',
      synonyms: ['english name', 'name english', 'name en', 'employee name english', 'employee name (english)', 'name in english', 'الاسم بالانجليزي', 'الاسم بالإنجليزية', 'الاسم الانجليزي', 'اسم الموظف بالانجليزي', 'اسم الموظف انجليزي'],
      example: { ar: 'Mohammed Abdullah Al-Ahmad', en: 'Mohammed Abdullah Al-Ahmad' },
    },
    {
      key: 'national_id',
      type: 'identifier',
      synonyms: [
        'iqama number', 'iqama no', 'iqama', 'iqama id', 'national id', 'national id number', 'id number', 'id no', 'resident id', 'residence number', 'iqama/national id', 'iqama / id',
        'رقم الإقامة', 'رقم الاقامه', 'رقم الإقامة / الهوية', 'رقم الهوية', 'الهوية', 'رقم الهوية الوطنية', 'الإقامة', 'رقم الاقامة او الهوية', 'رقم الهوية / الإقامة', 'السجل المدني', 'رقم السجل المدني', 'هوية مقيم', 'رقم هوية مقيم',
      ],
      example: { ar: '2123456789', en: '2123456789' },
    },
    { key: 'id_type', type: 'enum', enumKind: 'idType', synonyms: ['id type', 'identity type', 'نوع الهوية', 'نوع الإثبات'], example: { ar: 'إقامة', en: 'Iqama' } },
    { key: 'gender', type: 'gender', synonyms: ['gender', 'sex', 'الجنس', 'النوع'], example: { ar: 'ذكر', en: 'Male' } },
    { key: 'nationality', type: 'text', synonyms: ['nationality', 'country', 'citizenship', 'الجنسية', 'الجنسيه'], example: { ar: 'مصري', en: 'Egyptian' } },
    { key: 'date_of_birth', type: 'date', synonyms: ['date of birth', 'birth date', 'birthdate', 'dob', 'birthday', 'تاريخ الميلاد', 'تاريخ الولادة', 'الميلاد'], example: { ar: '1990-05-14', en: '1990-05-14' } },
    { key: 'marital_status', type: 'enum', enumKind: 'maritalStatus', synonyms: ['marital status', 'marital', 'الحالة الاجتماعية', 'الحاله الاجتماعيه'], example: { ar: 'متزوج', en: 'Married' } },
    {
      key: 'company_email',
      type: 'email',
      synonyms: ['email', 'e-mail', 'email address', 'work email', 'company email', 'business email', 'official email', 'mail', 'البريد الإلكتروني', 'البريد الالكتروني', 'الايميل', 'الإيميل', 'البريد', 'بريد العمل', 'البريد الإلكتروني للعمل'],
      example: { ar: 'm.ahmad@company.sa', en: 'm.ahmad@company.sa' },
    },
    { key: 'personal_email', type: 'email', synonyms: ['personal email', 'private email', 'البريد الشخصي', 'البريد الإلكتروني الشخصي', 'الايميل الشخصي'], example: { ar: '', en: '' }, template: true },
    {
      key: 'mobile',
      type: 'phone',
      synonyms: ['mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'cell', 'contact number', 'الجوال', 'رقم الجوال', 'الهاتف', 'رقم الهاتف', 'الموبايل', 'رقم التواصل', 'جوال'],
      example: { ar: '0501234567', en: '0501234567' },
    },
    { key: 'alt_mobile', type: 'phone', synonyms: ['alternate mobile', 'alt mobile', 'other phone', 'second mobile', 'جوال آخر', 'رقم جوال آخر', 'جوال بديل'], template: false },
    { key: 'address', type: 'text', synonyms: ['address', 'home address', 'العنوان', 'عنوان السكن'], template: false },
    {
      key: 'department',
      type: 'reference',
      reference: 'department',
      synonyms: ['department', 'dept', 'department name', 'department code', 'القسم', 'الإدارة', 'الادارة', 'اسم القسم', 'الإدارة / القسم', 'القسم / الإدارة'],
      example: { ar: 'الموارد البشرية', en: 'Human Resources' },
    },
    { key: 'division', type: 'text', synonyms: ['division', 'sector', 'القطاع', 'الشعبة'], template: false },
    { key: 'section', type: 'text', synonyms: ['section', 'unit', 'الوحدة'], template: false },
    {
      key: 'job_title',
      type: 'reference',
      reference: 'job_title',
      synonyms: ['job title', 'title', 'position', 'designation', 'job', 'role', 'المسمى الوظيفي', 'المسمى', 'الوظيفة', 'المنصب', 'المسمى الوظيفى'],
      example: { ar: 'أخصائي موارد بشرية', en: 'HR Specialist' },
    },
    {
      key: 'iqama_profession',
      type: 'text',
      synonyms: ['profession', 'iqama profession', 'occupation', 'profession job title', 'profession / job title', 'المهنة', 'المهنه', 'مهنة الإقامة', 'المهنة في الإقامة', 'المهنة بالإقامة', 'المهنة / المسمى الوظيفي'],
      example: { ar: 'محاسب', en: 'Accountant' },
    },
    { key: 'grade', type: 'text', synonyms: ['grade', 'level', 'band', 'الدرجة', 'المرتبة', 'الدرجة الوظيفية'], template: false },
    {
      key: 'manager',
      type: 'reference',
      reference: 'employee',
      synonyms: ['manager', 'line manager', 'direct manager', 'manager employee number', 'manager number', 'reports to', 'supervisor', 'المدير المباشر', 'المدير', 'الرقم الوظيفي للمدير', 'رقم المدير', 'المشرف'],
      example: { ar: 'EMP-0000', en: 'EMP-0000' },
    },
    { key: 'employment_type', type: 'enum', enumKind: 'employmentType', synonyms: ['employment type', 'contract type', 'نوع التوظيف', 'نوع العقد', 'نوع التعاقد'], example: { ar: 'دوام كامل', en: 'Full-time' } },
    { key: 'employment_status', type: 'enum', enumKind: 'employmentStatus', synonyms: ['employment status', 'employee status', 'status', 'حالة الموظف', 'الحالة الوظيفية', 'الحالة', 'حالة التوظيف'], example: { ar: 'على رأس العمل', en: 'Active' } },
    { key: 'joining_date', type: 'date', synonyms: ['joining date', 'join date', 'hire date', 'date of joining', 'start date', 'employment date', 'تاريخ الالتحاق', 'تاريخ المباشرة', 'تاريخ التعيين', 'تاريخ الانضمام', 'تاريخ بداية العمل'], example: { ar: '2022-01-09', en: '2022-01-09' } },
    { key: 'probation_end_date', type: 'date', synonyms: ['probation end', 'probation end date', 'نهاية فترة التجربة', 'تاريخ انتهاء التجربة'], template: false },
    { key: 'contract_start_date', type: 'date', synonyms: ['contract start', 'contract start date', 'بداية العقد', 'تاريخ بداية العقد'], template: false },
    { key: 'contract_end_date', type: 'date', synonyms: ['contract end', 'contract end date', 'contract expiry', 'نهاية العقد', 'تاريخ انتهاء العقد'], example: { ar: '2027-01-08', en: '2027-01-08' } },
    {
      key: 'location',
      type: 'reference',
      reference: 'location',
      synonyms: ['location', 'branch', 'work location', 'site', 'office', 'الموقع', 'الفرع', 'موقع العمل', 'المدينة'],
      example: { ar: 'الرياض', en: 'Riyadh' },
    },
    { key: 'cost_center', type: 'reference', reference: 'cost_center', synonyms: ['cost center', 'cost centre', 'مركز التكلفة', 'مركز تكلفة'], template: false },
    {
      key: 'iqama_issue_date',
      type: 'date',
      synonyms: ['iqama issue date', 'iqama issue', 'id issue date', 'issue date', 'date of issue', 'تاريخ إصدار الإقامة', 'تاريخ اصدار الاقامه', 'اصدار الاقامة', 'تاريخ الإصدار', 'تاريخ إصدار الهوية'],
      example: { ar: '2024-03-01', en: '2024-03-01' },
    },
    {
      key: 'iqama_expiry_date',
      type: 'date',
      synonyms: [
        'iqama expiry', 'iqama expiry date', 'iqama expiration', 'iqama expiration date', 'iqama end date', 'id expiry', 'id expiry date', 'iqama expiry gregorian', 'gregorian iqama expiry', 'iqama expiry (gregorian)',
        'تاريخ انتهاء الإقامة', 'انتهاء الإقامة', 'تاريخ انتهاء الاقامه', 'انتهاء الاقامة ميلادي', 'تاريخ انتهاء الإقامة ميلادي', 'تاريخ انتهاء الإقامة (ميلادي)', 'تاريخ انتهاء الهوية', 'انتهاء الهوية', 'صلاحية الإقامة',
      ],
      example: { ar: '2027-02-28', en: '2027-02-28' },
    },
    {
      key: 'iqama_expiry_hijri',
      type: 'hijri',
      synonyms: [
        'hijri iqama expiry', 'iqama expiry hijri', 'iqama expiry (hijri)', 'hijri expiry', 'expiry hijri', 'hijri expiry date', 'iqama expiry date hijri', 'hijri',
        'تاريخ انتهاء الإقامة هجري', 'تاريخ انتهاء الإقامة (هجري)', 'انتهاء الإقامة هجري', 'انتهاء الإقامة (هـ)', 'تاريخ الانتهاء هجري', 'الانتهاء هجري', 'تاريخ انتهاء الاقامة بالهجري', 'انتهاء الاقامه هـ', 'هجري',
      ],
      example: { ar: '1448/09/11', en: '1448/09/11' },
    },
    {
      key: 'passport_number',
      type: 'identifier',
      synonyms: ['passport number', 'passport no', 'passport', 'passport #', 'رقم الجواز', 'رقم جواز السفر', 'الجواز', 'جواز السفر'],
      example: { ar: 'A12345678', en: 'A12345678' },
    },
    {
      key: 'passport_expiry_date',
      type: 'date',
      synonyms: ['passport expiry', 'passport expiry date', 'passport expiration', 'passport expiration date', 'passport end date', 'تاريخ انتهاء الجواز', 'انتهاء الجواز', 'تاريخ انتهاء جواز السفر', 'صلاحية الجواز'],
      example: { ar: '2029-06-30', en: '2029-06-30' },
    },
    {
      key: 'employer_number',
      type: 'identifier',
      synonyms: ['employer number', 'employer no', 'employer id', 'establishment number', 'company number', 'mol number', 'رقم المنشأة', 'رقم المنشاه', 'رقم صاحب العمل', 'رقم المنشأة في مكتب العمل', 'الرقم الموحد', 'رقم المنشأة (مكتب العمل)', 'رقم الكفيل', 'الكفيل'],
      example: { ar: '7001234567', en: '7001234567' },
    },
    {
      key: 'is_outside_kingdom',
      type: 'outsideKingdom',
      synonyms: [
        'outside kingdom', 'outside kingdom status', 'outside the kingdom', 'outside ksa', 'out of kingdom', 'inside/outside', 'in/out', 'location status',
        'خارج المملكة', 'حالة خارج المملكة', 'داخل / خارج المملكة', 'داخل/خارج المملكة', 'داخل او خارج المملكة', 'التواجد', 'حالة التواجد', 'خارج المملكه',
      ],
      example: { ar: 'لا', en: 'No' },
    },
    {
      key: 'inside_kingdom',
      type: 'insideKingdom',
      label: 'insideKingdom',
      template: false,
      synonyms: ['inside kingdom', 'in kingdom', 'inside ksa', 'داخل المملكة', 'موجود داخل المملكة', 'متواجد داخل المملكة'],
    },
    {
      key: 'leave_balance',
      type: 'number',
      synonyms: ['leave balance', 'annual leave balance', 'vacation balance', 'balance', 'leave days', 'رصيد الإجازات', 'رصيد الاجازات', 'رصيد الإجازة', 'رصيد الاجازة السنوية', 'رصيد الإجازة السنوية', 'الرصيد', 'أيام الإجازة', 'رصيد'],
      example: { ar: 21, en: 21 },
    },
    { key: 'emergency_contact_name', type: 'text', synonyms: ['emergency contact', 'emergency contact name', 'اسم جهة الاتصال للطوارئ', 'جهة اتصال الطوارئ'], template: false },
    { key: 'emergency_contact_relationship', type: 'text', synonyms: ['emergency contact relationship', 'صلة القرابة للطوارئ'], template: false },
    { key: 'emergency_contact_mobile', type: 'phone', synonyms: ['emergency contact mobile', 'emergency phone', 'emergency number', 'جوال الطوارئ', 'رقم الطوارئ'], template: false },
  ],
};

const DEPARTMENTS: EntitySchema = {
  type: 'departments',
  extraData: false,
  requiredAnyOf: [['name_ar', 'name_en']],
  fields: [
    ...masterFields('الموارد البشرية', 'Human Resources', 'HR'),
    { key: 'parent', type: 'reference', reference: 'department', synonyms: ['parent', 'parent department', 'parent code', 'القسم الرئيسي', 'الإدارة الأم', 'يتبع', 'تابع لـ'], example: { ar: 'ADM', en: 'ADM' } },
    { key: 'head', type: 'reference', reference: 'employee', synonyms: ['head', 'department head', 'head employee number', 'manager', 'رئيس القسم', 'مدير الإدارة', 'مدير القسم'], example: { ar: 'EMP-0001', en: 'EMP-0001' } },
    IS_ACTIVE,
  ],
};

const JOB_TITLES: EntitySchema = {
  type: 'job_titles',
  extraData: false,
  requiredAnyOf: [['name_ar', 'name_en']],
  fields: [...masterFields('أخصائي موارد بشرية', 'HR Specialist', 'HRS'), IS_ACTIVE],
};

const LOCATIONS: EntitySchema = {
  type: 'locations',
  extraData: false,
  requiredAnyOf: [['name_ar', 'name_en']],
  fields: [
    ...masterFields('المكتب الرئيسي', 'Head Office', 'RUH-HQ'),
    { key: 'city', type: 'text', synonyms: ['city', 'المدينة'], example: { ar: 'الرياض', en: 'Riyadh' } },
    { key: 'country', type: 'text', synonyms: ['country', 'الدولة', 'البلد'], example: { ar: 'السعودية', en: 'Saudi Arabia' } },
    IS_ACTIVE,
  ],
};

const COST_CENTERS: EntitySchema = {
  type: 'cost_centers',
  extraData: false,
  requiredAnyOf: [['name_ar', 'name_en']],
  fields: [...masterFields('الإدارة العامة', 'General Administration', 'CC-100'), IS_ACTIVE],
};

const LEAVE_BALANCES: EntitySchema = {
  type: 'leave_balances',
  extraData: false,
  requiredAnyOf: [['employee_number', 'employee_national_id'], ['leave_type'], ['opening_balance']],
  fields: [
    ...EMPLOYEE_REF,
    { key: 'leave_type', type: 'reference', reference: 'leave_type', synonyms: ['leave type', 'type', 'leave', 'نوع الإجازة', 'نوع الاجازة', 'الإجازة'], example: { ar: 'annual', en: 'annual' } },
    { key: 'year', type: 'integer', synonyms: ['year', 'السنة', 'العام'], example: { ar: new Date().getFullYear(), en: new Date().getFullYear() } },
    { key: 'opening_balance', type: 'number', synonyms: ['opening balance', 'balance', 'leave balance', 'الرصيد', 'رصيد الإجازات', 'الرصيد الافتتاحي', 'رصيد'], example: { ar: 15, en: 15 } },
    { key: 'entitlement', type: 'number', synonyms: ['entitlement', 'annual entitlement', 'الاستحقاق', 'الاستحقاق السنوي'], example: { ar: 21, en: 21 } },
  ],
};

const DEPENDENTS: EntitySchema = {
  type: 'dependents',
  extraData: false,
  requiredAnyOf: [['employee_number', 'employee_national_id'], ['name_ar', 'name_en'], ['relationship']],
  fields: [
    ...EMPLOYEE_REF,
    { key: 'name_ar', type: 'text', label: 'dependentNameAr', synonyms: ['dependent name', 'dependent name arabic', 'name', 'اسم التابع', 'اسم المرافق', 'الاسم', 'اسم التابع بالعربي'], example: { ar: 'سارة محمد', en: 'سارة محمد' } },
    { key: 'name_en', type: 'text', label: 'dependentNameEn', synonyms: ['dependent name english', 'english name', 'اسم التابع بالانجليزي'], example: { ar: 'Sara Mohammed', en: 'Sara Mohammed' } },
    { key: 'relationship', type: 'enum', enumKind: 'relationship', synonyms: ['relationship', 'relation', 'صلة القرابة', 'القرابة', 'العلاقة'], example: { ar: 'ابنة', en: 'Daughter' } },
    { key: 'date_of_birth', type: 'date', synonyms: ['date of birth', 'birth date', 'dob', 'تاريخ الميلاد'], example: { ar: '2015-09-01', en: '2015-09-01' } },
    { key: 'nationality', type: 'text', synonyms: ['nationality', 'الجنسية'], example: { ar: 'مصري', en: 'Egyptian' } },
    { key: 'national_id', type: 'identifier', label: 'dependentNationalId', synonyms: ['dependent iqama', 'dependent id', 'dependent iqama number', 'dependent national id', 'رقم إقامة التابع', 'رقم هوية التابع', 'هوية التابع'], example: { ar: '2987654321', en: '2987654321' } },
    { key: 'iqama_expiry_date', type: 'date', synonyms: ['iqama expiry', 'iqama expiry date', 'تاريخ انتهاء الإقامة', 'انتهاء الإقامة'], example: { ar: '2027-02-28', en: '2027-02-28' } },
    { key: 'passport_number', type: 'identifier', synonyms: ['passport number', 'passport', 'رقم الجواز'], template: false },
    { key: 'passport_expiry_date', type: 'date', synonyms: ['passport expiry', 'تاريخ انتهاء الجواز'], template: false },
    { key: 'insurance_status', type: 'enum', enumKind: 'dependentInsuranceStatus', synonyms: ['insurance status', 'insured', 'حالة التأمين', 'مؤمن'], example: { ar: 'مؤمَّن عليه', en: 'Insured' } },
    { key: 'insurance_member_number', type: 'identifier', synonyms: ['insurance member number', 'member number', 'رقم العضوية', 'رقم عضوية التأمين'], template: false },
    { key: 'notes', type: 'text', synonyms: ['notes', 'remarks', 'ملاحظات'], template: false },
  ],
};

const INSURANCE: EntitySchema = {
  type: 'insurance',
  extraData: false,
  requiredAnyOf: [['employee_number', 'employee_national_id']],
  fields: [
    ...EMPLOYEE_REF,
    { key: 'dependent_name', type: 'text', synonyms: ['dependent', 'dependent name', 'insured dependent', 'التابع', 'اسم التابع', 'المؤمن عليه'], example: { ar: '', en: '' } },
    { key: 'provider', type: 'text', synonyms: ['provider', 'insurance company', 'insurer', 'شركة التأمين', 'مقدم الخدمة', 'المؤمن'], example: { ar: 'بوبا العربية', en: 'Bupa Arabia' } },
    { key: 'policy_number', type: 'identifier', synonyms: ['policy number', 'policy no', 'policy', 'رقم الوثيقة', 'رقم البوليصة'], example: { ar: 'POL-2026-01', en: 'POL-2026-01' } },
    { key: 'class', type: 'text', synonyms: ['class', 'category', 'tier', 'الفئة', 'الدرجة', 'فئة التأمين'], example: { ar: 'A', en: 'A' } },
    { key: 'member_number', type: 'identifier', synonyms: ['member number', 'membership number', 'member id', 'card number', 'رقم العضوية', 'رقم البطاقة'], example: { ar: 'M-100200', en: 'M-100200' } },
    { key: 'start_date', type: 'date', synonyms: ['start date', 'effective date', 'from', 'تاريخ البداية', 'بداية التغطية'], example: { ar: '2026-01-01', en: '2026-01-01' } },
    { key: 'expiry_date', type: 'date', synonyms: ['expiry date', 'end date', 'expiry', 'to', 'تاريخ الانتهاء', 'نهاية التغطية'], example: { ar: '2026-12-31', en: '2026-12-31' } },
    { key: 'status', type: 'enum', enumKind: 'insuranceStatus', synonyms: ['status', 'الحالة'], example: { ar: 'ساري', en: 'Active' } },
  ],
};

const DOCUMENTS: EntitySchema = {
  type: 'documents',
  extraData: false,
  requiredAnyOf: [['employee_number', 'employee_national_id'], ['document_type']],
  fields: [
    ...EMPLOYEE_REF,
    { key: 'document_type', type: 'enum', enumKind: 'documentType', synonyms: ['document type', 'type', 'document', 'نوع المستند', 'نوع الوثيقة', 'المستند'], example: { ar: 'جواز السفر', en: 'Passport' } },
    { key: 'document_number', type: 'identifier', synonyms: ['document number', 'number', 'رقم المستند', 'رقم الوثيقة'], example: { ar: 'A12345678', en: 'A12345678' } },
    { key: 'issue_date', type: 'date', synonyms: ['issue date', 'date of issue', 'تاريخ الإصدار'], example: { ar: '2024-06-30', en: '2024-06-30' } },
    { key: 'expiry_date', type: 'date', synonyms: ['expiry date', 'expiry', 'expiration date', 'تاريخ الانتهاء', 'تاريخ الانتهاء ميلادي'], example: { ar: '2029-06-30', en: '2029-06-30' } },
    { key: 'status', type: 'enum', enumKind: 'documentStatus', synonyms: ['status', 'الحالة'], example: { ar: 'ساري', en: 'Valid' } },
    { key: 'notes', type: 'text', synonyms: ['notes', 'remarks', 'ملاحظات'], example: { ar: '', en: '' } },
  ],
};

const PUBLIC_HOLIDAYS: EntitySchema = {
  type: 'public_holidays',
  extraData: false,
  requiredAnyOf: [['name_ar', 'name_en'], ['start_date']],
  fields: [
    { key: 'name_ar', type: 'text', synonyms: ['name ar', 'arabic name', 'holiday', 'اسم الإجازة', 'المناسبة', 'الاسم', 'الاسم بالعربي'], example: { ar: 'إجازة اليوم الوطني', en: 'إجازة اليوم الوطني' } },
    { key: 'name_en', type: 'text', synonyms: ['name en', 'english name', 'holiday name', 'name', 'الاسم بالانجليزي'], example: { ar: 'National Day holiday', en: 'National Day holiday' } },
    { key: 'start_date', type: 'date', synonyms: ['start date', 'from', 'date', 'من', 'تاريخ البداية', 'من تاريخ', 'التاريخ'], example: { ar: '2026-09-23', en: '2026-09-23' } },
    { key: 'end_date', type: 'date', synonyms: ['end date', 'to', 'إلى', 'الى', 'تاريخ النهاية', 'إلى تاريخ'], example: { ar: '2026-09-23', en: '2026-09-23' } },
    IS_ACTIVE,
  ],
};

export const SCHEMAS: Record<ImportType, EntitySchema> = {
  employees: EMPLOYEES,
  departments: DEPARTMENTS,
  job_titles: JOB_TITLES,
  locations: LOCATIONS,
  cost_centers: COST_CENTERS,
  leave_balances: LEAVE_BALANCES,
  dependents: DEPENDENTS,
  insurance: INSURANCE,
  documents: DOCUMENTS,
  public_holidays: PUBLIC_HOLIDAYS,
};

export function getSchema(type: ImportType): EntitySchema {
  return SCHEMAS[type];
}

export function getField(type: ImportType, key: string): FieldDef | undefined {
  return SCHEMAS[type].fields.find((f) => f.key === key);
}

/* ─── Labels (from the locale files, usable outside next-intl) ────────────── */

type FieldLabels = Record<string, string>;
const FIELD_LABELS: Record<'ar' | 'en', FieldLabels> = {
  ar: (arDataManagement as { fields?: FieldLabels }).fields ?? {},
  en: (enDataManagement as { fields?: FieldLabels }).fields ?? {},
};

export function fieldLabelKey(field: FieldDef): string {
  return field.label ?? field.key;
}

/** Localized column label of a field (falls back to the key). */
export function fieldLabel(field: FieldDef, locale: 'ar' | 'en'): string {
  const key = fieldLabelKey(field);
  return FIELD_LABELS[locale][key] ?? FIELD_LABELS.en[key] ?? field.key;
}

/** All header spellings of a field: synonyms + both localized labels. */
export function fieldSynonyms(field: FieldDef): string[] {
  const key = fieldLabelKey(field);
  const out = new Set<string>(field.synonyms);
  for (const locale of ['ar', 'en'] as const) {
    const label = FIELD_LABELS[locale][key];
    if (label) out.add(label);
  }
  out.add(field.key.replace(/_/g, ' '));
  return Array.from(out);
}
