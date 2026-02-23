// app/areas/page.tsx
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return {
    title: 'エリア別コンビニ店舗情報｜コンビニの在庫共有サービスQpick',
    description:
      '都道府県→市区町村→店舗詳細の順で、コンビニ店舗情報を確認できます。店舗詳細では買えた率やコメントも確認できます。',
    alternates: { canonical: '/areas' },
  };
}

// storesからpref一覧を集める（ページング）
async function fetchPrefSlugsFromStores() {
  const PAGE_SIZE = 1000;
  let from = 0;
  const set = new Set<string>();

  while (true) {
    const { data, error } = await supabase
      .from('stores')
      .select('pref')
      .not('pref', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const p = String(row.pref ?? '').trim().toLowerCase();
      if (p) set.add(p);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return Array.from(set).sort();
}

export default async function AreasPage() {
  const prefSlugs = await fetchPrefSlugsFromStores();

  const { data: prefNamesRaw } = await supabase
    .from('prefectures')
    .select('slug, name')
    .in('slug', prefSlugs);

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
        <Link href="/" style={{ color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 }}>
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
            <Link key={slug} href={`/${encodeURIComponent(slug)}`} style={linkStyle}>
              {nameBySlug.get(slug) ?? slug}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
