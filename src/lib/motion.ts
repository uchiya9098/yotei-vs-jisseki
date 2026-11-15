// 画面の動きに関するユーティリティ。短く自然な動きにし、「動きを減らす」設定では動きを使わない。

export const MOTION_MS = 150;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 行を「高さ→0」に短くたたんで消す（削除時に、下の項目が一瞬で詰まって見えないようにする）。
 * - 内容を切り詰める固定高さではなく、現在の高さから0へアニメーションし、終わったらReact側で行を取り除く。
 * - finished: 動きが終わったら解決する Promise（動きを減らす設定では即解決）。
 * - restore: 削除に失敗したときに元の見た目へ戻す。
 */
export function collapseOut(el: HTMLElement | null): { finished: Promise<void>; restore: () => void } {
  if (!el || prefersReducedMotion()) return { finished: Promise.resolve(), restore: () => {} };

  const props = [
    "box-sizing", "height", "overflow", "opacity", "transition", "padding-top", "padding-bottom",
    "margin-top", "border-top-width", "border-bottom-width", "pointer-events"
  ] as const;

  const height = el.getBoundingClientRect().height;
  el.style.boxSizing = "border-box";
  el.style.height = `${height}px`;
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none"; // たたんでいる間の二重操作を防ぐ
  void el.offsetHeight; // 開始状態を確定させてから遷移させる
  const t = `${MOTION_MS}ms ease`;
  el.style.transition = ["height", "opacity", "padding", "margin", "border-width"].map((p) => `${p} ${t}`).join(", ");
  el.style.height = "0px";
  el.style.opacity = "0";
  el.style.paddingTop = "0px";
  el.style.paddingBottom = "0px";
  el.style.marginTop = "0px";
  el.style.borderTopWidth = "0px";
  el.style.borderBottomWidth = "0px";

  return {
    finished: new Promise((resolve) => setTimeout(resolve, MOTION_MS + 20)),
    restore: () => props.forEach((p) => el.style.removeProperty(p))
  };
}
