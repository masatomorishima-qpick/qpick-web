// app/[pref]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// ✅ まずはキャッシュで体感を安定させる（都道府県ページは頻繁に変わらない想定）
// ※「即時反映したい」場合は、この行を削除して dynamic='force-dynamic' に戻してください
export const revalidate = 3600;

type Params = Promise<{ pref: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { pref: prefRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();

  const { data: prefRow, error: prefErr } = await supabase
    .from('prefectures')
    .select('name')
    .eq('slug', prefSlug)
    .maybeSingle();

  if (prefErr) throw new Error(prefErr.message);

  const prefName = (prefRow as any)?.name ?? prefSlug;

  return {
    title: `${prefName}のコンビニ店舗一覧｜コンビニ在庫共有サービスQpick`,
    description: `${prefName}内のコンビニ店舗を市区町村ごとに一覧化。店舗詳細ページで「買えた率」やコメントを確認できます。`,
    alternates: { canonical: `/${encodeURIComponent(prefSlug)}` },
  };
}

// ✅ stores 件数を先に取って、ページングを「バッチ並列」で実行（逐次 while より速い）
async function fetchCityCountsByPref(prefSlug: string) {
  const PAGE_SIZE = 1000;
  const CONCURRENCY = 6;

  const { count, error: countError } = await supabase
    .from('stores')
    .select('city', { count: 'exact', head: true })
    .eq('pref', prefSlug)
    .not('city', 'is', null);

  if (countError) throw new Error(countError.message);

  const total = Number(count ?? 0);
  if (!Number.isFinite(total) || total <= 0) return new Map<string, number>();

  const pages = Math.ceil(total / PAGE_SIZE);
  const cityCount = new Map<string, number>();

  for (let start = 0; start < pages; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, pages - start) }, (_, i) => start + i);

    const results = await Promise.all(
      batch.map(async (page) => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('stores')
          .select('city')
          .eq('pref', prefSlug)
          .not('city', 'is', null)
          .range(from, to);

        if (error) throw new Error(error.message);
        return data ?? [];
      })
    );

    for (const rows of results) {
      for (const row of rows as any[]) {
        const city = String(row.city ?? '').trim();
        if (!city) continue;
        cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
      }
    }
  }

  return cityCount;
}

/**
 * ✅ stores に存在する pref slug だけを抽出（他都道府県リンク用）
 * - stores 全件から pref だけ取る（prefectures 全47件よりも多いので、range + 並列で軽く回す）
 * - JS側で Set 化して unique にする
 */
async function fetchExistingPrefSlugsFromStores() {
  const PAGE_SIZE = 2000;
  const CONCURRENCY = 6;

  const { count, error: countError } = await supabase
    .from('stores')
    .select('pref', { count: 'exact', head: true })
    .not('pref', 'is', null);

  if (countError) throw new Error(countError.message);

  const total = Number(count ?? 0);
  if (!Number.isFinite(total) || total <= 0) return [] as string[];

  const pages = Math.ceil(total / PAGE_SIZE);
  const prefSet = new Set<string>();

  for (let start = 0; start < pages; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, pages - start) }, (_, i) => start + i);

    const results = await Promise.all(
      batch.map(async (page) => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase.from('stores').select('pref').not('pref', 'is', null).range(from, to);

        if (error) throw new Error(error.message);
        return data ?? [];
      })
    );

    for (const rows of results) {
      for (const row of rows as any[]) {
        const slug = String(row.pref ?? '').trim().toLowerCase();
        if (!slug) continue;
        prefSet.add(slug);
      }
    }
  }

  return Array.from(prefSet);
}

export default async function PrefPage({ params }: { params: Params }) {
  const { pref: prefRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();

  const { data: prefRow, error: prefErr } = await supabase
    .from('prefectures')
    .select('name')
    .eq('slug', prefSlug)
    .maybeSingle();

  if (prefErr) throw new Error(prefErr.message);

  const prefName = (prefRow as any)?.name ?? prefSlug;

  // ---- city集計（バッチ並列）----
  const cityCount = await fetchCityCountsByPref(prefSlug);

  if (cityCount.size === 0) return notFound();

  const cities = Array.from(cityCount.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  const totalStores = Array.from(cityCount.values()).reduce((sum, n) => sum + n, 0);

  // ---- 他都道府県リンク（storesに登録がある都道府県だけ表示）----
  // ✅ 1) stores から存在する pref slug を抽出
  const existingPrefSlugs = await fetchExistingPrefSlugsFromStores();

  // ✅ 2) prefectures から「存在する slug のみ」名前を取る
  const { data: prefNamesRaw, error: prefNamesError } = await supabase
    .from('prefectures')
    .select('slug, name')
    .in('slug', existingPrefSlugs.length > 0 ? existingPrefSlugs : ['__none__'])
    .order('name', { ascending: true });

  if (prefNamesError) throw new Error(prefNamesError.message);

  const prefNameBySlug = new Map<string, string>();
  const allPrefSlugs: string[] = [];

  for (const r of (prefNamesRaw ?? []) as any[]) {
    const slug = String(r.slug ?? '').trim().toLowerCase();
    const name = String(r.name ?? '').trim();
    if (!slug) continue;
    allPrefSlugs.push(slug);
    if (name) prefNameBySlug.set(slug, name);
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
        {/* ✅ 内部リンクは prefetch を止める（?_rsc の大量発生を防ぐ） */}
        <Link href="/" prefetch={false} style={breadcrumbLink}>
          Home
        </Link>{' '}
        {' > '} <span>{prefName}</span>
      </nav>

      <h1 style={{ fontSize: 28, marginTop: 12, lineHeight: 1.3 }}>{prefName}のコンビニ店舗一覧</h1>

      <p style={{ marginTop: 10, color: '#475569', lineHeight: 1.8 }}>
        {prefName}内のコンビニ店舗を市区町村ごとにまとめています。市区町村を選ぶと店舗一覧へ進み、店舗詳細ページで「買えた率」やコメントを確認できます。
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
              prefetch={false} // ✅ ここが重要（市区町村リンクの自動prefetchを止める）
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
              <Link key={p} href={`/${encodeURIComponent(p)}`} prefetch={false} style={pillLink}>
                {prefNameBySlug.get(p) ?? p}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}