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

type VotedStatus = 'found' | 'not_found';

type VotedCache = {
  status: VotedStatus;
  timestamp: number;
};

type RpcResult = {
  success: boolean;
  message?: string | null;
};

type ApprovedComment = {
  id: number;
  comment: string;
  created_at: string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// セッションID（poster_id）生成・取得
function getOrCreateSessionId(): string {
  const KEY = 'qpick_poster_id'; // マイページと共通のキーに変更
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

function parseVotedCache(raw: string): VotedCache | null {
  try {
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return null;

    const status = (obj as { status?: unknown }).status;
    const timestamp = (obj as { timestamp?: unknown }).timestamp;

    if ((status === 'found' || status === 'not_found') && typeof timestamp === 'number') {
      return { status, timestamp };
    }
    return null;
  } catch {
    return null;
  }
}

export default function StoreFeedback({ storeId, storeName, productId, address, phone }: Props) {
  const [votedStatus, setVotedStatus] = useState<VotedStatus | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteLoading, setVoteLoading] = useState(false);

  const [comment, setComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [comments, setComments] = useState<ApprovedComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // ★ 新規追加：EXP獲得ポップアップの表示状態
  const [showExpToast, setShowExpToast] = useState(false);

  const votedKey = useMemo(() => `qpick_voted:${storeId}:${productId}`, [storeId, productId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(votedKey);
      if (!raw) return;

      const data = parseVotedCache(raw);
      if (!data) return;

      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      if (now - data.timestamp < oneHour) {
        setVotedStatus(data.status);
      }
    } catch (e: unknown) {
      console.error('LocalStorage read error:', e);
    }
  }, [votedKey]);

  // ★ 新規追加：1日1回のEXP付与ロジック
  const grantDailyExp = async (sessionId: string) => {
    try {
      const today = new Date().toLocaleDateString('ja-JP'); // 例: "2026/3/12"
      const lastExpDate = localStorage.getItem('qpick_last_exp_date');

      // 今日すでにEXPをもらっていたら何もしない
      if (lastExpDate === today) return;

      // まだもらっていなければ、DBのプロフィールを探す
      const { data: profile } = await supabase
        .from('profiles')
        .select('exp')
        .eq('id', sessionId)
        .maybeSingle();

      if (profile) {
        // プロフィールが存在すれば、EXPを+1して更新
        await supabase
          .from('profiles')
          .update({ exp: profile.exp + 1 })
          .eq('id', sessionId);
      } else {
        // プロフィールがまだ無ければ、1EXP持った状態で新規作成
        await supabase
          .from('profiles')
          .insert({ id: sessionId, nickname: '名無しのコレクター', exp: 1 });
      }

      // 今日EXPをもらった印をスマホに保存
      localStorage.setItem('qpick_last_exp_date', today);

      // 「+1 EXP獲得！」のポップアップを3秒間表示
      setShowExpToast(true);
      setTimeout(() => setShowExpToast(false), 3000);

    } catch (err) {
      console.error('EXP付与に失敗しました:', err);
    }
  };

  const handleVote = async (status: VotedStatus) => {
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
        p_comment: null as string | null,
      };

      const { data, error } = await supabase.rpc('add_feedback_with_cooldown', payload);

      if (error) throw error;

      const result = (data ?? null) as unknown as RpcResult | null;

      if (result?.success) {
        setVotedStatus(status);
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();

        const storageValue = JSON.stringify({
          status,
          timestamp: nowMs,
        } satisfies VotedCache);
        localStorage.setItem(votedKey, storageValue);

        try {
          sendGAEvent('event', 'vote_submit', {
            store_id: storeId,
            product_id: String(productId),
            status,
          });
        } catch {}

        try {
          window.dispatchEvent(
            new CustomEvent('qpick_vote_success', {
              detail: {
                storeId,
                productId,
                status,
                createdAt: nowIso,
              },
            })
          );
        } catch {}

        // ★ 新規追加：投票成功時に、1日1回のEXP付与処理を呼び出す
        await grantDailyExp(sessionId);

      } else {
        setVoteError(result?.message ?? 'しばらく時間を空けてから再度お試しください。');
      }
    } catch (e: unknown) {
      console.error(e);
      setVoteError(getErrorMessage(e) || '投票に失敗しました。');
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
      setCommentNotice('報告ありがとうございます！承認後に表示されます。');
    } catch (e: unknown) {
      setCommentError(getErrorMessage(e) || 'コメント送信に失敗しました。');
    } finally {
      setCommentLoading(false);
    }
  };

  const fetchComments = async () => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, comment, created_at')
        .eq('store_id', storeId)
        .eq('product_id', productId)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (Array.isArray(data) ? data : []) as unknown as Array<{
        id: unknown;
        comment: unknown;
        created_at: unknown;
      }>;

      const normalized: ApprovedComment[] = list
        .map((row) => {
          const id = Number(row.id);
          const commentText = typeof row.comment === 'string' ? row.comment : '';
          const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
          if (!Number.isFinite(id) || !createdAt) return null;
          return { id, comment: commentText, created_at: createdAt };
        })
        .filter((v): v is ApprovedComment => v !== null);

      setComments(normalized);
      setIsModalOpen(true);
    } catch (e: unknown) {
      console.error('Comments fetch error:', e);
    } finally {
      setCommentsLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem', position: 'relative' }}>
      
      {/* ★ 新規追加：EXP獲得時のトースト通知 */}
      {showExpToast && (
        <div style={{
          position: 'absolute',
          top: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#f59e0b',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '999px',
          fontWeight: 'bold',
          fontSize: '0.9rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          animation: 'bounceIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          zIndex: 10,
          whiteSpace: 'nowrap'
        }}>
          ✨ 1 EXP 獲得しました！
        </div>
      )}

      {/* キーフレームアニメーション（グローバルCSSがない場合の簡易対応） */}
      <style>{`
        @keyframes bounceIn {
          0% { opacity: 0; transform: translateX(-50%) scale(0.8); }
          50% { transform: translateX(-50%) scale(1.1); }
          100% { opacity: 1; transform: translateX(-50%) scale(1); }
        }
      `}</style>

      <div
        style={{
          fontWeight: 800,
          fontSize: '1rem',
          color: '#1f2937',
          textAlign: 'center',
          marginBottom: '-0.25rem',
        }}
      >
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
            opacity: votedStatus && votedStatus !== 'found' ? 0.3 : 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            transition: 'all 0.15s ease-out',
            boxShadow: votedStatus === 'found' ? 'none' : '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
            transform: votedStatus === 'found' ? 'scale(0.98)' : 'scale(1)',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
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
            opacity: votedStatus && votedStatus !== 'not_found' ? 0.3 : 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.3rem',
            transition: 'all 0.15s ease-out',
            boxShadow: votedStatus === 'not_found' ? 'none' : '0 4px 6px -1px rgba(239, 68, 68, 0.2)',
            transform: votedStatus === 'not_found' ? 'scale(0.98)' : 'scale(1)',
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.96)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>🙅</span>
          <span style={{ fontSize: '1rem' }}>なかった…</span>
        </button>
      </div>

      {voteError && (
        <div style={{ color: '#b91c1c', fontSize: '0.875rem', textAlign: 'center' }}>{voteError}</div>
      )}

      {/* コメント入力エリア（投票済みのみ表示） */}
      {votedStatus && (
        <div style={{ marginTop: '0.5rem', animation: 'fadeIn 0.3s ease-in' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
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
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              {commentLoading ? '...' : '送信'}
            </button>
          </div>

          {commentNotice && (
            <div
              style={{
                color: '#059669',
                fontSize: '0.875rem',
                marginTop: '0.5rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
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
            padding: '0.5rem',
          }}
        >
          💬 コメントを見る
        </button>
      </div>

      {/* 住所・電話番号 */}
      {(address || phone) && (
        <div
          style={{
            marginTop: '0.5rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
          }}
        >
          {address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                sendGAEvent('event', 'tap_address', { store_name: storeName, address_value: address });
              }}
              style={{
                fontSize: '0.9rem',
                color: '#4b5563',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
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
              style={{
                fontSize: '0.9rem',
                color: '#4b5563',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>📞</span>
              <span style={{ textDecoration: 'underline' }}>{phone}</span>
            </a>
          )}
        </div>
      )}

      {/* コメント表示モーダル */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
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
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1rem',
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f9fafb',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1f2937' }}>コメント一覧</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '1rem', overflowY: 'auto' }}>
              {commentsLoading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>読み込み中...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  まだ承認済みのコメントはありません。<br />（投稿は承認後に表示されます）
                </div>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {comments.map((c) => (
                    <li
                      key={c.id}
                      style={{
                        backgroundColor: '#f3f4f6',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                      }}
                    >
                      <div style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{c.comment}</div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#9ca3af',
                          marginTop: '0.4rem',
                          textAlign: 'right',
                        }}
                      >
                        {new Date(c.created_at).toLocaleString('ja-JP', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ padding: '0.75rem', borderTop: '1px solid #eee', textAlign: 'center' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  backgroundColor: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
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