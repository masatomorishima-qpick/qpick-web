'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
// 1. GAイベント送信用の関数をインポート
import { sendGAEvent } from '@next/third-parties/google';

type Props = {
  storeId: string;
  storeName: string;
  productId: number;
  // 2. 住所と電話番号をPropsに追加（データがない場合もあるので任意 '?' にしています）
  address?: string | null;
  phone?: string | null;
};

// セッションID生成（簡易版）
function getOrCreateSessionId() {
  const KEY = 'qpick_session_id';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;

    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }
}

export default function StoreFeedback({ storeId, storeName, productId, address, phone }: Props) {
  const [votedStatus, setVotedStatus] = useState<'found' | 'not_found' | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);

  const [comment, setComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  const votedKey = useMemo(() => `qpick_voted:${storeId}:${productId}`, [storeId, productId]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(votedKey);
      if (v === 'found' || v === 'not_found') {
        setVotedStatus(v);
      }
    } catch {}
  }, [votedKey]);

  const handleVote = async (status: 'found' | 'not_found') => {
    if (votedStatus || voteLoading) return;

    setVoteLoading(true);
    setVoteError(null);
    setCommentNotice(null);

    // 投票アクションも計測したい場合はここで sendGAEvent を呼べます
    // sendGAEvent('event', 'vote_store', { store_name: storeName, status: status });

    try {
      const sessionId = getOrCreateSessionId();

      const { error } = await supabase.from('store_product_flags').insert({
        store_id: storeId,
        product_id: productId,
        status,
        session_id: sessionId,
      });

      if (error) {
        // 二重投稿（ユニーク制約）などは「投票済み」として扱う
        if (error.code === '23505') {
          setVotedStatus(status);
          try {
            localStorage.setItem(votedKey, status);
          } catch {}
          return;
        }
        throw error;
      }

      setVotedStatus(status);
      try {
        localStorage.setItem(votedKey, status);
      } catch {}
    } catch (e: any) {
      setVoteError(e?.message ?? '投票に失敗しました。');
    } finally {
      setVoteLoading(false);
    }
  };

  const handleSendComment = async () => {
    setCommentError(null);
    setCommentNotice(null);

    const trimmed = comment.trim();
    if (!trimmed) return;

    setCommentLoading(true);

    try {
      const { error } = await supabase.from('feedback').insert({
        store_id: storeId,
        product_id: productId,
        comment: trimmed,
      });

      if (error) throw error;

      setComment('');
      setCommentNotice('コメントを送信しました。ありがとうございます。');
    } catch (e: any) {
      setCommentError(e?.message ?? 'コメント送信に失敗しました。');
    } finally {
      setCommentLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#374151' }}>
        この店舗で買えましたか？
      </div>

      {/* 投票ボタンエリア */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {/* 買えたボタン（緑） */}
        <button
          type="button"
          onClick={() => handleVote('found')}
          disabled={!!votedStatus || voteLoading}
          style={{
            flex: 1, // 横幅を均等に
            padding: '0.75rem',
            borderRadius: 12,
            border: votedStatus === 'found' ? '2px solid #10b981' : '1px solid #d1d5db',
            backgroundColor: votedStatus === 'found' ? '#ecfdf5' : '#ffffff',
            color: votedStatus === 'found' ? '#047857' : '#374151',
            fontWeight: 800,
            cursor: !!votedStatus || voteLoading ? 'default' : 'pointer',
            opacity: (votedStatus && votedStatus !== 'found') ? 0.4 : 1, // 選んでない方を薄く
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>✓</span>
          <span>買えた</span>
        </button>

        {/* 買えなかったボタン（赤） */}
        <button
          type="button"
          onClick={() => handleVote('not_found')}
          disabled={!!votedStatus || voteLoading}
          style={{
            flex: 1, // 横幅を均等に
            padding: '0.75rem',
            borderRadius: 12,
            border: votedStatus === 'not_found' ? '2px solid #ef4444' : '1px solid #d1d5db',
            backgroundColor: votedStatus === 'not_found' ? '#fef2f2' : '#ffffff',
            color: votedStatus === 'not_found' ? '#b91c1c' : '#374151',
            fontWeight: 800,
            cursor: !!votedStatus || voteLoading ? 'default' : 'pointer',
            opacity: (votedStatus && votedStatus !== 'not_found') ? 0.4 : 1, // 選んでない方を薄く
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>✕</span>
          <span>ない</span>
        </button>
      </div>

      {voteError && <div style={{ color: '#b91c1c', fontSize: '0.875rem' }}>{voteError}</div>}

      {/* コメントエリア（投票済みの場合のみ表示） */}
      {votedStatus && (
        <div style={{ marginTop: '0.5rem', animation: 'fadeIn 0.3s ease-in' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={votedStatus === 'found' ? "価格や売り場の様子など（任意）" : "棚になかった、店員に聞いた等（任意）"}
              maxLength={140}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                fontSize: '0.9rem',
                backgroundColor: '#f9fafb',
              }}
            />
            <button
              type="button"
              onClick={handleSendComment}
              disabled={commentLoading || !comment.trim()}
              style={{
                padding: '0 1rem',
                borderRadius: 10,
                border: 'none',
                backgroundColor: commentLoading || !comment.trim() ? '#9ca3af' : '#2563eb',
                color: '#fff',
                fontWeight: 700,
                cursor: commentLoading || !comment.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.9rem',
              }}
            >
              {commentLoading ? '送信中' : '送信'}
            </button>
          </div>

          {commentNotice && (
            <div style={{ color: '#059669', fontSize: '0.875rem', marginTop: '0.5rem', fontWeight: 600 }}>
              {commentNotice}
            </div>
          )}
          {commentError && (
            <div style={{ color: '#b91c1c', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {commentError}
            </div>
          )}
        </div>
      )}

      {/* 3. 住所・電話番号表示エリア（GA計測付き） */}
      {(address || phone) && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          
          {/* 住所ボタン */}
          {address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                // GA計測イベント: tap_address
                sendGAEvent('event', 'tap_address', { 
                  store_name: storeName, 
                  address_value: address 
                });
              }}
              style={{ 
                fontSize: '0.85rem', 
                color: '#2563eb', 
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <span>📍</span>
              <span style={{ textDecoration: 'underline' }}>{address}</span>
            </a>
          )}

          {/* 電話番号ボタン */}
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={() => {
                // GA計測イベント: tap_phone
                sendGAEvent('event', 'tap_phone', { 
                  store_name: storeName, 
                  phone_value: phone 
                });
              }}
              style={{ 
                fontSize: '0.85rem', 
                color: '#2563eb', 
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <span>📞</span>
              <span style={{ textDecoration: 'underline' }}>{phone}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}