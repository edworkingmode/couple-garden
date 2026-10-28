-- 獎勵：送花的人幫對方設定「集滿幾朵可以換什麼」，對方兌換後由設定的人確認。
-- 貼到 Supabase SQL Editor 執行。
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
