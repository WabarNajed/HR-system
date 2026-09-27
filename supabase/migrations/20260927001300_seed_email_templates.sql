-- =====================================================================================================
-- HR Portal — default configuration seeds (part 4): the 16 bilingual e-mail templates
-- Common placeholders: {{recipient_name}} {{employee_name}} {{manager_name}} {{request_number}}
-- {{request_type}} {{request_status}} {{company_name}} {{portal_name}} {{link}} (+ type specific).
-- Bodies are content only; lib/email/render.ts wraps them in the branded layout.
-- =====================================================================================================

create or replace function private.seed_email_templates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_common jsonb := '["recipient_name", "company_name", "portal_name", "link"]'::jsonb;
  v_req    jsonb := '["recipient_name", "employee_name", "manager_name", "request_number", "request_type", "request_status", "company_name", "portal_name", "link"]'::jsonb;
  v_exp    jsonb := '["recipient_name", "employee_name", "expiry_date", "days_left", "company_name", "portal_name", "link"]'::jsonb;
begin
  insert into public.email_templates (key, name_ar, name_en, subject_ar, subject_en, body_ar, body_en, placeholders)
  values
    ('account_invitation', 'دعوة حساب جديد', 'Account invitation',
     'دعوة للانضمام إلى {{portal_name}}', 'You are invited to join {{portal_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>يسرّ {{company_name}} دعوتك لاستخدام <strong>{{portal_name}}</strong>، حيث يمكنك الاطلاع على بياناتك الوظيفية وتقديم طلباتك ومتابعة إجازاتك ومستنداتك في مكان واحد.</p><p>لتفعيل حسابك وتعيين كلمة المرور، يُرجى الضغط على الزر التالي:</p><p><a href="{{link}}" class="button">تفعيل الحساب</a></p><p>إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة بأمان.</p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>{{company_name}} has invited you to <strong>{{portal_name}}</strong>, where you can view your employment details, submit requests and track your leave and documents in one place.</p><p>To activate your account and set your password, please use the button below:</p><p><a href="{{link}}" class="button">Activate account</a></p><p>If you were not expecting this invitation, you can safely ignore this email.</p>$html$,
     v_common),

    ('registration_submitted', 'طلب تسجيل جديد', 'Registration submitted',
     'طلب تسجيل جديد بانتظار المراجعة', 'New registration awaiting review',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>تم استلام طلب تسجيل جديد في {{portal_name}} ويحتاج إلى مراجعتك:</p><ul><li>الاسم: <strong>{{employee_name}}</strong></li><li>البريد الإلكتروني: {{email}}</li><li>الرقم الوظيفي المُدخل: {{employee_number}}</li></ul><p>يُرجى مراجعة الطلب وربطه بسجل الموظف المناسب، ثم اعتماده أو رفضه أو طلب معلومات إضافية.</p><p><a href="{{link}}" class="button">مراجعة الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>A new registration has been submitted to {{portal_name}} and needs your review:</p><ul><li>Name: <strong>{{employee_name}}</strong></li><li>Email: {{email}}</li><li>Employee ID entered: {{employee_number}}</li></ul><p>Please review the registration, link it to the matching employee record, then approve it, reject it or request more information.</p><p><a href="{{link}}" class="button">Review registration</a></p>$html$,
     '["recipient_name", "employee_name", "email", "employee_number", "company_name", "portal_name", "link"]'::jsonb),

    ('registration_approved', 'اعتماد التسجيل', 'Registration approved',
     'تم اعتماد حسابك في {{portal_name}}', 'Your {{portal_name}} account has been approved',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>يسعدنا إبلاغك بأنه تم اعتماد حسابك في <strong>{{portal_name}}</strong> من قِبل فريق الموارد البشرية في {{company_name}}.</p><p>يمكنك الآن تسجيل الدخول والاستفادة من خدمات الموظفين الذاتية.</p><p><a href="{{link}}" class="button">تسجيل الدخول</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>We are pleased to let you know that your <strong>{{portal_name}}</strong> account has been approved by the {{company_name}} HR team.</p><p>You can now sign in and use the employee self-service features.</p><p><a href="{{link}}" class="button">Sign in</a></p>$html$,
     v_common),

    ('registration_rejected', 'رفض التسجيل', 'Registration rejected',
     'بشأن طلب التسجيل في {{portal_name}}', 'About your {{portal_name}} registration',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نشكرك على تسجيلك في {{portal_name}}. نأسف لإبلاغك بأنه تعذر اعتماد طلب التسجيل في الوقت الحالي.</p><p><strong>السبب:</strong> {{reason}}</p><p>للاستفسار، يُرجى التواصل مع إدارة الموارد البشرية في {{company_name}}.</p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>Thank you for registering with {{portal_name}}. Unfortunately, we were unable to approve your registration at this time.</p><p><strong>Reason:</strong> {{reason}}</p><p>If you have any questions, please contact the {{company_name}} HR department.</p>$html$,
     '["recipient_name", "reason", "company_name", "portal_name", "link"]'::jsonb),

    ('password_reset', 'إعادة تعيين كلمة المرور', 'Password reset',
     'إعادة تعيين كلمة المرور – {{portal_name}}', 'Reset your {{portal_name}} password',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك في {{portal_name}}.</p><p><a href="{{link}}" class="button">تعيين كلمة مرور جديدة</a></p><p>الرابط صالح لفترة محدودة ولاستخدام واحد فقط. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة وستبقى كلمة المرور الحالية دون تغيير.</p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>We received a request to reset the password for your {{portal_name}} account.</p><p><a href="{{link}}" class="button">Set a new password</a></p><p>This link is valid for a limited time and can be used only once. If you did not request a reset, you can ignore this email and your current password will remain unchanged.</p>$html$,
     v_common),

    ('request_submitted', 'تقديم طلب', 'Request submitted',
     'تم استلام طلبك رقم {{request_number}}', 'Your request {{request_number}} has been received',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>تم استلام طلبك <strong>{{request_type}}</strong> برقم <strong>{{request_number}}</strong> بنجاح، وهو الآن قيد المعالجة.</p><p>الحالة الحالية: <strong>{{request_status}}</strong></p><p>سنقوم بإشعارك عند أي تحديث على الطلب.</p><p><a href="{{link}}" class="button">عرض الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>Your <strong>{{request_type}}</strong> request <strong>{{request_number}}</strong> has been received and is now being processed.</p><p>Current status: <strong>{{request_status}}</strong></p><p>We will notify you of any updates.</p><p><a href="{{link}}" class="button">View request</a></p>$html$,
     v_req),

    ('approval_required', 'طلب بانتظار الاعتماد', 'Approval required',
     'طلب بانتظار اعتمادك: {{request_number}}', 'Approval required: {{request_number}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>يوجد طلب <strong>{{request_type}}</strong> مقدَّم من <strong>{{employee_name}}</strong> برقم <strong>{{request_number}}</strong> بانتظار إجرائك.</p><p>يُرجى مراجعة الطلب واتخاذ الإجراء المناسب (اعتماد أو رفض أو إعادة لاستكمال المعلومات) ضمن المدة المحددة.</p><p><a href="{{link}}" class="button">مراجعة الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>A <strong>{{request_type}}</strong> request <strong>{{request_number}}</strong> submitted by <strong>{{employee_name}}</strong> is awaiting your action.</p><p>Please review it and approve, reject or return it for more information within the service level.</p><p><a href="{{link}}" class="button">Review request</a></p>$html$,
     v_req),

    ('request_approved', 'اعتماد الطلب', 'Request approved',
     'تم اعتماد طلبك رقم {{request_number}}', 'Your request {{request_number}} has been approved',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>يسعدنا إبلاغك بأنه تم اعتماد طلبك <strong>{{request_type}}</strong> رقم <strong>{{request_number}}</strong>.</p><p><a href="{{link}}" class="button">عرض الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>We are pleased to inform you that your <strong>{{request_type}}</strong> request <strong>{{request_number}}</strong> has been approved.</p><p><a href="{{link}}" class="button">View request</a></p>$html$,
     v_req),

    ('request_rejected', 'رفض الطلب', 'Request rejected',
     'تعذر اعتماد طلبك رقم {{request_number}}', 'Your request {{request_number}} was not approved',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نأسف لإبلاغك بأنه تعذر اعتماد طلبك <strong>{{request_type}}</strong> رقم <strong>{{request_number}}</strong>.</p><p><strong>الملاحظات:</strong> {{comment}}</p><p>للاستفسار، يُرجى التواصل مع إدارة الموارد البشرية.</p><p><a href="{{link}}" class="button">عرض الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>We regret to inform you that your <strong>{{request_type}}</strong> request <strong>{{request_number}}</strong> was not approved.</p><p><strong>Comments:</strong> {{comment}}</p><p>If you have any questions, please contact the HR department.</p><p><a href="{{link}}" class="button">View request</a></p>$html$,
     v_req || '["comment"]'::jsonb),

    ('request_returned', 'إعادة الطلب لاستكمال المعلومات', 'Request returned',
     'مطلوب استكمال معلومات الطلب رقم {{request_number}}', 'More information needed for request {{request_number}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>أُعيد طلبك <strong>{{request_type}}</strong> رقم <strong>{{request_number}}</strong> لاستكمال بعض المعلومات.</p><p><strong>المطلوب:</strong> {{comment}}</p><p>يُرجى تحديث الطلب وإرفاق ما يلزم ثم إعادة إرساله ليستكمل مسار الاعتماد.</p><p><a href="{{link}}" class="button">تحديث الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>Your <strong>{{request_type}}</strong> request <strong>{{request_number}}</strong> has been returned for more information.</p><p><strong>Requested:</strong> {{comment}}</p><p>Please update the request, attach any required documents and resubmit it to continue the approval process.</p><p><a href="{{link}}" class="button">Update request</a></p>$html$,
     v_req || '["comment"]'::jsonb),

    ('request_completed', 'اكتمال الطلب', 'Request completed',
     'اكتمل تنفيذ طلبك رقم {{request_number}}', 'Your request {{request_number}} has been completed',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نفيدك بأنه تم الانتهاء من تنفيذ طلبك <strong>{{request_type}}</strong> رقم <strong>{{request_number}}</strong>.</p><p>يمكنك الاطلاع على تفاصيل الطلب وأي مستندات مرتبطة به عبر البوابة.</p><p><a href="{{link}}" class="button">عرض الطلب</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>Your <strong>{{request_type}}</strong> request <strong>{{request_number}}</strong> has been completed.</p><p>You can view the request details and any related documents in the portal.</p><p><a href="{{link}}" class="button">View request</a></p>$html$,
     v_req),

    ('iqama_expiry', 'تنبيه انتهاء الإقامة', 'Iqama expiry alert',
     'تنبيه: قرب انتهاء الإقامة – {{employee_name}}', 'Reminder: Iqama expiring – {{employee_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نود تذكيركم بأن إقامة <strong>{{employee_name}}</strong> تنتهي بتاريخ <strong>{{expiry_date}}</strong> (متبقٍ {{days_left}} يومًا).</p><p>يُرجى اتخاذ إجراءات التجديد في الوقت المناسب لتفادي أي مخالفات نظامية.</p><p><a href="{{link}}" class="button">عرض ملف الموظف</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>This is a reminder that the Iqama of <strong>{{employee_name}}</strong> expires on <strong>{{expiry_date}}</strong> ({{days_left}} days remaining).</p><p>Please start the renewal process in good time to avoid any regulatory penalties.</p><p><a href="{{link}}" class="button">Open employee profile</a></p>$html$,
     v_exp),

    ('passport_expiry', 'تنبيه انتهاء الجواز', 'Passport expiry alert',
     'تنبيه: قرب انتهاء جواز السفر – {{employee_name}}', 'Reminder: Passport expiring – {{employee_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نود تذكيركم بأن جواز سفر <strong>{{employee_name}}</strong> ينتهي بتاريخ <strong>{{expiry_date}}</strong> (متبقٍ {{days_left}} يومًا).</p><p>يُرجى تجديد الجواز وتحديث بياناته في النظام.</p><p><a href="{{link}}" class="button">عرض ملف الموظف</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>This is a reminder that the passport of <strong>{{employee_name}}</strong> expires on <strong>{{expiry_date}}</strong> ({{days_left}} days remaining).</p><p>Please renew the passport and update its details in the portal.</p><p><a href="{{link}}" class="button">Open employee profile</a></p>$html$,
     v_exp),

    ('insurance_expiry', 'تنبيه انتهاء التأمين الطبي', 'Insurance expiry alert',
     'تنبيه: قرب انتهاء التأمين الطبي – {{employee_name}}', 'Reminder: Medical insurance expiring – {{employee_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نود تذكيركم بأن وثيقة التأمين الطبي الخاصة بـ <strong>{{employee_name}}</strong> تنتهي بتاريخ <strong>{{expiry_date}}</strong> (متبقٍ {{days_left}} يومًا).</p><p>يُرجى التنسيق مع شركة التأمين لتجديد التغطية دون انقطاع.</p><p><a href="{{link}}" class="button">عرض ملف الموظف</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>This is a reminder that the medical insurance of <strong>{{employee_name}}</strong> expires on <strong>{{expiry_date}}</strong> ({{days_left}} days remaining).</p><p>Please coordinate with the insurer to renew the coverage without interruption.</p><p><a href="{{link}}" class="button">Open employee profile</a></p>$html$,
     v_exp),

    ('contract_expiry', 'تنبيه انتهاء العقد', 'Contract expiry alert',
     'تنبيه: قرب انتهاء عقد العمل – {{employee_name}}', 'Reminder: Employment contract ending – {{employee_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نود تذكيركم بأن عقد عمل <strong>{{employee_name}}</strong> ينتهي بتاريخ <strong>{{expiry_date}}</strong> (متبقٍ {{days_left}} يومًا).</p><p>يُرجى اتخاذ قرار التجديد أو عدمه وإشعار الموظف وفق المدد النظامية.</p><p><a href="{{link}}" class="button">عرض ملف الموظف</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>This is a reminder that the employment contract of <strong>{{employee_name}}</strong> ends on <strong>{{expiry_date}}</strong> ({{days_left}} days remaining).</p><p>Please decide on renewal and notify the employee within the statutory notice period.</p><p><a href="{{link}}" class="button">Open employee profile</a></p>$html$,
     v_exp),

    ('document_expiry', 'تنبيه انتهاء مستند', 'Document expiry alert',
     'تنبيه: قرب انتهاء مستند – {{employee_name}}', 'Reminder: Document expiring – {{employee_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>نود تذكيركم بأن مستند <strong>{{document_type}}</strong> الخاص بـ <strong>{{employee_name}}</strong> ينتهي بتاريخ <strong>{{expiry_date}}</strong> (متبقٍ {{days_left}} يومًا).</p><p>يُرجى تحديث المستند ورفع النسخة الجديدة في النظام.</p><p><a href="{{link}}" class="button">عرض المستندات</a></p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>This is a reminder that the <strong>{{document_type}}</strong> document of <strong>{{employee_name}}</strong> expires on <strong>{{expiry_date}}</strong> ({{days_left}} days remaining).</p><p>Please renew the document and upload the new copy to the portal.</p><p><a href="{{link}}" class="button">Open documents</a></p>$html$,
     v_exp || '["document_type"]'::jsonb)
  on conflict (key) do nothing;
end;
$$;
