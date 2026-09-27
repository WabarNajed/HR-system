-- Storage policies on storage.objects (path conventions from ARCHITECTURE.md §7)
\set ON_ERROR_STOP 1
begin;
\ir _helpers.sql

select pg_temp.standard_fixtures();

-- fixtures: documents, avatars, request attachments, certificates, branding
do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
  e2 uuid := pg_temp.id('e_emp2');
  d1 uuid := gen_random_uuid();
  d2 uuid := gen_random_uuid();
  d3 uuid := gen_random_uuid();
begin
  perform pg_temp.set_id('d1', d1);
  perform pg_temp.set_id('d2', d2);
  perform pg_temp.set_id('d3', d3);
  insert into public.employee_documents (id, employee_id, document_type, status, storage_path, file_name) values
    (d1, e1, 'iqama', 'valid', e1 || '/' || d1 || '/iqama.pdf', 'iqama.pdf'),
    (d2, e1, 'medical_report', 'valid', e1 || '/' || d2 || '/report.pdf', 'report.pdf'),
    (d3, e2, 'iqama', 'valid', e2 || '/' || d3 || '/iqama.pdf', 'iqama.pdf');
  insert into storage.objects (bucket_id, name) values
    ('employee-documents', e1 || '/' || d1 || '/iqama.pdf'),
    ('employee-documents', e1 || '/' || d2 || '/report.pdf'),
    ('employee-documents', e2 || '/' || d3 || '/iqama.pdf'),
    ('employee-documents', e1 || '/avatar/photo.png'),
    ('branding', 'logo/logo.png'),
    ('certificate-files', 'branding/stamp.png');

  insert into public.certificates (certificate_number, employee_id, certificate_type, language, status, storage_path) values
    ('CERT-TEST-000001', e1, 'salary', 'ar', 'valid', 'certificates/' || e1 || '/CERT-TEST-000001.pdf'),
    ('CERT-TEST-000002', e1, 'employment', 'en', 'revoked', 'certificates/' || e1 || '/CERT-TEST-000002.pdf');
  insert into storage.objects (bucket_id, name) values
    ('certificate-files', 'certificates/' || e1 || '/CERT-TEST-000001.pdf'),
    ('certificate-files', 'certificates/' || e1 || '/CERT-TEST-000002.pdf');

  perform pg_temp.as_user('emp1');
  perform pg_temp.set_id('r1', public.create_request_draft(pg_temp.request_type('attendance'),
    '{"attendance_date": "2026-10-01", "reason": "Badge"}', 'missing_check_in'));
  perform public.submit_request(pg_temp.id('r1'));
  perform pg_temp.set_id('r1_draft', public.create_request_draft(pg_temp.request_type('other'), '{"subject": "Draft"}', null));
  perform pg_temp.as_user('emp3');
  perform pg_temp.set_id('r3', public.create_request_draft(pg_temp.request_type('other'), '{"subject": "S", "details": "D"}', null));
  perform public.submit_request(pg_temp.id('r3'));
  perform pg_temp.as_postgres();
  insert into storage.objects (bucket_id, name) values
    ('request-attachments', 'requests/' || pg_temp.id('r1') || '/' || gen_random_uuid() || '-evidence.pdf'),
    ('request-attachments', 'requests/' || pg_temp.id('r3') || '/' || gen_random_uuid() || '-evidence.pdf');
end;
$$;

create or replace function pg_temp.objects(p_bucket text, p_like text) returns bigint language sql as $$
  select count(*) from storage.objects where bucket_id = p_bucket and name like p_like;
$$;

-- ---------------------------------------------------------------------------------------------------
do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
  e2 uuid := pg_temp.id('e_emp2');
  v_newdoc uuid := gen_random_uuid();
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('employee reads own employee-documents file', pg_temp.objects('employee-documents', e1 || '/' || pg_temp.id('d1') || '/%') = 1);
  perform pg_temp.check('employee cannot read own confidential (medical) file uploaded by HR',
    pg_temp.objects('employee-documents', e1 || '/' || pg_temp.id('d2') || '/%') = 0);
  perform pg_temp.check('employee cannot read another employee''s documents', pg_temp.objects('employee-documents', e2 || '/%') = 0);
  perform pg_temp.check('employee reads own avatar', pg_temp.objects('employee-documents', e1 || '/avatar/%') = 1);
  perform pg_temp.check('employee reads own request attachments', pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r1') || '/%') = 1);
  perform pg_temp.check('employee cannot read other employees'' request attachments',
    pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r3') || '/%') = 0);
  perform pg_temp.check('employee reads own valid certificate PDF only (revoked hidden)',
    pg_temp.objects('certificate-files', 'certificates/' || e1 || '/%') = 1);
  perform pg_temp.check('employee cannot read the company stamp', pg_temp.objects('certificate-files', 'branding/%') = 0);
  perform pg_temp.throws('employee cannot upload into another employee''s folder',
    format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', e2 || '/' || gen_random_uuid() || '/x.pdf'),
    'row-level security');
  perform pg_temp.throws('employee cannot upload without a pending_review document row',
    format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', e1 || '/' || gen_random_uuid() || '/x.pdf'),
    'row-level security');
  insert into public.employee_documents (id, employee_id, document_type, status, storage_path, file_name)
  values (v_newdoc, e1, 'educational_certificate', 'pending_review', e1 || '/' || v_newdoc || '/degree.pdf', 'degree.pdf');
  perform pg_temp.check('employee uploads own document after creating its pending_review row',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', e1 || '/' || v_newdoc || '/degree.pdf')) = 1);
  perform pg_temp.check('uploaded (own) document is readable by its uploader', pg_temp.objects('employee-documents', e1 || '/' || v_newdoc || '/%') = 1);
  perform pg_temp.check('requester can attach files to own draft',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''request-attachments'', %L)',
                            'requests/' || pg_temp.id('r1_draft') || '/' || gen_random_uuid() || '-a.pdf')) = 1);
  perform pg_temp.throws('requester cannot attach files once the request is pending',
    format('insert into storage.objects (bucket_id, name) values (''request-attachments'', %L)',
           'requests/' || pg_temp.id('r1') || '/' || gen_random_uuid() || '-late.pdf'), 'row-level security');
  perform pg_temp.throws('employee cannot upload branding', 'insert into storage.objects (bucket_id, name) values (''branding'', ''logo/evil.png'')',
    'row-level security');

  perform pg_temp.as_user('mgr');
  perform pg_temp.check('manager cannot read a direct report''s documents', pg_temp.objects('employee-documents', e1 || '/%/%.pdf') = 0);
  perform pg_temp.check('manager can read a direct report''s avatar', pg_temp.objects('employee-documents', e1 || '/avatar/%') = 1);
  perform pg_temp.check('manager (current approver) reads the request attachment', pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r1') || '/%') = 1);
  perform pg_temp.check('manager cannot read attachments of other teams'' requests', pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r3') || '/%') = 0);
  perform pg_temp.check('manager cannot read a report''s certificates', pg_temp.objects('certificate-files', 'certificates/%') = 0);
  perform pg_temp.check('manager cannot read another team''s avatars', pg_temp.objects('employee-documents', pg_temp.id('e_emp3') || '/%') = 0);

  perform pg_temp.as_user('emp2');
  perform pg_temp.check('peer employee cannot read the request attachment', pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r1') || '/%') = 0);

  perform pg_temp.as_user('hro');
  perform pg_temp.check('HR (documents.view) reads all employee documents incl. confidential',
    pg_temp.objects('employee-documents', '%.pdf') = 4);
  perform pg_temp.check('HR reads all submitted request attachments', pg_temp.objects('request-attachments', 'requests/%') = 2);
  perform pg_temp.check('HR (certificates.view) reads certificate PDFs and the stamp', pg_temp.objects('certificate-files', '%') = 3);
  perform pg_temp.check('HR (certificates.create) can store a certificate PDF',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''certificate-files'', %L)', 'certificates/' || e2 || '/CERT-TEST-000003.pdf')) = 1);
  perform pg_temp.throws('HR officer cannot upload the stamp (settings.edit required)',
    'insert into storage.objects (bucket_id, name) values (''certificate-files'', ''branding/stamp2.png'')', 'row-level security');
  perform pg_temp.throws('HR officer cannot upload branding (settings.administer required)',
    'insert into storage.objects (bucket_id, name) values (''branding'', ''logo/new.png'')', 'row-level security');

  perform pg_temp.as_user('sa');
  perform pg_temp.check('super admin can upload branding',
    pg_temp.affected('insert into storage.objects (bucket_id, name) values (''branding'', ''logo/new.png'')') = 1);

  perform pg_temp.as_anon();
  perform pg_temp.check('anon can read the public branding bucket', pg_temp.objects('branding', 'logo/%') = 2);
  perform pg_temp.check('anon cannot read private buckets',
    (select count(*) from storage.objects where bucket_id in ('employee-documents', 'request-attachments', 'certificate-files')) = 0);
  perform pg_temp.as_postgres();

  perform pg_temp.check('buckets: three private + public branding, 20 MiB limit on private buckets',
    (select count(*) from storage.buckets where id in ('employee-documents', 'request-attachments', 'certificate-files') and not public
       and file_size_limit = 20971520) = 3
    and (select public from storage.buckets where id = 'branding'));
end;
$$;

select pg_temp.finish('05_storage');
rollback;
