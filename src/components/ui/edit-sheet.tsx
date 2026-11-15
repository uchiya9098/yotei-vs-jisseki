"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * 予定・実績の編集用シート。行の中に入力欄を展開しないので、編集を始めても一覧の高さが変わらない。
 * - スマホは画面の上寄せ、PCは中央に表示（キーボードが出ても入力欄が隠れにくい）。
 * - 中身が長ければシート内でスクロールできる（内容は切り詰めない）。
 * - 開くとき、[data-autofocus] の要素（無ければ最初の入力欄）へ、ページをスクロールさせずにフォーカス。
 * - Esc / 背景タップで閉じる。閉じたら、開く前にフォーカスしていた要素へ戻す。
 * - 親要素の transform（ドラッグ中の行など）の影響を受けないよう、body 直下へ描画する。
 */
export default function EditSheet({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const target =
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button");
    target?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-ink/30 p-3 pt-[8vh] sm:items-center sm:pt-3"
      onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-card border border-line bg-white p-4 shadow-xl animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-ink/70">{title}</h3>
          <button onClick={() => onCloseRef.current()} aria-label="閉じる" className="text-ink/40 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
