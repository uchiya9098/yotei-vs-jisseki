import { createBrowserClient } from "@supabase/ssr";

// クライアントコンポーネントから呼び出す Supabase クライアント。
// セッションは Cookie 経由で管理され、PC/スマホ間の同期にも影響しない
// （Realtime購読は各デバイスが個別に張る）。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
