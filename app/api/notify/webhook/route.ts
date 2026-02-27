import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPush } from '@/lib/pushServer';
import crypto from 'crypto';

export const runtime = 'nodejs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function fp(s: string) {
  // 先頭8桁だけ（秘密は出さない）
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
}

function assertWebhookAuth(req: Request) {
  const expected = (process.env.WEBHOOK_SHARED_SECRET || '').trim();
  if (!expected) throw new Error('WEBHOOK_SHARED_SECRET 未設定');

  const raw = (req.headers.get('authorization') || '').trim();

  // ✅ Bearerの表記ゆれ/余計な空白を吸収
  const token =
    raw.toLowerCase().startsWith('bearer ')
      ? raw.slice(7).trim()
      : '';

  if (token !== expected) {
    console.log('[webhook] unauthorized', {
      expected_len: expected.length,
      token_len: token.length,
      expected_fp: fp(expected),
      token_fp: token ? fp(token) : null,
      raw_head: raw.slice(0, 12), // "Bearer ..." になってるか確認用
    });
    throw new Error('unauthorized');
  }
}

function areaKeyFromLatLng(lat: number, lng: number) {
  const step = 0.02;
  const latKey = Math.round(lat / step) * step;
  const lngKey = Math.round(lng / step) * step;
  return `${latKey.toFixed(2)},${lngKey.toFixed(2)}`;
}

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: any;
};

export async function POST(req: Request) {
  try {
    // ✅ 認証前に到達ログ（secret自体は出さない）
    console.log('[webhook] hit', new Date().toISOString(), {
      hasSecret: !!process.env.WEBHOOK_SHARED_SECRET,
      secretLen: (process.env.WEBHOOK_SHARED_SECRET || '').trim().length,
      hasAuthHeader: !!req.headers.get('authorization'),
    });

    assertWebhookAuth(req);

    const payload = (await req.json()) as WebhookPayload;

    // INSERT以外・別テーブルは無視（事故防止）
    if (payload.type !== 'INSERT' || payload.table !== 'store_product_flags') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const r = payload.record;
    if (!r || r.status !== 'found') return NextResponse.json({ ok: true, ignored: true });

    // TTL：2時間（古いfoundは通知しない）
    const createdAt = new Date(r.created_at);
    if (!Number.isFinite(createdAt.getTime())) return NextResponse.json({ ok: true, ignored: true });

    const now = Date.now();
    if (now - createdAt.getTime() > 2 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, ignored_ttl: true });
    }

    const storeId = String(r.store_id);
    const productId = Number(r.product_id);

    // 重複処理防止（同じイベントを二度送らない）
    const eventKey = `${storeId}:${productId}:${String(r.session_id || r.created_at)}`;
    const { data: already } = await supabase
      .from('notify_processed')
      .select('event_key')
      .eq('event_key', eventKey)
      .maybeSingle();
    if (already) return NextResponse.json({ ok: true, dedup: true });

    // 店舗座標を取得（近隣判定のキーを作る）
    const { data: store } = await supabase
      .from('stores')
      .select('id, latitude, longitude')
      .eq('id', storeId)
      .maybeSingle();

    if (!store || store.latitude == null || store.longitude == null || !Number.isFinite(productId)) {
      await supabase.from('notify_processed').insert({ event_key: eventKey });
      return NextResponse.json({ ok: true, no_store_geo: true });
    }

    const areaKey = areaKeyFromLatLng(Number(store.latitude), Number(store.longitude));

    // レート制限：同一SKU×同一エリアは30分に1回まで
    const { data: cd } = await supabase
      .from('notify_cooldowns')
      .select('last_sent_at')
      .eq('product_id', productId)
      .eq('area_key', areaKey)
      .maybeSingle();

    if (cd?.last_sent_at) {
      const last = new Date(cd.last_sent_at).getTime();
      if (now - last < 30 * 60 * 1000) {
        await supabase.from('notify_processed').insert({ event_key: eventKey });
        return NextResponse.json({ ok: true, cooldown: true });
      }
    }

    // SKU×近隣エリア（格子一致）でwatchしている人
    const { data: watches } = await supabase
      .from('watches')
      .select('subscriber_id')
      .eq('product_id', productId)
      .eq('area_key', areaKey)
      .eq('is_enabled', true)
      .gt('expires_at', new Date().toISOString());

    const subscriberIds = (watches || []).map((w: any) => w.subscriber_id).filter(Boolean);

    if (subscriberIds.length === 0) {
      await supabase.from('notify_processed').insert({ event_key: eventKey });
      return NextResponse.json({ ok: true, no_watchers: true });
    }

    // push購読
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('subscriber_id', subscriberIds.slice(0, 300)) // 暴発防止
      .eq('is_enabled', true);

    const title = '近くの店舗で買えた報告がありました';
    const body = '買えた報告が入りました（直近2時間以内）。在庫を保証するものではありません。';
    const url = '/';

    let sent = 0;
    for (const s of subs || []) {
      const res = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        { title, body, url, product_id: productId, store_id: storeId }
      );

      if (res.ok) {
        sent += 1;
      } else if (res.statusCode === 404 || res.statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ is_enabled: false, updated_at: new Date().toISOString() })
          .eq('endpoint', s.endpoint);
      }
    }

    if (sent > 0) {
      await supabase.from('notify_cooldowns').upsert({
        product_id: productId,
        area_key: areaKey,
        last_sent_at: new Date().toISOString(),
      });
    }

    await supabase.from('notify_logs').insert({
      store_id: storeId,
      product_id: productId,
      area_key: areaKey,
      sent_count: sent,
      payload: { title, body, url },
    });

    await supabase.from('notify_processed').insert({ event_key: eventKey });

    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    const msg = e?.message || 'unknown';
    return NextResponse.json({ error: msg }, { status: msg === 'unauthorized' ? 401 : 500 });
  }
}