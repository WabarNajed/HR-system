-- =====================================================================================================
-- M7 Certificates — issued certificates are written ONLY through the security-definer RPCs.
--
-- Before: the generic RLS policies let any caller with certificates.create INSERT certificate rows and
-- UPDATE any column (addressed_to, purpose, storage_path, template, issue_date …) directly through the
-- Data API. That bypassed issue_certificate (numbering, stored-PDF check, request history) and allowed
-- silent tampering with issued, publicly verifiable records.
--
-- After:  INSERT → public.issue_certificate(...)   UPDATE → public.revoke_certificate(...)   DELETE → never
-- (both RPCs keep their explicit permission checks; audit + notification triggers still fire).
-- SELECT is unchanged. Idempotent.
-- =====================================================================================================

drop policy if exists certificates_insert on public.certificates;
drop policy if exists certificates_update on public.certificates;
drop policy if exists certificates_delete on public.certificates;

revoke insert, update, delete on public.certificates from anon, authenticated;
