"use client";

import type { ActualCandidate } from "@/lib/parse-actual";
import { buildEstimateIndex, getHistorySinceKey } from "@/lib/estimate-reference";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import type { ActualLog, AiReflection, ReflectionMessage, Task, TaskDiff, WeeklyTodo } from "@/types/database";
import {
  buildTaskDiffs,
  computeMinutesFromRange,
  formatMinutes,
  getCurrentWeekStartKey,
  toDateKey
} from "@/lib/utils";
import { useStorageAdapter } from "@/lib/storage/use-storage-adapter";
import {
  hasAnyLocalData,
  syncLocalDataToCloud,
  syncResultTotal,
  type SyncResult
} from "@/lib/storage/sync-local-to-cloud";
import Header from "@/components/Header";
import TaskList from "@/components/TaskList";
import ActualTimeline from "@/components/ActualTimeline";
import DiffSummary from "@/components/DiffSummary";
import AiCoachChat from "@/components/AiCoachChat";
import WeeklyTodoDrawer from "@/components/WeeklyTodoDrawer";
import { Cloud, X } from "lucide-react";

type Props = {
  // ログイン済みなら実際のユーザーID、未ログイン（ゲストモード）なら null。
  userId: string | null;
  userEmail: string;
  userAvatar: string | null;
  userName: string;
};

export default function Dashboard({ userId, userAvatar, userName }: Props) {
  const adapter = useStorageAdapter(userId);

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const dateKey = toDateKey(selectedDate);
  const isToday = dateKey === toDateKey(new Date());

  const [tasks, setTasks] = useState<Task[]>([]);
  const [actuals, setActuals] = useState<ActualLog[]>([]);
  const [reflection, setReflection] = useState<AiReflection | null>(null);
  const [weeklyTodos, setWeeklyTodos] = useState<WeeklyTodo[]>([]);
  const [isSynced, setIsSynced] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoEditActualId, setAutoEditActualId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<{ message: string; hint?: string; retry: () => void } | null>(null);

  // ゲスト → ログインへの移行時に一度だけ走る、ローカル→クラウド同期の状態
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // 実際の「今週」の開始日キー。毎レンダリングで評価するので、
  // 日付をまたいで開きっぱなしでも、新しい週を正しく「今週」として扱える。
  const currentWeekKey = getCurrentWeekStartKey();

  // 「今週のToDo」ドロワーで表示中の週（初期値は今週）。デイリー画面の selectedDate とは独立。
  const [viewWeekKey, setViewWeekKey] = useState(() => getCurrentWeekStartKey());
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  // 非同期処理の完了時点でも「いま表示中の週」を参照できるよう、最新値を ref に保持する
  const viewWeekRef = useRef(viewWeekKey);
  viewWeekRef.current = viewWeekKey;
  // 週を素早く切り替えたとき、遅れて返ってきた古い週の結果で上書きしないための連番
  const weeklyRequestId = useRef(0);

  const dateLabel = selectedDate.toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  });

  // --------------------------------------------------------
  // 初期データ取得（日付が変わるたび）
  // --------------------------------------------------------
  // 見積もりの参考時間用の履歴（直近90日の予定と、予定に紐づく実績）。
  // 予定名の入力のたびには取得せず、日付の変更・データ更新時にまとめて1回取得してキャッシュする。
  const [estimateHistory, setEstimateHistory] = useState<{ tasks: Task[]; actuals: ActualLog[] }>({
    tasks: [],
    actuals: []
  });
  const loadEstimateHistory = useCallback(async () => {
    const since = getHistorySinceKey(toDateKey(new Date()));
    setEstimateHistory(await adapter.listEstimateHistory(since));
  }, [adapter]);
  const estimateIndex = useMemo(
    () => buildEstimateIndex(estimateHistory.tasks, estimateHistory.actuals),
    [estimateHistory]
  );

  const loadData = useCallback(async () => {
    setIsSynced(false);
    loadEstimateHistory(); // 並行して取得（失敗しても予定・実績の表示には影響しない）
    const [taskData, actualData, reflectionData] = await Promise.all([
      adapter.listTasksByDate(dateKey),
      adapter.listActualsByDate(dateKey),
      adapter.getReflection(dateKey)
    ]);
    setTasks(taskData);
    setActuals(actualData);
    setReflection(reflectionData);
    setIsSynced(true);
  }, [adapter, dateKey, loadEstimateHistory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --------------------------------------------------------
  // 「今週のToDo」プールの取得（selectedDate に関わらず、ドロワーで表示中の週の分）
  // --------------------------------------------------------
  const loadWeeklyTodos = useCallback(async () => {
    const weekKey = viewWeekRef.current;
    const requestId = ++weeklyRequestId.current;
    const data = await adapter.listWeeklyTodos(weekKey);
    if (requestId !== weeklyRequestId.current) return; // より新しい取得が走っていれば捨てる
    setWeeklyTodos(data);
    setWeeklyLoading(false);
  }, [adapter]);

  useEffect(() => {
    loadWeeklyTodos();
  }, [loadWeeklyTodos, viewWeekKey]);

  const changeViewWeek = (weekKey: string) => {
    if (weekKey === viewWeekRef.current) return;
    // 前の週のタスクが一瞬残って誤操作されないよう、切り替え時はいったん空にする
    setWeeklyTodos([]);
    setWeeklyLoading(true);
    setViewWeekKey(weekKey);
  };

  // --------------------------------------------------------
  // 変更検知（ログイン時：Supabase Realtimeでマルチデバイス同期 /
  // 　　　　　ゲスト時：同じブラウザの別タブでの変更を検知）
  // --------------------------------------------------------
  useEffect(() => {
    const unsubscribe = adapter.subscribeToChanges(() => {
      loadData();
      loadWeeklyTodos();
    });
    return unsubscribe;
  }, [adapter, loadData, loadWeeklyTodos]);

  // --------------------------------------------------------
  // ゲスト → ログイン移行時：ローカルデータをクラウドへ自動同期
  // （OAuthのリダイレクトを経て userId 付きでマウントし直された最初のタイミングで走る）
  // --------------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    if (!hasAnyLocalData()) return;

    setSyncing(true);
    syncLocalDataToCloud(userId).then((result) => {
      setSyncing(false);
      if (syncResultTotal(result) > 0) {
        setSyncResult(result);
        loadData();
        loadWeeklyTodos();
      }
    });
    // userId が確定した最初の1回だけ実行すればよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // --------------------------------------------------------
  // 予定 CRUD
  // --------------------------------------------------------
  const addTask = async (
    title: string,
    startTime: string | null,
    endTime: string | null,
    estimatedMinutes: number | null = null // ユーザーが選んだ所要時間（参考時間の反映など）。時間枠とは別に保存する
  ) => {
    const estimated = estimatedMinutes ?? computeMinutesFromRange(startTime, endTime);
    const task = await adapter.createTask({
      date: dateKey,
      title,
      start_time: startTime,
      end_time: endTime,
      estimated_minutes: estimated,
      sort_order: tasks.length
    });
    if (task) loadData();
  };

  const toggleComplete = async (task: Task) => {
    const ok = await adapter.updateTask(task.id, { is_completed: !task.is_completed });
    if (ok) loadData();
  };

  const deleteTask = async (taskId: string) => {
    // 紐づく実績は削除されず「予定外」として残る（DBは on delete set null）。事前に知らせる
    const linkedCount = actuals.filter((a) => a.task_id === taskId).length;
    if (
      linkedCount > 0 &&
      !window.confirm(`この予定に紐づく実績が${linkedCount}件あります。実績は削除されず「予定外」になります。削除しますか？`)
    ) {
      return;
    }
    const ok = await adapter.deleteTask(taskId);
    if (ok) loadData();
    else setActionError("予定の削除に失敗しました。時間をおいてもう一度お試しください。");
  };

  // タイトル・時間などの編集用（インライン編集モードの保存で使う汎用更新）
  const updateTask = async (id: string, patch: Partial<Task>) => {
    const current = tasks.find((t) => t.id === id);

    // 所要時間（estimated_minutes）と時間枠（開始・終了）は別々に保存される。
    // - 所要時間が明示的に渡されたら、そのまま保存する。
    // - 時間枠だけが変わったときは、従来どおり時間枠から所要時間を再計算する。
    //   ただし、現在の所要時間が時間枠と異なる値（本人が選んだ値）なら上書きしない。
    const nextStart = patch.start_time !== undefined ? patch.start_time : current?.start_time ?? null;
    const nextEnd = patch.end_time !== undefined ? patch.end_time : current?.end_time ?? null;
    const timesChanged = patch.start_time !== undefined || patch.end_time !== undefined;
    const currentDerived = computeMinutesFromRange(current?.start_time ?? null, current?.end_time ?? null);
    const hasExplicitEstimate =
      current?.estimated_minutes != null && current.estimated_minutes !== currentDerived;

    const fullPatch: Partial<Task> = { ...patch };
    if (patch.estimated_minutes === undefined && timesChanged && !hasExplicitEstimate) {
      fullPatch.estimated_minutes = computeMinutesFromRange(nextStart, nextEnd);
    }

    // 楽観的更新（体感速度優先）
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fullPatch } : t)));
    await adapter.updateTask(id, fullPatch);
  };

  // --------------------------------------------------------
  // 実績：予定からのワンタップ転記 & 直接追加 & 編集
  // --------------------------------------------------------
  // 予定から実績を作成する。予定に「紐づける」だけで、予定の時刻・所要時間は実績へコピーしない
  // （実際にその時間だけ活動したかは未確認のため。時間はユーザーが入力したときだけ記録する）。
  // 作成後は、その実績が編集状態で開き、すぐ時間を入力できる。
  const transcribeTask = async (task: Task) => {
    const actual = await adapter.createActual({
      date: dateKey,
      task_id: task.id,
      title: task.title,
      start_time: null,
      end_time: null,
      actual_minutes: null,
      sort_order: actuals.length
    });
    if (actual) {
      setAutoEditActualId(actual.id);
      loadData();
    } else setActionError("実績の追加に失敗しました。時間をおいてもう一度お試しください。");
  };

  // 予定に無かった行動を実績へ直接追加する（task_id は null のまま）
  const addActual = async (
    title: string,
    startTime: string | null,
    endTime: string | null,
    taskId: string | null = null
  ) => {
    if (taskId && !tasks.some((t) => t.id === taskId)) {
      setActionError("選択した予定が見つかりません。予定外として追加するか、選び直してください。");
      return;
    }
    const actual = await adapter.createActual({
      date: dateKey,
      task_id: taskId,
      title,
      start_time: startTime,
      end_time: endTime,
      actual_minutes: computeMinutesFromRange(startTime, endTime),
      // フォームに本人が入力した時間は確認済み（時間を入れなければ未確認のまま）
      time_confirmed: computeMinutesFromRange(startTime, endTime) !== null,
      sort_order: actuals.length
    });
    if (actual) loadData();
    else setActionError("実績の追加に失敗しました。時間をおいてもう一度お試しください。");
  };

  /** AI一言入力の候補を一括登録。候補ごとに日付が違ってもよい。全件成功で true */
  const addActualsBulk = async (items: ActualCandidate[]): Promise<boolean> => {
    let allOk = true;
    const countByDate: Record<string, number> = {};
    for (const it of items) {
      const start = it.start_time || null;
      const end = it.end_time || null;
      const baseOrder = it.date === dateKey ? actuals.length : 0;
      const offset = countByDate[it.date] ?? 0;
      countByDate[it.date] = offset + 1;
      const created = await adapter.createActual({
        date: it.date,
        // 紐づけは表示中の日の予定に限る（別日付の候補には予定を紐づけない）
        task_id: it.date === dateKey && it.task_id && tasks.some((t) => t.id === it.task_id) ? it.task_id : null,
        title: it.title,
        start_time: start,
        end_time: end,
        actual_minutes: computeMinutesFromRange(start, end) ?? it.duration_minutes,
        // 候補カードで本人が内容を確認して登録した時間は確認済み
        time_confirmed: (computeMinutesFromRange(start, end) ?? it.duration_minutes) !== null,
        sort_order: baseOrder + offset
      });
      if (!created) allOk = false;
    }
    loadData();
    return allOk;
  };

  const updateActual = async (id: string, patch: Partial<ActualLog>) => {
    const current = actuals.find((a) => a.id === id);
    if (!current) return;

    // 予定の付け替え: 同じ日の予定にだけ紐づけられる（日付をまたいだ紐づけは行わない）
    if (patch.task_id) {
      const target = tasks.find((t) => t.id === patch.task_id);
      if (!target || target.date !== current.date) {
        setActionError("この実績と同じ日の予定にだけ紐づけできます。");
        return;
      }
    }

    // 時間（開始・終了）が変わるときだけ所要分を再計算する。
    // メモや予定の付け替えでは actual_minutes を触らない（AI一言入力の「所要時間のみ」実績を消さないため）
    const timeChanged = patch.start_time !== undefined || patch.end_time !== undefined;
    const fullPatch: Partial<ActualLog> = { ...patch };
    if (timeChanged) {
      const nextStart = patch.start_time !== undefined ? patch.start_time : current.start_time;
      const nextEnd = patch.end_time !== undefined ? patch.end_time : current.end_time;
      // 開始・終了が揃っていればそこから計算。揃っていなければ、ユーザーが入力した所要時間（無ければ未入力）
      fullPatch.actual_minutes =
        computeMinutesFromRange(nextStart, nextEnd) ?? patch.actual_minutes ?? null;
    }

    // 楽観的更新（体感速度優先）。失敗したら元に戻す
    setActuals((prev) => prev.map((a) => (a.id === id ? { ...a, ...fullPatch } : a)));
    const ok = await adapter.updateActual(id, fullPatch);
    if (!ok) {
      setActuals((prev) => prev.map((a) => (a.id === id ? current : a)));
      setActionError("実績の更新に失敗しました。変更を元に戻しました。");
    } else if (fullPatch.time_confirmed !== undefined || timeChanged) {
      loadEstimateHistory(); // 確認状態・時間が変わったら参考時間の元データを更新
    }
  };

  const deleteActual = async (id: string) => {
    const ok = await adapter.deleteActual(id);
    if (ok) loadData();
    else setActionError("実績の削除に失敗しました。時間をおいてもう一度お試しください。");
  };

  // --------------------------------------------------------
  // 並び替え（ドラッグ＆ドロップ）
  // --------------------------------------------------------
  const reorderTasks = async (newOrder: Task[]) => {
    setTasks(newOrder); // 楽観的更新
    await Promise.all(newOrder.map((t, idx) => adapter.updateTask(t.id, { sort_order: idx })));
  };

  const reorderActuals = async (newOrder: ActualLog[]) => {
    setActuals(newOrder); // 楽観的更新
    await Promise.all(newOrder.map((a, idx) => adapter.updateActual(a.id, { sort_order: idx })));
  };

  // --------------------------------------------------------
  // 「今週のToDo」プール CRUD
  // --------------------------------------------------------
  // 成功可否を呼び出し元（フォーム）へ返す。失敗時にフォームの入力内容を
  // 消してしまわないよう、成功したときだけ true を返す。
  const addWeeklyTodo = async (
    title: string,
    estimatedMinutes: number | null
  ): Promise<boolean> => {
    // 追加先は、ドロワーで表示中の週（今週を見ていれば今週、来週を見ていれば来週の計画）
    const item = await adapter.createWeeklyTodo({
      week_start: viewWeekRef.current,
      title,
      estimated_minutes: estimatedMinutes,
      sort_order: weeklyTodos.length
    });
    if (!item) return false;
    // 楽観的に即座にリストへ反映（再取得を待たずに表示する）。
    // 保存中に別の週へ切り替えられていた場合は、表示中のリストに混ぜない。
    if (item.week_start === viewWeekRef.current) {
      setWeeklyTodos((prev) => [...prev, item]);
    }
    return true;
  };

  // 過去の週の未完了タスクを今週へ繰り越す。
  // week_start を今週に更新し、今週リストの末尾に並ぶよう sort_order を振り直す。
  // 完了済み・今週以降のタスクは対象外（誤って動かさないための安全策）。成功した件数を返す。
  const carryOverWeeklyTodos = async (targets: WeeklyTodo[]): Promise<number> => {
    const targetWeekKey = getCurrentWeekStartKey();
    const movable = targets.filter((t) => !t.is_completed && t.week_start < targetWeekKey);
    if (movable.length === 0) return 0;

    const existing = await adapter.listWeeklyTodos(targetWeekKey);
    const base = existing.reduce((max, t) => Math.max(max, t.sort_order), -1) + 1;

    const results = await Promise.all(
      movable.map((t, i) =>
        adapter.updateWeeklyTodo(t.id, { week_start: targetWeekKey, sort_order: base + i })
      )
    );
    await loadWeeklyTodos(); // 繰り越したタスクは表示中の過去週のリストから消える
    return results.filter(Boolean).length;
  };

  const toggleWeeklyTodoComplete = async (todo: WeeklyTodo) => {
    const ok = await adapter.updateWeeklyTodo(todo.id, { is_completed: !todo.is_completed });
    if (ok) loadWeeklyTodos();
  };

  const updateWeeklyTodo = async (id: string, patch: Partial<WeeklyTodo>) => {
    setWeeklyTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await adapter.updateWeeklyTodo(id, patch);
  };

  const deleteWeeklyTodo = async (id: string) => {
    const ok = await adapter.deleteWeeklyTodo(id);
    if (ok) loadWeeklyTodos();
  };

  // 週タスクを「本日の予定ToDo」（画面に表示中の日付）へ転送する。
  // ①「今日やる」ボタンと ②ドラッグ＆ドロップ の両方からここを呼ぶ。
  const assignWeeklyTodoToday = async (todo: WeeklyTodo) => {
    const newTask = await adapter.createTask({
      date: dateKey,
      title: todo.title,
      start_time: null,
      end_time: null,
      estimated_minutes: todo.estimated_minutes,
      sort_order: tasks.length
    });
    if (!newTask) return;

    await adapter.updateWeeklyTodo(todo.id, { assigned_task_id: newTask.id, assigned_date: dateKey });
    loadData();
    loadWeeklyTodos();
  };

  // 全ドラッグ＆ドロップの受け口。ドロップ元/先の droppableId で処理を振り分ける。
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;

    // 今週のToDoプール → 本日の予定ToDo（転送）
    if (source.droppableId === "weekly-pool" && destination.droppableId === "task-list") {
      const weeklyTodoId = draggableId.replace(/^weekly:/, "");
      const todo = weeklyTodos.find((t) => t.id === weeklyTodoId);
      if (todo && todo.assigned_date !== dateKey) {
        assignWeeklyTodoToday(todo);
      }
      return;
    }

    // 予定ToDo内の並び替え
    if (source.droppableId === "task-list" && destination.droppableId === "task-list") {
      const reordered = Array.from(tasks);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      reorderTasks(reordered);
      return;
    }

    // 実績内の並び替え
    if (source.droppableId === "actual-list" && destination.droppableId === "actual-list") {
      const reordered = Array.from(actuals);
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      reorderActuals(reordered);
      return;
    }
  };

  // --------------------------------------------------------
  // 差分計算
  // --------------------------------------------------------
  const diffs = useMemo(() => buildTaskDiffs(tasks, actuals), [tasks, actuals]);
  const diffsByTaskId = useMemo(() => {
    const m = new Map<string, TaskDiff>();
    for (const d of diffs) if (d.task) m.set(d.task.id, d);
    return m;
  }, [diffs]);

  // --------------------------------------------------------
  // AIコーチング
  // --------------------------------------------------------
  const buildDiffContext = () => {
    return diffs
      .filter((d) => d.task || d.actual)
      .map((d) => {
        const title = d.task?.title ?? d.actual?.title ?? "(不明)";
        const diffText = d.diffMinutes !== null ? formatMinutes(d.diffMinutes) : "データ不足";
        const memos = d.actuals.map((a) => a.memo).filter(Boolean).join(" / ");
        const state = !d.task ? "（予定外）" : d.actuals.length === 0 ? "（実績未記録）" : "";
        return `・${title}${state}: 予定${d.estimatedMinutes ?? "―"}分 / 実績${d.actualMinutes ?? "―"}分${
          d.actuals.length > 1 ? `（${d.actuals.length}回に分けて実施）` : ""
        } / 差分${diffText}${memos ? ` / メモ: ${memos}` : ""}`;
      })
      .join("\n");
  };

  const persistReflection = async (messages: ReflectionMessage[]) => {
    const saved = await adapter.saveReflection(dateKey, reflection?.id ?? null, messages);
    if (saved) setReflection(saved);
  };

  type AiErrorInfo = { message: string; hint?: string; retry: () => void };

  /** /api/ai-coach を呼び、成功なら reply、失敗なら人間が読めるエラーを返す */
  const callCoach = async (
    payload: Record<string, unknown>
  ): Promise<{ reply: string } | { message: string; hint?: string }> => {
    let res: Response;
    try {
      res = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("[ai-coach] 通信エラー", e);
      return { message: "通信エラー", hint: "ネットワーク接続を確認して、もう一度お試しください。" };
    }
    let json: { reply?: string; error?: string; hint?: string; code?: string } = {};
    try {
      json = await res.json();
    } catch {
      /* 非JSON応答 */
    }
    if (!res.ok || !json.reply) {
      console.error("[ai-coach] APIエラー", res.status, json);
      return {
        message: json.error ?? `サーバーエラー (${res.status})`,
        hint: json.hint ?? "サーバーログを確認してください。"
      };
    }
    return { reply: json.reply };
  };

  const startReflection = async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      const result = await callCoach({ mode: "start", diffContext: buildDiffContext(), history: [] });
      if ("reply" in result) {
        await persistReflection([
          { role: "model", content: result.reply, created_at: new Date().toISOString() }
        ]);
      } else {
        setAiError({ ...result, retry: startReflection });
      }
    } finally {
      setAiLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!reflection) return;
    setAiError(null);
    setAiLoading(true);
    const userMsg: ReflectionMessage = {
      role: "user",
      content: text,
      created_at: new Date().toISOString()
    };
    const historyBefore = reflection.messages;
    const optimisticMessages = [...historyBefore, userMsg];
    setReflection({ ...reflection, messages: optimisticMessages });

    try {
      const result = await callCoach({
        mode: "reply",
        diffContext: buildDiffContext(),
        history: historyBefore,
        userMessage: text
      });
      if ("reply" in result) {
        await persistReflection([
          ...optimisticMessages,
          { role: "model", content: result.reply, created_at: new Date().toISOString() }
        ]);
      } else {
        // 失敗した発言は履歴から外し（保存もしない）、再送できるようにする
        setReflection((r) => (r ? { ...r, messages: historyBefore } : r));
        setAiError({ ...result, retry: () => sendMessage(text) });
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen bg-paper pb-10">
        <Header
          selectedDate={selectedDate}
          dateLabel={dateLabel}
          isToday={isToday}
          onPrevDay={() =>
            setSelectedDate((d) => {
              const nd = new Date(d);
              nd.setDate(nd.getDate() - 1);
              return nd;
            })
          }
          onNextDay={() =>
            setSelectedDate((d) => {
              const nd = new Date(d);
              nd.setDate(nd.getDate() + 1);
              return nd;
            })
          }
          onToday={() => setSelectedDate(new Date())}
          onSelectDate={(date) => setSelectedDate(date)}
          userId={userId}
          userName={userName}
          userAvatar={userAvatar}
          isSynced={isSynced}
        />

        {actionError && (
          <div
            role="alert"
            className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-lg border border-over/30 bg-over/5 px-3 py-2 text-xs text-over"
          >
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} aria-label="閉じる" className="opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* ゲスト→ログイン移行時の同期状況バナー */}
        {syncing && (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-plan/30 bg-plan/5 px-3 py-2 text-xs text-plan">
            <Cloud size={14} className="animate-pulse" />
            ローカルのデータをクラウドに同期しています...
          </div>
        )}
        {syncResult && !syncing && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-2 rounded-lg border border-plan/30 bg-plan/5 px-3 py-2 text-xs text-plan">
            <span className="flex items-center gap-2">
              <Cloud size={14} />
              ローカルのデータをクラウドに同期しました（予定 {syncResult.tasks}件 / 実績{" "}
              {syncResult.actuals}件 / 今週のToDo {syncResult.weeklyTodos}件 / 振り返り{" "}
              {syncResult.reflections}件）
            </span>
            <button
              onClick={() => setSyncResult(null)}
              aria-label="閉じる"
              className="rounded-full p-1 text-plan/60 transition hover:bg-plan/10 hover:text-plan"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-4">
            <TaskList
              tasks={tasks}
              onAdd={addTask}
              onToggleComplete={toggleComplete}
              onUpdate={updateTask}
              onDelete={deleteTask}
              onTranscribe={transcribeTask}
              diffsByTaskId={diffsByTaskId}
              estimateIndex={estimateIndex}
            />
            <ActualTimeline
              actuals={actuals}
              tasks={tasks}
              currentDate={dateKey}
              onAdd={addActual}
              onAddBulk={addActualsBulk}
              onUpdate={updateActual}
              onDelete={deleteActual}
              autoEditId={autoEditActualId}
              onAutoEditHandled={() => setAutoEditActualId(null)}
            />
          </div>

          <div className="space-y-4">
            <DiffSummary diffs={diffs} />
            <AiCoachChat
              messages={reflection?.messages ?? []}
              summary={reflection?.summary_analysis ?? null}
              isLoading={aiLoading}
              error={aiError}
              onDismissError={() => setAiError(null)}
              hasDiffData={actuals.length > 0}
              onStartReflection={startReflection}
              onSendMessage={sendMessage}
            />
          </div>
        </main>

        <WeeklyTodoDrawer
          weeklyTodos={weeklyTodos}
          viewWeekKey={viewWeekKey}
          currentWeekKey={currentWeekKey}
          loading={weeklyLoading}
          onChangeWeek={changeViewWeek}
          onCarryOver={carryOverWeeklyTodos}
          onAdd={addWeeklyTodo}
          onToggleComplete={toggleWeeklyTodoComplete}
          onUpdate={updateWeeklyTodo}
          onDelete={deleteWeeklyTodo}
          onAssignToday={assignWeeklyTodoToday}
        />
      </div>
    </DragDropContext>
  );
}
