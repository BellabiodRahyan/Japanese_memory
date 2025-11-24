import React, { useEffect, useState } from 'react';
import { initSync, signInWithEmail, signOut, getUser, onAuthStateChange } from '../services/sync';

export default function Auth({ onUserChange = () => {} }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      await initSync();
      const u = await getUser();
      setUser(u);
      onUserChange(u);
    })();
    const unsub = onAuthStateChange(async (event, session) => {
      const u = await getUser();
      setUser(u);
      onUserChange(u);
    });
    return () => unsub && unsub();
  }, []);

  async function doSignIn(e) {
    e.preventDefault();
    if (!email) return setStatus({ ok:false, msg: 'Enter email' });
    try {
      // pass current origin so Supabase sends the magic link that redirects back to this site root
      const redirectOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : null;
      await signInWithEmail(email, redirectOrigin);
      setStatus({ ok:true, msg: 'Magic link sent. Check your inbox.' });
    } catch (err) {
      setStatus({ ok:false, msg: err?.message || String(err) });
    }
  }

  async function doSignOut() {
    await signOut();
    setUser(null);
    onUserChange(null);
    setStatus({ ok:true, msg:'Signed out' });
  }

  return (
    <div style={{display:'flex', gap:10, alignItems:'center'}}>
      {user ? (
        <>
          <div style={{fontSize:13, color:'var(--muted)'}}>Signed in: <strong style={{color:'#fff'}}>{user.email}</strong></div>
          <button onClick={doSignOut} style={{padding:'6px 8px', borderRadius:8}}>Sign out</button>
        </>
      ) : (
        <form onSubmit={doSignIn} style={{display:'flex', gap:8, alignItems:'center'}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{padding:6, borderRadius:6}}/>
          <button type="submit" style={{padding:'6px 8px', borderRadius:8}}>Sign in</button>
        </form>
      )}
      {status && <div style={{marginLeft:8, color: status.ok ? '#bbf7d0' : '#fecaca', fontSize:13}}>{status.msg}</div>}
    </div>
  );
}
