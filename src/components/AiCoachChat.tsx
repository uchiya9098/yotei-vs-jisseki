"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, AlertTriangle, RotateCw, X } from "lucide-react";
import type { ReflectionMessage } from "@/types/database";
import { cn } from "@/lib/utils";

type Props = {
  messages: ReflectionMessage[];
  summary: string | null;
  isLoading: boolean;
  error?: { message: string; hint?: string; retry: () => void } | null;
  onDismissError?: () => void;
  hasDiffData: boolean;
  onStartReflection: () => void; // 差分データを元にAIが最初の問いかけを生成
  onSendMessage: (text: string) => void;
};

export default function AiCoachChat({
  messages,
  summary,
  isLoading,
  error,
  onDismissError,
  hasDiffData,
  onStartReflection,
  onSendMessage
}: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <section className="flex h-[520px] flex-col rounded-card border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-plan" />
        <h2 className="font-display text-sm font-bold text-ink/70">AIコーチング</h2>
      </div>

      <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-xs text-ink/40">
              {hasDiffData
                ? "今日の実績（時間やメモ）をもとに、AIが振り返りの質問を投げかけます。"
                : "実績を1件記録すると、AIとの振り返りを始められます。"}
            </p>
            <button
              onClick={onStartReflection}
              disabled={!hasDiffData || isLoading}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold text-white transition",
                hasDiffData ? "bg-plan hover:opacity-90" : "cursor-not-allowed bg-ink/20"
              )}
            >
              {isLoading ? "考え中..." : "振り返りを始める"}
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-plan text-white"
                  : "bg-paper text-ink border border-line"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isLoading && messages.length > 0 && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-line bg-paper px-3 py-2 text-sm text-ink/40">
              考え中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-over/30 bg-over/5 px-3 py-2 text-xs text-over">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{error.message}</p>
              {error.hint && <p className="mt-0.5 text-[11px] opacity-80">{error.hint}</p>}
              <button
                onClick={error.retry}
                disabled={isLoading}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-over/40 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-over/10 disabled:opacity-40"
              >
                <RotateCw size={11} /> もう一度送る
              </button>
            </div>
            {onDismissError && (
              <button onClick={onDismissError} aria-label="閉じる" className="opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {summary && (
        <div className="mt-3 rounded-lg bg-plan/5 px-3 py-2 text-[11px] text-plan">
          <strong>要約:</strong> {summary}
        </div>
      )}

      {messages.length > 0 && (
        <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="AIへの回答を入力..."
            disabled={isLoading}
            className="flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-plan"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center rounded-full bg-plan p-2.5 text-white transition hover:opacity-90 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      )}
    </section>
  );
}
