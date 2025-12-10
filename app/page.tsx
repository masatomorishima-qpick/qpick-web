'use client';

import { FormEvent, useState } from 'react';

const AREAS = ['新宿', '渋谷', '池袋'];

// stores テーブルのカラム名はプロジェクトごとに違う可能性があるので
// ここでは any にして柔軟に扱います
type Store = any;

export default function HomePage() {
  const [keyword, setKeyword] = useState('');
  const [area, setArea] = useState(AREAS[0]);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        keyword: keyword.trim(),
        area,
      });

      const res = await fetch(`/api/search?${params.toString()}`);

      if (!res.ok) {
        throw new Error('検索 API の呼び出しに失敗しました');
      }

      const json = await res.json();
      setStores(json.stores ?? []);
    } catch (err) {
      console.error(err);
      setError('検索中にエラーが発生しました。時間をおいて再度お試しください。');
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem',
        backgroundColor: '#f4f4f5',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          backgroundColor: '#ffffff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 700 }}>
          Qpick（PoC）
        </h1>
        <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
          今すぐ欲しい商品を、近くのコンビニで探すためのテスト版です。
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}
        >
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>商品名またはカテゴリ</span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例）カイロ、マスク、ガムテープ"
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>エリア</span>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
              }}
            >
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              borderRadius: 999,
              border: 'none',
              backgroundColor: loading ? '#9ca3af' : '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? '検索中…' : '検索'}
          </button>
        </form>

        {error && (
          <p style={{ color: '#b91c1c', marginBottom: '0.75rem' }}>{error}</p>
        )}

        <section>
          <h2
            style={{
              fontSize: '1.125rem',
              marginBottom: '0.75rem',
              fontWeight: 600,
            }}
          >
            店舗一覧（上位10件想定）
          </h2>

          {stores.length === 0 ? (
            <p style={{ color: '#6b7280' }}>まだ検索されていません。</p>
          ) : (
            <ul style={{ display: 'grid', gap: '0.5rem' }}>
              {stores.map((store, index) => {
                // カラム名がプロジェクトによって違っても、それなりに表示できるようにする
                const displayName =
                  (store.name as string) ??
                  (store.store_name as string) ??
                  (store.shop_name as string) ??
                  '店舗名';

                const displayChain =
                  (store.chain as string) ??
                  (store.chain_name as string) ??
                  '';

                const displayAddress =
                  (store.address as string) ??
                  (store.full_address as string) ??
                  (store.road_address as string) ??
                  '';

                return (
                  <li
                    key={store.id ?? index}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{displayName}</div>
                    <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                      {displayChain && <span>{displayChain} / </span>}
                      {displayAddress}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
