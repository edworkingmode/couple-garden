-- 每日報平安：每人每天一次，可以附心情和一句話。貼到 Supabase SQL Editor 執行。
create table if not exists cg_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,                 -- 報平安那個人當地的日期
  mood text not null default '',
  note text not null default '',
  ts bigint not null,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists cg_checkins_couple_idx on cg_checkins (couple_id, day desc);
alter table cg_checkins enable row level security;
drop policy if exists "cg checkins read" on cg_checkins;
drop policy if exists "cg checkins insert" on cg_checkins;
create policy "cg checkins read" on cg_checkins for select to authenticated using (couple_id = cg_my_couple());
create policy "cg checkins insert" on cg_checkins for insert to authenticated
  with check (couple_id = cg_my_couple() and user_id = auth.uid());
