import { cn } from "@/lib/utils";

/**
 * 表示・非表示で高さが急に変わらないよう、短く（150ms）開閉する領域。
 * 高さは内容に合わせて自動（固定高さではない）。閉じている間は見えず、フォーカスも入らない。
 * 「動きを減らす」設定では動かさず、即座に切り替える。
 */
export default function Collapse({
  open,
  children,
  className
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity,visibility] duration-150 ease-out motion-reduce:transition-none",
        open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
        className
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
