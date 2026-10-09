export type Task = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  title: string;
  start_time: string | null; // HH:mm:ss
  end_time: string | null;
  estimated_minutes: number | null;
  sort_order: number;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type ActualLog = {
  id: string;
  user_id: string;
  task_id: string | null;
  date: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  actual_minutes: number | null;
  memo: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ReflectionMessage = {
  role: "user" | "model";
  content: string;
  created_at: string;
};

export type AiReflection = {
  id: string;
  user_id: string;
  date: string;
  messages: ReflectionMessage[];
  summary_analysis: string | null;
  created_at: string;
  updated_at: string;
};

// task / actual_log をペアにして差分表示するためのビューモデル
export type TaskDiff = {
  task: Task | null;
  actual: ActualLog | null;
  diffMinutes: number | null; // actual - estimated
};

export type PeriodMode = "week" | "month";

export type WeeklyTodo = {
  id: string;
  user_id: string;
  week_start: string; // YYYY-MM-DD（その週の月曜日）
  title: string;
  estimated_minutes: number | null;
  is_completed: boolean;
  assigned_task_id: string | null;
  assigned_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AiPeriodSummary = {
  id: string;
  user_id: string;
  period_type: PeriodMode;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  summary: string;
  created_at: string;
};
