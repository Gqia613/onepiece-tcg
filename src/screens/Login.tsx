import { useState } from 'react';
import { api, type ApiError } from '../api/client';
import { useAuth } from '../state/auth';
import { IMG, LOGO_WHITE } from '../engine/img';

// ログイン画面の装飾用リーダーカード（エンジン未初期化でも表示できるよう固定ID）
const DECOR_CARDS = ['OP15-058', 'OP16-080', 'OP16-022'];

export default function Login() {
  const setUser = useAuth((s) => s.setUser);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const u = username.trim();
    if (u.length < 3) return setErr('IDは3文字以上で入力してください');
    if (password.length < 6) return setErr('パスワードは6文字以上で入力してください');
    if (mode === 'register' && !invite.trim()) return setErr('招待コードを入力してください');
    setBusy(true);
    try {
      const { user } = mode === 'login' ? await api.login(u, password) : await api.register(u, password, invite.trim());
      setUser(user);
    } catch (e) {
      const ae = e as ApiError;
      setErr(errMessage(ae, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-wrap">
      {/* 背後に浮遊するリーダーカード（世界観の演出・操作は透過） */}
      <div className="auth-floats" aria-hidden="true">
        {DECOR_CARDS.map((no, i) => (
          <img key={no} className={'afc afc' + i} src={IMG(no)} referrerPolicy="no-referrer" decoding="async" alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ))}
      </div>
      <form className="auth-panel" onSubmit={submit}>
        <h1 className="auth-brand">
          <img className="auth-logo" src={LOGO_WHITE} referrerPolicy="no-referrer" alt="ONE PIECE CARD GAME" />
          <small>BATTLE SIMULATOR</small>
        </h1>
        <div className="auth-tabs">
          <button type="button" className={'auth-tab' + (mode === 'login' ? ' on' : '')} onClick={() => { setMode('login'); setErr(''); }}>ログイン</button>
          <button type="button" className={'auth-tab' + (mode === 'register' ? ' on' : '')} onClick={() => { setMode('register'); setErr(''); }}>新規登録</button>
        </div>
        <div className="auth-field">
          <label>ログインID</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="3文字以上" />
        </div>
        <div className="auth-field">
          <label>パスワード</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="6文字以上" />
        </div>
        {mode === 'register' ? (
          <div className="auth-field">
            <label>招待コード</label>
            <input value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" placeholder="管理者から共有されたコード" />
          </div>
        ) : null}
        <div className="auth-err">{err}</div>
        <button className="auth-btn" type="submit" disabled={busy}>{busy ? '…' : (mode === 'login' ? 'ログイン' : '登録して開始')}</button>
        <div className="auth-hint">自分・友達用の簡易アカウントです。パスワードは安全に保管してください。</div>
      </form>
    </div>
  );
}

function errMessage(e: ApiError, mode: 'login' | 'register'): string {
  if (e.error === 'bad_invite') return '招待コードが違います';
  if (e.error === 'registration_closed') return '現在、新規登録は招待制です（管理者にコードを問い合わせてください）';
  if (e.status === 409) return 'そのIDは既に使われています';
  if (e.status === 401) return 'IDまたはパスワードが違います';
  if (e.status === 429) return '試行回数が多すぎます。しばらく待ってください';
  if (e.status === 400) return '入力内容を確認してください';
  return (mode === 'login' ? 'ログイン' : '登録') + 'に失敗しました（' + (e.error || 'error') + '）';
}
