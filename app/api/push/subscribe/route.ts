import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Body = {
  subscriber_id: string;
  subscription: any;
  user_agent?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;

    if (!body.subscriber_id || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        subscriber_id: body.subscriber_id,
        endpoint,
        p256dh,
        auth,
        user_agent: body.user_agent || null,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}