"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Lightbulb } from "lucide-react";
import type { WeeklyInsights as Insights } from "@/lib/weekly-insights";
import { MIN_ACTUALS_FOR_TRENDS, MIN_COMPARED_FOR_TRENDS } from "@/lib/weekly-insights";
import { cn, formatMinutes } from "@/lib/utils";

const signed = (m: number) => `${m > 0 ? "+" : ""}${formatMinutes(m)}`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-white p-4">
      <h2 className="mb-2.5 font-display text-sm font-bold text-ink/70">{title}</h2>
      {children}
    </div>
  );
}

export default function WeeklyInsights({ insights: i }: { insights: Insights }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* クリップボード不可の環境では何もしない（テキストは画面に表示済み） */
    }
  };

  const maxCount = Math.max(1, ...i.reasonCounts.map((r) => r.count));
  const canCopy = i.suggestions.some((s) => s.id !== "record-more");

  return (
    <>
      {/* 1. 記録された理由（本人が選んだもの） */}
      <Card title="記録されたズレの理由">
        {i.totalActuals === 0 ? (
          <p className="rounded-lg bg-paper px-3 py-4 text-center text-xs text-ink/40">
            この週の実績がありません
          </p>
        ) : (
          <>
            {i.reasonCounts.length === 0 ? (
              <p className="rounded-lg bg-paper px-3 py-4 text-center text-xs text-ink/40">
                この週は、理由が記録された実績がありません
              </p>
            ) : (
              <ul className="space-y-2">
                {i.reasonCounts.map((r) => (
                  <li key={r.key}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-ink/80">{r.label}</span>
                      <span className="shrink-0 font-semibold text-actual">{r.count}件</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-paper">
                      <div
                        className="h-1.5 rounded-full bg-actual/60"
                        style={{ width: `${(r.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-center justify-between rounded-lg bg-paper px-3 py-2 text-xs text-ink/50">
              <span>理由未記録</span>
              <span className="font-semibold">
                {i.actualsWithoutReason}件 / 実績全{i.totalActuals}件
              </span>
            </p>
            <p className="mt-1.5 text-[10px] text-ink/40">
              複数の理由を選んだ実績は、それぞれの理由に1件ずつ数えています。
            </p>
          </>
        )}
      </Card>

      {/* 2. 予定とのズレの傾向（記録された時間差分のみ） */}
      <Card title="予定とのズレの傾向">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink/60">差分を比べられた予定</dt>
            <dd className="font-semibold text-ink">{i.comparedCount}件</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink/60">実績が未記録の予定</dt>
            <dd className="text-right font-semibold text-ink">
              {i.unrecordedTaskCount}件
              {i.unrecordedCompletedCount > 0 && (
                <span className="block text-[10px] font-normal text-ink/40">
                  うち完了チェック済み {i.unrecordedCompletedCount}件
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink/60">予定外に使った時間</dt>
            <dd className="text-right font-semibold text-ink">
              {i.unplannedWithTime > 0 ? formatMinutes(i.unplannedMinutes) : "―"}
              <span className="block text-[10px] font-normal text-ink/40">
                時間が記録された{i.unplannedWithTime}件ぶん
                {i.unplannedWithoutTime > 0 && `（時間未入力${i.unplannedWithoutTime}件は含まず）`}
              </span>
            </dd>
          </div>
        </dl>

        {!i.hasEnoughForTrends ? (
          <p className="mt-3 rounded-lg bg-paper px-3 py-3 text-xs text-ink/50">
            記録が少ないため、活動や曜日ごとの傾向はまだ表示しません（実績{MIN_ACTUALS_FOR_TRENDS}件以上、差分を比べられた予定{MIN_COMPARED_FOR_TRENDS}件以上で表示）。
          </p>
        ) : (
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            {i.overActivities.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold text-over">予定より長かった活動</p>
                <ul className="space-y-0.5 text-sm">
                  {i.overActivities.map((a) => (
                    <li key={a.title} className="flex justify-between gap-2">
                      <span className="truncate text-ink/80">
                        {a.title} <span className="text-[10px] text-ink/40">{a.count}件</span>
                      </span>
                      <span className="shrink-0 font-semibold text-over">{signed(a.diffMinutes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {i.underActivities.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold text-under">予定より短かった活動</p>
                <ul className="space-y-0.5 text-sm">
                  {i.underActivities.map((a) => (
                    <li key={a.title} className="flex justify-between gap-2">
                      <span className="truncate text-ink/80">
                        {a.title} <span className="text-[10px] text-ink/40">{a.count}件</span>
                      </span>
                      <span className="shrink-0 font-semibold text-under">{signed(a.diffMinutes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(i.overWeekday || i.underWeekday) && (
              <div>
                <p className="mb-1 text-[11px] font-semibold text-ink/50">曜日ごとの差分（予定の日付ベース）</p>
                <ul className="space-y-0.5 text-sm">
                  {i.overWeekday && (
                    <li className="flex justify-between gap-2">
                      <span className="text-ink/80">
                        {i.overWeekday.label} <span className="text-[10px] text-ink/40">{i.overWeekday.count}件</span>
                      </span>
                      <span className="font-semibold text-over">{signed(i.overWeekday.diffMinutes)}</span>
                    </li>
                  )}
                  {i.underWeekday && (
                    <li className="flex justify-between gap-2">
                      <span className="text-ink/80">
                        {i.underWeekday.label} <span className="text-[10px] text-ink/40">{i.underWeekday.count}件</span>
                      </span>
                      <span className="font-semibold text-under">{signed(i.underWeekday.diffMinutes)}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}
            {i.overActivities.length === 0 && i.underActivities.length === 0 && (
              <p className="text-xs text-ink/40">この週は予定との差が出た活動はありませんでした。</p>
            )}
          </div>
        )}
      </Card>

      {/* 3. 次週に試す小さな工夫（集計に基づく案。自動では予定に追加しない） */}
      <Card title="次週に試す小さな工夫">
        {i.suggestions.length === 0 ? (
          <p className="rounded-lg bg-paper px-3 py-4 text-center text-xs text-ink/40">
            この週の記録からは、特に提案はありません
          </p>
        ) : (
          <ul className="space-y-2">
            {i.suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-line bg-paper px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <Lightbulb size={14} className="mt-0.5 shrink-0 text-plan" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-ink/80">{s.text}</p>
                    <p className="mt-1 text-[10px] text-ink/40">根拠: {s.basis}</p>
                  </div>
                  {s.id !== "record-more" && (
                    <button
                      onClick={() => copy(s.id, s.text)}
                      aria-label="この工夫をコピー"
                      className={cn(
                        "shrink-0 rounded-full p-1.5 transition",
                        copied === s.id ? "text-under" : "text-ink/30 hover:text-plan"
                      )}
                    >
                      {copied === s.id ? <Check size={14} /> : <ClipboardCopy size={14} />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canCopy && (
          <p className="mt-2 text-[10px] text-ink/40">
            これは記録された件数・時間にもとづく案で、原因を断定するものではありません。気になるものをコピーして、次週の予定に自分で追加してください。
          </p>
        )}
      </Card>
    </>
  );
}
