// templates/t1.js
// templates/t1.js
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// IMPORTANT: do NOT escape "\" or you will break \n newlines
function esc(str) {
  return String(str)
    .replace(/:/g, "\\:")   // drawtext uses ":" separators
    .replace(/'/g, "\\'");  // quotes inside text
}

// Wrap product name to 1–2 lines max
function wrapProduct(name, maxCharsPerLine = 18) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { text: "this", lines: 1, chars: 4 };

  let line1 = "";
  let line2 = "";

  for (const w of words) {
    const attempt1 = (line1 ? `${line1} ${w}` : w);
    if (attempt1.length <= maxCharsPerLine && !line2) {
      line1 = attempt1;
    } else {
      line2 = (line2 ? `${line2} ${w}` : w);
    }
  }

  const text = line2 ? `${line1}\\n${line2}` : line1; // keep \n
  return { text, lines: line2 ? 2 : 1, chars: String(name || "").trim().length };
}

// Dynamic font size based on name length / line count
function computeFontSize({ chars, lines }) {
  let size = 58;
  if (lines === 2) size -= 4;
  if (chars >= 22) size -= 4;
  if (chars >= 30) size -= 4;
  if (chars >= 38) size -= 4;
  if (size < 44) size = 44;
  return size;
}

module.exports = function t1({ productName = "" } = {}) {
  const wrapped = wrapProduct(productName, 18);
  const fontSize = computeFontSize(wrapped);

  const text =
    "Apparently if your TikTok\\n" +
    "account is old enough,\\n" +
    "you can get " + esc(wrapped.text) + "\\n" +
    "on a huge discount...\\n" +
    "it\\'s only for today though";

  return [
    `drawtext=fontfile=${FONT_BOLD}`,
    `text='${text}'`,
    "fontcolor=white",
    `fontsize=min(${fontSize},h*0.048)`,
    "line_spacing=12",
    "borderw=7",
    "bordercolor=black",
    "box=1",
    "boxcolor=black@0.45",
    "boxborderw=18",
    "x=(w-text_w)/2",
    "y=h*0.12",
  ].join(":");
};
