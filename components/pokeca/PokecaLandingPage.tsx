import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  AREA_OPTIONS,
  STATUS_OPTIONS,
  CHAIN_META,
  type AreaKey,
  type StatusKey,
  type ChainSlug,
  type PokecaProduct,
  type PokecaReport,
  buildSummary,
  buildQueryHref,
  formatReleaseDate,
  formatTimeLabel,
  getMapsHref,
  getProductPath,
  getSeoName,
} from '@/lib/pokecaSeo';

type Props = {
  product: PokecaProduct;
  reports: PokecaReport[];
  chainCounts: {
    seven: number;
    familymart: number;
    lawson: number;
  };
  area: AreaKey;
  status: StatusKey;
  currentChainSlug: ChainSlug | null;
  errorMessage?: string | null;
};

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: '1040px',
    margin: '0 auto',
    padding: '24px 16px 64px',
    color: '#0f172a',
  },
  sectionCard: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    marginBottom: '24px',
  },
  heroTitle: {
    fontSize: '44px',
    lineHeight: 1.15,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    margin: '8px 0 16px',
  },
  lead: {
    fontSize: '16px',
    lineHeight: 1.9,
    color: '#475569',
    margin: 0,
  },
  miniLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#64748b',
    marginBottom: '6px',
  },
  metricBox: {
    background: '#f8fafc',
    borderRadius: '18px',
    padding: '16px',
    border: '1px solid #e2e8f0',
  },
  summaryBox: {
    background: '#fff7ed',
    border: '1px solid #fdba74',
    borderRadius: '18px',
    padding: '16px',
  },
  chip: {
    display: 'inline-block',
    padding: '10px 16px',
    borderRadius: '9999px',
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#334155',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
    marginRight: '8px',
    marginBottom: '8px',
  },
  chipActive: {
    display: 'inline-block',
    padding: '10px 16px',
    borderRadius: '9999px',
    border: '1px solid #0f172a',
    background: '#0f172a',
    color: '#fff',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 700,
    marginRight: '8px',
    marginBottom: '8px',
  },
  article: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '24px',
    padding: '24px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    marginBottom: '16px',
  },
  badgeSoldOut: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: '9999px',
    background: '#fef2f2',
    color: '#b91c1c',
    fontWeight: 700,
    fontSize: '14px',
  },
  badgeFound: {
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: '9999px',
    background: '#ecfdf5',
    color: '#047857',
    fontWeight: 700,
    fontSize: '14px',
  },
  tag: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: '9999px',
    background: '#f1f5f9',
    color: '#475569',
    fontSize: '12px',
    fontWeight: 600,
    marginRight: '8px',
    marginBottom: '8px',
  },
  chainCard: {
    display: 'block',
    background: '#f8fafc',
    borderRadius: '18px',
    padding: '18px',
    border: '1px solid #e2e8f0',
    textDecoration: 'none',
    color: '#0f172a',
  },
};

export default function PokecaLandingPage({
  product,
  reports,
  chainCounts,
  area,
  status,
  currentChainSlug,
  errorMessage,
}: Props) {
  const seoName = getSeoName(product);
  const currentChainLabel = currentChainSlug
    ? CHAIN_META[currentChainSlug].label
    : null;

  const pageBasePath = getProductPath(product.slug, currentChainSlug);

  const filteredReports = reports
    .filter((item) => (area === 'all' ? true : item.area_key === area))
    .filter((item) => (status === 'all' ? true : item.status_key === status))
    .slice(0, 50);

  const summary = buildSummary(reports, seoName, currentChainLabel ?? undefined);

  const totalCount = reports.length;
  const soldOutCount = reports.filter((r) => r.status_key === 'not_found').length;
  const foundCount = reports.filter((r) => r.status_key === 'found').length;

  const h1 = currentChainLabel
    ? `ポケカ「${seoName}」${currentChainLabel}の売り切れ・在庫レーダー【東京・大阪】`
    : `ポケカ「${seoName}」コンビニ売り切れ・在庫レーダー【東京・大阪】`;

  const lead = currentChainLabel
    ? `ポケモンカードゲーム「${seoName}」の ${currentChainLabel} レポートをQpickが一覧化しています。東京・大阪で売ってるか、売り切れか、買えた店舗があるかを時系列で確認できます。`
    : `ポケモンカードゲーム「${seoName}」のコンビニ在庫・売り切れレポートをQpickが一覧化しています。セブンイレブン、ファミリーマート、ローソンで売ってるか、売り切れかを東京・大阪の最新情報から確認できます。`;

  return (
    <main style={styles.page}>
      <section style={styles.sectionCard}>
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#64748b', margin: 0 }}>
          Qpick 特設ページ / ポケモンカード コンビニ在庫レーダー
        </p>

        {currentChainSlug ? (
          <p style={{ margin: '12px 0 0' }}>
            <Link
              href={getProductPath(product.slug)}
              style={{ color: '#0369a1', fontWeight: 700, textDecoration: 'none' }}
            >
              ← 商品トップへ戻る
            </Link>
          </p>
        ) : null}

        <h1 style={styles.heroTitle}>{h1}</h1>

        <p style={styles.lead}>{lead}</p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginTop: '20px',
          }}
        >
          <div style={styles.metricBox}>
            <div style={styles.miniLabel}>発売日</div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>
              {formatReleaseDate(product.release_date)}
            </div>
          </div>

          <div style={styles.metricBox}>
            <div style={styles.miniLabel}>価格</div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>
              {product.price_text ?? '未設定'}
            </div>
          </div>

          <div style={{ ...styles.metricBox, gridColumn: 'span 2' }}>
            <div style={styles.miniLabel}>主な確認対象チェーン</div>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>
              セブンイレブン / ファミリーマート / ローソン
            </div>
          </div>
        </div>

        <div style={{ ...styles.summaryBox, marginTop: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#c2410c', marginBottom: '8px' }}>
            現在の状況サマリー
          </div>
          <div style={{ fontSize: '15px', lineHeight: 1.9, color: '#334155' }}>{summary}</div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginTop: '20px',
          }}
        >
          <div style={styles.metricBox}>
            <div style={styles.miniLabel}>表示対象レポート</div>
            <div style={{ fontSize: '34px', fontWeight: 800 }}>{totalCount}</div>
          </div>

          <div
            style={{
              ...styles.metricBox,
              background: '#fef2f2',
              border: '1px solid #fecaca',
            }}
          >
            <div style={{ ...styles.miniLabel, color: '#b91c1c' }}>売り切れ・売っていない</div>
            <div style={{ fontSize: '34px', fontWeight: 800, color: '#b91c1c' }}>
              {soldOutCount}
            </div>
          </div>

          <div
            style={{
              ...styles.metricBox,
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
            }}
          >
            <div style={{ ...styles.miniLabel, color: '#047857' }}>買えた・在庫あり</div>
            <div style={{ fontSize: '34px', fontWeight: 800, color: '#047857' }}>
              {foundCount}
            </div>
          </div>
        </div>
      </section>

      <section style={styles.sectionCard}>
        <h2 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 16px' }}>絞り込み</h2>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '10px' }}>エリア</div>
          <div>
            {AREA_OPTIONS.map((option) => {
              const active = area === option.key;
              return (
                <Link
                  key={option.key}
                  href={buildQueryHref(pageBasePath, { area: option.key, status })}
                  style={active ? styles.chipActive : styles.chip}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '10px' }}>ステータス</div>
          <div>
            {STATUS_OPTIONS.map((option) => {
              const active = status === option.key;
              return (
                <Link
                  key={option.key}
                  href={buildQueryHref(pageBasePath, { area, status: option.key })}
                  style={active ? styles.chipActive : styles.chip}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '10px' }}>チェーン</div>
          <div>
            <Link
              href={buildQueryHref(getProductPath(product.slug), { area, status })}
              style={!currentChainSlug ? styles.chipActive : styles.chip}
            >
              すべて
            </Link>

            {(Object.keys(CHAIN_META) as ChainSlug[]).map((chainSlug) => {
              const active = currentChainSlug === chainSlug;
              return (
                <Link
                  key={chainSlug}
                  href={buildQueryHref(getProductPath(product.slug, chainSlug), { area, status })}
                  style={active ? styles.chipActive : styles.chip}
                >
                  {CHAIN_META[chainSlug].label}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '16px' }}>
          <span style={styles.tag}>セブンイレブン: {chainCounts.seven}件</span>
          <span style={styles.tag}>ファミリーマート: {chainCounts.familymart}件</span>
          <span style={styles.tag}>ローソン: {chainCounts.lawson}件</span>
        </div>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '16px',
            alignItems: 'flex-end',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: 800, margin: 0 }}>直近のレポート50件</h2>
            <p style={{ margin: '8px 0 0', color: '#64748b', lineHeight: 1.8 }}>
              {seoName} の最新レポートを時系列で表示しています。コメントがある場合はカード内に表示します。
            </p>
          </div>
          <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 700 }}>
            {filteredReports.length}件表示
          </div>
        </div>

        {errorMessage ? (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '18px',
              padding: '16px',
              color: '#b91c1c',
              marginBottom: '16px',
            }}
          >
            レポートの取得に失敗しました。{errorMessage}
          </div>
        ) : null}

        {filteredReports.length === 0 ? (
          <div style={styles.sectionCard}>
            条件に一致するレポートはまだありません。条件を変えて確認してください。
          </div>
        ) : (
          filteredReports.map((report) => {
            const mapsHref = getMapsHref(report);

            return (
              <article key={report.report_key} style={styles.article}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>
                    {formatTimeLabel(report.occurred_at)}
                  </div>

                  <span
                    style={
                      report.status_key === 'found'
                        ? styles.badgeFound
                        : styles.badgeSoldOut
                    }
                  >
                    {report.status_key === 'found' ? '買えた' : '売り切れ'}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '28px',
                    lineHeight: 1.4,
                    fontWeight: 800,
                    margin: '16px 0',
                  }}
                >
                  ポケモンカードゲーム「{seoName}」
                </h3>

                <div style={{ fontSize: '15px', lineHeight: 1.9, color: '#334155' }}>
                  <div><strong>チェーン：</strong>{report.chain_label}</div>
                  <div><strong>店舗：</strong>{report.store_name}</div>
                  <div><strong>都道府県：</strong>{report.prefecture ?? '不明'}</div>
                  <div><strong>エリア：</strong>{report.area_label}</div>
                  {report.address ? <div style={{ color: '#64748b' }}>{report.address}</div> : null}
                </div>

                {report.comment ? (
                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: '18px',
                      padding: '16px',
                      marginTop: '16px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>
                      コメント
                    </div>
                    <div style={{ fontSize: '15px', lineHeight: 1.9, color: '#334155' }}>
                      {report.comment}
                    </div>
                  </div>
                ) : null}

                <div style={{ marginTop: '16px' }}>
                  <span style={styles.tag}>{report.status_label}</span>
                  <span style={styles.tag}>{report.chain_label}</span>
                  <span style={styles.tag}>{report.area_label}</span>
                </div>

                {mapsHref ? (
                  <div style={{ marginTop: '16px' }}>
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: '#0369a1',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      地図で見る
                    </a>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <section style={{ ...styles.sectionCard, marginTop: '24px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 12px' }}>
          {seoName} のチェーン別ページ
        </h2>

        <p style={{ margin: 0, color: '#475569', lineHeight: 1.9 }}>
          チェーン別の固定URLを用意しています。セブンイレブン、ファミリーマート、ローソンごとの
          売り切れ・在庫傾向を個別ページで確認できます。
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            marginTop: '20px',
          }}
        >
          {(Object.keys(CHAIN_META) as ChainSlug[]).map((chainSlug) => {
            const meta = CHAIN_META[chainSlug];
            const count =
              meta.key === 'seven'
                ? chainCounts.seven
                : meta.key === 'familymart'
                ? chainCounts.familymart
                : chainCounts.lawson;

            const active = currentChainSlug === chainSlug;

            return (
              <Link
                key={chainSlug}
                href={getProductPath(product.slug, chainSlug)}
                style={{
                  ...styles.chainCard,
                  border: active ? '2px solid #0f172a' : '1px solid #e2e8f0',
                  background: active ? '#f1f5f9' : '#f8fafc',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>
                  {seoName} × {meta.label}
                </div>
                <div style={{ color: '#475569', lineHeight: 1.8, marginBottom: '10px' }}>
                  {meta.label} の固定URLページへ移動します。
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  レポート件数: {count}件
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}