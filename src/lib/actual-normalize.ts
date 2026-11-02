import { withReasons } from "@/lib/variance-reasons";

/**
 * 保存データの実績行を、アプリが期待する形に揃える。
 * - variance_reasons が無い既存データ → 理由未選択 []
 * - time_confirmed が無い／true 以外の既存データ → 未確認（false）。既存の時間は変更しない。
 */
export function normalizeActual<T extends object>(
  row: T
): T & { variance_reasons: string[]; time_confirmed: boolean } {
  const r = withReasons(row);
  return { ...r, time_confirmed: (row as { time_confirmed?: unknown }).time_confirmed === true };
}
