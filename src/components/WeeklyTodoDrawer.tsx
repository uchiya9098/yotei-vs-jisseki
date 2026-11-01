"use client";

import { useEffect, useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import {
  ArrowRight,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";
import type { WeeklyTodo } from "@/types/database";
import {
  cn,
  formatMinutes,
  formatWeekRangeLabel,
  getWeekRelationLabel,
  shiftWeekKey,
  toDateKey
} from "@/lib/utils";

type Props = {
  weeklyTodos: WeeklyTodo[];
  // ドロワーで表示中の週の開始日（月曜）と、実際の今週の開始日
  viewWeekKey: string;
  currentWeekKey: string;
  loading: boolean;
  onChangeWeek: (weekKey: string) => void;
  // 未完了タスクを今週へ繰り越す。成功した件数を返す。
  onCarryOver: (todos: WeeklyTodo[]) => Promise<number>;
  onAdd: (title: string, estimatedMinutes: number | null) => Promise<boolean>;
  onToggleComplete: (todo: WeeklyTodo) => void;
  onUpdate: (id: string, patch: Partial<WeeklyTodo>) => void;
  onDelete: (id: string) => void;
  onAssignToday: (todo: WeeklyTodo) => void;
};

export default function WeeklyTodoDrawer({
  weeklyTodos,
  viewWeekKey,
  currentWeekKey,
  loading,
  onChangeWeek,
  onCarryOver,
  onAdd,
  onToggleComplete,
  onUpdate,
  onDelete,
  onAssignToday
}: Props) {
  const [open, setOpen] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  // インライン編集中のToDo ID（1件のみ同時編集可）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMinutes, setEditMinutes] = useState("");

  const incompleteTodos = weeklyTodos.filter((t) => !t.is_completed);
  const incompleteCount = incompleteTodos.length;
  const todayKey = toDateKey(new Date());

  // 表示中の週が「過去の週」か（YYYY-MM-DD は文字列比較で日付の大小比較になる）
  const isPastWeek = viewWeekKey < currentWeekKey;
  const isCurrentWeek = viewWeekKey === currentWeekKey;
  const relationLabel = getWeekRelationLabel(viewWeekKey, currentWeekKey);

  // 通知は数秒で自動的に消す
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const changeWeek = (weekKey: string) => {
    setEditingId(null); // 編集中の行が別の週に消えるので、編集モードは解除
    setNotice(null);
    onChangeWeek(weekKey);
  };

  // 閉じたら今週表示に戻す。閉じている間のトグルタブの未完了バッジが、常に今週の件数になる。
  const closeDrawer = () => {
    setOpen(false);
    if (viewWeekKey !== currentWeekKey) changeWeek(currentWeekKey);
  };

  const carryOver = async (targets: WeeklyTodo[]) => {
    if (carrying || targets.length === 0) return;
    setCarrying(true);
    try {
      const moved = await onCarryOver(targets);
      if (moved === targets.length) {
        setNotice(`${moved}件を今週へ繰り越しました`);
      } else if (moved > 0) {
        setNotice(`${targets.length}件中${moved}件を繰り越しました（残りは失敗しました）`);
      } else {
        setNotice("繰り越しに失敗しました。もう一度お試しください");
      }
    } finally {
      setCarrying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    const parsed = minutes.trim() ? Number(minutes) : null;
    const parsedMinutes = parsed !== null && Number.isFinite(parsed) ? parsed : null;

    setSubmitting(true);
    setSubmitError(false);
    const success = await onAdd(title.trim(), parsedMinutes);
    setSubmitting(false);

    if (success) {
      // 保存できたことを確認してからフォームをクリアする
      // （保存前にクリアすると、失敗時に入力内容が消えて何も起きなかったように見えてしまう）
      setTitle("");
      setMinutes("");
    } else {
      setSubmitError(true);
    }
  };

  const startEdit = (todo: WeeklyTodo) => {
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditMinutes(todo.estimated_minutes !== null ? String(todo.estimated_minutes) : "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return;
    const parsed = editMinutes.trim() ? Number(editMinutes) : null;
    const parsedMinutes = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    onUpdate(editingId, { title: editTitle.trim(), estimated_minutes: parsedMinutes });
    setEditingId(null);
  };

  // Enter で保存・Esc でキャンセル（IME変換確定のEnterでは保存しない）
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <>
      {/* 折りたたみ時のトグルタブ */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-l-full border border-r-0 border-line bg-white py-2.5 pl-3 pr-2.5 text-xs font-semibold text-ink shadow-md transition hover:bg-paper"
        >
          <CalendarRange size={14} className="text-plan" />
          <span>今週のToDo</span>
          {incompleteCount > 0 && (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-plan px-1 text-[10px] font-bold text-white">
              {incompleteCount}
            </span>
          )}
        </button>
      )}

      {/* 背景オーバーレイ（開いている間のみ、クリックで閉じる） */}
      <div
        onClick={closeDrawer}
        className={cn(
          "fixed inset-0 z-30 bg-ink/20 backdrop-blur-[1px] transition-opacity duration-300",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* ドロワー本体 */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-40 flex h-full w-[88vw] max-w-sm flex-col border-l border-line bg-white shadow-xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-1.5">
            <CalendarRange size={16} className="text-plan" />
            <h2 className="font-display text-sm font-bold text-ink">{relationLabel}のToDo</h2>
            {incompleteCount > 0 && (
              <span className="rounded-full bg-plan/10 px-1.5 py-0.5 text-[10px] font-bold text-plan">
                未完了 {incompleteCount}
              </span>
            )}
          </div>
          <button
            onClick={closeDrawer}
            aria-label="閉じる"
            className="rounded-full p-1.5 text-ink/40 transition hover:bg-paper hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* 週の切り替え */}
        <div className="flex items-center justify-between gap-1 border-b border-line px-3 py-2">
          <button
            onClick={() => changeWeek(shiftWeekKey(viewWeekKey, -1))}
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-semibold text-ink/60 transition hover:bg-paper hover:text-ink"
          >
            <ChevronLeft size={14} />
            前の週
          </button>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-xs font-semibold text-ink">
              {formatWeekRangeLabel(viewWeekKey)}
            </span>
            {isCurrentWeek ? (
              <span className="text-[10px] text-plan">今週</span>
            ) : (
              <button
                onClick={() => changeWeek(currentWeekKey)}
                className="text-[10px] font-semibold text-plan hover:underline"
              >
                {relationLabel}・今週へ戻る
              </button>
            )}
          </div>
          <button
            onClick={() => changeWeek(shiftWeekKey(viewWeekKey, 1))}
            className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-semibold text-ink/60 transition hover:bg-paper hover:text-ink"
          >
            次の週
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isPastWeek ? (
            <p className="mb-3 text-xs text-ink/40">
              過去の週です。やり残したタスクは「今週へ繰り越す」で今週のToDoに移せます。
            </p>
          ) : (
            <p className="mb-3 text-xs text-ink/40">
              {isCurrentWeek ? "今週" : "この週"}
              中にやりたいタスクをここにプールしておき、「今日やる」ボタンか、
              左側の「予定 ToDo」エリアへのドラッグで当日の予定に組み込めます。
            </p>
          )}

          {/* 過去の週に未完了タスクがあるときだけ、一括繰り越しを表示 */}
          {isPastWeek && incompleteCount > 0 && (
            <button
              onClick={() => carryOver(incompleteTodos)}
              disabled={carrying}
              className={cn(
                "mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                carrying
                  ? "cursor-not-allowed border-line text-ink/30"
                  : "border-plan/40 bg-plan/5 text-plan hover:bg-plan/10"
              )}
            >
              <ArrowRight size={14} />
              {carrying ? "繰り越し中..." : `未完了${incompleteCount}件を今週へ繰り越す`}
            </button>
          )}
          {notice && (
            <p className="mb-3 rounded-lg bg-plan/10 px-3 py-2 text-center text-[11px] font-semibold text-plan">
              {notice}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mb-4 space-y-2">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (submitError) setSubmitError(false);
              }}
              placeholder={`${relationLabel}のタスクを入力`}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-plan"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="予定時間（分・任意）"
                className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-plan"
              />
              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  "flex items-center justify-center rounded-lg px-3 text-white transition",
                  submitting ? "cursor-not-allowed bg-plan/40" : "bg-plan hover:opacity-90"
                )}
              >
                <Plus size={18} />
              </button>
            </div>
            {submitError && (
              <p className="text-[11px] text-over">
                追加に失敗しました。通信状況を確認してもう一度お試しください。
              </p>
            )}
          </form>

          <Droppable droppableId="weekly-pool" isDropDisabled>
            {(droppableProvided) => (
              <ul
                ref={droppableProvided.innerRef}
                {...droppableProvided.droppableProps}
                className="space-y-1.5"
              >
                {weeklyTodos.length === 0 && (
                  <li className="rounded-lg bg-paper px-3 py-6 text-center text-xs text-ink/40">
                    {loading ? "読み込み中..." : `${relationLabel}のタスクはまだありません`}
                  </li>
                )}
                {weeklyTodos.map((todo, index) => {
                  const assignedToday = todo.assigned_date === todayKey;
                  const isEditing = editingId === todo.id;
                  return (
                    <Draggable key={todo.id} draggableId={`weekly:${todo.id}`} index={index}>
                      {(draggableProvided, snapshot) => (
                        <li
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          className={cn(
                            "group rounded-lg border border-line bg-paper px-2.5 py-2 transition",
                            snapshot.isDragging && "bg-white shadow-md ring-1 ring-plan/30",
                            isEditing && "bg-white ring-1 ring-plan/40"
                          )}
                        >
                          {isEditing ? (
                            <div className="space-y-1.5 pl-0.5">
                              <input
                                autoFocus
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                className="w-full rounded-md border border-plan/40 bg-white px-2 py-1 text-sm text-ink outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={editMinutes}
                                  onChange={(e) => setEditMinutes(e.target.value)}
                                  onKeyDown={handleEditKeyDown}
                                  placeholder="予定時間（分）"
                                  className="w-28 rounded-md border border-line bg-white px-1.5 py-1 text-xs"
                                />
                                <div className="ml-auto flex items-center gap-1">
                                  <button
                                    onClick={saveEdit}
                                    aria-label="保存"
                                    className="rounded-full bg-plan p-1.5 text-white transition hover:opacity-90"
                                  >
                                    <Check size={13} />
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    aria-label="キャンセル"
                                    className="rounded-full bg-ink/10 p-1.5 text-ink/50 transition hover:bg-ink/20"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-1.5">
                              <span
                                {...draggableProvided.dragHandleProps}
                                className="mt-1 cursor-grab touch-none text-ink/20 hover:text-ink/50 active:cursor-grabbing"
                                aria-label="ドラッグして今日の予定へ"
                              >
                                <GripVertical size={14} />
                              </span>
                              <input
                                type="checkbox"
                                checked={todo.is_completed}
                                onChange={() => onToggleComplete(todo)}
                                className="mt-1 h-4 w-4 accent-plan"
                              />
                              <div
                                className="min-w-0 flex-1 cursor-text"
                                onDoubleClick={() => startEdit(todo)}
                                title="ダブルクリックで編集"
                              >
                                <p
                                  className={cn(
                                    "truncate text-sm text-ink",
                                    todo.is_completed && "text-ink/40 line-through"
                                  )}
                                >
                                  {todo.title}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  {todo.estimated_minutes !== null && (
                                    <span className="text-[11px] text-ink/40">
                                      {formatMinutes(todo.estimated_minutes)}
                                    </span>
                                  )}
                                  {assignedToday && (
                                    <span className="rounded-full bg-actual/10 px-1.5 py-0.5 text-[10px] font-semibold text-actual">
                                      本日追加済み
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => startEdit(todo)}
                                aria-label="編集"
                                className="mt-0.5 rounded-full p-1 text-ink/20 opacity-0 transition hover:text-plan group-hover:opacity-100"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => onDelete(todo.id)}
                                aria-label="削除"
                                className="mt-0.5 rounded-full p-1 text-ink/20 opacity-0 transition hover:text-over group-hover:opacity-100"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                          {!isEditing && (
                            <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-1.5">
                              <button
                                onClick={() => onAssignToday(todo)}
                                disabled={assignedToday}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                                  assignedToday
                                    ? "cursor-not-allowed border-line text-ink/25"
                                    : "border-plan/40 text-plan hover:bg-plan/10"
                                )}
                              >
                                {assignedToday ? "追加済み" : "今日やる"}
                              </button>
                              {/* 過去の週の未完了タスクだけ、個別に今週へ繰り越せる */}
                              {isPastWeek && !todo.is_completed && (
                                <button
                                  onClick={() => carryOver([todo])}
                                  disabled={carrying}
                                  className={cn(
                                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                                    carrying
                                      ? "cursor-not-allowed border-line text-ink/25"
                                      : "border-actual/40 text-actual hover:bg-actual/10"
                                  )}
                                >
                                  <ArrowRight size={11} />
                                  今週へ繰り越す
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      )}
                    </Draggable>
                  );
                })}
                {droppableProvided.placeholder}
              </ul>
            )}
          </Droppable>
        </div>
      </aside>
    </>
  );
}
