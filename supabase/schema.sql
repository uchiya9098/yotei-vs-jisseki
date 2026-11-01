-- ============================================================
-- 予定 vs 実績（ToDo & コーチングAI）管理アプリ
-- Supabase スキーマ定義
-- Supabase の SQL Editor にそのまま貼り付けて実行してください。
-- ============================================================

-- --------------------------------------------------------------
-- 拡張機能
-- --------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- --------------------------------------------------------------
-- users テーブル
-- Supabase Auth の auth.users を拡張するプロフィールテーブル。
-- Google認証成功時にトリガーで自動作成する。
-- --------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- auth.users に新規ユーザーが作られたら public.users にも自動反映する
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --------------------------------------------------------------
-- tasks テーブル（予定）
-- --------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  title text not null,
  start_time time,          -- nullable: 時間指定なしOK
  end_time time,             -- nullable
  estimated_minutes integer, -- nullable。start/end があれば自動算出も可
  sort_order integer not null default 0,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, date);

-- --------------------------------------------------------------
-- actual_logs テーブル（実績）
-- --------------------------------------------------------------
create table if not exists public.actual_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null, -- 予定からの転記元。手動作成ならnull
  date date not null,
  title text not null,
  start_time time,
  end_time time,
  actual_minutes integer,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists actual_logs_user_date_idx on public.actual_logs (user_id, date);
create index if not exists actual_logs_task_idx on public.actual_logs (task_id);

-- --------------------------------------------------------------
-- ai_reflections テーブル（AI振り返り履歴）
-- --------------------------------------------------------------
create table if not exists public.ai_reflections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  messages jsonb not null default '[]'::jsonb, -- [{role: 'user'|'model', content: string, created_at}]
  summary_analysis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_reflections_user_date_idx on public.ai_reflections (user_id, date);

-- --------------------------------------------------------------
-- updated_at 自動更新トリガー
-- --------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute procedure public.set_updated_at();

drop trigger if exists actual_logs_set_updated_at on public.actual_logs;
create trigger actual_logs_set_updated_at before update on public.actual_logs
  for each row execute procedure public.set_updated_at();

drop trigger if exists ai_reflections_set_updated_at on public.ai_reflections;
create trigger ai_reflections_set_updated_at before update on public.ai_reflections
  for each row execute procedure public.set_updated_at();

-- --------------------------------------------------------------
-- Row Level Security（RLS）
-- 各テーブルとも「本人のデータのみ」CRUD可能にする
-- --------------------------------------------------------------
alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.actual_logs enable row level security;
alter table public.ai_reflections enable row level security;

-- users
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- tasks
create policy "Users can view own tasks" on public.tasks
  for select using (auth.uid() = user_id);
create policy "Users can insert own tasks" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks" on public.tasks
  for update using (auth.uid() = user_id);
create policy "Users can delete own tasks" on public.tasks
  for delete using (auth.uid() = user_id);

-- actual_logs
create policy "Users can view own actual_logs" on public.actual_logs
  for select using (auth.uid() = user_id);
create policy "Users can insert own actual_logs" on public.actual_logs
  for insert with check (auth.uid() = user_id);
create policy "Users can update own actual_logs" on public.actual_logs
  for update using (auth.uid() = user_id);
create policy "Users can delete own actual_logs" on public.actual_logs
  for delete using (auth.uid() = user_id);

-- ai_reflections
create policy "Users can view own ai_reflections" on public.ai_reflections
  for select using (auth.uid() = user_id);
create policy "Users can insert own ai_reflections" on public.ai_reflections
  for insert with check (auth.uid() = user_id);
create policy "Users can update own ai_reflections" on public.ai_reflections
  for update using (auth.uid() = user_id);
create policy "Users can delete own ai_reflections" on public.ai_reflections
  for delete using (auth.uid() = user_id);

-- --------------------------------------------------------------
-- Realtime（マルチデバイス同期用）
-- --------------------------------------------------------------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.actual_logs;
alter publication supabase_realtime add table public.ai_reflections;
