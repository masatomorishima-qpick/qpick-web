import Link from 'next/link';
import Image from 'next/image';

export default function TermsPage() {
  return (
    <div style={styles.container}>
      
      {/* ロゴ表示エリア（中央揃え） */}
      <div style={styles.logoContainer}>
        <Link href="/">
          {/* publicフォルダにある logo.png を表示 */}
          <Image 
            src="/qpick_logo.png" 
            alt="Qpick" 
            width={120} 
            height={60} 
            style={{ objectFit: 'contain', width: 'auto', height: '40px' }}
            priority
          />
        </Link>
      </div>

      <h1 style={styles.title}>利用規約</h1>
      <p style={styles.date}>制定日：2025年12月17日</p>

      <p>この利用規約（以下「本規約」といいます）は、Blue Adventures（以下「当社」といいます）が提供するサービス「Qpick」（以下「本サービス」といいます）の利用条件を定めるものです。</p>

      <section style={styles.section}>
        <h2 style={styles.heading}>第1条（適用）</h2>
        <p>本規約は、ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されるものとします。本サービスを利用することで、ユーザーは本規約に同意したものとみなされます。</p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第2条（サービスの性質と免責）</h2>
        <ol style={styles.list}>
          <li>本サービスは、商品の在庫情報や販売状況を共有するためのプラットフォームですが、<strong>情報の正確性、完全性、最新性を保証するものではありません。</strong></li>
          <li>「買えた／買えなかった」等の情報はユーザーの投稿および推測に基づくものであり、実際の店舗在庫と異なる場合があります。当社は、本サービスの利用により生じた損害（店舗に行ったが商品がなかった場合等を含む）について、一切の責任を負いません。</li>
        </ol>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第3条（禁止事項）</h2>
        <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
        <ol style={styles.list}>
          <li>虚偽の情報（実際には行っていない店舗の在庫情報など）を投稿する行為</li>
          <li>不正な手段（プログラム等）を用いてサービスを操作する行為</li>
          <li>当社や他のユーザー、第三者に不利益や損害を与える行為</li>
          <li>法令または公序良俗に違反する行為</li>
        </ol>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第4条（サービス内容の変更等）</h2>
        <p>当社は、ユーザーに通知することなく、本サービスの内容を変更し、または提供を中止することができるものとし、これによってユーザーに生じた損害について一切の責任を負いません。</p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第5条（準拠法・裁判管轄）</h2>
        <p>本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当社の所在地を管轄する裁判所を専属的合意管轄とします。</p>
      </section>

      <div style={styles.backLink}>
        <Link href="/">トップページへ戻る</Link>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '40px 20px',
    lineHeight: '1.8',
    color: '#333',
  },
  // ロゴ周りを中央揃えに設定
  logoContainer: {
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'center',
  },
  title: {
    fontSize: '24px',
    marginBottom: '10px',
    borderBottom: '1px solid #ddd',
    paddingBottom: '10px',
  },
  date: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '30px',
    textAlign: 'right' as const,
  },
  section: {
    marginBottom: '30px',
  },
  heading: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '10px',
    backgroundColor: '#f9f9f9',
    padding: '8px 12px',
    borderRadius: '4px',
  },
  list: {
    paddingLeft: '20px',
    marginBottom: '10px',
  },
  backLink: {
    marginTop: '50px',
    textAlign: 'center' as const,
  }
};