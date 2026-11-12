const HttpError = require("../../utils/httpError");

jest.mock("../../config/config", () => ({
  aiPipeline: {
    url: "http://127.0.0.1:8010",
    authToken: "x".repeat(32),
    analysisTimeoutMs: 5000,
  },
}));

const service = require("../../services/imageCategoryValidationService");

function jpegStub(size = 100) {
  return {
    buffer: Buffer.alloc(size, 1),
    size,
    mimetype: "image/jpeg",
    originalname: "photo.jpg",
  };
}

describe("imageCategoryValidationService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("normalizes oral aliases to MOUTH", () => {
    expect(service.normalizeCategory("oral")).toBe("MOUTH");
    expect(service.normalizeCategory("TONGUE")).toBe("TONGUE");
    expect(service.normalizeCategory("skin")).toBe("SKIN");
    expect(() => service.normalizeCategory("EYE")).toThrow(HttpError);
  });

  test("local gate rejects unsupported and oversized files", () => {
    expect(service.localFileGate({ buffer: Buffer.from("x"), size: 1, mimetype: "image/gif" }).status)
      .toBe("CORRUPTED_IMAGE");
    expect(service.localFileGate({
      buffer: Buffer.alloc(10),
      size: 10 * 1024 * 1024 + 1,
      mimetype: "image/jpeg",
    }).status).toBe("CORRUPTED_IMAGE");
  });

  test("correct category images are accepted as VALID", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        validation: {
          status: "VALID",
          expected_category: "MOUTH",
          detected_category: "MOUTH",
          confidence: 90,
          reason: "Oral cavity visible",
        },
      }),
    }));
    const result = await service.validateScreeningImage(jpegStub(), "MOUTH");
    expect(result.status).toBe("VALID");
    expect(() => service.assertUploadAllowed(result)).not.toThrow();
  });

  test.each([
    ["TONGUE", "MOUTH"],
    ["SKIN", "TONGUE"],
  ])("rejects %s image under %s category", async (detected, expected) => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        validation: {
          status: "INVALID_CATEGORY",
          expected_category: expected,
          detected_category: detected,
          confidence: 88,
          reason: `Selected ${expected}, appears ${detected}`,
        },
      }),
    }));
    const result = await service.validateScreeningImage(jpegStub(), expected);
    expect(result.status).toBe("INVALID_CATEGORY");
    expect(() => service.assertUploadAllowed(result)).toThrow(
      expect.objectContaining({ status: 422, code: "INVALID_CATEGORY" })
    );
  });

  test.each(["UNRELATED", "SELFIE"])("rejects unrelated / selfie-style detections", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        validation: {
          status: "INVALID_CATEGORY",
          expected_category: "SKIN",
          detected_category: "UNRELATED",
          confidence: 92,
          reason: "Unrelated subject",
        },
      }),
    }));
    const result = await service.validateScreeningImage(jpegStub(), "SKIN");
    expect(result.status).toBe("INVALID_CATEGORY");
  });

  test("maps poor quality and corrupted responses", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        validation: {
          status: "POOR_QUALITY",
          expected_category: "MOUTH",
          reason: "Image is too blurry",
        },
      }),
    }));
    const poor = await service.validateScreeningImage(jpegStub(), "MOUTH");
    expect(poor.status).toBe("POOR_QUALITY");
    expect(() => service.assertUploadAllowed(poor)).toThrow(
      expect.objectContaining({ code: "POOR_QUALITY" })
    );

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        validation: {
          status: "CORRUPTED_IMAGE",
          expected_category: "MOUTH",
          reason: "Corrupted image data",
        },
      }),
    }));
    const corrupted = await service.validateScreeningImage(jpegStub(), "MOUTH");
    expect(corrupted.status).toBe("CORRUPTED_IMAGE");
  });

  test("uncertain NEEDS_REVIEW classification is never uploadable for screening", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        validation: {
          status: "NEEDS_REVIEW",
          expected_category: "TONGUE",
          detected_category: "UNCERTAIN",
          confidence: 40,
          reason: "Uncertain category match",
          upload_allowed: true,
        },
      }),
    }));
    const result = await service.validateScreeningImage(jpegStub(), "TONGUE");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(service.canUploadValidation(result)).toBe(false);
    expect(() => service.assertUploadAllowed(result)).toThrow(
      expect.objectContaining({ status: 422, code: "NEEDS_REVIEW" })
    );
  });

  test("pipeline outage fails closed and blocks upload", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("connection refused");
    });
    const result = await service.validateScreeningImage(jpegStub(), "SKIN");
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.upload_allowed).toBe(false);
    expect(service.canUploadValidation(result)).toBe(false);
    expect(() => service.assertUploadAllowed(result)).toThrow(
      expect.objectContaining({ status: 422 })
    );
  });
});
