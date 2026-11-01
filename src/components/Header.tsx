"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  LogOut,
  Wifi,
  WifiOff
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import MarkdownExportDialog from "@/components/MarkdownExportDialog";

type Props = {
  selectedDate: Date;
  dateLabel: string;
  isToday: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onSelectDate: (date: Date) => void;
  // ログイン済みなら実際のユーザーID、未ログイン（ゲストモード）なら null。
  userId: string | null;
  userName: string;
  userAvatar: string | null;
  isSynced: boolean;
};

export default function Header({
  selectedDate,
  dateLabel,
  isToday,
  onPrevDay,
  onNextDay,
  onToday,
  onSelectDate,
  userId,
  userName,
  userAvatar,
  isSynced
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isGuest = !userId;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // ログアウト後は/loginへ強制せず、ゲストモードのダッシュボードへ戻す
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-1">
        <button
          onClick={onPrevDay}
          aria-label="前日"
          className="rounded-full p-2 text-ink/60 transition hover:bg-white"
        >
          <ChevronLeft size={18} />
        </button>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-center text-sm font-semibold text-ink hover:bg-white">
              {dateLabel}
              {isToday && <span className="text-plan">・今日</span>}
              <CalendarDays size={14} className="ml-0.5 text-ink/40" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="center">
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={(date) => {
                if (!date) return;
                onSelectDate(date);
                setCalendarOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <button
          onClick={onNextDay}
          aria-label="翌日"
          className="rounded-full p-2 text-ink/60 transition hover:bg-white"
        >
          <ChevronRight size={18} />
        </button>
        {!isToday && (
          <button
            onClick={onToday}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-plan hover:bg-white"
          >
            今日へ
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Markdown出力・週次サマリーはクラウド機能のため、ログイン時のみ表示 */}
        {userId && (
          <>
            <MarkdownExportDialog userId={userId} />
            <Link
              href="/summary"
              className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink/60 transition hover:bg-white hover:text-ink"
            >
              週次・月次サマリー
            </Link>
          </>
        )}

        <span
          className="flex items-center gap-1 text-xs text-ink/40"
          title={
            isGuest
              ? "ゲストモード（このブラウザにのみ保存）"
              : isSynced
                ? "同期済み"
                : "同期中..."
          }
        >
          {isGuest ? <CloudOff size={14} /> : isSynced ? <Wifi size={14} /> : <WifiOff size={14} />}
        </span>

        {isGuest ? (
          <Link
            href="/login"
            className="rounded-full bg-plan px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            ログイン / クラウド同期
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            {userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userAvatar} alt={userName} className="h-7 w-7 rounded-full" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-plan/20 text-xs font-bold text-plan">
                {userName.charAt(0)}
              </div>
            )}
            <button
              onClick={handleLogout}
              aria-label="ログアウト"
              className="rounded-full p-1.5 text-ink/40 transition hover:bg-white hover:text-ink"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
