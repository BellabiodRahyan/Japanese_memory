import React from 'react';

export default function ScoreBar({ correct = 0, total = 0, percent = 0 }) {
  const displayPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;

  return (
    <div style={{padding:12, borderRadius:8, background:'rgba(255,255,255,0.02)'}} aria-live="polite">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:13, color:'var(--muted)'}}>Score</div>
        <div style={{fontSize:14, fontWeight:700}}>{correct}/{total}</div>
      </div>
      <div style={{height:10, background:'rgba(255,255,255,0.03)', borderRadius:6, marginTop:8, overflow:'hidden'}} aria-hidden>
        <div style={{width: `${displayPercent}%`, height:'100%', background:'linear-gradient(90deg,#7dd3fc,#fb7185)'}} />
      </div>
      <div style={{marginTop:8, fontSize:12, color:'var(--muted)'}}>Accuracy: {displayPercent}%</div>
    </div>
  );
}
