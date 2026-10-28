-- 只要貼這一段到 Supabase SQL Editor 執行（建「想你」用的資料表）
-- ------------------------------------------------------------
-- 「想你」：按一下就讓對方的瓶子亮起來（2026-10-28 新增）
-- ------------------------------------------------------------
create table if not exists cg_pings (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  from_id uuid not null references auth.users (id) on delete cascade,
  ts bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists cg_pings_couple_idx on cg_pings (couple_id, ts desc);
alter table cg_pings enable row level security;
drop policy if exists "cg pings read" on cg_pings;
drop policy if exists "cg pings insert" on cg_pings;
create policy "cg pings read" on cg_pings for select to authenticated using (couple_id = cg_my_couple());
create policy "cg pings insert" on cg_pings for insert to authenticated
  with check (couple_id = cg_my_couple() and from_id = auth.uid());
