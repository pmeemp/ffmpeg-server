// render-v2/text-engine.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const FONT_FILE =
  process.env.FONT_FILE ||
  "/root/ffmpeg-server/fonts/TikTokSans_28pt-Medium.ttf";

// --- helpers ---
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function wrapWords(text, maxChars) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

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
  const lines = String(wrappedText || "").split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;

  let size = 92 - longest * 1.05;

  // vertical density penalty (your proven logic)
  if (lineCount >= 6) size -= 6;
  if (lineCount >= 7) size -= 8;

  return clamp(Math.round(size), 56, 76);
}

// Placement mapping (locked defaults, with future override enums)
const PLACEMENTS = {
  top_safe: 0.14,
  upper_mid: 0.30,
  lower_center: 0.72,
};

function pickYFrac({ isFaceMode, text_placement }) {
  const raw = String(text_placement || "").trim().toLowerCase();
  if (raw && PLACEMENTS[raw] != null) return PLACEMENTS[raw];
  // defaults (locked)
  return isFaceMode ? 0.30 : 0.14;
}

// Style mapping (future override enums)
function pickStyle({ isFaceMode, text_style }) {
  const raw = String(text_style || "").trim().toLowerCase();
  if (raw === "font_outline") return "font_outline";
  if (raw === "font_white") return "font_white";
  // defaults (locked)
  return isFaceMode ? "font_white" : "font_outline";
}

function writeTempTextFile(text) {
  const tmpDir = os.tmpdir();
  const name = `render2_text_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}.txt`;
  const p = path.join(tmpDir, name);

  // Normalize CRLF -> LF, preserve intentional newlines
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  fs.writeFileSync(p, body, "utf8");
  return p;
}

/**
 * Build drawtext filter using textfile= (stable, newline-safe).
 * Make sends a sentence; server wraps + sizes + places.
 *
 * Inputs:
 *  - text (sentence)
 *  - isFaceMode (boolean)
 *  - text_style: font_outline | font_white (optional; future Make override)
 *  - text_placement: top_safe | upper_mid | lower_center (optional; future Make override)
 *
 * Output:
 *  - filter (string)
 *  - textfilePath (string) -> cleanup after ffmpeg
 *  - meta { wrapped, fontSize, yFrac, style }
 */
function buildDrawtext({ text, isFaceMode, text_style, text_placement }) {
  const style = pickStyle({ isFaceMode, text_style });
  const yFrac = pickYFrac({ isFaceMode, text_placement });

  const raw = String(text || "").trim();

  // Wrapping rule:
  // A) always 24 chars (simple)
  // const wrapped = wrapWords(raw, 24);

  // B) dynamic wrap width based on sentence length (safe + no extra inputs needed)
  let maxChars = 24;
  const len = raw.length;
  if (len >= 90) maxChars = 20;
  else if (len >= 70) maxChars = 22;
  else maxChars = 24;

  const wrapped = wrapWords(raw, maxChars);
  const fontSize = estimateFontSizeByLongestLine(wrapped);

  const textfilePath = writeTempTextFile(wrapped);

  // Base drawtext (locked)
  const parts = [
    `drawtext=fontfile='${FONT_FILE}'`,
    `textfile='${textfilePath}'`,
    "reload=0",
    "fontcolor=white",
    `fontsize=${fontSize}`,
    "text_align=center",
    "line_spacing=-5",
    "x=(w-text_w)/2",
    `y=h*${yFrac}`,
  ];

  if (style === "font_outline") {
    // v1 style (locked)
    parts.push("borderw=5");
    parts.push("bordercolor=black");
  }

  return {
    filter: parts.join(":"),
    textfilePath,
    meta: { wrapped, fontSize, yFrac, style },
  };
}

module.exports = {
  buildDrawtext,
  PLACEMENTS,
  FONT_FILE,
};
