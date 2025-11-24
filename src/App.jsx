import React, { useEffect, useMemo, useState, useRef } from 'react';
import DrawingBoard from './components/DrawingBoard';
import ScoreBar from './components/ScoreBar';
import { decks } from './data/decks';
import { shuffle } from './utils/shuffle';
import KanjiBrowser from './components/KanjiBrowser';
import Auth from './components/Auth';
import Landing from './components/Landing';
import toHiraganaRaw from './utils/toHiragana';

// ...existing imports and helper functions (renderKanjiImage, similarity) ...

export default function App() {
  // basic state
  const [showLanding, setShowLanding] = useState(true);
  const [selectedDecks, setSelectedDecks] = useState([]); // filled from landing
  const [enableKanji, setEnableKanji] = useState(true);
  const [enableWords, setEnableWords] = useState(true);

  // deck/key management: when multiple decks selected we create a combined pool
  const decksMap = decks; // from data
  const combinedCards = useMemo(()=>{
    const out = [];
    (selectedDecks || []).forEach(k => {
      const list = decksMap[k] || [];
      list.forEach(c => out.push({...c, _deck:k}));
    });
    return out;
  }, [decksMap, selectedDecks]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [shuffledPool, setShuffledPool] = useState([]);
  const [promptMode, setPromptMode] = useState(''); // dynamic per-card: 'kanji->kana' | 'meaning->kanji' | 'jp->meaning' | 'meaning->jp'
  const [kanaInput, setKanaInput] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const [pendingDetail, setPendingDetail] = useState(null);

  const boardRef = useRef();
  const [showKanjiBrowser, setShowKanjiBrowser] = useState(false);
  const [srsMap, setSrsMap] = useState(() => ({})); // existing persistence logic remains
  const [feedback, setFeedback] = useState(null);
  const recent = useRef([]);

  // initialize from landing start
  function handleStart({ selectedDecks: sel, enableKanji: ek, enableWords: ew }) {
    setSelectedDecks(sel);
    setEnableKanji(!!ek);
    setEnableWords(!!ew);
    // build pool and shuffle
    const pool = [];
    sel.forEach(k => {
      (decksMap[k] || []).forEach(c => pool.push({...c, _deck:k}));
    });
    const sh = shuffle(pool);
    setShuffledPool(sh);
    setCurrentIdx(0);
    setShowLanding(false);
  }

  // helper to determine card type
  function isKanjiCard(c) {
    if (!c) return false;
    // prefer explicit deck name
    if (c._deck && /kanji/i.test(c._deck)) return true;
    // fallback: any kanji characters in 'kanji' field
    if (c.kanji && /[\p{sc=Han}]/u.test(c.kanji)) return true;
    return false;
  }
  function isVerbWordCard(c) {
    if (!c) return false;
    if (c._deck && /verb|word/i.test(c._deck)) return true;
    // also treat items without kanji but with meanings as vocab
    if (!isKanjiCard(c) && (c.meanings && c.meanings.length > 0)) return true;
    return false;
  }

  const card = shuffledPool[currentIdx];

  // choose prompt mode per card depending on deck types and enabled modes
  useEffect(()=> {
    if (!card) return;
    if (isKanjiCard(card) && enableKanji) {
      // pick one of two kanji modes randomly
      setPromptMode(Math.random() < 0.5 ? 'kanji->kana' : 'meaning->kanji');
    } else if (isVerbWordCard(card) && enableWords) {
      setPromptMode(Math.random() < 0.5 ? 'jp->meaning' : 'meaning->jp');
    } else {
      // fallback: prefer jp->meaning
      setPromptMode('jp->meaning');
    }
    // reset inputs
    setKanaInput('');
    setShowAnswer(false);
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
    boardRef.current?.clear?.();
  }, [card, enableKanji, enableWords]);

  // choose next index with SRS/due + avoid recent (simplified)
  function chooseNextIndex() {
    if (!shuffledPool.length) return 0;
    const now = Date.now();
    const due = [];
    for (let i=0;i<shuffledPool.length;i++) {
      const c = shuffledPool[i];
      const s = srsMap[c.id] || { nextDue:0 };
      if (!s.nextDue || s.nextDue <= now) due.push(i);
    }
    // prefer due not in recent
    const filtered = due.filter(i => !recent.current.includes(shuffledPool[i].id));
    const pickPool = filtered.length ? filtered : (due.length ? due : shuffledPool.map((_,i)=>i));
    const idx = pickPool[Math.floor(Math.random()*pickPool.length)];
    return idx;
  }

  // finalize generic: use pendingDetail to update srs and advance
  function finalizeAdvance(detail = null) {
    if (!card) return;
    const d = detail || pendingDetail || {};
    // map detail to updateSrsForCard: reuse existing function updateSrsForCard(cardId, detail)
    updateSrsForCard(card.id, d); // assume exists
    // scoring
    const overall = (d.jpMeaningOk !== undefined) ? !!d.jpMeaningOk : ((d.kanaOk!==undefined||d.drawOk!==undefined) ? ((d.kanaOk!==false) && (d.drawOk!==false)) : false);
    // update counters if you maintain them...
    // track recent
    recent.current = [card.id, ...recent.current.filter(x=>x!==card.id)].slice(0,8);
    const nextIdx = chooseNextIndex();
    setCurrentIdx(nextIdx);
    setKanaInput('');
    setShowAnswer(false);
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
    setFeedback(null);
    boardRef.current?.clear?.();
  }

  // Check answer simplified for both flows
  async function checkAnswer() {
    if (!card) return;
    if (isVerbWordCard(card)) {
      // jp->meaning: compare meaning text loosely
      if (promptMode === 'jp->meaning') {
        const v = (kanaInput||'').trim().toLowerCase();
        const ok = (card.meanings||[]).some(m => m.toLowerCase().trim() === v || m.toLowerCase().includes(v));
        setAnswered(true);
        setPendingDetail({ jpMeaningOk: ok });
        setPendingResult(ok);
        setShowAnswer(true);
        setFeedback(ok ? { ok:true, message:'Correct' } : { ok:false, message:'Incorrect' });
        return;
      }
      // meaning->jp: accept romaji/kana/kanji
      if (promptMode === 'meaning->jp') {
        const raw = (kanaInput||'').trim();
        const ascii = /^[\x00-\x7F]+$/.test(raw);
        let ok = false;
        if (ascii) {
          const v = raw.replace(/\s+/g,'').toLowerCase();
          ok = (card.romaji||[]).some(r=>r.replace(/\s+/g,'').toLowerCase() === v);
        } else {
          const hira = toHiraganaRaw(raw);
          ok = (card.kana||[]).map(k=>toHiraganaRaw(k)).some(k=>k === hira) || ((card.kanji||'') === raw || (card.kanji||'').includes(raw));
        }
        setAnswered(true);
        setPendingDetail({ jpMeaningOk: ok });
        setPendingResult(ok);
        setShowAnswer(true);
        setFeedback(ok ? { ok:true, message:'Correct' } : { ok:false, message:'Incorrect' });
        return;
      }
    } else if (isKanjiCard(card)) {
      // Kanji flow
      await checkAnswerForKanji(card);
      return;
    }
    // fallback mark wrong
    setAnswered(true);
    setPendingDetail({ jpMeaningOk:false });
    setPendingResult(false);
    setShowAnswer(true);
    setFeedback({ ok:false, message:'Unable to validate' });
  }

  // show answer counts as failure
  function handleShowAnswer() {
    if (!card) return;
    setShowAnswer(true);
    setAnswered(true);
    // set pending as failure (will be recorded if Next is pressed)
    if (isVerbWordCard(card)) setPendingDetail({ jpMeaningOk:false });
    else setPendingDetail({ kanaOk:false, drawOk:false });
    setPendingResult(false);
    setFeedback({ ok:false, message:'Answer shown — counted as incorrect' });
  }

  // finalize advance: use pendingDetail to update SRS and go to next
  function finalizeAdvance(detail = null) {
    const d = detail || pendingDetail || {};
    if (card) {
      // map jpMeaningOk -> kanaOk for SRS update when appropriate
      if ('jpMeaningOk' in d) {
        updateSrsForCard(card.id, { kanaOk: d.jpMeaningOk ? true : false, drawOk: null });
      } else {
        updateSrsForCard(card.id, { kanaOk: d.kanaOk ?? null, drawOk: d.drawOk ?? null });
      }
    }
    // move to next (avoid immediate repeats)
    recentSeen.current = [card?.id, ...recentSeen.current.filter(x=>x!==card?.id)].slice(0,8);
    const next = chooseNextIndex();
    setCurrentIdx(next);
    // reset UI
    setKanaInput('');
    setShowAnswer(false);
    setAnswered(false);
    setPendingResult(null);
    setPendingDetail(null);
    setFeedback(null);
    boardRef.current?.clear?.();
  }

  // buttons for manual marking (correct/wrong)
  function onMarkWasCorrect() {
    if (!card) return;
    if (isVerbWordCard(card)) {
      setAnswered(true); setPendingDetail({ jpMeaningOk:true }); setPendingResult(true); setShowAnswer(true);
      setFeedback({ ok:true, message:'Marked correct — press Next' });
    } else {
      setAnswered(true); setPendingDetail({ kanaOk:true, drawOk: true }); setPendingResult(true); setShowAnswer(true);
      setFeedback({ ok:true, message:'Marked correct — press Next' });
    }
  }
  function onMarkWasWrong() {
    if (!card) return;
    if (isVerbWordCard(card)) {
      setAnswered(true); setPendingDetail({ jpMeaningOk:false }); setPendingResult(false); setShowAnswer(true);
      setFeedback({ ok:false, message:'Marked incorrect — press Next' });
    } else {
      setAnswered(true); setPendingDetail({ kanaOk:false, drawOk:false }); setPendingResult(false); setShowAnswer(true);
      setFeedback({ ok:false, message:'Marked incorrect — press Next' });
    }
  }

  // next button handler
  function handleNext() {
    // if not answered yet treat as wrong and advance
    if (!answered) {
      if (isVerbWordCard(card)) finalizeAdvance({ jpMeaningOk:false });
      else finalizeAdvance({ kanaOk:false, drawOk:false });
      return;
    }
    finalizeAdvance();
  }

  // small UI: central simplified layout
  return (
    <>
      {showLanding ? (
        <Landing onStart={handleStart} />
      ) : (
        <div style={{minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', padding:12}}>
          <header style={{width:'100%', maxWidth:820, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:700}}>Japanese Memory</div>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <button onClick={()=>setShowLanding(true)} style={{padding:'6px 8px'}}>Menu</button>
              <button onClick={()=>setShowKanjiBrowser(true)} style={{padding:'6px 8px'}}>Vocab</button>
              <button onClick={resetAllSrsForSelected} style={{padding:'6px 8px'}}>Reset SRS</button>
            </div>
          </header>

          <main style={{flex:1, display:'flex', flexDirection:'column', width:'100%', maxWidth:820, marginTop:12}}>
            <div style={{background:'var(--panel)', padding:14, borderRadius:10, minHeight:400, display:'flex', flexDirection:'column', alignItems:'stretch'}}>
              {/* Top: prompt */}
              <div style={{textAlign:'center', marginBottom:8, color:'var(--muted)'}}>
                <div style={{fontSize:20, fontWeight:700}}>
                  {card ? ( promptMode.startsWith('kanji') || promptMode === 'jp->meaning' ? ( promptMode === 'jp->meaning' ? card.kanji : (promptMode === 'kanji->kana' ? card.kanji : (card.meanings[0]||card.kanji)) ) : (card.meanings[0]||card.kanji) ) : 'No cards selected' }
                </div>
                {card && promptMode === 'jp->meaning' && <div style={{fontSize:14, color:'var(--muted)'}}>{(card.kana||[]).join(', ')}</div>}
                {card && promptMode === 'meaning->jp' && <div style={{fontSize:13, color:'var(--muted)'}}>Meaning: {(card.meanings||[]).join(', ')}</div>}
              </div>

              {/* Center: drawing OR input */}
              <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:12}}>
                {card ? (
                  (isKanjiCard(card) && (promptMode === 'meaning->kanji')) ? (
                    <div style={{width:'100%'}}><DrawingBoard ref={boardRef} /></div>
                  ) : (
                    <input value={kanaInput} onChange={e=>setKanaInput(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') checkAnswer(); }} placeholder="Entrez votre réponse puis validez" style={{width:'100%', padding:12, fontSize:18, borderRadius:10, border:'1px solid rgba(255,255,255,0.04)', background:'transparent', color:'inherit'}} />
                  )
                ) : <div style={{color:'var(--muted)'}}>Aucun carte — réglez la sélection dans le menu</div>}
              </div>

              {/* Bottom: action buttons */}
              <div style={{display:'flex', gap:8, justifyContent:'center', marginTop:12}}>
                <button onClick={checkAnswer} style={{padding:'10px 14px', borderRadius:8, background:'#0ea5e9'}}>Valider</button>
                <button onClick={handleShowAnswer} style={{padding:'10px 14px', borderRadius:8, background:'#f97316'}}>Afficher réponse</button>
                <button onClick={handleNext} style={{padding:'10px 14px', borderRadius:8, background:'#6366f1'}}>Suivant</button>
              </div>

              {/* Feedback & SRS */}
              <div style={{marginTop:12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{color: feedback?.ok ? '#bbf7d0' : '#fecaca'}}>{feedback?.message}</div>
                <div style={{width:220}}><ScoreBar correct={0} total={0} percent={0} srsPercent={card ? Math.round(((srsMap[card.id]?.progressKana||0)+(srsMap[card.id]?.progressKanji||0))/2) : null} /></div>
              </div>
            </div>
          </main>

          {showKanjiBrowser && <KanjiBrowser decksMap={decksMap} selectedDecks={selectedDecks} onSelect={(k)=>{ /* find card and jump to it */ }} onClose={()=>setShowKanjiBrowser(false)} srsMap={srsMap} />}

        </div>
      )}
    </>
  );
}

// ...existing helper functions (updateSrsForCard, checkAnswerForKanji, etc.) ...
