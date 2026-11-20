import { downsampleBuffer, encodeWav, mergeFloat32 } from "./wavEncoder";

describe("wavEncoder", () => {
  test("merges float chunks", () => {
    const merged = mergeFloat32([
      new Float32Array([0.1, 0.2]),
      new Float32Array([0.3]),
    ]);
    expect(merged.length).toBe(3);
    expect(merged[0]).toBeCloseTo(0.1);
    expect(merged[1]).toBeCloseTo(0.2);
    expect(merged[2]).toBeCloseTo(0.3);
  });

  test("downsample copies even when rates match", () => {
    const source = new Float32Array([0.5, -0.5]);
    const copy = downsampleBuffer(source, 16000, 16000);
    expect(copy).not.toBe(source);
    expect(Array.from(copy)).toEqual([0.5, -0.5]);
  });

  test("encodes a valid WAV header", () => {
    const samples = new Float32Array(16);
    const wav = encodeWav(samples, 16000);
    const view = new DataView(wav);
    const tag = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    expect(tag).toBe("RIFF");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
  });
});
