import React, { useEffect, useMemo, useState, useRef } from 'react';
import DrawingBoard from './components/DrawingBoard';
import ScoreBar from './components/ScoreBar';
import { decks } from './data/decks';
import { shuffle } from './utils/shuffle';
import KanjiBrowser from './components/KanjiBrowser';
import Auth from './components/Auth';
import { initSync, loadSrs, saveSrs, mergeSrs, getUser, onAuthStateChange } from './services/sync';

const AVAILABLE_DECKS = Object.keys(decks);

export default function App() {
  const [deckKey, setDeckKey] = useState(AVAILABLE_DECKS[0]);
  // allow selecting multiple modes simultaneously (pick random mode per card)
  const [selectedModes, setSelectedModes] = useState(['kanji->kana']);
  const [shuffled, setShuffled] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const boardRef = useRef();

  const [cardMode, setCardMode] = useState(selectedModes[0] || 'kanji->kana');
  const [kanaInput, setKanaInput] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [answered, setAnswered] = useState(false);
  // pendingResult (overall) kept for compatibility, but detailed result stored in pendingDetail
  const [pendingResult, setPendingResult] = useState(null);
  // NEW: pendingDetail stores per-part result: { kanaOk: boolean|null, drawOk: boolean|null }
  const [pendingDetail, setPendingDetail] = useState(null);

  const [showKanjiBrowser, setShowKanjiBrowser] = useState(false);

  // SRS state: map cardId -> { repetitions, interval, ease, lastReviewed, nextDue, progressKana, progressKanji }
  const [srsMap, setSrsMap] = useState(() => {
    try {
      const raw = localStorage.getItem('jt_srs');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('Failed to load SRS', e);
      return {};
    }
  });

  // recent history to avoid immediate repeats (store card ids)
  const [recentSeen, setRecentSeen] = useState([]);

  // persist SRS
  useEffect(() => {
    try {
      localStorage.setItem('jt_srs', JSON.stringify(srsMap));
    } catch (e) {
      console.warn('Failed to save SRS', e);
    }
  }, [srsMap]);

  // helper: default SRS entry (now contains progress for kana & kanji)
  function defaultSrs() {
    return {
      repetitions: 0,
      interval: 0,
      ease: 2.5,
      lastReviewed: null,
      nextDue: 0,
      progressKana: 0,   // 0..100
      progressKanji: 0   // 0..100 (kanji/drawing)
    };
  }

  // NEW: update SRS for a card given a detailed result { kanaOk|null, drawOk|null }
  function updateSrsForCard(cardId, detail = { kanaOk: null, drawOk: null }) {
    setSrsMap(prev => {
      const cur = prev[cardId] ? { ...prev[cardId] } : defaultSrs();
      const now = Date.now();

      // update per-mode progress heuristics
      if (detail.kanaOk !== null && detail.kanaOk !== undefined) {
        if (detail.kanaOk) {
          cur.progressKana = Math.min(100, (cur.progressKana || 0) + 20);
        } else {
          cur.progressKana = Math.max(0, (cur.progressKana || 0) - 30);
        }
      }
      if (detail.drawOk !== null && detail.drawOk !== undefined) {
        if (detail.drawOk) {
          cur.progressKanji = Math.min(100, (cur.progressKanji || 0) + 20);
        } else {
          cur.progressKanji = Math.max(0, (cur.progressKanji || 0) - 30);
        }
      }

      // decide overall correctness to update global SM-2-like metadata
      // if both parts present → overall = both true; if only one present → that result
      let overall = null;
      if (detail.kanaOk === null && detail.drawOk === null) overall = null;
      else if (detail.kanaOk === null) overall = !!detail.drawOk;
      else if (detail.drawOk === null) overall = !!detail.kanaOk;
      else overall = detail.kanaOk && detail.drawOk;

      if (overall === true) {
        // SM-2 simplified: quality assumed high on correct
        const quality = 5;
        if (cur.repetitions === 0) {
          cur.interval = 1;
        } else if (cur.repetitions === 1) {
          cur.interval = 6;
        } else {
          cur.interval = Math.max(1, Math.round(cur.interval * cur.ease));
        }
        cur.repetitions = (cur.repetitions || 0) + 1;
        // update ease slightly
        cur.ease = Math.max(1.3, cur.ease + 0.1 - (5 - quality) * 0.08);
      } else if (overall === false) {
        // incorrect: reset repetitions and set short interval
        cur.repetitions = 0;
        cur.interval = 1;
        cur.ease = Math.max(1.3, cur.ease - 0.2);
      } else {
        // overall === null => no change to reps/interval (edge cases)
      }

      cur.lastReviewed = now;
      cur.nextDue = now + (cur.interval || 0) * 24 * 3600 * 1000;
      return { ...prev, [cardId]: cur };
    });
  }

  function resetSrsForCard(cardId) {
    setSrsMap(prev => {
      const next = { ...prev };
      next[cardId] = defaultSrs();
      try { localStorage.setItem('jt_srs', JSON.stringify(next)); } catch(e){}
      return next;
    });
    setFeedback({ ok:true, message: 'SRS reset for this kanji.' });
  }

  // Reset SRS for whole deck
  function resetSrsForDeck(deckKeyToReset) {
    const deckCards = decks[deckKeyToReset] || [];
    setSrsMap(prev => {
      const next = { ...prev };
      deckCards.forEach(c => {
        next[c.id] = defaultSrs();
      });
      try { localStorage.setItem('jt_srs', JSON.stringify(next)); } catch(e){}
      return next;
    });
    setFeedback({ ok:true, message: `SRS reset for deck "${deckKeyToReset}".` });
    // reset recent history for a clean start
    setRecentSeen([]);
  }

  useEffect(() => {
    const copy = shuffle([...decks[deckKey]]);
    setShuffled(copy);
    setIndex(0);
    setShowAnswer(false);
    setCorrectCount(0);
    setTotalCount(0);
    setKanaInput('');
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
    boardRef.current?.clear();
  }, [deckKey]);

  // When index or selectedModes changes, pick an effective cardMode at random from the selected set
  useEffect(() => {
    if (!shuffled.length) return;
    const choices = (selectedModes && selectedModes.length > 0) ? selectedModes : ['kanji->kana'];
    const pick = choices[Math.floor(Math.random() * choices.length)];
    setCardMode(pick);
    // clear input/board when card or mode changes
    setKanaInput('');
    boardRef.current?.clear();
    setShowAnswer(false);
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
  }, [index, selectedModes, shuffled]);

  const card = shuffled[index];

  // pick next index using due cards; infinite loop behavior
  function chooseNextIndex() {
    const now = Date.now();
    const currId = card?.id;
    const dueIndexes = [];
    for (let i = 0; i < shuffled.length; i++) {
      const c = shuffled[i];
      const s = srsMap[c.id] || defaultSrs();
      if (!s.nextDue || s.nextDue <= now) dueIndexes.push(i);
    }

    // prefer due indexes that are not the current card and not in recentSeen
    const filteredDue = dueIndexes.filter(i => {
      const id = shuffled[i].id;
      return id !== currId && !recentSeen.includes(id);
    });
    if (filteredDue.length > 0) return filteredDue[Math.floor(Math.random() * filteredDue.length)];

    // if no filtered due, try any due excluding current
    const dueExclCurr = dueIndexes.filter(i => shuffled[i].id !== currId);
    if (dueExclCurr.length > 0) return dueExclCurr[Math.floor(Math.random() * dueExclCurr.length)];

    // otherwise pick a random non-recent card (avoid recentSeen and current)
    const candidates = [];
    for (let i = 0; i < shuffled.length; i++) {
      const id = shuffled[i].id;
      if (id !== currId && !recentSeen.includes(id)) candidates.push(i);
    }
    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];

    // last resort: any index except current if possible
    if (shuffled.length <= 1) return 0;
    let idx;
    do {
      idx = Math.floor(Math.random() * shuffled.length);
    } while (shuffled[idx].id === currId);
    return idx;
  }

  // FINALIZE: use pendingDetail to update SRS and scores then pick next card
  function finalizeAdvance() {
    if (!card) return;
    const detail = pendingDetail || { kanaOk: null, drawOk: null };
    updateSrsForCard(card.id, detail);

    // compute overall correctness for scoring
    let overall = null;
    if (detail.kanaOk === null && detail.drawOk === null) overall = false;
    else if (detail.kanaOk === null) overall = !!detail.drawOk;
    else if (detail.drawOk === null) overall = !!detail.kanaOk;
    else overall = detail.kanaOk && detail.drawOk;

    setTotalCount(c => c + 1);
    if (overall) setCorrectCount(c => c + 1);

    // record recent seen id to avoid immediate repeat
    setRecentSeen(prev => {
      const next = [card.id, ...prev.filter(id=>id!==card.id)];
      // keep last 8
      return next.slice(0, 8);
    });

    const nextIdx = chooseNextIndex();
    setIndex(nextIdx);

    setKanaInput('');
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
    setFeedback(null);
    boardRef.current?.clear();
  }

  // CHECK: compute kanaOk/drawOk and set pendingDetail + pendingResult (does NOT finalize SRS)
  async function checkAnswer() {
    if (!card) return;
    setFeedback(null);
    const needKana = (cardMode === 'kanji->kana' || cardMode === 'both');
    const needDraw = (cardMode === 'meaning->kanji' || cardMode === 'both');

    let kanaOk = null;
    let drawOk = null;
    if (needKana) {
      kanaOk = isKanaMatch(kanaInput, card);
    }
    if (needDraw) {
      const userImg = boardRef.current?.getImage ? boardRef.current.getImage(64) : null;
      if (!userImg) {
        drawOk = false;
      } else {
        const target = renderKanjiImage(card.kanji, 64);
        const sim = similarity(userImg, target);
        drawOk = sim >= 0.50;
        if (!drawOk) setFeedback({ ok:false, message: `Drawing similarity ${(sim*100).toFixed(0)}% — keep trying.` });
      }
    }

    const overallOk = (needKana && needDraw) ? (kanaOk && drawOk) : (needKana ? kanaOk : drawOk);

    setAnswered(true);
    setPendingResult(!!overallOk);
    setPendingDetail({ kanaOk: kanaOk, drawOk: drawOk });
    setShowAnswer(true);
    if (overallOk) setFeedback({ ok:true, message: 'Looks correct — press Enter again or Confirm & Next to proceed.' });
    else setFeedback({ ok:false, message: 'Not correct yet — check examples or mark manually.' });
  }

  // keyboard behavior for kana input: Enter => check if not answered, else finalizeAdvance (no confirm needed)
  function onKanaKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!answered) {
        checkAnswer();
      } else {
        finalizeAdvance();
      }
    }
  }

  // manual mark handlers set pendingDetail based on which parts were required
  function onMarkWasCorrect() {
    const needKana = (cardMode === 'kanji->kana' || cardMode === 'both');
    const needDraw = (cardMode === 'meaning->kanji' || cardMode === 'both');
    setAnswered(true);
    setPendingResult(true);
    setPendingDetail({ kanaOk: needKana ? true : null, drawOk: needDraw ? true : null });
    setFeedback({ ok:true, message: 'Marked correct — press Enter or Confirm & Next.' });
    setShowAnswer(true);
  }
  function onMarkWasWrong() {
    const needKana = (cardMode === 'kanji->kana' || cardMode === 'both');
    const needDraw = (cardMode === 'meaning->kanji' || cardMode === 'both');
    setAnswered(true);
    setPendingResult(false);
    setPendingDetail({ kanaOk: needKana ? false : null, drawOk: needDraw ? false : null });
    setFeedback({ ok:false, message: 'Marked incorrect — press Enter or Confirm & Next.' });
    setShowAnswer(true);
  }

  // onSelectKanji for KanjiBrowser: find card and jump to it
  function onSelectKanji(kanji) {
    if (!kanji) return;
    const pos = shuffled.findIndex(c => (c.kanji && c.kanji.includes(kanji)));
    if (pos >= 0) {
      setIndex(pos);
      setShowKanjiBrowser(false);
      return;
    }
    const copy = shuffle([...decks[deckKey]]);
    setShuffled(copy);
    const pos2 = copy.findIndex(c => (c.kanji && c.kanji.includes(kanji)));
    if (pos2 >= 0) {
      setIndex(pos2);
    } else {
      setFeedback({ ok:false, message: `Aucune carte contenant "${kanji}" dans ce deck.` });
    }
    setShowKanjiBrowser(false);
  }

  const controlBtnStyle = {
    padding:'8px 10px',
    borderRadius:8,
    border:'none',
    background:'rgba(255,255,255,0.03)',
    color:'inherit',
    cursor:'pointer'
  };

  const modeBtnStyle = {
    padding:'8px 10px',
    borderRadius:8,
    border:'none',
    background:'transparent',
    color:'inherit',
    cursor:'pointer'
  };

  const percent = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);

  // helper: normalize string to hiragana (basic)
  function toHiraganaRaw(str = '') {
    if (!str) return '';
    // Unicode NFKC normalize, trim, lower
    let s = str.normalize('NFKC').trim();
    // convert Katakana to Hiragana (basic unicode offset)
    let out = '';
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      // Katakana block U+30A0..U+30FF
      if (code >= 0x30A1 && code <= 0x30F3) {
        out += String.fromCharCode(code - 0x60);
      } else {
        out += ch;
      }
    }
    // remove spaces and punctuation often typed
    out = out.replace(/\s+/g, '').replace(/[，,。 。·･]/g, '');
    return out;
  }

  function isAsciiWord(s = '') {
    return /^[\x00-\x7F]+$/.test(s);
  }

  // check typed kana against card.kana or card.romaji (if ascii)
  function isKanaMatch(input, card) {
    if (!card) return false;
    const raw = input || '';
    if (!raw) return false;
    if (isAsciiWord(raw)) {
      // compare to romaji variants
      const v = raw.toLowerCase().replace(/\s+/g, '');
      return (card.romaji || []).map(r=>r.toLowerCase()).some(r=>r === v);
    } else {
      const a = toHiraganaRaw(raw);
      return (card.kana || []).map(k=>toHiraganaRaw(k)).some(k=>k === a);
    }
  }

  // render the target kanji into a downscaled grayscale array (same format as DrawingBoard.getImage)
  function renderKanjiImage(kanji, size = 64) {
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    // white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    // draw kanji centered
    ctx.fillStyle = '#000';
    // choose a large font to fill canvas
    const fontSize = Math.floor(size * 0.85);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize}px serif`;
    ctx.fillText(kanji, size / 2, size / 2 + Math.floor(fontSize * 0.05));
    // read pixels
    const img = ctx.getImageData(0, 0, size, size).data;
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray[p] = lum;
    }
    return gray;
  }

  // similarity: 1 - normalized absolute diff (0..1)
  function similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
    }
    const max = 255 * a.length;
    return 1 - (sum / max);
  }

  // on app start, initialize sync and load SRS/decks if available
  useEffect(() => {
    let mounted = true;
    (async () => {
      const hasRemote = await initSync();
      if (!hasRemote) return;
      // try to get current user
      const u = await getUser();
      if (!mounted) return;
      setUser(u);
      try {
        const remote = await loadSrs(u?.id || null, deckKey);
        // merge remote with local srsMap (local wins if newer)
        setSrsMap(prev => mergeSrs(prev, remote || {}));
      } catch (e) {
        console.warn('Failed to load remote SRS', e);
      }
      // subscribe to auth state changes to update user
      const unsub = onAuthStateChange(async (event, session) => {
        const nu = await getUser();
        setUser(nu);
        // when signing in, load and merge remote SRS for current deck
        if (nu) {
          const remote = await loadSrs(nu.id, deckKey);
          setSrsMap(prev => mergeSrs(prev, remote || {}));
        }
      });
      // keep unsubscribe around
      appAuthUnsub.current = unsub;
    })();
    return () => { mounted = false; if (appAuthUnsub.current) appAuthUnsub.current(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // watch deckKey changes: when switching decks, if user is signed in load SRS for that deck
  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const remote = await loadSrs(user.id, deckKey);
        setSrsMap(prev => mergeSrs(prev, remote || {}));
      } catch(e){}
    })();
  }, [deckKey, user]);

  // Debounced save to remote when srsMap changes and user exists
  useEffect(() => {
    const t = setTimeout(async () => {
      if (user) {
        try {
          await saveSrs(user.id, deckKey, srsMap);
        } catch (e) {
          console.warn('saveSrs failed', e);
        }
      } else {
        // always save local fallback to localStorage handled by saveSrs when user null
        try { await saveSrs(null, deckKey, srsMap); } catch(e){}
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [srsMap, deckKey, user]);

  // small ref to keep auth unsubscribe between renders
  const appAuthUnsub = useRef(null);

  // helper: normalize string to hiragana (basic)
  function toHiraganaRaw(str = '') {
    if (!str) return '';
    // Unicode NFKC normalize, trim, lower
    let s = str.normalize('NFKC').trim();
    // convert Katakana to Hiragana (basic unicode offset)
    let out = '';
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      // Katakana block U+30A0..U+30FF
      if (code >= 0x30A1 && code <= 0x30F3) {
        out += String.fromCharCode(code - 0x60);
      } else {
        out += ch;
      }
    }
    // remove spaces and punctuation often typed
    out = out.replace(/\s+/g, '').replace(/[，,。 。·･]/g, '');
    return out;
  }

  function isAsciiWord(s = '') {
    return /^[\x00-\x7F]+$/.test(s);
  }

  // check typed kana against card.kana or card.romaji (if ascii)
  function isKanaMatch(input, card) {
    if (!card) return false;
    const raw = input || '';
    if (!raw) return false;
    if (isAsciiWord(raw)) {
      // compare to romaji variants
      const v = raw.toLowerCase().replace(/\s+/g, '');
      return (card.romaji || []).map(r=>r.toLowerCase()).some(r=>r === v);
    } else {
      const a = toHiraganaRaw(raw);
      return (card.kana || []).map(k=>toHiraganaRaw(k)).some(k=>k === a);
    }
  }

  // render the target kanji into a downscaled grayscale array (same format as DrawingBoard.getImage)
  function renderKanjiImage(kanji, size = 64) {
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    // white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    // draw kanji centered
    ctx.fillStyle = '#000';
    // choose a large font to fill canvas
    const fontSize = Math.floor(size * 0.85);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize}px serif`;
    ctx.fillText(kanji, size / 2, size / 2 + Math.floor(fontSize * 0.05));
    // read pixels
    const img = ctx.getImageData(0, 0, size, size).data;
    const gray = new Uint8ClampedArray(size * size);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const r = img[i], g = img[i + 1], b = img[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray[p] = lum;
    }
    return gray;
  }

  // similarity: 1 - normalized absolute diff (0..1)
  function similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
    }
    const max = 255 * a.length;
    return 1 - (sum / max);
  }

  // Header: show Auth component and user's email
  // merge into header JSX (replace or add inside header's right side)
  // Example snippet to place inside header's right area:
  /*
    <div style={{display:'flex', gap:8, alignItems:'center'}}>
      <Auth onUserChange={(u) => setUser(u)} />
    </div>
  */
  return (
    <div style={{
      maxWidth: 980, margin: '28px auto', padding: 20, borderRadius: 12,
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))',
      boxShadow: '0 6px 30px rgba(2,6,23,0.6)'
    }}>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
        <div>
          <h1 style={{margin:0, fontSize:20}}>ButTaiwan — WriteMyFont Trainer</h1>
          <div style={{color:'var(--muted)', fontSize:13}}>Modern handwriting canvas + flashcards for Japanese practice</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <label style={{color:'var(--muted)', fontSize:13}}>
            Deck:
            <select value={deckKey} onChange={e=>setDeckKey(e.target.value)} style={{marginLeft:8, background:'transparent', color:'inherit', border:'1px solid rgba(255,255,255,0.04)', padding:'6px 8px', borderRadius:8}}>
              {AVAILABLE_DECKS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>

          <button onClick={()=>resetSrsForDeck(deckKey)} title="Reset SRS for entire deck" style={{padding:'8px 10px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.03)', color:'inherit', cursor:'pointer'}}>Reset All SRS</button>

          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{color:'var(--muted)', fontSize:13, marginRight:6}}>Modes:</div>
            {['kanji->kana','meaning->kanji','both'].map(m => {
              const active = selectedModes.includes(m);
              const colors = {
                'kanji->kana':'#0ea5e9',
                'meaning->kanji':'#fb7185',
                'both':'#34d399'
              };
              return (
                <button key={m} onClick={() => {
                  setSelectedModes(prev => {
                    if (prev.includes(m)) return prev.filter(x=>x!==m);
                    return [...prev, m];
                  });
                }} style={{...modeBtnStyle, background: active ? colors[m] : undefined}}>
                  {m === 'kanji->kana' ? 'Kanji → Kana' : m === 'meaning->kanji' ? 'Meaning → Kanji' : 'Both'}
                </button>
              );
            })}
          </div>

          <button onClick={()=>setShowKanjiBrowser(true)} style={{padding:'8px 10px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.03)', color:'inherit', cursor:'pointer'}}>Kanji Menu</button>

          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <Auth onUserChange={(u) => setUser(u)} />
          </div>
        </div>
      </header>

      <main style={{display:'grid', gridTemplateColumns: '1fr 380px', gap: 18, marginTop:18}}>
        <section style={{background:'var(--panel)', padding:14, borderRadius:10}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
            <div style={{fontSize:14, color:'var(--muted)'}}>Provide your answer in the zones below</div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={()=>boardRef.current?.undo()} style={controlBtnStyle}>Undo</button>
              <button onClick={()=>{ boardRef.current?.clear(); setKanaInput(''); }} style={controlBtnStyle}>Clear</button>
            </div>
          </div>

          {/* If the effective mode includes kana typing, show a text input */}
          {(cardMode === 'kanji->kana' || cardMode === 'both') && (
            <div style={{marginBottom:12, display:'flex', flexDirection:'column', gap:8}}>
              <label style={{color:'var(--muted)', fontSize:13}}>Type kana reading</label>
              <input
                value={kanaInput}
                onChange={e=>setKanaInput(e.target.value)}
                onKeyDown={onKanaKeyDown}
                placeholder="たべる"
                style={{padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', background:'transparent', color:'inherit', fontSize:18}}
              />
            </div>
          )}

          {/* If the effective mode includes drawing, show the DrawingBoard */}
          {(cardMode === 'meaning->kanji' || cardMode === 'both') && (
            <div style={{marginTop:8}}>
              <DrawingBoard ref={boardRef} width={720} height={480} />
              <div style={{color:'var(--muted)', fontSize:12, marginTop:6}}>
                Draw the kanji here (touch or mouse). Use Undo/Clear if needed.
              </div>
            </div>
          )}

          <div style={{display:'flex', justifyContent:'space-between', marginTop:10, color:'var(--muted)', fontSize:13}}>
            <div>Active: {cardMode === 'kanji->kana' ? 'Kanji → Kana' : cardMode === 'meaning->kanji' ? 'Meaning → Kanji' : 'Both'}</div>
            <div>{card ? `Card ${index+1}/${shuffled.length}` : 'No cards'}</div>
          </div>
        </section>

        <aside style={{background:'var(--panel)', padding:14, borderRadius:10, display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontSize:14, color:'var(--muted)'}}>Flashcard</div>

          <div style={{padding:12, borderRadius:8, background:'linear-gradient(180deg, rgba(255,255,255,0.01), transparent)'}}>
            {card ? (
              <>
                <div style={{fontSize:34, fontWeight:700, lineHeight:1.1}}>{
                  // show prompt based on the requested "question" type:
                  // if mode is kanji->kana or both: show kanji
                  // if mode is meaning->kanji: show meanings (primary)
                  (cardMode === 'meaning->kanji') ? (card.meanings[0] || card.kanji) : card.kanji
                }</div>

                <div style={{color:'var(--muted)', marginTop:8, fontSize:13}}>
                  {cardMode === 'kanji->kana' ? 'Type the kana reading' : cardMode === 'meaning->kanji' ? 'Write the kanji from the meaning' : 'Type kana and/or draw kanji'}
                </div>

                {showAnswer && (
                  <div style={{marginTop:12, padding:10, borderRadius:8, background:'rgba(255,255,255,0.02)'}}>
                    <div style={{fontSize:16, color:'var(--accent)'}}>Answer</div>
                    <div style={{marginTop:6, fontSize:20}}>{ card.kanji }</div>
                    <div style={{marginTop:8, color:'var(--muted)'}}>Meanings: { (card.meanings || []).join(' / ') }</div>
                    <div style={{marginTop:6, color:'var(--muted)'}}>Kana: {card.kana.join(', ')} — Romaji: {card.romaji.join(', ')}</div>
                  </div>
                )}

                {/* show user's typed kana when present */}
                {(kanaInput && (cardMode === 'kanji->kana' || cardMode === 'both')) && (
                  <div style={{marginTop:8, fontSize:13, color:'var(--muted)'}}>Your input: {kanaInput}</div>
                )}

                <div style={{display:'flex', gap:8, marginTop:12, alignItems:'center'}}>
                  <button onClick={()=>setShowAnswer(s=>!s)} style={controlBtnStyle}>{showAnswer ? 'Hide Answer' : 'Show Answer'}</button>
                  <button onClick={checkAnswer} style={{...controlBtnStyle, background:'#0ea5e9', color:'#041025'}}>Check</button>

                  {pendingResult === null ? (
                    <>
                      <button onClick={onMarkWasCorrect} style={{...controlBtnStyle, background:'#16a34a', color:'#041025'}}>I was correct</button>
                      <button onClick={onMarkWasWrong} style={{...controlBtnStyle, background:'#ef4444', color:'#041025'}}>I was wrong</button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>finalizeAdvance()} style={{...controlBtnStyle, background:'#6366f1', color:'#fff'}}>Confirm & Next</button>
                      <button onClick={()=>{ setPendingResult(null); setAnswered(false); setFeedback(null); }} style={{...controlBtnStyle}}>Cancel</button>
                    </>
                  )}

                  {/* NEW: Reset SRS button */}
                  <button onClick={()=>resetSrsForCard(card.id)} style={{...controlBtnStyle, marginLeft:'auto', background:'rgba(255,255,255,0.03)'}}>Reset SRS</button>
                </div>

                {/* feedback for automatic check */}
                {feedback && (
                  <div style={{marginTop:10, padding:10, borderRadius:8, background: feedback.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.06)', color: feedback.ok ? '#bbf7d0' : '#fecaca' }}>
                    {feedback.message}
                  </div>
                )}

                {/* show SRS status */}
                <div style={{marginTop:10, padding:10, borderRadius:8, background:'rgba(255,255,255,0.01)', color:'var(--muted)', fontSize:13}}>
                  {(() => {
                    const s = srsMap[card.id] || defaultSrs();
                    const due = s.nextDue ? (s.nextDue <= Date.now()) : true;
                    const nextDueStr = s.nextDue ? new Date(s.nextDue).toLocaleString() : 'now';
                    return (
                      <div>
                        <div><strong>SRS</strong>: reps {s.repetitions} • interval {s.interval}d • ease {s.ease.toFixed(2)}</div>
                        <div>next: {nextDueStr} {due ? '(due)' : ''}</div>
                        <div style={{marginTop:6}}>
                          <div style={{fontSize:13}}>Progress Kana (Kanji→Kana): {s.progressKana ?? 0}%</div>
                          <div style={{fontSize:13}}>Progress Kanji (Meaning→Kanji): {s.progressKanji ?? 0}%</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* examples: show ONLY when answered */}
                {answered && card.examples && card.examples.length > 0 && (
                  <div style={{marginTop:12, padding:12, borderRadius:8, background:'rgba(255,255,255,0.02)'}}>
                    <div style={{fontSize:14, fontWeight:700, marginBottom:8}}>Examples</div>
                    <ul style={{margin:0, paddingLeft:16}}>
                      {card.examples.map((ex, i) => <li key={i} style={{marginBottom:6, color:'var(--muted)'}}>{ex}</li>)}
                    </ul>
                  </div>
                )}

              </>
            ) : (
              <div style={{color:'var(--muted)'}}>No card loaded — pick a deck.</div>
            )}
          </div>

          <ScoreBar correct={correctCount} total={totalCount} percent={Math.round((totalCount===0?0:(correctCount/totalCount*100))) } />

          <div style={{color:'var(--muted)', fontSize:13, marginTop:'auto'}}>
            Tip: Press Enter to check. Press Enter again to proceed when the answer has been revealed.
          </div>
        </aside>
      </main>

      {/* Kanji Browser */}
      {showKanjiBrowser && (
        <KanjiBrowser deck={decks[deckKey]} onSelect={onSelectKanji} onClose={()=>setShowKanjiBrowser(false)} />
      )}

      <footer style={{marginTop:14, color:'var(--muted)', fontSize:12}}>
        Built for handwriting practice — modern minimal dark UI.
      </footer>
    </div>
  );
}

const controlBtnStyle = {
  padding:'8px 10px',
  borderRadius:8,
  border:'none',
  background:'rgba(255,255,255,0.03)',
  color:'inherit',
  cursor:'pointer'
};

const modeBtnStyle = {
  padding:'8px 10px',
  borderRadius:8,
  border:'none',
  background:'transparent',
  color:'inherit',
  cursor:'pointer'
};
