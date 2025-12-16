// app/api/search/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // ★PoC方針：位置情報必須
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'lat/lng is required (PoC: location is mandatory)' },
      { status: 400 }
    );
  }

  // ★productId 必須（suggestで確定したものを渡す）
  const productIdStr = (searchParams.get('productId') ?? '').trim();
  const productId = Number(productIdStr);

  if (!Number.isFinite(productId) || productId <= 0) {
    return NextResponse.json(
      { error: 'productId is required (select a product first)' },
      { status: 400 }
    );
  }

  // ------------------------------------------------
  // 1) productId から product を取得（表示用）
  // ------------------------------------------------
  let productName: string | null = null;

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, name, category')
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

  productName = product?.name ?? null;

  // ------------------------------------------------
  // 2) 近い stores を取得（distance_m 付き）
  // ------------------------------------------------
  const radius_m = 1500;
  const limit_n = 10;

  const { data: stores, error: storeError } = await supabase.rpc('nearby_stores', {
    in_lat: lat,
    in_lng: lng,
    radius_m,
    limit_n,
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

  const storesList: any[] = stores ?? [];

  // ------------------------------------------------
  // 3) 店舗ごとの「みんなの結果（直近N日）」を作る
  //    + 高リスク判定（売切れ多め）もこの集計から出す
  // ------------------------------------------------
  const COMMUNITY_WINDOW_DAYS = 30;
  const COMMUNITY_MIN_SAMPLES = 5;

  // 直近N日の開始日時（ISO）
  const since = new Date(Date.now() - COMMUNITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // デフォルト
  let highRiskStoreIds: string[] = [];

  // store_id -> stats
  const statsByStore: Record<
    string,
    { found: number; notFound: number; lastReportAt: string | null }
  > = {};

  if (storesList.length > 0) {
    const storeIds = storesList.map((s) => String(s.id));

    // 直近N日 + 対象商品 + 対象店舗のみ
    const { data: flags, error: flagsError } = await supabase
      .from('store_product_flags')
      .select('store_id, status, created_at')
      .eq('product_id', productId)
      .in('store_id', storeIds)
      .gte('created_at', since);

    if (flagsError) {
      console.error('flags fetch error', flagsError);
      // flags が取れない場合でも stores は返す（PoC優先）
    } else if (flags) {
      for (const row of flags as { store_id: string; status: string; created_at: string }[]) {
        const key = String(row.store_id);
        if (!statsByStore[key]) statsByStore[key] = { found: 0, notFound: 0, lastReportAt: null };

        if (row.status === 'found') statsByStore[key].found += 1;
        if (row.status === 'not_found') statsByStore[key].notFound += 1;

        // 最新投稿日時（最大値）
        if (!statsByStore[key].lastReportAt || row.created_at > statsByStore[key].lastReportAt) {
          statsByStore[key].lastReportAt = row.created_at;
        }
      }

      // 高リスク判定（直近N日で not_found >= 5 && found === 0）
      highRiskStoreIds = Object.entries(statsByStore)
        .filter(([, v]) => v.notFound >= 5 && v.found === 0)
        .map(([store_id]) => store_id);
    }
  }

  // stores に community を埋め込む（page.tsx 側は必要なときだけ表示すればOK）
  const storesWithCommunity = storesList.map((s) => {
    const key = String(s.id);
    const st = statsByStore[key] ?? { found: 0, notFound: 0, lastReportAt: null };

    const total = st.found + st.notFound;
    const foundRate = total > 0 ? st.found / total : null;

    // ラベル判定（UIでそのまま使える文字列にする）
    let label: '買えた多め' | '売切れ多め' | 'データ少' | null = null;

    if (total === 0) {
      label = null; // 表示は「投稿なし」などはUI側で
    } else if (total < COMMUNITY_MIN_SAMPLES) {
      label = 'データ少';
    } else if (foundRate !== null && foundRate >= 0.7) {
      label = '買えた多め';
    } else if (foundRate !== null && foundRate <= 0.3) {
      label = '売切れ多め';
    }

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

  return NextResponse.json({
    stores: storesWithCommunity, // ← store.community が追加される
    productId,
    productName,
    highRiskStoreIds,
    communityWindowDays: COMMUNITY_WINDOW_DAYS, // （任意：UI側で表示に使える）
  });
}
