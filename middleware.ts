import { NextResponse } from 'next/server';

/**
 * qpick.net を一時的に「休止のお知らせ」に切り替えるメンテナンス用 middleware。
 *
 * すべてのリクエストに対し、HTTP 503（Service Unavailable）で休止ページを返す。
 * 既存のページ（app/page.tsx 等）には一切手を加えない。
 *
 * ▼ 復旧方法
 *   このファイル（middleware.ts）を削除して git push すれば、元のサイトに戻ります。
 */

const MAINTENANCE_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>休止のお知らせ｜qpick</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN",
        "Yu Gothic", Meiryo, sans-serif;
      background: #f5f5f0; color: #1f2937;
      display: flex; align-items: center; justify-content: center;
      padding: 24px; line-height: 1.8;
    }
    .card {
      width: 100%; max-width: 520px; background: #ffffff;
      border: 1px solid #e5e7eb; border-radius: 20px;
      padding: 40px 28px; text-align: center;
      box-shadow: 0 8px 30px rgba(0,0,0,0.05);
    }
    .badge {
      display: inline-block; font-size: 13px; font-weight: 600;
      color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0;
      border-radius: 999px; padding: 5px 14px; margin-bottom: 20px;
    }
    h1 { font-size: 22px; margin: 0 0 14px; color: #111827; }
    p { font-size: 15px; color: #4b5563; margin: 0 0 12px; }
    .sub { font-size: 13px; color: #9ca3af; margin-top: 22px; }
    .brand { font-weight: 700; letter-spacing: 0.02em; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">ただいま休止中</span>
    <h1>サービスを休止しております</h1>
    <p>平素より <span class="brand">qpick</span> をご利用いただき、誠にありがとうございます。</p>
    <p>現在、当サービスは一時的に休止しております。<br />再開の予定が決まりましたら、改めてお知らせいたします。</p>
    <p class="sub">お問い合わせ：info@blueadventures.jp</p>
  </main>
</body>
</html>`;

export function middleware() {
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '3600',
    },
  });
}

export const config = {
  // 静的アセット等を除く全ルートに適用
  matcher: '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
};
