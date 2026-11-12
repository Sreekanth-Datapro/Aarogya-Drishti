/**
 * @jest-environment ./tests/helpers/onnxEnvironment.js
 */
// Runs the real Real-ESRGAN ONNX model (no mock) on generated test images.
const sharp = require("sharp");
const realEsrgan = require("../../services/ai/realEsrgan");

jest.setTimeout(180000);

// A picture with edges, text and colours, made in the test (no patient data)
function testPicture(width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#f4d9c6"/>
    <circle cx="${width * 0.3}" cy="${height * 0.5}" r="${Math.min(width, height) * 0.25}" fill="#b3473a"/>
    <rect x="${width * 0.55}" y="${height * 0.2}" width="${width * 0.3}" height="${height * 0.5}" fill="#3a6fb3"/>
    <text x="8" y="${height - 10}" font-size="18" fill="#222">Aarogya 123</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

function correlation(a, b) {
  let sumA = 0; let sumB = 0; let sumAB = 0; let sumA2 = 0; let sumB2 = 0;
  for (let index = 0; index < a.length; index += 1) {
    sumA += a[index]; sumB += b[index]; sumAB += a[index] * b[index];
    sumA2 += a[index] ** 2; sumB2 += b[index] ** 2;
  }
  const n = a.length;
  return (n * sumAB - sumA * sumB) / Math.sqrt((n * sumA2 - sumA ** 2) * (n * sumB2 - sumB ** 2));
}

test.each([128, 129, 200, 240, 241, 384, 1000])("tiles cover every pixel of a side of %i once, without gaps", (length) => {
  const covered = new Array(length).fill(0);
  for (const start of realEsrgan.tileStarts(length)) {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start + 128).toBeLessThanOrEqual(length);
    const { from, to } = realEsrgan.tileCore(start, length);
    for (let index = from; index < to; index += 1) covered[index] += 1;
  }
  expect(covered.every((count) => count >= 1)).toBe(true);
});

test("the model files match the recorded checksums and load in ONNX Runtime", async () => {
  await expect(realEsrgan.verifyModelFiles()).resolves.toBeUndefined();
  const { session } = await realEsrgan.getSession();
  expect(session.inputNames).toEqual(["image"]);
  expect(session.outputNames).toEqual(["upscaled_image"]);
});

test("a picture larger than one tile is enhanced 4x and keeps its content", async () => {
  const input = await testPicture(300, 200);
  const result = await realEsrgan.enhance(input, { maxInputSide: 300 });
  expect(result).toMatchObject({ mimeType: "image/jpeg", inputWidth: 300, inputHeight: 200, width: 1200, height: 800 });
  expect(result.tiles).toBe(6);

  const meta = await sharp(result.data).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1200, 800]);
  const original = await sharp(input).raw().toBuffer();
  const reduced = await sharp(result.data).resize({ width: 300, height: 200, fit: "fill" }).raw().toBuffer();
  expect(correlation(original, reduced)).toBeGreaterThan(0.97);

  // Real model output, not a plain resize
  const plain = await sharp(input).resize({ width: 1200, height: 800, fit: "fill", kernel: "cubic" }).raw().toBuffer();
  const enhanced = await sharp(result.data).raw().toBuffer();
  let difference = 0;
  for (let index = 0; index < plain.length; index += 1) difference += Math.abs(plain[index] - enhanced[index]);
  expect(difference / plain.length).toBeGreaterThan(0.5);
});

test("a picture smaller than one tile and a large photo are both handled", async () => {
  const small = await realEsrgan.enhance(await testPicture(60, 45));
  expect([small.width, small.height, small.tiles]).toEqual([240, 180, 1]);

  const large = await realEsrgan.enhance(await testPicture(1600, 1200), { maxInputSide: 160 });
  expect([large.inputWidth, large.inputHeight, large.width, large.height]).toEqual([160, 120, 640, 480]);
});
