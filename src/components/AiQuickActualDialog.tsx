"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Mic, MicOff, Sparkles, Trash2, X } from "lucide-react";
import type { ActualCandidate } from "@/lib/parse-actual";
import { cn, toDateKey } from "@/lib/utils";

type Card = ActualCandidate & { id: number; selected: boolean; saved: boolean };

type Props = {
  /** 候補を実績として保存する。全件成功なら true */
  onRegister: (items: ActualCandidate[]) => Promise<boolean>;
};

const EXAMPLES = ["今日は15時から17時までプログラミングの勉強をした", "午前中は面接対策の準備を2時間やった"];

// Web Speech API（Chrome/Edge/Safari系。未対応ブラウザではマイクボタンを隠す）
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
function createRecognition(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec: SpeechRec = new Ctor();
  rec.lang = "ja-JP";
  rec.interimResults = true;
  rec.continuous = true;
  return rec;
}

export default function AiQuickActualDialog({ onRegister }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const [micSupported, setMicSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const baseTextRef = useRef("");
  const idRef = useRef(0);

  useEffect(() => {
    setMicSupported(
      typeof window !== "undefined" &&
        !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  }, []);

  const stopMic = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  useEffect(() => () => recRef.current?.stop(), []);

  const toggleMic = () => {
    if (listening) return stopMic();
    const rec = createRecognition();
    if (!rec) return;
    baseTextRef.current = text ? text.replace(/\s*$/, " ") : "";
    rec.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(baseTextRef.current + t);
    };
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === "not-allowed" || code === "service-not-allowed")
        setError({ message: "マイクが許可されていません", hint: "ブラウザのマイク許可を確認してください。テキスト入力でも使えます。" });
      else if (code !== "no-speech" && code !== "aborted")
        setError({ message: "音声入力でエラーが発生しました", hint: "テキストで入力してください。" });
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const close = () => {
    stopMic();
    setOpen(false);
  };

  const reset = () => {
    setText("");
    setCards([]);
    setError(null);
    setDone(null);
  };

  const analyze = async () => {
    if (!text.trim() || parsing) return;
    stopMic();
    setParsing(true);
    setError(null);
    setDone(null);
    const now = new Date();
    try {
      const res = await fetch("/api/ai-parse-actual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          today: toDateKey(now),
          nowTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
        })
      });
      let json: any = {};
      try {
        json = await res.json();
      } catch {
        /* 非JSON */
      }
      if (!res.ok || !Array.isArray(json.candidates)) {
        console.error("[ai-parse-actual] APIエラー", res.status, json);
        setError({ message: json.error ?? `サーバーエラー (${res.status})`, hint: json.hint });
        return;
      }
      setCards(
        (json.candidates as ActualCandidate[]).map((c) => ({
          ...c,
          id: ++idRef.current,
          selected: true,
          saved: false
        }))
      );
    } catch (e) {
      console.error("[ai-parse-actual] 通信エラー", e);
      setError({ message: "通信エラー", hint: "ネットワーク接続を確認して、もう一度お試しください。" });
    } finally {
      setParsing(false);
    }
  };

  const patchCard = (id: number, patch: Partial<Card>) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const register = async (targets: Card[]) => {
    const valid = targets.filter((c) => c.title.trim() && !c.saved);
    if (valid.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const ok = await onRegister(
      valid.map(({ id, selected, saved, ...c }) => ({ ...c, title: c.title.trim() }))
    );
    setSaving(false);
    if (!ok) {
      setError({ message: "登録に失敗しました", hint: "時間をおいてもう一度お試しください。" });
      return;
    }
    const ids = new Set(valid.map((c) => c.id));
    setCards((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, saved: true } : c)));
    setDone(`${valid.length}件を実績に登録しました`);
  };

  const pending = cards.filter((c) => !c.saved);
  const selected = pending.filter((c) => c.selected);
  const allSaved = cards.length > 0 && pending.length === 0;

  const fieldCls =
    "rounded-lg border border-line bg-paper px-2 py-1 text-xs outline-none focus:border-actual";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-actual/40 bg-actual/10 px-3 py-1 text-xs font-semibold text-actual transition hover:bg-actual/20"
      >
        <Sparkles size={13} /> AI一言入力
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[1px]"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div
            role="dialog"
            aria-label="AI一言入力"
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-card border border-line bg-white p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink/70">
                <Sparkles size={15} className="text-actual" /> AI一言実績レコーダー
              </h3>
              <button onClick={close} aria-label="閉じる" className="text-ink/40 hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto pr-1">
              <div>
                <div className="relative">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        analyze();
                      }
                    }}
                    rows={3}
                    maxLength={1000}
                    placeholder="例: 今日は15時から17時までプログラミングの勉強をした"
                    className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 pr-11 text-sm outline-none focus:border-actual"
                  />
                  {micSupported && (
                    <button
                      type="button"
                      onClick={toggleMic}
                      aria-label={listening ? "音声入力を止める" : "音声で入力"}
                      className={cn(
                        "absolute right-2 top-2 rounded-full p-1.5 transition",
                        listening ? "animate-pulse bg-over text-white" : "bg-white text-ink/50 hover:text-actual"
                      )}
                    >
                      {listening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setText(ex)}
                      className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/50 hover:bg-paper"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-ink/40">
                    {listening ? "聞き取り中…" : "Ctrl/⌘+Enter で解析"}
                  </span>
                  <button
                    type="button"
                    onClick={analyze}
                    disabled={!text.trim() || parsing}
                    className="flex items-center gap-1 rounded-full bg-actual px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {parsing ? "解析中..." : "解析する"}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-over/30 bg-over/5 px-3 py-2 text-xs text-over">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">{error.message}</p>
                      {error.hint && <p className="mt-0.5 text-[11px] opacity-80">{error.hint}</p>}
                    </div>
                  </div>
                </div>
              )}

              {cards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-ink/50">
                    実績候補（内容は直接編集できます）
                  </p>
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-lg border p-2.5 transition",
                        c.saved
                          ? "border-under/30 bg-under/5"
                          : c.selected
                          ? "border-actual/40 bg-white"
                          : "border-line bg-paper opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {c.saved ? (
                          <Check size={16} className="shrink-0 text-under" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={c.selected}
                            onChange={(e) => patchCard(c.id, { selected: e.target.checked })}
                            aria-label="登録対象にする"
                            className="h-4 w-4 shrink-0 accent-actual"
                          />
                        )}
                        <input
                          value={c.title}
                          disabled={c.saved}
                          onChange={(e) => patchCard(c.id, { title: e.target.value })}
                          className={cn(fieldCls, "min-w-0 flex-1 text-sm font-semibold")}
                          aria-label="タイトル"
                        />
                        <span className="shrink-0 rounded-full bg-actual/10 px-2 py-0.5 text-[10px] text-actual">
                          {c.category}
                        </span>
                        {!c.saved && (
                          <button
                            onClick={() => setCards((prev) => prev.filter((x) => x.id !== c.id))}
                            aria-label="この候補を削除"
                            className="shrink-0 text-ink/30 hover:text-over"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6 text-xs text-ink/60">
                        <input
                          type="date"
                          value={c.date}
                          disabled={c.saved}
                          onChange={(e) => e.target.value && patchCard(c.id, { date: e.target.value })}
                          className={fieldCls}
                          aria-label="日付"
                        />
                        <input
                          type="time"
                          value={c.start_time}
                          disabled={c.saved}
                          onChange={(e) => patchCard(c.id, { start_time: e.target.value })}
                          className={fieldCls}
                          aria-label="開始時間"
                        />
                        <span>〜</span>
                        <input
                          type="time"
                          value={c.end_time}
                          disabled={c.saved}
                          onChange={(e) => patchCard(c.id, { end_time: e.target.value })}
                          className={fieldCls}
                          aria-label="終了時間"
                        />
                        {!c.start_time && !c.end_time && (
                          <label className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={1440}
                              value={c.duration_minutes ?? ""}
                              disabled={c.saved}
                              onChange={(e) =>
                                patchCard(c.id, {
                                  duration_minutes: e.target.value ? Number(e.target.value) : null
                                })
                              }
                              className={cn(fieldCls, "w-16")}
                              aria-label="所要時間（分）"
                            />
                            分
                          </label>
                        )}
                        {!c.saved && (
                          <button
                            onClick={() => register([c])}
                            disabled={saving || !c.title.trim()}
                            className="ml-auto rounded-full border border-actual/40 px-2.5 py-0.5 text-[11px] font-semibold text-actual hover:bg-actual/10 disabled:opacity-40"
                          >
                            この1件を登録
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {done && (
                <p className="rounded-lg bg-under/10 px-3 py-2 text-xs font-semibold text-under">{done}</p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={reset}
                className="text-xs text-ink/50 hover:text-ink"
              >
                クリア
              </button>
              {allSaved ? (
                <button
                  onClick={close}
                  className="rounded-full bg-actual px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  閉じる
                </button>
              ) : (
                <button
                  onClick={() => register(selected)}
                  disabled={saving || selected.length === 0}
                  className="flex items-center gap-1 rounded-full bg-actual px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  この内容で登録する{selected.length > 0 ? `（${selected.length}件）` : ""}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
