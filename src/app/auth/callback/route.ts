import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Google OAuth 認証後にSupabaseがリダイレクトしてくるエンドポイント。
// 認可コードをセッションに交換してからトップページへ戻す。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
