import type { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabaseClient';

export const revalidate = 86400; // 24時間キャッシュ

// URLを絶対URLにする（sitemapは絶対URLが推奨）
function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  // Vercelの標準環境変数（あれば）
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, '');

  return 'http://localhost:3000';
}

// Supabaseは1回のselectで上限が出ることがあるのでページング
async function fetchAllStoresForSitemap() {
  const PAGE_SIZE = 1000;
  let from = 0;

  const prefSet = new Set<string>();
  const citySetByPref = new Map<string, Set<string>>();
  const storeUrls: Array<{ pref: string; city: string; slug: string }> = [];

  while (true) {
    const { data, error } = await supabase
      .from('stores')
      .select('pref, city, slug')
      .not('pref', 'is', null)
      .not('city', 'is', null)
      .not('slug', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data as any[]) {
      const pref = String(row.pref ?? '').trim().toLowerCase();
      const city = String(row.city ?? '').trim();
      const slug = String(row.slug ?? '').trim();

      if (!pref || !city || !slug) continue;

      prefSet.add(pref);

      if (!citySetByPref.has(pref)) citySetByPref.set(pref, new Set<string>());
      citySetByPref.get(pref)!.add(city);

      storeUrls.push({ pref, city, slug });
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { prefSet, citySetByPref, storeUrls };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE = getSiteUrl();
  const now = new Date();

  const { prefSet, citySetByPref, storeUrls } = await fetchAllStoresForSitemap();

  const items: MetadataRoute.Sitemap = [];

  // 固定ページ（必要に応じて増やしてください）
  items.push({ url: `${SITE}/`, lastModified: now });
  items.push({ url: `${SITE}/terms`, lastModified: now });
  items.push({ url: `${SITE}/privacy-policy`, lastModified: now });
items.push({ url: `${SITE}/areas`, lastModified: now });

  // 都道府県
  for (const pref of Array.from(prefSet)) {
    items.push({ url: `${SITE}/${encodeURIComponent(pref)}`, lastModified: now });

    // 市区町村
    const cities = citySetByPref.get(pref);
    if (cities) {
      for (const city of Array.from(cities)) {
        items.push({
          url: `${SITE}/${encodeURIComponent(pref)}/${encodeURIComponent(city)}`,
          lastModified: now,
        });
      }
    }
  }

  // 店舗詳細
  for (const s of storeUrls) {
    items.push({
      url: `${SITE}/${encodeURIComponent(s.pref)}/${encodeURIComponent(s.city)}/${encodeURIComponent(s.slug)}`,
      lastModified: now,
    });
  }

  return items;
}
