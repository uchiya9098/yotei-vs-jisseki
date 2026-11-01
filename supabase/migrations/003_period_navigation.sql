-- ============================================================
-- 追加マイグレーション：週次・月次サマリーの任意期間ナビゲーション対応
--
-- これまで ai_period_summaries.period_type は
-- 'this_week' / 'last_week' / 'this_month' の3値に固定していたが、
-- 「任意の週・月」を行き来できるようにしたため、
-- period_type は 'week' / 'month' のみを表す値に変更し、
-- どの週・月かは period_start / period_end（既に一意に期間を特定できる）で区別する。
--
-- Supabase の SQL Editor で実行してください（001, 002 の後に実行）。
-- ============================================================

alter table public.ai_period_summaries
  drop constraint if exists ai_period_summaries_period_type_check;

-- 既存データがあれば新しい値に寄せておく（'this_week'/'last_week' -> 'week', 'this_month' -> 'month'）
update public.ai_period_summaries
  set period_type = 'week'
  where period_type in ('this_week', 'last_week');

update public.ai_period_summaries
  set period_type = 'month'
  where period_type = 'this_month';

alter table public.ai_period_summaries
  add constraint ai_period_summaries_period_type_check
  check (period_type in ('week', 'month'));
