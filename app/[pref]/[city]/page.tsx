// app/[pref]/[city]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { CSSProperties } from 'react';

// ✅ キャッシュ（市区町村→店舗一覧は頻繁に変わらない想定）
// ※「即時反映が必要」なら、この行を削除して dynamic='force-dynamic' に戻してください
export const revalidate = 3600;

type Params = Promise<{ pref: string; city: string }>;

type StoreListRow = {
  id: string;
  chain: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
  slug: string | null;
};

type CityOnlyRow = { city: string | null };
type PrefOnlyRow = { pref: string | null };
type PrefectureRow = { slug: string | null; name: string | null };
type PrefectureNameRow = { name: string | null };

function chainKey(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'seven_eleven') return 'seven_eleven';
  if (s === 'familymart') return 'familymart';
  if (s === 'lawson') return 'lawson';
  return 'other';
}

function safeText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const CHAIN_LABEL: Record<string, string> = {
  seven_eleven: 'セブン-イレブン',
  familymart: 'ファミリーマート',
  lawson: 'ローソン',
  other: 'その他',
};

function sortByAddressThenName(a: StoreListRow, b: StoreListRow) {
  const aa = safeText(a.address);
  const ba = safeText(b.address);
  const cmpAddr = aa.localeCompare(ba, 'ja');
  if (cmpAddr !== 0) return cmpAddr;

  const an = safeText(a.name);
  const bn = safeText(b.name);
  return an.localeCompare(bn, 'ja');
}

// ✅ stores 件数を先に取って、ページングを「バッチ並列」で実行（逐次 while より速い）
async function fetchStoresByPrefCity(prefSlug: string, city: string) {
  const PAGE_SIZE = 1000;
  const CONCURRENCY = 6;

  const { count, error: countError } = await supabase
    .from('stores')
    .select('id', { count: 'exact', head: true })
    .eq('pref', prefSlug)
    .eq('city', city);

  if (countError) throw new Error(countError.message);

  const total = Number(count ?? 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const pages = Math.ceil(total / PAGE_SIZE);
  const out: StoreListRow[] = [];

  for (let start = 0; start < pages; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, pages - start) }, (_, i) => start + i);

    const results = await Promise.all(
      batch.map(async (page): Promise<StoreListRow[]> => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('stores')
          .select('id, chain, name, address, phone, slug')
          .eq('pref', prefSlug)
          .eq('city', city)
          .order('address', { ascending: true })
          .order('name', { ascending: true })
          .range(from, to);

        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as StoreListRow[];
      })
    );

    for (const rows of results) out.push(...rows);
  }

  return out;
}

// ✅ 同一pref内の city 件数集計（他市区町村リンク用）もバッチ並列
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
      batch.map(async (page): Promise<CityOnlyRow[]> => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('stores')
          .select('city')
          .eq('pref', prefSlug)
          .not('city', 'is', null)
          .range(from, to);

        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as CityOnlyRow[];
      })
    );

    for (const rows of results) {
      for (const row of rows) {
        const c = safeText(row.city);
        if (!c) continue;
        cityCount.set(c, (cityCount.get(c) ?? 0) + 1);
      }
    }
  }

  return cityCount;
}

/**
 * ✅ stores に存在する pref slug だけを抽出（他都道府県リンク用）
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
      batch.map(async (page): Promise<PrefOnlyRow[]> => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase.from('stores').select('pref').not('pref', 'is', null).range(from, to);

        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as PrefOnlyRow[];
      })
    );

    for (const rows of results) {
      for (const row of rows) {
        const slug = String(row.pref ?? '').trim().toLowerCase();
        if (!slug) continue;
        prefSet.add(slug);
      }
    }
  }

  return Array.from(prefSet);
}

// ✅ 他都道府県リンク：prefectures は「storesに存在するslug」だけに絞る
async function fetchPrefecturesIndex(existingPrefSlugs: string[]) {
  const { data, error } = await supabase
    .from('prefectures')
    .select('slug, name')
    .in('slug', existingPrefSlugs.length > 0 ? existingPrefSlugs : ['__none__'])
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  const prefNameBySlug = new Map<string, string>();
  const slugs: string[] = [];
  for (const r of (data ?? []) as unknown as PrefectureRow[]) {
    const slug = String(r.slug ?? '').trim().toLowerCase();
    const name = String(r.name ?? '').trim();
    if (!slug) continue;
    slugs.push(slug);
    if (name) prefNameBySlug.set(slug, name);
  }
  return { slugs, prefNameBySlug };
}

/**
 * SEO: title / description
 */
export async function generateMetadata({ params }: { params: Params }) {
  const { pref: prefRaw, city: cityRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();
  const city = decodeURIComponent(cityRaw).trim();

  const { data: prefRow, error: prefErr } = await supabase
    .from('prefectures')
    .select('name')
    .eq('slug', prefSlug)
    .maybeSingle();

  if (prefErr) throw new Error(prefErr.message);

  const prefName = (prefRow as unknown as PrefectureNameRow | null)?.name ?? prefSlug;

  return {
    title: `${prefName}${city}のコンビニ店舗一覧｜コンビニの在庫共有サービスQpick`,
    description: `${prefName}${city}のコンビニ店舗一覧。セブン-イレブン/ファミリーマート/ローソン別に見られ、店舗詳細で「買えた率」やコメントを確認できます。`,
    alternates: {
      canonical: `/${encodeURIComponent(prefSlug)}/${encodeURIComponent(city)}`,
    },
  };
}

export default async function CityPage({ params }: { params: Params }) {
  const { pref: prefRaw, city: cityRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();
  const city = decodeURIComponent(cityRaw).trim();

  const { data: prefRow, error: prefErr } = await supabase
    .from('prefectures')
    .select('name')
    .eq('slug', prefSlug)
    .maybeSingle();

  if (prefErr) throw new Error(prefErr.message);

  const prefName = (prefRow as unknown as PrefectureNameRow | null)?.name ?? prefSlug;

  // ------------------------------------
  // 1) この市区町村の店舗一覧（バッチ並列）
  // ------------------------------------
  const storesAll = await fetchStoresByPrefCity(prefSlug, city);
  if (storesAll.length === 0) return notFound();

  // ------------------------------------
  // 2) チェーン別グルーピング → 各グループ内で「住所の50音順」
  // ------------------------------------
  const groups: Record<string, StoreListRow[]> = {
    seven_eleven: [],
    familymart: [],
    lawson: [],
    other: [],
  };

  for (const s of storesAll) groups[chainKey(s.chain)].push(s);

  for (const k of Object.keys(groups)) {
    groups[k].sort(sortByAddressThenName);
  }

  const groupOrder = [
    { key: 'seven_eleven', label: CHAIN_LABEL.seven_eleven },
    { key: 'familymart', label: CHAIN_LABEL.familymart },
    { key: 'lawson', label: CHAIN_LABEL.lawson },
  ] as const;

  const otherCount = groups.other.length;

  // ------------------------------------
  // 3) 他市区町村リンク（同pref内）
  // ------------------------------------
  const cityCount = await fetchCityCountsByPref(prefSlug);

  const otherCities = Array.from(cityCount.entries())
    .filter(([c]) => c !== city)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, 20);

  // ------------------------------------
  // 4) 他都道府県リンク（storesに存在する都道府県だけ表示）
  // ------------------------------------
  const existingPrefSlugs = await fetchExistingPrefSlugsFromStores();
  const { slugs: allPrefSlugs, prefNameBySlug } = await fetchPrefecturesIndex(existingPrefSlugs);
  const otherPrefs = allPrefSlugs.filter((p) => p !== prefSlug).slice(0, 12);

  // ------------------------------------
  // UIスタイル（リンクがリンクに見えるように）
  // ------------------------------------
  const breadcrumbLink: CSSProperties = { color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 };

  const linkStyle: CSSProperties = {
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    fontWeight: 800,
  };

  const cardStyle: CSSProperties = {
    padding: '12px 12px',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    background: '#fff',
  };

  const cardLinkStyle: CSSProperties = {
    display: 'block',
    padding: '12px 12px',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    background: '#fff',
    textDecoration: 'none',
    color: '#0f172a',
    cursor: 'pointer',
  };

  const pillLinkStyle: CSSProperties = {
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
      {/* パンくず */}
      <nav style={{ fontSize: 14, color: '#64748b' }}>
        <Link href="/" prefetch={false} style={breadcrumbLink}>
          Home
        </Link>{' '}
        {' > '}
        <Link href={`/${encodeURIComponent(prefSlug)}`} prefetch={false} style={breadcrumbLink}>
          {prefName}
        </Link>{' '}
        {' > '}
        <span>{city}</span>
      </nav>

      {/* H1 */}
      <h1 style={{ fontSize: 28, marginTop: 12, lineHeight: 1.3 }}>
        {prefName}
        {city}のコンビニ店舗一覧
      </h1>

      {/* 導入 */}
      <p style={{ marginTop: 10, color: '#475569', lineHeight: 1.8 }}>
        {prefName}
        {city}のコンビニ店舗を一覧化しています。チェーン別（セブン-イレブン／ファミリーマート／ローソン）にページ内リンクで移動でき、店舗詳細ページで「買えた率」やコメントを確認できます。
      </p>

      {/* サマリー */}
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
        登録店舗数：<b>{storesAll.length}</b>
        <span style={{ marginLeft: 10, color: '#64748b' }}>
          （セブン {groups.seven_eleven.length} / ファミマ {groups.familymart.length} / ローソン {groups.lawson.length}
          {otherCount > 0 ? ` / その他 ${otherCount}` : ''}）
        </span>
      </div>

      {/* 目次（ページ内リンク） */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 10px 0' }}>チェーン別に探す</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {groupOrder.map(({ key, label }) => (
            <a key={key} href={`#${key}`} style={pillLinkStyle}>
              {label}（{groups[key].length}）
            </a>
          ))}
          {otherCount > 0 && (
            <a href="#other" style={pillLinkStyle}>
              その他（{otherCount}）
            </a>
          )}
        </div>
      </section>

      {/* チェーン別セクション（各チェーン内は住所の50音順） */}
      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 20, margin: '0 0 10px 0' }}>コンビニチェーン別の店舗一覧</h2>

        {groupOrder.map(({ key, label }) => {
          const list = groups[key];
          if (!list || list.length === 0) return null;

          return (
            <div key={key} id={key} style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 18, margin: '0 0 10px 0' }}>
                {label}の店舗（{list.length}）
              </h3>

              <div style={{ display: 'grid', gap: 10 }}>
                {list.map((s) => {
                  const storeName = s.name ?? '店舗名';
                  const slug = s.slug ?? '';
                  const href = slug
                    ? `/${encodeURIComponent(prefSlug)}/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`
                    : null;

                  return (
                    <div key={s.id} style={cardStyle}>
                      {href ? (
                        <Link href={href} prefetch={false} style={linkStyle}>
                          {storeName}
                        </Link>
                      ) : (
                        <div style={{ fontWeight: 800 }}>{storeName}</div>
                      )}
                      {s.address && <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>{s.address}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {otherCount > 0 && (
          <div id="other" style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 18, margin: '0 0 10px 0' }}>その他の店舗（{otherCount}）</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {groups.other.map((s) => {
                const storeName = s.name ?? '店舗名';
                const slug = s.slug ?? '';
                const href = slug
                  ? `/${encodeURIComponent(prefSlug)}/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`
                  : null;

                return (
                  <div key={s.id} style={cardStyle}>
                    {href ? (
                      <Link href={href} prefetch={false} style={linkStyle}>
                        {storeName}
                      </Link>
                    ) : (
                      <div style={{ fontWeight: 800 }}>{storeName}</div>
                    )}
                    {s.address && <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>{s.address}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 他市区町村（同pref内） */}
      {otherCities.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px 0' }}>{prefName}の他の市区町村</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {otherCities.map(([c, cnt]) => (
              <Link
                key={c}
                href={`/${encodeURIComponent(prefSlug)}/${encodeURIComponent(c)}`}
                prefetch={false}
                style={cardLinkStyle}
              >
                <div style={{ fontWeight: 800, color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {c}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>店舗 {cnt} 件 →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 他都道府県（storesに存在する都道府県だけ） */}
      {otherPrefs.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px 0' }}>他の都道府県から探す</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {otherPrefs.map((p) => (
              <Link key={p} href={`/${encodeURIComponent(p)}`} prefetch={false} style={pillLinkStyle}>
                {prefNameBySlug.get(p) ?? p}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}