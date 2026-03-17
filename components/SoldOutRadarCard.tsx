import Link from 'next/link';

export default function SoldOutRadarCard() {
  return (
    <section
      style={{
        marginTop: '1rem',
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: '1rem 1.1rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '0.75rem',
          fontWeight: 800,
          color: '#64748b',
          letterSpacing: '0.02em',
        }}
      >
        いま注目の売り切れレーダー
      </p>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginTop: '0.6rem',
        }}
      >
        <div style={{ minWidth: '220px', flex: '1 1 260px' }}>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              lineHeight: 1.45,
              color: '#0f172a',
            }}
          >
            ポケカ「ニンジャスピナー」売り切れ・在庫レーダー
          </div>

          <p
            style={{
              margin: '0.35rem 0 0',
              fontSize: '0.85rem',
              lineHeight: 1.7,
              color: '#475569',
            }}
          >
            東京・大阪の最新レポートを一覧で確認できます。セブンイレブン、
            ファミリーマート、ローソンの売り切れ傾向や在庫あり報告をまとめて見たいときに便利です。
          </p>
        </div>

        <Link
          href="/pokeca/ninja-spinner"
          prefetch={false}
          style={{
            display: 'inline-block',
            padding: '0.75rem 1rem',
            borderRadius: 999,
            backgroundColor: '#0f172a',
            color: '#ffffff',
            textDecoration: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          特設ページを見る
        </Link>
      </div>
    </section>
  );
}