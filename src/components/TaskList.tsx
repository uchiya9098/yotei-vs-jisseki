"use client";

import { useState } from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { Check, CornerDownRight, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Task, TaskDiff } from "@/types/database";
import { computeMinutesFromRange, cn, formatMinutes, getActualMinutes } from "@/lib/utils";
import {
  formatReferencePeriod,
  getEstimateReference,
  type EstimateIndex
} from "@/lib/estimate-reference";

// 過去の確認済み実績から計算した参考時間（中央値）。提案のみで、自動では予定に反映しない。
function EstimateHint({
  title,
  index,
  currentMinutes, // いま入力されている所要時間（明示 or 時間枠から）。無ければ null
  rangeMinutes, // 時間枠（開始〜終了）の長さ。無ければ null
  onApply
}: {
  title: string;
  index: EstimateIndex;
  currentMinutes: number | null;
  rangeMinutes: number | null;
  onApply: (minutes: number) => void;
}) {
  const ref = getEstimateReference(index, title);
  if (!ref) return null; // 記録が足りない・候補なしのときは何も表示しない
  return (
    <div className="rounded-lg border border-plan/20 bg-plan/5 px-2.5 py-2 text-[11px] text-ink/70">
      <p>
        過去{ref.count}回の実績（{formatReferencePeriod(ref)}）の中央値:{" "}
        <span className="font-semibold text-plan">{formatMinutes(ref.median)}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {currentMinutes === ref.median ? (
          <span className="text-ink/40">入力中の時間と同じです</span>
        ) : (
          <button
            type="button"
            onClick={() => onApply(ref.median)}
            className="rounded-full border border-plan/40 bg-white px-2.5 py-1 font-semibold text-plan transition hover:bg-plan/10"
          >
            {currentMinutes === null
              ? "この時間を予定に使う"
              : `所要時間を ${formatMinutes(currentMinutes)} → ${formatMinutes(ref.median)} に変更`}
          </button>
        )}
        <span className="text-[10px] text-ink/40">確認済みの実績時間から計算した参考値です</span>
      </div>
      {rangeMinutes !== null && rangeMinutes !== ref.median && (
        <p className="mt-1 text-[10px] text-ink/50">
          開始・終了の時間枠（{formatMinutes(rangeMinutes)}）は変わりません。反映すると時間枠と所要時間が異なります。
        </p>
      )}
    </div>
  );
}

type Props = {
  tasks: Task[];
  onAdd: (
    title: string,
    startTime: string | null,
    endTime: string | null,
    estimatedMinutes: number | null
  ) => void;
  onToggleComplete: (task: Task) => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onTranscribe: (task: Task) => void;
  diffsByTaskId: Map<string, TaskDiff>; // 予定ごとの紐づき実績・差分
  estimateIndex: EstimateIndex; // 同じ活動の過去の参考時間
};

export default function TaskList({
  tasks,
  onAdd,
  onToggleComplete,
  onUpdate,
  onDelete,
  onTranscribe,
  diffsByTaskId,
  estimateIndex
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
  const [editEstimate, setEditEstimate] = useState(""); // 明示した所要時間（分）。時間枠と同じ値のときは空
  const [editEstimateInit, setEditEstimateInit] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null); // 追加フォームで選んだ所要時間

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), startTime || null, endTime || null, estimate);
    setEstimate(null);
    setTitle("");
    setStartTime("");
    setEndTime("");
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditStart(task.start_time?.slice(0, 5) ?? "");
    setEditEnd(task.end_time?.slice(0, 5) ?? "");
    const derived = computeMinutesFromRange(task.start_time, task.end_time);
    const explicit =
      task.estimated_minutes !== null && task.estimated_minutes !== derived
        ? String(task.estimated_minutes)
        : "";
    setEditEstimate(explicit);
    setEditEstimateInit(explicit);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId || !editTitle.trim()) return;
    onUpdate(editingId, {
      title: editTitle.trim(),
      start_time: editStart || null,
      end_time: editEnd || null,
      // 所要時間は、本人が変更したときだけ保存する（変更しなければ従来どおり時間枠から再計算される）
      ...(editEstimate !== editEstimateInit
        ? { estimated_minutes: editEstimate && Number(editEstimate) > 0 ? Math.round(Number(editEstimate)) : null }
        : {})
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
            onChange={(e) => {
              setTitle(e.target.value);
              setEstimate(null); // 予定名を変えたら、前の参考時間の選択は取り消す
            }}
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
        <EstimateHint
          title={title}
          index={estimateIndex}
          currentMinutes={estimate ?? computeMinutesFromRange(startTime || null, endTime || null)}
          rangeMinutes={computeMinutesFromRange(startTime || null, endTime || null)}
          onApply={setEstimate}
        />
        {estimate !== null && (
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink/60">
            <span className="rounded-full bg-plan/10 px-2 py-0.5 font-semibold text-plan">
              所要時間 {formatMinutes(estimate)}
            </span>
            {computeMinutesFromRange(startTime || null, endTime || null) !== null &&
              computeMinutesFromRange(startTime || null, endTime || null) !== estimate && (
                <span className="text-ink/50">
                  （時間枠は{formatMinutes(computeMinutesFromRange(startTime || null, endTime || null))}で、所要時間と異なります）
                </span>
              )}
            <button
              type="button"
              onClick={() => setEstimate(null)}
              className="text-ink/40 underline hover:text-ink"
            >
              取り消す
            </button>
          </p>
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
              const diff = diffsByTaskId.get(task.id);
              const linked = diff?.actuals ?? [];
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
                          <EstimateHint
                            title={editTitle}
                            index={estimateIndex}
                            currentMinutes={
                              editEstimate && Number(editEstimate) > 0
                                ? Number(editEstimate)
                                : computeMinutesFromRange(editStart || null, editEnd || null)
                            }
                            rangeMinutes={computeMinutesFromRange(editStart || null, editEnd || null)}
                            onApply={(m) => setEditEstimate(String(m))}
                          />
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
                            <label className="flex items-center gap-1 text-xs text-ink/50">
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                inputMode="numeric"
                                value={editEstimate}
                                placeholder="所要"
                                onChange={(e) => setEditEstimate(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                aria-label="所要時間（分）"
                                className="w-14 rounded-md border border-line bg-paper px-1.5 py-1 text-xs"
                              />
                              分
                            </label>
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
                            {(() => {
                              const range = computeMinutesFromRange(task.start_time, task.end_time);
                              if (task.estimated_minutes === null) return null;
                              if (range === null)
                                return (
                                  <p className="text-[11px] text-ink/40">
                                    所要時間 {formatMinutes(task.estimated_minutes)}
                                  </p>
                                );
                              if (range !== task.estimated_minutes)
                                return (
                                  <p className="text-[11px] text-amber-700">
                                    時間枠 {formatMinutes(range)} / 所要時間 {formatMinutes(task.estimated_minutes)}（異なります）
                                  </p>
                                );
                              return null;
                            })()}
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
                            title={
                              linked.length === 0
                                ? "予定に紐づく実績を作成（時間は自分で入力）"
                                : "この予定の実績をもう1件追加（中断・再開など）。時間は自分で入力"
                            }
                            className="flex items-center gap-1 rounded-full border border-actual/40 px-2 py-1 text-[11px] font-semibold text-actual transition hover:bg-actual/10"
                          >
                            {linked.length === 0 ? <CornerDownRight size={12} /> : <Plus size={12} />}
                            {linked.length === 0 ? "転記" : "実績"}
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

                      {!isEditing && diff && (
                        <div className="mt-1.5 space-y-1 pl-[1.9rem] text-[11px]">
                          {linked.length === 0 ? (
                            <span className="inline-block rounded-full border border-dashed border-line px-2 py-0.5 text-ink/40">
                              実績 未記録
                            </span>
                          ) : (
                            <>
                              {linked.map((a) => {
                                const m = getActualMinutes(a);
                                return (
                                  <p key={a.id} className="flex flex-wrap items-center gap-x-1.5 text-actual">
                                    <span className="font-semibold">実績</span>
                                    <span>
                                      {a.start_time || a.end_time
                                        ? `${a.start_time?.slice(0, 5) ?? "―"}〜${a.end_time?.slice(0, 5) ?? "―"}`
                                        : "時刻なし"}
                                    </span>
                                    <span className={m === null ? "text-ink/40" : ""}>
                                      {m === null ? "時間未入力" : formatMinutes(m)}
                                    </span>
                                  </p>
                                );
                              })}
                              <p className="flex flex-wrap items-center gap-1.5 text-ink/60">
                                <span>
                                  予定 {diff.estimatedMinutes !== null ? formatMinutes(diff.estimatedMinutes) : "―"}
                                  {" / "}実績{" "}
                                  {diff.actualMinutes !== null ? formatMinutes(diff.actualMinutes) : "―"}
                                  {linked.length > 1 && `（${linked.length}回）`}
                                </span>
                                {diff.diffMinutes !== null ? (
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 font-semibold",
                                      diff.diffMinutes > 0 && "bg-over/10 text-over",
                                      diff.diffMinutes < 0 && "bg-under/10 text-under",
                                      diff.diffMinutes === 0 && "bg-plan/10 text-plan"
                                    )}
                                  >
                                    {diff.diffMinutes === 0
                                      ? "予定通り"
                                      : `${diff.diffMinutes > 0 ? "+" : ""}${formatMinutes(diff.diffMinutes)}`}
                                  </span>
                                ) : diff.actualPartial ? (
                                  <span className="text-ink/40">時間未入力の実績あり（差分なし）</span>
                                ) : null}
                              </p>
                            </>
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
    </section>
  );
}
