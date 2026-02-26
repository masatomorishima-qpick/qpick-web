// app/areas/page.tsx

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// ✅ 1時間キャッシュ（都道府県一覧は頻繁に変わらない想定）
// ※「即時反映したい」場合は、この行を削除して dynamic='force-dynamic' に戻してください
export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: 'エリア別コンビニ店舗情報｜コンビニの在庫共有サービスQpick',
    description:
      '都道府県→市区町村→店舗詳細の順で、コンビニ店舗情報を確認できます。店舗詳細では買えた率やコメントも確認できます。',
    alternates: { canonical: '/areas' },
  };
}

// stores から pref 一覧を集める（ページング）
// ✅ 改善点：先に件数を取り、ページを「バッチ並列」で取りに行く（逐次ループより速い）
async function fetchPrefSlugsFromStores() {
  const PAGE_SIZE = 1000;
  const CONCURRENCY = 6; // 同時実行数（増やしすぎると逆に遅くなるので控えめ）

  // 1) 件数だけ取得（データは取らない）
  const { count, error: countError } = await supabase
    .from('stores')
    .select('pref', { count: 'exact', head: true })
    .not('pref', 'is', null);

  if (countError) throw new Error(countError.message);

  const total = Number(count ?? 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const pages = Math.ceil(total / PAGE_SIZE);
  const set = new Set<string>();

  // 2) バッチ並列でprefを取得
  for (let startPage = 0; startPage < pages; startPage += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, pages - startPage) }, (_, i) => startPage + i);

    const results = await Promise.all(
      batch.map(async (page) => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('stores')
          .select('pref')
          .not('pref', 'is', null)
          .range(from, to);

        if (error) throw new Error(error.message);
        return data ?? [];
      })
    );

    for (const rows of results) {
      for (const row of rows as any[]) {
        const p = String(row.pref ?? '').trim().toLowerCase();
        if (p) set.add(p);
      }
    }
  }

  return Array.from(set).sort();
}

export default async function AreasPage() {
  const prefSlugs = await fetchPrefSlugsFromStores();

  const { data: prefNamesRaw, error: prefNamesError } = await supabase
    .from('prefectures')
    .select('slug, name')
    .in('slug', prefSlugs);

  if (prefNamesError) throw new Error(prefNamesError.message);

  const nameBySlug = new Map<string, string>();
  for (const r of (prefNamesRaw ?? []) as any[]) {
    nameBySlug.set(String(r.slug), String(r.name));
  }

  const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    color: '#2563eb',
    fontWeight: 800,
    fontSize: 14,
  };

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <nav style={{ fontSize: 14, color: '#64748b' }}>
        {/* ✅ 内部リンクは Link。さらに ✅ prefetch を止める（大量 ?_rsc を防ぐ） */}
        <Link
          href="/"
          prefetch={false}
          style={{ color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Home
        </Link>{' '}
        {' > '} <span>エリア別店舗情報</span>
      </nav>

      <h1 style={{ fontSize: 28, marginTop: 12, lineHeight: 1.3 }}>エリア別コンビニ店舗情報</h1>

      <p style={{ marginTop: 10, color: '#475569', lineHeight: 1.8 }}>
        都道府県 → 市区町村 → 店舗詳細の順で確認できます。店舗詳細では「買えた率」「商品別の買えた率」「コメント」などが見られます。
      </p>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 10px 0' }}>都道府県</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {prefSlugs.map((slug) => (
            <Link
              key={slug}
              href={`/${encodeURIComponent(slug)}`}
              prefetch={false} // ✅ これがアクションA（都道府県リンクの自動prefetchを止める）
              style={linkStyle}
            >
              {nameBySlug.get(slug) ?? slug}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}