"use client";

import { useState } from "react";
import { Check, Copy, Download, FileDown, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ActualLog, ReflectionMessage, Task } from "@/types/database";
import {
  addDays,
  buildTaskDiffs,
  cn,
  formatFullDateLabel,
  formatMinutes,
  getDateKeysInRange,
  toDateKey
} from "@/lib/utils";

const MAX_RANGE_DAYS = 7;

// Markdownテーブルを壊さないよう、パイプ・改行をエスケープ/除去する
function sanitizeForTable(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export default function MarkdownExportDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => toDateKey(addDays(new Date(), -6)));
  const [endDate, setEndDate] = useState(() => toDateKey(new Date()));
  const [working, setWorking] = useState<"download" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeDays =
    Math.round(
      (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1;
  const isRangeValid = rangeDays >= 1 && rangeDays <= MAX_RANGE_DAYS;

  const buildMarkdown = async (): Promise<string | null> => {
    if (!isRangeValid) {
      setError(
        rangeDays < 1
          ? "終了日は開始日以降の日付を選んでください。"
          : `期間は最大${MAX_RANGE_DAYS}日間までです。`
      );
      return null;
    }
    setError(null);

    const supabase = createClient();
    const [{ data: taskData }, { data: actualData }, { data: reflectionData }] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate),
      supabase
        .from("actual_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate),
      supabase
        .from("ai_reflections")
        .select("date, messages")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
    ]);

    const tasks: Task[] = taskData ?? [];
    const actuals: ActualLog[] = actualData ?? [];
    const reflectionsByDate = new Map<string, ReflectionMessage[]>();
    for (const r of (reflectionData ?? []) as { date: string; messages: ReflectionMessage[] }[]) {
      reflectionsByDate.set(r.date, r.messages ?? []);
    }

    const dateKeys = getDateKeysInRange(startDate, endDate);

    const lines: string[] = [];
    lines.push(
      `# 【期間】${formatFullDateLabel(startDate)} 〜 ${formatFullDateLabel(endDate)} 行動分析データ`
    );
    lines.push("");

    for (const dateKey of dateKeys) {
      const dayTasks = tasks.filter((t) => t.date === dateKey);
      const dayActuals = actuals.filter((a) => a.date === dateKey);
      const dayDiffs = buildTaskDiffs(dayTasks, dayActuals);

      lines.push(`## ${formatFullDateLabel(dateKey)}`);
      lines.push("");

      // --- 集計サマリー ---
      const completed = dayTasks.filter((t) => t.is_completed).length;
      const achievementRate =
        dayTasks.length > 0 ? Math.round((completed / dayTasks.length) * 100) : null;
      const withDiff = dayDiffs.filter((d) => d.diffMinutes !== null);
      const totalOver = withDiff.reduce((sum, d) => sum + Math.max(0, d.diffMinutes ?? 0), 0);
      const totalUnder = withDiff.reduce((sum, d) => sum + Math.min(0, d.diffMinutes ?? 0), 0);

      lines.push("### 集計サマリー");
      lines.push(`- 達成率: ${achievementRate !== null ? `${achievementRate}%` : "―"}`);
      lines.push(`- 超過合計: +${formatMinutes(totalOver)}`);
      lines.push(`- 短縮合計: ${formatMinutes(totalUnder)}`);
      lines.push("");

      // --- タスク一覧（予定 vs 実績） ---
      lines.push("### タスク一覧（予定 vs 実績）");
      if (dayDiffs.length === 0) {
        lines.push("記録なし");
      } else {
        lines.push("| タスク名 | 予定時間 | 実績時間 | 差分 | メモ |");
        lines.push("|---|---|---|---|---|");
        for (const d of dayDiffs) {
          const name = sanitizeForTable(d.task?.title ?? d.actual?.title ?? "(不明)");
          const estimated = d.task?.estimated_minutes ?? null;
          const actualMin = d.actual?.actual_minutes ?? null;
          const diffText =
            d.diffMinutes !== null
              ? `${d.diffMinutes > 0 ? "+" : ""}${formatMinutes(d.diffMinutes)}`
              : "―";
          const memo = sanitizeForTable(d.actual?.memo ?? "");
          lines.push(
            `| ${name} | ${formatMinutes(estimated)} | ${formatMinutes(actualMin)} | ${diffText} | ${memo} |`
          );
        }
      }
      lines.push("");

      // --- AIコーチング・振り返り ---
      lines.push("### 当日のAIコーチング・振り返り");
      const messages = reflectionsByDate.get(dateKey) ?? [];
      if (messages.length === 0) {
        lines.push("記録なし");
      } else {
        for (const m of messages) {
          const speaker = m.role === "user" ? "ユーザー" : "AI";
          lines.push(`- **${speaker}**: ${sanitizeForTable(m.content)}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n").trim() + "\n";
  };

  const handleDownload = async () => {
    setWorking("download");
    try {
      const markdown = await buildMarkdown();
      if (!markdown) return;
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `行動分析データ_${startDate}_${endDate}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setWorking(null);
    }
  };

  const handleCopy = async () => {
    setWorking("copy");
    try {
      const markdown = await buildMarkdown();
      if (!markdown) return;
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink/60 transition hover:bg-white hover:text-ink"
      >
        <FileDown size={14} />
        Markdown出力
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-card border border-line bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-ink">Markdown出力</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="rounded-full p-1.5 text-ink/40 transition hover:bg-paper hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mb-4 text-xs text-ink/50">
              指定した期間（最大{MAX_RANGE_DAYS}日間）の予定・実績・AI振り返りをMarkdownにまとめます。NotebookLMなど外部AIツールへの取り込みにご利用ください。
            </p>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-ink/50">開始日</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-plan"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-ink/50">終了日</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-lg border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-plan"
                />
              </label>
            </div>

            <p className={cn("mb-4 text-[11px]", isRangeValid ? "text-ink/40" : "text-over")}>
              {error ?? `${rangeDays >= 1 ? rangeDays : 0}日間を出力します（1〜${MAX_RANGE_DAYS}日間）`}
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                disabled={!isRangeValid || working !== null}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition",
                  !isRangeValid || working !== null
                    ? "cursor-not-allowed bg-ink/20"
                    : "bg-plan hover:opacity-90"
                )}
              >
                <Download size={14} />
                {working === "download" ? "生成中..." : "ダウンロード（.md）"}
              </button>
              <button
                onClick={handleCopy}
                disabled={!isRangeValid || working !== null}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  !isRangeValid || working !== null
                    ? "cursor-not-allowed border-line text-ink/25"
                    : "border-plan/40 text-plan hover:bg-plan/10"
                )}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {working === "copy" ? "生成中..." : copied ? "コピーしました" : "クリップボードにコピー"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
