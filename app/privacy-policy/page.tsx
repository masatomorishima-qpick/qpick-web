import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image"; // 画像表示用にインポート

export const metadata: Metadata = {
  title: "プライバシーポリシー | Qpick",
  description:
    "Qpickのプライバシーポリシーです。位置情報、アクセスログ、Cookie等の取り扱い、利用目的、第三者提供、お問い合わせ窓口について定めています。",
  // 法務ページは検索結果に出さない方針（重複回避・SEO最適化）
  robots: { index: false, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <div style={styles.container}>
      {/* ロゴ表示エリア */}
      <div style={styles.logoContainer}>
        <Link href="/">
          <Image
            src="/qpick_logo.png"
            alt="Qpick"
            width={120}
            height={60}
            style={{ objectFit: "contain", width: "auto", height: "40px" }} // 高さを40pxに制限して整える
            priority
          />
        </Link>
      </div>

      <h1 style={styles.title}>プライバシーポリシー</h1>
      <p style={styles.date}>制定日：2025年12月17日</p>

      <p>
        Blue Adventures（以下「当社」といいます）は、当社が提供するサービス「Qpick」（以下「本サービス」といいます）における、ユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます）を定めます。
      </p>

      <section style={styles.section}>
        <h2 style={styles.heading}>第1条（収集する情報）</h2>
        <p>当社は、本サービスの提供にあたり、以下の情報を取得する場合があります。</p>
        <ol style={styles.list}>
          <li>
            <strong>位置情報：</strong>
            現在地周辺の店舗を検索するために、ユーザーの同意に基づいて位置情報（緯度・経度）を取得します。この情報は検索実行時のみ使用され、サーバー上に個人と紐づく形での長期保存は行いません。
          </li>
          <li>
            <strong>端末情報・ログ情報：</strong>
            サービス改善のため、アクセスログ、検索キーワード、ブラウザの種類などの情報を収集します。
          </li>
          <li>
            <strong>Cookieおよびローカルストレージ：</strong>
            不正な連続投稿の防止や、利便性向上のためにCookieやローカルストレージを使用します。
          </li>
        </ol>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第2条（利用目的）</h2>
        <p>当社が情報を収集・利用する目的は以下のとおりです。</p>
        <ol style={styles.list}>
          <li>本サービスの提供（周辺店舗の検索表示など）のため</li>
          <li>ユーザーからのお問い合わせに対応するため</li>
          <li>不正利用の防止および対応のため</li>
          <li>サービスの改善、新機能の開発、利用状況の分析のため</li>
        </ol>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第3条（第三者提供）</h2>
        <p>
          当社は、法令に基づく場合を除き、あらかじめユーザーの同意を得ることなく、個人情報を第三者に提供することはありません。
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.heading}>第4条（お問い合わせ窓口）</h2>
        <p>本ポリシーに関するお問い合わせは、下記の窓口までお願いいたします。</p>
        <p style={styles.contact}>
          <strong>運営者：</strong>Blue Adventures
          <br />
          <strong>お問い合わせ：</strong>
          <a href="mailto:info@blueadventures.jp">info@blueadventures.jp</a>
        </p>
      </section>

      <div style={styles.backLink}>
        <Link href="/">トップページへ戻る</Link>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "40px 20px",
    lineHeight: "1.8",
    color: "#333",
  },
  // ロゴ周りの余白設定
  logoContainer: {
    marginBottom: "20px",
    display: "flex",
    justifyContent: "center", // 左寄せ
  },
  title: {
    fontSize: "24px",
    marginBottom: "10px",
    borderBottom: "1px solid #ddd",
    paddingBottom: "10px",
  },
  date: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "30px",
    textAlign: "right" as const,
  },
  section: {
    marginBottom: "30px",
  },
  heading: {
    fontSize: "18px",
    fontWeight: "bold",
    marginBottom: "10px",
    backgroundColor: "#f9f9f9",
    padding: "8px 12px",
    borderRadius: "4px",
  },
  list: {
    paddingLeft: "20px",
    marginBottom: "10px",
  },
  contact: {
    backgroundColor: "#f4f4f4",
    padding: "15px",
    borderRadius: "8px",
    marginTop: "10px",
  },
  backLink: {
    marginTop: "50px",
    textAlign: "center" as const,
  },
};
