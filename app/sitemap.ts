import type { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabaseClient';

export const revalidate = 3600;

type StoreSlugRow = {
  pref: string | null;
  city: string | null;
  slug: string | null;
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://qpick-web.vercel.app';

function normalizeSlug(v: string): string {
  return decodeURIComponent(v).trim().toLowerCase();
}

function safeText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function fetchAllStoreSlugs(): Promise<StoreSlugRow[]> {
  const PAGE_SIZE = 1000;
  const CONCURRENCY = 6;

  const { count, error: countError } = await supabase
    .from('stores')
    .select('id', { count: 'exact', head: true });

  if (countError) throw new Error(countError.message);

  const total = Number(count ?? 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const pages = Math.ceil(total / PAGE_SIZE);
  const out: StoreSlugRow[] = [];

  for (let start = 0; start < pages; start += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, pages - start) }, (_, i) => start + i);

    const results = await Promise.all(
      batch.map(async (page): Promise<StoreSlugRow[]> => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('stores')
          .select('pref, city, slug')
          .range(from, to);

        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as StoreSlugRow[];
      })
    );

    for (const rows of results) out.push(...rows);
  }

  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now },
    { url: `${SITE_URL}/areas`, lastModified: now },
    { url: `${SITE_URL}/terms`, lastModified: now },
  ];

  const rows = await fetchAllStoreSlugs();

  // /pref, /pref/city, /pref/city/slug を stores から生成
  const prefSet = new Set<string>();
  const citySet = new Set<string>(); // key = `${pref}||${city}`
  const storeSet = new Set<string>(); // key = `${pref}||${city}||${slug}`

  for (const r of rows) {
    const pref = safeText(r.pref);
    const city = safeText(r.city);
    const slug = safeText(r.slug);

    if (pref) prefSet.add(normalizeSlug(pref));
    if (pref && city) citySet.add(`${normalizeSlug(pref)}||${city}`);
    if (pref && city && slug) storeSet.add(`${normalizeSlug(pref)}||${city}||${slug}`);
  }

  const prefUrls: MetadataRoute.Sitemap = Array.from(prefSet).map((pref) => ({
    url: `${SITE_URL}/${encodeURIComponent(pref)}`,
    lastModified: now,
  }));

  const cityUrls: MetadataRoute.Sitemap = Array.from(citySet).map((key) => {
    const [pref, city] = key.split('||');
    return {
      url: `${SITE_URL}/${encodeURIComponent(pref)}/${encodeURIComponent(city)}`,
      lastModified: now,
    };
  });

  const storeUrls: MetadataRoute.Sitemap = Array.from(storeSet).map((key) => {
    const [pref, city, slug] = key.split('||');
    return {
      url: `${SITE_URL}/${encodeURIComponent(pref)}/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`,
      lastModified: now,
    };
  });

  return [...base, ...prefUrls, ...cityUrls, ...storeUrls];
}