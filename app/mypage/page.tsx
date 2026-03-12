'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// ブラウザ用のID（poster_id）を生成する機能
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// EXPから称号を判定する機能（案A：コミュニティ貢献度路線）
function getTitle(exp: number) {
  if (exp >= 15) return '【殿堂入り】レジェンド';
  if (exp >= 7) return 'エキスパート';
  if (exp >= 3) return 'ナビゲーター';
  if (exp >= 1) return 'サポーター';
  return 'ルーキー';
}

// 次の称号までの必要EXPを計算する機能
function getNextExp(exp: number) {
  if (exp < 1) return 1 - exp;
  if (exp < 3) return 3 - exp;
  if (exp < 7) return 7 - exp;
  if (exp < 15) return 15 - exp;
  return null; // MAX
}

export default function MyPage() {
  const [posterId, setPosterId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ nickname: string; exp: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inputName, setInputName] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function loadProfile() {
      let id = localStorage.getItem('qpick_poster_id');
      if (!id) {
        id = generateUUID();
        localStorage.setItem('qpick_poster_id', id);
      }
      setPosterId(id);

      const { data, error } = await supabase
        .from('profiles')
        .select('nickname, exp')
        .eq('id', id)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setInputName(data.nickname);
      } else {
        const defaultProfile = { id: id, nickname: '名無しのコレクター', exp: 0 };
        await supabase.from('profiles').insert(defaultProfile);
        setProfile(defaultProfile);
        setInputName(defaultProfile.nickname);
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!posterId || !inputName.trim()) return;

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nickname: inputName.trim() })
        .eq('id', posterId);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, nickname: inputName.trim() } : null);
      setMessage({ text: 'ニックネームを保存しました！', type: 'success' });
    } catch (err) {
      setMessage({ text: '保存に失敗しました。', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem 1rem', display: 'flex', justifyContent: 'center' }}>
        <div style={{ color: '#64748b' }}>読み込み中...</div>
      </main>
    );
  }

  const exp = profile?.exp ?? 0;
  const title = getTitle(exp);
  const nextExp = getNextExp(exp);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 500 }}>
        <nav style={{ marginBottom: '1rem' }}>
          <Link href="/" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: '0.9rem', fontWeight: 'bold' }}>
            ← トップページに戻る
          </Link>
        </nav>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginBottom: '1.5rem', textAlign: 'center' }}>
          マイページ（実績）
        </h1>

        {/* ステータスカード */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '1.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>現在の称号</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b', marginBottom: '1rem', textShadow: '1px 1px 0px #fef3c7' }}>
            {title}
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', borderTop: '1px dashed #e2e8f0', paddingTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>累計EXP</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>{exp}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>次の称号まで</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>
                {nextExp === null ? 'MAX' : `あと ${nextExp} EXP`}
              </div>
            </div>
          </div>
        </div>

        {/* ルールと称号一覧の説明カード */}
        <div style={{ backgroundColor: '#eff6ff', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid #bfdbfe' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e3a8a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            💡 EXPの貯め方と称号
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.6, marginBottom: '1rem' }}>
            店舗の在庫状況（買えた/売切れ）を報告すると、<strong style={{color: '#2563eb'}}>1日1回「1 EXP」</strong>を獲得できます。他の難民を救うほど称号がランクアップし、あなたの報告が頼りにされます！
          </p>
          
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '0.75rem', border: '1px solid #e2e8f0' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li style={{ display: 'flex', justifyContent: 'space-between' }}><span>ルーキー</span> <span style={{fontWeight: exp >= 0 ? 'bold' : 'normal', color: exp >= 0 ? '#2563eb' : 'inherit'}}>0 EXP</span></li>
              <li style={{ display: 'flex', justifyContent: 'space-between' }}><span>サポーター</span> <span style={{fontWeight: exp >= 1 ? 'bold' : 'normal', color: exp >= 1 ? '#2563eb' : 'inherit'}}>1 EXP</span></li>
              <li style={{ display: 'flex', justifyContent: 'space-between' }}><span>ナビゲーター</span> <span style={{fontWeight: exp >= 3 ? 'bold' : 'normal', color: exp >= 3 ? '#2563eb' : 'inherit'}}>3 EXP</span></li>
              <li style={{ display: 'flex', justifyContent: 'space-between' }}><span>エキスパート</span> <span style={{fontWeight: exp >= 7 ? 'bold' : 'normal', color: exp >= 7 ? '#2563eb' : 'inherit'}}>7 EXP</span></li>
              <li style={{ display: 'flex', justifyContent: 'space-between' }}><span>【殿堂入り】レジェンド</span> <span style={{fontWeight: exp >= 15 ? 'bold' : 'normal', color: exp >= 15 ? '#2563eb' : 'inherit'}}>15 EXP</span></li>
            </ul>
          </div>
        </div>

        {/* ニックネーム変更フォーム */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155', marginBottom: '1rem' }}>
            ニックネームの設定
          </h2>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              type="text"
              value={inputName}
              onChange={e => setInputName(e.target.value)}
              placeholder="ニックネームを入力"
              maxLength={20}
              style={{
                width: '100%',
                padding: '0.8rem 1rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '1rem',
                outline: 'none',
                backgroundColor: '#f8fafc'
              }}
            />
            <button
              type="submit"
              disabled={saving || !inputName.trim()}
              style={{
                padding: '0.8rem',
                backgroundColor: saving || !inputName.trim() ? '#94a3b8' : '#2563eb',
                color: '#fff',
                borderRadius: '999px',
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                cursor: saving || !inputName.trim() ? 'not-allowed' : 'pointer',
                boxShadow: saving || !inputName.trim() ? 'none' : '0 4px 6px -1px rgba(37, 99, 235, 0.3)',
                transition: 'all 0.2s',
              }}
            >
              {saving ? '保存中...' : 'この名前で登録する'}
            </button>
          </form>
          {message && (
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: message.type === 'success' ? '#166534' : '#ef4444', backgroundColor: message.type === 'success' ? '#dcfce3' : '#fee2e2', padding: '0.75rem', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>
              {message.text}
            </div>
          )}

          {/* ★新規追加：引き継ぎに関する注釈 */}
          <div style={{ marginTop: '1.25rem', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
            ※現在のバージョンでは、ブラウザの履歴（キャッシュ）を削除したり、別の端末やブラウザからアクセスした場合、実績データは引き継がれませんのでご注意ください。
          </div>
        </div>

      </div>
    </main>
  );
}