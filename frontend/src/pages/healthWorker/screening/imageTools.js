export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateImageFile(file, maxBytes = MAX_IMAGE_BYTES) {
  if (!file || !IMAGE_TYPES.includes(file.type)) return "type";
  if (!file.size || file.size > maxBytes) return "size";
  return null;
}

export function assessImageMetrics({ width, height, brightness, sharpness }) {
  const warnings = [];
  if (Math.max(width, height) < 640 || Math.min(width, height) < 480) warnings.push("dimensions");
  if (brightness < 45) warnings.push("dark");
  if (brightness > 220) warnings.push("bright");
  if (sharpness < 55) warnings.push("blur");
  return {
    width,
    height,
    brightness,
    sharpness,
    warnings,
    status: warnings.length ? "check" : "good",
  };
}

export async function inspectImage(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image inspection is not supported by this browser.");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const grey = new Float32Array(width * height);
    let brightness = 0;
    for (let index = 0; index < grey.length; index += 1) {
      const offset = index * 4;
      const value = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
      grey[index] = value;
      brightness += value;
    }

    let sharpness = 0;
    let sharpnessSquared = 0;
    let samples = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const laplacian = grey[index - width] + grey[index - 1] - 4 * grey[index]
          + grey[index + 1] + grey[index + width];
        sharpness += laplacian;
        sharpnessSquared += laplacian * laplacian;
        samples += 1;
      }
    }
    const mean = samples ? sharpness / samples : 0;
    const variance = samples ? sharpnessSquared / samples - mean * mean : 0;
    return assessImageMetrics({
      width: bitmap.width,
      height: bitmap.height,
      brightness: brightness / grey.length,
      sharpness: variance,
    });
  } finally {
    bitmap.close();
  }
}

export async function captureVideoFrame(video, view) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("The camera preview is not ready yet.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Camera capture is not supported by this browser.");
  context.drawImage(video, 0, 0);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("The camera image could not be captured."));
    }, "image/jpeg", 0.92);
  });
  return new File([blob], `${view.toLowerCase()}-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
