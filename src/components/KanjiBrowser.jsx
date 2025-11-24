import React, { useMemo, useState } from 'react';
import './KanjiBrowser.css';

/*
 Props:
  - deck: array of cards (current deck) -- ONLY used to extract kanji from card.kanji
  - onSelect(kanji): function called when user selects a kanji
  - onClose(): close the browser
*/
export default function KanjiBrowser({ deck = [], onSelect = () => {}, onClose = () => {} }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  // helper: extract unique kanji from a string
  const extractKanjiFromString = (s = '') => {
    if (!s) return [];
    const set = new Set();
    for (const ch of s) {
      if (/[\p{sc=Han}]/u.test(ch)) set.add(ch);
    }
    return Array.from(set);
  };

  // normalize helpers
  const normalize = (s = '') => (String(s || '').toLowerCase().trim());
  const toHiragana = (str = '') => {
    // simple convert Katakana block to Hiragana; leave other chars untouched
    let s = String(str || '').normalize('NFKC');
    let out = '';
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (code >= 0x30A1 && code <= 0x30F3) {
        out += String.fromCharCode(code - 0x60);
      } else {
        out += ch;
      }
    }
    return out.replace(/\s+/g, '');
  };

  // all kanji found in provided deck (scan ONLY card.kanji fields)
  const deckKanji = useMemo(() => {
    const set = new Set();
    deck.forEach(card => {
      if (card.kanji) {
        for (const ch of card.kanji) if (/[\p{sc=Han}]/u.test(ch)) set.add(ch);
      }
    });
    return Array.from(set).sort();
  }, [deck]);

  // map kanji -> cards that include it (cache)
  const kanjiToCards = useMemo(() => {
    const map = new Map();
    deck.forEach(card => {
      if (!card.kanji) return;
      for (const ch of card.kanji) {
        if (/[\p{sc=Han}]/u.test(ch)) {
          if (!map.has(ch)) map.set(ch, []);
          map.get(ch).push(card);
        }
      }
    });
    return map;
  }, [deck]);

  // visible kanji filtered by query:
  // match if query is substring of kanji OR matches kana/meanings/romaji of any card containing the kanji
  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return deckKanji;
    const qNorm = normalize(q);
    const qHira = toHiragana(q);
    return deckKanji.filter(k => {
      // direct kanji match
      if (k.includes(q)) return true;
      const cards = kanjiToCards.get(k) || [];
      for (const c of cards) {
        // check kana (normalize to hiragana)
        if (c.kana && c.kana.some(ka => toHiragana(ka).includes(qHira))) return true;
        // check romaji (ascii) match
        if (c.romaji && c.romaji.some(r => normalize(r).includes(qNorm))) return true;
        // check meanings (lowercase substring)
        if (c.meanings && c.meanings.some(m => normalize(m).includes(qNorm))) return true;
      }
      return false;
    });
  }, [query, deckKanji, kanjiToCards]);

  function onClickKanji(k) {
    setSelected(k);
    onSelect(k);
  }

  // find cards that contain the selected kanji (for preview)
  const matchingCards = useMemo(() => {
    if (!selected) return [];
    return (kanjiToCards.get(selected) || []);
  }, [selected, kanjiToCards]);

  return (
    <div className="kb-overlay" role="dialog" aria-label="Kanji browser">
      <div className="kb-panel">
        <div className="kb-header">
          <div style={{fontWeight:700}}>Kanji Menu</div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <button className="kb-close" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="kb-controls">
          <input
            className="kb-input small"
            placeholder="Rechercher par kanji, kana, romaji ou meaning"
            value={query}
            onChange={e=>setQuery(e.target.value)}
          />
        </div>

        <div className="kb-grid" aria-live="polite">
          {visible.length === 0 ? <div className="kb-empty">Aucun kanji trouvé dans ce deck.</div> : visible.map((k, i) => (
            <button key={k+i} className="kb-kanji" onClick={()=>onClickKanji(k)} title={`Rechercher ${k}`}>{k}</button>
          ))}
        </div>

        {selected && (
          <div className="kb-preview">
            <div style={{fontSize:20, fontWeight:700}}>Sélectionné: {selected}</div>
            <div style={{marginTop:8, color:'var(--muted)'}}>Cartes contenant ce kanji:</div>
            <ul className="kb-list">
              {matchingCards.length === 0 && <li className="kb-muted">Aucune carte avec ce kanji dans le deck.</li>}
              {matchingCards.map(c => (
                <li key={c.id}>
                  <div className="kb-card-row">
                    <div style={{fontSize:18}}>{c.kanji} <span className="kb-kana">{(c.kana || []).join(', ')}</span></div>
                    <div className="kb-meanings">{(c.meanings || []).join(' / ')}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
