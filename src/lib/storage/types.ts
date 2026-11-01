import type { ActualLog, AiReflection, ReflectionMessage, Task, WeeklyTodo } from "@/types/database";

// 新規作成時に呼び出し側が渡す入力（id/user_id/created_at等はアダプター側で付与する）
export type NewTaskInput = {
  date: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  estimated_minutes: number | null;
  sort_order: number;
};

export type NewActualInput = {
  date: string;
  task_id: string | null;
  title: string;
  start_time: string | null;
  end_time: string | null;
  actual_minutes: number | null;
  sort_order: number;
};

export type NewWeeklyTodoInput = {
  week_start: string;
  title: string;
  estimated_minutes: number | null;
  sort_order: number;
};

/**
 * データアクセス層の共通インターフェース。
 *
 * ログイン時は SupabaseStorageAdapter（クラウド）、未ログイン（ゲストモード）時は
 * LocalStorageAdapter（ブラウザのlocalStorage）が同じ形で実装する。
 * Dashboard などのコンポーネント側は、どちらの実装かを一切意識せず
 * このインターフェースのメソッドだけを呼び出せばよい。
 */
export interface StorageAdapter {
  readonly mode: "local" | "cloud";

  // 予定 ToDo（tasks）
  listTasksByDate(date: string): Promise<Task[]>;
  createTask(input: NewTaskInput): Promise<Task | null>;
  updateTask(id: string, patch: Partial<Task>): Promise<boolean>;
  deleteTask(id: string): Promise<boolean>;

  // 実績（actual_logs）
  listActualsByDate(date: string): Promise<ActualLog[]>;
  createActual(input: NewActualInput): Promise<ActualLog | null>;
  updateActual(id: string, patch: Partial<ActualLog>): Promise<boolean>;
  deleteActual(id: string): Promise<boolean>;

  // 今週のToDo（weekly_todos）
  listWeeklyTodos(weekStart: string): Promise<WeeklyTodo[]>;
  createWeeklyTodo(input: NewWeeklyTodoInput): Promise<WeeklyTodo | null>;
  updateWeeklyTodo(id: string, patch: Partial<WeeklyTodo>): Promise<boolean>;
  deleteWeeklyTodo(id: string): Promise<boolean>;

  // AIコーチングの振り返り（ai_reflections、日付につき1件）
  getReflection(date: string): Promise<AiReflection | null>;
  saveReflection(
    date: string,
    existingId: string | null,
    messages: ReflectionMessage[]
  ): Promise<AiReflection | null>;

  // 変更検知。クラウドはSupabase Realtime、ローカルは同一ブラウザの別タブでの変更を検知する。
  // 戻り値の関数を呼ぶと購読解除される。
  subscribeToChanges(onChange: () => void): () => void;
}
