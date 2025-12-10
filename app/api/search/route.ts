// app/api/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const keyword = searchParams.get('keyword') ?? '';
  const area = searchParams.get('area') ?? '';

  // ★ まずはシンプルに：stores テーブルから上位 10 件を取るだけ
  //   （カラム名によるエリア・キーワード絞り込みは後で調整）
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Supabase error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ stores: data ?? [] });
}
