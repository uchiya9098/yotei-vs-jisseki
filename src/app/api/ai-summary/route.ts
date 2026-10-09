import { SUMMARY_MODEL, classifyGeminiError, getGeminiClient, missingKeyBody } from "@/lib/gemini";
import { NextResponse } from "next/server";


const SYSTEM_PROMPT = `あなたは行動改善を支援するパーソナルコーチAIです。
ユーザーの1週間・1ヶ月分の「予定と実績の集計データ」および「日々のAI振り返り対話ログ」を渡されます。
これらをまとめて分析し、以下の3つの見出しで日本語のレポートを作成してください。

【行動傾向】この期間に見えた傾向（得意な時間帯、遅れがちなタスクの種類、割り込みの多さなど）
【分析】なぜそのような傾向が生まれたと考えられるか
【来週・来月への改善アドバイス】次の期間に向けた、具体的で実行可能な小さなアクションを2〜3個

説教や過度な評価はせず、伴走者として前向きなトーンで。全体で400文字程度を目安に簡潔にまとめてください。`;

type RequestBody = {
  periodLabel: string; // 例: "今週（8/11〜8/17）"
  aggregatedContext: string; // 集計データ・日次振り返りログをまとめたテキスト
};

export async function POST(req: Request) {
  try {
    const body: RequestBody = await req.json();
    const { periodLabel, aggregatedContext } = body;

    const ai = getGeminiClient();
    if (!ai) {
      console.error("[ai-summary] GEMINI_API_KEY が未設定です");
      return NextResponse.json(missingKeyBody, { status: 500 });
    }

    const response = await ai.models.generateContent({
      model: SUMMARY_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `対象期間: ${periodLabel}\n\n${aggregatedContext}\n\n上記データをもとにレポートを作成してください。`
            }
          ]
        }
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 800,
        temperature: 0.7
      }
    });

    const text = response.text ?? "分析結果を生成できませんでした。もう一度お試しください。";

    return NextResponse.json({ summary: text });
  } catch (err) {
    const { status, body } = classifyGeminiError(err);
    console.error("[ai-summary] Gemini呼び出し失敗", { status, code: body.code, message: (err as Error)?.message });
    return NextResponse.json(body, { status });
  }
}
