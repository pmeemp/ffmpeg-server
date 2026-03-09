const { buildTripleTemplate } = require("./triple_product");

function buildTemplateByMode({ mode, body, fallbackText, isFaceMode }) {
  if (mode === "triple") {
    return buildTripleTemplate({ body, fallbackText, isFaceMode });
  }
  return null;
}

module.exports = {
  buildTemplateByMode,
};
