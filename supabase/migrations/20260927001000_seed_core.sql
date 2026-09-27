-- =====================================================================================================
-- HR Portal — default configuration seeds (part 1): roles + permission matrix, organization singletons,
-- leave types, notification settings. Real product defaults (no demo data); all editable at runtime.
-- Seed functions are idempotent and are re-used by reset_organization().
-- =====================================================================================================

create or replace function private.seed_roles_permissions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modules text[] := array['employees', 'personal_data', 'bank', 'insurance', 'documents', 'requests', 'approvals',
                            'leave', 'certificates', 'reports', 'settings', 'audit', 'users'];
  v_actions text[] := array['view', 'create', 'edit', 'approve', 'export', 'administer'];
begin
  insert into public.roles (key, name_ar, name_en, description_ar, description_en, is_system, rank, data_scope)
  values
    ('super_admin', 'مدير النظام', 'Super Admin',
     'تحكم كامل بالمنصة: المنشأة والهوية والمستخدمين والصلاحيات والإعدادات والبيانات.',
     'Full control of the platform: organization, branding, users, permissions, configuration and data.',
     true, 100, 'organization'),
    ('hr_admin', 'مدير الموارد البشرية', 'HR Admin',
     'إدارة شؤون الموظفين والتسجيلات والطلبات والإجازات والمستندات والشهادات والتقارير والإعدادات المسموح بها.',
     'Manages employees, registrations, requests, leave, documents, certificates, reports and permitted HR settings.',
     true, 80, 'organization'),
    ('hr_officer', 'أخصائي الموارد البشرية', 'HR Officer',
     'تنفيذ العمليات اليومية للموارد البشرية وفق الصلاحيات الممنوحة.',
     'Runs day-to-day HR operations within the granted permissions.',
     true, 60, 'organization'),
    ('manager', 'مدير مباشر', 'Manager',
     'الاطلاع على بيانات المرؤوسين المباشرين واعتماد طلباتهم وإجازاتهم.',
     'Views direct reports and approves their requests and leave.',
     true, 40, 'team'),
    ('employee', 'موظف', 'Employee',
     'الخدمة الذاتية: الملف الشخصي والإجازات والطلبات والمستندات والشهادات.',
     'Self-service: own profile, leave, requests, documents and certificates.',
     true, 20, 'own')
  on conflict (key) do update
    set is_system = true,
        rank = excluded.rank,
        data_scope = excluded.data_scope;

  -- super_admin and hr_admin: every module × action (super-admin ownership is protected in the RPCs)
  insert into public.role_permissions (role_id, module, action)
  select r.id, m, a
  from public.roles r, unnest(v_modules) m, unnest(v_actions) a
  where r.key in ('super_admin', 'hr_admin')
  on conflict do nothing;

  insert into public.role_permissions (role_id, module, action)
  select r.id, p.module, p.action
  from public.roles r
  join (values
    ('hr_officer', 'employees', 'view'), ('hr_officer', 'employees', 'create'), ('hr_officer', 'employees', 'edit'),
    ('hr_officer', 'employees', 'export'),
    ('hr_officer', 'personal_data', 'view'), ('hr_officer', 'personal_data', 'edit'),
    ('hr_officer', 'bank', 'view'),
    ('hr_officer', 'insurance', 'view'), ('hr_officer', 'insurance', 'edit'),
    ('hr_officer', 'documents', 'view'), ('hr_officer', 'documents', 'create'), ('hr_officer', 'documents', 'edit'),
    ('hr_officer', 'requests', 'view'), ('hr_officer', 'requests', 'edit'), ('hr_officer', 'requests', 'approve'),
    ('hr_officer', 'approvals', 'view'), ('hr_officer', 'approvals', 'approve'),
    ('hr_officer', 'leave', 'view'), ('hr_officer', 'leave', 'create'), ('hr_officer', 'leave', 'edit'),
    ('hr_officer', 'leave', 'approve'),
    ('hr_officer', 'certificates', 'view'), ('hr_officer', 'certificates', 'create'),
    ('hr_officer', 'reports', 'view'), ('hr_officer', 'reports', 'export'),
    ('manager', 'employees', 'view'),
    ('manager', 'requests', 'view'), ('manager', 'requests', 'approve'),
    ('manager', 'approvals', 'view'), ('manager', 'approvals', 'approve'),
    ('manager', 'leave', 'view'), ('manager', 'leave', 'approve'),
    ('employee', 'requests', 'view'), ('employee', 'requests', 'create'),
    ('employee', 'leave', 'view'), ('employee', 'leave', 'create'),
    ('employee', 'documents', 'view'),
    ('employee', 'certificates', 'view')
  ) as p(role_key, module, action) on p.role_key = r.key
  on conflict do nothing;
end;
$$;

create or replace function private.seed_organization()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organizations (singleton, country) values (true, 'SA') on conflict (singleton) do nothing;
  insert into public.organization_settings (singleton) values (true) on conflict (singleton) do nothing;
end;
$$;

create or replace function private.seed_leave_types()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.leave_types (code, name_ar, name_en, description_ar, description_en, is_paid, deducts_balance,
                                  default_entitlement, max_days_per_request, day_count_basis, requires_attachment,
                                  gender_restriction, color, sort_order)
  values
    ('annual', 'الإجازة السنوية', 'Annual leave',
     'إجازة سنوية مدفوعة الأجر تُخصم من الرصيد (21 يومًا، و30 يومًا بعد خمس سنوات خدمة وفق نظام العمل).',
     'Paid annual leave deducted from the balance (21 days; 30 days after five years of service under the Labor Law).',
     true, true, 21, null, 'working', false, null, '#0F5E6B', 10),
    ('sick', 'الإجازة المرضية', 'Sick leave',
     'إجازة مرضية بموجب تقرير طبي معتمد، تُحتسب بالأيام التقويمية ولا تُخصم من رصيد الإجازة السنوية.',
     'Sick leave supported by an approved medical report; counted in calendar days and not deducted from annual leave.',
     true, false, 0, null, 'calendar', true, null, '#C8322B', 20),
    ('emergency', 'الإجازة الاضطرارية', 'Emergency leave',
     'إجازة قصيرة للظروف الطارئة، تُخصم من رصيدها المستقل.',
     'Short leave for urgent circumstances, deducted from its own balance.',
     true, true, 5, 3, 'working', false, null, '#B25E09', 30),
    ('unpaid', 'إجازة بدون أجر', 'Unpaid leave',
     'إجازة بدون أجر بالاتفاق مع صاحب العمل.',
     'Unpaid leave by agreement with the employer.',
     false, false, 0, null, 'calendar', false, null, '#5B6B70', 40),
    ('marriage', 'إجازة الزواج', 'Marriage leave',
     'خمسة أيام بأجر كامل بمناسبة زواج الموظف.',
     'Five days with full pay on the employee''s marriage.',
     true, false, 0, 5, 'calendar', true, null, '#B8862F', 50),
    ('maternity', 'إجازة الوضع', 'Maternity leave',
     'إجازة وضع بأجر كامل لمدة اثني عشر أسبوعًا.',
     'Maternity leave with full pay for twelve weeks.',
     true, false, 0, 84, 'calendar', true, 'female', '#B8457A', 60),
    ('paternity', 'إجازة المولود', 'Paternity leave',
     'ثلاثة أيام بأجر كامل للموظف عند ولادة مولود له.',
     'Three days with full pay for the employee on the birth of a child.',
     true, false, 0, 3, 'calendar', true, 'male', '#1F6FD1', 70),
    ('bereavement', 'إجازة الوفاة', 'Bereavement leave',
     'خمسة أيام بأجر كامل عند وفاة الزوج أو أحد الأصول أو الفروع.',
     'Five days with full pay on the death of a spouse, ascendant or descendant.',
     true, false, 0, 5, 'calendar', false, null, '#3D4A4F', 80),
    ('hajj', 'إجازة الحج', 'Hajj leave',
     'إجازة بأجر لأداء فريضة الحج مرة واحدة طوال مدة الخدمة، لا تقل عن عشرة أيام ولا تزيد على خمسة عشر يومًا شاملة إجازة عيد الأضحى.',
     'Paid leave to perform Hajj once during the service, not less than ten and not more than fifteen days including Eid Al-Adha.',
     true, false, 0, 15, 'calendar', false, null, '#12805C', 90),
    ('exam', 'إجازة الامتحان', 'Exam leave',
     'إجازة بأجر لأداء الامتحانات المعتمدة بعد تقديم ما يثبت ذلك.',
     'Paid leave to sit approved examinations upon providing proof.',
     true, false, 0, null, 'calendar', true, null, '#6D5BD0', 100),
    ('other', 'إجازة أخرى', 'Other leave',
     'أي إجازة أخرى يُتفق عليها مع الموارد البشرية.',
     'Any other leave agreed with HR.',
     false, false, 0, null, 'calendar', false, null, '#7A8A8F', 110)
  on conflict (code) do nothing;
end;
$$;

create or replace function private.seed_notification_settings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_settings (event_key, in_app_enabled, email_enabled, recipients)
  values
    ('request_submitted', true, true, '["requester"]'),
    ('approval_required', true, true, '["approver"]'),
    ('request_approved', true, true, '["requester", "employee"]'),
    ('request_rejected', true, true, '["requester", "employee"]'),
    ('request_returned', true, true, '["requester", "employee"]'),
    ('request_assigned', true, false, '["assignee"]'),
    ('request_in_progress', true, false, '["requester", "employee"]'),
    ('request_completed', true, true, '["requester", "employee"]'),
    ('request_cancelled', true, false, '["requester", "approver"]'),
    ('request_comment', true, false, '["participants"]'),
    ('registration_submitted', true, true, '["registration_reviewers"]'),
    ('registration_approved', true, true, '["applicant"]'),
    ('registration_rejected', true, true, '["applicant"]'),
    ('registration_info_requested', true, false, '["applicant"]'),
    ('certificate_issued', true, false, '["employee"]'),
    ('leave_balance_adjusted', true, false, '["employee"]'),
    ('expiry_alert', true, true, '["hr", "employee"]'),
    ('account_invited', true, true, '["invitee"]')
  on conflict (event_key) do nothing;
end;
$$;
