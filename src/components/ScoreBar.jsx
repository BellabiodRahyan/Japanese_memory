import React from 'react';

export default function ScoreBar({ correct = 0, total = 0, percent = 0, srsPercent = null }) {
  return (
    <div style={{padding:12, borderRadius:8, background:'rgba(255,255,255,0.02)'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:13, color:'var(--muted)'}}>Score</div>
        <div style={{fontSize:14, fontWeight:700}}>{correct}/{total}</div>
      </div>
      <div style={{height:10, background:'rgba(255,255,255,0.03)', borderRadius:6, marginTop:8, overflow:'hidden'}}>
        <div style={{width: `${percent}%`, height:'100%', background:'linear-gradient(90deg,#7dd3fc,#fb7185)'}} />
      </div>
      <div style={{marginTop:8, fontSize:12, color:'var(--muted)'}}>Accuracy: {percent}% {srsPercent !== null && `• SRS: ${srsPercent}%`}</div>
    </div>
  );
}
