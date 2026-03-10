'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import StoreFeedback from '@/components/StoreFeedback';
import WatchNotifyBar from '@/components/WatchNotifyBar';
import { supabase } from '@/lib/supabaseClient';

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

type StoreScore = {
  ttlHours?: number | null;
  foundCount?: number | null;
  notFoundCount?: number | null;
  total?: number | null;
  lastFoundAt?: string | null;
  lastNotFoundAt?: string | null;
  lastAnyAt?: string | null;
  lastStatus?: 'found' | 'not_found' | null;
  label?: '高' | '中' | '低' | '—' | string | null;
  rank?: number | null;
};

type Store = {
  id: string;
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

  lat?: number | null;
  lng?: number | null;

  distance_m?: number | null;

  community?: StoreCommunity | null;
  score?: StoreScore | null;
};

type HandlingApiStore = {
  store_id: string;
  chain?: string | null;

  name?: string | null;
  address?: string | null;
  phone?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  distance_m?: number | null;

  found_count?: number | null;
  not_found_count?: number | null;
  total_reports?: number | null;

  last_found_at?: string | null;
  last_not_found_at?: string | null;
  last_any_at?: string | null;
  last_reported_at?: string | null;

  last_status?: 'found' | 'not_found' | null;
  status_label?: string | null;
  info_rank?: number | null;
};

type HandlingApiResponse = {
  productId: number;
  ttlHours: number;
  radiusKm?: number;
  count?: number;
  stores: HandlingApiStore[];
};

async function logProductRequest(keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  const { error } = await supabase.from('product_requests').insert({
    keyword: trimmed,
  });

  if (error) console.warn('product_requests insert failed:', error.message);
}

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

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';

  const diffMs = Date.now() - t;
  if (!Number.isFinite(diffMs)) return '—';
  if (diffMs <= 0) return 'たった今';

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}秒前`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;

  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}時間前`;

  const day = Math.floor(hr / 24);
  return `${day}日前`;
}

function calcScoreLabelRank(
  foundCount: number,
  notFoundCount: number,
  lastStatus: 'found' | 'not_found' | null
) {
  const total = foundCount + notFoundCount;
  if (total === 0) return { label: '—' as const, rank: 0 as const };
  if (notFoundCount >= 1 && foundCount === 0) return { label: '低' as const, rank: 1 as const };
  if (foundCount >= 1 && lastStatus === 'found' && notFoundCount === 0) {
    return { label: '高' as const, rank: 3 as const };
  }
  return { label: '中' as const, rank: 2 as const };
}

function calcCommunityLabel(found: number, notFound: number) {
  const COMMUNITY_MIN_SAMPLES = 5;
  const total = found + notFound;
  if (total === 0) return null;
  if (total < COMMUNITY_MIN_SAMPLES) return 'データ少';

  const foundRate = total > 0 ? found / total : null;
  if (foundRate !== null && foundRate >= 0.7) return '買えた多め';
  if (foundRate !== null && foundRate <= 0.3) return '売切れ多め';
  return null;
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef<string | null>(null);

  const RADIUS_KM = 5.0;
  const HANDLING_RADIUS_KM = 10;
  const HANDLING_TTL_HOURS = 168;
  const MIN_SUGGEST_CHARS = 2;
  const SUGGEST_DEBOUNCE_MS = 250;

  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);

  const [handlingStores, setHandlingStores] = useState<Store[]>([]);
  const [handlingAvailable, setHandlingAvailable] = useState(false);
  const [handlingLoading, setHandlingLoading] = useState(false);
  const [handlingError, setHandlingError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [hasSearched, setHasSearched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [productId, setProductId] = useState<number | null>(null);
  const [highRiskStoreIds, setHighRiskStoreIds] = useState<string[]>([]);

  type SortMode = 'distance' | 'score';
  const [sortMode, setSortMode] = useState<SortMode>('distance');
  const [userChangedSort, setUserChangedSort] = useState(false);

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  const [requestSent, setRequestSent] = useState(false);

  const trimmedKeyword = useMemo(() => keyword.trim(), [keyword]);
  const isHandlingMode = handlingAvailable;
  const shouldHideNearbyWhileCheckingHandling = handlingLoading && !handlingAvailable;

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
    if (name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return null;
  };

  const normalizePhoneForTel = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits || null;
  };

  const stripPostalCode = (address: string) => {
    return String(address ?? '')
      .replace(/〒\s*\d{3}-\d{4}\s*/g, '')
      .replace(/^\s*\d{3}-\d{4}\s*/g, '')
      .trim();
  };

  type VoteSuccessDetail = {
    storeId: string;
    productId: number;
    status: 'found' | 'not_found';
    createdAt: string;
  };

  const buildScoreFromCounts = (args: {
    ttlHours: number;
    foundCount: number;
    notFoundCount: number;
    lastFoundAt: string | null;
    lastNotFoundAt: string | null;
    lastAnyAt: string | null;
    lastStatus: 'found' | 'not_found' | null;
    rankOverride?: number | null;
    labelOverride?: string | null;
  }): StoreScore => {
    const calculated = calcScoreLabelRank(args.foundCount, args.notFoundCount, args.lastStatus);
    return {
      ttlHours: args.ttlHours,
      foundCount: args.foundCount,
      notFoundCount: args.notFoundCount,
      total: args.foundCount + args.notFoundCount,
      lastFoundAt: args.lastFoundAt,
      lastNotFoundAt: args.lastNotFoundAt,
      lastAnyAt: args.lastAnyAt,
      lastStatus: args.lastStatus,
      label: args.labelOverride ?? calculated.label,
      rank: Number.isFinite(Number(args.rankOverride)) ? Number(args.rankOverride) : calculated.rank,
    };
  };

  const mapHandlingToStore = (row: HandlingApiStore, ttlHours: number): Store => {
    const foundCount = Number(row.found_count ?? 0);
    const notFoundCount = Number(row.not_found_count ?? 0);
    const lastStatus = row.last_status ?? null;
    const lastAnyAt = row.last_any_at ?? row.last_reported_at ?? null;

    const score = buildScoreFromCounts({
      ttlHours,
      foundCount,
      notFoundCount,
      lastFoundAt: row.last_found_at ?? (lastStatus === 'found' ? lastAnyAt : null),
      lastNotFoundAt: row.last_not_found_at ?? (lastStatus === 'not_found' ? lastAnyAt : null),
      lastAnyAt,
      lastStatus,
      rankOverride: row.info_rank ?? null,
      labelOverride: null,
    });

    return {
      id: String(row.store_id),
      chain: row.chain ?? null,
      name: row.name ?? null,
      address: row.address ?? null,
      phone: row.phone ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      distance_m: row.distance_m ?? null,
      score,
      community: null,
    };
  };

  const fetchHandlingStores = async (
    pid: number,
    lat: number | null,
    lng: number | null
  ): Promise<{ available: boolean; stores: Store[] }> => {
    setHandlingLoading(true);
    setHandlingError(null);

    try {
      if (lat == null || lng == null) {
        throw new Error('取扱店の表示には位置情報の取得が必要です。');
      }

      const params = new URLSearchParams({
        productId: String(pid),
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(HANDLING_RADIUS_KM),
        ttlHours: String(HANDLING_TTL_HOURS),
      });

      const res = await fetch(`/api/handling-stores?${params.toString()}`, {
        cache: 'no-store',
      });

      if (res.status === 404) {
        setHandlingAvailable(false);
        setHandlingStores([]);
        return { available: false, stores: [] };
      }

      const json: unknown = await res.json().catch(() => ({}));
      const maybeError =
        typeof json === 'object' && json !== null && 'error' in json
          ? (json as { error?: unknown }).error
          : undefined;

      if (!res.ok) {
        const msg = typeof maybeError === 'string' ? maybeError : '取扱店 API の呼び出しに失敗しました';
        throw new Error(msg);
      }

      const payload = json as Partial<HandlingApiResponse>;
      const ttl = Number(payload.ttlHours ?? HANDLING_TTL_HOURS);
      const rows = Array.isArray(payload.stores) ? (payload.stores as HandlingApiStore[]) : [];
      const mapped = rows.map((r) => mapHandlingToStore(r, ttl));

      setHandlingAvailable(true);
      setHandlingStores(mapped);

      return { available: true, stores: mapped };
    } catch (e: unknown) {
      setHandlingAvailable(false);
      setHandlingStores([]);
      setHandlingError(getErrorMessage(e) || '取扱店の取得に失敗しました。');
      return { available: false, stores: [] };
    } finally {
      setHandlingLoading(false);
    }
  };

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<VoteSuccessDetail>).detail;
      if (!detail) return;

      if (!productId || Number(detail.productId) !== Number(productId)) return;

      const apply = (prev: Store[]) => {
        return prev.map((s) => {
          if (String(s.id) !== String(detail.storeId)) return s;

          const createdAt = detail.createdAt;

          const ttlHours = Number(s.score?.ttlHours ?? HANDLING_TTL_HOURS);
          const foundCount = Number(s.score?.foundCount ?? 0) + (detail.status === 'found' ? 1 : 0);
          const notFoundCount = Number(s.score?.notFoundCount ?? 0) + (detail.status === 'not_found' ? 1 : 0);

          const nextScore = buildScoreFromCounts({
            ttlHours,
            foundCount,
            notFoundCount,
            lastFoundAt: detail.status === 'found' ? createdAt : (s.score?.lastFoundAt ?? null),
            lastNotFoundAt: detail.status === 'not_found' ? createdAt : (s.score?.lastNotFoundAt ?? null),
            lastAnyAt: createdAt,
            lastStatus: detail.status,
          });

          const c = s.community ?? null;
          const cFound = Number(c?.found ?? 0) + (detail.status === 'found' ? 1 : 0);
          const cNotFound = Number(c?.notFound ?? 0) + (detail.status === 'not_found' ? 1 : 0);
          const cTotal = cFound + cNotFound;

          const nextCommunity: StoreCommunity | null = c
            ? {
                ...c,
                found: cFound,
                notFound: cNotFound,
                total: cTotal,
                lastReportAt: createdAt,
                label: calcCommunityLabel(cFound, cNotFound),
              }
            : null;

          return { ...s, score: nextScore, community: nextCommunity };
        });
      };

      setStores((prev) => apply(prev));
      setHandlingStores((prev) => apply(prev));
    };

    window.addEventListener('qpick_vote_success', handler as EventListener);
    return () => window.removeEventListener('qpick_vote_success', handler as EventListener);
  }, [productId]);

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
            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#2563eb' }} />
          </div>
        )}
      </div>
    );
  };

  const renderFreshStatusCompact = (store: Store) => {
    const s = store?.score;

    const ttlHours = Number(s?.ttlHours ?? HANDLING_TTL_HOURS);
    const found = Number(s?.foundCount ?? 0);
    const notFound = Number(s?.notFoundCount ?? 0);
    const lastAnyAt = typeof s?.lastAnyAt === 'string' ? s.lastAnyAt : null;

    let text = '報告なし';
    let badge = pill({ bg: '#f3f4f6', bd: '#e5e7eb', fg: '#374151' });

    if (found > 0) {
      text = '買えた報告あり';
      badge = pill({ bg: '#ecfdf5', bd: '#bbf7d0', fg: '#166534' });
    } else if (notFound > 0) {
      text = '売り切れ報告あり';
      badge = pill({ bg: '#fff7ed', bd: '#fed7aa', fg: '#9a3412' });
    }

    return (
      <div style={{ marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={badge}>{text}</span>
          <span style={{ fontSize: '0.8rem', color: '#475569' }}>最終報告 {formatTimeAgo(lastAnyAt)}</span>
          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>集計 直近{ttlHours}時間</span>
        </div>

        <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#64748b' }}>
          買えた {found}・売り切れ {notFound}
        </div>
      </div>
    );
  };

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

  const confirmCandidate = (c: Candidate) => {
    setSelectedCandidate(c);
    setCandidates([]);
    setNotice(null);
    setKeyword(c.name);

    setStores([]);
    setHandlingStores([]);
    setHandlingAvailable(false);
    setHandlingError(null);

    setHighRiskStoreIds([]);
    setHasSearched(false);
    setProductId(null);
    setError(null);

    setSortMode('distance');
    setUserChangedSort(false);
  };

  const clearSelection = () => {
    setUserPos(null);

    setSelectedCandidate(null);
    setProductId(null);

    setStores([]);
    setHandlingStores([]);
    setHandlingAvailable(false);
    setHandlingError(null);

    setHighRiskStoreIds([]);
    setHasSearched(false);
    setNotice(null);
    setError(null);

    setSortMode('distance');
    setUserChangedSort(false);
  };

  const shownStores = useMemo(() => {
    if (shouldHideNearbyWhileCheckingHandling) return [];
    return isHandlingMode ? handlingStores : stores;
  }, [shouldHideNearbyWhileCheckingHandling, isHandlingMode, handlingStores, stores]);

  const sortedStores = useMemo(() => {
    const copy = [...shownStores];

    if (sortMode === 'distance') {
      copy.sort((a, b) => {
        const ad = Number(a.distance_m ?? Number.POSITIVE_INFINITY);
        const bd = Number(b.distance_m ?? Number.POSITIVE_INFINITY);
        return ad - bd;
      });
      return copy;
    }

    copy.sort((a, b) => {
      const ar = Number(a.score?.rank ?? 0);
      const br = Number(b.score?.rank ?? 0);
      if (br !== ar) return br - ar;

      const al = typeof a.score?.lastAnyAt === 'string' ? a.score?.lastAnyAt : '';
      const bl = typeof b.score?.lastAnyAt === 'string' ? b.score?.lastAnyAt : '';
      if (bl !== al) return bl > al ? 1 : -1;

      const ad = Number(a.distance_m ?? Number.POSITIVE_INFINITY);
      const bd = Number(b.distance_m ?? Number.POSITIVE_INFINITY);
      return ad - bd;
    });

    return copy;
  }, [shownStores, sortMode]);

  const emptyMessage = useMemo(() => {
    if (isHandlingMode) {
      return `現在地から${HANDLING_RADIUS_KM}km以内に取扱店が見つかりませんでした。`;
    }
    return notice ?? `半径${RADIUS_KM}km以内にデータが見つかりませんでした。`;
  }, [isHandlingMode, HANDLING_RADIUS_KM, notice, RADIUS_KM]);

  const resultHeading = isHandlingMode ? '近くの取扱店舗' : '近くの店舗';

  const runSearch = async (c: Candidate) => {
    setLoading(true);
    setError(null);
    setNotice(null);

    setStores([]);
    setHandlingStores([]);
    setHandlingAvailable(false);
    setHandlingError(null);

    setHighRiskStoreIds([]);
    setHasSearched(false);

    setUserChangedSort(false);
    setSortMode('distance');

    try {
      const pos = await getCurrentPositionAsync({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 0,
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      setUserPos({ lat, lng });

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

      const pid = Number.isFinite(apiProductId) ? apiProductId : c.id;

      setStores(storesFromApi);
      setProductId(pid);
      setHighRiskStoreIds(apiHighRisk);

      const handlingResult = await fetchHandlingStores(pid, lat, lng);
      const hasHandlingStores = handlingResult.available;

      let nextSort: SortMode = 'distance';
      if (hasHandlingStores) {
        nextSort = 'score';
      } else if (!userChangedSort) {
        const hasScored = storesFromApi.some((s) => Number(s.score?.total ?? 0) > 0);
        const hasMidOrHigh = storesFromApi.some((s) => Number(s.score?.rank ?? 0) >= 2);
        if (hasScored && hasMidOrHigh) nextSort = 'score';
      }

      setSortMode(nextSort);

      try {
        const renderTarget = hasHandlingStores ? handlingResult.stores : storesFromApi;
        const ttlHours = Number(renderTarget[0]?.score?.ttlHours ?? (hasHandlingStores ? HANDLING_TTL_HOURS : 6));

        const counts = renderTarget.reduce(
          (acc, s) => {
            const label = String(s.score?.label ?? '—');
            if (label === '高') acc.high += 1;
            else if (label === '中') acc.mid += 1;
            else if (label === '低') acc.low += 1;
            else acc.none += 1;
            return acc;
          },
          { high: 0, mid: 0, low: 0, none: 0 }
        );

        sendGAEvent('event', 'score_rendered', {
          product_id: String(c.id),
          ttl_hours: String(ttlHours),
          stores_total: String(renderTarget.length),
          scored_store_count: String(renderTarget.length - counts.none),
          score_high_count: String(counts.high),
          score_mid_count: String(counts.mid),
          score_low_count: String(counts.low),
          sort_mode: nextSort,
          result_mode: hasHandlingStores ? 'handling' : 'nearby',
        });
      } catch {}

      setHasSearched(true);

      if (!hasHandlingStores && storesFromApi.length === 0) {
        setNotice(
          `現在地から${RADIUS_KM}km以内に店舗が見つかりませんでした。※現在、α版のため「東京エリア・大阪エリアのセブンイレブン・ファミリーマート・ローソン」が対象です。`
        );
      }
    } catch (err: unknown) {
      if (isGeoError(err)) {
        if (err.code === 1) {
          setError('検索には位置情報の許可が必要です。ブラウザの設定で許可をしてから、再度検索ボタンを押してください。');
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
      setHandlingStores([]);
      setHandlingAvailable(false);
      setHandlingError(null);

      setHighRiskStoreIds([]);
      setHasSearched(false);
      setNotice(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const pidRaw = searchParams.get('productId');
    const keywordRaw = searchParams.get('keyword');

    if (!pidRaw || !keywordRaw) return;

    const pid = Number(pidRaw);
    const name = keywordRaw.trim();

    if (!Number.isFinite(pid) || !name) return;

    const deepLinkKey = `${pid}:${name}`;
    if (deepLinkHandledRef.current === deepLinkKey) return;
    deepLinkHandledRef.current = deepLinkKey;

    const candidate: Candidate = { id: pid, name };

    setKeyword(name);
    setSelectedCandidate(candidate);
    setCandidates([]);
    setSuggestLoading(false);

    setStores([]);
    setHandlingStores([]);
    setHandlingAvailable(false);
    setHandlingError(null);

    setHighRiskStoreIds([]);
    setHasSearched(false);
    setProductId(pid);
    setError(null);
    setNotice(null);
    setUserPos(null);

    setSortMode('distance');
    setUserChangedSort(false);

    void runSearch(candidate);
  }, [searchParams]);

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
      <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column' }}>
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

          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.4 }}>
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
                  setHandlingStores([]);
                  setHandlingAvailable(false);
                  setHandlingError(null);

                  setHighRiskStoreIds([]);
                  setHasSearched(false);
                  setProductId(null);
                  setError(null);
                  setNotice(null);

                  setSortMode('distance');
                  setUserChangedSort(false);
                }}
                placeholder="商品名の一部を入力"
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
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
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
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#e2e8f0';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#f1f5f9';
                    }}
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
                  {loading ? '現在地周辺を探しています…' : '近くで探す'}
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  ※位置情報の許可が必要です
                </p>
              </div>
            )}
          </form>
        </div>

        {(hasSearched || loading) && (
          <section style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: '#334155' }}>
                {resultHeading}
                {shownStores.length > 0 && (
                  <span style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: '0.5rem', color: '#64748b' }}>
                    {shownStores.length}件
                  </span>
                )}
              </h2>

              {shownStores.length > 0 && (
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>並べ替え</span>
                  <select
                    value={sortMode}
                    onChange={(e) => {
                      const v = e.target.value === 'score' ? 'score' : 'distance';
                      setSortMode(v);
                      setUserChangedSort(true);
                      sendGAEvent('event', 'sort_changed', {
                        sort_mode: v,
                        placement: 'search_results_header',
                      });
                    }}
                    style={{
                      padding: '0.45rem 0.6rem',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#fff',
                      color: '#0f172a',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    aria-label="sort-mode"
                  >
                    <option value="distance">距離順</option>
                    <option value="score">情報あり順</option>
                  </select>
                </div>
              )}
            </div>

            {loading && (
              <div
                style={{
                  marginBottom: '1rem',
                  color: '#64748b',
                  fontSize: '0.9rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '0.9rem 1rem',
                }}
              >
                現在地周辺の店舗情報を読み込み中…
              </div>
            )}

            {shouldHideNearbyWhileCheckingHandling && !loading && (
              <div
                style={{
                  marginBottom: '1rem',
                  color: '#64748b',
                  fontSize: '0.9rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '0.9rem 1rem',
                }}
              >
                取扱店データを確認中…
              </div>
            )}

            {isHandlingMode && !loading && (
              <div
                style={{
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  color: '#64748b',
                }}
              >
                ※現在地から10km以内の取扱店を表示
              </div>
            )}

            {handlingError && !isHandlingMode && !loading && (
              <div style={{ marginBottom: '1rem', color: '#ef4444', fontSize: '0.9rem' }}>
                取扱店の確認に失敗したため、近くの店舗を表示しています。
              </div>
            )}

            {!isHandlingMode && stores.length > 0 && productId !== null && selectedCandidate && userPos && (
              <div style={{ marginBottom: '1rem' }}>
                <WatchNotifyBar
                  productId={productId}
                  productName={selectedCandidate.name}
                  lat={userPos.lat}
                  lng={userPos.lng}
                />
              </div>
            )}

            {shownStores.length === 0 && !loading && !error && !shouldHideNearbyWhileCheckingHandling && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: '#6b7280',
                  backgroundColor: '#fff',
                  borderRadius: 16,
                }}
              >
                <p>{emptyMessage}</p>
              </div>
            )}

            <ul style={{ display: 'grid', gap: '1rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {sortedStores.map((store, index) => {
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

                const isHighRisk = !isHandlingMode && highRiskStoreIds.includes(String(store.id));

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
                      <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>
                        {displayName}
                      </div>
                      {isHighRisk && (
                        <span style={pill({ bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' })}>要注意</span>
                      )}
                    </div>

                    {store.distance_m != null && (
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                        現在地から {fmtDistance(store.distance_m)}
                      </div>
                    )}

                    <>
                      {renderFreshStatusCompact(store)}
                      {!isHandlingMode ? renderCommunityCompact(store) : null}
                    </>

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
                        <StoreFeedback
                          storeId={String(store.id)}
                          storeName={displayName}
                          productId={productId}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div style={{ marginTop: '1.6rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
            エリア別の店舗情報
          </div>

          <Link
            href="/areas"
            prefetch={false}
            onClick={() =>
              sendGAEvent('event', 'area_pages_click', {
                placement: 'below_search_results',
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
          </Link>

          <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#94a3b8' }}>
            都道府県 → 市区町村 → 店舗詳細（買えた率/コメント）
          </div>
        </div>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
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
          <div style={{ width: '100%', maxWidth: 600 }}>
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 24,
                padding: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                border: '1px solid #f1f5f9',
                color: '#64748b',
                textAlign: 'center',
              }}
            >
              読み込み中…
            </div>
          </div>
        </main>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}