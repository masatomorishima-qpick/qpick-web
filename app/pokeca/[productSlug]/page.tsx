import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PokecaLandingPage from '@/components/pokeca/PokecaLandingPage';
import {
  buildChainCounts,
  getPokecaProduct,
  getPokecaReports,
  getSeoName,
  normalizeArea,
  normalizeStatus,
} from '@/lib/pokecaSeo';

export const revalidate = 60;

type Params = Promise<{ productSlug: string }>;
type SearchParams = Promise<{ area?: string; status?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { productSlug } = await params;
  const product = await getPokecaProduct(productSlug);

  if (!product) {
    return { title: 'Qpick' };
  }

  const seoName = getSeoName(product);

  return {
    title: `【随時更新】ポケカ「${seoName}」コンビニ売り切れ・在庫レーダー（東京・大阪） | Qpick`,
    description: `ポケモンカードゲーム「${seoName}」のコンビニ在庫・売り切れ情報をQpickが随時更新。セブンイレブン、ファミリーマート、ローソンの最新レポートを東京・大阪で確認できます。`,
    alternates: {
      canonical: `/pokeca/${productSlug}`,
    },
    openGraph: {
      title: `【随時更新】ポケカ「${seoName}」コンビニ売り切れ・在庫レーダー（東京・大阪） | Qpick`,
      description: `ポケモンカードゲーム「${seoName}」のコンビニ在庫・売り切れ情報をQpickが随時更新。`,
      url: `/pokeca/${productSlug}`,
      siteName: 'Qpick',
      locale: 'ja_JP',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `【随時更新】ポケカ「${seoName}」コンビニ売り切れ・在庫レーダー（東京・大阪） | Qpick`,
      description: `ポケモンカードゲーム「${seoName}」のコンビニ在庫・売り切れ情報をQpickが随時更新。`,
    },
  };
}

export default async function PokecaProductPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { productSlug } = await params;
  const query = await searchParams;

  const area = normalizeArea(query?.area);
  const status = normalizeStatus(query?.status);

  const product = await getPokecaProduct(productSlug);
  if (!product) notFound();

  const { data, error } = await getPokecaReports(productSlug);
  const chainCounts = buildChainCounts(data);

  return (
    <PokecaLandingPage
      product={product}
      reports={data}
      chainCounts={chainCounts}
      area={area}
      status={status}
      currentChainSlug={null}
      errorMessage={error?.message ?? null}
    />
  );
}