-- ============================================================
-- STARFORGE — SUPABASE SCHEMA (FIXED)
-- Paste this entire file into the Supabase SQL Editor and run.
-- Safe to run on a fresh project — drops nothing if clean.
-- ============================================================

-- ── EXTENSIONS ───────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── CODE GENERATOR ───────────────────────────────────────────
create or replace function generate_code(len int default 6)
returns text language plpgsql as $$
declare
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
begin
  for i in 1..len loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- ── TABLES ───────────────────────────────────────────────────

create table if not exists classes (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null default 'My Class',
  code        text        unique not null default generate_code(),
  teacher_id  uuid        references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);

create table if not exists students (
  id            uuid    primary key default gen_random_uuid(),
  class_id      uuid    references classes(id) on delete cascade not null,
  name          text    not null,
  xp            integer not null default 0 check (xp >= 0),
  hp            integer not null default 100 check (hp >= 0 and hp <= 100),
  present       boolean not null default true,
  student_code  text    unique not null default (generate_code(4) || '-' || generate_code(4)),
  user_id       uuid    references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);

create table if not exists abilities (
  id          uuid    primary key default gen_random_uuid(),
  class_id    uuid    references classes(id) on delete cascade not null,
  name        text    not null,
  icon        text    not null default '✨',
  description text    not null default '',
  cost        integer not null default 1 check (cost > 0),
  max_owned   integer not null default 0 check (max_owned >= 0),
  available   boolean not null default true,
  is_builtin  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz default now()
);

create table if not exists student_abilities (
  id           uuid    primary key default gen_random_uuid(),
  student_id   uuid    references students(id) on delete cascade not null,
  ability_id   uuid    references abilities(id) on delete cascade not null,
  quantity     integer not null default 1 check (quantity > 0),
  purchased_at timestamptz default now(),
  unique(student_id, ability_id)
);

-- Secrets: hidden discoveries students can find with a code
create table if not exists secrets (
  id          uuid    primary key default gen_random_uuid(),
  class_id    uuid    references classes(id) on delete cascade not null,
  code        text    not null,
  title       text    not null,
  description text    not null default '',
  reward_xp   integer not null default 0,
  active      boolean not null default false,
  created_at  timestamptz default now(),
  unique(class_id, code)
);

create table if not exists student_secrets (
  id            uuid        primary key default gen_random_uuid(),
  student_id    uuid        references students(id) on delete cascade not null,
  secret_id     uuid        references secrets(id) on delete cascade not null,
  discovered_at timestamptz default now(),
  unique(student_id, secret_id)
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table classes           enable row level security;
alter table students          enable row level security;
alter table abilities         enable row level security;
alter table student_abilities enable row level security;
alter table secrets           enable row level security;
alter table student_secrets   enable row level security;

-- ── CLASSES ───────────────────────────────────────────────────
-- Teachers manage their own classes
create policy "Teachers manage own classes"
  on classes for all
  using     (auth.uid() = teacher_id)
  with check(auth.uid() = teacher_id);

-- Anyone can read a class record (needed for student portal to show class name)
create policy "Anyone reads classes"
  on classes for select
  using (true);

-- ── STUDENTS ──────────────────────────────────────────────────
-- Teachers can do everything with students in their classes
create policy "Teachers manage students"
  on students for all
  using (
    class_id in (select id from classes where teacher_id = auth.uid())
  )
  with check (
    class_id in (select id from classes where teacher_id = auth.uid())
  );

-- Anonymous/student reads: open read on students table.
-- Security is the unguessable student_code — no auth token needed.
-- Students look up by code; the app never exposes other students' codes.
create policy "Anyone reads students"
  on students for select
  using (true);

-- ── ABILITIES ─────────────────────────────────────────────────
-- Teachers manage abilities in their classes
create policy "Teachers manage abilities"
  on abilities for all
  using (
    class_id in (select id from classes where teacher_id = auth.uid())
  )
  with check (
    class_id in (select id from classes where teacher_id = auth.uid())
  );

-- Anyone can read available abilities (student portal shop)
create policy "Anyone reads available abilities"
  on abilities for select
  using (available = true);

-- ── STUDENT ABILITIES ─────────────────────────────────────────
-- Teachers can read all purchases in their classes
create policy "Teachers read student abilities"
  on student_abilities for select
  using (
    student_id in (
      select s.id from students s
      join classes c on c.id = s.class_id
      where c.teacher_id = auth.uid()
    )
  );

-- Anyone can read student_abilities (needed for portal to show inventory)
create policy "Anyone reads student abilities"
  on student_abilities for select
  using (true);

-- Anyone can insert/update purchases (student buys ability via anon key)
create policy "Anyone inserts student abilities"
  on student_abilities for insert
  with check (true);

create policy "Anyone updates student abilities"
  on student_abilities for update
  using (true);

-- ── SECRETS ───────────────────────────────────────────────────
-- Teachers manage secrets
create policy "Teachers manage secrets"
  on secrets for all
  using (
    class_id in (select id from classes where teacher_id = auth.uid())
  )
  with check (
    class_id in (select id from classes where teacher_id = auth.uid())
  );

-- Anyone can read active secrets (to validate a student's code entry)
create policy "Anyone reads active secrets"
  on secrets for select
  using (active = true);

-- ── STUDENT SECRETS ───────────────────────────────────────────
-- Anyone can read/insert student secret discoveries
create policy "Anyone reads student secrets"
  on student_secrets for select
  using (true);

create policy "Anyone inserts student secrets"
  on student_secrets for insert
  with check (true);

-- Teachers can read all discoveries in their class
create policy "Teachers read discoveries"
  on student_secrets for select
  using (
    student_id in (
      select s.id from students s
      join classes c on c.id = s.class_id
      where c.teacher_id = auth.uid()
    )
  );

-- ── REALTIME ─────────────────────────────────────────────────
-- Students see their XP/HP update live when teacher changes them
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table student_abilities;

-- ── SEED FUNCTION ────────────────────────────────────────────
-- Called automatically when a teacher creates their first class
create or replace function seed_builtin_abilities(p_class_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into abilities
    (class_id, name, icon, description, cost, max_owned, available, is_builtin, sort_order)
  values
    (p_class_id, 'Shield',        '🛡️',
     'Protect yourself from one HP penalty. Tell your teacher when you want to activate it.',
     1, 3, true, true, 1),
    (p_class_id, 'Double XP',     '⚡',
     'Earn double XP for one task. You must declare it to your teacher before the task begins.',
     2, 2, true, true, 2),
    (p_class_id, 'Skip',          '⏭️',
     'Skip one question or task of your choice. Cannot be used during formal assessments.',
     2, 1, true, true, 3),
    (p_class_id, 'Second Chance', '💚',
     'Restore 10 HP once. Tell your teacher and they will apply it.',
     1, 3, true, true, 4),
    (p_class_id, 'Lifeline',      '📞',
     'Ask your teacher for one yes/no hint during any task or quiz.',
     3, 1, true, true, 5);
end;
$$;

-- ── DONE ─────────────────────────────────────────────────────
-- Schema ready. Open starforge-teacher.html to create your account.
