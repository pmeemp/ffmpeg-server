//center headline
const { baseDrawtext } = require("./text-style");

module.exports = function t2f({ textfile }) {
  return baseDrawtext({
    textfile,
    x: "(w-text_w)/2",
    y: "(h-text_h)/2",
    fontsize: 78,
  });
};
