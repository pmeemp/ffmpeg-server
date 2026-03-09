//two line (top + bottom)

const { baseDrawtext } = require("./text-style");

module.exports = function t4f({ textfileTop, textfileBottom }) {
  const top = baseDrawtext({
    textfile: textfileTop,
    x: "(w-text_w)/2",
    y: "h*0.12",
    fontsize: 70,
  });

  const bottom = baseDrawtext({
    textfile: textfileBottom,
    x: "(w-text_w)/2",
    y: "h*0.78",
    fontsize: 70,
  });

  return `${top},${bottom}`;
};

