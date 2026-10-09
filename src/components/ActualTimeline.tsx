"use client";

import { useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ActualLog } from "@/types/database";
import { cn } from "@/lib/utils";
import DebouncedTextInput from "@/components/ui/debounced-text-input";

type Props = {
  actuals: ActualLog[];
  onAdd: (title: string, startTime: string | null, endTime: string | null) => void;
  onUpdate: (id: string, patch: Partial<ActualLog>) => void;
  onDelete: (id: string) => void;
};

export default function ActualTimeline({ actuals, onAdd, onUpdate, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [showTimeInputs, setShowTimeInputs] = useState(false);

  // インライン編集中の実績ID（1件のみ同時編集可）。タイトル・時間が対象で、メモは常時編集可のまま。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), startTime || null, endTime || null);
    setTitle("");
    setStartTime("");
    setEndTime("");
  };

  const startEdit = (log: ActualLog) => {
    setEditingId(log.id);
    setEditTitle(log.title);
    setEditStart(log.start_time?.slice(0, 5) ?? "");
    setEditEnd(log.end_time?.slice(0, 5) ?? "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return;
    onUpdate(editingId, {
      title: editTitle.trim(),
      start_time: editStart || null,
      end_time: editEnd || null
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
      <h2 className="mb-3 font-display text-sm font-bold text-ink/70">実績</h2>

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
          予定の「転記」を押すか、上のフォームから直接記録できます
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
                                </p>
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

                        <DebouncedTextInput
                          value={log.memo ?? ""}
                          onCommit={(next) => onUpdate(log.id, { memo: next })}
                          placeholder="メモ（割り込みが入った、など）"
                          className="mt-1.5 w-full rounded bg-paper px-2 py-1 pl-5 text-[11px] text-ink/60 outline-none placeholder:text-ink/30"
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
