-- ============================================================
-- 追加マイグレーション：「今週のToDo」タスクプール
--
-- デイリー画面のサイドドロワーで管理する、特定の日付に紐づかない
-- 週単位のタスクプール。「今日やる」ボタンやドラッグ＆ドロップで
-- 本日の tasks（予定ToDo）へ転送できる。
--
-- Supabase の SQL Editor で実行してください（001〜003 の後に実行）。
-- ============================================================

create table if not exists public.weekly_todos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  week_start date not null, -- その週の月曜日の日付（週の識別キー）
  title text not null,
  estimated_minutes integer,
  is_completed boolean not null default false, -- 「今週やる」タスクとしての消化完了チェック
  assigned_task_id uuid references public.tasks (id) on delete set null, -- 転送先タスクへのリンク
  assigned_date date, -- 最後にどの日へ転送したか（バッジ表示用）
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists weekly_todos_user_week_idx
  on public.weekly_todos (user_id, week_start);

drop trigger if exists weekly_todos_set_updated_at on public.weekly_todos;
create trigger weekly_todos_set_updated_at before update on public.weekly_todos
  for each row execute procedure public.set_updated_at();

alter table public.weekly_todos enable row level security;

create policy "Users can view own weekly_todos" on public.weekly_todos
  for select using (auth.uid() = user_id);
create policy "Users can insert own weekly_todos" on public.weekly_todos
  for insert with check (auth.uid() = user_id);
create policy "Users can update own weekly_todos" on public.weekly_todos
  for update using (auth.uid() = user_id);
create policy "Users can delete own weekly_todos" on public.weekly_todos
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.weekly_todos;
