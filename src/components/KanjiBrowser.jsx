import React, { useMemo, useState } from 'react';
import './KanjiBrowser.css';

export default function KanjiBrowser({ decksMap = {}, selectedDecks = [], onPractice = () => {}, onClose = () => {}, srsMap = {} }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  // aggregate cards from selectedDecks
  const cards = useMemo(() => {
    const out = [];
    selectedDecks.forEach(k => {
      const list = decksMap[k] || [];
      list.forEach(c => out.push({...c, _deck: k}));
    });
    return out;
  }, [decksMap, selectedDecks]);

  // extract kanji set from cards
  const deckKanji = useMemo(() => {
    const set = new Set();
    cards.forEach(card => {
      if (card.kanji) for (const ch of card.kanji) if (/[\p{sc=Han}]/u.test(ch)) set.add(ch);
    });
    return Array.from(set).sort();
  }, [cards]);

  const visible = deckKanji.filter(k => k.includes(query));

  function onClickKanji(k) {
    setSelected(k);
    onSelect(k);
  }

  const matchingCards = useMemo(() => {
    if (!selected) return [];
    return cards.filter(c => c.kanji && c.kanji.includes(selected));
  }, [selected, cards]);

  return (
    <div className="kb-overlay" role="dialog" aria-label="Kanji browser">
      <div className="kb-panel">
        <div className="kb-header">
          <div style={{fontWeight:700}}>Vocabulaire / Kanji</div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}><button className="kb-close" onClick={onClose}>Close</button></div>
        </div>

        <div className="kb-controls">
          <input className="kb-input small" placeholder="Rechercher par kanji/kana/meaning/romaji" value={query} onChange={e=>setQuery(e.target.value)} />
        </div>

        <div className="kb-grid" aria-live="polite">
          {visible.length === 0 ? <div className="kb-empty">Aucun kanji trouvé.</div> : visible.map((k, i) => (
            <button key={k+i} className="kb-kanji" onClick={()=>setSelected(k)} title={`Rechercher ${k}`}>{k}</button>
          ))}
        </div>

        {selected && (
          <div className="kb-preview">
            <div style={{fontSize:20, fontWeight:700}}>Sélectionné: {selected}</div>
            <div style={{marginTop:8, color:'var(--muted)'}}>Cartes contenant ce kanji:</div>
            <ul className="kb-list">
              {matchingCards.length === 0 && <li className="kb-muted">Aucune carte avec ce kanji dans les decks sélectionnés.</li>}
              {matchingCards.map(c => {
                const s = srsMap[c.id] || {};
                return (
                  <li key={c.id}>
                    <div style={{display:'flex', justifyContent:'space-between', gap:8, padding:'6px 0', borderBottom:'1px dashed rgba(255,255,255,0.02)'}}>
                      <div>
                        <div style={{fontSize:16}}>{c.kanji} <span style={{color:'var(--muted)', fontSize:12}}>({(c.kana||[]).join(', ')})</span></div>
                        <div style={{fontSize:13, color:'var(--muted)'}}>{(c.meanings||[]).join(' / ')}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:12, color:'var(--muted)'}}>deck: {c._deck}</div>
                        <div style={{fontSize:12}}>SRS: {Math.round(((s.progressKana||0)+(s.progressKanji||0))/2)}%</div>
                        <div style={{marginTop:6, display:'flex', gap:6}}>
                          <button onClick={()=>{ /* just show info already visible */ }} style={{padding:'6px 8px', borderRadius:6}}>View</button>
                          <button onClick={()=>onPractice(c.id)} style={{padding:'6px 8px', borderRadius:6}}>Practice</button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
