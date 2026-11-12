jest.mock("sharp", () => jest.fn((buffer) => ({
  metadata: jest.fn(async () => buffer.toString() === "enhanced"
    ? { format: "jpeg", width: 3200, height: 2400, size: 12000 }
    : { format: "jpeg", width: 800, height: 600, size: 12000 }),
})));
jest.mock("../../services/privateImageStorage", () => ({
  objectExists: jest.fn(),
  downloadBuffer: jest.fn(),
  uploadBuffer: jest.fn(),
}));
jest.mock("../../utils/audit", () => ({ audit: jest.fn(async () => {}) }));
jest.mock("../../services/ai/realEsrgan", () => {
  class ModelUnavailableError extends Error {}
  return {
    MODEL: { name: "Real-ESRGAN", checkpoint: "real-esrgan-x4" },
    ModelUnavailableError,
    enhance: jest.fn(),
  };
});

const privateImageStorage = require("../../services/privateImageStorage");
const realEsrgan = require("../../services/ai/realEsrgan");
const { audit } = require("../../utils/audit");
const { enhancePhoto, enhanceImageBuffer } = require("../../services/imageEnhancementService");

const req = { user: { id: "specialist-1", role_name: "SPECIALIST" } };
const screening = { id: "screening-1", patient_id: "patient-1" };
const photo = { id: "photo-1", view: "FRONT_VIEW", private_key: "originals/screening-1/photo-1.jpg" };

beforeEach(() => {
  jest.clearAllMocks();
  privateImageStorage.objectExists.mockResolvedValue(false);
  privateImageStorage.downloadBuffer.mockResolvedValue(Buffer.from("original"));
  privateImageStorage.uploadBuffer.mockResolvedValue("enhanced/screening-1/photo-1.jpg");
  realEsrgan.enhance.mockResolvedValue({
    data: Buffer.from("enhanced"),
    width: 3200,
    height: 2400,
    inputWidth: 800,
    inputHeight: 600,
    tiles: 1,
    durationMs: 125,
  });
});

test("enhanceImageBuffer reuses Real-ESRGAN without touching private storage", async () => {
  const result = await enhanceImageBuffer(Buffer.from("original"));
  expect(result).toMatchObject({
    width: 3200,
    height: 2400,
    mimeType: "image/jpeg",
    model: "Real-ESRGAN",
  });
  expect(result.data.toString()).toBe("enhanced");
  expect(realEsrgan.enhance).toHaveBeenCalledWith(Buffer.from("original"));
  expect(privateImageStorage.uploadBuffer).not.toHaveBeenCalled();
  expect(privateImageStorage.objectExists).not.toHaveBeenCalled();
});

test("stores real ESRGAN output separately and preserves the original object", async () => {
  privateImageStorage.downloadBuffer
    .mockResolvedValueOnce(Buffer.from("original"))
    .mockResolvedValueOnce(Buffer.from("enhanced"));
  const result = await enhancePhoto(req, screening, photo);

  expect(privateImageStorage.downloadBuffer).toHaveBeenNthCalledWith(1, photo.private_key);
  expect(privateImageStorage.downloadBuffer).toHaveBeenNthCalledWith(
    2,
    "enhanced/screening-1/photo-1.jpg"
  );
  expect(realEsrgan.enhance).toHaveBeenCalledWith(Buffer.from("original"));
  expect(privateImageStorage.uploadBuffer).toHaveBeenCalledWith(
    "enhanced/screening-1/photo-1.jpg",
    Buffer.from("enhanced"),
    "image/jpeg",
    { upsert: false }
  );
  expect(privateImageStorage.uploadBuffer.mock.calls[0][0]).not.toBe(photo.private_key);
  expect(result).toMatchObject({
    photo_id: "photo-1",
    width: 3200,
    height: 2400,
    model: "Real-ESRGAN",
    already_enhanced: false,
  });
  expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
    event: "PHOTO_AI_ENHANCED",
    patientId: "patient-1",
  }));
});

test("returns the existing enhanced image without overwriting it", async () => {
  privateImageStorage.objectExists.mockResolvedValue(true);

  const result = await enhancePhoto(req, screening, photo);

  expect(result).toMatchObject({ already_enhanced: true, width: 800, height: 600 });
  expect(privateImageStorage.downloadBuffer).toHaveBeenCalledWith("enhanced/screening-1/photo-1.jpg");
  expect(privateImageStorage.uploadBuffer).not.toHaveBeenCalled();
  expect(realEsrgan.enhance).not.toHaveBeenCalled();
});

test("records an explicit failed enhancement without writing an output", async () => {
  realEsrgan.enhance.mockRejectedValue(new Error("model failure"));

  await expect(enhancePhoto(req, screening, photo))
    .rejects.toMatchObject({ status: 502, code: "PHOTO_ENHANCEMENT_MODEL_FAILED" });

  expect(privateImageStorage.uploadBuffer).not.toHaveBeenCalled();
  expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
    event: "PHOTO_AI_ENHANCEMENT_FAILED",
    outcome: "ERROR",
    patientId: "patient-1",
  }));
});

test("reports the exact stage when private upload fails and does not report success", async () => {
  privateImageStorage.downloadBuffer.mockResolvedValueOnce(Buffer.from("original"));
  privateImageStorage.uploadBuffer.mockRejectedValue(
    Object.assign(new Error("storage unavailable"), { code: "IMAGE_STORAGE_UPLOAD_FAILED" })
  );

  await expect(enhancePhoto(req, screening, photo))
    .rejects.toMatchObject({ status: 503, code: "PHOTO_ENHANCEMENT_UPLOAD_FAILED" });

  expect(audit).toHaveBeenCalledWith(req, expect.objectContaining({
    event: "PHOTO_AI_ENHANCEMENT_FAILED",
    outcome: "ERROR",
    metadata: expect.objectContaining({
      failure_stage: "STORAGE_UPLOAD",
      enhanced_object_key: "enhanced/screening-1/photo-1.jpg",
    }),
  }));
  expect(audit).not.toHaveBeenCalledWith(req, expect.objectContaining({
    event: "PHOTO_AI_ENHANCED",
  }));
});

test("reports a storage verification failure when upload cannot be read back", async () => {
  privateImageStorage.downloadBuffer
    .mockResolvedValueOnce(Buffer.from("original"))
    .mockRejectedValueOnce(
      Object.assign(new Error("storage unavailable"), { code: "IMAGE_STORAGE_DOWNLOAD_FAILED" })
    );

  await expect(enhancePhoto(req, screening, photo))
    .rejects.toMatchObject({ status: 503, code: "PHOTO_ENHANCEMENT_VERIFY_FAILED" });
  expect(privateImageStorage.uploadBuffer).toHaveBeenCalled();
});
