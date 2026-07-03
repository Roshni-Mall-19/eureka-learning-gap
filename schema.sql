-- ============================================================
-- AI-Based Learning Gap Detection System — Supabase schema
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- Students who take the questionnaire
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age int,
  gender text,
  standard text not null,          -- '8', '9', '10'
  school_name text,
  area text,                        -- 'Rural' or 'Urban'
  language_used text default 'en',  -- which language the student took the test in
  collected_by text,                -- optional: volunteer/researcher name
  created_at timestamptz default now()
);

-- Question bank (source of truth — admin can add more anytime)
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  standard text not null,           -- '8', '9', '10'
  type text not null,               -- 'likert' | 'mcq_behaviour' | 'ai_readiness' | 'mcq' | 'mcq_multi' | 'text'
  subject text,                     -- 'Science' | 'Maths' | 'English' | 'Computer' (only for type='mcq'/'mcq_multi')
  concept text,                     -- e.g. 'Photosynthesis' (only meaningful for type='mcq'/'mcq_multi')
  chapter text,
  difficulty text,                  -- 'basic' | 'medium' | 'hard' (only for type='mcq'/'mcq_multi')
  question_en text not null,
  question_hi text,
  question_mr text,
  options jsonb,                    -- array of strings, e.g. ["Force","Pressure","Heat","Motion"]
  correct_answer text,              -- single-answer correct option, only for type='mcq'
  correct_answers jsonb,            -- array of correct options, only for type='mcq_multi'
  order_index int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- Every answer a student gives
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  question_id uuid references questions(id) on delete cascade,
  answer_value text,                -- likert: '1'-'5', mcq/behaviour: chosen option text, text: free text
  is_correct boolean,               -- only computed for type='mcq'
  created_at timestamptz default now()
);

-- Safe to re-run: adds new columns if you already ran an earlier version of this schema
alter table questions add column if not exists subject text;
alter table questions add column if not exists correct_answers jsonb;

create index if not exists idx_responses_student on responses(student_id);
create index if not exists idx_responses_question on responses(question_id);
create index if not exists idx_questions_standard on questions(standard);

-- ============================================================
-- Row Level Security
-- Hackathon-simple setup: anon key can insert students/responses (needed for
-- the student questionnaire, which has no login) and read/write questions
-- (needed for the admin dashboard, which also has no login in this v1).
-- NOTE: For a public production deployment, put the admin dashboard behind
-- Supabase Auth and restrict these policies to authenticated users only.
-- ============================================================

alter table students enable row level security;
alter table questions enable row level security;
alter table responses enable row level security;

create policy "anon can insert students" on students for insert to anon with check (true);
create policy "anon can read students" on students for select to anon using (true);

create policy "anon can read questions" on questions for select to anon using (true);
create policy "anon can insert questions" on questions for insert to anon with check (true);
create policy "anon can update questions" on questions for update to anon using (true);
create policy "anon can delete questions" on questions for delete to anon using (true);

create policy "anon can insert responses" on responses for insert to anon with check (true);
create policy "anon can read responses" on responses for select to anon using (true);

-- ============================================================
-- Enable Realtime (so the admin dashboard updates live as students submit)
-- Go to Supabase Dashboard -> Database -> Replication -> and toggle ON
-- realtime for tables: students, responses
-- (Or run the two lines below.)
-- ============================================================
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table responses;
alter publication supabase_realtime add table questions;
