const { buildTripleTemplate } = require("./triple_product");

function buildTemplateByMode({ mode, body, fallbackText, isFaceMode, tripleOverlayPath = null }) {
  if (mode === "triple") {
    return buildTripleTemplate({ body, fallbackText, isFaceMode, tripleOverlayPath });
  }
  return null;
}

module.exports = {
  buildTemplateByMode,
};
