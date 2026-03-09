//bottom caption
const { baseDrawtext } = require("./text-style");

module.exports = function t3f({ textfile }) {
  return baseDrawtext({
    textfile,
    x: "(w-text_w)/2",
    y: "h*0.78",
    fontsize: 70,
  });
};

