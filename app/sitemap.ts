import type { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabaseClient';

export const revalidate = 3600;

type StoreAreaRow = {
  pref: string | null;
  city: string | null;
};

type PokecaSlugRow = {
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

async function fetchAllStoreAreas(): Promise<StoreAreaRow[]> {
  const PAGE_SIZE = 1000;
  const CONCURRENCY = 6;

  const { count, error: countError } = await supabase
    .from('stores')
    .select('id', { count: 'exact', head: true });

  if (countError) throw new Error(countError.message);

  const total = Number(count ?? 0);
  if (!Number.isFinite(total) || total <= 0) return [];

  const pages = Math.ceil(total / PAGE_SIZE);
  const out: StoreAreaRow[] = [];

  for (let start = 0; start < pages; start += CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(CONCURRENCY, pages - start) },
      (_, i) => start + i
    );

    const results = await Promise.all(
      batch.map(async (page): Promise<StoreAreaRow[]> => {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('stores')
          .select('pref, city')
          .range(from, to);

        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as StoreAreaRow[];
      })
    );

    for (const rows of results) out.push(...rows);
  }

  return out;
}

async function fetchPokecaProductSlugs(): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('slug')
    .eq('seo_enabled', true)
    .not('slug', 'is', null);

  if (error) throw new Error(error.message);

  return ((data ?? []) as PokecaSlugRow[])
    .map((row) => safeText(row.slug))
    .filter(Boolean);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const base: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now },
    { url: `${SITE_URL}/areas`, lastModified: now },
    { url: `${SITE_URL}/terms`, lastModified: now },
  ];

  const rows = await fetchAllStoreAreas();
  const pokecaSlugs = await fetchPokecaProductSlugs();

  // /pref, /pref/city を stores から生成
  const prefSet = new Set<string>();
  const citySet = new Set<string>(); // key = `${pref}||${city}`

  for (const r of rows) {
    const pref = safeText(r.pref);
    const city = safeText(r.city);

    if (pref) prefSet.add(normalizeSlug(pref));
    if (pref && city) citySet.add(`${normalizeSlug(pref)}||${city}`);
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

  const pokecaUrls: MetadataRoute.Sitemap = pokecaSlugs.flatMap((slug) => [
    {
      url: `${SITE_URL}/pokeca/${encodeURIComponent(slug)}`,
      lastModified: now,
    },
    {
      url: `${SITE_URL}/pokeca/${encodeURIComponent(slug)}/seven-eleven`,
      lastModified: now,
    },
    {
      url: `${SITE_URL}/pokeca/${encodeURIComponent(slug)}/familymart`,
      lastModified: now,
    },
    {
      url: `${SITE_URL}/pokeca/${encodeURIComponent(slug)}/lawson`,
      lastModified: now,
    },
  ]);

  return [
    ...base,
    ...prefUrls,
    ...cityUrls,
    ...pokecaUrls,
  ];
}
