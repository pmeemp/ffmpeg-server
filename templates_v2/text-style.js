const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const FONT_FILE =
  process.env.FONT_FILE ||
  "/root/ffmpeg-server/fonts/TikTokSans_28pt-Medium.ttf";

function writeTempTextFile(text, prefix = "render2_tpl") {
  const name = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.txt`;
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, String(text || "").replace(/\r\n/g, "\n").trim(), "utf8");
  return p;
}

function buildTextLayer({ text, yFrac, fontSize, style = "outline" }) {
  const textfilePath = writeTempTextFile(text, "render2_triple");
  const parts = [
    `drawtext=fontfile='${FONT_FILE}'`,
    `textfile='${textfilePath}'`,
    "reload=0",
    `fontsize=${fontSize}`,
    "text_align=center",
    "line_spacing=-10",
    "x=(w-text_w)/2",
    `y=h*${yFrac}`,
  ];

  if (style === "red_badge") {
    parts.push("fontcolor=white");
    parts.push("box=1");
    parts.push("boxcolor=#d62828");
    parts.push("boxborderw=20");
  } else if (style === "white_badge") {
    parts.push("fontcolor=black");
    parts.push("box=1");
    parts.push("boxcolor=white");
    parts.push("boxborderw=18");
  } else if (style === "black") {
    parts.push("fontcolor=black");
  } else if (style === "red_outline") {
    parts.push("fontcolor=white");
    parts.push("borderw=6");
    parts.push("bordercolor=#d62828");
  } else if (style === "black_outline") {
    parts.push("fontcolor=white");
    parts.push("borderw=6");
    parts.push("bordercolor=black");
  } else if (style === "white") {
    parts.push("fontcolor=white");
  } else if (style === "accent") {
    parts.push("fontcolor=#ffe066");
    parts.push("borderw=3");
    parts.push("bordercolor=black");
  } else {
    parts.push("fontcolor=white");
    parts.push("borderw=3");
    parts.push("bordercolor=black@0.92");
  }

  return {
    filter: parts.join(":"),
    textfilePath,
  };
}

module.exports = {
  buildTextLayer,
  FONT_FILE,
};
