// app/api/suggest/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = (searchParams.get('keyword') ?? '').trim();

    if (!keyword) {
      return NextResponse.json({ candidates: [] });
    }

    const { data, error } = await supabase
      .from('products')
      .select('id, name, category')
      .ilike('name', `%${keyword}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (error) {
      console.error('suggest error:', error);
      return NextResponse.json({ error: error.message, candidates: [] }, { status: 500 });
    }

    return NextResponse.json({ candidates: data ?? [] });
  } catch (e: any) {
    console.error('suggest exception:', e);
    return NextResponse.json(
      { error: e?.message ?? 'unknown error', candidates: [] },
      { status: 500 }
    );
  }
}
