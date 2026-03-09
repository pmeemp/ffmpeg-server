// render-v2.js
// v2 renderer: Make sends sentence + params. Server formats text (wrap + font + placement).
// Routes:
//   GET  /render2/health
//   POST /render2  (multipart: video required, facevideo optional)
//
// Multipart field names expected:
//   Files: video (required), facevideo (optional)
//   Fields: text, motion, crop_mode, shake_level, start_offset, face_start, face_duration, output_name, mode (optional)
//   Future overrides (optional): text_style, text_placement
//
// Behavior:
//   - If NO facevideo: product-only render; text REQUIRED; outlined text (default).
//   - If facevideo: face-first THEN product concat; text OPTIONAL; white text if present (default).
//   - start_offset skips the START of the PRODUCT/base video (anti-violation variety).
//   - face_start / face_duration trims the face clip (window control).
//
// Notes:
//   - motion/crop/shake remain compatible with your schema.
//   - shake is implemented for first ~0.4s of product-only (optional).
//   - audio is stripped (-an) to avoid codec conflicts in Make pipelines.
//   - NEW: crop_mode now controls flip + crop presets:
//        none, none_flip, center, center_flip, tight, tight_flip, top, top_flip
//
// Patch (2026-02-10):
//   - Normalize “smart quotes” etc. in text to avoid drawtext failures (don’t -> don't)
//   - Force x264 encoding settings for SPEED + compatibility:
//       -c:v libx264 -preset veryfast -crf 23 -threads 0 -pix_fmt yuv420p
//   - Keep one-call convenience (still returns MP4 in the same response)

const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const { buildDrawtext } = require("./render-v2/text-engine");
const { buildTemplateByMode } = require("./templates_v2");

const app = express();

const UPLOADS_DIR = path.join(process.cwd(), "uploads_v2");
const OUTPUTS_DIR = path.join(process.cwd(), "outputs_v2");
const BADGE_CACHE_DIR = path.join(os.tmpdir(), "render2_badges");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
fs.mkdirSync(BADGE_CACHE_DIR, { recursive: true });

// ---- Multer config (accept mp4/mov + Make octet-stream) ----
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const okMime = new Set([
      "video/mp4",
      "video/quicktime", // .mov
      "application/octet-stream", // Make sometimes sends this
    ]);
    const ext = path.extname(file.originalname || "").toLowerCase();
    const okExt = new Set([".mp4", ".mov", ".m4v"]);
    if (okMime.has(file.mimetype) || okExt.has(ext)) return cb(null, true);
    return cb(new Error(`Unsupported file type: mime=${file.mimetype} ext=${ext}`));
  },
});

// Accept BOTH files: video (required) + facevideo (optional)
const cpUpload = upload.fields([
  { name: "video", maxCount: 1 },
  { name: "facevideo", maxCount: 1 },
]);

// ---- Helpers ----
function safeNumber(v, def) {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeText(s) {
  return String(s ?? "")
    // normalize “smart quotes” to plain quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // normalize weird whitespace
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function sanitizeOutputName(name) {
  // Keep it simple: only allow a-z A-Z 0-9 _ - . and force .mp4
  const base = String(name || "").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!cleaned) return `output_${Date.now()}.mp4`;

  const rawStem = cleaned.toLowerCase().endsWith(".mp4")
    ? cleaned.slice(0, -4)
    : cleaned;

  // Prevent filesystem/path length failures from very long automation payloads.
  const stem = (rawStem || `output_${Date.now()}`).slice(0, 120);
  return `${stem}.mp4`;
}

function parseMode(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  return raw.replace(/[^a-z0-9_-]/g, "");
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) return resolve(stderr);
      reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });
}

function roundedAlphaExpr(radius) {
  const r = Math.max(0, Number(radius) || 0);
  return `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),if(lte(hypot(${r}-(W/2-abs(W/2-X)),${r}-(H/2-abs(H/2-Y))),${r}),255,0),255)`;
}

function ensureRoundedBadgePng(badge) {
  const spec = {
    width: Number(badge.width),
    height: Number(badge.height),
    color: String(badge.color),
    radius: Number(badge.radius),
  };
  const key = crypto.createHash("md5").update(JSON.stringify(spec)).digest("hex");
  const out = path.join(BADGE_CACHE_DIR, `badge_${key}.png`);
  if (fs.existsSync(out)) return out;

  const alphaExpr = roundedAlphaExpr(spec.radius);
  const vf = `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpr}'`;
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${spec.color}:s=${spec.width}x${spec.height}:r=1`,
    "-vf",
    vf,
    "-frames:v",
    "1",
    out,
  ];
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to build rounded badge asset: ${result.stderr || "unknown ffmpeg error"}`);
  }
  return out;
}

function buildTripleBadgeOverlayFilter(baseLabel, badges) {
  const parts = [];
  let current = baseLabel;

  for (let i = 0; i < badges.length; i++) {
    const b = badges[i];
    const overOut = i === badges.length - 1 ? "[with_badges]" : `[vbg${i}]`;
    const inLabel = `[${i + 1}:v]`;
    parts.push(`${current}${inLabel}overlay=(W-w)/2:H*${b.yFrac}${overOut}`);
    current = overOut;
  }

  return {
    filter: parts.join(";"),
    outLabel: current,
  };
}

// ---- crop_mode helpers (flip baked in) ----
const CROP_MODES = new Set([
  "none",
  "none_flip",
  "center",
  "center_flip",
  "tight",
  "tight_flip",
  "top",
  "top_flip",
]);

function parseCropMode(raw) {
  let mode = String(raw || "none").trim().toLowerCase();
  if (!CROP_MODES.has(mode)) mode = "none";

  const doFlip = mode.endsWith("_flip");
  const base = doFlip ? mode.slice(0, -5) : mode; // remove "_flip"
  return { base, doFlip, mode };
}

/**
 * Returns a filter chain that normalizes to 1080x1920 and applies crop preset + optional flip.
 * IMPORTANT: This applies to the PRODUCT/base video portion.
 */
function buildCropPresetFilter(crop_mode) {
  const { base, doFlip } = parseCropMode(crop_mode);

  const parts = [];

  if (doFlip) parts.push("hflip");

  if (base === "tight") {
    // Punch-in ~10% (subtle)
    parts.push("scale=1180:2100:force_original_aspect_ratio=increase");
    parts.push("crop=1080:1920");
  } else if (base === "top") {
    // Top-biased framing (subtle)
    parts.push("scale=1080:1920:force_original_aspect_ratio=increase");
    // y bias ~6% of input height after scaling
    parts.push("crop=1080:1920:(iw-1080)/2:ih*0.06");
  } else {
    // none / center default (semantic difference, same transform today)
    parts.push("scale=1080:1920:force_original_aspect_ratio=increase");
    parts.push("crop=1080:1920");
  }

  parts.push("fps=30");
  parts.push("setsar=1");

  return parts.join(",");
}

// ---- Filter builders ----
// NOTE: motion is still placeholder here (kept compatible).
// shake is used for product-only if enabled.
// crop_mode now controls flip + crop preset.
function buildMotionAndCropFilter({ motion, crop_mode, shake_level, apply_shake }) {
  void motion; // placeholder for now

  const preset = buildCropPresetFilter(crop_mode);

  const shake = Number(shake_level) || 0;
  const doShake = !!apply_shake && shake > 0;

  if (!doShake) {
    // No shake: just preset
    return preset;
  }

  // If we do shake, we need extra pixels to jitter-crop without borders.
  // We'll scale a bit larger AFTER preset, then crop with jitter for first ~0.4s.
  const amp = shake === 1 ? 10 : 16;
  const secs = 0.4;

  // Add a tiny overscale before jitter crop (keeps borders hidden)
  const overscale = "scale=1120:1990:force_original_aspect_ratio=increase";

  // jitter crop expressions (time-gated)
  const xExpr =
    `if(lt(t\\,${secs})\\,` +
    `((iw-1080)/2)+((random(1)-0.5)*${amp})\\,` +
    `((iw-1080)/2))`;

  const yExpr =
    `if(lt(t\\,${secs})\\,` +
    `((ih-1920)/2)+((random(2)-0.5)*${amp})\\,` +
    `((ih-1920)/2))`;

  // Keep final output exact 1080x1920
  const jitterCrop = `crop=1080:1920:${xExpr}:${yExpr}`;

  // Chain: preset normalize -> overscale -> jitter crop -> (fps/setsar already okay but safe)
  return `${preset},${overscale},${jitterCrop},fps=30,setsar=1`;
}

// ---- Endpoints ----
app.get("/render2/health", (req, res) => res.json({ ok: true, service: "render-v2" }));

app.post("/render2", cpUpload, async (req, res) => {
  let basePath = null;
  let facePath = null;
  let outputPath = null;

  // text temp file(s) created by text-engine
  const textfilePaths = [];

  try {
    const videoFile = req.files?.video?.[0];
    const faceFile = req.files?.facevideo?.[0] || null;

    if (!videoFile) {
      return res.status(400).json({ error: "Missing required file field: video" });
    }

    basePath = videoFile.path;
    facePath = faceFile ? faceFile.path : null;

    // Normalize text (fixes “don’t” -> "don't" etc.)
    const text = normalizeText(req.body.text);

    const motion = safeNumber(req.body.motion, 0);
    const shake_level = safeNumber(req.body.shake_level, 0);
    const crop_mode = (req.body.crop_mode ?? "none").toString();

    // start_offset applies to PRODUCT/base video ONLY (skip X seconds)
    const start_offset = safeNumber(req.body.start_offset, 0);

    // face trim controls
    const face_start = safeNumber(req.body.face_start, 0);
    const face_duration = safeNumber(req.body.face_duration, 0); // 0 means "full remainder"

    const outputName = sanitizeOutputName(req.body.output_name);
    const mode = parseMode(req.body.mode);
    outputPath = path.join(
      OUTPUTS_DIR,
      `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${outputName}`
    );

    const isTripleMode = mode === "triple";
    const isFaceMode = !!facePath && !isTripleMode;

    // Future override fields (optional)
    const text_style = (req.body.text_style ?? "").toString(); // font_outline | font_white
    const text_placement = (req.body.text_placement ?? "").toString(); // top_safe | upper_mid | lower_center

    const motionFilter = buildMotionAndCropFilter({
      motion,
      crop_mode,
      shake_level,
      apply_shake: !isFaceMode, // shake only for product-only
    });

    const modeTemplate = buildTemplateByMode({
      mode,
      body: req.body,
      fallbackText: text,
      isFaceMode,
    });
    const isTripleTemplate = modeTemplate?.kind === "triple";
    const tripleMaxDurationSec = 15.2;
    const encodePreset = isTripleTemplate ? "ultrafast" : "veryfast";
    const encodeCrf = isTripleTemplate ? "28" : "23";

    const shouldDrawText = modeTemplate
      ? modeTemplate.hasText
      : !(isFaceMode && text.trim() === "");

    // Rules:
    // - product-only requires text/template content
    // - face mode allows empty text (skip drawtext)
    if (!isFaceMode && !shouldDrawText) {
      return res
        .status(400)
        .json({ error: "text is required when facevideo is not provided (or supply triple lines for mode=triple)" });
    }

    // Optional mode hook for future template variants.
    // Current behavior remains the same when mode is missing or unknown.
    if (mode) {
      console.log("render2 mode:", mode);
      if (isTripleMode && facePath) {
        console.log("render2 mode=triple: ignoring facevideo and using product-only flow");
      }
    }

    let args;

    if (!isFaceMode) {
      // PRODUCT-ONLY — apply start_offset fast via -ss
      let vf = motionFilter;

      if (shouldDrawText) {
        if (modeTemplate) {
          textfilePaths.push(...modeTemplate.textfilePaths);
          vf = `${vf},${modeTemplate.filter}`;
        } else {
          // Build text filter (outlined default)
          const dt = buildDrawtext({
            text,
            isFaceMode: false,
            text_style: text_style || undefined,
            text_placement: text_placement || undefined,
          });
          textfilePaths.push(dt.textfilePath);
          vf = `${vf},${dt.filter}`;
        }
      }

      if (modeTemplate?.kind === "triple" && Array.isArray(modeTemplate.badges) && modeTemplate.badges.length) {
        const badges = modeTemplate.badges;
        const badgePngs = badges.map(ensureRoundedBadgePng);
        const fcParts = [`[0:v]${motionFilter}[base]`];
        const rounded = buildTripleBadgeOverlayFilter("[base]", badges);
        if (rounded.filter) fcParts.push(rounded.filter);
        fcParts.push(`${rounded.outLabel}${modeTemplate.filter}[vout]`);

        args = [
          "-y",
          "-ss",
          String(start_offset),
          "-i",
          basePath,
          ...badgePngs.flatMap((p) => [
            "-loop",
            "1",
            "-i",
            p,
          ]),
          "-filter_complex",
          fcParts.join(";"),
          "-map",
          "[vout]",
          "-an",

          // SPEED + compatibility
          "-c:v",
          "libx264",
          "-preset",
          encodePreset,
          "-crf",
          encodeCrf,
          "-threads",
          "0",
          "-pix_fmt",
          "yuv420p",

          "-t",
          String(tripleMaxDurationSec),

          "-movflags",
          "+faststart",
          outputPath,
        ];
      } else {
        args = [
          "-y",
          "-ss",
          String(start_offset),
          "-i",
          basePath,
          "-vf",
          vf,
          "-an",

          // SPEED + compatibility
          "-c:v",
          "libx264",
          "-preset",
          encodePreset,
          "-crf",
          encodeCrf,
          "-threads",
          "0",
          "-pix_fmt",
          "yuv420p",

          "-movflags",
          "+faststart",
          outputPath,
        ];
      }
    } else {
      // FACE MODE: concat face FIRST then product
      const parts = [];

      // PRODUCT chain (motion/crop always applied; optional trim for stable concat)
      let prodChain = `${motionFilter}`;
      if (start_offset > 0) prodChain += `,trim=start=${start_offset},setpts=PTS-STARTPTS`;
      else prodChain += `,setpts=PTS-STARTPTS`;
      parts.push(`[0:v]${prodChain}[prod]`);

      // FACE chain (normalize + optional trim)
      // (We do NOT apply crop_mode/flip to the face clip; keep it natural.)
      let faceChain =
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30";

      if (face_start > 0 && face_duration > 0) {
        faceChain += `,trim=start=${face_start}:duration=${face_duration},setpts=PTS-STARTPTS`;
      } else if (face_start > 0 && face_duration === 0) {
        faceChain += `,trim=start=${face_start},setpts=PTS-STARTPTS`;
      } else if (face_start === 0 && face_duration > 0) {
        faceChain += `,trim=duration=${face_duration},setpts=PTS-STARTPTS`;
      } else {
        faceChain += `,setpts=PTS-STARTPTS`;
      }
      parts.push(`[1:v]${faceChain}[face]`);

      // Concat face -> product
      parts.push(`[face][prod]concat=n=2:v=1:a=0[vcat]`);

      // Optional text overlay (white default)
      let finalOut = "[vcat]";
      if (shouldDrawText) {
        if (modeTemplate) {
          textfilePaths.push(...modeTemplate.textfilePaths);
          parts.push(`[vcat]${modeTemplate.filter}[vfinal]`);
        } else {
          const dt = buildDrawtext({
            text,
            isFaceMode: true,
            text_style: text_style || undefined,
            text_placement: text_placement || undefined,
          });
          textfilePaths.push(dt.textfilePath);
          parts.push(`[vcat]${dt.filter}[vfinal]`);
        }
        finalOut = "[vfinal]";
      }

      const filterComplex = parts.join(";");

      args = [
        "-y",
        "-i",
        basePath,
        "-i",
        facePath,
        "-filter_complex",
        filterComplex,
        "-map",
        finalOut,
        "-an",

        // SPEED + compatibility
        "-c:v",
        "libx264",
        "-preset",
        encodePreset,
        "-crf",
        encodeCrf,
        "-threads",
        "0",
        "-pix_fmt",
        "yuv420p",

        "-movflags",
        "+faststart",
        outputPath,
      ];
    }

    await runFfmpeg(args);

    // Return MP4 file
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`);

    return res.sendFile(outputPath, (err) => {
      // Cleanup uploaded temp files
      safeUnlink(basePath);
      safeUnlink(facePath);

      // Cleanup temp text file created by text-engine
      textfilePaths.forEach(safeUnlink);

      // Cleanup output after sending (comment out if you want to keep outputs)
      safeUnlink(outputPath);

      if (err) console.error("sendFile error:", err);
    });
  } catch (e) {
    console.error("render2 failed:", e?.message || e);

    // Cleanup temp files on error
    safeUnlink(basePath);
    safeUnlink(facePath);
    textfilePaths.forEach(safeUnlink);
    safeUnlink(outputPath);

    return res.status(500).json({ error: e.message || "Server error" });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`render-v2 listening on ${PORT}`);
});
