import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ActualLog, PeriodMode, Task, TaskDiff } from "@/types/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toDateKey(date: Date): string {
  // ローカルの日付をそのまま "YYYY-MM-DD" にする。
  // toISOString() はUTC変換されるため、UTCより進んだタイムゾーン（日本など）では
  // 日付が1日ずれることがあり、期間指定の正確さが重要なエクスポート機能等に影響するため避ける。
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "HH:mm:ss" or "HH:mm" -> 分
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function computeMinutesFromRange(
  start: string | null,
  end: string | null
): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60; // 日またぎ想定
  return diff;
}

export function formatMinutes(min: number | null): string {
  if (min === null || Number.isNaN(min)) return "―";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  const sign = min < 0 ? "-" : "";
  if (h === 0) return `${sign}${m}分`;
  return `${sign}${h}時間${m > 0 ? `${m}分` : ""}`;
}

// 予定と実績をタスク単位でペアリングし、差分を計算する
export function buildTaskDiffs(tasks: Task[], actuals: ActualLog[]): TaskDiff[] {
  const actualByTaskId = new Map<string, ActualLog>();
  const unlinkedActuals: ActualLog[] = [];

  for (const a of actuals) {
    if (a.task_id) {
      actualByTaskId.set(a.task_id, a);
    } else {
      unlinkedActuals.push(a);
    }
  }

  const diffs: TaskDiff[] = tasks.map((task) => {
    const actual = actualByTaskId.get(task.id) ?? null;
    const estimated =
      task.estimated_minutes ?? computeMinutesFromRange(task.start_time, task.end_time);
    const actualMinutes =
      actual?.actual_minutes ??
      (actual ? computeMinutesFromRange(actual.start_time, actual.end_time) : null);

    const diffMinutes =
      estimated !== null && actualMinutes !== null ? actualMinutes - estimated : null;

    return { task, actual, diffMinutes };
  });

  // 予定に紐づかない実績（後から手動追加したもの等）も表示対象に含める
  for (const a of unlinkedActuals) {
    diffs.push({ task: null, actual: a, diffMinutes: null });
  }

  return diffs;
}

// 週の始まり（月曜日）を返す
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=日
  const diff = (day === 0 ? -6 : 1) - day; // 月曜起点
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

// mode（週/月）と基準日（anchor）から、その週・月の範囲を返す。
// anchor を ±7日 / ±1ヶ月 ずらすことで任意の過去・未来の期間へ移動できる。
export function getRangeForMode(mode: PeriodMode, anchor: Date) {
  if (mode === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return { start, end };
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start, end };
}

// 今日を含む期間かどうか（「今日/今週に戻る」ボタンの表示判定などに使う）
export function rangeIncludesToday(start: Date, end: Date): boolean {
  const now = new Date();
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  return now >= start && now <= endOfDay;
}

// 今週の月曜日の日付キー（"今週のToDo"プールの識別に使う）
export function getCurrentWeekStartKey(): string {
  return toDateKey(startOfWeek(new Date()));
}

// "YYYY-MM-DD" -> ローカル時間0時の Date（new Date("YYYY-MM-DD") はUTC扱いでずれるため使わない）
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 週の開始日キーを weeks 週ぶんずらす（負数で過去、正数で未来）
export function shiftWeekKey(weekKey: string, weeks: number): string {
  return toDateKey(addDays(parseDateKey(weekKey), weeks * 7));
}

// 週の開始日キー -> "10/5 〜 10/11"
export function formatWeekRangeLabel(weekKey: string): string {
  const start = parseDateKey(weekKey);
  return formatDateRangeLabel(start, addDays(start, 6));
}

// 今週を基準にした呼び名（今週 / 先週 / 来週 / 3週前 / 2週後）
export function getWeekRelationLabel(weekKey: string, currentWeekKey: string): string {
  const diffDays =
    (parseDateKey(weekKey).getTime() - parseDateKey(currentWeekKey).getTime()) / 86_400_000;
  const weeks = Math.round(diffDays / 7);
  if (weeks === 0) return "今週";
  if (weeks === -1) return "先週";
  if (weeks === 1) return "来週";
  return weeks < 0 ? `${-weeks}週前` : `${weeks}週後`;
}

export function formatDateRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} 〜 ${fmt(end)}`;
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

// "YYYY-MM-DD" -> "8/10(月)"
export function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_JA[d.getDay()]})`;
}

// "YYYY-MM-DD" -> "2026年8月10日(月)"（Markdownエクスポートの見出し用）
export function formatFullDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAY_JA[d.getDay()]})`;
}

// start〜end（両端含む、"YYYY-MM-DD"）の間の日付キーを昇順で列挙する
export function getDateKeysInRange(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let cursor = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}
