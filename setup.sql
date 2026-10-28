-- ============================================================
-- 情侶花園（新版）資料庫設定
-- 全部資料表以 cg_ 開頭，跟舊版的 meals 表完全分開。
-- 在 Supabase → SQL Editor 開一個新查詢，整段貼上後按 Run。
-- ============================================================

-- 每個使用者的基本資料：暱稱、時區、屬於哪一對
create table if not exists cg_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  tz text not null default 'Asia/Taipei',
  color text not null default 'red',          -- 花園的花色：red / blue
  couple_id uuid,
  created_at timestamptz not null default now()
);

-- 一對情侶：邀請碼、在一起日、認識日、下次見面
create table if not exists cg_couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  started_on date,
  met_on date,
  next_meet date,
  created_at timestamptz not null default now()
);

alter table cg_profiles
  drop constraint if exists cg_profiles_couple_fk,
  add constraint cg_profiles_couple_fk foreign key (couple_id) references cg_couples (id) on delete set null;

-- 每日任務：誰要做（doer）、一天最多幾次
create table if not exists cg_tasks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  doer uuid not null references auth.users (id) on delete cascade,
  title text not null,
  per_day int not null default 1 check (per_day between 1 and 10),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 花（以及小黑花）：種在誰的花園（owner）、誰建立的（created_by）
--   kind  : task 任務 / gift 對方主動送 / request 自己申請 / black 小黑花
--   status: pending 等確認 / confirmed 有效 / rejected 退回 / appeal 申訴中 / revoked 已撤銷 / redeemed 已贖回
create table if not exists cg_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  task_id uuid references cg_tasks (id) on delete set null,
  kind text not null check (kind in ('task', 'gift', 'request', 'black')),
  status text not null check (status in ('pending', 'confirmed', 'rejected', 'appeal', 'revoked', 'redeemed')),
  day date not null,
  note text not null default '',
  reply text not null default '',
  ts bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists cg_entries_couple_idx on cg_entries (couple_id, ts desc);

-- 紀念日：生日、交往紀念、自訂；可每年重複
create table if not exists cg_dates (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  title text not null,
  day date not null,
  yearly boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 權限：每個人只能看到、改到自己這一對的資料
-- ------------------------------------------------------------
create or replace function cg_my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from cg_profiles where id = auth.uid()
$$;

alter table cg_profiles enable row level security;
alter table cg_couples enable row level security;
alter table cg_tasks enable row level security;
alter table cg_entries enable row level security;
alter table cg_dates enable row level security;

drop policy if exists "cg profiles read" on cg_profiles;
drop policy if exists "cg profiles insert" on cg_profiles;
drop policy if exists "cg profiles update" on cg_profiles;
create policy "cg profiles read" on cg_profiles for select to authenticated
  using (id = auth.uid() or (couple_id is not null and couple_id = cg_my_couple()));
create policy "cg profiles insert" on cg_profiles for insert to authenticated
  with check (id = auth.uid() and couple_id is null);
-- 自己的暱稱、時區、花色可以改；加入或離開情侶只能透過下面的函式
create policy "cg profiles update" on cg_profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and couple_id is not distinct from cg_my_couple());

drop policy if exists "cg couples read" on cg_couples;
drop policy if exists "cg couples update" on cg_couples;
create policy "cg couples read" on cg_couples for select to authenticated using (id = cg_my_couple());
create policy "cg couples update" on cg_couples for update to authenticated using (id = cg_my_couple()) with check (id = cg_my_couple());

drop policy if exists "cg tasks all" on cg_tasks;
create policy "cg tasks all" on cg_tasks for all to authenticated
  using (couple_id = cg_my_couple()) with check (couple_id = cg_my_couple());

drop policy if exists "cg entries all" on cg_entries;
drop policy if exists "cg entries read" on cg_entries;
drop policy if exists "cg entries insert" on cg_entries;
drop policy if exists "cg entries update" on cg_entries;
drop policy if exists "cg entries delete" on cg_entries;
create policy "cg entries read" on cg_entries for select to authenticated using (couple_id = cg_my_couple());
-- 新增時一定要是自己建立的；確認、申訴、贖回由兩人互相更新
create policy "cg entries insert" on cg_entries for insert to authenticated
  with check (couple_id = cg_my_couple() and created_by = auth.uid());
create policy "cg entries update" on cg_entries for update to authenticated
  using (couple_id = cg_my_couple()) with check (couple_id = cg_my_couple());
create policy "cg entries delete" on cg_entries for delete to authenticated
  using (couple_id = cg_my_couple() and created_by = auth.uid());

drop policy if exists "cg dates all" on cg_dates;
create policy "cg dates all" on cg_dates for all to authenticated
  using (couple_id = cg_my_couple()) with check (couple_id = cg_my_couple());

-- ------------------------------------------------------------
-- 配對：建立一對（產生邀請碼）、用邀請碼加入、離開
-- ------------------------------------------------------------
create or replace function cg_create_couple() returns text
language plpgsql security definer set search_path = public as $$
declare code text; cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if cg_my_couple() is not null then
    select invite_code into code from cg_couples where id = cg_my_couple();
    return code;
  end if;
  loop
    code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from cg_couples where invite_code = code);
  end loop;
  insert into cg_couples (invite_code) values (code) returning id into cid;
  update cg_profiles set couple_id = cid where id = auth.uid();
  return code;
end $$;

create or replace function cg_join_couple(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if cg_my_couple() is not null then raise exception 'already paired'; end if;
  select id into cid from cg_couples where invite_code = upper(trim(code));
  if cid is null then raise exception 'code not found'; end if;
  select count(*) into n from cg_profiles where couple_id = cid;
  if n >= 2 then raise exception 'couple full'; end if;
  update cg_profiles set couple_id = cid where id = auth.uid();
  return cid;
end $$;

create or replace function cg_leave_couple() returns void
language plpgsql security definer set search_path = public as $$
begin
  update cg_profiles set couple_id = null where id = auth.uid();
end $$;

grant execute on function cg_my_couple() to authenticated;
grant execute on function cg_create_couple() to authenticated;
grant execute on function cg_join_couple(text) to authenticated;
grant execute on function cg_leave_couple() to authenticated;

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
create table if not exists cg_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table cg_push_subs enable row level security;
drop policy if exists "cg push own" on cg_push_subs;
create policy "cg push own" on cg_push_subs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create table if not exists cg_rewards (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,        -- 誰可以兌換（瓶子的主人）
  created_by uuid not null references auth.users (id) on delete cascade,   -- 誰設定的（送花的人）
  title text not null,
  cost int not null check (cost between 1 and 9999),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists cg_reward_claims (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references cg_couples (id) on delete cascade,
  reward_id uuid references cg_rewards (id) on delete set null,
  owner uuid not null references auth.users (id) on delete cascade,        -- 兌換的人
  title text not null,                                                      -- 兌換當下的獎勵名稱與朵數（之後改獎勵不影響紀錄）
  cost int not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reply text not null default '',
  ts bigint not null,
  created_at timestamptz not null default now()
);
alter table cg_rewards enable row level security;
alter table cg_reward_claims enable row level security;
drop policy if exists "cg rewards read" on cg_rewards;
drop policy if exists "cg rewards write" on cg_rewards;
create policy "cg rewards read" on cg_rewards for select to authenticated using (couple_id = cg_my_couple());
create policy "cg rewards write" on cg_rewards for all to authenticated
  using (couple_id = cg_my_couple() and created_by = auth.uid())
  with check (couple_id = cg_my_couple() and created_by = auth.uid());
drop policy if exists "cg claims read" on cg_reward_claims;
drop policy if exists "cg claims insert" on cg_reward_claims;
drop policy if exists "cg claims update" on cg_reward_claims;
create policy "cg claims read" on cg_reward_claims for select to authenticated using (couple_id = cg_my_couple());
create policy "cg claims insert" on cg_reward_claims for insert to authenticated
  with check (couple_id = cg_my_couple() and owner = auth.uid() and status = 'pending');
-- 確認或退回只能由另一半做
create policy "cg claims update" on cg_reward_claims for update to authenticated
  using (couple_id = cg_my_couple() and owner <> auth.uid())
  with check (couple_id = cg_my_couple() and owner <> auth.uid());
