import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";

// 未ログインでも /login へリダイレクトせず、そのままゲストモードのダッシュボードを表示する。
// ゲストのデータはブラウザのlocalStorageに保存され、後からログインした際にクラウドへ同期される。
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <Dashboard
      userId={user?.id ?? null}
      userEmail={user?.email ?? ""}
      userAvatar={(user?.user_metadata?.avatar_url as string) ?? null}
      userName={(user?.user_metadata?.full_name as string) ?? user?.email ?? "ゲスト"}
    />
  );
}
