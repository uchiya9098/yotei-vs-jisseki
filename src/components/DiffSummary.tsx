"use client";

import { useMemo } from "react";
import type { TaskDiff } from "@/types/database";
import { formatMinutes, cn } from "@/lib/utils";

type Props = {
  diffs: TaskDiff[];
};

export default function DiffSummary({ diffs }: Props) {
  const stats = useMemo(() => {
    const withBoth = diffs.filter((d) => d.diffMinutes !== null);
    const totalEstimated = withBoth.reduce(
      (sum, d) => sum + (d.task?.estimated_minutes ?? 0),
      0
    );
    const totalOver = withBoth.reduce((sum, d) => sum + Math.max(0, d.diffMinutes ?? 0), 0);
    const totalUnder = withBoth.reduce((sum, d) => sum + Math.min(0, d.diffMinutes ?? 0), 0);
    const completedCount = diffs.filter((d) => d.task?.is_completed).length;
    const achievementRate =
      diffs.filter((d) => d.task).length > 0
        ? Math.round((completedCount / diffs.filter((d) => d.task).length) * 100)
        : 0;

    return { totalOver, totalUnder, achievementRate, comparedCount: withBoth.length };
  }, [diffs]);

  return (
    <section className="rounded-card border border-line bg-white p-4">
      <h2 className="mb-3 font-display text-sm font-bold text-ink/70">本日の集計</h2>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-paper px-2 py-3">
          <p className="text-lg font-bold text-plan">{stats.achievementRate}%</p>
          <p className="text-[10px] text-ink/50">達成率</p>
        </div>
        <div className="rounded-lg bg-over/10 px-2 py-3">
          <p className="text-lg font-bold text-over">+{formatMinutes(stats.totalOver)}</p>
          <p className="text-[10px] text-ink/50">超過合計</p>
        </div>
        <div className="rounded-lg bg-under/10 px-2 py-3">
          <p className="text-lg font-bold text-under">{formatMinutes(stats.totalUnder)}</p>
          <p className="text-[10px] text-ink/50">短縮合計</p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {diffs.length === 0 && (
          <li className="rounded-lg bg-paper px-3 py-6 text-center text-xs text-ink/40">
            予定と実績が揃うとここに差分が出ます
          </li>
        )}
        {diffs.map((d, i) => {
          const label = d.task?.title ?? d.actual?.title ?? "";
          const diff = d.diffMinutes;
          return (
            <li
              key={d.task?.id ?? d.actual?.id ?? i}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="truncate text-ink/80">{label}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                  diff === null && "bg-paper text-ink/30",
                  diff !== null && diff > 0 && "bg-over/10 text-over",
                  diff !== null && diff < 0 && "bg-under/10 text-under",
                  diff === 0 && "bg-plan/10 text-plan"
                )}
              >
                {diff === null ? "―" : diff === 0 ? "予定通り" : `${diff > 0 ? "+" : ""}${formatMinutes(diff)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
