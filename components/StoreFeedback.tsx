'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { sendGAEvent } from '@next/third-parties/google';

type Props = {
  storeId: string;
  storeName: string;
  productId: number;
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

  // コメント表示用モーダルの状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const votedKey = useMemo(() => `qpick_voted:${storeId}:${productId}`, [storeId, productId]);

  // 1時間経過チェック
  useEffect(() => {
    try {
      const raw = localStorage.getItem(votedKey);
      if (!raw) return;

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data && data.status && data.timestamp) {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        if (now - data.timestamp < oneHour) {
          setVotedStatus(data.status);
        }
      }
    } catch (e) {
      console.error('LocalStorage read error:', e);
    }
  }, [votedKey]);

  // 投票処理
  const handleVote = async (status: 'found' | 'not_found') => {
    if (votedStatus || voteLoading) return;

    setVoteLoading(true);
    setVoteError(null);
    setCommentNotice(null);

    try {
      const sessionId = getOrCreateSessionId();
      const payload = {
        p_store_id: storeId, 
        p_product_id: productId,
        p_status: status,
        p_session_id: sessionId,
        p_comment: null 
      };

      const { data, error } = await supabase.rpc('add_feedback_with_cooldown', payload);

      if (error) throw error;

      if (data && data.success) {
        setVotedStatus(status);
        const storageValue = JSON.stringify({
          status: status,
          timestamp: Date.now()
        });
        localStorage.setItem(votedKey, storageValue);
      } else {
        setVoteError(data?.message || 'しばらく時間を空けてから再度お試しください。');
      }

    } catch (e: any) {
      console.error(e);
      setVoteError(e?.message ?? '投票に失敗しました。');
    } finally {
      setVoteLoading(false);
    }
  };

  // コメント送信処理
  const handleSendComment = async () => {
    setCommentError(null);
    setCommentNotice(null);

    const trimmed = comment.trim();
    if (!trimmed) return;

    setCommentLoading(true);

    try {
      // is_approved はDBデフォルトで FALSE になるため、送信直後は非表示
      const { error } = await supabase.from('feedback').insert({
        store_id: storeId,
        product_id: productId,
        comment: trimmed,
      });

      if (error) throw error;

      setComment('');
      // ユーザーへのメッセージを変更
      setCommentNotice('報告ありがとうございます！承認後に表示されます。');
    } catch (e: any) {
      setCommentError(e?.message ?? 'コメント送信に失敗しました。');
    } finally {
      setCommentLoading(false);
    }
  };

  // コメント取得処理（承認済みのみ）
  const fetchComments = async () => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, comment, created_at')
        .eq('store_id', storeId)
        .eq('product_id', productId)
        .eq('is_approved', true) // ★承認済みのみ取得
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments(data || []);
      setIsModalOpen(true);
    } catch (e) {
      console.error('Comments fetch error:', e);
    } finally {
      setCommentsLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ 
        fontWeight: 800, 
        fontSize: '1rem', 
        color: '#1f2937', 
        textAlign: 'center',
        marginBottom: '-0.25rem' 
      }}>
        在庫はどうでしたか？
      </div>

      {/* 投票ボタンエリア */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        
        {/* 買えたボタン */}
        <button
          type="button"
          onClick={() => handleVote('found')}
          disabled={!!votedStatus || voteLoading}
          style={{
            flex: 1,
            position: 'relative',
            padding: '1rem 0.5rem',
            borderRadius: 16,
            border: votedStatus === 'found' ? '2px solid #10b981' : 'none',
            backgroundColor: votedStatus === 'found' ? '#d1fae5' : '#ecfdf5',
            color: '#065f46',
            fontWeight: 800,
            cursor: !!votedStatus || voteLoading ? 'default' : 'pointer',
            opacity: (votedStatus && votedStatus !== 'found') ? 0.3 : 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            transition: 'all 0.15s ease-out',
            boxShadow: votedStatus === 'found' ? 'none' : '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
            transform: votedStatus === 'found' ? 'scale(0.98)' : 'scale(1)',
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>🙆</span>
          <span style={{ fontSize: '1rem' }}>ありました！</span>
        </button>

        {/* ないボタン */}
        <button
          type="button"
          onClick={() => handleVote('not_found')}
          disabled={!!votedStatus || voteLoading}
          style={{
            flex: 1,
            position: 'relative',
            padding: '1rem 0.5rem',
            borderRadius: 16,
            border: votedStatus === 'not_found' ? '2px solid #ef4444' : 'none',
            backgroundColor: votedStatus === 'not_found' ? '#fee2e2' : '#fff1f2',
            color: '#991b1b',
            fontWeight: 800,
            cursor: !!votedStatus || voteLoading ? 'default' : 'pointer',
            opacity: (votedStatus && votedStatus !== 'not_found') ? 0.3 : 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            transition: 'all 0.15s ease-out',
            boxShadow: votedStatus === 'not_found' ? 'none' : '0 4px 6px -1px rgba(239, 68, 68, 0.2)',
            transform: votedStatus === 'not_found' ? 'scale(0.98)' : 'scale(1)',
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>🙅</span>
          <span style={{ fontSize: '1rem' }}>なかった…</span>
        </button>
      </div>

      {voteError && <div style={{ color: '#b91c1c', fontSize: '0.875rem', textAlign: 'center' }}>{voteError}</div>}

      {/* コメント入力エリア（投票済みのみ表示） */}
      {votedStatus && (
        <div style={{ marginTop: '0.5rem', animation: 'fadeIn 0.3s ease-in' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              // ★修正：プレースホルダーを短縮
              placeholder="例）A賞終了"
              maxLength={140}
              style={{
                flex: 1,
                padding: '0.8rem',
                borderRadius: 12,
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
                padding: '0 1.2rem',
                borderRadius: 12,
                border: 'none',
                backgroundColor: commentLoading || !comment.trim() ? '#9ca3af' : '#2563eb',
                color: '#fff',
                fontWeight: 700,
                cursor: commentLoading || !comment.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.9rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              {commentLoading ? '...' : '送信'}
            </button>
          </div>

          {commentNotice && (
            <div style={{ color: '#059669', fontSize: '0.875rem', marginTop: '0.5rem', fontWeight: 600, textAlign: 'center' }}>
              {commentNotice}
            </div>
          )}
          {commentError && (
            <div style={{ color: '#b91c1c', fontSize: '0.875rem', marginTop: '0.5rem', textAlign: 'center' }}>
              {commentError}
            </div>
          )}
        </div>
      )}

      {/* ★修正：ボタン名をシンプルに変更 */}
      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={fetchComments}
          style={{ 
            fontSize: '0.9rem', 
            color: '#4b5563', 
            textDecoration: 'underline', 
            background: 'none', 
            border: 'none', 
            cursor: 'pointer',
            padding: '0.5rem'
          }}
        >
          💬 コメントを見る
        </button>
      </div>

      {/* 住所・電話番号 */}
      {(address || phone) && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                sendGAEvent('event', 'tap_address', { store_name: storeName, address_value: address });
              }}
              style={{ fontSize: '0.9rem', color: '#4b5563', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span style={{ fontSize: '1.1rem' }}>📍</span>
              <span style={{ textDecoration: 'underline' }}>{address}</span>
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={() => {
                sendGAEvent('event', 'tap_phone', { store_name: storeName, phone_value: phone });
              }}
              style={{ fontSize: '0.9rem', color: '#4b5563', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <span style={{ fontSize: '1.1rem' }}>📞</span>
              <span style={{ textDecoration: 'underline' }}>{phone}</span>
            </a>
          )}
        </div>
      )}

      {/* ★コメント表示モーダル */}
      {isModalOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            style={{
              backgroundColor: '#fff',
              width: '100%',
              maxWidth: '400px',
              maxHeight: '80vh',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()} // 中身クリックで閉じないように
          >
            {/* ヘッダー */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1f2937' }}>コメント一覧</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* リストエリア */}
            <div style={{ padding: '1rem', overflowY: 'auto' }}>
              {commentsLoading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>読み込み中...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  まだ承認済みのコメントはありません。<br />（投稿は承認後に表示されます）
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {comments.map((c) => (
                    <li key={c.id} style={{ backgroundColor: '#f3f4f6', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                      <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.4rem', textAlign: 'right' }}>
                        {new Date(c.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div style={{ padding: '0.75rem', borderTop: '1px solid #eee', textAlign: 'center' }}>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ width: '100%', padding: '0.6rem', backgroundColor: '#374151', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}