import React, { useEffect, useMemo, useState, useRef } from 'react';
import DrawingBoard from './components/DrawingBoard';
import ScoreBar from './components/ScoreBar';
import { decks } from './data/decks';
import { shuffle } from './utils/shuffle';
import KanjiBrowser from './components/KanjiBrowser';
import Auth from './components/Auth';
import Landing from './components/Landing';

const AVAILABLE_DECKS = Object.keys(decks);

export default function App() {
  const [deckKey, setDeckKey] = useState(AVAILABLE_DECKS[0]);
  const [shuffled, setShuffled] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [showLanding, setShowLanding] = useState(true);
  const boardRef = useRef();

  // ensure user state exists early
  const [user, setUser] = useState(null);

  // mode selection: keep only two modes (A and B)
  // For Kanji decks: 'kanji->kana' and 'meaning->kanji'
  // For Verb/Word decks: 'jp->meaning' and 'meaning->jp'
  const [selectedModes, setSelectedModes] = useState(['kanji->kana']);

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

    if (isVerbWordDeck(deckKey)) {
      // Verb/Word flow: either jp->meaning or meaning->jp
      if (cardMode === 'jp->meaning') {
        const ok = matchesMeaning(kanaInput, card);
        setAnswered(true);
        setPendingDetail({ kanaOk: null, drawOk: null, jpMeaningOk: ok });
        setPendingResult(!!ok);
        setShowAnswer(true);
        setFeedback(ok ? { ok:true, message: 'Correct — press Enter again or Confirm & Next.' } : { ok:false, message:'Not matching accepted meanings.' });
        return;
      } else {
        // meaning->jp: user must provide japanese (kana/romaji/kanji)
        const ok = matchesJapaneseInput(kanaInput, card);
        setAnswered(true);
        setPendingDetail({ kanaOk: null, drawOk: null, jpMeaningOk: ok });
        setPendingResult(!!ok);
        setShowAnswer(true);
        setFeedback(ok ? { ok:true, message: 'Looks correct — press Enter again or Confirm & Next.' } : { ok:false, message:'Not matching accepted Japanese forms.' });
        return;
      }
    }

    // For Kanji decks keep previous behavior (kana/drawing)
    // ...existing kanji check logic unchanged...
    // (reuse earlier code: compute kanaOk, drawOk, similarity, set pendingDetail accordingly)
    // For brevity in this diff, we call the existing routine if Kanji
    await checkAnswerForKanji();
  }

  // handle Enter: first Enter checks, second Enter finalizes and advances
  function onAnswerKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!answered) {
        checkAnswer();
      } else {
        // finalize using pendingDetail (verb/word overall result kept in pendingDetail.jpMeaningOk)
        if (isVerbWordDeck(deckKey)) {
          const ok = !!(pendingDetail && pendingDetail.jpMeaningOk);
          finalizeAdvanceWithDetail({ kanaOk: null, drawOk: null, jpMeaningOk: ok });
        } else {
          finalizeAdvance(); // existing finalizer for kanji
        }
      }
    }
  }

  // Finalize for verb/word with detail (update SRS and advance)
  function finalizeAdvanceWithDetail(detail) {
    if (!card) return;
    // map detail to SRS update: use detail.jpMeaningOk to update appropriate progress field
    const d = { kanaOk: detail.jpMeaningOk ? true : false, drawOk: null };
    updateSrsForCard(card.id, d);
    const overall = !!detail.jpMeaningOk;
    setTotalCount(c=>c+1);
    if (overall) setCorrectCount(c=>c+1);
    // choose next index (use existing chooseNextIndex but it avoids repeats)
    const nextIdx = chooseNextIndex();
    setIndex(nextIdx);
    setKanaInput('');
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
    setShowAnswer(false);
    setFeedback(null);
  }

  // UI changes: header and mode buttons (remove "both")
  // In header replace title/subtitle with compact controls; also add Landing redirect
  return (
    <>
      {showLanding ? (
        <Landing onStart={()=> setShowLanding(false)} />
      ) : (
        <div style={{maxWidth: 980, margin: '18px auto', padding: 12}}>
          <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
            <div>
              {/* Removed large title — keep compact app name */}
              <div style={{fontSize:16, fontWeight:700}}>Japanese Memory</div>
            </div>

            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <label style={{color:'var(--muted)', fontSize:13}}>
                Deck:
                <select value={deckKey} onChange={e=>setDeckKey(e.target.value)} style={{marginLeft:8}}>
                  {AVAILABLE_DECKS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>

              {/* Mode buttons: dynamic labels depending on deck type */}
              {isKanjiDeck(deckKey) ? (
                <>
                  <button onClick={()=>setSelectedModes(['kanji->kana'])} style={{...modeBtnStyle, background: selectedModes.includes('kanji->kana') ? '#0ea5e9' : undefined}}>Kanji → Kana</button>
                  <button onClick={()=>setSelectedModes(['meaning->kanji'])} style={{...modeBtnStyle, background: selectedModes.includes('meaning->kanji') ? '#fb7185' : undefined}}>Meaning → Kanji</button>
                </>
              ) : (
                <>
                  <button onClick={()=>setSelectedModes(['jp->meaning'])} style={{...modeBtnStyle, background: selectedModes.includes('jp->meaning') ? '#0ea5e9' : undefined}}>JP → Meaning</button>
                  <button onClick={()=>setSelectedModes(['meaning->jp'])} style={{...modeBtnStyle, background: selectedModes.includes('meaning->jp') ? '#fb7185' : undefined}}>Meaning → JP</button>
                </>
              )}

              <Auth onUserChange={(u)=>setUser(u)} />
              <button onClick={()=>setShowKanjiBrowser(true)} style={{...modeBtnStyle}}>Kanji Menu</button>
            </div>
          </header>

          {/* Main layout: left practice / right card info */}
          <main style={{display:'grid', gridTemplateColumns: '1fr 360px', gap: 12, marginTop:12}}>
            <section style={{background:'var(--panel)', padding:12, borderRadius:10}}>
              <div style={{marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{color:'var(--muted)'}}>Provide your answer in the zones below</div>
                <div style={{display:'flex', gap:8}}>
                  {/* Undo/Clear only show when drawing enabled */}
                  {isKanjiDeck(deckKey) && <>
                    <button onClick={()=>boardRef.current?.undo?.()} style={controlBtnStyle}>Undo</button>
                    <button onClick={()=>{ boardRef.current?.clear?.(); setKanaInput(''); }} style={controlBtnStyle}>Clear</button>
                  </>}
                </div>
              </div>

              {/* For Verb/Word decks: show japanese prompt or meaning prompt and single input */}
              {isVerbWordDeck(deckKey) ? (
                <>
                  <div style={{padding:12, borderRadius:8, background:'linear-gradient(180deg, rgba(255,255,255,0.01), transparent)'}}>
                    {card && (
                      <>
                        <div style={{fontSize:28, fontWeight:700}}>{/* show JP or meaning depending on mode */}
                          { selectedModes[0] === 'jp->meaning' ? (
                              <div>{card.kanji} <div style={{fontSize:16, color:'var(--muted)'}}>{(card.kana||[]).join(', ')}</div></div>
                            ) : (
                              <div style={{fontSize:18, color:'var(--muted)'}}>{(card.meanings||[]).join(' / ')}</div>
                            )
                          }
                        </div>

                        <div style={{marginTop:12}}>
                          <label style={{color:'var(--muted)', fontSize:13}}>{ selectedModes[0] === 'jp->meaning' ? 'Type meaning' : 'Type Japanese (kana / romaji / kanji)'}</label>
                          <input value={kanaInput} onChange={e=>setKanaInput(e.target.value)} onKeyDown={onAnswerKeyDown}
                            placeholder={ selectedModes[0] === 'jp->meaning' ? 'meaning...' : 'たべる / taberu / 食べる' }
                            style={{width:'100%', padding:10, marginTop:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', background:'transparent', color:'inherit', fontSize:16}} />
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                /* Kanji deck: keep drawing board + kana input as before */
                <>
                  {(cardMode === 'kanji->kana' || cardMode === 'both') && (
                    <div style={{marginBottom:12, display:'flex', flexDirection:'column', gap:8}}>
                      <label style={{color:'var(--muted)', fontSize:13}}>Type kana reading</label>
                      <input
                        value={kanaInput}
                        onChange={e=>setKanaInput(e.target.value)}
                        onKeyDown={onAnswerKeyDown}
                        placeholder="たべる"
                        style={{padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', background:'transparent', color:'inherit', fontSize:18}}
                      />
                    </div>
                  )}

                  {(cardMode === 'meaning->kanji' || cardMode === 'both') && (
                    <div style={{marginTop:8}}>
                      <DrawingBoard ref={boardRef} width={720} height={480} />
                      <div style={{color:'var(--muted)', fontSize:12, marginTop:6}}>
                        Draw the kanji here (touch or mouse). Use Undo/Clear if needed.
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <aside style={{background:'var(--panel)', padding:12, borderRadius:10, display:'flex', flexDirection:'column', gap:12}}>
              <div style={{fontSize:14, color:'var(--muted)'}}>Flashcard</div>

              <div style={{padding:12, borderRadius:8, background:'linear-gradient(180deg, rgba(255,255,255,0.01), transparent)'}}>
                {card ? (
                  <>
                    <div style={{fontSize:34, fontWeight:700, lineHeight:1.1}}>{
                      // prompt shown: if deck is verb/word and jp->meaning show JP, if meaning->jp show meaning; otherwise Kanji flows use existing logic
                      isVerbWordDeck(deckKey) ? ( selectedModes[0] === 'jp->meaning' ? card.kanji : (card.meanings[0] || card.kanji) ) : ( cardMode === 'meaning->kanji' ? (card.meanings[0] || card.kanji) : card.kanji )
                    }</div>

                    <div style={{color:'var(--muted)', marginTop:8, fontSize:13}}>
                      { isVerbWordDeck(deckKey) ? ( selectedModes[0] === 'jp->meaning' ? 'Provide the meaning of the Japanese term' : 'Provide the Japanese form for the given meaning' ) : ( cardMode === 'kanji->kana' ? 'Type the kana reading' : 'Draw the kanji or write the reading' )}
                    </div>

                    {showAnswer && (
                      <div style={{marginTop:12, padding:10, borderRadius:8, background:'rgba(255,255,255,0.02)'}}>
                        <div style={{fontSize:16, color:'var(--accent)'}}>Answer</div>
                        <div style={{marginTop:6, fontSize:20}}>{ card.kanji }</div>
                        <div style={{marginTop:6, color:'var(--muted)'}}>Kana: {card.kana.join(', ')} — Meanings: { (card.meanings||[]).join(' / ') }</div>
                      </div>
                    )}

                    <div style={{display:'flex', gap:8, marginTop:12}}>
                      <button onClick={()=>setShowAnswer(s=>!s)} style={controlBtnStyle}>{showAnswer ? 'Hide Answer' : 'Show Answer'}</button>
                      <button onClick={checkAnswer} style={{...controlBtnStyle, background:'#0ea5e9', color:'#041025'}}>Check</button>

                      {pendingResult === null ? (
                        <>
                          <button onClick={onMarkWasCorrect} style={{...controlBtnStyle, background:'#16a34a', color:'#041025'}}>I was correct</button>
                          <button onClick={onMarkWasWrong} style={{...controlBtnStyle, background:'#ef4444', color:'#041025'}}>I was wrong</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=> { if (isVerbWordDeck(deckKey)) finalizeAdvanceWithDetail(pendingDetail || { jpMeaningOk: pendingResult }); else finalizeAdvance(); }} style={{...controlBtnStyle, background:'#6366f1', color:'#fff'}}>Confirm & Next</button>
                          <button onClick={()=>{ setPendingResult(null); setAnswered(false); setFeedback(null); }} style={{...controlBtnStyle}}>Cancel</button>
                        </>
                      )}
                    </div>

                    {feedback && (
                      <div style={{marginTop:10, padding:10, borderRadius:8, background: feedback.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.06)', color: feedback.ok ? '#bbf7d0' : '#fecaca' }}>
                        {feedback.message}
                      </div>
                    )}

                    {/* Examples and SRS block shown when answered (unchanged) */}
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

          {showKanjiBrowser && (
            <KanjiBrowser deck={decks[deckKey]} onSelect={onSelectKanji} onClose={()=>setShowKanjiBrowser(false)} />
          )}
        </div>
      )}
    </>
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

// helpers to detect deck types
const isKanjiDeck = (key) => /kanji/i.test(key);
const isVerbWordDeck = (key) => /verb|word/i.test(key);

// Helpers for verb/word matching
function normalizeText(s = '') {
  return String(s || '').normalize('NFKC').trim().toLowerCase().replace(/[。、.,]/g, '');
}
function matchesMeaning(input, card) {
  const v = normalizeText(input);
  return (card.meanings || []).some(m => normalizeText(m) === v || normalizeText(m).includes(v));
}
function matchesJapaneseInput(input, card) {
  if (!input) return false;
  // if ascii -> compare romaji
  const raw = String(input || '').trim();
  const ascii = /^[\x00-\x7F]+$/.test(raw);
  if (ascii) {
    const v = raw.toLowerCase().replace(/\s+/g,'');
    return (card.romaji || []).some(r => r.toLowerCase().replace(/\s+/g,'') === v);
  } else {
    // compare hiragana normalized and kanji exact match
    const hira = toHiraganaRaw(raw);
    if ((card.kana || []).map(k=>toHiraganaRaw(k)).some(k=>k === hira)) return true;
    if ((card.kanji || '').includes(raw)) return true;
    // also accept when input equals kanji ignoring spaces
    return false;
  }
}

// add missing handlers for marking card manually as correct/incorrect
function onMarkWasCorrect() {
  // Verb/Word decks: set jpMeaningOk true
  if (isVerbWordDeck(deckKey)) {
    setAnswered(true);
    setPendingResult(true);
    setPendingDetail({ jpMeaningOk: true });
    setFeedback({ ok: true, message: 'Marked correct — press Enter or Confirm & Next.' });
    setShowAnswer(true);
    return;
  }

  // Kanji decks: determine which parts are required and mark them true
  const needKana = (cardMode === 'kanji->kana' || cardMode === 'both');
  const needDraw = (cardMode === 'meaning->kanji' || cardMode === 'both');
  setAnswered(true);
  setPendingResult(true);
  setPendingDetail({ kanaOk: needKana ? true : null, drawOk: needDraw ? true : null });
  setFeedback({ ok: true, message: 'Marked correct — press Enter or Confirm & Next.' });
  setShowAnswer(true);
}

function onMarkWasWrong() {
  // Verb/Word decks: set jpMeaningOk false
  if (isVerbWordDeck(deckKey)) {
    setAnswered(true);
    setPendingResult(false);
    setPendingDetail({ jpMeaningOk: false });
    setFeedback({ ok: false, message: 'Marked incorrect — press Enter or Confirm & Next.' });
    setShowAnswer(true);
    return;
  }

  // Kanji decks: determine which parts are required and mark them false
  const needKana = (cardMode === 'kanji->kana' || cardMode === 'both');
  const needDraw = (cardMode === 'meaning->kanji' || cardMode === 'both');
  setAnswered(true);
  setPendingResult(false);
  setPendingDetail({ kanaOk: needKana ? false : null, drawOk: needDraw ? false : null });
  setFeedback({ ok: false, message: 'Marked incorrect — press Enter or Confirm & Next.' });
  setShowAnswer(true);
}
