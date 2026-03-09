const { buildTextLayer } = require("./text-style");

function pick(body, ...keys) {
  for (const key of keys) {
    const value = String(body?.[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function splitFallbackText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n|\|/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.slice(0, 3);
}

function resolveTripleLines(body, fallbackText) {
  const line1 = pick(body, "triple_line1", "line1", "text1") || "TRIPLE DISCOUNT";
  const line2 = pick(body, "triple_line2", "line2", "text2") || "ENDS TONIGHT";
  const productName = pick(
    body,
    "product_name",
    "productName",
    "triple_line3",
    "line3",
    "text3"
  );

  if (line1 || productName) return [line1, line2, productName];

  const fallback = splitFallbackText(fallbackText);
  return [fallback[0] || "TRIPLE DISCOUNT", fallback[1] || "ENDS TONIGHT", fallback[2] || ""];
}

function buildTripleTemplate({ body, fallbackText, isFaceMode, tripleOverlayPath = null }) {
  const layers = [];
  const hasOverlay = !!tripleOverlayPath;

  // Triple stack in fixed upper area.
  const yTop = isFaceMode ? 0.08 : 0.08;
  const yMid = isFaceMode ? 0.128 : 0.128;
  const yBottom = hasOverlay ? 0.245 : (isFaceMode ? 0.172 : 0.172);

  if (hasOverlay) {
    // Overlay mode is intentionally separate: ignore legacy triple lines entirely.
    const productName = pick(body, "product_name", "productName");
    if (productName) {
      layers.push(buildTextLayer({ text: productName, yFrac: yBottom, fontSize: 48, style: "outline" }));
    }
  } else {
    const [line1, line2, line3] = resolveTripleLines(body, fallbackText);
    if (line1) {
      layers.push(buildTextLayer({ text: line1, yFrac: yTop, fontSize: 72, style: "red_outline" }));
    }
    if (line2) {
      layers.push(buildTextLayer({ text: line2, yFrac: yMid, fontSize: 62, style: "black_outline" }));
    }
    if (line3) {
      layers.push(buildTextLayer({ text: line3, yFrac: yBottom, fontSize: 44, style: "white" }));
    }
  }

  return {
    kind: "triple",
    hasText: layers.length > 0 || hasOverlay,
    filter: layers.map((l) => l.filter).join(","),
    textfilePaths: layers.map((l) => l.textfilePath),
    badges: [],
    tripleOverlayPath: hasOverlay ? tripleOverlayPath : null,
    tripleOverlayYFrac: 0.075,
  };
}

module.exports = {
  buildTripleTemplate,
};
