"use client";

import { useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { Check, CornerDownRight, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Task } from "@/types/database";
import { cn } from "@/lib/utils";

type Props = {
  tasks: Task[];
  onAdd: (title: string, startTime: string | null, endTime: string | null) => void;
  onToggleComplete: (task: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onTranscribe: (task: Task) => void;
  transcribedTaskIds: Set<string>;
};

export default function TaskList({
  tasks,
  onAdd,
  onToggleComplete,
  onUpdate,
  onDelete,
  onTranscribe,
  transcribedTaskIds
}: Props) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [showTimeInputs, setShowTimeInputs] = useState(false);

  // インライン編集中のタスクID（1件のみ同時編集可）
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

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditStart(task.start_time?.slice(0, 5) ?? "");
    setEditEnd(task.end_time?.slice(0, 5) ?? "");
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
      <h2 className="mb-3 font-display text-sm font-bold text-ink/70">予定 ToDo</h2>

      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="やることを入力（時間指定は任意）"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-plan"
          />
          <button
            type="button"
            onClick={() => setShowTimeInputs((v) => !v)}
            className={cn(
              "rounded-lg border px-2.5 text-xs font-semibold transition",
              showTimeInputs
                ? "border-plan bg-plan/10 text-plan"
                : "border-line text-ink/50 hover:bg-paper"
            )}
          >
            時間
          </button>
          <button
            type="submit"
            className="flex items-center justify-center rounded-lg bg-plan px-3 text-white transition hover:opacity-90"
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

      <Droppable droppableId="task-list">
        {(droppableProvided, droppableSnapshot) => (
          <ul
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={cn(
              "space-y-1.5 rounded-lg transition",
              droppableSnapshot.isDraggingOver && "bg-plan/5 ring-2 ring-plan/30"
            )}
          >
            {tasks.length === 0 && !droppableSnapshot.isDraggingOver && (
              <p className="rounded-lg bg-paper px-3 py-6 text-center text-xs text-ink/40">
                今日の予定はまだありません（右端の「今週のToDo」からもドラッグできます）
              </p>
            )}
            {tasks.map((task, index) => {
              const alreadyTranscribed = transcribedTaskIds.has(task.id);
              const isEditing = editingId === task.id;
              return (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(draggableProvided, snapshot) => (
                    <li
                      ref={draggableProvided.innerRef}
                      {...draggableProvided.draggableProps}
                      className={cn(
                        "group rounded-lg border border-line bg-white px-2 py-2 transition",
                        snapshot.isDragging && "shadow-md ring-1 ring-plan/30",
                        isEditing && "ring-1 ring-plan/40"
                      )}
                    >
                      {isEditing ? (
                        <div className="space-y-1.5 pl-0.5">
                          <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            className="w-full rounded-md border border-plan/40 bg-paper px-2 py-1 text-sm text-ink outline-none"
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
                        <div className="flex items-center gap-1.5">
                          <span
                            {...draggableProvided.dragHandleProps}
                            className="cursor-grab touch-none text-ink/20 hover:text-ink/50 active:cursor-grabbing"
                            aria-label="並び替え"
                          >
                            <GripVertical size={14} />
                          </span>
                          <input
                            type="checkbox"
                            checked={task.is_completed}
                            onChange={() => onToggleComplete(task)}
                            className="h-4 w-4 accent-plan"
                          />
                          <div
                            className="min-w-0 flex-1 cursor-text"
                            onDoubleClick={() => startEdit(task)}
                            title="ダブルクリックで編集"
                          >
                            <p
                              className={cn(
                                "truncate text-sm text-ink",
                                task.is_completed && "text-ink/40 line-through"
                              )}
                            >
                              {task.title}
                            </p>
                            {(task.start_time || task.end_time) && (
                              <p className="text-[11px] text-ink/40">
                                {task.start_time?.slice(0, 5) ?? "―"} 〜{" "}
                                {task.end_time?.slice(0, 5) ?? "―"}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => startEdit(task)}
                            aria-label="編集"
                            className="rounded-full p-1 text-ink/20 opacity-0 transition hover:text-plan group-hover:opacity-100"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => onTranscribe(task)}
                            disabled={alreadyTranscribed}
                            title="予定を実績へ転記"
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition",
                              alreadyTranscribed
                                ? "cursor-not-allowed border-line text-ink/25"
                                : "border-actual/40 text-actual hover:bg-actual/10"
                            )}
                          >
                            <CornerDownRight size={12} />
                            転記
                          </button>
                          <button
                            onClick={() => onDelete(task.id)}
                            aria-label="削除"
                            className="rounded-full p-1 text-ink/20 opacity-0 transition hover:text-over group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
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
    </section>
  );
}
