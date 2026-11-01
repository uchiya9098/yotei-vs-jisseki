"use client";

import { useMemo } from "react";
import { createLocalStorageAdapter } from "./local-storage-adapter";
import { createSupabaseStorageAdapter } from "./supabase-storage-adapter";
import type { StorageAdapter } from "./types";

// userId があればクラウド（Supabase）、なければローカル（ゲストモード）のアダプターを返す。
// コンポーネント側はこのフックが返すオブジェクトのメソッドだけを呼べばよく、
// ログイン状態を個別に分岐する必要はない。
export function useStorageAdapter(userId: string | null): StorageAdapter {
  return useMemo(() => {
    return userId ? createSupabaseStorageAdapter(userId) : createLocalStorageAdapter();
  }, [userId]);
}
