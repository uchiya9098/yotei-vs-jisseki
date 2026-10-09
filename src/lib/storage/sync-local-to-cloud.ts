"use client";

import { createClient } from "@/lib/supabase/client";
import { clearAllLocalData, getAllLocalData, hasAnyLocalData } from "./local-storage-adapter";

export { hasAnyLocalData };

export type SyncResult = {
  tasks: number;
  actuals: number;
  weeklyTodos: number;
  reflections: number;
};

export function syncResultTotal(result: SyncResult): number {
  return result.tasks + result.actuals + result.weeklyTodos + result.reflections;
}

/**
 * ゲストモードで貯めたローカルデータを、ログインしたユーザーのSupabaseへ一括アップロードする。
 *
 * ローカルで発行したUUID（crypto.randomUUID()）をそのまま tasks.id / actual_logs.id /
 * weekly_todos.id として使ってアップロードすることで、実績の task_id や
 * 今週のToDoの assigned_task_id が指していた紐づきをID変換なしにそのまま維持できる。
 *
 * 外部キー制約があるため、tasks → actual_logs / weekly_todos の順で
 * （並列ではなく）順番にアップロードする。upsert なので、途中で失敗して
 * 再ログイン時にもう一度呼ばれても、同じ行が重複作成されることはない。
 */
export async function syncLocalDataToCloud(userId: string): Promise<SyncResult> {
  const local = getAllLocalData();
  const supabase = createClient();
  const result: SyncResult = { tasks: 0, actuals: 0, weeklyTodos: 0, reflections: 0 };

  if (local.tasks.length > 0) {
    const rows = local.tasks.map((t) => ({ ...t, user_id: userId }));
    const { error } = await supabase.from("tasks").upsert(rows, { onConflict: "id" });
    if (error) console.error("タスクの同期に失敗しました:", error);
    else result.tasks = rows.length;
  }

  if (local.actuals.length > 0) {
    const rows = local.actuals.map((a) => ({ ...a, user_id: userId }));
    const { error } = await supabase.from("actual_logs").upsert(rows, { onConflict: "id" });
    if (error) console.error("実績の同期に失敗しました:", error);
    else result.actuals = rows.length;
  }

  if (local.weeklyTodos.length > 0) {
    const rows = local.weeklyTodos.map((w) => ({ ...w, user_id: userId }));
    const { error } = await supabase.from("weekly_todos").upsert(rows, { onConflict: "id" });
    if (error) console.error("今週のToDoの同期に失敗しました:", error);
    else result.weeklyTodos = rows.length;
  }

  if (local.reflections.length > 0) {
    const rows = local.reflections.map((r) => ({ ...r, user_id: userId }));
    const { error } = await supabase.from("ai_reflections").upsert(rows, { onConflict: "id" });
    if (error) console.error("AI振り返りの同期に失敗しました:", error);
    else result.reflections = rows.length;
  }

  // すべて成功した場合のみローカルを空にする（クラウドを正として一本化）。
  // 一部失敗していたらローカルは残す＝次回ログイン時に再試行される（upsertなので安全）。
  const totalLocal =
    local.tasks.length + local.actuals.length + local.weeklyTodos.length + local.reflections.length;
  if (syncResultTotal(result) === totalLocal) {
    clearAllLocalData();
  }

  return result;
}
