"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ActualLog, AiPeriodSummary, PeriodMode, Task } from "@/types/database";
import {
  addDays,
  addMonths,
  buildTaskDiffs,
  cn,
  formatDateRangeLabel,
  formatDayLabel,
  formatMinutes,
  getRangeForMode,
  rangeIncludesToday,
  toDateKey
} from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import MarkdownExportDialog from "@/components/MarkdownExportDialog";

export default function SummaryDashboard({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);

  // mode: 週表示 or 月表示。anchorDate: 表示中の期間に含まれる任意の日付。
  // この2つから range（開始日・終了日）を都度計算し、±7日 / ±1ヶ月 で
  // 過去・未来へ自由に移動できるようにしている。
  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const range = useMemo(() => getRangeForMode(mode, anchorDate), [mode, anchorDate]);
  const rangeStartKey = toDateKey(range.start);
  const rangeEndKey = toDateKey(range.end);
  const isCurrentPeriod = useMemo(() => rangeIncludesToday(range.start, range.end), [range]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [actuals, setActuals] = useState<ActualLog[]>([]);
  const [reflectionTexts, setReflectionTexts] = useState<string[]>([]);
  const [savedSummary, setSavedSummary] = useState<AiPeriodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: taskData }, { data: actualData }, { data: reflectionData }, { data: summaryData }] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .gte("date", rangeStartKey)
          .lte("date", rangeEndKey),
        supabase
          .from("actual_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", rangeStartKey)
          .lte("date", rangeEndKey),
        supabase
          .from("ai_reflections")
          .select("date, messages")
          .eq("user_id", userId)
          .gte("date", rangeStartKey)
          .lte("date", rangeEndKey),
        supabase
          .from("ai_period_summaries")
          .select("*")
          .eq("user_id", userId)
          .eq("period_type", mode)
          .eq("period_start", rangeStartKey)
          .eq("period_end", rangeEndKey)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

    setTasks(taskData ?? []);
    setActuals(actualData ?? []);
    setReflectionTexts(
      (reflectionData ?? []).map(
        (r: { date: string; messages: { role: string; content: string }[] }) =>
          `[${r.date}] ` +
          r.messages.map((m) => `${m.role === "user" ? "ユーザー" : "AI"}: ${m.content}`).join(" / ")
      )
    );
    setSavedSummary(summaryData ?? null);
    setLoading(false);
  }, [supabase, userId, mode, rangeStartKey, rangeEndKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const diffs = useMemo(() => buildTaskDiffs(tasks, actuals), [tasks, actuals]);

  const stats = useMemo(() => {
    const totalActualMinutes = actuals.reduce((sum, a) => sum + (a.actual_minutes ?? 0), 0);
    const completed = tasks.filter((t) => t.is_completed).length;
    const achievementRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
    const withDiff = diffs.filter((d) => d.diffMinutes !== null);
    const totalOver = withDiff.reduce((sum, d) => sum + Math.max(0, d.diffMinutes ?? 0), 0);
    const totalUnder = withDiff.reduce((sum, d) => sum + Math.min(0, d.diffMinutes ?? 0), 0);
    return { totalActualMinutes, achievementRate, totalOver, totalUnder };
  }, [tasks, actuals, diffs]);

  // 日別の実績時間集計（簡易ブレークダウン表示用）
  const dailyBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of actuals) {
      map.set(a.date, (map.get(a.date) ?? 0) + (a.actual_minutes ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [actuals]);

  // 期間内の実績一覧（週表示の時だけ表示。過去の週を遡っていても表示する）
  const showActualList = mode === "week";
  const groupedActuals = useMemo(() => {
    const map = new Map<string, ActualLog[]>();
    for (const a of actuals) {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, logs]) => ({
        date,
        logs: [...logs].sort((x, y) => (x.start_time ?? "").localeCompare(y.start_time ?? ""))
      }));
  }, [actuals]);

  // --------------------------------------------------------
  // 期間ナビゲーション
  // --------------------------------------------------------
  const goPrev = () => setAnchorDate((d) => (mode === "week" ? addDays(d, -7) : addMonths(d, -1)));
  const goNext = () => setAnchorDate((d) => (mode === "week" ? addDays(d, 7) : addMonths(d, 1)));
  const goToday = () => setAnchorDate(new Date());

  const selectMode = (nextMode: PeriodMode) => {
    setMode(nextMode);
    setAnchorDate(new Date());
  };

  const generateSummary = async () => {
    setGenerating(true);
    try {
      const diffLines = diffs
        .filter((d) => d.task || d.actual)
        .map((d) => {
          const title = d.task?.title ?? d.actual?.title ?? "(不明)";
          const date = d.task?.date ?? d.actual?.date ?? "";
          const diffText = d.diffMinutes !== null ? formatMinutes(d.diffMinutes) : "データ不足";
          return `[${date}] ${title}: 差分${diffText}${d.actual?.memo ? ` / メモ: ${d.actual.memo}` : ""}`;
        })
        .join("\n");

      const aggregatedContext = `## 集計サマリー
- 達成率: ${stats.achievementRate}%
- 実績合計時間: ${formatMinutes(stats.totalActualMinutes)}
- 超過合計: +${formatMinutes(stats.totalOver)}
- 短縮合計: ${formatMinutes(stats.totalUnder)}

## タスク別の差分
${diffLines || "（データなし）"}

## 日々のAI振り返り対話ログ
${reflectionTexts.join("\n") || "（振り返り対話なし）"}`;

      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: `${mode === "week" ? "週間" : "月間"}（${formatDateRangeLabel(range.start, range.end)}）`,
          aggregatedContext
        })
      });
      const json = await res.json();
      const summaryText: string = json.summary ?? "分析結果を生成できませんでした。";

      const { data } = await supabase
        .from("ai_period_summaries")
        .insert({
          user_id: userId,
          period_type: mode,
          period_start: rangeStartKey,
          period_end: rangeEndKey,
          summary: summaryText
        })
        .select()
        .single();

      if (data) setSavedSummary(data);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <Link
          href="/"
          className="flex items-center gap-1 rounded-full p-2 text-ink/60 transition hover:bg-white"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-display text-sm font-bold text-ink">週次・月次サマリー</h1>
        <div className="ml-auto">
          <MarkdownExportDialog userId={userId} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {/* 週/月 切り替えタブ */}
        <div className="flex gap-1 rounded-full border border-line bg-white p-1">
          {(
            [
              { key: "week", label: "週表示" },
              { key: "month", label: "月表示" }
            ] as { key: PeriodMode; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => selectMode(tab.key)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition",
                mode === tab.key ? "bg-plan text-white" : "text-ink/50 hover:bg-paper"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 期間ナビゲーション：前へ/カレンダー/次へ + 今日に戻る */}
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={goPrev}
            aria-label={mode === "week" ? "前週" : "前月"}
            className="rounded-full p-2 text-ink/50 transition hover:bg-white"
          >
            <ChevronLeft size={18} />
          </button>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink hover:bg-white">
                {formatDateRangeLabel(range.start, range.end)}
                <CalendarDays size={14} className="text-ink/40" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="center">
              <Calendar
                mode="single"
                selected={anchorDate}
                defaultMonth={anchorDate}
                onSelect={(date) => {
                  if (!date) return;
                  setAnchorDate(date);
                  setCalendarOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>

          <button
            onClick={goNext}
            aria-label={mode === "week" ? "次週" : "次月"}
            className="rounded-full p-2 text-ink/50 transition hover:bg-white"
          >
            <ChevronRight size={18} />
          </button>

          {!isCurrentPeriod && (
            <button
              onClick={goToday}
              className="ml-1 rounded-full px-2.5 py-1 text-xs font-semibold text-plan hover:bg-white"
            >
              {mode === "week" ? "今週に戻る" : "今月に戻る"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-ink/30">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : (
          <>
            {/* 集計カード */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-card border border-line bg-white px-2 py-4 text-center">
                <p className="text-xl font-bold text-plan">{stats.achievementRate}%</p>
                <p className="mt-1 text-[10px] text-ink/50">達成率</p>
              </div>
              <div className="rounded-card border border-line bg-white px-2 py-4 text-center">
                <p className="text-xl font-bold text-ink">{formatMinutes(stats.totalActualMinutes)}</p>
                <p className="mt-1 text-[10px] text-ink/50">総実績時間</p>
              </div>
              <div className="rounded-card border border-line bg-white px-2 py-4 text-center">
                <p className="text-xl font-bold text-over">+{formatMinutes(stats.totalOver)}</p>
                <p className="mt-1 text-[10px] text-ink/50">超過合計</p>
                <p className="mt-0.5 text-[10px] text-under">{formatMinutes(stats.totalUnder)} 短縮</p>
              </div>
            </div>

            {/* 日別ブレークダウン */}
            {dailyBreakdown.length > 0 && (
              <div className="rounded-card border border-line bg-white p-4">
                <h2 className="mb-2 font-display text-sm font-bold text-ink/70">日別の実績時間</h2>
                <ul className="space-y-1">
                  {dailyBreakdown.map(([date, minutes]) => (
                    <li key={date} className="flex items-center justify-between text-sm">
                      <span className="text-ink/60">{formatDayLabel(date)}</span>
                      <span className="font-semibold text-ink">{formatMinutes(minutes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 期間内の実績一覧（週表示のみ） */}
            {showActualList && (
              <div className="rounded-card border border-line bg-white p-4">
                <h2 className="mb-2 font-display text-sm font-bold text-ink/70">
                  期間内の実績一覧
                </h2>

                {groupedActuals.length === 0 ? (
                  <p className="rounded-lg bg-paper px-3 py-6 text-center text-xs text-ink/40">
                    この期間の実績はまだありません
                  </p>
                ) : (
                  <div className="space-y-3">
                    {groupedActuals.map(({ date, logs }) => (
                      <div key={date}>
                        <p className="mb-1.5 text-xs font-semibold text-ink/50">
                          {formatDayLabel(date)}
                        </p>
                        <ul className="space-y-1.5">
                          {logs.map((log) => (
                            <li
                              key={log.id}
                              className="rounded-lg border border-line bg-paper px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                  {log.title}
                                </span>
                                <span className="shrink-0 text-xs font-semibold text-actual">
                                  {log.actual_minutes !== null
                                    ? formatMinutes(log.actual_minutes)
                                    : "―"}
                                </span>
                              </div>
                              {(log.start_time || log.end_time) && (
                                <p className="mt-0.5 text-[11px] text-ink/40">
                                  {log.start_time?.slice(0, 5) ?? "―"} 〜{" "}
                                  {log.end_time?.slice(0, 5) ?? "―"}
                                </p>
                              )}
                              {log.memo && (
                                <p className="mt-1 text-[11px] text-ink/50">{log.memo}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI週次・月次サマリー */}
            <div className="rounded-card border border-line bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={16} className="text-plan" />
                <h2 className="font-display text-sm font-bold text-ink/70">AI分析レポート</h2>
              </div>

              {savedSummary ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                  {savedSummary.summary}
                </p>
              ) : (
                <p className="text-xs text-ink/40">
                  この期間のデータをまとめてAIに分析させ、行動傾向と改善アドバイスを生成できます。
                </p>
              )}

              <button
                onClick={generateSummary}
                disabled={generating || (tasks.length === 0 && actuals.length === 0)}
                className={cn(
                  "mt-3 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white transition",
                  generating || (tasks.length === 0 && actuals.length === 0)
                    ? "cursor-not-allowed bg-ink/20"
                    : "bg-plan hover:opacity-90"
                )}
              >
                {generating && <Loader2 size={14} className="animate-spin" />}
                {savedSummary ? "再生成する" : "AI分析を生成"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
