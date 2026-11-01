import { GoogleGenAI } from "@google/genai";

/** 使用モデル。gemini-1.5 系は提供終了のため既定を 2.5 系に。GEMINI_MODEL で上書き可能。 */
export const COACH_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const SUMMARY_MODEL = process.env.GEMINI_SUMMARY_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";

export type ApiErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "RATE_LIMIT"
  | "MODEL_NOT_FOUND"
  | "BAD_REQUEST"
  | "SAFETY_BLOCKED"
  | "EMPTY_RESPONSE"
  | "UPSTREAM_ERROR"
  | "INTERNAL";

export type ApiErrorBody = { error: string; code: ApiErrorCode; hint: string };

/** キー未設定ならnullを返す（モジュール読み込み時にnon-null assertionで落とさない） */
export function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

export const missingKeyBody: ApiErrorBody = {
  error: "APIキーが設定されていません",
  code: "MISSING_API_KEY",
  hint: ".env.local（Vercelなら Environment Variables）に GEMINI_API_KEY を設定し、開発サーバーを再起動してください。"
};

/** SDK例外を、ユーザーに見せられる構造化エラーへ変換 */
export function classifyGeminiError(err: unknown): { status: number; body: ApiErrorBody } {
  const e = err as { status?: number; code?: number; message?: string };
  const status = Number(e?.status ?? e?.code ?? 0);
  const msg = String(e?.message ?? err);

  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate/i.test(msg))
    return { status: 429, body: { error: "リクエストが多すぎます（レート制限）", code: "RATE_LIMIT", hint: "少し待ってから再試行してください。無料枠の上限に達している可能性があります。" } };
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg))
    return { status: 502, body: { error: "APIキーが無効、または権限がありません", code: "INVALID_API_KEY", hint: "GEMINI_API_KEY の値を Google AI Studio で確認してください。" } };
  if (status === 404 || /not found|no longer available/i.test(msg))
    return { status: 502, body: { error: "指定のGeminiモデルが利用できません", code: "MODEL_NOT_FOUND", hint: "GEMINI_MODEL 環境変数に利用可能なモデル名（例: gemini-2.5-flash）を指定してください。" } };
  if (status === 400 || /INVALID_ARGUMENT/i.test(msg))
    return { status: 502, body: { error: "Geminiへのリクエスト形式が不正です", code: "BAD_REQUEST", hint: "サーバーログ（AIコーチAPIエラー）の詳細を確認してください。" } };
  return { status: 502, body: { error: "Gemini APIとの通信でエラーが発生しました", code: "UPSTREAM_ERROR", hint: "時間をおいて再試行してください。続く場合はサーバーログを確認してください。" } };
}

export type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

/**
 * Geminiの contents 要件を満たすよう整形する:
 * - 空テキストを除外 / - 同一roleの連続は結合 / - 先頭は必ず "user"
 */
export function normalizeContents(items: { role: string; text: string }[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const it of items) {
    const text = (it.text ?? "").trim();
    if (!text) continue;
    const role = it.role === "model" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n\n${text}`;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
