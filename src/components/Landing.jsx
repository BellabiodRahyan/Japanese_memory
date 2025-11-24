import React from 'react';

export default function Landing({ onStart }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: 'linear-gradient(180deg, rgba(125,211,252,0.04), rgba(255,255,255,0.01))'
    }}>
      <div style={{
        maxWidth: 880,
        width: '100%',
        background: 'var(--panel)',
        padding: 20,
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(2,6,23,0.6)',
        color: 'var(--muted)'
      }}>
        <h2 style={{marginTop:0, color:'#e6edf3'}}>Japanese Memory — Handwriting & Flashcards</h2>
        <p style={{marginTop:6, lineHeight:1.5}}>
          A lightweight trainer to practice Japanese kanji, vocabulary and verbs.
          - Kanji decks: practice writing on a handwriting canvas and check readings.
          - Verb / Word decks: practice translating between Japanese (kanji/kana/romaji) and your meaning — no drawing required.
        </p>

        <ul style={{color:'var(--muted)', marginTop:12}}>
          <li>Responsive, minimal dark UI optimized for tablets and phones.</li>
          <li>Supports multiple decks. Progress is saved locally and can be synced with Supabase (optional).</li>
          <li>SRS-inspired scoring per card and per-practice-type.</li>
        </ul>

        <div style={{display:'flex', gap:12, marginTop:18, justifyContent:'flex-end'}}>
          <button onClick={onStart} style={{padding:'10px 14px', borderRadius:10, border:'none', background:'#7dd3fc', color:'#041025', cursor:'pointer'}}>Start practice</button>
        </div>
      </div>
    </div>
  );
}
