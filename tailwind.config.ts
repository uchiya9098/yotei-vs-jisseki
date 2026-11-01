import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C2321",
        paper: "#F7F5F0",
        plan: "#3E6259",   // 予定＝深緑（落ち着き）
        actual: "#C9622D", // 実績＝テラコッタ（行動の熱）
        over: "#C0392B",   // 超過
        under: "#4C8577",  // 短縮
        line: "#E4E0D6"
      },
      fontFamily: {
        display: ["'Zen Kaku Gothic New'", "'Hiragino Sans'", "sans-serif"],
        body: ["'Noto Sans JP'", "'Hiragino Sans'", "sans-serif"]
      },
      borderRadius: {
        card: "14px"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
export default config;
