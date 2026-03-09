// templates/f3.js
// TikTok-native Template (f1-style, formerly t11f)
// Returns { text, fontSize, yFrac } for server to write textfile=... and render real line breaks.

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function wrapWords(text, maxChars) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function estimateFontSizeByLongestLine(wrappedText) {
  const lines = wrappedText.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;

  let size = 92 - longest * 1.05;

  // vertical density penalty
  if (lineCount >= 6) size -= 6;
  if (lineCount >= 7) size -= 8;

  return clamp(Math.round(size), 56, 76);
}

/**
 * vars:
 * - productName (optional)
 * - text (optional) -> if provided, uses this instead of generating the default sentence
 */
module.exports = function f3(vars = {}) {
  const productName = String(vars.productName || "").trim();
  const overrideText = String(vars.text || "").trim();

  const raw = overrideText
    ? overrideText
    : `tiktok bullied the price down ` +
      `so you can get ` +
      `${productName}?? for soo ` +
      `cheap or this a mistake??`;

  // Wrap width target
  let wrapped = wrapWords(raw, 24);

  // TikTok vibe tweaks
  if (!overrideText) {
    if (productName.length <= 12) wrapped = wrapWords(raw, 22);
    if (productName.length >= 18) wrapped = wrapWords(raw, 22);
    if (productName.length >= 26) wrapped = wrapWords(raw, 20);
  }

  const fontSize = estimateFontSizeByLongestLine(wrapped);

  return {
    text: wrapped,
    fontSize,
    yFrac: 0.30, // slightly above center
  };
};
