'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import StoreFeedback from '@/components/StoreFeedback';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
// ▼ 1. GA計測用の関数をインポート
import { sendGAEvent } from '@next/third-parties/google';

// stores テーブルのカラム名はプロジェクトごとに違う可能性があるので any
type Store = any;

type Candidate = {
  id: number;
  name: string;
  category?: string | null;
};

// 検索ログ（RLSでINSERTのみ許可している前提）
async function logSearch(params: { keyword: string; storeCountShown: number }) {
  const trimmed = params.keyword.trim();
  if (!trimmed) return;

  const { error } = await supabase.from('search_logs').insert({
    keyword: trimmed,
    store_count_shown: params.storeCountShown,
  });

  if (error) console.warn('search_logs insert failed:', error.message);
}

// 追加要望ログ（product_requests に INSERTするだけ）
async function logProductRequest(keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  const { error } = await supabase.from('product_requests').insert({
    keyword: trimmed,
  });

  if (error) console.warn('product_requests insert failed:', error.message);
}

// 位置情報を Promise 化
function getCurrentPositionAsync(options?: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

export default function HomePage() {
  const RADIUS_KM = 1.5; // route.ts の radius_m=1500 と合わせる（表示用）
  const MIN_SUGGEST_CHARS = 2;
  const SUGGEST_DEBOUNCE_MS = 250;

  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 店舗検索を実行したか（初期は店舗一覧を出さないため）
  const [hasSearched, setHasSearched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [productId, setProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [highRiskStoreIds, setHighRiskStoreIds] = useState<string[]>([]);

  // サジェスト
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  // 追加要望（同一キーワードの連打防止：localStorage）
  const [requestSent, setRequestSent] = useState(false);

  const trimmedKeyword = useMemo(() => keyword.trim(), [keyword]);

  const requestKey = useMemo(() => {
    if (!trimmedKeyword) return null;
    return `qpick_requested:${trimmedKeyword.toLowerCase()}`;
  }, [trimmedKeyword]);

  useEffect(() => {
    if (!requestKey) {
      setRequestSent(false);
      return;
    }
    try {
      const v = localStorage.getItem(requestKey);
      setRequestSent(v === '1');
    } catch {
      setRequestSent(false);
    }
  }, [requestKey]);

  const fmtDistance = (m: any) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return null;
    if (n < 1000) return `${Math.round(n)}m`;
    return `${(n / 1000).toFixed(1)}km`;
  };

  const buildMapUrl = (params: { latitude?: any; longitude?: any; address?: any }) => {
    const lat = Number(params.latitude);
    const lng = Number(params.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // Google Maps（スマホではMapsアプリに遷移しやすい）
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    const addr = String(params.address ?? '').trim();
    if (addr) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    }

    return null;
  };

  const normalizePhoneForTel = (phone: string) => {
    // "03-1234-5678" → "0312345678"
    const digits = phone.replace(/\D/g, '');
    return digits || null;
  };

  // 住所から郵便番号（〒123-4567）を除去（表示＆地図リンク用）
  const stripPostalCode = (address: string) => {
    return String(address ?? '')
      .replace(/〒\s*\d{3}-\d{4}\s*/g, '')
      .replace(/^\s*\d{3}-\d{4}\s*/g, '') // 〒なしケースの保険
      .trim();
  };

  // -----------------------------
  // 「みんなの結果（店舗別）」：最小表示
  // -----------------------------
  const pillBase = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0.28rem 0.55rem',
    borderRadius: 999,
    fontSize: '0.8rem',
    fontWeight: 800,
    lineHeight: 1.1,
    border: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    color: '#111827',
    whiteSpace: 'nowrap' as const,
  };

  const pill = (opt: { bg?: string; bd?: string; fg?: string }) => ({
    ...pillBase,
    backgroundColor: opt.bg ?? pillBase.backgroundColor,
    border: `1px solid ${opt.bd ?? '#e5e7eb'}`,
    color: opt.fg ?? pillBase.color,
  });

  const renderCommunityCompact = (store: any) => {
    const c = store?.community;

    if (!c) return null;

    const found = Number(c.found ?? 0);
    const notFound = Number(c.notFound ?? 0);
    const total = Number(c.total ?? found + notFound);
    const windowDays = Number(c.windowDays ?? 30);

    if (!Number.isFinite(total) || total <= 0) return null;

    const pct = Math.round((found / total) * 100);
    const showBar = total >= 3;

    return (
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={pill({ bg: '#ecfdf5', bd: '#bbf7d0', fg: '#166534' })}>✓ 買えた {found}</span>
          <span style={pill({ bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' })}>× 売切れ {notFound}</span>

          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>直近{windowDays}日</span>
        </div>

        {showBar && (
          <div
            style={{
              marginTop: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: '#e5e7eb',
              overflow: 'hidden',
            }}
            aria-label={`buy-rate-${pct}`}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: '#2563eb',
              }}
            />
          </div>
        )}
      </div>
    );
  };

  // -----------------------------
  // 入力中サジェスト（商品確定前のみ）
  // -----------------------------
  useEffect(() => {
    if (selectedCandidate) return;

    setError(null);
    setNotice(null);

    if (!trimmedKeyword) {
      setCandidates([]);
      setSuggestLoading(false);
      return;
    }

    if (trimmedKeyword.length < MIN_SUGGEST_CHARS) {
      setCandidates([]);
      setSuggestLoading(false);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setSuggestLoading(true);

      try {
        const res = await fetch(`/api/suggest?keyword=${encodeURIComponent(trimmedKeyword)}`, {
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(json?.error ?? 'サジェスト API の呼び出しに失敗しました');

        const list = (json.candidates ?? []) as Candidate[];

        if (list.length === 0) {
          setCandidates([]);
          setNotice('該当する商品が見つかりませんでした。必要なら追加要望を送れます。');
        } else {
          setCandidates(list);
          setNotice(null);
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setCandidates([]);
        setNotice(null);
        setError(e?.message ?? 'サジェスト中にエラーが発生しました。');
      } finally {
        setSuggestLoading(false);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedKeyword, selectedCandidate]);

  // -----------------------------
  // 商品確定（候補クリック）
  // -----------------------------
  const confirmCandidate = (c: Candidate) => {
    setSelectedCandidate(c);
    setCandidates([]);
    setNotice(null);

    setKeyword(c.name);

    setStores([]);
    setHighRiskStoreIds([]);
    setHasSearched(false);
    setProductId(null);
    setProductName(null);
    setError(null);
  };

  const clearSelection = () => {
    setSelectedCandidate(null);
    setProductId(null);
    setProductName(null);
    setHighRiskStoreIds([]);
    setStores([]);
    setHasSearched(false);
    setNotice(null);
    setError(null);
  };

  // -----------------------------
  // 店舗検索（検索ボタン）
  // -----------------------------
  const runSearch = async (c: Candidate) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setStores([]);
    setHighRiskStoreIds([]);
    setHasSearched(false);

    try {
      const pos = await getCurrentPositionAsync({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 0,
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const params = new URLSearchParams({
        productId: String(c.id),
        lat: String(lat),
        lng: String(lng),
      });

      const res = await fetch(`/api/search?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? '検索 API の呼び出しに失敗しました');
      }

      const storesFromApi: Store[] = json.stores ?? [];

      setStores(storesFromApi);
      setProductId(json.productId ?? c.id);
      setProductName(json.productName ?? c.name ?? null);
      setHighRiskStoreIds(json.highRiskStoreIds ?? []);
      setHasSearched(true);

      if (storesFromApi.length === 0) {
        setNotice(
          `現在地から${RADIUS_KM}km以内に店舗が見つかりませんでした。※現在、α版のため「東京23区内の主要コンビニ」のみが対象です。`
        );
      }

      await logSearch({
        keyword: c.name,
        storeCountShown: storesFromApi.length,
      });
    } catch (err: any) {
      if (typeof err?.code === 'number') {
        if (err.code === 1) {
          setError(
            '検索には位置情報の許可が必要です。ブラウザの設定で許可をしてから、再度検索ボタンを押してください。'
          );
        } else if (err.code === 2) {
          setError('位置情報が取得できませんでした（端末/ブラウザ設定をご確認ください）。');
        } else if (err.code === 3) {
          setError('位置情報の取得がタイムアウトしました。電波の良い場所で再度お試しください。');
        } else {
          setError('位置情報が取得できませんでした。設定を確認して再度お試しください。');
        }
      } else {
        setError(err?.message ?? '検索中にエラーが発生しました。時間をおいて再度お試しください。');
      }

      setStores([]);
      setHighRiskStoreIds([]);
      setHasSearched(false);
      setNotice(null);
    } finally {
      setLoading(false);
    }
  };

  const canSearch = !!selectedCandidate && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCandidate) return;
    await runSearch(selectedCandidate);
  };

  const handleRequest = async () => {
    setError(null);

    if (!trimmedKeyword || trimmedKeyword.length < MIN_SUGGEST_CHARS) return;

    if (requestSent) {
      setNotice('すでに追加要望を受け付けています。ありがとうございます。');
      return;
    }

    try {
      await logProductRequest(trimmedKeyword);

      if (requestKey) {
        try {
          localStorage.setItem(requestKey, '1');
        } catch {}
      }

      setRequestSent(true);
      setNotice('追加要望を受け付けました。ありがとうございます。');
    } catch (e: any) {
      setError(e?.message ?? '追加要望の送信に失敗しました。');
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1rem',
        backgroundColor: '#f8fafc', // 背景を少し明るいグレーに
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 600,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '2rem',
            textAlign: 'center',
          }}
        >
          {/* ロゴ：サイズを小さく */}
          <div style={{ marginBottom: '1rem' }}>
            <Image
              src="/qpick_logo.png"
              alt="Qpick"
              width={160}
              height={62}
              priority
              style={{ height: 'auto', objectFit: 'contain' }}
            />
          </div>

          {/* ▼ 追加箇所：α版・地域限定バッジ ▼ */}
          <div style={{ marginBottom: '1rem' }}>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '0.3rem 0.8rem',
                borderRadius: 999,
              }}
            >
              α版：東京23区限定（セブン・ファミマ・ローソン）
            </span>
          </div>

          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#111827',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            コンビニ在庫を、みんなで共有。
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            探す手間、ゼロに。
          </p>
        </header>

        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
            border: '1px solid #f1f5f9',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                aria-label="商品を入力"
                value={keyword}
                onChange={(e) => {
                  const v = e.target.value;
                  setKeyword(v);
                  if (selectedCandidate) setSelectedCandidate(null);
                  setStores([]);
                  setHighRiskStoreIds([]);
                  setHasSearched(false);
                  setProductId(null);
                  setProductName(null);
                  setError(null);
                  setNotice(null);
                }}
                placeholder="商品名を入力（例：マスク）"
                style={{
                  width: '100%',
                  padding: '1rem 1.2rem',
                  borderRadius: 999,
                  border: '1px solid #cbd5e1',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'box-shadow 0.2s',
                  backgroundColor: '#f8fafc',
                }}
                onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.2)')}
                onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
              />
            </div>

            {/* エラー・通知メッセージ */}
            {(error || notice) && (
              <div style={{ fontSize: '0.9rem', padding: '0 0.5rem' }}>
                {error && <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>}
                {notice && <p style={{ color: '#6b7280', margin: 0 }}>{notice}</p>}
              </div>
            )}
            {suggestLoading && <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0, paddingLeft: '0.8rem' }}>候補を検索中…</p>}

            {/* 候補リスト */}
            {!selectedCandidate && candidates.length > 0 && (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.25rem 0.5rem' }}>候補から選択してください</p>
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => confirmCandidate(c)}
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem 1rem',
                      borderRadius: 12,
                      border: 'none',
                      backgroundColor: '#f1f5f9',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e2e8f0')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  >
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.name}</div>
                    {c.category && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.category}</div>}
                  </button>
                ))}
              </div>
            )}

            {/* 候補0件 → 追加要望 */}
            {!selectedCandidate &&
              trimmedKeyword.length >= MIN_SUGGEST_CHARS &&
              candidates.length === 0 &&
              !suggestLoading && (
                <button
                  type="button"
                  onClick={handleRequest}
                  disabled={requestSent}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 12,
                    border: '1px dashed #cbd5e1',
                    backgroundColor: requestSent ? '#f3f4f6' : '#ffffff',
                    color: requestSent ? '#9ca3af' : '#2563eb',
                    cursor: requestSent ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  {requestSent ? '追加要望を送信しました' : `「${trimmedKeyword}」の追加をリクエスト`}
                </button>
              )}

            {/* 確定後の表示 ＆ 検索ボタン */}
            {selectedCandidate && (
              <div style={{ animation: 'fadeIn 0.3s ease-in' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#eff6ff',
                    borderRadius: 12,
                    border: '1px solid #bfdbfe',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>選択中</span>
                    <span style={{ fontWeight: 700, color: '#1e3a8a' }}>{selectedCandidate.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#60a5fa',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    変更
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!canSearch}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: !canSearch ? '#94a3b8' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: !canSearch ? 'not-allowed' : 'pointer',
                    boxShadow: !canSearch ? 'none' : '0 4px 6px -1px rgba(37, 99, 235, 0.3)',
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? '現在地周辺を探しています…' : '近くの店舗を検索'}
                </button>
                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  ※位置情報の許可が必要です
                </p>
              </div>
            )}
          </form>
        </div>

        {/* 店舗一覧表示エリア */}
        {(hasSearched || loading) && (
          <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: '#334155' }}>
              検索結果
              {stores.length > 0 && <span style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: '0.5rem', color: '#64748b' }}>{stores.length}件見つかりました</span>}
            </h2>

            {stores.length === 0 && !loading && !error && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', backgroundColor: '#fff', borderRadius: 16 }}>
                <p>{notice ?? `半径${RADIUS_KM}km以内にデータが見つかりませんでした。`}</p>
              </div>
            )}

            <ul style={{ display: 'grid', gap: '1rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {stores.map((store, index) => {
                const displayName =
                  (store.name as string) ??
                  (store.store_name as string) ??
                  (store.shop_name as string) ??
                  '店舗名';

                const displayAddressRaw =
                  (store.address as string) ??
                  (store.full_address as string) ??
                  (store.road_address as string) ??
                  '';

                const displayAddress = stripPostalCode(displayAddressRaw);

                const displayPhone =
                  (store.phone as string) ??
                  (store.tel as string) ??
                  (store.telephone as string) ??
                  '';

                const phoneDigits = displayPhone ? normalizePhoneForTel(displayPhone) : null;

                const mapUrl = buildMapUrl({
                  latitude: store.latitude ?? store.lat,
                  longitude: store.longitude ?? store.lng,
                  address: displayAddress,
                });

                const isHighRisk = highRiskStoreIds.includes(String(store.id));

                return (
                  <li
                    key={store.id ?? index}
                    style={{
                      padding: '1.25rem',
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>{displayName}</div>
                      {isHighRisk && (
                        <span style={pill({ bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' })}>要注意</span>
                      )}
                    </div>

                    {store.distance_m != null && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                        現在地から {fmtDistance(store.distance_m)}
                      </div>
                    )}

                    {/* 在庫状況（コミュニティ） */}
                    {renderCommunityCompact(store)}

                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
                      <div style={{ marginBottom: '0.4rem' }}>
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            // ▼ 2. 住所クリックイベントを追加
                            onClick={() => sendGAEvent('event', 'tap_address', { 
                              store_name: displayName, 
                              address_value: displayAddress 
                            })}
                            style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            📍 {displayAddress}
                          </a>
                        ) : (
                          <span style={{ color: '#475569' }}>📍 {displayAddress}</span>
                        )}
                      </div>

                      {displayPhone && (
                        <div>
                          {phoneDigits ? (
                            <a 
                              href={`tel:${phoneDigits}`} 
                              // ▼ 3. 電話クリックイベントを追加
                              onClick={() => sendGAEvent('event', 'tap_phone', { 
                                store_name: displayName, 
                                phone_value: displayPhone 
                              })}
                              style={{ color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              📞 {displayPhone}
                            </a>
                          ) : (
                            <span style={{ color: '#475569' }}>📞 {displayPhone}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {productId !== null && (
                      <div style={{ marginTop: '1rem' }}>
                        <StoreFeedback storeId={String(store.id)} storeName={displayName} productId={productId} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}