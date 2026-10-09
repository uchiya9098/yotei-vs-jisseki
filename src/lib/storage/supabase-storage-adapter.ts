"use client";

import { createClient } from "@/lib/supabase/client";
import type { ReflectionMessage } from "@/types/database";
import type { NewActualInput, NewTaskInput, NewWeeklyTodoInput, StorageAdapter } from "./types";

// これまでDashboard.tsx等に直書きしていたSupabase呼び出しを、
// StorageAdapterインターフェースの形にまとめ直したもの。挙動は従来と同じ。
export function createSupabaseStorageAdapter(userId: string): StorageAdapter {
  const supabase = createClient();

  return {
    mode: "cloud",

    // ---------------- 予定 ToDo ----------------
    async listTasksByDate(date) {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("予定ToDoの取得に失敗しました:", error);
        return [];
      }
      return data ?? [];
    },
    async createTask(input: NewTaskInput) {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ user_id: userId, ...input })
        .select()
        .single();
      if (error || !data) {
        console.error("予定ToDoの追加に失敗しました:", error);
        return null;
      }
      return data;
    },
    async updateTask(id, patch) {
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) {
        console.error("予定ToDoの更新に失敗しました:", error);
        return false;
      }
      return true;
    },
    async deleteTask(id) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) {
        console.error("予定ToDoの削除に失敗しました:", error);
        return false;
      }
      return true;
    },

    // ---------------- 実績 ----------------
    async listActualsByDate(date) {
      const { data, error } = await supabase
        .from("actual_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("実績の取得に失敗しました:", error);
        return [];
      }
      return data ?? [];
    },
    async createActual(input: NewActualInput) {
      const { data, error } = await supabase
        .from("actual_logs")
        .insert({ user_id: userId, ...input })
        .select()
        .single();
      if (error || !data) {
        console.error("実績の追加に失敗しました:", error);
        return null;
      }
      return data;
    },
    async updateActual(id, patch) {
      const { error } = await supabase.from("actual_logs").update(patch).eq("id", id);
      if (error) {
        console.error("実績の更新に失敗しました:", error);
        return false;
      }
      return true;
    },
    async deleteActual(id) {
      const { error } = await supabase.from("actual_logs").delete().eq("id", id);
      if (error) {
        console.error("実績の削除に失敗しました:", error);
        return false;
      }
      return true;
    },

    // ---------------- 今週のToDo ----------------
    async listWeeklyTodos(weekStart) {
      const { data, error } = await supabase
        .from("weekly_todos")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("今週のToDoの取得に失敗しました:", error);
        return [];
      }
      return data ?? [];
    },
    async createWeeklyTodo(input: NewWeeklyTodoInput) {
      const { data, error } = await supabase
        .from("weekly_todos")
        .insert({ user_id: userId, ...input })
        .select()
        .single();
      if (error || !data) {
        console.error("今週のToDoの追加に失敗しました:", error);
        return null;
      }
      return data;
    },
    async updateWeeklyTodo(id, patch) {
      const { error } = await supabase.from("weekly_todos").update(patch).eq("id", id);
      if (error) {
        console.error("今週のToDoの更新に失敗しました:", error);
        return false;
      }
      return true;
    },
    async deleteWeeklyTodo(id) {
      const { error } = await supabase.from("weekly_todos").delete().eq("id", id);
      if (error) {
        console.error("今週のToDoの削除に失敗しました:", error);
        return false;
      }
      return true;
    },

    // ---------------- AI振り返り ----------------
    async getReflection(date) {
      const { data, error } = await supabase
        .from("ai_reflections")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("AI振り返りの取得に失敗しました:", error);
        return null;
      }
      return data ?? null;
    },
    async saveReflection(date, existingId, messages: ReflectionMessage[]) {
      if (existingId) {
        const { data, error } = await supabase
          .from("ai_reflections")
          .update({ messages })
          .eq("id", existingId)
          .select()
          .single();
        if (error) {
          console.error("AI振り返りの更新に失敗しました:", error);
          return null;
        }
        return data;
      }
      const { data, error } = await supabase
        .from("ai_reflections")
        .insert({ user_id: userId, date, messages })
        .select()
        .single();
      if (error) {
        console.error("AI振り返りの保存に失敗しました:", error);
        return null;
      }
      return data;
    },

    // ---------------- Realtime購読（マルチデバイス同期） ----------------
    subscribeToChanges(onChange) {
      const channel = supabase
        .channel(`sync-${userId}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
          onChange
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "actual_logs", filter: `user_id=eq.${userId}` },
          onChange
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "weekly_todos", filter: `user_id=eq.${userId}` },
          onChange
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ai_reflections", filter: `user_id=eq.${userId}` },
          onChange
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  };
}
