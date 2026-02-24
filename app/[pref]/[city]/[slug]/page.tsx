// app/[pref]/[city]/[slug]/page.tsx
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// ✅ 店舗詳細は投稿・集計が動くので、一覧より短めにキャッシュ（例：5分）
// ※リアルタイム性を上げたいなら 60〜180、重さ優先なら 600 などに調整してください
export const revalidate = 300;

type Params = Promise<{ pref: string; city: string; slug: string }>;

const OWNER_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSesiwtfNBHr1XByAE9_ObRyPJJlnqHvIg8Key1iuKDAg-A86A/viewform?usp=dialog';

type StoreRow = {
  id: string;
  chain: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  pref: string | null;
  city: string | null;
  slug: string | null;
  note: string | null;
};

type NearbyRpcRow = {
  id: string;
  chain: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
};

function safeText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function fmtPct(found: number, total: number) {
  if (!Number.isFinite(found) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((found / total) * 100);
}

function fmtDistance(m: unknown) {
  const n = Number(m);
  if (!Number.isFinite(n)) return null;
  if (n < 1000) return `${Math.round(n)}m`;
  return `${(n / 1000).toFixed(1)}km`;
}

function buildMapUrl(name: string, address: string) {
  const q = [name, address].filter(Boolean).join(' ');
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// チェーン表示名
const CHAIN_JA: Record<string, string> = {
  seven_eleven: 'セブン-イレブン',
  familymart: 'ファミリーマート',
  lawson: 'ローソン',
};
function chainJa(chain: unknown): string {
  const key = String(chain ?? '').trim().toLowerCase();
  return CHAIN_JA[key] ?? (key || '-');
}

/**
 * SEO metadata
 */
export async function generateMetadata({ params }: { params: Params }) {
  const { pref: prefRaw, city: cityRaw, slug: slugRaw } = await params;
  const prefSlug = decodeURIComponent(prefRaw).trim().toLowerCase();
  const city = decodeURIComponent(cityRaw).trim();
  const slug = decodeURIComponent(slugRaw).trim();

  // ✅ 取得を並列化（微短縮）
  const [prefRes, storeRes] = await Promise.all([
    supabase.from('prefectures').select('name').eq('slug', prefSlug).maybeSingle(),
    supabase.from('stores').select('name').eq('slug', slug).maybeSingle(),
  ]);

  const prefName = (prefRes.data as any)?.name ?? prefSlug;
  const storeName = (storeRes.data as any)?.name ? String((storeRes.data as any).name) : '店舗詳細';

  return {
    title: `${prefName}${city} ${storeName}｜コンビニの在庫共有サービスQpick`,
    description: `${prefName}${city}の${storeName}の店舗詳細。直近の「買えた率」、商品別の買えた率、コメント、エリアの検索上位、近隣店舗を確認できます。`,
    alternates: {
      canonical: `/${encodeURIComponent(prefSlug)}/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`,
    },
  };
}

export default async function StoreDetailPage({ params }: { params: Params }) {
  const { pref: prefRaw, city: cityRaw, slug: slugRaw } = await params;
  const prefParam = decodeURIComponent(prefRaw).trim().toLowerCase();
  const cityParam = decodeURIComponent(cityRaw).trim();
  const slugParam = decodeURIComponent(slugRaw).trim();

  const DAYS = 30;

  // ✅ 県名と店舗基本情報は並列で取得
  const [prefRes, storeRes] = await Promise.all([
    supabase.from('prefectures').select('name').eq('slug', prefParam).maybeSingle(),
    supabase
      .from('stores')
      .select('id, chain, name, address, phone, latitude, longitude, pref, city, slug, note')
      .eq('slug', slugParam)
      .single(),
  ]);

  const prefName = (prefRes.data as any)?.name ?? prefParam;

  const storeRaw = storeRes.data as any;
  const storeError = storeRes.error;

  // ★ここ：return notFound() ではなく notFound() を呼ぶ
  if (storeError || !storeRaw) notFound();

  const store = storeRaw as unknown as StoreRow;

  const canonicalPref = safeText(store.pref) ? safeText(store.pref).toLowerCase() : prefParam;
  const canonicalCity = safeText(store.city) ? safeText(store.city) : cityParam;
  const canonicalSlug = safeText(store.slug) ? safeText(store.slug) : slugParam;

  if (canonicalPref !== prefParam || canonicalCity !== cityParam || canonicalSlug !== slugParam) {
    redirect(
      `/${encodeURIComponent(canonicalPref)}/${encodeURIComponent(canonicalCity)}/${encodeURIComponent(canonicalSlug)}`
    );
  }

  const storeName = store.name ?? '店舗名';
  const address = store.address ?? '';
  const mapUrl = buildMapUrl(storeName, address);

  // ✅ ここから下は独立した取得が多いので並列化（体感改善）
  const [overallRes, prodStatsRes, fbRes, topKwRes] = await Promise.all([
    supabase.rpc('store_overall_stats', {
      in_store_id: store.id,
      in_days: DAYS,
    }),
    supabase.rpc('store_product_stats', {
      in_store_id: store.id,
      in_days: DAYS,
      in_limit: 20,
    }),
    supabase
      .from('feedback')
      .select('created_at, comment, product_id')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.rpc('area_top_keywords', {
      in_pref: canonicalPref,
      in_city: canonicalCity,
      in_days: DAYS,
      in_limit: 10,
    }),
  ]);

  const overallArr = overallRes.data;
  const overall = Array.isArray(overallArr) && overallArr[0] ? (overallArr[0] as any) : null;
  const found = Number(overall?.found ?? 0);
  const notFoundCount = Number(overall?.not_found ?? 0);
  const total = Number(overall?.total ?? 0);
  const lastReportAt = overall?.last_report_at ? String(overall.last_report_at) : null;
  const foundPct = fmtPct(found, total);

  const prodStatsRaw = prodStatsRes.data;
  const prodStats = Array.isArray(prodStatsRaw) ? (prodStatsRaw as any[]) : [];

  const fbRaw = fbRes.data;
  const feedback = Array.isArray(fbRaw) ? (fbRaw as any[]) : [];

  const topKwRaw = topKwRes.data;
  const topKeywords = Array.isArray(topKwRaw) ? (topKwRaw as any[]) : [];

  // コメントに紐づく商品名
  const productIds = Array.from(new Set(feedback.map((r) => Number(r.product_id)).filter((n) => Number.isFinite(n))));
  const productNameById = new Map<number, string>();

  if (productIds.length > 0) {
    const { data: productsRaw } = await supabase.from('products').select('id, name').in('id', productIds);
    for (const p of (productsRaw ?? []) as any[]) {
      productNameById.set(Number(p.id), String(p.name));
    }
  }

  // 近隣店舗（距離順）
  let nearStores: Array<{
    id: string;
    name: string;
    slug: string;
    address: string | null;
    chain: string | null;
    distance_m: number | null;
  }> = [];

  const lat = Number(store.latitude);
  const lng = Number(store.longitude);

  async function fetchNear(radius_m: number, limit_n: number) {
    const { data, error } = await supabase.rpc('nearby_stores', {
      in_lat: lat,
      in_lng: lng,
      radius_m,
      limit_n,
    });
    if (error) return [] as NearbyRpcRow[];
    const rows = (data ?? []) as unknown as NearbyRpcRow[];
    return rows.filter((r) => String(r.id) !== String(store.id));
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const first = await fetchNear(1500, 30);
    const second = first.length >= 12 ? first : await fetchNear(5000, 50);
    const picked = (second.length > 0 ? second : first).slice(0, 12);

    const ids = picked.map((r) => String(r.id));
    const distById = new Map<string, number | null>();
    for (const r of picked) distById.set(String(r.id), r.distance_m ?? null);

    if (ids.length > 0) {
      const { data: storesRaw } = await supabase.from('stores').select('id, name, slug, address, chain').in('id', ids);

      const byId = new Map<string, any>();
      for (const s of (storesRaw ?? []) as any[]) byId.set(String(s.id), s);

      nearStores = ids
        .map((id) => {
          const s = byId.get(id);
          if (!s || !s.slug) return null;
          return {
            id,
            name: String(s.name ?? '店舗名'),
            slug: String(s.slug),
            address: s.address ?? null,
            chain: s.chain ?? null,
            distance_m: distById.get(id) ?? null,
          };
        })
        .filter(Boolean) as any[];
    }
  } else {
    const { data: nearFallback } = await supabase
      .from('stores')
      .select('id, name, slug, address, chain')
      .eq('pref', canonicalPref)
      .eq('city', canonicalCity)
      .neq('id', store.id)
      .order('address', { ascending: true })
      .order('name', { ascending: true })
      .limit(12);

    nearStores =
      (nearFallback ?? []).map((s: any) => ({
        id: String(s.id),
        name: String(s.name ?? '店舗名'),
        slug: String(s.slug ?? ''),
        address: s.address ?? null,
        chain: s.chain ?? null,
        distance_m: null,
      })) ?? [];
    nearStores = nearStores.filter((s) => !!s.slug);
  }

  const breadcrumbLink: React.CSSProperties = { color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: 2 };
  const linkStyle: React.CSSProperties = {
    color: '#2563eb',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    fontWeight: 800,
  };
  const card: React.CSSProperties = {
    padding: '12px 12px',
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    background: '#fff',
  };

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <nav style={{ fontSize: 14, color: '#64748b' }}>
        {/* ✅ 内部Linkは prefetch を止める（?_rsc の先読み爆発を防ぐ） */}
        <Link href="/" prefetch={false} style={breadcrumbLink}>
          Home
        </Link>{' '}
        {' > '}
        <Link href={`/${encodeURIComponent(canonicalPref)}`} prefetch={false} style={breadcrumbLink}>
          {prefName}
        </Link>{' '}
        {' > '}
        <Link
          href={`/${encodeURIComponent(canonicalPref)}/${encodeURIComponent(canonicalCity)}`}
          prefetch={false}
          style={breadcrumbLink}
        >
          {canonicalCity}
        </Link>{' '}
        {' > '}
        <span>{storeName}</span>
      </nav>

      <h1 style={{ fontSize: 28, marginTop: 12, lineHeight: 1.3 }}>
        {prefName}
        {canonicalCity} {storeName}
      </h1>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>店舗情報</h2>
        <div style={{ lineHeight: 1.9, color: '#334155' }}>
          <div>チェーン：{chainJa(store.chain)}</div>
          <div>
            住所：
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                {address || '-'}
              </a>
            ) : (
              <span>{address || '-'}</span>
            )}
          </div>
          <div>電話：{store.phone ?? '-'}</div>
        </div>
      </section>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>買えた率（直近{DAYS}日）</h2>

        {total === 0 ? (
          <div style={{ color: '#475569', lineHeight: 1.9 }}>
            <p style={{ margin: 0 }}>
              この店舗は、まだ投稿がありません。「この店のデータを集めたい」ため、買えた／買えなかったの投稿にご協力ください。
            </p>
            <p style={{ margin: '10px 0 0 0', fontSize: 14 }}>
              ※投稿は
              <Link href="/" prefetch={false} style={{ ...breadcrumbLink, marginLeft: 4 }}>
                商品検索
              </Link>
              から行えます。商品検索 → 店舗を選んで「買えた／買えなかった」を投稿してください。
            </p>
          </div>
        ) : (
          <div style={{ color: '#334155', lineHeight: 1.9 }}>
            <div>
              買えた：<b>{found}</b> ／ 売切れ：<b>{notFoundCount}</b> ／ 合計：<b>{total}</b>
              {foundPct !== null && (
                <span>
                  {' '}
                  ／ 買えた率：<b>{foundPct}%</b>
                </span>
              )}
            </div>
            {lastReportAt && <div style={{ color: '#64748b', fontSize: 14 }}>最終更新：{lastReportAt}</div>}
          </div>
        )}
      </section>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>商品別の買えた率（直近{DAYS}日）</h2>
        {prodStats.length === 0 ? (
          <div style={{ color: '#475569' }}>まだ商品別の投稿データがありません。</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {prodStats.map((r, i) => (
              <li key={`${r.product_id}-${i}`} style={{ margin: '8px 0', color: '#334155' }}>
                <b>{r.product_name}</b>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                  買えた {r.found} / 売切れ {r.not_found} / 合計 {r.total}
                  {r.found_rate_pct != null ? ` / 買えた率 ${r.found_rate_pct}%` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>コメント（最新{Math.min(20, feedback.length)}件）</h2>
        {feedback.length === 0 ? (
          <div style={{ color: '#475569' }}>まだコメントがありません。</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {feedback.map((r, i) => {
              const pid = Number(r.product_id);
              const pn = productNameById.get(pid);
              return (
                <li key={`${r.created_at}-${i}`} style={{ margin: '10px 0' }}>
                  <div style={{ color: '#334155' }}>
                    {pn ? <b>{pn}：</b> : null}
                    {String(r.comment ?? '')}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>{String(r.created_at ?? '')}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>
          {prefName}
          {canonicalCity}の検索上位（直近{DAYS}日）
        </h2>
        {topKeywords.length === 0 ? (
          <div style={{ color: '#475569' }}>まだエリアの検索データが十分にありません。</div>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {topKeywords.map((k, i) => (
              <li key={`${k.keyword}-${i}`} style={{ margin: '6px 0', color: '#334155' }}>
                {k.keyword} <span style={{ color: '#64748b', fontSize: 13 }}>（{k.searches}）</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>この店舗の近隣店舗</h2>
        {nearStores.length === 0 ? (
          <div style={{ color: '#475569' }}>近隣店舗が見つかりませんでした。</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {nearStores.map((s, i) => (
              <li key={`${s.slug}-${i}`} style={{ margin: '8px 0' }}>
                <Link
                  href={`/${encodeURIComponent(canonicalPref)}/${encodeURIComponent(canonicalCity)}/${encodeURIComponent(
                    s.slug
                  )}`}
                  prefetch={false}
                  style={linkStyle}
                >
                  {s.name}
                </Link>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                  {s.chain ? `${chainJa(s.chain)} / ` : ''}
                  {s.address ?? ''}
                  {s.distance_m != null ? ` / この店舗から ${fmtDistance(s.distance_m)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px 0' }}>店舗様向け：在庫連携</h2>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.8 }}>
          Qpickでは、店舗の在庫情報（買えた／買えなかった）を共有し、近隣ユーザーの来店機会に繋げます。
          連携に興味があれば、以下フォームからご連絡ください。
        </p>
        <p style={{ marginTop: 10 }}>
          <a href={OWNER_FORM_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            在庫連携はこちら（無料トライアル）
          </a>
        </p>
      </section>
    </main>
  );
}