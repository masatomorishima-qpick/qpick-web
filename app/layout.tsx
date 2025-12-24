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
    url: "/",
    siteName: "Qpick",
    title: "Qpick",
    description: "今すぐ欲しいが見つかる",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Qpick",
      },
    ],
    locale: "ja_JP",
  },

  twitter: {
    card: "summary_large_image",
    title: "Qpick",
    description: "今すぐ欲しいが見つかる",
    images: ["/og.png"],
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
