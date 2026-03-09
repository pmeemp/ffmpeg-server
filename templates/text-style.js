// templates/text-style.js
const path = require("path");

const FONT_FILE =
  process.env.FONT_FILE ||
  "/root/ffmpeg-server/fonts/TikTokSans_28pt-Medium.ttf";

/**
 * Shared drawtext style (LOCKED).
 * Change formatting here once → affects all templates.
 */
function baseDrawtext({ textfile, x, y, fontsize = 84, box = 1 }) {
  return [
    `drawtext=fontfile='${FONT_FILE}'`,
    `textfile='${textfile}'`,
    `reload=1`,
    `fontsize=${fontsize}`,
    `fontcolor=white`,
   // `borderw=6`,
   // `bordercolor=black@0.65`,
  //  box ? `box=1:boxcolor=black@0.25:boxborderw=18` : `box=0`,
    "text_align=center",
    `x=${x}`,
    `y=${y}`,
    `line_spacing=-4`,
  ].join(":");
}

module.exports = { baseDrawtext, FONT_FILE };
