"use client";

import type { ActualLog, AiReflection, ReflectionMessage, Task, WeeklyTodo } from "@/types/database";
import type { NewActualInput, NewTaskInput, NewWeeklyTodoInput, StorageAdapter } from "./types";

// すべてのゲストデータはこのブラウザの localStorage 上、固定キーの下にJSON配列として保存する。
// ユーザーごとの区別は不要（未ログイン状態＝このブラウザの単一ゲスト）。
export const LOCAL_STORAGE_KEYS = {
  tasks: "yotei_local_tasks",
  actuals: "yotei_local_actuals",
  weeklyTodos: "yotei_local_weekly_todos",
  reflections: "yotei_local_reflections"
} as const;

const GUEST_USER_ID = "guest";

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch (err) {
    console.error(`ローカルデータの読み込みに失敗しました (${key}):`, err);
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`ローカルデータの保存に失敗しました (${key}):`, err);
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    mode: "local",

    // ---------------- 予定 ToDo ----------------
    async listTasksByDate(date) {
      return readArray<Task>(LOCAL_STORAGE_KEYS.tasks)
        .filter((t) => t.date === date)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    async createTask(input: NewTaskInput) {
      const tasks = readArray<Task>(LOCAL_STORAGE_KEYS.tasks);
      const task: Task = {
        id: newId(),
        user_id: GUEST_USER_ID,
        is_completed: false,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...input
      };
      tasks.push(task);
      writeArray(LOCAL_STORAGE_KEYS.tasks, tasks);
      return task;
    },
    async updateTask(id, patch) {
      const tasks = readArray<Task>(LOCAL_STORAGE_KEYS.tasks);
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      tasks[idx] = { ...tasks[idx], ...patch, updated_at: nowIso() };
      writeArray(LOCAL_STORAGE_KEYS.tasks, tasks);
      return true;
    },
    async deleteTask(id) {
      const tasks = readArray<Task>(LOCAL_STORAGE_KEYS.tasks);
      writeArray(
        LOCAL_STORAGE_KEYS.tasks,
        tasks.filter((t) => t.id !== id)
      );
      // 削除したタスクを参照していた実績・今週のToDoのリンクも外しておく
      const actuals = readArray<ActualLog>(LOCAL_STORAGE_KEYS.actuals).map((a) =>
        a.task_id === id ? { ...a, task_id: null } : a
      );
      writeArray(LOCAL_STORAGE_KEYS.actuals, actuals);
      const weeklyTodos = readArray<WeeklyTodo>(LOCAL_STORAGE_KEYS.weeklyTodos).map((w) =>
        w.assigned_task_id === id ? { ...w, assigned_task_id: null, assigned_date: null } : w
      );
      writeArray(LOCAL_STORAGE_KEYS.weeklyTodos, weeklyTodos);
      return true;
    },

    // ---------------- 実績 ----------------
    async listActualsByDate(date) {
      return readArray<ActualLog>(LOCAL_STORAGE_KEYS.actuals)
        .filter((a) => a.date === date)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    async createActual(input: NewActualInput) {
      const actuals = readArray<ActualLog>(LOCAL_STORAGE_KEYS.actuals);
      const actual: ActualLog = {
        id: newId(),
        user_id: GUEST_USER_ID,
        memo: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...input
      };
      actuals.push(actual);
      writeArray(LOCAL_STORAGE_KEYS.actuals, actuals);
      return actual;
    },
    async updateActual(id, patch) {
      const actuals = readArray<ActualLog>(LOCAL_STORAGE_KEYS.actuals);
      const idx = actuals.findIndex((a) => a.id === id);
      if (idx === -1) return false;
      actuals[idx] = { ...actuals[idx], ...patch, updated_at: nowIso() };
      writeArray(LOCAL_STORAGE_KEYS.actuals, actuals);
      return true;
    },
    async deleteActual(id) {
      const actuals = readArray<ActualLog>(LOCAL_STORAGE_KEYS.actuals);
      writeArray(
        LOCAL_STORAGE_KEYS.actuals,
        actuals.filter((a) => a.id !== id)
      );
      return true;
    },

    // ---------------- 今週のToDo ----------------
    async listWeeklyTodos(weekStart) {
      return readArray<WeeklyTodo>(LOCAL_STORAGE_KEYS.weeklyTodos)
        .filter((w) => w.week_start === weekStart)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    async createWeeklyTodo(input: NewWeeklyTodoInput) {
      const items = readArray<WeeklyTodo>(LOCAL_STORAGE_KEYS.weeklyTodos);
      const item: WeeklyTodo = {
        id: newId(),
        user_id: GUEST_USER_ID,
        is_completed: false,
        assigned_task_id: null,
        assigned_date: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...input
      };
      items.push(item);
      writeArray(LOCAL_STORAGE_KEYS.weeklyTodos, items);
      return item;
    },
    async updateWeeklyTodo(id, patch) {
      const items = readArray<WeeklyTodo>(LOCAL_STORAGE_KEYS.weeklyTodos);
      const idx = items.findIndex((w) => w.id === id);
      if (idx === -1) return false;
      items[idx] = { ...items[idx], ...patch, updated_at: nowIso() };
      writeArray(LOCAL_STORAGE_KEYS.weeklyTodos, items);
      return true;
    },
    async deleteWeeklyTodo(id) {
      const items = readArray<WeeklyTodo>(LOCAL_STORAGE_KEYS.weeklyTodos);
      writeArray(
        LOCAL_STORAGE_KEYS.weeklyTodos,
        items.filter((w) => w.id !== id)
      );
      return true;
    },

    // ---------------- AI振り返り ----------------
    async getReflection(date) {
      const reflections = readArray<AiReflection>(LOCAL_STORAGE_KEYS.reflections);
      return reflections.find((r) => r.date === date) ?? null;
    },
    async saveReflection(date, existingId, messages: ReflectionMessage[]) {
      const reflections = readArray<AiReflection>(LOCAL_STORAGE_KEYS.reflections);
      if (existingId) {
        const idx = reflections.findIndex((r) => r.id === existingId);
        if (idx !== -1) {
          reflections[idx] = { ...reflections[idx], messages, updated_at: nowIso() };
          writeArray(LOCAL_STORAGE_KEYS.reflections, reflections);
          return reflections[idx];
        }
      }
      const reflection: AiReflection = {
        id: newId(),
        user_id: GUEST_USER_ID,
        date,
        messages,
        summary_analysis: null,
        created_at: nowIso(),
        updated_at: nowIso()
      };
      reflections.push(reflection);
      writeArray(LOCAL_STORAGE_KEYS.reflections, reflections);
      return reflection;
    },

    // 同じブラウザの別タブで変更があったときだけ検知する（自タブでの変更では発火しない）
    subscribeToChanges(onChange) {
      if (typeof window === "undefined") return () => {};
      const keys: string[] = Object.values(LOCAL_STORAGE_KEYS);
      const handler = (e: StorageEvent) => {
        if (e.key && keys.includes(e.key)) onChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    }
  };
}

// ---------------- ログイン時の一括同期で使う補助関数 ----------------

export function getAllLocalData() {
  return {
    tasks: readArray<Task>(LOCAL_STORAGE_KEYS.tasks),
    actuals: readArray<ActualLog>(LOCAL_STORAGE_KEYS.actuals),
    weeklyTodos: readArray<WeeklyTodo>(LOCAL_STORAGE_KEYS.weeklyTodos),
    reflections: readArray<AiReflection>(LOCAL_STORAGE_KEYS.reflections)
  };
}

export function hasAnyLocalData(): boolean {
  const data = getAllLocalData();
  return (
    data.tasks.length > 0 ||
    data.actuals.length > 0 ||
    data.weeklyTodos.length > 0 ||
    data.reflections.length > 0
  );
}

export function clearAllLocalData() {
  writeArray(LOCAL_STORAGE_KEYS.tasks, []);
  writeArray(LOCAL_STORAGE_KEYS.actuals, []);
  writeArray(LOCAL_STORAGE_KEYS.weeklyTodos, []);
  writeArray(LOCAL_STORAGE_KEYS.reflections, []);
}
