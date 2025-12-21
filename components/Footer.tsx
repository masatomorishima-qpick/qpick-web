'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <nav>
        <ul style={styles.list}>          
          {/* プライバシーポリシーページへのリンク */}
          <li style={styles.listItem}>
            <Link href="/privacy-policy" style={styles.link}>
              プライバシーポリシー
            </Link>
          </li>
          
          {/* 利用規約ページへのリンク */}
          <li style={styles.listItem}>
            <Link href="/terms" style={styles.link}>
              利用規約
            </Link>
          </li>
        </ul>
      </nav>
      <p style={styles.copyright}>
        &copy; 2024 Blue Adventures All Rights Reserved.
      </p>
    </footer>
  );
}

// スタイル定義
const styles = {
  footer: {
    backgroundColor: '#f4f4f4',
    padding: '20px 0',
    marginTop: '40px',
    textAlign: 'center' as const,
    fontSize: '12px',
    color: '#666',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 15px 0',
    display: 'flex',
    justifyContent: 'center',
    gap: '20px', // リンクが減ったので少し間隔を広げました
    flexWrap: 'wrap' as const,
  },
  listItem: {
    display: 'inline-block',
  },
  link: {
    textDecoration: 'none',
    color: '#333',
    fontWeight: 'bold',
  },
  copyright: {
    margin: 0,
  }
};