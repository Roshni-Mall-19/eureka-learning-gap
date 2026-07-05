-- ============================================================
-- FINAL bulletproof RLS fix. Run this WHOLE block.
-- Dynamically drops every existing policy on these 3 tables (no matter what
-- it's named, from any previous attempt), then creates a clean, correct set.
-- ============================================================

-- Drop every policy that currently exists on these tables, whatever it's called
do $$
declare pol record;
begin
  for pol in select policyname, tablename from pg_policies where tablename in ('students','questions','responses')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table students enable row level security;
alter table questions enable row level security;
alter table responses enable row level security;

-- One policy per action, covering BOTH anon and authenticated in a single rule (simpler, no gaps)
create policy "insert_students" on students for insert to anon, authenticated with check (true);
create policy "read_students" on students for select to authenticated using (true);
create policy "update_students" on students for update to authenticated using (true);
create policy "delete_students" on students for delete to authenticated using (true);

create policy "read_questions" on questions for select to anon, authenticated using (true);
create policy "write_questions" on questions for insert to authenticated with check (true);
create policy "update_questions" on questions for update to authenticated using (true);
create policy "delete_questions" on questions for delete to authenticated using (true);

create policy "insert_responses" on responses for insert to anon, authenticated with check (true);
create policy "read_responses" on responses for select to authenticated using (true);

-- Also make sure the base SQL grants exist (belt and suspenders — RLS alone isn't enough
-- if the underlying GRANT is missing)
grant select, insert on students to anon, authenticated;
grant update, delete on students to authenticated;
grant select on questions to anon, authenticated;
grant insert, update, delete on questions to authenticated;
grant select, insert on responses to anon, authenticated;
grant select, update, delete on responses to authenticated;

-- Verify
select tablename, policyname, roles, cmd from pg_policies where tablename in ('students','responses','questions') order by tablename, cmd;
