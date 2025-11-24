(async function bootstrap() {
  try {
    // dynamic import so we can catch errors and show them in the page (useful on Netlify)
    await import('./main.jsx');
  } catch (err) {
    console.error('App failed to bootstrap:', err);
    const root = document.getElementById('root') || document.createElement('div');
    root.id = 'root';
    if (!document.body.contains(root)) document.body.appendChild(root);
    const msg = (err && (err.stack || err.message || String(err))) || 'Unknown error';
    root.innerHTML = `
      <div style="padding:20px; margin:20px; border-radius:8px; background:#1b1f26; color:#ffdddd; font-family:system-ui;">
        <h2 style="margin:0 0 8px 0">Erreur lors du chargement de l'application</h2>
        <pre style="white-space:pre-wrap; color:#ffdede; font-size:13px">${escapeHtml(msg)}</pre>
        <div style="margin-top:10px; color:#d1d5db; font-size:13px">Ouvre la console navigateur pour plus de détails.</div>
      </div>
    `;
  }
})();

// small helper to avoid injecting raw html
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
