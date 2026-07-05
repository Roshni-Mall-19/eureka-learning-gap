-- ============================================================
-- Run this WHOLE block in Supabase SQL Editor to guarantee correct,
-- clean policies — safe to run even if some policies already exist
-- or are in a partial/broken state.
-- ============================================================

alter table students enable row level security;
alter table questions enable row level security;
alter table responses enable row level security;

-- Drop EVERY policy that might already exist under any of these names, from any previous run
drop policy if exists "anon can insert students" on students;
drop policy if exists "anon can read students" on students;
drop policy if exists "authenticated can insert students" on students;
drop policy if exists "authenticated can read students" on students;
drop policy if exists "authenticated can update students" on students;
drop policy if exists "authenticated can delete students" on students;

drop policy if exists "anon can read questions" on questions;
drop policy if exists "anon can insert questions" on questions;
drop policy if exists "anon can update questions" on questions;
drop policy if exists "anon can delete questions" on questions;
drop policy if exists "authenticated can read questions" on questions;
drop policy if exists "authenticated can insert questions" on questions;
drop policy if exists "authenticated can update questions" on questions;
drop policy if exists "authenticated can delete questions" on questions;

drop policy if exists "anon can insert responses" on responses;
drop policy if exists "anon can read responses" on responses;
drop policy if exists "authenticated can insert responses" on responses;
drop policy if exists "authenticated can read responses" on responses;

-- Recreate everything fresh
create policy "anon can insert students" on students for insert to anon with check (true);
create policy "authenticated can insert students" on students for insert to authenticated with check (true);
create policy "authenticated can read students" on students for select to authenticated using (true);
create policy "authenticated can update students" on students for update to authenticated using (true);
create policy "authenticated can delete students" on students for delete to authenticated using (true);

create policy "anon can read questions" on questions for select to anon using (true);
create policy "authenticated can read questions" on questions for select to authenticated using (true);
create policy "authenticated can insert questions" on questions for insert to authenticated with check (true);
create policy "authenticated can update questions" on questions for update to authenticated using (true);
create policy "authenticated can delete questions" on questions for delete to authenticated using (true);

create policy "anon can insert responses" on responses for insert to anon with check (true);
create policy "authenticated can insert responses" on responses for insert to authenticated with check (true);
create policy "authenticated can read responses" on responses for select to authenticated using (true);

-- Verify — this should list all policies with matching roles/commands after running the above
select tablename, policyname, roles, cmd from pg_policies where tablename in ('students','responses','questions') order by tablename, cmd;
