-- 推播通知：記錄每支手機的推播訂閱。貼到 Supabase SQL Editor 執行。
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
