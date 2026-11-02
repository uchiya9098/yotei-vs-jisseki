-- ============================================================
-- 追加マイグレーション：実績ごとの「ズレの理由」（複数選択・任意）
--
-- actual_logs に variance_reasons（text[]）を追加する。
--   - 既存の行は自動的に '{}'（理由未選択）になり、既存データは一切変更・削除されない。
--   - 値は固定キーのみ（check制約）。メモ本文とは別に保存するので後から集計できる。
--   - 何度実行しても安全（idempotent）。
--
-- 適用: Supabase の SQL Editor で実行（001〜004 の後）。
-- ※ アプリを更新する前、または同時に必ず実行してください。未適用のままだと
--   理由の保存と、ゲストデータのクラウド同期（実績）が失敗します。
-- ============================================================

alter table public.actual_logs
  add column if not exists variance_reasons text[] not null default '{}';

alter table public.actual_logs
  drop constraint if exists actual_logs_variance_reasons_check;

alter table public.actual_logs
  add constraint actual_logs_variance_reasons_check
  check (
    variance_reasons <@ array[
      'estimate_short', 'interruption', 'prep_travel',
      'fatigue_focus', 'media_overrun', 'other'
    ]::text[]
  );

-- 集計例（後日の原因集計用。今回アプリ側では未使用）:
--   select r as reason, count(*) from public.actual_logs, unnest(variance_reasons) as r
--   where user_id = auth.uid() group by r order by count(*) desc;
