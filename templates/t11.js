// templates/t11.js

// templates/t11.js
// TikTok-native Template #1
// Returns an object so server.js uses textfile=... and renders real line breaks.

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

//function estimateFontSizeByLongestLine(wrappedText) {
//  const lines = wrappedText.split("\n");
//  const longest = lines.reduce((m, s) => Math.max(m, s.length), 0);

  // New curve for TikTok-style captions (bigger overall)
  // longest ~18–22 => ~78–70
  // longest ~26–30 => ~66–60
 // const size = Math.round(92 - (longest * 1.05));
//    const size = Math.round(84 - (longest * 0.95));

   // if the longest line is *very* short, cap it harder
//   if (longest <= 20) size = Math.min(size, 66);

  // Don’t let it get tiny
//    return clamp(size, 58,70);
//  return clamp(size, 58, 78);
//   return clamp(size,38,52);
//}


function estimateFontSizeByLongestLine(wrappedText) {
  const lines = wrappedText.split("\n");
  const longest = Math.max(...lines.map(l => l.length));
  const lineCount = lines.length;

  // Base size from line length
  let size = 92 - (longest * 1.05);

  // NEW: vertical density penalty
  if (lineCount >= 6) size -= 6;
  if (lineCount >= 7) size -= 8;

  return clamp(Math.round(size), 56, 76);
}




module.exports = function t11(vars = {}) {
  const productName = String(vars.productName || "").trim();

  // Base sentence (same as your examples)
  const raw =
    `Apparently if your TikTok account is old enough, ` +
    `you can get ${productName} on a huge discount... ` +
    `it’s only for today though`;

  // Wrap width target:
  // TikTok’s native wrap feels like ~24–26 chars per line at this size.
  // We bias slightly narrower so it matches your screenshots.
  let wrapped = wrapWords(raw, 24);

  // Extra “TikTok” vibe: if product name is long, nudge wrap narrower
  if (productName.length <= 12) wrapped = wrapWords(raw, 22);
  if (productName.length >= 18) wrapped = wrapWords(raw, 22);
  if (productName.length >= 26) wrapped = wrapWords(raw, 20);

  const fontSize = estimateFontSizeByLongestLine(wrapped);

  return {
    text: wrapped,
    fontSize,
    yFrac: 0.14, // top safe area like your examples
  };
};
