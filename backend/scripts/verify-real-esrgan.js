// Checks the Real-ESRGAN setup with a real image (no database, no patient data):
//   node scripts/verify-real-esrgan.js [path-to-image]
// Writes the results to storage/ai-verification/ for viewing.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const realEsrgan = require("../services/ai/realEsrgan");

const DEFAULT_IMAGE = path.join(__dirname, "..", "..", "frontend", "public", "assets", "hero_banner.jpg");
const OUTPUT_DIR = path.join(__dirname, "..", "storage", "ai-verification");

async function main() {
  const imagePath = path.resolve(process.argv[2] || DEFAULT_IMAGE);
  console.log(`Model: ${realEsrgan.MODEL.name} (${realEsrgan.MODEL.checkpoint})`);

  await realEsrgan.verifyModelFiles();
  console.log("1. Model file checksums match model-source.json");

  const { session } = await realEsrgan.getSession();
  console.log(`2. ONNX Runtime loaded the model. Inputs: ${session.inputNames.join(", ")}  Outputs: ${session.outputNames.join(", ")}`);

  const original = fs.readFileSync(imagePath);
  const meta = await sharp(original).metadata();
  console.log(`3. Test image: ${imagePath} (${meta.width}x${meta.height})`);

  const result = await realEsrgan.enhance(original);
  console.log(`4. Enhanced ${result.inputWidth}x${result.inputHeight} -> ${result.width}x${result.height} with ${result.tiles} tiles in ${result.durationMs} ms`);

  // Plain resize of the same input, to compare against the network output
  const plain = await sharp(original).rotate()
    .resize({ width: result.inputWidth, height: result.inputHeight, fit: "fill" })
    .resize({ width: result.width, height: result.height, kernel: "cubic" })
    .removeAlpha().raw().toBuffer();
  const enhancedRaw = await sharp(result.data).removeAlpha().raw().toBuffer();

  // The model input, and the enhanced result reduced back to that size
  const input = await sharp(original).rotate()
    .resize({ width: result.inputWidth, height: result.inputHeight, fit: "fill" }).removeAlpha().raw().toBuffer();
  const reduced = await sharp(result.data)
    .resize({ width: result.inputWidth, height: result.inputHeight, fit: "fill", kernel: "cubic" }).removeAlpha().raw().toBuffer();

  const compare = (a, b) => {
    let difference = 0;
    let sumA = 0; let sumB = 0; let sumAB = 0; let sumA2 = 0; let sumB2 = 0;
    for (let index = 0; index < a.length; index += 1) {
      difference += Math.abs(a[index] - b[index]);
      sumA += a[index]; sumB += b[index]; sumAB += a[index] * b[index];
      sumA2 += a[index] ** 2; sumB2 += b[index] ** 2;
    }
    const n = a.length;
    return {
      meanDifference: difference / n,
      correlation: (n * sumAB - sumA * sumB) / Math.sqrt((n * sumA2 - sumA ** 2) * (n * sumB2 - sumB ** 2)),
    };
  };
  // Same picture: reduced back to the input size, the result must match the input
  const content = compare(input, reduced);
  // Real model work: at 4x size the result must differ from a plain resize
  const detail = compare(plain, enhancedRaw);
  const correlation = content.correlation;
  const meanDifference = detail.meanDifference;
  console.log(`5. Same picture check (reduced to input size): correlation ${content.correlation.toFixed(4)}, mean difference ${content.meanDifference.toFixed(2)} / 255`);
  console.log(`   New detail check (vs plain 4x resize): mean difference ${detail.meanDifference.toFixed(2)} / 255`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const base = path.parse(imagePath).name;
  fs.writeFileSync(path.join(OUTPUT_DIR, `${base}-enhanced-x4.jpg`), result.data);
  await sharp(plain, { raw: { width: result.width, height: result.height, channels: 3 } })
    .jpeg({ quality: 92 }).toFile(path.join(OUTPUT_DIR, `${base}-plain-resize-x4.jpg`));
  console.log(`6. Saved the enhanced and plain-resize images in ${OUTPUT_DIR}`);

  if (!(correlation > 0.95)) throw new Error("The enhanced image does not match the picture content");
  if (!(meanDifference > 0.5)) throw new Error("The model output is the same as a plain resize");
  console.log("Real-ESRGAN verification passed.");
}

main().catch((error) => {
  console.error(`Real-ESRGAN verification FAILED: ${error.message}`);
  process.exit(1);
});
