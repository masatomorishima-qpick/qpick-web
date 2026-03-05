import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const productIdRaw = searchParams.get('productId');
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    const radiusKmRaw = searchParams.get('radiusKm') ?? '10';
    const ttlHoursRaw = searchParams.get('ttlHours') ?? '168';

    const productId = Number(productIdRaw);
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const radiusKm = Number(radiusKmRaw);
    const ttlHours = Number(ttlHoursRaw);

    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: 'productId が不正です。' }, { status: 400 });
    }

    // lat/lng が null なのに 0 扱いになるのを防ぐ
    if (latRaw == null || lngRaw == null || latRaw === '' || lngRaw === '') {
      return NextResponse.json(
        { error: 'lat / lng が必要です。位置情報を許可してから再度お試しください。' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'lat / lng が不正です。' }, { status: 400 });
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return NextResponse.json({ error: 'radiusKm が不正です。' }, { status: 400 });
    }
    if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
      return NextResponse.json({ error: 'ttlHours が不正です。' }, { status: 400 });
    }

    // ✅ 重要：取扱店が登録されていない商品は 404（ボタン非表示にする）
    const { count: handlingCount, error: countErr } = await supabase
      .from('product_handling_stores')
      .select('store_id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .limit(1);

    if (countErr) {
      console.error('[handling-stores] product_handling_stores count error', countErr);
      return NextResponse.json({ error: '取扱店定義の確認に失敗しました。' }, { status: 500 });
    }

    if (!handlingCount || handlingCount <= 0) {
      return NextResponse.json({ error: 'no handling stores registered' }, { status: 404 });
    }

    // ✅ 本体：10km以内の取扱店＋fresh stats
    const { data, error } = await supabase.rpc('get_handling_stores_with_fresh_stats', {
      p_product_id: productId,
      p_lat: lat,
      p_lng: lng,
      p_ttl_hours: ttlHours,
      p_radius_km: radiusKm,
    });

    if (error) {
      console.error('[handling-stores rpc error]', error);
      return NextResponse.json({ error: '取扱店データの取得に失敗しました。' }, { status: 500 });
    }

    return NextResponse.json({
      productId,
      radiusKm,
      ttlHours,
      count: data?.length ?? 0,
      stores: data ?? [],
    });
  } catch (e) {
    console.error('[handling-stores api error]', e);
    return NextResponse.json({ error: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}