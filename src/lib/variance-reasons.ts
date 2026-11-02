// 予定と実績のズレの理由。DBには key（英字の固定値）を配列で保存する。ラベルは表示専用なので変更しても集計に影響しない。
// 集計しやすいよう自由記述ではなく固定の選択肢にしている（メモ本文からの推測分類はしない）。

export const VARIANCE_REASONS = [
  { key: "estimate_short", label: "見積もり不足", full: "作業時間の見積もり不足" },
  { key: "interruption", label: "割り込み・急用", full: "割り込み・急な用事" },
  { key: "prep_travel", label: "準備・移動", full: "準備・移動に時間がかかった" },
  { key: "fatigue_focus", label: "疲れ・集中しづらさ", full: "疲れ・気分・集中しづらさ" },
  { key: "media_overrun", label: "動画・ゲーム", full: "動画・ゲームなどが予定より長くなった" },
  { key: "other", label: "その他", full: "その他（補足はメモ欄へ）" }
] as const;

export type VarianceReasonKey = (typeof VARIANCE_REASONS)[number]["key"];

const KEYS = new Set<string>(VARIANCE_REASONS.map((r) => r.key));

export function isVarianceReasonKey(v: unknown): v is VarianceReasonKey {
  return typeof v === "string" && KEYS.has(v);
}

/** 保存値を安全な配列にする。項目が無い既存データ(undefined/null)は「理由未選択」= []。 */
export function normalizeVarianceReasons(v: unknown): VarianceReasonKey[] {
  if (!Array.isArray(v)) return [];
  const out: VarianceReasonKey[] = [];
  for (const k of v) if (isVarianceReasonKey(k) && !out.includes(k)) out.push(k);
  return out;
}

export function toggleVarianceReason(
  current: readonly string[] | null | undefined,
  key: VarianceReasonKey
): VarianceReasonKey[] {
  const list = normalizeVarianceReasons(current);
  const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  // 表示順を固定の並びに揃える（保存順の差で集計が割れないように）
  return VARIANCE_REASONS.map((r) => r.key).filter((k) => next.includes(k));
}

/** 実績行に variance_reasons を保証する（列が無い既存データ・未マイグレーションDBでも「未選択」として扱う） */
export function withReasons<T extends object>(row: T): T & { variance_reasons: string[] } {
  return { ...row, variance_reasons: normalizeVarianceReasons((row as { variance_reasons?: unknown }).variance_reasons) };
}
