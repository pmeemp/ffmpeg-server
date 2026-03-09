const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");

function probeVideo(filePath) {
  const cmd =
    `ffprobe -v error -select_streams v:0 ` +
    `-show_entries stream=width,height,r_frame_rate ` +
    `-of json "${filePath}"`;

  const raw = execSync(cmd, { encoding: "utf8" });
  const json = JSON.parse(raw);
  const stream = json.streams?.[0] || {};

  const w = Number(stream.width);
  const h = Number(stream.height);

  // r_frame_rate looks like "30/1"
  const [num, den] = String(stream.r_frame_rate || "30/1").split("/");
  const fps = (Number(num) || 30) / (Number(den) || 1);

  return { w, h, fps };
}




const getTemplate = require("./templates");

const app = express();
//const upload = multer({ dest: "uploads/" });

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB (adjust)
  },
  fileFilter: (req, file, cb) => {
    const okMime = new Set(["video/mp4", "video/quicktime"]);
    const ext = path.extname(file.originalname || "").toLowerCase();
    const okExt = new Set([".mp4", ".mov"]);

    if (okMime.has(file.mimetype) || okExt.has(ext)) return cb(null, true);
    return cb(new Error("Only .mp4 or .mov accepted"));
  },
});


const FONT = "/root/ffmpeg-server/fonts/TikTokSans_28pt-Medium.ttf";

// Accept ANY fields so Make.com can't trigger MulterError: Unexpected field
const uploadAny = upload.any();

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function sanitizeOutputName(raw) {
  let name = String(raw || `output_${Date.now()}.mp4`);

  // Remove hidden whitespace/newlines that break ffmpeg output paths
  name = name.replace(/[\r\n\t]/g, "").trim();

  // Prevent directory traversal / weird paths
  name = path.basename(name);

  // Make filename URL/FS safe for you + Make + Dropbox
  name = name.replace(/\s+/g, "_");

  // Force .mp4
  if (!name.toLowerCase().endsWith(".mp4")) name += ".mp4";

  return name;
}

app.post("/render", uploadAny, (req, res) => {
  let inputPath = null;
  let outputPath = null;
  let textPath = null;

  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .send("No file uploaded. Send multipart/form-data with a file field named 'file'.");
    }

    // Prefer fieldname "file" if present, else first file
    const chosen = req.files.find((f) => f.fieldname === "file") || req.files[0];
    inputPath = chosen.path;

    // Text fields
    const templateId = String(req.body.template_id || "t1").toLowerCase();
    const flip = String(req.body.flip || "false").toLowerCase() === "true";
    const productName = String(req.body.product_name || "");

    const outputName = sanitizeOutputName(req.body.output_name);
    outputPath = path.join(process.cwd(), outputName);

    // Debug (helps you see what Make is sending)
    console.log("templateId:", templateId, "flip:", flip, "productName:", productName);
    console.log("outputName:", outputName);

    // Build filter string
    let filters = "";
    let t2ZoomFilter = "";
    if (flip) filters += "hflip,";

    // Subtle zoom for t2 only (first 3s)
    if (templateId === "t2") {

      const { w, h, fps } = probeVideo(inputPath);

      const seconds = 3;
      const frames = Math.max(1, Math.round(fps * seconds));
      const endZoom = 1.13; // ultra subtle
      const step = ((endZoom - 1.0) / frames).toFixed(6); // per-frame increment

     // filters += `zoompan=z='if(lte(on,${frames}),1+${step}*on,${endZoom})':d=1:s=${w}x${h},setsar=1,`;
     t2Zoomfilter = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='if(lte(on,${frames}),1+${step}*on,${endZoom})':d=1:fps=30:s=1080x1920,setsar=1,`
     //add micro shake
    // t2Zoomfilter = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='if(lte(on,${frames}),1+${step}*on,${endZoom})':x='iw/2-(iw/zoom/2)+sin(on*0.23)*3':y='ih/2-(ih/zoom/2)+cos(on*0.19)*2':d=1:fps=30:s=1080x1920,setsar=1,`


    }
   filters += t2ZoomFilter;

    const tpl = getTemplate(templateId, { productName });

    // If template returns a raw filter string, just append it
    if (typeof tpl === "string") {
      filters += tpl;
    } else {
      // Template returns { text, fontSize, yFrac } -> use textfile (best for newlines)
      const textObj = tpl || {};
      const text = String(textObj.text || "");
      const fontSize = Number(textObj.fontSize || 74);
      const yFrac = Number(textObj.yFrac || 0.12);

      // Write real newlines to a temp file
      textPath = path.join(process.cwd(), "uploads", `text_${Date.now()}.txt`);
      fs.writeFileSync(textPath, text, "utf8");

const drawtext = [
  `drawtext=fontfile='${FONT}'`,
  `textfile='${textPath}'`,
  "reload=0",
  "fontcolor=white",
//  `fontsize=min(${fontSize}\\,h*0.075)`,
`fontsize=${fontSize}`,
 "line_spacing=-5",
  "text_align=center",
  "borderw=5",
  "bordercolor=black",
  "x=(w-text_w)/2",
  `y=h*${yFrac}`,
].join(":");


      filters += drawtext;
    }

    console.log("filters:", filters);

//mute for certain templates
//if (templateId === "t2") {
//  args.push("-an");
//}


    // Spawn ffmpeg safely (no shell quoting problems)
    // -an mutes audio
  //  const args = ["-y", "-i", inputPath, "-vf", filters, "-an", outputPath];
   const args = [
  "-y",
  "-hide_banner",
  "-loglevel", "error",     // set to "info" while debugging

  "-i", inputPath,

  // Helps with VFR inputs (common in .mov / iPhone)
  "-r", "30",

  // your existing filter chain
  "-vf", filters,

  // output video: consistent, faster encode
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "23",
  "-pix_fmt", "yuv420p",

  // audio: keep audio (or use -an to remove it)
//  "-c:a", "aac",
 // "-b:a", "128k",

"-an",

  outputPath,
];


    const ff = spawn("ffmpeg", args);

    let stderr = "";
    ff.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ff.on("close", (code) => {
      if (code !== 0) {
        console.error("FFmpeg failed. code=", code);
        console.error("STDERR:", stderr);

        // Cleanup
        safeUnlink(inputPath);
        safeUnlink(textPath);
        safeUnlink(outputPath);

        return res.status(500).send(`FFmpeg error: ${stderr || "Unknown FFmpeg error"}`);
      }

      // Send MP4 back
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(outputPath)}"`);

      res.sendFile(outputPath, (sendErr) => {
        // Cleanup regardless
        safeUnlink(inputPath);
        safeUnlink(textPath);
        safeUnlink(outputPath);

        if (sendErr) console.error("sendFile error:", sendErr);
      });
    });
  } catch (e) {
    console.error("Server error:", e);

    // Cleanup on crash
    safeUnlink(inputPath);
    safeUnlink(textPath);
    safeUnlink(outputPath);

    return res.status(500).send(`Server error: ${e.message}`);
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("FFmpeg server running on port 3000");
});
