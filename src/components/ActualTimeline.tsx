"use client";

import { useEffect, useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ActualLog, Task } from "@/types/database";
import { cn, computeMinutesFromRange, formatMinutes, getActualMinutes } from "@/lib/utils";
import DebouncedTextInput from "@/components/ui/debounced-text-input";
import { VARIANCE_REASONS, normalizeVarianceReasons, toggleVarianceReason, type VarianceReasonKey } from "@/lib/variance-reasons";
import AiQuickActualDialog from "@/components/AiQuickActualDialog";
import type { ActualCandidate } from "@/lib/parse-actual";

type Props = {
  actuals: ActualLog[];
  tasks: Task[]; // 表示中の日の予定（紐づけ先の候補）
  currentDate: string;
  onAdd: (title: string, startTime: string | null, endTime: string | null, taskId: string | null) => void;
  onAddBulk: (items: ActualCandidate[]) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<ActualLog>) => void;
  onDelete: (id: string) => void;
  autoEditId?: string | null; // 作成直後にそのまま時間入力へ進めるよう、編集状態で開く実績ID
  onAutoEditHandled?: () => void;
};

// 実績に対応する予定を選ぶセレクト。未選択 = 予定外
function TaskSelect({
  value,
  tasks,
  onChange,
  className
}: {
  value: string | null;
  tasks: Task[];
  onChange: (taskId: string | null) => void;
  className?: string;
}) {
  const known = !value || tasks.some((t) => t.id === value);
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="対応する予定"
      className={cn(
        "max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] outline-none",
        value
          ? "border-plan/40 bg-plan/5 font-semibold text-plan"
          : "border-dashed border-line bg-paper text-ink/50",
        className
      )}
    >
      <option value="">予定外</option>
      {!known && <option value={value!}>（他の日の予定に紐づき中）</option>}
      {tasks.map((t) => (
        <option key={t.id} value={t.id}>
          予定: {t.title}
        </option>
      ))}
    </select>
  );
}

// ズレの理由（複数選択・任意）。タップで即保存。選択済みは常にタグ表示し、タップで全選択肢を開閉する。
function ReasonChips({
  selected,
  onToggle
}: {
  selected: string[];
  onToggle: (key: VarianceReasonKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = normalizeVarianceReasons(selected);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {chosen.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-actual/10 px-2 py-0.5 text-[11px] font-semibold text-actual"
          >
            {VARIANCE_REASONS.find((r) => r.key === k)?.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink/40 hover:bg-paper"
        >
          {chosen.length === 0 ? "＋ ズレの理由" : "＋"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="ズレの理由（複数選択可）">
        {VARIANCE_REASONS.map((r) => {
          const on = chosen.includes(r.key);
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              title={r.full}
              onClick={() => onToggle(r.key)}
              className={cn(
                "min-h-[30px] rounded-full border px-2.5 py-1 text-[11px] transition",
                on
                  ? "border-actual bg-actual/10 font-semibold text-actual"
                  : "border-line text-ink/50 hover:bg-paper"
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[11px] text-ink/40 hover:text-ink"
      >
        閉じる
      </button>
    </div>
  );
}

export default function ActualTimeline({
  actuals,
  tasks,
  currentDate,
  onAdd,
  onAddBulk,
  onUpdate,
  onDelete,
  autoEditId,
  onAutoEditHandled
}: Props) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [showTimeInputs, setShowTimeInputs] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  // インライン編集中の実績ID（1件のみ同時編集可）。タイトル・時間が対象で、メモは常時編集可のまま。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editDuration, setEditDuration] = useState(""); // 所要時間（分）。開始・終了が揃っていれば無視される

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), startTime || null, endTime || null, taskId);
    setTaskId(null);
    setTitle("");
    setStartTime("");
    setEndTime("");
  };

  const startEdit = (log: ActualLog) => {
    setEditingId(log.id);
    setEditTitle(log.title);
    setEditStart(log.start_time?.slice(0, 5) ?? "");
    setEditEnd(log.end_time?.slice(0, 5) ?? "");
    setEditDuration(log.actual_minutes !== null ? String(log.actual_minutes) : "");
  };

  // 予定から実績を作成した直後は、時間未入力のままその実績を編集状態で開く
  useEffect(() => {
    if (!autoEditId) return;
    const target = actuals.find((a) => a.id === autoEditId);
    if (!target) return; // 再読み込み完了後に再実行される
    startEdit(target);
    onAutoEditHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditId, actuals]);

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return;

    // 時間（開始・終了・所要）を本人が入力・変更したときだけ「確認済み」にする。
    // タイトルやメモだけの編集では確認状態を変えない（過去の転記コピーが誤って確認済みにならないように）。
    const orig = actuals.find((a) => a.id === editingId);
    const newMinutes =
      computeMinutesFromRange(editStart || null, editEnd || null) ??
      (editDuration && Number(editDuration) > 0 ? Math.round(Number(editDuration)) : null);
    const timeEdited =
      !orig ||
      (orig.start_time?.slice(0, 5) ?? "") !== editStart ||
      (orig.end_time?.slice(0, 5) ?? "") !== editEnd ||
      getActualMinutes(orig) !== newMinutes;

    onUpdate(editingId, {
      ...(timeEdited ? { time_confirmed: newMinutes !== null } : {}),
      title: editTitle.trim(),
      start_time: editStart || null,
      end_time: editEnd || null,
      // 開始・終了が揃っていなければ、入力された所要時間（空なら未入力）
      actual_minutes: editDuration && Number(editDuration) > 0 ? Math.round(Number(editDuration)) : null
    });
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
    <section className="rounded-card border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-ink/70">実績</h2>
        <AiQuickActualDialog onRegister={onAddBulk} tasks={tasks} currentDate={currentDate} />
      </div>

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="予定外の行動を入力（時間指定は任意）"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-actual"
          />
          <button
            type="button"
            onClick={() => setShowTimeInputs((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 text-xs font-semibold transition",
              showTimeInputs
                ? "border-actual bg-actual/10 text-actual"
                : "border-line text-ink/50 hover:bg-paper"
            )}
          >
            時間
          </button>
          <button
            type="submit"
            className="flex items-center justify-center rounded-lg bg-actual px-3 text-white transition hover:opacity-90"
          >
            <Plus size={18} />
          </button>
        </div>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-ink/50">
            <span className="shrink-0">対応する予定</span>
            <TaskSelect
              value={taskId}
              tasks={tasks}
              onChange={(id) => {
                setTaskId(id);
                // 予定を選んだとき、タイトル未入力なら予定名を入れる（入力の手間を減らす）
                if (id && !title.trim()) setTitle(tasks.find((t) => t.id === id)?.title ?? "");
              }}
            />
          </div>
        )}
        {showTimeInputs && (
          <div className="flex items-center gap-2 text-sm text-ink/60">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-line bg-paper px-2 py-1.5"
            />
            <span>〜</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-line bg-paper px-2 py-1.5"
            />
          </div>
        )}
      </form>

      {actuals.length === 0 ? (
        <p className="rounded-lg bg-paper px-3 py-6 text-center text-xs text-ink/40">
          予定の「転記」で実績を作り（時間は自分で入力）、または上のフォームから記録できます（予定に紐づけない場合は「予定外」）
        </p>
      ) : (
        <Droppable droppableId="actual-list">
          {(droppableProvided) => (
            <ul
              ref={droppableProvided.innerRef}
              {...droppableProvided.droppableProps}
              className="space-y-1.5"
            >
              {actuals.map((log, index) => {
                const isEditing = editingId === log.id;
                return (
                  <Draggable key={log.id} draggableId={log.id} index={index}>
                    {(draggableProvided, snapshot) => (
                      <li
                        ref={draggableProvided.innerRef}
                        {...draggableProvided.draggableProps}
                        className={cn(
                          "group rounded-lg border border-line bg-white px-2 py-2 transition",
                          snapshot.isDragging && "shadow-md ring-1 ring-actual/30",
                          isEditing && "ring-1 ring-actual/40"
                        )}
                      >
                        {isEditing ? (
                          <div className="space-y-1.5 pl-0.5">
                            <input
                              autoFocus
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className="w-full rounded-md border border-actual/40 bg-paper px-2 py-1 text-sm text-ink outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                className="rounded-md border border-line bg-paper px-1.5 py-1 text-xs"
                              />
                              <span className="text-xs text-ink/40">〜</span>
                              <input
                                type="time"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                className="rounded-md border border-line bg-paper px-1.5 py-1 text-xs"
                              />
                              <label className="flex items-center gap-1 text-xs text-ink/50">
                                <input
                                  type="number"
                                  min={1}
                                  max={1440}
                                  inputMode="numeric"
                                  value={editStart && editEnd ? "" : editDuration}
                                  disabled={!!(editStart && editEnd)}
                                  placeholder="所要"
                                  onChange={(e) => setEditDuration(e.target.value)}
                                  onKeyDown={handleEditKeyDown}
                                  aria-label="所要時間（分）"
                                  className="w-14 rounded-md border border-line bg-paper px-1.5 py-1 text-xs disabled:opacity-40"
                                />
                                分
                              </label>
                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  onClick={saveEdit}
                                  aria-label="保存"
                                  className="rounded-full bg-actual p-1.5 text-white transition hover:opacity-90"
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
                          <div className="flex items-center gap-1.5">
                            <span
                              {...draggableProvided.dragHandleProps}
                              className="cursor-grab touch-none text-ink/20 hover:text-ink/50 active:cursor-grabbing"
                              aria-label="並び替え"
                            >
                              <GripVertical size={14} />
                            </span>
                            <div
                              className="min-w-0 flex-1 cursor-text"
                              onDoubleClick={() => startEdit(log)}
                              title="ダブルクリックで編集"
                            >
                              <p className="truncate text-sm text-ink">{log.title}</p>
                              {(log.start_time || log.end_time) && (
                                <p className="text-[11px] text-ink/40">
                                  {log.start_time?.slice(0, 5) ?? "―"} 〜{" "}
                                  {log.end_time?.slice(0, 5) ?? "―"}
                                  {log.actual_minutes !== null && ` （${formatMinutes(log.actual_minutes)}）`}
                                </p>
                              )}
                              {!log.start_time && !log.end_time && log.actual_minutes !== null && (
                                <p className="text-[11px] text-ink/40">{formatMinutes(log.actual_minutes)}</p>
                              )}
                              {log.task_id && getActualMinutes(log) !== null && !log.time_confirmed && (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                  <span className="rounded-full border border-dashed border-line px-1.5 text-ink/40">
                                    時間は未確認
                                  </span>
                                  <button
                                    onClick={() => onUpdate(log.id, { time_confirmed: true })}
                                    title="この実績時間が実際に活動した時間だと確認できたら押してください。見積もりの参考時間に使われます"
                                    className="text-actual/70 underline decoration-dotted hover:text-actual"
                                  >
                                    この実績時間を確認済みにする
                                  </button>
                                </span>
                              )}
                              {!log.start_time && !log.end_time && log.actual_minutes === null && (
                                <button
                                  onClick={() => startEdit(log)}
                                  className="text-[11px] text-actual/70 underline decoration-dotted hover:text-actual"
                                >
                                  時間未入力（タップして入力）
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => startEdit(log)}
                              aria-label="編集"
                              className="rounded-full p-1 text-ink/20 opacity-0 transition hover:text-actual group-hover:opacity-100"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => onDelete(log.id)}
                              aria-label="削除"
                              className="rounded-full p-1 text-ink/20 opacity-0 transition hover:text-over group-hover:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}

                        <div className="mt-1.5 space-y-1.5 pl-5">
                          <TaskSelect
                            value={log.task_id}
                            tasks={tasks}
                            onChange={(id) => onUpdate(log.id, { task_id: id })}
                          />
                          <ReasonChips
                            selected={log.variance_reasons ?? []}
                            onToggle={(key) =>
                              onUpdate(log.id, {
                                variance_reasons: toggleVarianceReason(log.variance_reasons, key)
                              })
                            }
                          />
                        </div>

                        <DebouncedTextInput
                          value={log.memo ?? ""}
                          onCommit={(next) => onUpdate(log.id, { memo: next })}
                          placeholder={
                            (log.variance_reasons ?? []).includes("other")
                              ? "「その他」の補足を書けます"
                              : "メモ（割り込みが入った、など）"
                          }
                          className="mt-1 w-full rounded bg-paper px-2 py-1 pl-5 text-[11px] text-ink/60 outline-none placeholder:text-ink/30"
                        />
                      </li>
                    )}
                  </Draggable>
                );
              })}
              {droppableProvided.placeholder}
            </ul>
          )}
        </Droppable>
      )}
    </section>
  );
}
