import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PokecaLandingPage from '@/components/pokeca/PokecaLandingPage';
import {
  buildChainCounts,
  getChainLabelFromSlug,
  getPokecaProduct,
  getPokecaReports,
  getSeoName,
  normalizeArea,
  normalizeStatus,
  resolveChainSlug,
} from '@/lib/pokecaSeo';

export const revalidate = 60;

type Params = Promise<{ productSlug: string; chainSlug: string }>;
type SearchParams = Promise<{ area?: string; status?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { productSlug, chainSlug: rawChainSlug } = await params;
  const chainSlug = resolveChainSlug(rawChainSlug);
  const product = await getPokecaProduct(productSlug);

  if (!product || !chainSlug) {
    return { title: 'Qpick' };
  }

  const seoName = getSeoName(product);
  const chainLabel = getChainLabelFromSlug(chainSlug);

  return {
    title: `【随時更新】ポケカ「${seoName}」${chainLabel}の売り切れ・在庫レポート（東京・大阪） | Qpick`,
    description: `ポケモンカードゲーム「${seoName}」の ${chainLabel} 在庫・売り切れ情報をQpickが随時更新。東京・大阪の最新レポートから売ってる店舗、売り切れ傾向を確認できます。`,
    alternates: {
      canonical: `/pokeca/${productSlug}/${chainSlug}`,
    },
    openGraph: {
      title: `【随時更新】ポケカ「${seoName}」${chainLabel}の売り切れ・在庫レポート（東京・大阪） | Qpick`,
      description: `ポケモンカードゲーム「${seoName}」の ${chainLabel} 在庫・売り切れ情報をQpickが随時更新。`,
      url: `/pokeca/${productSlug}/${chainSlug}`,
      siteName: 'Qpick',
      locale: 'ja_JP',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `【随時更新】ポケカ「${seoName}」${chainLabel}の売り切れ・在庫レポート（東京・大阪） | Qpick`,
      description: `ポケモンカードゲーム「${seoName}」の ${chainLabel} 在庫・売り切れ情報をQpickが随時更新。`,
    },
  };
}

export default async function PokecaProductChainPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { productSlug, chainSlug: rawChainSlug } = await params;
  const query = await searchParams;

  const chainSlug = resolveChainSlug(rawChainSlug);
  if (!chainSlug) notFound();

  const area = normalizeArea(query?.area);
  const status = normalizeStatus(query?.status);

  const product = await getPokecaProduct(productSlug);
  if (!product) notFound();

  const { data: allReports } = await getPokecaReports(productSlug);
  const { data: currentReports, error } = await getPokecaReports(productSlug, chainSlug);

  const chainCounts = buildChainCounts(allReports);

  return (
    <PokecaLandingPage
      product={product}
      reports={currentReports}
      chainCounts={chainCounts}
      area={area}
      status={status}
      currentChainSlug={chainSlug}
      errorMessage={error?.message ?? null}
    />
  );
}