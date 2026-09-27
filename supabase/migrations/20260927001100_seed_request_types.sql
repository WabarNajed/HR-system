-- =====================================================================================================
-- HR Portal — default configuration seeds (part 2): the 12 request types (PRODUCT-SPEC §8), their dynamic
-- form fields (with subtype-driven visibility rules) and default approval workflows.
-- =====================================================================================================

-- options helper: private.seed_options(array[value, label_ar, label_en, value, label_ar, label_en, …])
create or replace function private.seed_options(p_triples text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('value', p_triples[i], 'label_ar', p_triples[i + 1], 'label_en', p_triples[i + 2])
                            order by i), '[]'::jsonb)
  from generate_series(1, coalesce(array_length(p_triples, 1), 0), 3) as i
$$;

create or replace function private.seed_field(
  p_type_key text, p_key text, p_field_type text, p_label_ar text, p_label_en text, p_required boolean, p_sort int,
  p_options jsonb default '[]'::jsonb, p_visibility jsonb default null, p_is_system boolean default false,
  p_help_ar text default null, p_help_en text default null, p_placeholder_ar text default null,
  p_placeholder_en text default null, p_validation jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.request_fields (request_type_id, key, field_type, label_ar, label_en, required, sort_order, options,
                                     visibility, is_system, help_ar, help_en, placeholder_ar, placeholder_en, validation)
  select t.id, p_key, p_field_type, p_label_ar, p_label_en, p_required, p_sort, coalesce(p_options, '[]'::jsonb),
         p_visibility, p_is_system, p_help_ar, p_help_en, p_placeholder_ar, p_placeholder_en, coalesce(p_validation, '{}'::jsonb)
  from public.request_types t where t.key = p_type_key
  on conflict (request_type_id, key) do nothing
$$;

-- Creates the default workflow for a type (only when the type has none yet).
create or replace function private.seed_workflow(p_type_key text, p_with_manager boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.request_types;
  v_wf   uuid;
begin
  select * into v_type from public.request_types where key = p_type_key;
  if not found or v_type.workflow_id is not null
     or exists (select 1 from public.request_workflows w where w.request_type_id = v_type.id) then
    return;
  end if;
  insert into public.request_workflows (request_type_id, name_ar, name_en)
  values (v_type.id,
          case when p_with_manager then 'اعتماد المدير المباشر ثم الموارد البشرية' else 'مراجعة الموارد البشرية' end,
          case when p_with_manager then 'Manager approval, then HR review' else 'HR review' end)
  returning id into v_wf;
  if p_with_manager then
    insert into public.request_workflow_steps (workflow_id, step_order, step_type, name_ar, name_en, sla_business_days)
    values (v_wf, 1, 'manager', 'اعتماد المدير المباشر', 'Direct manager approval', 1),
           (v_wf, 2, 'hr', 'مراجعة الموارد البشرية', 'HR review', null);
  else
    insert into public.request_workflow_steps (workflow_id, step_order, step_type, name_ar, name_en)
    values (v_wf, 1, 'hr', 'مراجعة الموارد البشرية', 'HR review');
  end if;
  update public.request_types set workflow_id = v_wf where id = v_type.id;
end;
$$;

create or replace function private.seed_request_types()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att_ar  constant text := 'المرفقات';
  v_att_en  constant text := 'Attachments';
begin
  insert into public.request_types (key, category, name_ar, name_en, description_ar, description_en, icon, color,
                                    sla_business_days, requires_manager_approval, requires_hr_approval, allow_attachments,
                                    sort_order, is_system)
  values
    ('leave', 'time_off', 'طلب إجازة', 'Leave request',
     'تقديم طلب إجازة سنوية أو مرضية أو غيرها مع احتساب الأيام تلقائيًا ومتابعة الرصيد.',
     'Request annual, sick or other leave with automatic day calculation and balance tracking.',
     'calendar-days', '#0F5E6B', 2, true, true, true, 10, true),
    ('certificate', 'documents', 'طلب شهادة أو تعريف', 'Certificate request',
     'طلب تعريف بالراتب أو شهادة عمل أو شهادة خبرة باللغة العربية أو الإنجليزية.',
     'Request a salary, employment or experience certificate in Arabic or English.',
     'file-badge', '#B8862F', 3, false, true, true, 20, true),
    ('iqama_visa', 'government', 'الإقامة والتأشيرات', 'Iqama & visa',
     'تجديد الإقامة وتأشيرات الخروج والعودة والخروج النهائي وتحديث بيانات الجواز والمهنة.',
     'Iqama renewal, exit re-entry visas, final exit, passport and profession updates.',
     'id-card', '#1F6FD1', 5, false, true, true, 30, true),
    ('medical_insurance', 'benefits', 'التأمين الطبي', 'Medical insurance',
     'بطاقة التأمين والتغطية والمطالبات والموافقات وإضافة التابعين أو حذفهم.',
     'Insurance cards, coverage, claims and approvals, and adding or removing dependents.',
     'heart-pulse', '#C8322B', 3, false, true, true, 40, true),
    ('payroll', 'payroll', 'استفسار عن الرواتب', 'Payroll issue',
     'الإبلاغ عن مشكلة في الراتب أو الاستقطاعات أو البدلات أو مستحقات نهاية الخدمة.',
     'Report an issue with salary, deductions, allowances or end-of-service dues.',
     'wallet', '#12805C', 5, false, true, true, 50, true),
    ('attendance', 'attendance', 'الحضور والانصراف', 'Attendance & time',
     'تصحيح سجلات الحضور والانصراف أو طلب العمل عن بُعد.',
     'Correct attendance records or request remote work.',
     'clock', '#6D5BD0', 2, true, true, true, 60, true),
    ('bank_update', 'personal_data', 'تحديث الحساب البنكي', 'Bank account update',
     'تحديث الحساب البنكي المعتمد لتحويل الراتب، ويُطبَّق التحديث بعد الاعتماد.',
     'Update the bank account used for salary transfer; the change is applied after approval.',
     'landmark', '#3D4A4F', 3, false, true, true, 70, true),
    ('employee_info_update', 'personal_data', 'تحديث البيانات الشخصية', 'Employee information update',
     'تحديث رقم الجوال أو البريد الإلكتروني أو العنوان أو الحالة الاجتماعية أو جهة الطوارئ أو بيانات الجواز.',
     'Update mobile, email, address, marital status, emergency contact or passport details.',
     'user-pen', '#0F5E6B', 3, false, true, true, 80, true),
    ('overtime', 'attendance', 'العمل الإضافي', 'Overtime',
     'تسجيل ساعات العمل الإضافي لاعتمادها من المدير المباشر والموارد البشرية.',
     'Record overtime hours for approval by your manager and HR.',
     'timer', '#B25E09', 3, true, true, true, 90, true),
    ('business_trip', 'travel', 'رحلة عمل', 'Business trip',
     'طلب انتداب أو رحلة عمل مع احتياجات السفر والسلفة المالية.',
     'Request a business trip with travel arrangements and an optional advance.',
     'plane', '#1F6FD1', 3, true, true, true, 100, true),
    ('resignation', 'separation', 'الاستقالة', 'Resignation',
     'تقديم طلب الاستقالة وتحديد آخر يوم عمل مقترح.',
     'Submit your resignation and propose your last working day.',
     'log-out', '#5B6B70', 5, true, true, true, 110, true),
    ('other', 'general', 'طلب موارد بشرية آخر', 'Other HR request',
     'أي طلب آخر يخص الموارد البشرية.',
     'Any other HR-related request.',
     'clipboard-list', '#7A8A8F', 5, false, true, true, 120, false)
  on conflict (key) do nothing;

  -- 1. Leave ---------------------------------------------------------------------------------------
  perform private.seed_field('leave', 'leave_type', 'leave_type', 'نوع الإجازة', 'Leave type', true, 10, null, null, true);
  perform private.seed_field('leave', 'start_date', 'date', 'تاريخ بداية الإجازة', 'Start date', true, 20, null, null, true);
  perform private.seed_field('leave', 'end_date', 'date', 'تاريخ نهاية الإجازة', 'End date', true, 30, null, null, true);
  perform private.seed_field('leave', 'return_date', 'date', 'تاريخ المباشرة', 'Return to work date', false, 40, null, null, true,
    'يُقترح تلقائيًا بأول يوم عمل بعد نهاية الإجازة.', 'Suggested automatically as the first working day after the leave.');
  perform private.seed_field('leave', 'days', 'number', 'عدد الأيام المطلوبة', 'Requested days', false, 50, null, null, true,
    'تُحتسب تلقائيًا حسب نوع الإجازة وأيام العمل والعطل الرسمية.',
    'Calculated automatically from the leave type, working days and public holidays.',
    null, null, '{"readonly": true, "computed": "leave_days"}');
  perform private.seed_field('leave', 'reason', 'long_text', 'سبب الإجازة', 'Reason', false, 60, null, null, false,
    'لا يظهر السبب في تقويم الإجازات المشترك.', 'The reason is never shown on the shared leave calendar.');
  perform private.seed_field('leave', 'emergency_contact', 'phone', 'رقم التواصل أثناء الإجازة', 'Contact number during leave', false, 70,
    null, null, false, null, null, '05xxxxxxxx', '05xxxxxxxx');
  perform private.seed_field('leave', 'attachment', 'attachment', v_att_ar, v_att_en, false, 80, null, null, false,
    'مطلوبة لبعض أنواع الإجازات مثل الإجازة المرضية وإجازة الوضع.',
    'Required for some leave types such as sick and maternity leave.');

  -- 2. Certificate ---------------------------------------------------------------------------------
  perform private.seed_field('certificate', 'subtype', 'dropdown', 'نوع الشهادة', 'Certificate type', true, 10,
    private.seed_options(array[
      'salary', 'تعريف بالراتب', 'Salary certificate',
      'employment', 'شهادة تعريف بالعمل', 'Employment certificate',
      'salary_employment', 'تعريف بالعمل والراتب', 'Salary & employment certificate',
      'experience', 'شهادة خبرة', 'Experience certificate',
      'custom', 'خطاب مخصص', 'Custom certificate']), null, true);
  perform private.seed_field('certificate', 'language', 'dropdown', 'لغة الشهادة', 'Certificate language', true, 20,
    private.seed_options(array[
      'ar', 'العربية', 'Arabic',
      'en', 'الإنجليزية', 'English',
      'bilingual', 'العربية والإنجليزية', 'Arabic & English']), null, true);
  perform private.seed_field('certificate', 'addressed_to', 'short_text', 'الجهة الموجّهة إليها', 'Addressed to', false, 30, null, null, true,
    null, null, 'إلى من يهمه الأمر', 'To whom it may concern');
  perform private.seed_field('certificate', 'purpose', 'short_text', 'الغرض من الشهادة', 'Purpose', false, 40, null, null, true,
    null, null, 'مثال: فتح حساب بنكي', 'e.g. opening a bank account');
  perform private.seed_field('certificate', 'include_salary', 'yes_no', 'إظهار الراتب', 'Include salary', false, 50, null,
    '{"field": "subtype", "in": ["salary", "salary_employment", "custom"]}', true);
  perform private.seed_field('certificate', 'include_allowances', 'yes_no', 'إظهار تفاصيل البدلات', 'Include allowances breakdown', false, 60, null,
    '{"field": "subtype", "in": ["salary", "salary_employment", "custom"]}', true);
  perform private.seed_field('certificate', 'comments', 'long_text', 'ملاحظات إضافية', 'Additional comments', false, 70);

  -- 3. Iqama & visa --------------------------------------------------------------------------------
  perform private.seed_field('iqama_visa', 'subtype', 'dropdown', 'نوع الخدمة', 'Service', true, 10,
    private.seed_options(array[
      'iqama_renewal', 'تجديد الإقامة', 'Iqama renewal',
      'dependent_iqama_renewal', 'تجديد إقامة تابع', 'Dependent iqama renewal',
      'exit_reentry', 'تأشيرة خروج وعودة', 'Exit re-entry visa',
      'multiple_exit_reentry', 'تأشيرة خروج وعودة متعددة', 'Multiple exit re-entry visa',
      'final_exit', 'خروج نهائي', 'Final exit',
      'passport_update', 'تحديث بيانات الجواز', 'Passport update',
      'profession_update', 'تعديل المهنة', 'Profession update',
      'other', 'أخرى', 'Other']), null, true);
  perform private.seed_field('iqama_visa', 'dependent', 'dependent', 'التابع', 'Dependent', true, 20, null,
    '{"field": "subtype", "in": ["dependent_iqama_renewal"]}');
  perform private.seed_field('iqama_visa', 'travel_date', 'date', 'تاريخ السفر المتوقع', 'Expected travel date', true, 30, null,
    '{"field": "subtype", "in": ["exit_reentry", "multiple_exit_reentry", "final_exit"]}');
  perform private.seed_field('iqama_visa', 'expected_return_date', 'date', 'تاريخ العودة المتوقع', 'Expected return date', false, 40, null,
    '{"field": "subtype", "in": ["exit_reentry", "multiple_exit_reentry"]}');
  perform private.seed_field('iqama_visa', 'visa_duration_months', 'number', 'مدة التأشيرة (بالأشهر)', 'Visa duration (months)', false, 50, null,
    '{"field": "subtype", "in": ["exit_reentry", "multiple_exit_reentry"]}', false, null, null, null, null, '{"min": 1, "max": 24}');
  perform private.seed_field('iqama_visa', 'destination_country', 'short_text', 'دولة الوجهة', 'Destination country', false, 60, null,
    '{"field": "subtype", "in": ["exit_reentry", "multiple_exit_reentry", "final_exit"]}');
  perform private.seed_field('iqama_visa', 'new_passport_number', 'short_text', 'رقم الجواز الجديد', 'New passport number', true, 70, null,
    '{"field": "subtype", "in": ["passport_update"]}');
  perform private.seed_field('iqama_visa', 'new_passport_expiry', 'date', 'تاريخ انتهاء الجواز الجديد', 'New passport expiry date', true, 80, null,
    '{"field": "subtype", "in": ["passport_update"]}');
  perform private.seed_field('iqama_visa', 'requested_profession', 'short_text', 'المهنة المطلوبة', 'Requested profession', true, 90, null,
    '{"field": "subtype", "in": ["profession_update"]}');
  perform private.seed_field('iqama_visa', 'details', 'long_text', 'تفاصيل الطلب', 'Details', false, 100);
  perform private.seed_field('iqama_visa', 'attachment', 'attachment', v_att_ar, v_att_en, false, 110, null, null, false,
    'مثل صورة الجواز أو الإقامة.', 'For example a copy of the passport or iqama.');

  -- 4. Medical insurance ---------------------------------------------------------------------------
  perform private.seed_field('medical_insurance', 'subtype', 'dropdown', 'نوع الطلب', 'Request type', true, 10,
    private.seed_options(array[
      'card_issue', 'إصدار بطاقة التأمين', 'Insurance card issue',
      'coverage_issue', 'مشكلة في التغطية', 'Coverage issue',
      'provider_issue', 'مشكلة مع مستشفى أو عيادة', 'Hospital / clinic issue',
      'claim_issue', 'مشكلة في مطالبة', 'Claim issue',
      'approval_issue', 'مشكلة في موافقة طبية', 'Approval issue',
      'add_dependent', 'إضافة تابع', 'Add dependent',
      'remove_dependent', 'حذف تابع', 'Remove dependent',
      'update_dependent', 'تحديث بيانات تابع', 'Update dependent',
      'new_enrollment', 'تسجيل موظف جديد', 'New employee enrollment',
      'other', 'أخرى', 'Other']), null, true);
  perform private.seed_field('medical_insurance', 'insurance_for', 'dropdown', 'التأمين لـ', 'Insurance for', true, 20,
    private.seed_options(array['self', 'الموظف نفسه', 'Myself', 'dependent', 'أحد التابعين', 'A dependent']),
    '{"field": "subtype", "in": ["card_issue", "coverage_issue", "provider_issue", "claim_issue", "approval_issue", "other"]}');
  perform private.seed_field('medical_insurance', 'dependent', 'dependent', 'التابع', 'Dependent', true, 30, null,
    '{"any": [{"field": "insurance_for", "in": ["dependent"]}, {"field": "subtype", "in": ["remove_dependent", "update_dependent"]}]}');
  perform private.seed_field('medical_insurance', 'new_dependent_name', 'short_text', 'اسم التابع', 'Dependent name', true, 40, null,
    '{"field": "subtype", "in": ["add_dependent"]}');
  perform private.seed_field('medical_insurance', 'new_dependent_relationship', 'dropdown', 'صلة القرابة', 'Relationship', true, 50,
    private.seed_options(array[
      'spouse', 'زوج / زوجة', 'Spouse', 'son', 'ابن', 'Son', 'daughter', 'ابنة', 'Daughter',
      'father', 'أب', 'Father', 'mother', 'أم', 'Mother', 'other', 'أخرى', 'Other']),
    '{"field": "subtype", "in": ["add_dependent"]}');
  perform private.seed_field('medical_insurance', 'new_dependent_birth_date', 'date', 'تاريخ ميلاد التابع', 'Dependent date of birth', false, 60, null,
    '{"field": "subtype", "in": ["add_dependent"]}');
  perform private.seed_field('medical_insurance', 'provider', 'short_text', 'مقدم الخدمة', 'Provider (hospital / clinic)', false, 70, null,
    '{"field": "subtype", "in": ["coverage_issue", "provider_issue", "claim_issue", "approval_issue"]}');
  perform private.seed_field('medical_insurance', 'claim_number', 'short_text', 'رقم المطالبة أو الموافقة', 'Claim / approval number', false, 80, null,
    '{"field": "subtype", "in": ["claim_issue", "approval_issue"]}');
  perform private.seed_field('medical_insurance', 'issue_description', 'long_text', 'وصف الطلب', 'Description', true, 90);
  perform private.seed_field('medical_insurance', 'attachment', 'attachment', v_att_ar, v_att_en, false, 100);

  -- 5. Payroll -------------------------------------------------------------------------------------
  perform private.seed_field('payroll', 'subtype', 'dropdown', 'نوع المشكلة', 'Issue type', true, 10,
    private.seed_options(array[
      'salary_not_received', 'عدم استلام الراتب', 'Salary not received',
      'incorrect_salary', 'خطأ في الراتب', 'Incorrect salary',
      'incorrect_deduction', 'خطأ في الاستقطاع', 'Incorrect deduction',
      'missing_allowance', 'بدل غير مصروف', 'Missing allowance',
      'overtime_payment', 'مستحقات العمل الإضافي', 'Overtime payment issue',
      'bonus_issue', 'المكافأة', 'Bonus issue',
      'end_of_service', 'مكافأة نهاية الخدمة', 'End of service issue',
      'other', 'أخرى', 'Other']), null, true);
  perform private.seed_field('payroll', 'payroll_month', 'date', 'شهر الراتب', 'Payroll month', true, 20, null, null, false,
    'اختر أي يوم من الشهر المعني.', 'Pick any day in the relevant month.', null, null, '{"granularity": "month"}');
  perform private.seed_field('payroll', 'amount', 'currency', 'المبلغ', 'Amount', false, 30);
  perform private.seed_field('payroll', 'description', 'long_text', 'وصف المشكلة', 'Description', true, 40);
  perform private.seed_field('payroll', 'attachment', 'attachment', v_att_ar, v_att_en, false, 50);

  -- 6. Attendance & time ---------------------------------------------------------------------------
  perform private.seed_field('attendance', 'subtype', 'dropdown', 'نوع الطلب', 'Request type', true, 10,
    private.seed_options(array[
      'missing_check_in', 'عدم تسجيل الحضور', 'Missing check-in',
      'missing_check_out', 'عدم تسجيل الانصراف', 'Missing check-out',
      'incorrect_check_in', 'خطأ في وقت الحضور', 'Incorrect check-in',
      'incorrect_check_out', 'خطأ في وقت الانصراف', 'Incorrect check-out',
      'late_arrival', 'تأخر عن الحضور', 'Late arrival',
      'early_departure', 'انصراف مبكر', 'Early departure',
      'attendance_correction', 'تصحيح سجل الحضور', 'Attendance correction',
      'remote_work', 'العمل عن بُعد', 'Remote work request',
      'other', 'أخرى', 'Other']), null, true);
  perform private.seed_field('attendance', 'attendance_date', 'date', 'التاريخ', 'Date', true, 20);
  perform private.seed_field('attendance', 'end_date', 'date', 'حتى تاريخ', 'Until date', false, 30, null,
    '{"field": "subtype", "in": ["remote_work"]}');
  perform private.seed_field('attendance', 'check_in_time', 'time', 'وقت الحضور', 'Check-in time', false, 40, null,
    '{"field": "subtype", "in": ["missing_check_in", "incorrect_check_in", "late_arrival", "attendance_correction"]}');
  perform private.seed_field('attendance', 'check_out_time', 'time', 'وقت الانصراف', 'Check-out time', false, 50, null,
    '{"field": "subtype", "in": ["missing_check_out", "incorrect_check_out", "early_departure", "attendance_correction"]}');
  perform private.seed_field('attendance', 'reason', 'long_text', 'السبب', 'Reason', true, 60);
  perform private.seed_field('attendance', 'attachment', 'attachment', v_att_ar, v_att_en, false, 70);

  -- 7. Bank account update -------------------------------------------------------------------------
  perform private.seed_field('bank_update', 'bank_name', 'short_text', 'اسم البنك', 'Bank name', true, 10, null, null, true);
  perform private.seed_field('bank_update', 'iban', 'short_text', 'رقم الآيبان', 'IBAN', true, 20, null, null, true,
    'رقم الآيبان المكوّن من 24 خانة ويبدأ بـ SA.', 'The 24-character IBAN starting with SA.',
    'SA0000000000000000000000', 'SA0000000000000000000000',
    '{"pattern": "^[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]{11,40}$"}');
  perform private.seed_field('bank_update', 'account_holder', 'short_text', 'اسم صاحب الحساب', 'Account holder name', true, 30, null, null, true);
  perform private.seed_field('bank_update', 'iban_certificate', 'attachment', 'شهادة الآيبان', 'IBAN certificate', true, 40, null, null, true,
    'خطاب صادر من البنك يثبت رقم الآيبان واسم صاحب الحساب.', 'A bank-issued letter confirming the IBAN and account holder.');
  perform private.seed_field('bank_update', 'notes', 'long_text', 'ملاحظات', 'Notes', false, 50);

  -- 8. Employee information update -----------------------------------------------------------------
  perform private.seed_field('employee_info_update', 'subtype', 'dropdown', 'البيان المطلوب تحديثه', 'Information to update', true, 10,
    private.seed_options(array[
      'mobile', 'رقم الجوال', 'Mobile number',
      'email', 'البريد الإلكتروني الشخصي', 'Personal email',
      'address', 'العنوان', 'Address',
      'marital_status', 'الحالة الاجتماعية', 'Marital status',
      'emergency_contact', 'جهة الاتصال في حالات الطوارئ', 'Emergency contact',
      'passport', 'بيانات الجواز', 'Passport details',
      'dependent', 'بيانات تابع', 'Dependent details',
      'other', 'أخرى', 'Other']), null, true);
  perform private.seed_field('employee_info_update', 'current_value', 'short_text', 'القيمة الحالية', 'Current value', false, 20, null,
    '{"field": "subtype", "in": ["mobile", "email", "address", "marital_status", "dependent", "other"]}', true,
    'تُعبّأ تلقائيًا من ملفك عند توفرها.', 'Pre-filled from your profile when available.');
  perform private.seed_field('employee_info_update', 'requested_value', 'short_text', 'القيمة الجديدة', 'New value', true, 30, null,
    '{"field": "subtype", "in": ["mobile", "email", "address", "dependent", "other"]}', true);
  perform private.seed_field('employee_info_update', 'requested_marital_status', 'dropdown', 'الحالة الاجتماعية الجديدة', 'New marital status', true, 40,
    private.seed_options(array[
      'single', 'أعزب / عزباء', 'Single', 'married', 'متزوج / متزوجة', 'Married',
      'divorced', 'مطلق / مطلقة', 'Divorced', 'widowed', 'أرمل / أرملة', 'Widowed']),
    '{"field": "subtype", "in": ["marital_status"]}', true);
  perform private.seed_field('employee_info_update', 'emergency_contact_name', 'short_text', 'اسم جهة الاتصال', 'Contact name', true, 50, null,
    '{"field": "subtype", "in": ["emergency_contact"]}', true);
  perform private.seed_field('employee_info_update', 'emergency_contact_relationship', 'short_text', 'صلة القرابة', 'Relationship', false, 60, null,
    '{"field": "subtype", "in": ["emergency_contact"]}', true);
  perform private.seed_field('employee_info_update', 'emergency_contact_mobile', 'phone', 'رقم جوال جهة الاتصال', 'Contact mobile', true, 70, null,
    '{"field": "subtype", "in": ["emergency_contact"]}', true);
  perform private.seed_field('employee_info_update', 'passport_number', 'short_text', 'رقم الجواز', 'Passport number', true, 80, null,
    '{"field": "subtype", "in": ["passport"]}', true);
  perform private.seed_field('employee_info_update', 'passport_expiry', 'date', 'تاريخ انتهاء الجواز', 'Passport expiry date', true, 90, null,
    '{"field": "subtype", "in": ["passport"]}', true);
  perform private.seed_field('employee_info_update', 'reason', 'long_text', 'سبب التحديث', 'Reason for update', true, 100);
  perform private.seed_field('employee_info_update', 'attachment', 'attachment', 'المستند الداعم', 'Supporting document', false, 110);

  -- 9. Overtime ------------------------------------------------------------------------------------
  perform private.seed_field('overtime', 'overtime_date', 'date', 'تاريخ العمل الإضافي', 'Overtime date', true, 10);
  perform private.seed_field('overtime', 'start_time', 'time', 'وقت البداية', 'Start time', true, 20);
  perform private.seed_field('overtime', 'end_time', 'time', 'وقت النهاية', 'End time', true, 30);
  perform private.seed_field('overtime', 'hours', 'number', 'عدد الساعات', 'Hours', true, 40, null, null, false,
    null, null, null, null, '{"min": 0.5, "max": 24, "step": 0.5}');
  perform private.seed_field('overtime', 'reason', 'long_text', 'مبرر العمل الإضافي', 'Reason', true, 50);
  perform private.seed_field('overtime', 'attachment', 'attachment', v_att_ar, v_att_en, false, 60);

  -- 10. Business trip ------------------------------------------------------------------------------
  perform private.seed_field('business_trip', 'destination_city', 'short_text', 'مدينة الوجهة', 'Destination city', true, 10);
  perform private.seed_field('business_trip', 'country', 'short_text', 'الدولة', 'Country', true, 20);
  perform private.seed_field('business_trip', 'start_date', 'date', 'تاريخ البداية', 'Start date', true, 30);
  perform private.seed_field('business_trip', 'end_date', 'date', 'تاريخ النهاية', 'End date', true, 40);
  perform private.seed_field('business_trip', 'purpose', 'long_text', 'الغرض من الرحلة', 'Purpose', true, 50);
  perform private.seed_field('business_trip', 'cost_center', 'short_text', 'مركز التكلفة', 'Cost center', false, 60);
  perform private.seed_field('business_trip', 'flight_required', 'yes_no', 'حجز طيران', 'Flight required', false, 70);
  perform private.seed_field('business_trip', 'hotel_required', 'yes_no', 'حجز فندق', 'Hotel required', false, 80);
  perform private.seed_field('business_trip', 'transport_required', 'yes_no', 'مواصلات', 'Transport required', false, 90);
  perform private.seed_field('business_trip', 'advance_required', 'yes_no', 'سلفة مالية', 'Advance required', false, 100);
  perform private.seed_field('business_trip', 'advance_amount', 'currency', 'مبلغ السلفة', 'Advance amount', true, 110, null,
    '{"field": "advance_required", "in": [true]}');
  perform private.seed_field('business_trip', 'notes', 'long_text', 'ملاحظات', 'Notes', false, 120);

  -- 11. Resignation --------------------------------------------------------------------------------
  perform private.seed_field('resignation', 'subtype', 'dropdown', 'سبب الاستقالة', 'Reason for resignation', true, 10,
    private.seed_options(array[
      'career_opportunity', 'فرصة وظيفية', 'Career opportunity',
      'personal', 'أسباب شخصية', 'Personal reasons',
      'relocation', 'الانتقال إلى مدينة أخرى', 'Relocation',
      'education', 'استكمال الدراسة', 'Education',
      'compensation', 'الراتب والمزايا', 'Compensation',
      'work_environment', 'بيئة العمل', 'Work environment',
      'retirement', 'التقاعد', 'Retirement',
      'other', 'أخرى', 'Other']), null, true);
  perform private.seed_field('resignation', 'submission_date', 'date', 'تاريخ تقديم الاستقالة', 'Submission date', true, 20);
  perform private.seed_field('resignation', 'last_working_day', 'date', 'آخر يوم عمل مقترح', 'Proposed last working day', true, 30);
  perform private.seed_field('resignation', 'comments', 'long_text', 'ملاحظات', 'Comments', false, 40);
  perform private.seed_field('resignation', 'attachment', 'attachment', 'خطاب الاستقالة', 'Resignation letter', false, 50);

  -- 12. Other --------------------------------------------------------------------------------------
  perform private.seed_field('other', 'subject', 'short_text', 'الموضوع', 'Subject', true, 10);
  perform private.seed_field('other', 'details', 'long_text', 'تفاصيل الطلب', 'Details', true, 20);
  perform private.seed_field('other', 'attachment', 'attachment', v_att_ar, v_att_en, false, 30);

  -- Default workflows (PRODUCT-SPEC §8): Leave, Overtime, Business trip, Attendance, Resignation →
  -- manager then HR; everything else → HR only.
  perform private.seed_workflow('leave', true);
  perform private.seed_workflow('overtime', true);
  perform private.seed_workflow('business_trip', true);
  perform private.seed_workflow('attendance', true);
  perform private.seed_workflow('resignation', true);
  perform private.seed_workflow('certificate', false);
  perform private.seed_workflow('iqama_visa', false);
  perform private.seed_workflow('medical_insurance', false);
  perform private.seed_workflow('payroll', false);
  perform private.seed_workflow('bank_update', false);
  perform private.seed_workflow('employee_info_update', false);
  perform private.seed_workflow('other', false);
end;
$$;
