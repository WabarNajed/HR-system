-- =====================================================================================================
-- HR Portal — default configuration seeds (part 3): certificate templates (version 1)
-- Variables (PRODUCT-SPEC §12): {{employee_name_ar}} {{employee_name_en}} {{employee_id}} {{job_title_ar}}
-- {{job_title_en}} {{department_ar}} {{department_en}} {{joining_date}} {{basic_salary}} {{housing_allowance}}
-- {{transport_allowance}} {{other_allowance}} {{total_salary}} {{company_name_ar}} {{company_name_en}}
-- {{company_address_ar}} {{company_address_en}} {{current_date}} {{addressed_to}} {{certificate_number}}
-- Conditional blocks for the renderer: data-if="<flag>" (removed when the flag is false/empty) and
-- data-if-not="<flag>" (removed when the flag is true/non-empty). Flags: include_salary,
-- include_allowances, addressed_to.
-- =====================================================================================================

create or replace function private.seed_certificate_templates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_header text := $html$<table class="cert-letterhead" style="width:100%;border-collapse:collapse"><tr><td dir="rtl" style="text-align:right;font-weight:600">{{company_name_ar}}</td><td dir="ltr" style="text-align:left;font-weight:600">{{company_name_en}}</td></tr></table>$html$;
  v_footer text := $html$<table class="cert-footer" style="width:100%;border-collapse:collapse;font-size:11px"><tr><td dir="rtl" style="text-align:right">{{company_address_ar}}<br>يمكن التحقق من صحة هذه الوثيقة عبر رمز الاستجابة السريعة المرفق.</td><td dir="ltr" style="text-align:left">{{company_address_en}}<br>The authenticity of this document can be verified via the enclosed QR code.</td></tr></table>$html$;

  -- shared building blocks ------------------------------------------------------------------------
  v_meta_ar text := $html$<p style="text-align:end">الرقم: {{certificate_number}}<br>التاريخ: {{current_date}}</p>$html$;
  v_meta_en text := $html$<p style="text-align:end">Ref.: {{certificate_number}}<br>Date: {{current_date}}</p>$html$;
  v_to_ar   text := $html$<p data-if="addressed_to"><strong>إلى: {{addressed_to}}</strong></p><p data-if-not="addressed_to"><strong>إلى من يهمه الأمر</strong></p>$html$;
  v_to_en   text := $html$<p data-if="addressed_to"><strong>To: {{addressed_to}}</strong></p><p data-if-not="addressed_to"><strong>To Whom It May Concern</strong></p>$html$;
  v_salary_ar text := $html$<p data-if="include_salary">ويتقاضى/وتتقاضى راتبًا شهريًا إجماليًا قدره <strong>{{total_salary}}</strong>.</p><table data-if="include_allowances" class="cert-table" style="width:100%;border-collapse:collapse"><tbody><tr><th style="text-align:start">الراتب الأساسي</th><td>{{basic_salary}}</td></tr><tr><th style="text-align:start">بدل السكن</th><td>{{housing_allowance}}</td></tr><tr><th style="text-align:start">بدل النقل</th><td>{{transport_allowance}}</td></tr><tr><th style="text-align:start">بدلات أخرى</th><td>{{other_allowance}}</td></tr><tr><th style="text-align:start">إجمالي الراتب الشهري</th><td><strong>{{total_salary}}</strong></td></tr></tbody></table>$html$;
  v_salary_en text := $html$<p data-if="include_salary">The employee receives a gross monthly salary of <strong>{{total_salary}}</strong>.</p><table data-if="include_allowances" class="cert-table" style="width:100%;border-collapse:collapse"><tbody><tr><th style="text-align:start">Basic salary</th><td>{{basic_salary}}</td></tr><tr><th style="text-align:start">Housing allowance</th><td>{{housing_allowance}}</td></tr><tr><th style="text-align:start">Transportation allowance</th><td>{{transport_allowance}}</td></tr><tr><th style="text-align:start">Other allowances</th><td>{{other_allowance}}</td></tr><tr><th style="text-align:start">Total monthly salary</th><td><strong>{{total_salary}}</strong></td></tr></tbody></table>$html$;
  v_employed_ar text := $html$<p>تشهد <strong>{{company_name_ar}}</strong> بأن السيد/السيدة <strong>{{employee_name_ar}}</strong>، الرقم الوظيفي (<strong>{{employee_id}}</strong>)، يعمل/تعمل لديها بوظيفة <strong>{{job_title_ar}}</strong> في <strong>{{department_ar}}</strong>، وذلك منذ تاريخ <strong>{{joining_date}}</strong>، ولا يزال/تزال على رأس العمل حتى تاريخ هذه الشهادة.</p>$html$;
  v_employed_en text := $html$<p>This is to certify that <strong>{{employee_name_en}}</strong>, Employee No. <strong>{{employee_id}}</strong>, has been employed by <strong>{{company_name_en}}</strong> as <strong>{{job_title_en}}</strong> in the <strong>{{department_en}}</strong> department since <strong>{{joining_date}}</strong>, and remains in the company's service as of the date of this certificate.</p>$html$;
  v_close_ar text := $html$<p>وتفضلوا بقبول فائق الاحترام والتقدير،،،</p>$html$;
  v_close_en text := $html$<p>Yours faithfully,</p>$html$;
  v_no_liability_ar text := $html$<p>وقد أُعطيت هذه الشهادة بناءً على طلبه/طلبها دون أدنى مسؤولية على الشركة تجاه الغير.</p>$html$;
  v_no_liability_en text := $html$<p>This certificate has been issued at the employee's request without any liability on the part of the company towards third parties.</p>$html$;
begin
  insert into public.certificate_templates (key, certificate_type, variant, name_ar, name_en, language, content_ar, content_en,
                                            header_html, footer_html, show_logo, show_stamp, show_signature, show_qr,
                                            is_active, is_default, current_version, published_at)
  values
    ('salary_general', 'salary', 'general', 'تعريف بالراتب – عام', 'Salary Certificate – General', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">تعريف بالراتب</h2>$html$ || v_to_ar ||
       $html$<p>السلام عليكم ورحمة الله وبركاته، وبعد،</p>$html$ || v_employed_ar || v_salary_ar || v_no_liability_ar || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Salary Certificate</h2>$html$ || v_to_en ||
       $html$<p>Dear Sir / Madam,</p>$html$ || v_employed_en || v_salary_en || v_no_liability_en || v_close_en,
     v_header, v_footer, true, true, true, true, true, true, 1, now()),

    ('salary_bank', 'salary', 'bank', 'تعريف بالراتب – للبنك', 'Salary Certificate – Bank', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">تعريف بالراتب</h2>$html$ || v_to_ar ||
       $html$<p>السلام عليكم ورحمة الله وبركاته، وبعد،</p>$html$ || v_employed_ar || v_salary_ar ||
       $html$<p>وقد صدر هذا التعريف بناءً على طلبه/طلبها لتقديمه إلى البنك المذكور أعلاه، دون أن يترتب على الشركة أي التزام مالي أو كفالة تجاه البنك أو الغير.</p>$html$ || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Salary Certificate</h2>$html$ || v_to_en ||
       $html$<p>Dear Sir / Madam,</p>$html$ || v_employed_en || v_salary_en ||
       $html$<p>This certificate has been issued at the employee's request for submission to the above-mentioned bank, and does not constitute any financial obligation or guarantee on the part of the company towards the bank or any third party.</p>$html$ || v_close_en,
     v_header, v_footer, true, true, true, true, true, false, 1, now()),

    ('salary_embassy', 'salary', 'embassy', 'تعريف بالراتب – للسفارة', 'Salary Certificate – Embassy', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">تعريف بالراتب</h2>$html$ || v_to_ar ||
       $html$<p>تحية طيبة وبعد،</p>$html$ || v_employed_ar || v_salary_ar ||
       $html$<p>ولا مانع لدى الشركة من سفره/سفرها خلال إجازته/إجازتها المعتمدة، على أن يعود/تعود لمباشرة العمل فور انتهائها.</p>$html$ ||
       v_no_liability_ar || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Salary Certificate</h2>$html$ || v_to_en ||
       $html$<p>Dear Sir / Madam,</p>$html$ || v_employed_en || v_salary_en ||
       $html$<p>The company has no objection to the employee travelling during the approved leave period, provided that the employee resumes duty upon its expiry.</p>$html$ ||
       v_no_liability_en || v_close_en,
     v_header, v_footer, true, true, true, true, true, false, 1, now()),

    ('employment', 'employment', 'general', 'شهادة تعريف بالعمل', 'Employment Certificate', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">شهادة تعريف بالعمل</h2>$html$ || v_to_ar ||
       $html$<p>السلام عليكم ورحمة الله وبركاته، وبعد،</p>$html$ || v_employed_ar || v_no_liability_ar || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Employment Certificate</h2>$html$ || v_to_en ||
       $html$<p>Dear Sir / Madam,</p>$html$ || v_employed_en || v_no_liability_en || v_close_en,
     v_header, v_footer, true, true, true, true, true, true, 1, now()),

    ('salary_employment', 'salary_employment', 'general', 'تعريف بالعمل والراتب', 'Salary & Employment Certificate', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">تعريف بالعمل والراتب</h2>$html$ || v_to_ar ||
       $html$<p>السلام عليكم ورحمة الله وبركاته، وبعد،</p>$html$ || v_employed_ar || v_salary_ar || v_no_liability_ar || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Salary &amp; Employment Certificate</h2>$html$ || v_to_en ||
       $html$<p>Dear Sir / Madam,</p>$html$ || v_employed_en || v_salary_en || v_no_liability_en || v_close_en,
     v_header, v_footer, true, true, true, true, true, true, 1, now()),

    ('experience', 'experience', 'general', 'شهادة خبرة', 'Experience Certificate', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">شهادة خبرة</h2>$html$ || v_to_ar ||
       $html$<p>تشهد <strong>{{company_name_ar}}</strong> بأن السيد/السيدة <strong>{{employee_name_ar}}</strong>، الرقم الوظيفي (<strong>{{employee_id}}</strong>)، قد عمل/عملت لديها بوظيفة <strong>{{job_title_ar}}</strong> في <strong>{{department_ar}}</strong> اعتبارًا من تاريخ <strong>{{joining_date}}</strong>.</p><p>وقد عُرف عنه/عنها خلال فترة عمله/عملها حسن السيرة والسلوك، والتفاني والأمانة في أداء المهام الموكلة إليه/إليها.</p><p>وقد أُعطيت هذه الشهادة بناءً على طلبه/طلبها دون أدنى مسؤولية على الشركة، مع تمنياتنا له/لها بالتوفيق.</p>$html$ || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Experience Certificate</h2>$html$ || v_to_en ||
       $html$<p>This is to certify that <strong>{{employee_name_en}}</strong>, Employee No. <strong>{{employee_id}}</strong>, has worked with <strong>{{company_name_en}}</strong> as <strong>{{job_title_en}}</strong> in the <strong>{{department_en}}</strong> department with effect from <strong>{{joining_date}}</strong>.</p><p>Throughout the period of employment, the employee demonstrated good conduct, integrity and dedication in carrying out the duties assigned.</p><p>This certificate is issued at the employee's request without any liability on the part of the company. We wish the employee every success.</p>$html$ || v_close_en,
     v_header, v_footer, true, true, true, true, true, true, 1, now()),

    ('custom_letter', 'custom', 'general', 'خطاب موارد بشرية مخصص', 'Custom HR Letter', 'bilingual',
     v_meta_ar || $html$<h2 style="text-align:center">خطاب رسمي</h2>$html$ || v_to_ar ||
       $html$<p>السلام عليكم ورحمة الله وبركاته، وبعد،</p><p>تفيد <strong>{{company_name_ar}}</strong> بأن السيد/السيدة <strong>{{employee_name_ar}}</strong>، الرقم الوظيفي (<strong>{{employee_id}}</strong>)، من منسوبي الشركة ويشغل/تشغل وظيفة <strong>{{job_title_ar}}</strong> في <strong>{{department_ar}}</strong> منذ تاريخ <strong>{{joining_date}}</strong>.</p>$html$ ||
       v_salary_ar || $html$<p>وقد صدر هذا الخطاب بناءً على طلب الموظف/الموظفة للغرض الموضح أعلاه، دون أدنى مسؤولية على الشركة تجاه الغير.</p>$html$ || v_close_ar,
     v_meta_en || $html$<h2 style="text-align:center">Official Letter</h2>$html$ || v_to_en ||
       $html$<p>Dear Sir / Madam,</p><p><strong>{{company_name_en}}</strong> hereby confirms that <strong>{{employee_name_en}}</strong>, Employee No. <strong>{{employee_id}}</strong>, is a member of the company's staff, holding the position of <strong>{{job_title_en}}</strong> in the <strong>{{department_en}}</strong> department since <strong>{{joining_date}}</strong>.</p>$html$ ||
       v_salary_en || $html$<p>This letter has been issued at the employee's request for the purpose stated above, without any liability on the part of the company towards third parties.</p>$html$ || v_close_en,
     v_header, v_footer, true, true, true, true, true, true, 1, now())
  on conflict (key) do nothing;

  -- version 1 snapshot for every template that has no history yet
  insert into public.certificate_template_versions (template_id, version, snapshot, change_notes)
  select t.id, 1,
         to_jsonb(t) - array['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'current_version', 'published_at'],
         'Initial version'
  from public.certificate_templates t
  where not exists (select 1 from public.certificate_template_versions v where v.template_id = t.id)
  on conflict (template_id, version) do nothing;
end;
$$;
