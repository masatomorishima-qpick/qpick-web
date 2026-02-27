'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getExistingSubscription,
  getOrCreateSubscriberId,
  subscribePush,
  unsubscribePush,
} from '@/lib/pushClient';

type Props = {
  productId: number;
  productName: string;
  lat: number;
  lng: number;
};

export default function WatchNotifyBar({ productId, productName, lat, lng }: Props) {
  const subscriberId = useMemo(() => {
    try {
      return getOrCreateSubscriberId();
    } catch {
      return null;
    }
  }, []);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!subscriberId) return;
      const sub = await getExistingSubscription();
      setPushEnabled(!!sub);

      try {
        const res = await fetch(
          `/api/watch?subscriber_id=${encodeURIComponent(subscriberId)}&product_id=${encodeURIComponent(String(productId))}`
        );
        const json = await res.json().catch(() => ({}));
        setWatchEnabled(Boolean(json?.enabled));
      } catch {}
    })();
  }, [subscriberId, productId]);

  const onEnablePush = async () => {
    if (!subscriberId) return;
    setBusy(true);
    setMsg(null);
    try {
      const sub = await subscribePush();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          subscription: sub.toJSON(),
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error('購読情報の保存に失敗しました。');
      setPushEnabled(true);
      setMsg('通知を有効にしました。');
    } catch (e: any) {
      setMsg(e?.message || '通知の設定に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const onDisablePush = async () => {
    if (!subscriberId) return;
    setBusy(true);
    setMsg(null);
    try {
      await unsubscribePush();
      await fetch('/api/push/disable', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriber_id: subscriberId }),
      });
      setPushEnabled(false);
      setMsg('通知を無効にしました。');
    } catch (e: any) {
      setMsg(e?.message || '通知の解除に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const onToggleWatch = async () => {
    if (!subscriberId) return;
    setBusy(true);
    setMsg(null);
    try {
      const enable = !watchEnabled;
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          product_id: productId,
          lat,
          lng,
          enable,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'ウォッチの更新に失敗しました。');

      setWatchEnabled(enable);
      setMsg(enable ? 'この商品をウォッチしました。' : 'ウォッチを解除しました。');
    } catch (e: any) {
      setMsg(e?.message || 'ウォッチの更新に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        padding: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>近隣通知（買えた報告のみ）</div>
      <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 10, lineHeight: 1.5 }}>
        「{productName}」の買えた報告が近くで入ったときに通知します。
        <br />
        直近2時間以内のみ・同じエリアは30分に1回まで。在庫を保証するものではありません。
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!pushEnabled ? (
          <button
            type="button"
            onClick={onEnablePush}
            disabled={busy}
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: 12,
              border: '1px solid #bfdbfe',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              fontWeight: 800,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            通知を有効にする
          </button>
        ) : (
          <button
            type="button"
            onClick={onDisablePush}
            disabled={busy}
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: 12,
              border: '1px solid #fecaca',
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              fontWeight: 800,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            通知を無効にする
          </button>
        )}

        <button
          type="button"
          onClick={onToggleWatch}
          disabled={busy || !pushEnabled}
          title={!pushEnabled ? '先に通知を有効にしてください' : ''}
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: 12,
            border: '1px solid #cbd5e1',
            backgroundColor: watchEnabled ? '#0f172a' : '#ffffff',
            color: watchEnabled ? '#ffffff' : '#0f172a',
            fontWeight: 800,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: !pushEnabled ? 0.6 : 1,
          }}
        >
          {watchEnabled ? 'ウォッチ中（解除）' : 'この商品をウォッチ'}
        </button>

        {!pushEnabled && (
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            ※ウォッチするには「通知を有効にする」が必要です
          </span>
        )}
      </div>

      {msg && <div style={{ marginTop: 10, fontSize: '0.85rem', color: '#334155' }}>{msg}</div>}
    </div>
  );
}