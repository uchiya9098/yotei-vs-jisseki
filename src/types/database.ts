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
  variance_reasons: string[]; // ズレの理由キー（lib/variance-reasons.ts）。未選択は []
  time_confirmed: boolean; // 実績時間を本人が入力・確認したか。既存データは false（見積もりの参考には使わない）
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
  task: Task | null; // null = 予定に紐づかない実績（予定外）
  actual: ActualLog | null; // 代表の実績（最初の1件）。複数あるときは actuals を参照
  actuals: ActualLog[]; // この予定に紐づく全ての実績（中断・再開で複数になりうる）
  estimatedMinutes: number | null; // 予定時間（未設定ならnull）
  actualMinutes: number | null; // 紐づく実績の合計。時間が1件も記録されていなければnull（推測しない）
  actualPartial: boolean; // 一部の実績が時間未入力（この場合は差分を出さない）
  diffMinutes: number | null; // actual - estimated。両方が確定しているときだけ値を持つ
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
