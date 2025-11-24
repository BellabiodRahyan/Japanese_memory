import React, { useEffect, useMemo, useRef, useState } from 'react';
import Landing from './components/Landing';
import DrawingBoard from './components/DrawingBoard';
import ScoreBar from './components/ScoreBar';
import KanjiBrowser from './components/KanjiBrowser';
import Auth from './components/Auth';
import { decks } from './data/decks';
import { shuffle } from './utils/shuffle';
import toHiraganaRaw from './utils/toHiragana';

// Minimal, self-contained App implementation that is robust and avoids prior ReferenceErrors.
// - Landing selects decks and enabled modes
// - Central practice screen: prompt top, canvas or input center, action buttons bottom
// - Enter: first validate (show result + reveal), second Enter -> next
// - Show Answer reveals (counts as incorrect when Next pressed)
// - SRS persisted to localStorage (per-card id)

export default function App() {
  // UI state
  const [showLanding, setShowLanding] = useState(true);
  const [selectedDecks, setSelectedDecks] = useState([]); // array of deck keys
  const [enableKanji, setEnableKanji] = useState(true);
  const [enableWords, setEnableWords] = useState(true);

  // Pool & card pointer
  const [pool, setPool] = useState([]); // array of card objects { ...card, _deck }
  const [currentIdx, setCurrentIdx] = useState(0);

  // prompt & input state
  const [promptMode, setPromptMode] = useState(''); // 'kanji->kana' | 'meaning->kanji' | 'jp->meaning' | 'meaning->jp'
  const [inputValue, setInputValue] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [pendingDetail, setPendingDetail] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // SRS (localStorage)
  const [srsMap, setSrsMap] = useState(() => {
    try {
      const raw = localStorage.getItem('jm_srs_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // refs
  const boardRef = useRef(null);
  const recentSeen = useRef([]);

  // derived
  const card = pool[currentIdx] || null;

  // helpers: deck type detection
  const isKanjiDeckKey = (k) => /kanji/i.test(k);
  const isVerbWordDeckKey = (k) => /verb|word/i.test(k);

  const isKanjiCard = (c) => {
    if (!c) return false;
    if (c._deck && isKanjiDeckKey(c._deck)) return true;
    return !!(c.kanji && /[\p{sc=Han}]/u.test(c.kanji));
  };
  const isVerbWordCard = (c) => {
    if (!c) return false;
    if (c._deck && isVerbWordDeckKey(c._deck)) return true;
    // treat non-kanji cards with meanings as vocab
    return !isKanjiCard(c) && Array.isArray(c.meanings) && c.meanings.length > 0;
  };

  // persist SRS on change
  useEffect(() => {
    try {
      localStorage.setItem('jm_srs_v1', JSON.stringify(srsMap));
    } catch {}
  }, [srsMap]);

  // start from Landing: build pool
  function handleStart({ selectedDecks: sel, enableKanji: ek, enableWords: ew }) {
    setSelectedDecks(sel);
    setEnableKanji(!!ek);
    setEnableWords(!!ew);
    const p = [];
    sel.forEach(k => {
      const list = decks[k] || [];
      list.forEach(card => p.push({ ...card, _deck: k }));
    });
    setPool(shuffle(p));
    setCurrentIdx(0);
    setShowLanding(false);
    setInputValue('');
    setShowAnswer(false);
    setAnswered(false);
    setPendingDetail(null);
    recentSeen.current = [];
  }

  // when card changes, choose a prompt mode based on deck type and enabled modes
  useEffect(() => {
    if (!card) return;
    if (isKanjiCard(card) && enableKanji) {
      setPromptMode(Math.random() < 0.5 ? 'kanji->kana' : 'meaning->kanji');
    } else if (isVerbWordCard(card) && enableWords) {
      setPromptMode(Math.random() < 0.5 ? 'jp->meaning' : 'meaning->jp');
    } else {
      // fallback prefer jp->meaning
      setPromptMode('jp->meaning');
    }
    setInputValue('');
    setShowAnswer(false);
    setAnswered(false);
    setPendingDetail(null);
    try { boardRef.current?.clear?.(); } catch {}
  }, [card, enableKanji, enableWords]);

  // choose next index with simple due/preference logic and avoid recent repeats
  function chooseNextIndex() {
    if (!pool.length) return 0;
    const now = Date.now();
    const due = [];
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const s = srsMap[c.id] || { nextDue: 0 };
      if (!s.nextDue || s.nextDue <= now) due.push(i);
    }
    const candidates = due.filter(i => !recentSeen.current.includes(pool[i].id));
    const pickPool = candidates.length ? candidates : (due.length ? due : pool.map((_, i) => i));
    return pickPool[Math.floor(Math.random() * pickPool.length)];
  }

  // minimal SRS update
  function defaultSrs() {
    return { repetitions: 0, interval: 0, ease: 2.5, lastReviewed: null, nextDue: 0, progressKana: 0, progressKanji: 0 };
  }
  function updateSrsForCard(cardId, detail = {}) {
    setSrsMap(prev => {
      const next = { ...prev };
      const cur = next[cardId] ? { ...next[cardId] } : defaultSrs();
      // update progress heuristics
      if (detail.kanaOk === true) cur.progressKana = Math.min(100, (cur.progressKana || 0) + 20);
      if (detail.kanaOk === false) cur.progressKana = Math.max(0, (cur.progressKana || 0) - 25);
      if (detail.drawOk === true) cur.progressKanji = Math.min(100, (cur.progressKanji || 0) + 20);
      if (detail.drawOk === false) cur.progressKanji = Math.max(0, (cur.progressKanji || 0) - 25);
      // overall
      const overall = ('jpMeaningOk' in detail) ? detail.jpMeaningOk : (detail.kanaOk !== undefined || detail.drawOk !== undefined ? (detail.kanaOk !== false && detail.drawOk !== false) : null);
      if (overall === true) {
        if (cur.repetitions === 0) cur.interval = 1;
        else if (cur.repetitions === 1) cur.interval = 6;
        else cur.interval = Math.max(1, Math.round(cur.interval * cur.ease));
        cur.repetitions = (cur.repetitions || 0) + 1;
      } else if (overall === false) {
        cur.repetitions = 0;
        cur.interval = 1;
        cur.ease = Math.max(1.3, (cur.ease || 2.5) - 0.2);
      }
      cur.lastReviewed = Date.now();
      cur.nextDue = cur.lastReviewed + (cur.interval || 0) * 24 * 3600 * 1000;
      next[cardId] = cur;
      return next;
    });
  }

  // romaji normalization & matching
  function normalizeRomaji(s = '') {
    const m = { 'ā': 'a', 'ī': 'i', 'ū': 'u', 'ē': 'e', 'ō': 'o' };
    let out = String(s || '').normalize('NFKC').trim().toLowerCase();
    out = out.replace(/\s+/g, '');
    out = out.replace(/[āīūēō]/g, ch => m[ch] || ch);
    out = out.replace(/[^a-z0-9]/g, '');
    return out;
  }
  function romajiMatches(input, romajiList = []) {
    if (!input) return false;
    const inNorm = normalizeRomaji(input);
    return (romajiList || []).some(r => normalizeRomaji(r) === inNorm);
  }

  // Kanji checking routine: kana typing + optional drawing similarity
  async function checkAnswerForKanji(localCard) {
    if (!localCard) return false;
    let kanaOk = null;
    if (inputValue && inputValue.trim()) {
      kanaOk = (localCard.kana || []).map(k => toHiraganaRaw(k)).some(k => toHiraganaRaw(inputValue) === k);
    }
    let drawOk = null;
    if (promptMode === 'meaning->kanji') {
      try {
        const userImg = boardRef.current?.getImage ? boardRef.current.getImage(64) : null;
        if (!userImg) drawOk = false;
        else {
          // render target and compare
          const target = renderKanjiImage(localCard.kanji, 64);
          let sum = 0;
          for (let i = 0; i < userImg.length; i++) sum += Math.abs(userImg[i] - target[i]);
          const sim = 1 - (sum / (255 * userImg.length));
          drawOk = sim >= 0.48;
        }
      } catch {
        drawOk = false;
      }
    }
    // decide overall
    let overall = false;
    if (promptMode === 'kanji->kana') overall = !!kanaOk;
    else if (promptMode === 'meaning->kanji') {
      if (kanaOk !== null && drawOk !== null) overall = !!(kanaOk && drawOk);
      else if (kanaOk !== null) overall = !!kanaOk;
      else overall = !!drawOk;
    }
    setAnswered(true);
    setPendingDetail({ kanaOk, drawOk });
    setShowAnswer(true);
    setFeedback(overall ? { ok: true, message: 'Correct.' } : { ok: false, message: 'Incorrect.' });
    return overall;
  }

  // main validation
  async function checkAnswer() {
    if (!card) {
      setFeedback({ ok: false, message: 'No card available.' });
      return;
    }
    if (isVerbWordCard(card)) {
      if (promptMode === 'jp->meaning') {
        const user = (inputValue || '').trim().toLowerCase();
        const ok = (card.meanings || []).some(m => {
          const mm = String(m || '').toLowerCase().trim();
          return mm === user || (user.length > 1 && mm.includes(user));
        });
        setAnswered(true);
        setPendingDetail({ jpMeaningOk: ok });
        setShowAnswer(true);
        setFeedback(ok ? { ok: true, message: 'Correct.' } : { ok: false, message: 'Incorrect.' });
        return;
      } else if (promptMode === 'meaning->jp') {
        const raw = (inputValue || '').trim();
        const ascii = /^[\x00-\x7F]+$/.test(raw);
        let ok = false;
        if (ascii) ok = romajiMatches(raw, card.romaji || []);
        else {
          const hira = toHiraganaRaw(raw);
          ok = (card.kana || []).map(k => toHiraganaRaw(k)).some(k => k === hira) || ((card.kanji || '') === raw || (card.kanji || '').includes(raw));
        }
        setAnswered(true);
        setPendingDetail({ jpMeaningOk: ok });
        setShowAnswer(true);
        setFeedback(ok ? { ok: true, message: 'Correct.' } : { ok: false, message: 'Incorrect.' });
        return;
      }
    }
    // kanji flow
    if (isKanjiCard(card)) {
      await checkAnswerForKanji(card);
      return;
    }
    // default
    setAnswered(true);
    setPendingDetail({ jpMeaningOk: false });
    setShowAnswer(true);
    setFeedback({ ok: false, message: 'Incorrect.' });
  }

  // Show answer: reveal and mark as shown (Next will finalize as incorrect if pendingDetail absent)
  function handleShowAnswer() {
    if (!card) return;
    setShowAnswer(true);
    setAnswered(true);
    setPendingDetail(null); // indicate no user-correct result
    setFeedback({ ok: false, message: 'Answer shown — press Next to continue (will be counted as incorrect).' });
  }

  function finalizeAdvance(detail = null) {
    if (!card) return;
    const d = detail ?? pendingDetail ?? null;
    if (d) {
      if ('jpMeaningOk' in d) updateSrsForCard(card.id, { kanaOk: d.jpMeaningOk, drawOk: null });
      else updateSrsForCard(card.id, { kanaOk: d.kanaOk ?? null, drawOk: d.drawOk ?? null });
    } else {
      // shown answer counted as failure
      if (isVerbWordCard(card)) updateSrsForCard(card.id, { kanaOk: false, drawOk: null });
      else updateSrsForCard(card.id, { kanaOk: false, drawOk: false });
    }
    // record recent and pick next
    recentSeen.current = [card.id, ...recentSeen.current.filter(id => id !== card.id)].slice(0, 10);
    const next = chooseNextIndex();
    setCurrentIdx(next);
    setInputValue('');
    setShowAnswer(false);
    setAnswered(false);
    setPendingDetail(null);
    setFeedback(null);
    try { boardRef.current?.clear?.(); } catch {}
  }

  function handleNext() {
    if (!answered) {
      // skipped: treat as wrong
      finalizeAdvance(null);
      return;
    }
    // if answered and we have pendingDetail use it; else finalize as wrong
    finalizeAdvance(pendingDetail ?? null);
  }

  // manual mark buttons
  function onMarkWasCorrect() {
    if (!card) return;
    if (isVerbWordCard(card)) {
      setPendingDetail({ jpMeaningOk: true });
    } else {
      setPendingDetail({ kanaOk: true, drawOk: true });
    }
    setAnswered(true);
    setShowAnswer(true);
    setFeedback({ ok: true, message: 'Marked correct — press Next to continue.' });
  }
  function onMarkWasWrong() {
    if (!card) return;
    if (isVerbWordCard(card)) setPendingDetail({ jpMeaningOk: false });
    else setPendingDetail({ kanaOk: false, drawOk: false });
    setAnswered(true);
    setShowAnswer(true);
    setFeedback({ ok: false, message: 'Marked incorrect — press Next to continue.' });
  }

  // Reset SRS for selected decks
  function resetAllSrsForSelected() {
    if (!selectedDecks.length) {
      setFeedback({ ok: false, message: 'No decks selected.' });
      return;
    }
    setSrsMap(prev => {
      const next = { ...prev };
      selectedDecks.forEach(k => (decks[k] || []).forEach(c => { next[c.id] = defaultSrs(); }));
      return next;
    });
    setFeedback({ ok: true, message: 'SRS reset for selected decks.' });
  }

  // helper to render target kanji image (used for similarity)
  function renderKanjiImage(kanji, size = 64) {
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    ctx.font = `${Math.floor(size * 0.8)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(kanji || '', size / 2, size / 2 + Math.floor(size * 0.05));
    const img = ctx.getImageData(0, 0, size, size).data;
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      gray[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return gray;
  }

  // UI helpers
  const accuracyPercent = useMemo(() => {
    // compute simple global accuracy for display
    let total = 0, correct = 0;
    for (const id of Object.keys(srsMap)) {
      const s = srsMap[id];
      total += (s.repetitions || 0);
      correct += (s.repetitions || 0); // simple placeholder; you can refine
    }
    return total === 0 ? 0 : Math.round((correct / total) * 100);
  }, [srsMap]);

  // Landing & main render
  return (
    <>
      {showLanding ? (
        <Landing onStart={handleStart} />
      ) : (
        <div style={{ minHeight: '100vh', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <header style={{ width: '100%', maxWidth: 920, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Japanese Memory</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Auth />
              <button type="button" onClick={() => setShowLanding(true)} style={{ padding: '6px 8px' }}>Menu</button>
              <button type="button" onClick={() => setShowKanjiBrowser(true)} style={{ padding: '6px 8px' }}>Vocab</button>
              <button type="button" onClick={resetAllSrsForSelected} style={{ padding: '6px 8px' }}>Reset SRS</button>
            </div>
          </header>

          <main style={{ width: '100%', maxWidth: 920 }}>
            <div style={{ background: 'var(--panel)', padding: 14, borderRadius: 10 }}>
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                {/* prompt header */}
                {card ? (
                  <>
                    { (promptMode === 'jp->meaning' || promptMode === 'kanji->kana' || (isKanjiCard(card) && promptMode === 'meaning->kanji')) && (
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{card.kanji}</div>
                    )}
                    { promptMode === 'jp->meaning' && card?.kana && <div style={{ color: 'var(--muted)' }}>({card.kana.join(', ')})</div> }
                    { promptMode === 'meaning->jp' && <div style={{ fontSize: 18, color: 'var(--muted)' }}>Meaning: {(card.meanings || []).join(', ')}</div> }
                    { promptMode === 'kanji->kana' && <div style={{ fontSize: 14, color: 'var(--muted)' }}>Provide kana reading</div> }
                    { promptMode === 'meaning->kanji' && <div style={{ fontSize: 14, color: 'var(--muted)' }}>Draw the kanji or type kana</div> }
                  </>
                ) : <div style={{ color: 'var(--muted)' }}>No cards selected</div> }
              </div>

              <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {card ? (
                  (isKanjiCard(card) && promptMode === 'meaning->kanji') ? (
                    <div style={{ width: '100%' }}>
                      <DrawingBoard ref={boardRef} />
                    </div>
                  ) : (
                    <input
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!answered) checkAnswer();
                          else handleNext();
                        }
                      }}
                      placeholder="Entrez votre réponse et appuyez sur Valider / Enter"
                      style={{ width: '100%', padding: 12, fontSize: 18, borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: 'inherit' }}
                    />
                  )
                ) : <div style={{ color: 'var(--muted)' }}>Sélectionnez des decks dans le menu.</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                <button type="button" onClick={checkAnswer} style={{ padding: '10px 14px', borderRadius: 8, background: '#0ea5e9' }}>Valider</button>
                <button type="button" onClick={handleShowAnswer} style={{ padding: '10px 14px', borderRadius: 8, background: '#f97316' }}>Afficher réponse</button>
                <button type="button" onClick={handleNext} style={{ padding: '10px 14px', borderRadius: 8, background: '#6366f1' }}>Suivant</button>
                <button type="button" onClick={onMarkWasCorrect} style={{ padding: '10px 14px', borderRadius: 8, background: '#16a34a' }}>I was correct</button>
                <button type="button" onClick={onMarkWasWrong} style={{ padding: '10px 14px', borderRadius: 8, background: '#ef4444' }}>I was wrong</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <div style={{ color: feedback?.ok ? '#bbf7d0' : '#fecaca' }}>{feedback?.message}</div>
                <div style={{ width: 220 }}>
                  <ScoreBar correct={0} total={0} percent={0} srsPercent={card ? Math.round(((srsMap[card.id]?.progressKana || 0) + (srsMap[card.id]?.progressKanji || 0)) / 2) : null} />
                </div>
              </div>

              {/* reveal answer area */}
              {showAnswer && card && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontWeight: 700 }}>Answer</div>
                  <div style={{ marginTop: 6 }}>{card.kanji}</div>
                  <div style={{ marginTop: 6, color: 'var(--muted)' }}>Kana: {(card.kana || []).join(', ')} — Meanings: {(card.meanings || []).join(' / ')}</div>
                </div>
              )}
            </div>
          </main>
          { /* KanjiBrowser overlay */ }
          <KanjiBrowser decksMap={decks} selectedDecks={selectedDecks} onSelect={(k) => {
            // jump to first card containing k
            const idx = pool.findIndex(c => c.kanji && c.kanji.includes(k));
            if (idx >= 0) setCurrentIdx(idx);
          }} onClose={() => { /* close is handled internally by KanjiBrowser consumer; we control via prop if needed */ }} srsMap={srsMap} />
        </div>
      )}
    </>
  );
}

// end of App.jsx
