export function toHiraganaRaw(input = '') {
  // normalize, convert Katakana block to Hiragana, remove spaces
  const s = String(input || '').normalize('NFKC').trim();
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // Katakana block U+30A1..U+30F4 (cover common range). Map to Hiragana by subtracting 0x60
    if (code >= 0x30A1 && code <= 0x30F4) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += ch;
    }
  }
  // remove whitespace and common punctuation that might be typed
  return out.replace(/\s+/g, '').replace(/[ー−‐‐ｰ〜~・、。,.]/g, '');
}

export default toHiraganaRaw;
