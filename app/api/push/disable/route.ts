import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { subscriber_id?: string };
    if (!body.subscriber_id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq('subscriber_id', body.subscriber_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'unknown' }, { status: 500 });
  }
}