'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import StoreFeedback from '@/components/StoreFeedback';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import { sendGAEvent } from '@next/third-parties/google';

type Candidate = {
  id: number;
  name: string;
  category?: string | null;
};

type StoreCommunity = {
  windowDays?: number | null;
  found?: number | null;
  notFound?: number | null;
  total?: number | null;
  lastReportAt?: string | null;
  label?: string | null;
};

type Store = {
  id: string; // uuid（APIから文字列で来る想定）
  chain?: string | null;

  name?: string | null;
  store_name?: string | null;
  shop_name?: string | null;

  address?: string | null;
  full_address?: string | null;
  road_address?: string | null;

  phone?: string | null;
  tel?: string | null;
  telephone?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  // 互換用（念のため）
  lat?: number | null;
  lng?: number | null;

  distance_m?: number | null;

  community?: StoreCommunity | null;
};

// ★オーナー相談フォーム（トップ導線用）
const OWNER_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSesiwtfNBHr1XByAE9_ObRyPJJlnqHvIg8Key1iuKDAg-A86A/viewform?usp=dialog';

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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isGeoError(err: unknown): err is { code: number; message?: string } {
  if (typeof err !== 'object' || err === null) return false;
  if (!('code' in err)) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'number';
}

function pickFirstNonEmptyString(values: Array<unknown>): string | null {
  for (const v of values) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) return s;
    }
  }
  return null;
}

export default function HomePage() {
  const RADIUS_KM = 5.0; // route.ts の radius_m=5000 と合わせる（表示用）
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

  const fmtDistance = (m: unknown) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return null;
    if (n < 1000) return `${Math.round(n)}m`;
    return `${(n / 1000).toFixed(1)}km`;
  };

  // Google Maps URLs API：店名 + 住所で検索（店舗詳細が開きやすい）
  const buildMapUrl = (params: {
    latitude?: unknown;
    longitude?: unknown;
    address?: unknown;
    name?: unknown;
  }) => {
    const lat = Number(params.latitude);
    const lng = Number(params.longitude);
    const name = typeof params.name === 'string' ? params.name.trim() : '';
    const addr = typeof params.address === 'string' ? params.address.trim() : '';

    if (name && addr) {
      const query = `${name} ${addr}`;
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }

    if (name) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    return null;
  };

  const normalizePhoneForTel = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits || null;
  };

  // 住所から郵便番号（〒123-4567）を除去（表示＆地図リンク用）
  const stripPostalCode = (address: string) => {
    return String(address ?? '')
      .replace(/〒\s*\d{3}-\d{4}\s*/g, '')
      .replace(/^\s*\d{3}-\d{4}\s*/g, '')
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

  const renderCommunityCompact = (store: Store) => {
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
          <span style={pill({ bg: '#ecfdf5', bd: '#bbf7d0', fg: '#166534' })}>
            ✓ 買えた {Number.isFinite(found) ? found : 0}
          </span>
          <span style={pill({ bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' })}>
            × 売切れ {Number.isFinite(notFound) ? notFound : 0}
          </span>

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
        const json: unknown = await res.json().catch(() => ({}));

        const maybeError =
          typeof json === 'object' && json !== null && 'error' in json
            ? (json as { error?: unknown }).error
            : undefined;

        const maybeCandidates =
          typeof json === 'object' && json !== null && 'candidates' in json
            ? (json as { candidates?: unknown }).candidates
            : undefined;

        if (!res.ok) {
          const msg = typeof maybeError === 'string' ? maybeError : 'サジェスト API の呼び出しに失敗しました';
          throw new Error(msg);
        }

        const list = Array.isArray(maybeCandidates) ? (maybeCandidates as Candidate[]) : [];

        if (list.length === 0) {
          setCandidates([]);
          setNotice('該当する商品が見つかりませんでした。必要なら追加要望を送れます。');
        } else {
          setCandidates(list);
          setNotice(null);
        }
      } catch (e: unknown) {
        // AbortError は無視
        if (typeof e === 'object' && e !== null && 'name' in e) {
          const name = (e as { name?: unknown }).name;
          if (name === 'AbortError') return;
        }

        setCandidates([]);
        setNotice(null);
        setError(getErrorMessage(e) || 'サジェスト中にエラーが発生しました。');
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
    setError(null);
  };

  const clearSelection = () => {
    setSelectedCandidate(null);
    setProductId(null);
    setHighRiskStoreIds([]);
    setStores([]);
    setHasSearched(false);
    setNotice(null);
    setError(null);
  };

  // -----------------------------
  // 店舗検索（検索ボタン）
  // ※ search_logs は API 側で一元管理する（ここではログINSERTしない）
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

      // 検索には「正確な現在地」を使う（結果精度のため）
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const params = new URLSearchParams({
        productId: String(c.id),
        lat: String(lat),
        lng: String(lng),
      });

      const res = await fetch(`/api/search?${params.toString()}`);
      const json: unknown = await res.json().catch(() => ({}));

      const maybeError =
        typeof json === 'object' && json !== null && 'error' in json
          ? (json as { error?: unknown }).error
          : undefined;

      if (!res.ok) {
        const msg = typeof maybeError === 'string' ? maybeError : '検索 API の呼び出しに失敗しました';
        throw new Error(msg);
      }

      const storesFromApi =
        typeof json === 'object' &&
        json !== null &&
        'stores' in json &&
        Array.isArray((json as { stores?: unknown }).stores)
          ? ((json as { stores: unknown[] }).stores as Store[])
          : [];

      const apiProductId =
        typeof json === 'object' && json !== null && 'productId' in json
          ? Number((json as { productId?: unknown }).productId)
          : NaN;

      const apiHighRisk =
        typeof json === 'object' &&
        json !== null &&
        'highRiskStoreIds' in json &&
        Array.isArray((json as { highRiskStoreIds?: unknown }).highRiskStoreIds)
          ? ((json as { highRiskStoreIds: unknown[] }).highRiskStoreIds as string[])
          : [];

      setStores(storesFromApi);
      setProductId(Number.isFinite(apiProductId) ? apiProductId : c.id);
      setHighRiskStoreIds(apiHighRisk);
      setHasSearched(true);

      if (storesFromApi.length === 0) {
        setNotice(
          `現在地から${RADIUS_KM}km以内に店舗が見つかりませんでした。※現在、α版のため「東京エリア・大阪エリアのセブンイレブン・ファミリーマート・ローソン」が対象です。`
        );
      }
    } catch (err: unknown) {
      // 位置情報系エラー（Geolocation）
      if (isGeoError(err)) {
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
        setError(getErrorMessage(err) || '検索中にエラーが発生しました。時間をおいて再度お試しください。');
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
    } catch (e: unknown) {
      setError(getErrorMessage(e) || '追加要望の送信に失敗しました。');
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
        backgroundColor: '#f8fafc',
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
              α版：東京・大阪エリア（セブン・ファミマ・ローソン）
            </span>
          </div>

          <h1
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: '#111827',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            その商品、最寄りのコンビニにあるかも？
          </h1>

          <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            みんなの目撃情報で無駄足回避
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
                  setError(null);
                  setNotice(null);
                }}
                placeholder="商品名の一部を入力（例：ちいかわ）"
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

            {(error || (notice && !hasSearched)) && (
              <div style={{ fontSize: '0.9rem', padding: '0 0.5rem' }}>
                {error && <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>}
                {notice && !hasSearched && <p style={{ color: '#6b7280', margin: 0 }}>{notice}</p>}
              </div>
            )}

            {suggestLoading && (
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0, paddingLeft: '0.8rem' }}>
                候補を検索中…
              </p>
            )}

            {!selectedCandidate && candidates.length > 0 && (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.25rem 0.5rem' }}>
                  候補から選択してください
                </p>
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

{/* エリア別店舗情報（店舗向け導線の上） */}
<div style={{ marginTop: '1.6rem', textAlign: 'center' }}>
  <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
    エリア別の店舗情報
  </div>

  <a
    href="/areas"
    onClick={() =>
      sendGAEvent('event', 'area_pages_click', {
        placement: 'above_owner_section',
      })
    }
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '0.75rem 1.1rem',
      borderRadius: 999,
      border: '1px solid #bfdbfe',
      backgroundColor: '#eff6ff',
      color: '#1d4ed8',
      textDecoration: 'underline',
      textUnderlineOffset: 2,
      fontSize: '0.95rem',
      fontWeight: 800,
      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
      cursor: 'pointer',
    }}
  >
    エリア別店舗情報はこちら
  </a>

  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#94a3b8' }}>
    都道府県 → 市区町村 → 店舗詳細（買えた率/コメント）
  </div>
</div>


        {/* オーナー向け導線（検索窓の後） */}
        <div
          style={{
            marginTop: '1.6rem',
            textAlign: 'center',
          }}
        >
          {/* 区切り（任意：別コンテンツ感を強める） */}
          <div
            style={{
              height: 1,
              backgroundColor: '#e2e8f0',
              margin: '0 auto 1rem',
              width: '70%',
              borderRadius: 999,
            }}
          />

          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>店舗様向け</div>

          <a
            href={OWNER_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              sendGAEvent('event', 'owner_form_click', {
                placement: 'after_search_box',
              })
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '0.75rem 1.1rem',
              borderRadius: 999,
              border: '1px solid #fdba74',
              backgroundColor: '#fff7ed',
              color: '#9a3412',
              textDecoration: 'none',
              fontSize: '0.95rem',
              fontWeight: 800,
              boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#ffedd5';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#fff7ed';
            }}
          >
            在庫連携はこちら
          </a>

          <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#94a3b8' }}>
            無料トライアル実施中。店舗名・住所公開が参加条件です。
          </div>
        </div>

        {(hasSearched || loading) && (
          <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: '#334155' }}>
              検索結果
              {stores.length > 0 && (
                <span style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: '0.5rem', color: '#64748b' }}>
                  {stores.length}件見つかりました
                </span>
              )}
            </h2>

            {stores.length === 0 && !loading && !error && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: '#6b7280',
                  backgroundColor: '#fff',
                  borderRadius: 16,
                }}
              >
                <p>{notice ?? `半径${RADIUS_KM}km以内にデータが見つかりませんでした。`}</p>
              </div>
            )}

            <ul style={{ display: 'grid', gap: '1rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {stores.map((store, index) => {
                const displayName =
                  pickFirstNonEmptyString([store.name, store.store_name, store.shop_name]) ?? '店舗名';

                const displayAddressRaw =
                  pickFirstNonEmptyString([store.address, store.full_address, store.road_address]) ?? '';

                const displayAddress = stripPostalCode(displayAddressRaw);

                const displayPhone =
                  pickFirstNonEmptyString([store.phone, store.tel, store.telephone]) ?? '';

                const phoneDigits = displayPhone ? normalizePhoneForTel(displayPhone) : null;

                const mapUrl = buildMapUrl({
                  latitude: store.latitude ?? store.lat,
                  longitude: store.longitude ?? store.lng,
                  address: displayAddress,
                  name: displayName,
                });

                const isHighRisk = highRiskStoreIds.includes(String(store.id));

                return (
                  <li
                    key={store.id || String(index)}
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

                    {renderCommunityCompact(store)}

                    <div
                      style={{
                        marginTop: '1rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid #f1f5f9',
                        fontSize: '0.9rem',
                      }}
                    >
                      <div style={{ marginBottom: '0.4rem' }}>
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              sendGAEvent('event', 'tap_address', {
                                store_name: displayName,
                                address_value: displayAddress,
                              })
                            }
                            style={{
                              color: '#2563eb',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
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
                              onClick={() =>
                                sendGAEvent('event', 'tap_phone', {
                                  store_name: displayName,
                                  phone_value: displayPhone,
                                })
                              }
                              style={{
                                color: '#2563eb',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
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
