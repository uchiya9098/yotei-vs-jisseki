-- ============================================================
-- 追加マイグレーション：
--   1) actual_logs に並び替え用 sort_order を追加
--   2) 週次・月次AIサマリー保存用テーブル ai_period_summaries
-- Supabase の SQL Editor で実行してください（schema.sql の後に実行）。
-- ============================================================

-- --------------------------------------------------------------
-- 1) actual_logs.sort_order
-- --------------------------------------------------------------
alter table public.actual_logs
  add column if not exists sort_order integer not null default 0;

-- --------------------------------------------------------------
-- 2) ai_period_summaries（週次・月次のAIサマリー）
-- --------------------------------------------------------------
create table if not exists public.ai_period_summaries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  period_type text not null check (period_type in ('this_week', 'last_week', 'this_month')),
  period_start date not null,
  period_end date not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_period_summaries_user_period_idx
  on public.ai_period_summaries (user_id, period_type, period_start);

alter table public.ai_period_summaries enable row level security;

create policy "Users can view own period summaries" on public.ai_period_summaries
  for select using (auth.uid() = user_id);
create policy "Users can insert own period summaries" on public.ai_period_summaries
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own period summaries" on public.ai_period_summaries
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.ai_period_summaries;
