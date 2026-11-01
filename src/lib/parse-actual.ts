// AI一言入力の候補データの型と、AI出力の検証・正規化（サーバー/クライアント共用の純粋関数）

export const ACTUAL_CATEGORIES = [
  "仕事", "学習", "家事", "運動", "休憩", "移動", "食事", "趣味", "その他"
] as const;

export type ActualCandidate = {
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm or ""
  end_time: string; // HH:mm or ""
  duration_minutes: number | null; // 時刻が無い場合の所要時間（「2時間」など）
  category: string; // 表示用ラベル（DBには保存しない）
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normTime(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normDate(v: unknown, fallback: string): string {
  if (typeof v !== "string" || !DATE_RE.test(v.trim())) return fallback;
  const [y, m, d] = v.trim().split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  // 2/30 のような不正日付は fallback
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return fallback;
  return v.trim();
}

/** AIの生出力(JSON文字列 or オブジェクト)を安全な候補配列にする。壊れていれば空配列。 */
export function normalizeCandidates(raw: unknown, fallbackDate: string): ActualCandidate[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      data = JSON.parse(cleaned);
    } catch {
      return [];
    }
  }
  if (data && !Array.isArray(data) && typeof data === "object") {
    const o = data as Record<string, unknown>;
    data = o.actuals ?? o.items ?? o.candidates ?? [data];
  }
  if (!Array.isArray(data)) return [];

  const out: ActualCandidate[] = [];
  for (const item of data.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title.trim().slice(0, 100) : "";
    if (!title) continue;
    const dur = Number(r.duration_minutes);
    const cat = String(r.category ?? r.category_id ?? r.type ?? "").trim();
    out.push({
      title,
      date: normDate(r.date, fallbackDate),
      start_time: normTime(r.start_time),
      end_time: normTime(r.end_time),
      duration_minutes: Number.isFinite(dur) && dur > 0 && dur <= 24 * 60 ? Math.round(dur) : null,
      category: cat.slice(0, 20) || "その他"
    });
  }
  return out;
}
