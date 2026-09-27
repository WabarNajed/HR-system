/**
 * SAMPLE DATA — DEV GALLERY ONLY. Never import outside src/app/dev/**.
 * Used to exercise the DataTable/Combobox visually; not shown anywhere in the product.
 */

export type SampleEmployee = {
  id: string;
  employee_number: string;
  name_ar: string;
  name_en: string;
  department: string;
  job_ar: string;
  job_en: string;
  status: 'active' | 'probation' | 'on_leave' | 'suspended' | 'resigned';
  gender: 'male' | 'female';
  joining_date: string;
  iqama_expiry: string | null;
};

export const SAMPLE_DEPARTMENTS = [
  { id: 'hr', name_ar: 'الموارد البشرية', name_en: 'Human Resources' },
  { id: 'fin', name_ar: 'المالية', name_en: 'Finance' },
  { id: 'ops', name_ar: 'العمليات', name_en: 'Operations' },
  { id: 'it', name_ar: 'تقنية المعلومات', name_en: 'Information Technology' },
  { id: 'sales', name_ar: 'المبيعات', name_en: 'Sales' },
];

const first = [
  ['عبدالله', 'Abdullah'],
  ['نورة', 'Noura'],
  ['محمد', 'Mohammed'],
  ['سارة', 'Sarah'],
  ['فيصل', 'Faisal'],
  ['ريم', 'Reem'],
  ['خالد', 'Khalid'],
  ['هيفاء', 'Haifa'],
  ['تركي', 'Turki'],
  ['لمى', 'Lama'],
  ['سلطان', 'Sultan'],
  ['جود', 'Joud'],
] as const;
const last = [
  ['العتيبي', 'Al-Otaibi'],
  ['القحطاني', 'Al-Qahtani'],
  ['الشهري', 'Al-Shehri'],
  ['الدوسري', 'Al-Dosari'],
  ['الحربي', 'Al-Harbi'],
  ['الزهراني', 'Al-Zahrani'],
] as const;
const jobs = [
  ['أخصائي موارد بشرية', 'HR Specialist'],
  ['محاسب', 'Accountant'],
  ['مشرف عمليات', 'Operations Supervisor'],
  ['مهندس برمجيات', 'Software Engineer'],
  ['مدير حسابات', 'Account Manager'],
  ['محلل بيانات', 'Data Analyst'],
] as const;
const statuses: SampleEmployee['status'][] = ['active', 'active', 'active', 'probation', 'active', 'on_leave', 'active', 'suspended', 'active', 'resigned'];

export const SAMPLE_EMPLOYEES: SampleEmployee[] = Array.from({ length: 42 }, (_, i) => {
  const f = first[i % first.length]!;
  const l = last[(i * 5) % last.length]!;
  const j = jobs[(i * 7) % jobs.length]!;
  const dept = SAMPLE_DEPARTMENTS[(i * 3) % SAMPLE_DEPARTMENTS.length]!;
  const month = ((i * 5) % 12) + 1;
  const day = ((i * 11) % 27) + 1;
  const expMonth = ((i * 7) % 12) + 1;
  return {
    id: `sample-${i + 1}`,
    employee_number: `E-${String(1040 + i * 3).padStart(5, '0')}`,
    name_ar: `${f[0]} ${l[0]}`,
    // Some imported employees have no English name — the UI must fall back to Arabic.
    name_en: i % 6 === 5 ? '' : `${f[1]} ${l[1]}`,
    department: dept.id,
    job_ar: j[0],
    job_en: j[1],
    status: statuses[i % statuses.length]!,
    gender: i % 2 === 0 ? 'male' : 'female',
    joining_date: `${2016 + (i % 10)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    iqama_expiry: i % 4 === 0 ? null : `${2026 + (i % 3)}-${String(expMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
});
