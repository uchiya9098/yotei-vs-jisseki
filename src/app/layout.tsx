import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "予定 vs 実績 | AIコーチング",
  description: "予定と実績のギャップを可視化し、AIコーチングで行動改善につなげるアプリ",
  manifest: "/manifest.json"
};

export const viewport = {
  themeColor: "#3E6259",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
