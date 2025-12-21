import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
// フッターコンポーネントをインポート
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Qpick", // タイトルもサービス名に合わせておきました
  description: "今すぐ欲しいが見つかる",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* メインコンテンツエリア：画面の高さの最低80%を確保してフッターを下に押し下げる */}
        <main style={{ minHeight: "80vh" }}>
          {children}
        </main>
        
        {/* フッターを表示 */}
        <Footer />
      </body>
      <GoogleAnalytics gaId="G-SHV630HE2L" />
    </html>
  );
}