// app/[pref]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
type Params = Promise<{ pref: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { pref: prefRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();

  const { data: prefRow } = await supabase
    .from('prefectures')
    .select('name')
    .eq('slug', prefSlug)
    .maybeSingle();

  const prefName = (prefRow as any)?.name ?? prefSlug;

  return {
    title: `${prefName}のコンビニ店舗一覧｜コンビニ在庫共有サービスQpick`,
    description: `${prefName}内のコンビニ店舗を市区町村ごとに一覧化。店舗詳細ページで「買えた率」やコメントを確認できます。`,
    alternates: { canonical: `/${encodeURIComponent(prefSlug)}` },
  };
}

export default async function PrefPage({ params }: { params: Params }) {
  const { pref: prefRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();

  const { data: prefRow } = await supabase
    .from('prefectures')
    .select('name')
    .eq('slug', prefSlug)
    .maybeSingle();

  const prefName = (prefRow as any)?.name ?? prefSlug;

  // ---- city集計（ページング）----
  const PAGE_SIZE = 1000;
  let from = 0;
  const cityCount = new Map<string, number>();

  while (true) {
    const { data, error } = await supabase
      .from('stores')
      .select('city')
      .eq('pref', prefSlug)
      .not('city', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const city = String(row.city ?? '').trim();
      if (!city) continue;
      cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (cityCount.size === 0) return notFound();

  const cities = Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  const totalStores = Array.from(cityCount.values()).reduce((sum, n) => sum + n, 0);

  // ---- 他都道府県リンク（stores→prefectures）----
  const prefStats = new Map<string, number>();
  from = 0;
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
      if (!p) continue;
      prefStats.set(p, (prefStats.get(p) ?? 0) + 1);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const allPrefSlugs = Array.from(prefStats.entries())
    .map(([p]) => p)
    .sort((a, b) => a.localeCompare(b));

  const { data: prefNamesRaw } = await supabase
    .from('prefectures')
    .select('slug, name')
    .in('slug', allPrefSlugs);

  const prefNameBySlug = new Map<string, string>();
  for (const r of (prefNamesRaw ?? []) as any[]) {
    prefNameBySlug.set(String(r.slug), String(r.name));
  }
  const otherPrefs = allPrefSlugs.filter((p) => p !== prefSlug).slice(0, 12);

  // ---- style ----
  const breadcrumbLink: React.CSSProperties = { color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 };
  const cityCard: React.CSSProperties = {
    display: 'block',
    padding: '12px 12px',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    background: '#fff',
    textDecoration: 'none',
    color: '#0f172a',
    cursor: 'pointer',
  };
  const cityTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  };
  const pillLink: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid #e2e8f0',
    background: '#fff',
    textDecoration: 'none',
    color: '#2563eb',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
  };

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <nav style={{ fontSize: 14, color: '#64748b' }}>
        <Link href="/" style={breadcrumbLink}>Home</Link> {' > '} <span>{prefName}</span>
      </nav>

      <h1 style={{ fontSize: 28, marginTop: 12, lineHeight: 1.3 }}>{prefName}のコンビニ店舗一覧</h1>

      <p style={{ marginTop: 10, color: '#475569', lineHeight: 1.8 }}>
        {prefName}内のコンビニ店舗を市区町村ごとにまとめています。市区町村を選ぶと店舗一覧へ進み、
        店舗詳細ページで「買えた率」やコメントを確認できます。
      </p>

      <div
        style={{
          marginTop: 14,
          padding: '12px 14px',
          borderRadius: 14,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          color: '#334155',
          fontSize: 14,
        }}
      >
        市区町村数：<b>{cities.length}</b> ／ 登録店舗数：<b>{totalStores}</b>
      </div>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 10px 0' }}>{prefName}の市区町村</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {cities.map(([city, cnt]) => (
            <Link
              key={city}
              href={`/${encodeURIComponent(prefSlug)}/${encodeURIComponent(city)}`}
              style={cityCard}
            >
              <div style={cityTitle}>{city}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>店舗 {cnt} 件 →</div>
            </Link>
          ))}
        </div>
      </section>

      {otherPrefs.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px 0' }}>他の都道府県から探す</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {otherPrefs.map((p) => (
              <Link key={p} href={`/${encodeURIComponent(p)}`} style={pillLink}>
                {prefNameBySlug.get(p) ?? p}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
