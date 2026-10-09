import { NextResponse } from "next/server";
import type { ReflectionMessage } from "@/types/database";

import {
  COACH_MODEL,
  classifyGeminiError,
  getGeminiClient,
  missingKeyBody,
  normalizeContents,
  type ApiErrorBody
} from "@/lib/gemini";

// サーバー上でのみ実行。Supabaseセッションは不要（ゲストモードでも利用可）。

const SYSTEM_PROMPT = `あなたは行動改善を支援するパーソナルコーチAIです。
ユーザーの「予定」と「実際の行動（実績）」の差分データを見て、
詰問にならないよう共感的かつ簡潔に、1つずつ質問を投げかけながら振り返りをサポートしてください。

方針:
- 一度に複数の質問をしない。1メッセージにつき問いかけは1つまで。
- 予定に時間が設定されているタスクは、なぜ時間差が生まれたのか（見積もりの甘さ、割り込み、集中力など）を掘り下げる。
- 予定に時間が設定されていない（時間指定なしの）タスクや、予定に紐づかず実績だけが記録されているタスクについては、
  差分ではなく「実績の開始・終了時刻」「所要時間」「メモ（割り込み・理由など）」から、
  作業のリズムや集中できた時間帯、想定外の出来事などの傾向を読み取って問いかける。
- ユーザーの回答を踏まえて、次回に向けた具体的で小さな改善アクションを提案する。
- 日本語、150文字程度を目安に簡潔に。絵文字は使わない。
- 説教や評価をせず、伴走者として対話する。`;

type RequestBody = {
  mode: "start" | "reply";
  diffContext?: string; // 今日の予定/実績の要約テキスト（start・reply とも送る）
  history?: ReflectionMessage[]; // これまでの会話（保存済み。先頭はAIの最初の問いかけ）
  userMessage?: string; // "reply" 時のユーザー発言
};

function fail(status: number, body: ApiErrorBody) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return fail(400, { error: "リクエストが不正です", code: "BAD_REQUEST", hint: "JSON形式で送信してください。" });
  }
  const { mode, diffContext, userMessage } = body;
  const history = Array.isArray(body.history) ? body.history : [];

  const ai = getGeminiClient();
  if (!ai) {
    console.error("[ai-coach] GEMINI_API_KEY が未設定です");
    return fail(500, missingKeyBody);
  }

  if (mode === "reply" && !userMessage?.trim()) {
    return fail(400, { error: "メッセージが空です", code: "BAD_REQUEST", hint: "回答を入力してから送信してください。" });
  }

  // 保存済み履歴は先頭が model（最初の問いかけ）のため、Geminiの「先頭はuser」要件を満たすよう
  // 当日の予定/実績データを最初のuserターンとして必ず補う。
  const contextTurn = `今日の予定・実績データ（時間が未設定の項目もあります）:\n${diffContext || "（まだデータがありません）"}\n\n` +
    (mode === "start"
      ? "このデータを踏まえて、最初の問いかけを1つしてください。予定に時間がなければ実績の時間やメモから読み取ってください。"
      : "このデータを前提に、以降のやり取りを続けてください。");

  const contents = normalizeContents([
    { role: "user", text: contextTurn },
    ...history.map((m) => ({ role: m.role, text: m.content })),
    ...(mode === "reply" ? [{ role: "user", text: userMessage ?? "" }] : [])
  ]);

  try {
    const response = await ai.models.generateContent({
      model: COACH_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 1024,
        temperature: 0.8
      }
    });

    const text = response.text?.trim();
    if (!text) {
      const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason;
      console.error("[ai-coach] 空の応答", { model: COACH_MODEL, reason, turns: contents.length });
      return fail(502, {
        error: "AIから応答が返りませんでした",
        code: reason === "SAFETY" ? "SAFETY_BLOCKED" : "EMPTY_RESPONSE",
        hint: `もう一度送信してください。（理由: ${reason ?? "不明"}）`
      });
    }
    return NextResponse.json({ reply: text });
  } catch (err) {
    const { status, body: errBody } = classifyGeminiError(err);
    console.error("[ai-coach] Gemini呼び出し失敗", {
      mode,
      model: COACH_MODEL,
      turns: contents.length,
      roles: contents.map((c) => c.role).join(","),
      status,
      code: errBody.code,
      message: (err as Error)?.message,
      cause: (err as { cause?: unknown })?.cause
    });
    return fail(status, errBody);
  }
}
