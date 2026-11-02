// 過去の実績時間から、同じ活動の「参考時間」（中央値）を計算する純関数。AIは使わない。
//
// 対象: 予定に紐づいた実績のみ（予定外は含めない）。1つの予定 = 1回分。
// 有効な1回分の条件（すべて満たす）:
//   - 紐づく実績が1件以上ある
//   - 紐づく実績の**すべて**が time_confirmed = true（本人が入力・確認した時間）
//   - 紐づく実績の**すべて**に実績時間がある（未入力が1件でもあれば、その回は丸ごと除外）
//   - 予定の日付が 今日-WINDOW_DAYS日 〜 今日 の範囲内
// 実績時間は、予定に紐づく複数の実績を合算して1回分とする。
// 同じ活動 = タイトルの前後の空白を除き、連続する空白を1つにしたものが一致（それ以外の正規化はしない）。
// 直近 MAX_OCCURRENCES 回（日付の新しい順）を使い、MIN_OCCURRENCES 回未満なら参考値を出さない。

import type { ActualLog, Task } from "@/types/database";
import { addDays, getActualMinutes, parseDateKey, toDateKey } from "@/lib/utils";

export const MIN_OCCURRENCES = 3;
export const MAX_OCCURRENCES = 10;
export const WINDOW_DAYS = 90;

export type EstimateReference = {
  median: number; // 分
  count: number; // 対象にした回数
  from: string; // 対象の最も古い予定日 YYYY-MM-DD
  to: string; // 対象の最も新しい予定日
};
export type EstimateIndex = Map<string, EstimateReference>;

export function normalizeActivityTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/** 履歴取得の開始日（today の WINDOW_DAYS 日前） */
export function getHistorySinceKey(todayKey: string, windowDays = WINDOW_DAYS): string {
  return toDateKey(addDays(parseDateKey(todayKey), -windowDays));
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function buildEstimateIndex(
  tasks: Task[],
  actuals: ActualLog[],
  todayKey: string = toDateKey(new Date()),
  windowDays = WINDOW_DAYS
): EstimateIndex {
  const since = getHistorySinceKey(todayKey, windowDays);

  const actualsByTask = new Map<string, ActualLog[]>();
  for (const a of actuals) {
    if (!a.task_id) continue; // 予定外の実績は対象外
    const list = actualsByTask.get(a.task_id) ?? [];
    list.push(a);
    actualsByTask.set(a.task_id, list);
  }

  const byTitle = new Map<string, { date: string; minutes: number }[]>();
  for (const task of tasks) {
    if (task.date < since || task.date > todayKey) continue;
    const linked = actualsByTask.get(task.id);
    if (!linked || linked.length === 0) continue;

    let total = 0;
    let valid = true;
    for (const a of linked) {
      const m = getActualMinutes(a);
      if (a.time_confirmed !== true || m === null || m <= 0) {
        valid = false; // 未確認・時間未入力が1件でもあれば、その回は丸ごと除外
        break;
      }
      total += m;
    }
    if (!valid) continue;

    const key = normalizeActivityTitle(task.title);
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push({ date: task.date, minutes: total });
    byTitle.set(key, list);
  }

  const index: EstimateIndex = new Map();
  for (const [key, list] of byTitle) {
    const recent = list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_OCCURRENCES);
    if (recent.length < MIN_OCCURRENCES) continue;
    const dates = recent.map((r) => r.date).sort();
    index.set(key, {
      median: median(recent.map((r) => r.minutes)),
      count: recent.length,
      from: dates[0],
      to: dates[dates.length - 1]
    });
  }
  return index;
}

export function getEstimateReference(index: EstimateIndex, title: string): EstimateReference | null {
  const key = normalizeActivityTitle(title);
  return key ? index.get(key) ?? null : null;
}

/** "10/1〜10/28" 形式（同じ日なら1日だけ） */
export function formatReferencePeriod(ref: EstimateReference): string {
  const f = (k: string) => {
    const [, m, d] = k.split("-").map(Number);
    return `${m}/${d}`;
  };
  return ref.from === ref.to ? f(ref.from) : `${f(ref.from)}〜${f(ref.to)}`;
}
