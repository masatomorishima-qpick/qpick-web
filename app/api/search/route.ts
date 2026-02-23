// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

type ProductChain = 'all' | 'seven_eleven' | 'familymart' | 'lawson';

type ProductRow = {
  id: number;
  name: string;
  category: string | null;
  chain: string | null;
};

type StoreRow = {
  id: string;
  chain: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;

  // SEO/エリア集計用（storesから補完）
  pref: string | null;
  city: string | null;
  slug: string | null;
};

type FlagRow = { store_id: string; status: 'found' | 'not_found' | string; created_at: string };

type CommunityLabel = '買えた多め' | '売切れ多め' | 'データ少' | null;

type StoreWithCommunity = StoreRow & {
  community: {
    windowDays: number;
    found: number;
    notFound: number;
    total: number;
    lastReportAt: string | null;
    label: CommunityLabel;
  };
};

function normalizeProductChain(v: unknown): ProductChain {
  const s = String(v ?? 'all').trim().toLowerCase();
  if (s === 'all') return 'all';
  if (s === 'seven_eleven') return 'seven_eleven';
  if (s === 'familymart') return 'familymart';
  if (s === 'lawson') return 'lawson';
  return 'all';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'lat/lng is required (PoC: location is mandatory)' },
      { status: 400 }
    );
  }

  const productIdStr = (searchParams.get('productId') ?? '').trim();
  const productId = Number(productIdStr);
  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json(
      { error: 'productId is required (select a product first)' },
      { status: 400 }
    );
  }

  // 1) product取得（chain判定用）
  const { data: productRaw, error: productError } = await supabase
    .from('products')
    .select('id, name, category, chain')
    .eq('id', productId)
    .single();

  if (productError) {
    console.error('product fetch error', productError);
    return NextResponse.json(
      {
        error: 'failed to fetch product',
        stores: [],
        productId,
        productName: null,
        highRiskStoreIds: [] as string[],
      },
      { status: 500 }
    );
  }

  const product = productRaw as unknown as ProductRow;
  const productName = product?.name ?? null;
  const productCategory = product?.category ?? null;
  const productChain = normalizeProductChain(product?.chain);

  // 2) 近いstores取得（distance_m付き）
  const radius_m = 5000;
  const fetch_limit_n = productChain === 'all' ? 50 : 200;

  const { data: storesRaw, error: storeError } = await supabase.rpc('nearby_stores', {
    in_lat: lat,
    in_lng: lng,
    radius_m,
    limit_n: fetch_limit_n,
  });

  if (storeError) {
    console.error('nearby_stores rpc error', storeError);
    return NextResponse.json(
      {
        stores: [],
        productId,
        productName,
        highRiskStoreIds: [] as string[],
      },
      { status: 500 }
    );
  }

  // RPC結果（pref/city/slugは後で補完）
  let storesList = (storesRaw ?? []) as unknown as Omit<StoreRow, 'pref' | 'city' | 'slug'>[];

  // チェーン限定なら store.chain で絞る
  if (productChain !== 'all') {
    storesList = storesList.filter((store) => {
      const storeChain = String(store?.chain ?? '').trim().toLowerCase();
      return storeChain === productChain;
    });
  }

  // 最大50件まで表示
  const DISPLAY_LIMIT = 50;
  storesList = storesList.slice(0, DISPLAY_LIMIT);

  // ★ステップ2：storesから pref/city/slug を補完
  let storesWithAdmin: StoreRow[] = storesList.map((s) => ({
    ...s,
    pref: null,
    city: null,
    slug: null,
  }));

  if (storesList.length > 0) {
    const storeIds = storesList.map((s) => String((s as any).id));

    const { data: adminRows, error: adminError } = await supabase
      .from('stores')
      .select('id, pref, city, slug')
      .in('id', storeIds);

    if (adminError) {
      console.error('stores admin fetch error', adminError);
    } else if (adminRows) {
      const adminById = new Map<string, { pref: string | null; city: string | null; slug: string | null }>();
      for (const r of adminRows as any[]) {
        adminById.set(String(r.id), {
          pref: r.pref ?? null,
          city: r.city ?? null,
          slug: r.slug ?? null,
        });
      }

      storesWithAdmin = storesList.map((s) => {
        const id = String((s as any).id);
        const a = adminById.get(id);
        return {
          ...(s as any),
          pref: a?.pref ?? null,
          city: a?.city ?? null,
          slug: a?.slug ?? null,
        };
      });
    }
  }

  // 3) みんなの結果集計
  const COMMUNITY_WINDOW_DAYS = 30;
  const COMMUNITY_MIN_SAMPLES = 5;
  const since = new Date(Date.now() - COMMUNITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let highRiskStoreIds: string[] = [];
  const statsByStore: Record<string, { found: number; notFound: number; lastReportAt: string | null }> = {};

  if (storesWithAdmin.length > 0) {
    const storeIds = storesWithAdmin.map((s) => String(s.id));

    const { data: flagsRaw, error: flagsError } = await supabase
      .from('store_product_flags')
      .select('store_id, status, created_at')
      .eq('product_id', productId)
      .in('store_id', storeIds)
      .gte('created_at', since);

    if (flagsError) {
      console.error('flags fetch error', flagsError);
    } else if (flagsRaw) {
      const flags = flagsRaw as unknown as FlagRow[];

      for (const row of flags) {
        const key = String(row.store_id);
        if (!statsByStore[key]) statsByStore[key] = { found: 0, notFound: 0, lastReportAt: null };

        if (row.status === 'found') statsByStore[key].found += 1;
        if (row.status === 'not_found') statsByStore[key].notFound += 1;

        if (!statsByStore[key].lastReportAt || row.created_at > statsByStore[key].lastReportAt) {
          statsByStore[key].lastReportAt = row.created_at;
        }
      }

      highRiskStoreIds = Object.entries(statsByStore)
        .filter(([, v]) => v.notFound >= 5 && v.found === 0)
        .map(([store_id]) => store_id);
    }
  }

  const storesWithCommunity: StoreWithCommunity[] = storesWithAdmin.map((s) => {
    const key = String(s.id);
    const st = statsByStore[key] ?? { found: 0, notFound: 0, lastReportAt: null };

    const total = st.found + st.notFound;
    const foundRate = total > 0 ? st.found / total : null;

    let label: CommunityLabel = null;
    if (total === 0) label = null;
    else if (total < COMMUNITY_MIN_SAMPLES) label = 'データ少';
    else if (foundRate !== null && foundRate >= 0.7) label = '買えた多め';
    else if (foundRate !== null && foundRate <= 0.3) label = '売切れ多め';

    return {
      ...s,
      community: {
        windowDays: COMMUNITY_WINDOW_DAYS,
        found: st.found,
        notFound: st.notFound,
        total,
        lastReportAt: st.lastReportAt,
        label,
      },
    };
  });

  // ★ステップ3：area_pref/area_city を確実に決める
  let area_pref: string | null = storesWithCommunity[0]?.pref ?? null;
  let area_city: string | null = storesWithCommunity[0]?.city ?? null;

  // フォールバック：最寄りstore_idで stores を1件だけ取り直す（最強に安定）
  const nearestId = storesWithCommunity[0]?.id ?? null;
  if ((!area_pref || !area_city) && nearestId) {
    const { data: nearestRow, error: nearestErr } = await supabase
      .from('stores')
      .select('pref, city')
      .eq('id', nearestId)
      .single();

    if (nearestErr) {
      console.error('nearest store pref/city fetch error', nearestErr);
    } else if (nearestRow) {
      area_pref = (nearestRow as any).pref ?? area_pref;
      area_city = (nearestRow as any).city ?? area_city;
    }
  }

  // ★search_logs に保存（失敗しても検索結果は返す）
  try {
    const { error: logError } = await supabase.from('search_logs').insert({
      keyword: productName ?? String(productId),
      category: productCategory,
      store_count_shown: storesWithCommunity.length,
      search_source: 'qpick_web',
      area_pref,
      area_city,
    });
    if (logError) console.error('search_logs insert error', logError);
  } catch (e) {
    console.error('search_logs insert exception', e);
  }

  return NextResponse.json({
    stores: storesWithCommunity,
    productId,
    productName,
    highRiskStoreIds,
    communityWindowDays: COMMUNITY_WINDOW_DAYS,

    // デバッグ用：APIがどう判断したかを返す（後で消してOK）
    area_pref,
    area_city,
  });
}
