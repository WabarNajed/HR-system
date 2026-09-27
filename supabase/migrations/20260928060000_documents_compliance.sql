-- =====================================================================================================
-- M6 — Documents & compliance
--
--   * employee_documents: review columns (review_note, reviewed_by, reviewed_at) + a guard so direct
--     Data API writes by non-HR callers can never stamp a review.
--   * Read models (views, all `security_invoker` → the RLS of the base tables applies to the caller):
--       public.employee_document_list   documents + employee + uploader/reviewer names (Document Center)
--       public.expiry_items             unified expiry monitor: employees' Iqama/passport/contract,
--                                       employee_insurance, dependents' Iqama/passport, employee_documents
--       public.employee_document_gaps   active employees missing required document types
--   * Expiry alerts: expiry_alert_runs + expiry_alert_log (HR read-only) and public.run_expiry_alerts(),
--     idempotent per item + expiry date + threshold. generate_expiry_alerts() now delegates to it.
--   * public.review_employee_document(): approve / reject an employee self-upload.
-- Idempotent (create or replace / if not exists / drop … if exists).
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- employee_documents: review columns
-- ---------------------------------------------------------------------------------------------------
alter table public.employee_documents
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

comment on column public.employee_documents.review_note is 'HR note on approval, or the rejection reason shown to the employee.';

create index if not exists employee_documents_reviewed_by_idx on public.employee_documents (reviewed_by);
create index if not exists employee_documents_status_idx on public.employee_documents (status);
create index if not exists employee_documents_created_at_idx on public.employee_documents (created_at desc);

-- Direct Data API writes (current_user = authenticated): callers without org documents.edit cannot set
-- review fields on insert; HR edits always stamp themselves as reviewer. The review RPC (security definer)
-- runs as the table owner and skips this guard.
create or replace function private.employee_documents_review_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if not private.has_org_permission('documents', 'edit') then
        new.review_note := null;
        new.reviewed_by := null;
        new.reviewed_at := null;
      elsif new.reviewed_by is not null then
        new.reviewed_by := auth.uid();
        new.reviewed_at := coalesce(new.reviewed_at, now());
      end if;
    elsif new.reviewed_by is distinct from old.reviewed_by then
      new.reviewed_by := case when new.reviewed_by is null then null else auth.uid() end;
      new.reviewed_at := case when new.reviewed_by is null then null else now() end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists employee_documents_review_guard on public.employee_documents;
create trigger employee_documents_review_guard
  before insert or update on public.employee_documents
  for each row execute function private.employee_documents_review_guard();

-- ---------------------------------------------------------------------------------------------------
-- Nationality helper: true for Saudi nationals, false for others, null when unknown.
-- Values are free text from imports ("Saudi", "سعودي", "Non-Saudi", "غير سعودي", "KSA", …).
-- ---------------------------------------------------------------------------------------------------
create or replace function private.is_saudi_nationality(p_nationality text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_nationality is null or btrim(p_nationality) = '' then null
    when lower(p_nationality) ~ 'non[^a-z]*saudi' or p_nationality ~ 'غير[[:space:]]*(ال)?سعود' then false
    when lower(btrim(p_nationality)) ~ '(saudi|^ksa$|^sa$|^sau$)' or p_nationality ~ 'سعود' then true
    else false
  end
$$;

-- ---------------------------------------------------------------------------------------------------
-- Document Center list
-- ---------------------------------------------------------------------------------------------------
create or replace view public.employee_document_list
with (security_invoker = true) as
select
  d.id,
  d.employee_id,
  d.document_type,
  d.document_number,
  d.issue_date,
  d.expiry_date,
  d.status,
  d.storage_path,
  d.file_name,
  d.file_size,
  d.mime_type,
  d.notes,
  d.is_confidential,
  d.uploaded_by,
  d.created_at,
  d.updated_at,
  d.review_note,
  d.reviewed_by,
  d.reviewed_at,
  e.employee_number,
  e.name_ar as employee_name_ar,
  e.name_en as employee_name_en,
  e.department_id,
  dep.name_ar as department_name_ar,
  dep.name_en as department_name_en,
  e.employment_status,
  e.avatar_path as employee_avatar_path,
  e.archived_at as employee_archived_at,
  up.full_name as uploaded_by_name,
  (up.employee_id is not null and up.employee_id = d.employee_id) as self_uploaded,
  rv.full_name as reviewed_by_name,
  lower(concat_ws(' ', e.search_text, d.document_number, d.file_name)) as search_text
from public.employee_documents d
join public.employees e on e.id = d.employee_id
left join public.departments dep on dep.id = e.department_id
left join public.profiles up on up.id = d.uploaded_by
left join public.profiles rv on rv.id = d.reviewed_by;

comment on view public.employee_document_list is
  'Document Center rows (security invoker: employee_documents RLS applies — owners see own non-confidential/own uploads, HR per documents.view).';

-- ---------------------------------------------------------------------------------------------------
-- Expiry items. The base view (schema private, not exposed) has no caller filter so the alert job can
-- read it as the owner; the public view adds the caller filter (HR documents.view, or own rows).
-- Uploaded Iqama/National ID/passport/contract documents whose expiry equals the employee record's date
-- are skipped (the record already tracks them).
-- ---------------------------------------------------------------------------------------------------
create or replace view private.expiry_items_base
with (security_invoker = true) as
with emp as (
  select e.id, e.iqama_expiry_date, e.passport_expiry_date, e.contract_end_date
  from public.employees e
  where e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
)
select 'employee_iqama:' || e.id::text as item_key, 'iqama'::text as kind, 'employee'::text as subject,
       'employees'::text as source_table, e.id as entity_id, e.id as employee_id, null::uuid as dependent_id,
       null::text as document_type, null::text as reference, false as is_confidential,
       e.iqama_expiry_date as expiry_date
  from emp e where e.iqama_expiry_date is not null
union all
select 'employee_passport:' || e.id::text, 'passport', 'employee', 'employees', e.id, e.id, null::uuid,
       null::text, null::text, false, e.passport_expiry_date
  from emp e where e.passport_expiry_date is not null
union all
select 'employee_contract:' || e.id::text, 'contract', 'employee', 'employees', e.id, e.id, null::uuid,
       null::text, null::text, false, e.contract_end_date
  from emp e where e.contract_end_date is not null
union all
select 'insurance:' || i.id::text, 'insurance', case when i.dependent_id is null then 'employee' else 'dependent' end,
       'employee_insurance', i.id, i.employee_id, i.dependent_id, null::text,
       coalesce(nullif(btrim(i.member_number), ''), i.policy_number), false, i.expiry_date
  from public.employee_insurance i join emp e on e.id = i.employee_id
  where i.expiry_date is not null and i.status in ('active', 'pending', 'expired')
union all
select 'dependent_iqama:' || dp.id::text, 'iqama', 'dependent', 'employee_dependents', dp.id, dp.employee_id, dp.id,
       null::text, null::text, false, dp.iqama_expiry_date
  from public.employee_dependents dp join emp e on e.id = dp.employee_id
  where dp.iqama_expiry_date is not null
union all
select 'dependent_passport:' || dp.id::text, 'passport', 'dependent', 'employee_dependents', dp.id, dp.employee_id, dp.id,
       null::text, null::text, false, dp.passport_expiry_date
  from public.employee_dependents dp join emp e on e.id = dp.employee_id
  where dp.passport_expiry_date is not null
union all
select 'document:' || d.id::text, 'document', 'employee', 'employee_documents', d.id, d.employee_id, null::uuid,
       d.document_type, d.document_number, d.is_confidential, d.expiry_date
  from public.employee_documents d join emp e on e.id = d.employee_id
  where d.expiry_date is not null
    and d.status in ('valid', 'expired')
    and not (d.document_type in ('iqama', 'national_id') and d.expiry_date is not distinct from e.iqama_expiry_date)
    and not (d.document_type = 'passport' and d.expiry_date is not distinct from e.passport_expiry_date)
    and not (d.document_type = 'employment_contract' and d.expiry_date is not distinct from e.contract_end_date);

create or replace view public.expiry_items
with (security_invoker = true) as
select
  b.item_key,
  b.kind,
  b.subject,
  b.source_table,
  b.entity_id,
  b.employee_id,
  b.dependent_id,
  b.document_type,
  b.reference,
  b.is_confidential,
  b.expiry_date,
  e.employee_number,
  e.name_ar as employee_name_ar,
  e.name_en as employee_name_en,
  e.id_type,
  e.department_id,
  dep.name_ar as department_name_ar,
  dep.name_en as department_name_en,
  e.avatar_path as employee_avatar_path,
  dp.name_ar as dependent_name_ar,
  dp.name_en as dependent_name_en,
  dp.relationship as dependent_relationship,
  lower(concat_ws(' ', e.search_text, dp.name_ar, dp.name_en, b.reference)) as search_text
from private.expiry_items_base b
join public.employees e on e.id = b.employee_id
left join public.departments dep on dep.id = e.department_id
left join public.employee_dependents dp on dp.id = b.dependent_id
where (select private.has_org_permission('documents', 'view'))
   or b.employee_id = (select private.current_employee_id());

comment on view public.expiry_items is
  'Unified expiry monitor (security invoker). HR with documents.view sees everything the base-table RLS allows; everyone else only their own items.';

-- ---------------------------------------------------------------------------------------------------
-- Missing required documents (HR only). Rule per active employee:
--   * ID document: iqama when id_type = iqama (or, without id_type, a non-Saudi nationality); otherwise national_id
--   * passport: non-Saudi employees
--   * employment_contract: everyone
-- A type counts as present with a valid, expired or pending-review document.
-- ---------------------------------------------------------------------------------------------------
create or replace view public.employee_document_gaps
with (security_invoker = true) as
with emp as (
  select e.id, e.employee_number, e.name_ar, e.name_en, e.department_id, e.id_type, e.nationality,
         e.avatar_path, e.search_text, e.joining_date, e.employment_status,
         case when e.id_type = 'iqama' then false
              when e.id_type = 'national_id' then true
              else private.is_saudi_nationality(e.nationality) end as is_saudi
  from public.employees e
  where e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
),
req as (
  select emp.*,
         array_remove(array[
           case when emp.is_saudi is false then 'iqama' else 'national_id' end,
           case when emp.is_saudi is false then 'passport' end,
           'employment_contract'
         ], null) as required_types
  from emp
),
have as (
  select d.employee_id,
         array_agg(distinct d.document_type) filter (where d.status in ('valid', 'expired')) as present_types,
         array_agg(distinct d.document_type) filter (where d.status = 'pending_review') as pending_types
  from public.employee_documents d
  where d.status in ('valid', 'expired', 'pending_review')
  group by d.employee_id
),
gaps as (
  select r.*,
         array(select t from unnest(r.required_types) t
               where not (t = any (coalesce(h.present_types, '{}'::text[]) || coalesce(h.pending_types, '{}'::text[])))) as missing_types,
         array(select t from unnest(r.required_types) t
               where t = any (coalesce(h.pending_types, '{}'::text[]))
                 and not (t = any (coalesce(h.present_types, '{}'::text[])))) as awaiting_review_types
  from req r
  left join have h on h.employee_id = r.id
)
select
  g.id as employee_id,
  g.employee_number,
  g.name_ar as employee_name_ar,
  g.name_en as employee_name_en,
  g.department_id,
  dep.name_ar as department_name_ar,
  dep.name_en as department_name_en,
  g.id_type,
  g.nationality,
  g.is_saudi,
  g.joining_date,
  g.employment_status,
  g.avatar_path as employee_avatar_path,
  g.required_types,
  g.missing_types,
  cardinality(g.missing_types) as missing_count,
  g.awaiting_review_types,
  g.search_text
from gaps g
left join public.departments dep on dep.id = g.department_id
where cardinality(g.missing_types) > 0
  and (select private.has_org_permission('documents', 'view'));

comment on view public.employee_document_gaps is
  'Active employees missing required document types (HR documents.view only; security invoker).';

revoke all on public.employee_document_list, public.expiry_items, public.employee_document_gaps from anon;
grant select on public.employee_document_list, public.expiry_items, public.employee_document_gaps to authenticated;
revoke all on private.expiry_items_base from anon, public;
grant select on private.expiry_items_base to authenticated;
revoke execute on function private.is_saudi_nationality(text) from public, anon;
grant execute on function private.is_saudi_nationality(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- Expiry alert runs + per-item log (idempotency: one alert per item, expiry date and threshold)
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.expiry_alert_runs (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null check (source in ('cron', 'manual')),
  run_date               date not null,
  items_alerted          int not null default 0,
  notifications_created  int not null default 0,
  documents_expired      int not null default 0,
  triggered_by           uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now()
);
comment on table public.expiry_alert_runs is 'One row per expiry-alert run (daily cron or HR "run now"). Written only by run_expiry_alerts().';

create table if not exists public.expiry_alert_log (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid references public.expiry_alert_runs (id) on delete set null,
  item_key          text not null,
  kind              text not null check (kind in ('iqama', 'passport', 'contract', 'insurance', 'document')),
  subject           text not null check (subject in ('employee', 'dependent')),
  source_table      text not null,
  entity_id         uuid not null,
  employee_id       uuid not null references public.employees (id) on delete cascade,
  expiry_date       date not null,
  threshold_days    int not null check (threshold_days >= 0),
  days_left         int not null,
  recipients        int not null default 0,
  notification_ids  uuid[] not null default '{}',
  created_at        timestamptz not null default now(),
  constraint expiry_alert_log_item_threshold_key unique (item_key, expiry_date, threshold_days)
);
comment on table public.expiry_alert_log is 'Alerts already sent per item + expiry date + threshold (idempotency of run_expiry_alerts()).';

create index if not exists expiry_alert_runs_triggered_by_idx on public.expiry_alert_runs (triggered_by);
create index if not exists expiry_alert_runs_created_at_idx on public.expiry_alert_runs (created_at desc);
create index if not exists expiry_alert_log_run_id_idx on public.expiry_alert_log (run_id);
create index if not exists expiry_alert_log_employee_id_idx on public.expiry_alert_log (employee_id);
create index if not exists expiry_alert_log_created_at_idx on public.expiry_alert_log (created_at desc);

alter table public.expiry_alert_runs enable row level security;
alter table public.expiry_alert_log enable row level security;
revoke all on public.expiry_alert_runs, public.expiry_alert_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.expiry_alert_runs, public.expiry_alert_log from authenticated;
grant select on public.expiry_alert_runs, public.expiry_alert_log to authenticated;

drop policy if exists expiry_alert_runs_select on public.expiry_alert_runs;
create policy expiry_alert_runs_select on public.expiry_alert_runs for select to authenticated
  using ((select private.has_org_permission('documents', 'view')));
drop policy if exists expiry_alert_log_select on public.expiry_alert_log;
create policy expiry_alert_log_select on public.expiry_alert_log for select to authenticated
  using ((select private.has_org_permission('documents', 'view')));

-- ---------------------------------------------------------------------------------------------------
-- Review of employee self-uploads
-- ---------------------------------------------------------------------------------------------------
create or replace function public.review_employee_document(p_document_id uuid, p_decision text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc    public.employee_documents;
  v_note   text := private.nullif_blank(p_note);
  v_status text;
begin
  if not (private.has_org_permission('documents', 'approve') or private.has_org_permission('documents', 'edit')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'hr:errors.validation' using errcode = 'P0001', detail = 'decision';
  end if;
  select * into v_doc from public.employee_documents where id = p_document_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'pending_review' then
    raise exception 'hr:errors.invalidTransition' using errcode = 'P0001';
  end if;
  -- nobody reviews their own upload (super admins excepted, as for requests)
  if v_doc.employee_id = private.current_employee_id() and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'hr:errors.reasonRequired' using errcode = 'P0001', detail = 'note';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'hr:errors.validation' using errcode = 'P0001', detail = 'note';
  end if;

  v_status := case
    when p_decision = 'reject' then 'rejected'
    when v_doc.expiry_date is not null and v_doc.expiry_date < private.org_today() then 'expired'
    else 'valid'
  end;
  update public.employee_documents
     set status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_document_id;
  return v_status;
end;
$$;

comment on function public.review_employee_document(uuid, text, text) is
  'Approve (→ valid, or expired when past its expiry date) or reject (reason required) a pending_review employee document. Org documents.approve or documents.edit.';

-- ---------------------------------------------------------------------------------------------------
-- Expiry alerts. For each item expiring within max(expiry_alert_days) days, the tightest threshold it has
-- reached (thresholds = organization_settings.expiry_alert_days ∪ {0}) is alerted once:
--   * HR: users with org employees.view (Iqama, passport, contract, insurance) or documents.view (documents)
--   * the employee: own Iqama, passport, insurance, dependents and non-confidential documents (not contracts)
-- Missed days catch up (an item first seen at 20 days left gets its 30-day alert). Valid documents past
-- their expiry date are flipped to `expired`. Returns
--   {run_id, items, notifications, documents_expired, notification_ids[]}
-- Callers: service role (cron), super admin, or org documents.edit ("Run expiry check now").
-- ---------------------------------------------------------------------------------------------------
create or replace function public.run_expiry_alerts(p_source text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service   boolean := coalesce(auth.role(), '') = 'service_role';
  v_source    text;
  v_today     date := private.org_today();
  v_days      int[];
  v_max       int;
  v_hr_emp    uuid[];
  v_hr_docs   uuid[];
  v_run_id    uuid;
  v_item      record;
  v_left      int;
  v_threshold int;
  v_log_id    uuid;
  v_to        uuid[];
  v_uid       uuid;
  v_nid       uuid;
  v_ids       uuid[];
  v_all_ids   uuid[] := '{}';
  v_items     int := 0;
  v_expired   int := 0;
  v_params    jsonb;
  v_emp_prof  uuid;
  v_hr_link   text;
  v_entity    text;
begin
  if not v_service and not private.is_super_admin() and not private.has_org_permission('documents', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  v_source := case when v_service and coalesce(p_source, 'cron') <> 'manual' then 'cron' else 'manual' end;

  select array(select distinct x from unnest(coalesce(s.expiry_alert_days, '{90,60,30,14,7}'::int[]) || 0) as x
               where x is not null and x >= 0 order by x)
    into v_days
  from public.organization_settings s
  limit 1;
  v_days := coalesce(v_days, '{0,7,14,30,60,90}'::int[]);
  v_max := (select max(x) from unnest(v_days) as x);

  -- keep document statuses in step with the calendar
  with upd as (
    update public.employee_documents d set status = 'expired'
     where d.status = 'valid' and d.expiry_date is not null and d.expiry_date < v_today
    returning 1
  )
  select count(*) into v_expired from upd;

  v_hr_emp := array(select private.users_with_org_permission('employees', 'view'));
  v_hr_docs := array(select private.users_with_org_permission('documents', 'view'));

  insert into public.expiry_alert_runs (source, run_date, triggered_by)
  values (v_source, v_today, auth.uid())
  returning id into v_run_id;

  for v_item in
    select b.*, (b.expiry_date - v_today)::int as days_left, e.employee_number, e.name_ar, e.name_en, e.id_type,
           dp.name_ar as dep_name_ar, dp.name_en as dep_name_en
    from private.expiry_items_base b
    join public.employees e on e.id = b.employee_id
    left join public.employee_dependents dp on dp.id = b.dependent_id
    where b.expiry_date - v_today between 0 and v_max
    order by b.expiry_date, b.item_key
  loop
    v_left := v_item.days_left;
    select min(x) into v_threshold from unnest(v_days) as x where x >= v_left;
    continue when v_threshold is null;

    v_log_id := null;
    insert into public.expiry_alert_log (run_id, item_key, kind, subject, source_table, entity_id, employee_id,
                                         expiry_date, threshold_days, days_left)
    values (v_run_id, v_item.item_key, v_item.kind, v_item.subject, v_item.source_table, v_item.entity_id,
            v_item.employee_id, v_item.expiry_date, v_threshold, v_left)
    on conflict (item_key, expiry_date, threshold_days) do nothing
    returning id into v_log_id;
    continue when v_log_id is null;
    v_items := v_items + 1;

    v_params := jsonb_build_object(
      'kind', v_item.kind,
      'subject', v_item.subject,
      'expiry_date', v_item.expiry_date,
      'days_left', v_left,
      'threshold', v_threshold,
      'document_type', v_item.document_type,
      'id_type', v_item.id_type,
      'employee_id', v_item.employee_id,
      'employee_number', v_item.employee_number,
      'employee_name_ar', case when v_item.subject = 'dependent' and v_item.dependent_id is not null
                               then concat_ws(' — ', coalesce(nullif(v_item.dep_name_ar, ''), v_item.dep_name_en),
                                              coalesce(nullif(v_item.name_ar, ''), v_item.name_en))
                               else v_item.name_ar end,
      'employee_name_en', case when v_item.subject = 'dependent' and v_item.dependent_id is not null
                               then concat_ws(' — ', coalesce(nullif(v_item.dep_name_en, ''), v_item.dep_name_ar),
                                              coalesce(nullif(v_item.name_en, ''), v_item.name_ar))
                               else v_item.name_en end,
      'dependent_name_ar', v_item.dep_name_ar,
      'dependent_name_en', v_item.dep_name_en
    );
    v_entity := case v_item.source_table
                  when 'employee_documents' then 'employee_document'
                  when 'employee_insurance' then 'employee_insurance'
                  when 'employee_dependents' then 'employee_dependent'
                  else 'employee' end;
    v_hr_link := '/employees/' || v_item.employee_id::text
                 || case when v_item.kind = 'document' then '?tab=documents' else '' end;
    v_to := case when v_item.kind = 'document' then v_hr_docs else v_hr_emp end;
    v_ids := '{}';

    for v_uid in select distinct u from unnest(v_to) as u where u is not null loop
      v_nid := private.notify(v_uid, 'expiry_alert', v_params, v_hr_link, v_entity, v_item.entity_id, true);
      if v_nid is not null then
        v_ids := v_ids || v_nid;
      end if;
    end loop;

    v_emp_prof := private.employee_profile_id(v_item.employee_id);
    if v_emp_prof is not null and not (v_emp_prof = any (v_to))
       and v_item.kind <> 'contract' and not v_item.is_confidential then
      v_nid := private.notify(v_emp_prof, 'expiry_alert', v_params, '/documents', v_entity, v_item.entity_id, true);
      if v_nid is not null then
        v_ids := v_ids || v_nid;
      end if;
    end if;

    update public.expiry_alert_log set recipients = cardinality(v_ids), notification_ids = v_ids where id = v_log_id;
    v_all_ids := v_all_ids || v_ids;
  end loop;

  update public.expiry_alert_runs
     set items_alerted = v_items, notifications_created = cardinality(v_all_ids), documents_expired = v_expired
   where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'items', v_items,
    'notifications', cardinality(v_all_ids),
    'documents_expired', v_expired,
    'notification_ids', to_jsonb(v_all_ids)
  );
end;
$$;

comment on function public.run_expiry_alerts(text) is
  'Expiry alerts (idempotent per item + expiry date + threshold). Service role (cron), super admin or org documents.edit. Returns {run_id, items, notifications, documents_expired, notification_ids}.';

-- Legacy entry point (cron contract in docs/DATABASE.md §7): same engine, returns the notification count.
create or replace function public.generate_expiry_alerts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return coalesce((public.run_expiry_alerts('cron') ->> 'notifications')::int, 0);
end;
$$;

revoke execute on function public.review_employee_document(uuid, text, text) from public, anon;
grant execute on function public.review_employee_document(uuid, text, text) to authenticated;
revoke execute on function public.run_expiry_alerts(text) from public, anon;
grant execute on function public.run_expiry_alerts(text) to authenticated, service_role;
revoke execute on function public.generate_expiry_alerts() from public, anon;
grant execute on function public.generate_expiry_alerts() to authenticated, service_role;
revoke execute on function private.employee_documents_review_guard() from public, anon;
