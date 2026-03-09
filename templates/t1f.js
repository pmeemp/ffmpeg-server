//top headline

const { baseDrawtext } = require("./text-style");

module.exports = function t1f({ textfile }) {
  return baseDrawtext({
    textfile,
    x: "(w-text_w)/2",
    y: "h*0.10",
    fontsize: 74,
  });
};
