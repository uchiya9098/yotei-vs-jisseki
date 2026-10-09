"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onCommit: (value: string) => void;
  debounceMs?: number;
  placeholder?: string;
  className?: string;
};

/**
 * 日本語IME入力に対応したテキスト入力。
 *
 * 通常の <input value={x} onChange={...}> のように親のstateへ即時反映すると、
 * 変換確定のたびに親→DB更新→再レンダー→value書き戻しが走り、
 * IME変換中の文字列と競合して二重入力・文字化けが起きる。
 *
 * ここでは入力値をこのコンポーネント内のローカルstateだけで持ち、
 * - IME変換中（isComposing）は親へのコミットを行わない
 * - 入力が落ち着いてから debounceMs 後、または blur 時にまとめて親へ通知する
 * ことで、タイピング中は親の再レンダーの影響を受けないようにしている。
 */
export default function DebouncedTextInput({
  value,
  onCommit,
  debounceMs = 600,
  placeholder,
  className
}: Props) {
  const [localValue, setLocalValue] = useState(value);
  const isComposing = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(value);

  // 他デバイスからのRealtime更新など、外部要因でvalueが変わった場合のみローカルへ反映。
  // 自分がコミットした結果として返ってきたvalueは無視し、無限ループや入力の巻き戻りを防ぐ。
  useEffect(() => {
    if (value !== lastCommitted.current) {
      setLocalValue(value);
      lastCommitted.current = value;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const commit = (next: string) => {
    if (next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  };

  const scheduleCommit = (next: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (!isComposing.current) commit(next);
    }, debounceMs);
  };

  const flush = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    commit(localValue);
  };

  return (
    <input
      value={localValue}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const next = e.target.value;
        setLocalValue(next); // 表示は常に即時反映（IME変換候補も含め自然に動く）
        scheduleCommit(next);
      }}
      onCompositionStart={() => {
        isComposing.current = true;
      }}
      onCompositionEnd={(e) => {
        isComposing.current = false;
        // 変換確定直後の最終文字列で改めてコミットをスケジュールする
        scheduleCommit((e.target as HTMLInputElement).value);
      }}
      onBlur={flush} // フォーカスが外れたら即座に確定（debounce待ちを打ち切る）
    />
  );
}
