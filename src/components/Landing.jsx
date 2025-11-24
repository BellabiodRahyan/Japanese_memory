import React, { useState, useEffect } from 'react';
import { decks } from '../data/decks';
import Auth from './Auth';

export default function Landing({ onStart }) {
  const keys = Object.keys(decks);
  const [selected, setSelected] = useState(keys.slice(0,1));
  const [enableKanji, setEnableKanji] = useState(true);
  const [enableWords, setEnableWords] = useState(true);
  useEffect(()=> {
    if (!selected.length) setSelected(keys.slice(0,1));
  }, [keys]);

  function toggleDeck(k) {
    setSelected(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k]);
  }

  return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
      <div style={{width:960, maxWidth:'100%', background:'var(--panel)', padding:18, borderRadius:12, color:'var(--muted)'}}>
        <h2 style={{marginTop:0, color:'#e6edf3'}}>Japanese Memory — Entraîneur</h2>
        <p>Application simple pour pratiquer les kanji (écriture) et le vocabulaire/verbes (traduction).</p>

        <div style={{marginTop:12}}>
          <div style={{fontWeight:700, color:'var(--muted)'}}>Choisir les decks</div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:8}}>
            {keys.map(k => (
              <label key={k} style={{display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.02)', padding:'6px 8px', borderRadius:8, cursor:'pointer'}}>
                <input type="checkbox" checked={selected.includes(k)} onChange={()=>toggleDeck(k)} />
                <span style={{fontSize:13}}>{k}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{display:'flex', gap:16, marginTop:12, alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700, color:'var(--muted)'}}>Modes activés</div>
            <div style={{display:'flex', gap:8, marginTop:8}}>
              <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={enableKanji} onChange={()=>setEnableKanji(v=>!v)} /> Kanji (écriture)</label>
              <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={enableWords} onChange={()=>setEnableWords(v=>!v)} /> Mots / Verbes (traduction)</label>
            </div>
          </div>

          <div style={{marginLeft:'auto'}}>
            <Auth />
          </div>
        </div>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14}}>
          <div style={{color:'var(--muted)', fontSize:13}}>Progression SRS sauvegardée si vous êtes connecté.</div>
          <div>
            <button onClick={()=>onStart({ selectedDecks: selected, enableKanji, enableWords })} style={{padding:'10px 14px', borderRadius:10, border:'none', background:'#7dd3fc', color:'#041025'}}>Commencer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
