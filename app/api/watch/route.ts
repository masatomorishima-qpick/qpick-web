import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 近隣判定は“格子一致”で最小実装（だいたい1〜2km程度のまとまり）
function areaKeyFromLatLng(lat: number, lng: number) {
  const step = 0.02;
  const latKey = Math.round(lat / step) * step;
  const lngKey = Math.round(lng / step) * step;
  return `${latKey.toFixed(2)},${lngKey.toFixed(2)}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subscriber_id = searchParams.get('subscriber_id');
  const product_id = Number(searchParams.get('product_id'));

  if (!subscriber_id || !Number.isFinite(product_id)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const { data } = await supabase
    .from('watches')
    .select('is_enabled, expires_at')
    .eq('subscriber_id', subscriber_id)
    .eq('product_id', product_id)
    .maybeSingle();

  const enabled = Boolean(data?.is_enabled) && new Date(String(data?.expires_at || 0)).getTime() > Date.now();
  return NextResponse.json({ enabled });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      subscriber_id?: string;
      product_id?: number;
      lat?: number;
      lng?: number;
      enable?: boolean;
    };

    const subscriber_id = body.subscriber_id;
    const product_id = Number(body.product_id);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const enable = Boolean(body.enable);

    if (!subscriber_id || !Number.isFinite(product_id) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    if (enable) {
      const area_key = areaKeyFromLatLng(lat, lng);
      const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from('watches').upsert(
        {
          subscriber_id,
          product_id,
          area_key,
          is_enabled: true,
          expires_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'subscriber_id,product_id' }
      );

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, enabled: true, area_key });
    } else {
      const { error } = await supabase
        .from('watches')
        .update({ is_enabled: false, updated_at: new Date().toISOString() })
        .eq('subscriber_id', subscriber_id)
        .eq('product_id', product_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, enabled: false });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}