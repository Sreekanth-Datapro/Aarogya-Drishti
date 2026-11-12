const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const config = require("../../config/config");

// ==========================================
// REAL-ESRGAN IMAGE ENHANCEMENT (ONNX Runtime, CPU)
// Pretrained Real-ESRGAN General x4v3 network, see models/real-esrgan/model-source.json.
// It makes a photo 4x larger and clearer for viewing. It does not detect,
// classify or diagnose anything, and it never changes the original photo.
// ==========================================

const MODEL_DIR = path.join(__dirname, "..", "..", "models", "real-esrgan");
const SOURCE = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, "model-source.json"), "utf8"));
const TILE = SOURCE.input.shape[2];
const SCALE = SOURCE.scale;
const OUT_TILE = TILE * SCALE;
// Neighbouring tiles overlap so no seams are visible where they meet
const OVERLAP = 8;

class ModelUnavailableError extends Error {}

let sessionPromise = null;
let queue = Promise.resolve();

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

// The model files must be exactly the downloaded ones (no damaged or swapped file)
async function verifyModelFiles() {
  for (const [file, expected] of Object.entries(SOURCE.files)) {
    const filePath = path.join(MODEL_DIR, file);
    if (!fs.existsSync(filePath)) throw new ModelUnavailableError(`Model file missing: ${file}`);
    const actual = await sha256File(filePath);
    if (actual !== expected) throw new ModelUnavailableError(`Model file checksum does not match: ${file}`);
  }
}

// Loads the model once and reuses it for every request
function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      await verifyModelFiles();
      const ort = require("onnxruntime-node");
      const session = await ort.InferenceSession.create(path.join(MODEL_DIR, SOURCE.model_file), {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
      });
      if (!session.inputNames.includes(SOURCE.input.name) || !session.outputNames.includes(SOURCE.output.name)) {
        throw new ModelUnavailableError("The model inputs or outputs are not the expected ones");
      }
      return { ort, session };
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

// Start positions of the tiles along one side of the image
function tileStarts(length) {
  if (length <= TILE) return [0];
  const step = TILE - 2 * OVERLAP;
  const starts = [];
  for (let start = 0; start + TILE < length; start += step) starts.push(start);
  starts.push(length - TILE);
  return starts;
}

// Part of a tile that is written to the result (the overlapping edges are skipped)
function tileCore(start, length) {
  return {
    from: start === 0 ? 0 : start + OVERLAP,
    to: start + TILE >= length ? length : start + TILE - OVERLAP,
  };
}

async function runTiles(rgb, width, height) {
  const { ort, session } = await getSession();
  const outWidth = width * SCALE;
  const output = Buffer.alloc(outWidth * height * SCALE * 3);
  const input = new Float32Array(3 * TILE * TILE);
  const plane = TILE * TILE;
  const outPlane = OUT_TILE * OUT_TILE;
  let tiles = 0;

  for (const top of tileStarts(height)) {
    for (const left of tileStarts(width)) {
      // RGB bytes -> model input: 3 colour planes of 0..1 values (NCHW)
      for (let y = 0; y < TILE; y += 1) {
        for (let x = 0; x < TILE; x += 1) {
          const source = ((top + y) * width + left + x) * 3;
          const target = y * TILE + x;
          input[target] = rgb[source] / 255;
          input[plane + target] = rgb[source + 1] / 255;
          input[2 * plane + target] = rgb[source + 2] / 255;
        }
      }
      const result = await session.run({ [SOURCE.input.name]: new ort.Tensor("float32", input, SOURCE.input.shape) });
      const values = result[SOURCE.output.name].data;
      tiles += 1;

      const rows = tileCore(top, height);
      const columns = tileCore(left, width);
      for (let oy = rows.from * SCALE; oy < rows.to * SCALE; oy += 1) {
        const localY = oy - top * SCALE;
        for (let ox = columns.from * SCALE; ox < columns.to * SCALE; ox += 1) {
          const local = localY * OUT_TILE + (ox - left * SCALE);
          const target = (oy * outWidth + ox) * 3;
          for (let channel = 0; channel < 3; channel += 1) {
            const value = values[channel * outPlane + local];
            output[target + channel] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
          }
        }
      }
    }
  }
  return { output, tiles };
}

// Enhances one image. Large photos are first reduced to maxInputSide so the
// 4x result stays a reasonable size and the CPU work stays short.
async function enhance(imageBuffer, { maxInputSide = config.realEsrgan.maxInputSide } = {}) {
  const started = Date.now();
  const prepared = await sharp(imageBuffer)
    .rotate()
    .resize({ width: maxInputSide, height: maxInputSide, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = prepared.info;

  // Images smaller than one tile are padded by repeating their edge pixels
  const padRight = Math.max(0, TILE - width);
  const padBottom = Math.max(0, TILE - height);
  let rgb = prepared.data;
  if (padRight || padBottom) {
    rgb = await sharp(prepared.data, { raw: { width, height, channels: 3 } })
      .extend({ right: padRight, bottom: padBottom, extendWith: "copy" })
      .raw()
      .toBuffer();
  }
  const paddedWidth = width + padRight;
  const paddedHeight = height + padBottom;

  const { output, tiles } = await runTiles(rgb, paddedWidth, paddedHeight);
  const data = await sharp(output, { raw: { width: paddedWidth * SCALE, height: paddedHeight * SCALE, channels: 3 } })
    .extract({ left: 0, top: 0, width: width * SCALE, height: height * SCALE })
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    data,
    mimeType: "image/jpeg",
    width: width * SCALE,
    height: height * SCALE,
    inputWidth: width,
    inputHeight: height,
    tiles,
    durationMs: Date.now() - started,
    model: SOURCE.name,
  };
}

// One enhancement at a time, so several requests cannot overload the server CPU
function enhanceQueued(imageBuffer, options) {
  const run = queue.then(() => enhance(imageBuffer, options));
  queue = run.catch(() => {});
  return run;
}

module.exports = {
  MODEL: { name: SOURCE.name, checkpoint: SOURCE.checkpoint, publisher: SOURCE.publisher, scale: SCALE },
  ModelUnavailableError,
  verifyModelFiles,
  getSession,
  enhance: enhanceQueued,
  tileStarts,
  tileCore,
};
