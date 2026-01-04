import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ★X（Twitter）でリンク投稿した時にロゴカードを出すための設定
export const metadata: Metadata = {
  metadataBase: new URL("https://qpick.net"),
  title: "Qpick",
  description: "今すぐ欲しいが見つかる",

  openGraph: {
    type: "website",
    // ここは本番URLを明示しておくと安全（"/" でも動きますが、明示がより確実）
    url: "https://qpick.net/",
    siteName: "Qpick",
    title: "Qpick",
    description: "今すぐ欲しいが見つかる",
    images: [
      {
        // ★白背景の新ロゴに差し替え（public/qpick_logo2.png）
        url: "/qpick_logo2.png",
        width: 861,
        height: 333,
        alt: "Qpick",
      },
    ],
    locale: "ja_JP",
  },

  twitter: {
    card: "summary_large_image",
    title: "Qpick",
    description: "今すぐ欲しいが見つかる",
    // ★白背景の新ロゴに差し替え（public/qpick_logo2.png）
    images: ["/qpick_logo2.png"],
  },
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
        <main style={{ minHeight: "80vh" }}>{children}</main>

        {/* フッターを表示 */}
        <Footer />
      </body>

      {/* Google Analytics（この位置でも動きますが、気になる場合は <body> 内に移動でもOKです） */}
      <GoogleAnalytics gaId="G-SHV630HE2L" />
    </html>
  );
}
