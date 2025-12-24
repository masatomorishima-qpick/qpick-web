// app/api/suggest/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic'; // APIキャッシュ回避（PoC向け）

type CandidateRow = {
  id: number;
  name: string;
  category: string | null;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

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

    const candidates = (data ?? []) as unknown as CandidateRow[];

    return NextResponse.json({ candidates });
  } catch (e: unknown) {
    console.error('suggest exception:', e);
    return NextResponse.json(
      { error: getErrorMessage(e) || 'unknown error', candidates: [] },
      { status: 500 }
    );
  }
}
