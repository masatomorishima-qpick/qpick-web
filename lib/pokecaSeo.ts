import { supabase } from '@/lib/supabaseClient';

export type AreaKey = 'all' | 'tokyo' | 'osaka';
export type StatusKey = 'all' | 'found' | 'not_found';
export type ChainKey = 'seven' | 'familymart' | 'lawson';
export type ChainSlug = 'seven-eleven' | 'familymart' | 'lawson';

export const AREA_OPTIONS = [
  { key: 'all', label: 'すべて' },
  { key: 'tokyo', label: '東京' },
  { key: 'osaka', label: '大阪' },
] as const;

export const STATUS_OPTIONS = [
  { key: 'all', label: 'すべて' },
  { key: 'not_found', label: '売り切れ・売っていない' },
  { key: 'found', label: '買えた・在庫あり' },
] as const;

export const CHAIN_META: Record<
  ChainSlug,
  { key: ChainKey; label: string }
> = {
  'seven-eleven': { key: 'seven', label: 'セブンイレブン' },
  familymart: { key: 'familymart', label: 'ファミリーマート' },
  lawson: { key: 'lawson', label: 'ローソン' },
};

export type PokecaProduct = {
  id: number;
  slug: string;
  name: string;
  seo_short_name: string | null;
  release_date: string | null;
  price_text: string | null;
};

export type PokecaReport = {
  report_key: string;
  product_name: string;
  product_slug: string;
  seo_short_name: string | null;
  release_date: string | null;
  price_text: string | null;
  chain_key: 'seven' | 'familymart' | 'lawson' | 'other';
  chain_label: string;
  store_name: string;
  address: string | null;
  prefecture: string | null;
  area_key: 'tokyo' | 'osaka' | 'other';
  area_label: string;
  status_key: 'found' | 'not_found';
  status_label: string;
  occurred_at: string;
  comment: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function normalizeArea(value?: string): AreaKey {
  return value === 'tokyo' || value === 'osaka' ? value : 'all';
}

export function normalizeStatus(value?: string): StatusKey {
  return value === 'found' || value === 'not_found' ? value : 'all';
}

export function resolveChainSlug(value?: string): ChainSlug | null {
  if (value === 'seven-eleven' || value === 'familymart' || value === 'lawson') {
    return value;
  }
  return null;
}

export function getChainKeyFromSlug(chainSlug: ChainSlug): ChainKey {
  return CHAIN_META[chainSlug].key;
}

export function getChainLabelFromSlug(chainSlug: ChainSlug): string {
  return CHAIN_META[chainSlug].label;
}

export function getProductPath(productSlug: string, chainSlug?: ChainSlug | null) {
  return chainSlug
    ? `/pokeca/${productSlug}/${chainSlug}`
    : `/pokeca/${productSlug}`;
}

export function getSeoName(product: PokecaProduct) {
  return product.seo_short_name?.trim() || product.name;
}

export function formatReleaseDate(dateStr: string | null) {
  if (!dateStr) return '未設定';
  const [y, m, d] = dateStr.split('-');
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

export async function getPokecaProduct(productSlug: string) {
  const { data } = await supabase
    .from('products')
    .select('id, slug, name, seo_short_name, release_date, price_text')
    .eq('slug', productSlug)
    .eq('seo_enabled', true)
    .maybeSingle();

  return (data ?? null) as PokecaProduct | null;
}

export async function getPokecaReports(
  productSlug: string,
  chainSlug?: ChainSlug | null
) {
  let query = supabase
    .from('pokeca_product_reports_v1')
    .select('*')
    .eq('product_slug', productSlug)
    .order('occurred_at', { ascending: false })
    .limit(300);

  if (chainSlug) {
    query = query.eq('chain_key', getChainKeyFromSlug(chainSlug));
  }

  const { data, error } = await query;

  return {
    data: (data ?? []) as PokecaReport[],
    error,
  };
}

export function buildSummary(
  reports: PokecaReport[],
  productLabel: string,
  chainLabel?: string
) {
  const now = Date.now();
  const recent = reports.filter((r) => {
    const diff = now - new Date(r.occurred_at).getTime();
    return diff <= 24 * 60 * 60 * 1000;
  });

  if (recent.length === 0) {
    if (chainLabel) {
      return `${productLabel} の ${chainLabel} 最新レポートを随時更新しています。東京・大阪で売ってるか、売り切れかを確認できます。`;
    }
    return `${productLabel} のコンビニ最新レポートを随時更新しています。セブンイレブン、ファミリーマート、ローソンで売ってるか、売り切れかを確認できます。`;
  }

  const soldOut = recent.filter((r) => r.status_key === 'not_found');
  const found = recent.filter((r) => r.status_key === 'found');

  if (chainLabel) {
    if (soldOut.length === 0 && found.length > 0) {
      return `直近24時間では ${chainLabel} で「買えた・在庫あり」の報告が中心です。${productLabel} がまだ売ってる店舗を探したい人向けの状況です。`;
    }

    if (soldOut.length > 0) {
      const areaCount = new Map<string, number>();
      for (const item of soldOut) {
        areaCount.set(item.area_label, (areaCount.get(item.area_label) ?? 0) + 1);
      }
      const topArea =
        [...areaCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '東京・大阪';

      return `現在、${topArea} の ${chainLabel} を中心に売り切れ報告が出ています。${productLabel} の在庫確認前に最新レポートを見て無駄足を減らしてください。`;
    }
  }

  const soldOutChainCount = new Map<string, number>();
  const soldOutAreaCount = new Map<string, number>();

  for (const item of soldOut) {
    soldOutChainCount.set(
      item.chain_label,
      (soldOutChainCount.get(item.chain_label) ?? 0) + 1
    );
    soldOutAreaCount.set(
      item.area_label,
      (soldOutAreaCount.get(item.area_label) ?? 0) + 1
    );
  }

  const topChain =
    [...soldOutChainCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'コンビニ';
  const topArea =
    [...soldOutAreaCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '東京・大阪';

  if (soldOut.length === 0 && found.length > 0) {
    return `直近24時間では「買えた・在庫あり」の報告が中心です。${productLabel} がセブンイレブン、ファミリーマート、ローソンで売ってるかを確認したい人向けに最新状況をまとめています。`;
  }

  return `現在、${topArea} の ${topChain} を中心に売り切れ報告が出ています。${productLabel} がセブンイレブン、ファミリーマート、ローソンで売ってるか、売り切れかを最新レポートで確認できます。`;
}

export function buildQueryHref(
  basePath: string,
  params: { area: AreaKey; status: StatusKey }
) {
  const qs = new URLSearchParams();

  if (params.area !== 'all') qs.set('area', params.area);
  if (params.status !== 'all') qs.set('status', params.status);

  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${Math.max(minutes, 1)}分前`;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 24) return `${hours}時間前`;

  const md = new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(date);

  const hm = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);

  return `${md} ${hm}`;
}

export function getMapsHref(report: PokecaReport) {
  if (report.latitude && report.longitude) {
    return `https://www.google.com/maps?q=${report.latitude},${report.longitude}`;
  }

  if (report.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      report.address
    )}`;
  }

  return null;
}

export function buildChainCounts(reports: PokecaReport[]) {
  return {
    seven: reports.filter((r) => r.chain_key === 'seven').length,
    familymart: reports.filter((r) => r.chain_key === 'familymart').length,
    lawson: reports.filter((r) => r.chain_key === 'lawson').length,
  };
}