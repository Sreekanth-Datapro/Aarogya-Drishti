// /api/screenings: Health Workers only, each action needs its permission,
// and uploads over 10 MB are stopped before reaching the service.
jest.mock("../../services/screeningService", () => ({
  MAX_PHOTO_BYTES: 1024,
  getOptions: jest.fn(async () => ({})),
  listPatients: jest.fn(async () => []),
  getConsents: jest.fn(async () => ({ consents: {} })),
  recordConsent: jest.fn(async () => ({})),
  listMyScreenings: jest.fn(async () => []),
  createScreening: jest.fn(async () => ({ id: "s-1" })),
  getScreening: jest.fn(async () => ({})),
  validatePhoto: jest.fn(async () => ({
    validation: { status: "VALID", expected_category: "MOUTH" },
    can_upload: true,
  })),
  uploadPhoto: jest.fn(async () => ({ id: "p-1" })),
  removePhoto: jest.fn(async () => ({ removed: true })),
  getPhotoFile: jest.fn(),
  enhancePhoto: jest.fn(async () => ({ photo_id: "p-1", width: 1536, height: 1152 })),
  enhancePhotoPreview: jest.fn(async () => ({
    data: Buffer.from("enhanced-preview"),
    mimeType: "image/jpeg",
    width: 1600,
    height: 1200,
    model: "Real-ESRGAN",
  })),
  getEnhancedPhotoFile: jest.fn(),
  submitScreening: jest.fn(async () => ({ case_state: "AWAITING_CLINICIAN" })),
}));
jest.mock("../../services/aiAnalysisService", () => ({
  analyzeScreening: jest.fn(async () => ({ screening_reference: "s-1", views: [] })),
}));
jest.mock("../../middleware/authMiddleware", () => {
  const guard = (predicate) => (req, res, next) => (predicate(req) ? next() : res.status(403).json({ success: false }));
  return {
    authenticate: (req, _res, next) => {
      req.user = {
        id: "user-1",
        role_name: req.header("x-role") || "HEALTH_WORKER",
        permissions: (req.header("x-permissions") || "").split(",").filter(Boolean),
      };
      next();
    },
    allowRoles: (...roles) => guard((req) => roles.includes(req.user.role_name)),
    requirePermission: (permission) => guard((req) => req.user.permissions.includes(permission)),
  };
});

const express = require("express");
const request = require("supertest");
const HttpError = require("../../utils/httpError");
const service = require("../../services/screeningService");
const aiAnalysisService = require("../../services/aiAnalysisService");
const router = require("../../routes/screenings");
const errorMiddleware = require("../../middleware/errorMiddleware");

// Mirror production mount: /api/screenings + catch-all 404 for unknown /api paths.
const app = express();
app.use(express.json());
app.use("/api/screenings", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});
app.use(errorMiddleware);

const ALL = "screening.create,image.upload,consent.record,ai.analyze";
const as = (role, permissions = ALL) => ({ "x-role": role, "x-permissions": permissions });

beforeEach(() => jest.clearAllMocks());

test.each(["MEDICAL_OFFICER", "DISTRICT_ADMIN", "SUPER_ADMIN"])("%s cannot use the Health Worker screening API", async (role) => {
  const response = await request(app).post("/api/screenings").set(as(role)).send({});
  expect(response.status).toBe(403);
  expect(service.createScreening).not.toHaveBeenCalled();
});

test("each action needs its own permission", async () => {
  expect((await request(app).post("/api/screenings/patients/p-1/consents").set(as("HEALTH_WORKER", "screening.create")).send({})).status).toBe(403);
  expect((await request(app).post("/api/screenings/patients/p-1/consents").set(as("SPECIALIST")).send({})).status).toBe(403);
  expect((await request(app).post("/api/screenings/s-1/photos").set(as("HEALTH_WORKER", "screening.create,consent.record"))).status).toBe(403);
  expect((await request(app).post("/api/screenings/s-1/analyze").set(as("HEALTH_WORKER", "screening.create,image.upload"))).status).toBe(403);
  expect((await request(app).post("/api/screenings").set(as("HEALTH_WORKER", "image.upload")).send({})).status).toBe(403);
  expect(service.recordConsent).not.toHaveBeenCalled();
  expect(service.uploadPhoto).not.toHaveBeenCalled();
  expect(aiAnalysisService.analyzeScreening).not.toHaveBeenCalled();
});

test("a Health Worker with the permissions can create, upload and submit", async () => {
  expect((await request(app).post("/api/screenings").set(as("HEALTH_WORKER")).send({ patient_id: "p-1" })).status).toBe(201);
  const upload = await request(app).post("/api/screenings/s-1/photos").set(as("HEALTH_WORKER"))
    .field("view", "FRONT_VIEW").attach("photo", Buffer.alloc(100), { filename: "front.jpg", contentType: "image/jpeg" });
  expect(upload.status).toBe(201);
  expect(service.uploadPhoto).toHaveBeenCalledWith("user-1", expect.anything(), "s-1", "FRONT_VIEW", expect.objectContaining({ mimetype: "image/jpeg" }));
  const analysis = await request(app).post("/api/screenings/s-1/analyze").set(as("HEALTH_WORKER")).send({});
  expect(analysis.status).toBe(201);
  expect(aiAnalysisService.analyzeScreening).toHaveBeenCalledWith("user-1", expect.anything(), "s-1");
  expect((await request(app).post("/api/screenings/s-1/submit").set(as("HEALTH_WORKER"))).status).toBe(200);
});

test("POST /api/screenings/:id/photos/validate returns the expected validation payload", async () => {
  const response = await request(app).post("/api/screenings/s-1/photos/validate").set(as("HEALTH_WORKER"))
    .field("category", "MOUTH").attach("photo", Buffer.alloc(100), { filename: "front.jpg", contentType: "image/jpeg" });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    validation: { status: "VALID", expected_category: "MOUTH" },
    can_upload: true,
  });
  expect(service.validatePhoto).toHaveBeenCalledWith(
    "user-1",
    "s-1",
    "MOUTH",
    expect.objectContaining({ mimetype: "image/jpeg" })
  );
});

test("valid category image can proceed to upload while wrong category is rejected on upload", async () => {
  const valid = await request(app).post("/api/screenings/s-1/photos/validate").set(as("HEALTH_WORKER"))
    .field("category", "MOUTH").attach("photo", Buffer.alloc(100), { filename: "mouth.jpg", contentType: "image/jpeg" });
  expect(valid.status).toBe(200);
  expect(valid.body.can_upload).toBe(true);

  const upload = await request(app).post("/api/screenings/s-1/photos").set(as("HEALTH_WORKER"))
    .field("view", "FRONT_VIEW")
    .field("category", "MOUTH")
    .attach("photo", Buffer.alloc(100), { filename: "mouth.jpg", contentType: "image/jpeg" });
  expect(upload.status).toBe(201);
  expect(service.uploadPhoto).toHaveBeenCalled();

  service.uploadPhoto.mockRejectedValueOnce(
    new HttpError(422, "Selected category is SKIN, but the image appears to show MOUTH.", "INVALID_CATEGORY")
  );
  const rejected = await request(app).post("/api/screenings/s-1/photos").set(as("HEALTH_WORKER"))
    .field("view", "LEFT_VIEW")
    .field("category", "SKIN")
    .attach("photo", Buffer.alloc(100), { filename: "mouth.jpg", contentType: "image/jpeg" });
  expect(rejected.status).toBe(422);
  expect(rejected.body.code).toBe("INVALID_CATEGORY");
});

test("existing screening permissions remain enforced for validate and upload", async () => {
  expect((await request(app).post("/api/screenings/s-1/photos/validate").set(as("HEALTH_WORKER", "screening.create"))).status).toBe(403);
  expect((await request(app).post("/api/screenings/s-1/photos/validate").set(as("MEDICAL_OFFICER"))).status).toBe(403);
  expect(service.validatePhoto).not.toHaveBeenCalled();

  expect((await request(app).post("/api/screenings/s-1/photos").set(as("HEALTH_WORKER", "screening.create"))).status).toBe(403);
  expect((await request(app).post("/api/screenings/s-1/photos").set(as("DISTRICT_ADMIN"))).status).toBe(403);
  expect(service.uploadPhoto).not.toHaveBeenCalled();
});

test("a photo over the size limit is refused with a clear message before the service", async () => {
  const response = await request(app).post("/api/screenings/s-1/photos").set(as("HEALTH_WORKER"))
    .field("view", "FRONT_VIEW").attach("photo", Buffer.alloc(2048), { filename: "big.jpg", contentType: "image/jpeg" });
  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Each photo must be at most 10 MB");
  expect(service.uploadPhoto).not.toHaveBeenCalled();
});

test("AI enhancement is only for a Health Worker with the photo permission", async () => {
  const response = await request(app).post("/api/screenings/s-1/photos/p-1/enhance").set(as("HEALTH_WORKER"));
  expect(response.status).toBe(201);
  expect(response.body.enhanced).toMatchObject({ photo_id: "p-1" });
  expect(service.enhancePhoto).toHaveBeenCalledWith("user-1", expect.anything(), "s-1", "p-1");

  expect((await request(app).post("/api/screenings/s-1/photos/p-1/enhance").set(as("HEALTH_WORKER", "screening.create"))).status).toBe(403);
  expect((await request(app).post("/api/screenings/s-1/photos/p-1/enhance").set(as("MEDICAL_OFFICER"))).status).toBe(403);
  expect((await request(app).get("/api/screenings/s-1/photos/p-1/enhanced/file").set(as("DISTRICT_ADMIN"))).status).toBe(403);
  expect(service.enhancePhoto).toHaveBeenCalledTimes(1);
  expect(service.getEnhancedPhotoFile).not.toHaveBeenCalled();
});

test("POST /api/screenings/:id/photos/enhance-preview returns enhanced JPEG without creating a photo", async () => {
  const response = await request(app).post("/api/screenings/s-1/photos/enhance-preview").set(as("HEALTH_WORKER"))
    .attach("photo", Buffer.alloc(100), { filename: "front.jpg", contentType: "image/jpeg" });
  expect(response.status).toBe(200);
  expect(response.headers["content-type"]).toMatch(/image\/jpeg/);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(Buffer.from(response.body).toString()).toBe("enhanced-preview");
  expect(service.enhancePhotoPreview).toHaveBeenCalledWith(
    "user-1",
    expect.anything(),
    "s-1",
    expect.objectContaining({ mimetype: "image/jpeg" })
  );
  expect(service.uploadPhoto).not.toHaveBeenCalled();

  expect((await request(app).post("/api/screenings/s-1/photos/enhance-preview").set(as("HEALTH_WORKER", "screening.create"))).status).toBe(403);
  expect((await request(app).post("/api/screenings/s-1/photos/enhance-preview").set(as("MEDICAL_OFFICER"))).status).toBe(403);
});

test("Health Worker image endpoints stream Supabase buffers with private response headers", async () => {
  const image = Buffer.from("synthetic-private-image");
  service.getPhotoFile.mockResolvedValueOnce({ data: image, mimeType: "image/jpeg" });
  service.getEnhancedPhotoFile.mockResolvedValueOnce({ data: image, mimeType: "image/jpeg" });

  const original = await request(app).get("/api/screenings/s-1/photos/p-1/file").set(as("HEALTH_WORKER"));
  const enhanced = await request(app).get("/api/screenings/s-1/photos/p-1/enhanced/file").set(as("HEALTH_WORKER"));

  expect(original.status).toBe(200);
  expect(original.body).toEqual(image);
  expect(original.headers["cache-control"]).toBe("no-store");
  expect(original.headers["x-content-type-options"]).toBe("nosniff");
  expect(enhanced.status).toBe(200);
  expect(enhanced.body).toEqual(image);
  expect(enhanced.headers["cache-control"]).toBe("no-store");
  expect(service.getPhotoFile).toHaveBeenCalledWith("user-1", "s-1", "p-1");
  expect(service.getEnhancedPhotoFile).toHaveBeenCalledWith("user-1", "s-1", "p-1");
});

test("only an authorized Health Worker can remove a screening photo", async () => {
  const response = await request(app).delete("/api/screenings/s-1/photos/p-1").set(as("HEALTH_WORKER"));
  expect(response.status).toBe(200);
  expect(service.removePhoto).toHaveBeenCalledWith("user-1", expect.anything(), "s-1", "p-1");

  expect((await request(app).delete("/api/screenings/s-1/photos/p-1").set(as("MEDICAL_OFFICER"))).status).toBe(403);
  expect(service.removePhoto).toHaveBeenCalledTimes(1);
});
