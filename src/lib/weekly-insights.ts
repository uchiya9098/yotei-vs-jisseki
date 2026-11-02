// 週次サマリー用の集計と「次週に試す工夫」の生成（純関数・AI不使用）。
// - 時間差分は既存の buildTaskDiffs の結果（TaskDiff）をそのまま使い、差分の計算ロジックは重複させない。
// - 「理由未記録」「実績未記録」「時間未入力」は 0 分や原因とは別物として数える。
// - 工夫は集計値だけを根拠にした定型文（可能性の表現）。保存せず毎回計算するので、期間が変わると古い結果は残らない。

import type { ActualLog, Task, TaskDiff } from "@/types/database";
import { VARIANCE_REASONS, normalizeVarianceReasons, type VarianceReasonKey } from "@/lib/variance-reasons";
import { parseDateKey, toDateKey } from "@/lib/utils";

/** 傾向を述べるのに最低限必要な実績件数 / 差分が出ている予定の件数 */
export const MIN_ACTUALS_FOR_TRENDS = 3;
export const MIN_COMPARED_FOR_TRENDS = 3;

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export type ReasonCount = { key: VarianceReasonKey; label: string; count: number };
export type ActivityDiff = { title: string; diffMinutes: number; count: number };
export type WeekdayDiff = { label: string; diffMinutes: number; count: number };

export type Suggestion = { id: string; text: string; basis: string };

export type WeeklyInsights = {
  totalActuals: number;
  // 理由
  reasonCounts: ReasonCount[]; // 件数の多い順（同数は固定順）。0件の理由は含まない
  actualsWithReason: number;
  actualsWithoutReason: number; // 理由未記録
  // ズレ
  comparedCount: number; // 予定時間と実績時間が両方あり差分が出ている予定の数
  overActivities: ActivityDiff[]; // 超過が大きい順（最大3）
  underActivities: ActivityDiff[]; // 短縮が大きい順（最大3）
  overWeekday: WeekdayDiff | null;
  underWeekday: WeekdayDiff | null;
  unrecordedTaskCount: number; // 紐づく実績が1件もない予定（日付が今日以前のものだけ）
  unrecordedCompletedCount: number; // うち完了チェック済み
  unplannedMinutes: number; // 予定外の実績のうち、時間が記録されているものの合計
  unplannedWithTime: number;
  unplannedWithoutTime: number;
  actualsWithoutTime: number; // 時間が未入力の実績（全体）
  hasEnoughForTrends: boolean;
  suggestions: Suggestion[];
};

const REASON_TIPS: Record<VarianceReasonKey, string> = {
  estimate_short: "次週は、予定時間に少し余裕（例: 2割増し）を足して立ててみる案です。",
  interruption: "1日のどこかに30分ほどの予備枠を置いてみる案です。",
  prep_travel: "準備や移動を別の予定として書き出し、時間に含めてみる案です。",
  fatigue_focus:
    "集中しづらかったと記録した日の時間帯を見返し、重い作業を別の時間帯に置くと違いがあるかもしれません。次回試す案です。",
  media_overrun: "動画・ゲームは、始める前に終了時刻を決めておく案です。",
  other: "「その他」の補足メモを見返して、共通点がないか確認してみる案です。"
};

export function computeWeeklyInsights(
  tasks: Task[],
  actuals: ActualLog[],
  diffs: TaskDiff[], // buildTaskDiffs(tasks, actuals) の結果
  todayKey: string = toDateKey(new Date()) // ユーザーのローカル日付 YYYY-MM-DD（テストでは固定値を渡す）
): WeeklyInsights {
  // ---- 理由の集計：複数理由の実績はそれぞれに1件ずつ加算。予定外の実績も含む ----
  const counts = new Map<VarianceReasonKey, number>();
  let actualsWithReason = 0;
  for (const a of actuals) {
    const keys = normalizeVarianceReasons(a.variance_reasons); // 未知のキーは無視、無ければ []
    if (keys.length > 0) actualsWithReason++;
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const order = VARIANCE_REASONS.map((r) => r.key);
  const reasonCounts: ReasonCount[] = VARIANCE_REASONS.filter((r) => (counts.get(r.key) ?? 0) > 0)
    .map((r) => ({ key: r.key, label: r.full, count: counts.get(r.key)! }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));

  // ---- 差分（既存の diffMinutes を使う。null = 未記録/時間未入力/予定時間なし は対象外）----
  const compared = diffs.filter((d) => d.task && d.diffMinutes !== null);

  const byTitle = new Map<string, ActivityDiff>();
  const byWeekday = new Map<number, WeekdayDiff>();
  for (const d of compared) {
    const title = d.task!.title.trim();
    const t = byTitle.get(title) ?? { title, diffMinutes: 0, count: 0 };
    t.diffMinutes += d.diffMinutes!;
    t.count += 1;
    byTitle.set(title, t);

    const wd = parseDateKey(d.task!.date).getDay();
    const w = byWeekday.get(wd) ?? { label: `${WEEKDAY_LABELS[wd]}曜日`, diffMinutes: 0, count: 0 };
    w.diffMinutes += d.diffMinutes!;
    w.count += 1;
    byWeekday.set(wd, w);
  }
  const activities = [...byTitle.values()];
  const overActivities = activities
    .filter((a) => a.diffMinutes > 0)
    .sort((a, b) => b.diffMinutes - a.diffMinutes)
    .slice(0, 3);
  const underActivities = activities
    .filter((a) => a.diffMinutes < 0)
    .sort((a, b) => a.diffMinutes - b.diffMinutes)
    .slice(0, 3);
  const weekdays = [...byWeekday.values()];
  const overWeekday =
    weekdays.filter((w) => w.diffMinutes > 0).sort((a, b) => b.diffMinutes - a.diffMinutes)[0] ?? null;
  const underWeekday =
    weekdays.filter((w) => w.diffMinutes < 0).sort((a, b) => a.diffMinutes - b.diffMinutes)[0] ?? null;

  // ---- 実績未記録の予定 / 予定外の実績時間 ----
  // 未記録として数えるのは、予定の日付が今日以前のものだけ（まだ実行日が来ていない予定は含めない）。
  // 日付キーは YYYY-MM-DD なので文字列比較で順序が正しく、todayKey は toDateKey（ローカル日付）で作る。
  const unrecorded = diffs.filter((d) => d.task && d.task.date <= todayKey && d.actuals.length === 0);
  const unrecordedCompletedCount = unrecorded.filter((d) => d.task!.is_completed).length;

  const unplanned = diffs.filter((d) => !d.task);
  const unplannedWithTimeList = unplanned.filter((d) => d.actualMinutes !== null);
  const unplannedMinutes = unplannedWithTimeList.reduce((s, d) => s + (d.actualMinutes ?? 0), 0);

  const actualsWithoutTime = diffs
    .flatMap((d) => d.actuals)
    .filter((a) => (a.actual_minutes ?? null) === null && !(a.start_time && a.end_time)).length;

  const hasEnoughForTrends =
    actuals.length >= MIN_ACTUALS_FOR_TRENDS && compared.length >= MIN_COMPARED_FOR_TRENDS;

  const base = {
    totalActuals: actuals.length,
    reasonCounts,
    actualsWithReason,
    actualsWithoutReason: actuals.length - actualsWithReason,
    comparedCount: compared.length,
    overActivities,
    underActivities,
    overWeekday,
    underWeekday,
    unrecordedTaskCount: unrecorded.length,
    unrecordedCompletedCount,
    unplannedMinutes,
    unplannedWithTime: unplannedWithTimeList.length,
    unplannedWithoutTime: unplanned.length - unplannedWithTimeList.length,
    actualsWithoutTime,
    hasEnoughForTrends
  };

  return { ...base, suggestions: buildSuggestions(base, tasks.length) };
}

function buildSuggestions(
  i: Omit<WeeklyInsights, "suggestions">,
  taskCount: number
): Suggestion[] {
  // 記録が少ない週は、傾向の断定や工夫を作らず、記録を促すだけにする
  if (i.totalActuals < MIN_ACTUALS_FOR_TRENDS) {
    return [
      {
        id: "record-more",
        text: "記録が少ないため、まずは実績と、ズレたときの理由を記録してみましょう。",
        basis: `この週の実績は${i.totalActuals}件です。`
      }
    ];
  }

  const out: Suggestion[] = [];

  // 理由の記録が十分でなければ、記録を促す（理由に基づく工夫は作らない）
  if (i.actualsWithReason < MIN_ACTUALS_FOR_TRENDS) {
    out.push({
      id: "record-reasons",
      text: "理由の記録がまだ少ないため、ズレが出た実績には理由を選んでみましょう。次週以降に傾向を見やすくなります。",
      basis: `理由が記録された実績は${i.actualsWithReason}件 / 全${i.totalActuals}件です。`
    });
  } else {
    for (const r of i.reasonCounts.filter((r) => r.count >= 2).slice(0, 2)) {
      out.push({
        id: `reason-${r.key}`,
        text: REASON_TIPS[r.key],
        basis: `「${r.label}」が${r.count}件記録されています。`
      });
    }
  }

  if (i.hasEnoughForTrends && i.overActivities[0] && i.overActivities[0].diffMinutes >= 15) {
    const a = i.overActivities[0];
    out.push({
      id: "over-activity",
      text: `「${a.title}」は予定より長くかかる傾向があるかもしれません。次週は予定時間を長めにするか、小さく分けて立ててみる案です。`,
      basis: `「${a.title}」は予定との差分が合計+${a.diffMinutes}分（${a.count}件）でした。`
    });
  }

  if (taskCount > 0 && i.unrecordedTaskCount >= 3) {
    out.push({
      id: "unrecorded",
      text: "実績が未記録の予定が複数あります。1日の終わりに実績を確認する時間を決めてみる案です。",
      basis: `実績が未記録の予定は${i.unrecordedTaskCount}件です。`
    });
  }

  if (i.actualsWithoutTime >= 2) {
    out.push({
      id: "missing-time",
      text: "時間が未入力の実績があります。開始・終了か所要時間を入れると、予定との差分で振り返れます。",
      basis: `時間が未入力の実績は${i.actualsWithoutTime}件です。`
    });
  }

  return out.slice(0, 3);
}
