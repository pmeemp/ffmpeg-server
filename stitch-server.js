// stitch-server.js
const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

// Ensure uploads dir exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: accept mp4 + mov, plus Make sometimes sends octet-stream
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const okMime = new Set([
      "video/mp4",
      "video/quicktime", // .mov
      "application/octet-stream", // Make can send this
    ]);

    const ext = path.extname(file.originalname || "").toLowerCase();
    const okExt = new Set([".mp4", ".mov", ".m4v"]);

    if (okMime.has(file.mimetype) || okExt.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype} (${ext})`));
    }
  },
});

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function sanitizeOutputName(raw) {
  let name = String(raw || `stitched_${Date.now()}.mp4`);
  name = name.replace(/[\r\n\t]/g, "").trim();
  name = path.basename(name);
  name = name.replace(/\s+/g, "_");
  if (!name.toLowerCase().endsWith(".mp4")) name += ".mp4";
  return name;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`FFmpeg exited with code ${code}`);
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stderr);
    });
  });
}

// --- TEXT HELPERS ---
// Use drawtext with textfile=... so real line breaks work.
function writeTextFile(workdir, filename, text) {
  const safe = String(text || "").replace(/\r\n/g, "\n");
  const p = path.join(workdir, filename);
  fs.writeFileSync(p, safe, "utf8");
  return p;
}

// Import templates (t1f, t2f, t3f, t4f, f1, f2, f3)
const t1f = require("./templates/t1f");
const t2f = require("./templates/t2f");
const t3f = require("./templates/t3f");
const t4f = require("./templates/t4f");

const f1 = require("./templates/f1");
const f2 = require("./templates/f2");
const f3 = require("./templates/f3");

// Shared locked style for rendering f1/f2/f3 and custom
const { baseDrawtext } = require("./templates/text-style");

const TEMPLATES = {
  t1f,
  t2f,
  t3f,
  t4f,
  f1,
  f2,
  f3,
};

// Accept: null (no template), known templates, or "custom"
function resolveTemplate(templateId) {
  const raw = String(templateId || "").trim().toLowerCase();

  // Explicit "no template" signals
  if (
    !raw ||
    raw === "none" ||
    raw === "plain" || // plain == none
    raw === "no" ||
    raw === "0"
  ) {
    return null;
  }

  if (raw === "custom") return "custom";

  return TEMPLATES[raw] ? raw : null;
}

// Safe numeric parsing with fallback
function clampInt(val, min, max, fallback) {
  const n = Number.parseInt(String(val ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Safe x/y: allow a limited set of expressions only
function safeXY(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;

  // allow plain integers
  if (/^-?\d+$/.test(s)) return s;

  // allow a small whitelist (prevents arbitrary filter injection)
  const allowed = new Set([
    "(w-text_w)/2",
    "(h-text_h)/2",
    "h*0.10",
    "h*0.12",
    "h*0.78",
    "h*0.80",
    "w*0.05",
    "w*0.10",
    "w*0.50",
    "w*0.90",
    "h*0.50",
  ]);
  return allowed.has(s) ? s : fallback;
}

app.get("/", (req, res) => res.status(200).send("STITCH SERVER OK"));

/**
 * POST /stitch1
 * multipart/form-data:
 * - video1: file
 * - video2: file
 * - output_name: text (optional)
 * - reencode: "true"|"false" (optional, default true)
 *
 * Templates:
 * - template_id: "t1f"|"t2f"|"t3f"|"t4f"|"f1"|"f2"|"f3"|"custom" or "plain"/"none" (optional)
 *
 * Text fields:
 * - text: string (t1f/t2f/t3f/custom; also override for f1/f2/f3)
 * - text1, text2: string (t4f)
 *
 * f1/f2/f3 fields:
 * - productName or product_name (if no text override)
 *
 * Custom placement (template_id=custom):
 * - x: string (integer OR whitelisted expr). default "(w-text_w)/2"
 * - y: string (integer OR whitelisted expr). default "h*0.78"
 * - fontsize: integer 24..140. default 72
 *
 * MUTED OUTPUT: final output has NO audio track
 */
app.post(
  "/stitch1",
  upload.fields([
    { name: "video1", maxCount: 1 },
    { name: "video2", maxCount: 1 },
  ]),
  async (req, res) => {
    let input1 = null;
    let input2 = null;
    let outputPath = null;

    const tempFiles = [];
    const uid = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    try {
      const v1 = req.files?.video1?.[0];
      const v2 = req.files?.video2?.[0];
      if (!v1 || !v2) {
        return res
          .status(400)
          .send(
            "Missing files. Send multipart/form-data with file fields named 'video1' and 'video2'."
          );
      }

      input1 = v1.path;
      input2 = v2.path;

      const outputName = sanitizeOutputName(req.body.output_name);
      outputPath = path.join(UPLOADS_DIR, outputName);

      const abs1 = path.resolve(input1);
      const abs2 = path.resolve(input2);

      const templateId = resolveTemplate(req.body.template_id);
      const wantsTemplate = Boolean(templateId);

      // If you apply text overlay, you MUST re-encode (can't do -c copy).
      const reencode =
        wantsTemplate ||
        String(req.body.reencode || "true").toLowerCase() === "true";

      console.log("stitch1:", {
        reencode,
        outputName,
        templateId: templateId || "none",
        input1: v1.originalname,
        input2: v2.originalname,
      });

      let args;

      if (reencode) {
        // Concat FILTER (video-only) + optional text overlay
        const filters = [];

        // Normalize both clips to TikTok-friendly 1080x1920@30
        filters.push(
          "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[v0]"
        );
        filters.push(
          "[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[v1]"
        );
        filters.push("[v0][v1]concat=n=2:v=1:a=0[vcat]");

        // Optional text overlay
        if (wantsTemplate) {
          if (templateId === "t4f") {
            const text1 = String(req.body.text1 || "").trim();
            const text2 = String(req.body.text2 || "").trim();
            if (!text1 && !text2) {
              return res
                .status(400)
                .send("template_id=t4f requires text1 and/or text2.");
            }

            const tf1 = writeTextFile(UPLOADS_DIR, `txt_${uid}_1.txt`, text1);
            const tf2 = writeTextFile(UPLOADS_DIR, `txt_${uid}_2.txt`, text2);
            tempFiles.push(tf1, tf2);

            const draw = TEMPLATES.t4f({
              textfileTop: tf1,
              textfileBottom: tf2,
            });

            filters.push(`[vcat]${draw}[vout]`);
          } else if (templateId === "f1" || templateId === "f2" || templateId === "f3") {
            // f1/f2/f3: auto-generate caption from productName OR override via text
            const productName = String(
              req.body.productName || req.body.product_name || ""
            ).trim();
            const overrideText = String(req.body.text || "").trim();

            if (!overrideText && !productName) {
              return res
                .status(400)
                .send(`template_id=${templateId} requires productName (or provide text).`);
            }

            const out = TEMPLATES[templateId]({
              productName,
              text: overrideText || undefined,
            });

            const tf = writeTextFile(UPLOADS_DIR, `txt_${uid}.txt`, out.text);
            tempFiles.push(tf);

            const y = `h*${out.yFrac}`;
            const draw = baseDrawtext({
              textfile: tf,
              x: "(w-text_w)/2",
              y,
              fontsize: out.fontSize,
            });

            filters.push(`[vcat]${draw}[vout]`);
          } else if (templateId === "custom") {
            const text = String(req.body.text || "").trim();
            if (!text) {
              return res
                .status(400)
                .send("template_id=custom requires a non-empty 'text' field.");
            }

            const tf = writeTextFile(UPLOADS_DIR, `txt_${uid}.txt`, text);
            tempFiles.push(tf);

            // custom placement inputs (safe)
            const fontsize = clampInt(req.body.fontsize, 24, 140, 72);
            const x = safeXY(req.body.x, "(w-text_w)/2");
            const y = safeXY(req.body.y, "h*0.78");

            const draw = baseDrawtext({ textfile: tf, x, y, fontsize });
            filters.push(`[vcat]${draw}[vout]`);
          } else {
            // t1f/t2f/t3f
            const text = String(req.body.text || "").trim();
            if (!text) {
              return res
                .status(400)
                .send("template_id requires a non-empty 'text' field.");
            }

            const tf = writeTextFile(UPLOADS_DIR, `txt_${uid}.txt`, text);
            tempFiles.push(tf);

            const draw = TEMPLATES[templateId]({ textfile: tf });
            filters.push(`[vcat]${draw}[vout]`);
          }
        }

        const filterComplex = filters.join(";");

        args = [
          "-y",
          "-i",
          abs1,
          "-i",
          abs2,
          "-filter_complex",
          filterComplex,
          "-map",
          wantsTemplate ? "[vout]" : "[vcat]",
          "-an", // 🔇 muted output
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "22",
          "-movflags",
          "+faststart",
          outputPath,
        ];
      } else {
        // Fast copy path (no text overlays)
        const listPath = path.join(UPLOADS_DIR, `concat_${uid}.txt`);
        tempFiles.push(listPath);

        fs.writeFileSync(
          listPath,
          `file '${abs1.replace(/'/g, "'\\''")}'\nfile '${abs2.replace(
            /'/g,
            "'\\''"
          )}'\n`,
          "utf8"
        );

        args = [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-an",
          "-c:v",
          "copy",
          outputPath,
        ];
      }

      await runFfmpeg(args);

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${path.basename(outputPath)}"`
      );

      res.sendFile(outputPath, (sendErr) => {
        safeUnlink(input1);
        safeUnlink(input2);
        for (const p of tempFiles) safeUnlink(p);
        safeUnlink(outputPath);
        if (sendErr) console.error("sendFile error:", sendErr);
      });
    } catch (e) {
      console.error("stitch1 error:", e.stderr || e.message);

      safeUnlink(input1);
      safeUnlink(input2);
      for (const p of tempFiles) safeUnlink(p);
      safeUnlink(outputPath);

      return res
        .status(500)
        .send(
          `stitch1 failed: ${String(e.stderr || e.message || "").slice(0, 4000)}`
        );
    }
  }
);

// IMPORTANT: use a different port than your existing server
const PORT = 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Stitch server running on port ${PORT}`);
});
