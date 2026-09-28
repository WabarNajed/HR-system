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
  -- counts are scoped to this file's fixtures (the bucket may already hold real files)
  perform pg_temp.check('HR (documents.view) reads all employee documents incl. confidential',
    pg_temp.objects('employee-documents', e1 || '/%.pdf') + pg_temp.objects('employee-documents', e2 || '/%.pdf') = 4);
  perform pg_temp.check('HR reads all submitted request attachments (not drafts)',
    pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r1') || '/%')
      + pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r3') || '/%') = 2
    and pg_temp.objects('request-attachments', 'requests/' || pg_temp.id('r1_draft') || '/%') = 0);
  perform pg_temp.check('HR (certificates.view) reads certificate PDFs and the stamp',
    pg_temp.objects('certificate-files', 'certificates/' || e1 || '/%') = 2
    and pg_temp.objects('certificate-files', 'branding/stamp.png') = 1);
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

-- ---------------------------------------------------------------------------------------------------
-- Immutable files: reviewed employee documents and issued certificates (20260928210701, 20260928221202)
-- An upsert is INSERT … ON CONFLICT DO UPDATE (storage-api upsertObject); a move is an UPDATE of name.
-- ---------------------------------------------------------------------------------------------------
create or replace function pg_temp.upsert_sql(p_bucket text, p_name text) returns text language sql as $$
  select format('insert into storage.objects (bucket_id, name, metadata) values (%L, %L, ''{"size": 2}'') '
                'on conflict (bucket_id, name collate "C") where archived_at is null '
                'do update set metadata = excluded.metadata', p_bucket, p_name);
$$;

create or replace function pg_temp.delete_sql(p_bucket text, p_name text) returns text language sql as $$
  select format('delete from storage.objects where bucket_id = %L and name = %L', p_bucket, p_name);
$$;

do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
  e2 uuid := pg_temp.id('e_emp2');
  d1_path text := e1 || '/' || pg_temp.id('d1') || '/iqama.pdf';
  d3_path text := e2 || '/' || pg_temp.id('d3') || '/iqama.pdf';
  v_pend uuid := gen_random_uuid();      -- emp1's own pending_review submission
  v_arch uuid := gen_random_uuid();      -- archived document of emp2
  v_new  uuid := gen_random_uuid();      -- HR-created (valid) document, file uploaded afterwards
  pend_path text;
  arch_path text;
  new_path text;
  repl_path text := e1 || '/' || pg_temp.id('d1') || '/k9x2-iqama-renewed.pdf';
  cert_issued text := 'certificates/' || e1 || '/CERT-TEST-000001.pdf';
  cert_revoked text := 'certificates/' || e1 || '/CERT-TEST-000002.pdf';
  cert_free text := 'certificates/' || e2 || '/CERT-TEST-000009.pdf';
  cert_new text := 'certificates/' || e2 || '/CERT-1999-990001.pdf';
  v_tpl uuid;
  v_cert uuid;
begin
  pend_path := e1 || '/' || v_pend || '/scan.pdf';
  arch_path := e2 || '/' || v_arch || '/old.pdf';
  new_path := e2 || '/' || v_new || '/contract.pdf';
  -- storage-api sets this for its own deletes; direct SQL deletes are refused without it
  perform set_config('storage.allow_delete_query', 'true', true);
  insert into public.employee_documents (id, employee_id, document_type, status, storage_path, file_name, uploaded_by) values
    (v_pend, e1, 'educational_certificate', 'pending_review', pend_path, 'scan.pdf', pg_temp.id('emp1')),
    (v_arch, e2, 'iqama', 'archived', arch_path, 'old.pdf', pg_temp.id('hro'));
  insert into storage.objects (bucket_id, name) values ('employee-documents', pend_path), ('employee-documents', arch_path);

  -- HR officer (documents.create + documents.edit, certificates.create) --------------------------
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('HR cannot overwrite (upsert) the file of a reviewed document',
    pg_temp.upsert_sql('employee-documents', d1_path), 'row-level security');
  perform pg_temp.check('HR cannot delete the file of a reviewed document',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', d1_path)) = 0);
  perform pg_temp.check('HR cannot move (rename) the file of a reviewed document',
    pg_temp.affected(format('update storage.objects set name = %L where bucket_id = ''employee-documents'' and name = %L',
                            e1 || '/' || pg_temp.id('d1') || '/moved.pdf', d1_path)) = 0);
  perform pg_temp.check('HR cannot delete the file of an archived document',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', arch_path)) = 0);
  perform pg_temp.throws('HR cannot overwrite an employee''s pending self-service upload',
    pg_temp.upsert_sql('employee-documents', pend_path), 'row-level security');
  perform pg_temp.check('HR cannot delete an employee''s pending self-service upload',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', pend_path)) = 0);
  perform pg_temp.throws('a plain insert over an existing document file is a duplicate, not an overwrite',
    format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', d1_path), 'duplicate key');

  -- replace flow: new path → row points at it → superseded file removed
  perform pg_temp.check('HR uploads a replacement file to a new path in the document folder',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', repl_path)) = 1);
  perform pg_temp.throws('HR cannot move an unreferenced file onto a reviewed document''s path',
    format('update storage.objects set name = %L where bucket_id = ''employee-documents'' and name = %L', d1_path, repl_path),
    'row-level security');
  perform pg_temp.check('an uncommitted replacement can be discarded (overwrite + delete)',
    pg_temp.affected(pg_temp.upsert_sql('employee-documents', repl_path)) = 1
    and pg_temp.affected(pg_temp.delete_sql('employee-documents', repl_path)) = 1);
  perform pg_temp.check('HR re-uploads the replacement',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', repl_path)) = 1);
  update public.employee_documents set storage_path = repl_path where id = pg_temp.id('d1');
  perform pg_temp.check('after the row points at the replacement, the superseded file can be removed',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', d1_path)) = 1);
  perform pg_temp.check('the committed replacement is immutable in turn',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', repl_path)) = 0);

  -- delete flow: row first, then the file
  delete from public.employee_documents where id = pg_temp.id('d3');
  perform pg_temp.check('HR deletes a document row, then its (now unreferenced) file',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', d3_path)) = 1);

  -- HR upload flow: the valid row exists first, then the first upload of its file
  insert into public.employee_documents (id, employee_id, document_type, status, storage_path, file_name, uploaded_by)
  values (v_new, e2, 'employment_contract', 'valid', new_path, 'contract.pdf', pg_temp.id('hro'));
  perform pg_temp.check('HR uploads the file of a document row it just created',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', new_path)) = 1);
  perform pg_temp.throws('…but cannot overwrite it afterwards',
    pg_temp.upsert_sql('employee-documents', new_path), 'row-level security');

  -- certificates: issued (valid / revoked) PDFs are immutable
  perform pg_temp.throws('HR cannot overwrite (upsert) an issued certificate PDF',
    pg_temp.upsert_sql('certificate-files', cert_issued), 'row-level security');
  perform pg_temp.check('HR cannot delete an issued certificate PDF',
    pg_temp.affected(pg_temp.delete_sql('certificate-files', cert_issued)) = 0);
  perform pg_temp.check('HR cannot move an issued certificate PDF',
    pg_temp.affected(format('update storage.objects set name = %L where bucket_id = ''certificate-files'' and name = %L',
                            'certificates/' || e1 || '/CERT-TEST-000099.pdf', cert_issued)) = 0);
  perform pg_temp.check('HR cannot delete a revoked certificate PDF',
    pg_temp.affected(pg_temp.delete_sql('certificate-files', cert_revoked)) = 0);
  perform pg_temp.check('HR uploads and deletes an unreferenced certificate PDF (failed-issue cleanup)',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''certificate-files'', %L)', cert_free)) = 1
    and pg_temp.affected(pg_temp.delete_sql('certificate-files', cert_free)) = 1);
  perform pg_temp.throws('certificate PDFs live only at certificates/<employee>/<file>',
    format('insert into storage.objects (bucket_id, name) values (''certificate-files'', %L)', 'certificates/' || e2 || '/x/y.pdf'),
    'row-level security');

  -- issue a certificate: its PDF becomes immutable and the audit row masks the verification code
  perform pg_temp.as_postgres();
  insert into public.certificate_templates (key, certificate_type, name_ar, name_en, language, is_active, current_version, published_version)
  values ('test_tpl_storage', 'salary', 'قالب اختبار', 'Test template', 'bilingual', true, 1, 1)
  returning id into v_tpl;
  perform pg_temp.as_user('hro');
  perform pg_temp.check('HR stores the rendered PDF before issuing',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''certificate-files'', %L)', cert_new)) = 1);
  v_cert := public.issue_certificate('CERT-1999-990001', null, e2, v_tpl, 1, 'ar', null, null, 'ABCDEFGHJKLM');
  perform pg_temp.throws('HR cannot overwrite the PDF of a certificate it just issued',
    pg_temp.upsert_sql('certificate-files', cert_new), 'row-level security');
  perform pg_temp.check('HR cannot delete the PDF of a certificate it just issued',
    pg_temp.affected(pg_temp.delete_sql('certificate-files', cert_new)) = 0);
  perform pg_temp.as_postgres();
  perform pg_temp.check('issued certificate keeps its verification code',
    (select c.verification_code from public.certificates c where c.id = v_cert) = 'ABCDEFGHJKLM');
  perform pg_temp.check('certificate.create audit row masks the verification code',
    (select a.changes -> 'verification_code' ->> 'new' from public.audit_logs a
      where a.action = 'certificate.create' and a.entity_id = v_cert::text) = '***'
    and not exists (select 1 from public.audit_logs a
                     where a.entity_id = v_cert::text and a.changes::text like '%ABCDEFGHJKLM%'));
  perform pg_temp.check('no audit row holds a clear-text verification code',
    not exists (select 1 from public.audit_logs a
                 where a.changes ? 'verification_code'
                   and (coalesce(a.changes -> 'verification_code' ->> 'new', '***') <> '***'
                        or coalesce(a.changes -> 'verification_code' ->> 'old', '***') <> '***')));

  -- the owner of a pending self-service submission --------------------------------------------
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('employee re-uploads (upsert) own pending submission',
    pg_temp.affected(pg_temp.upsert_sql('employee-documents', pend_path)) = 1);
  perform pg_temp.check('employee withdraws own pending file',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', pend_path)) = 1);
  perform pg_temp.check('employee re-uploads own pending file',
    pg_temp.affected(format('insert into storage.objects (bucket_id, name) values (''employee-documents'', %L)', pend_path)) = 1);
  perform pg_temp.as_postgres();
  update public.employee_documents set status = 'valid' where id = v_pend;   -- reviewed
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('employee cannot delete own file once it is reviewed',
    pg_temp.affected(pg_temp.delete_sql('employee-documents', pend_path)) = 0);
  perform pg_temp.throws('employee cannot overwrite own file once it is reviewed',
    pg_temp.upsert_sql('employee-documents', pend_path), 'row-level security');
  perform pg_temp.as_postgres();
end;
$$;

select pg_temp.finish('05_storage');
rollback;
