const fs = require("fs");
const os = require("os");
const path = require("path");

const mockStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), "aarogya-private-storage-"));
let mockConfigured = true;
const mockBucket = {
  upload: jest.fn(),
  download: jest.fn(),
  list: jest.fn(),
  remove: jest.fn(),
};
const mockClient = {
  storage: {
    from: jest.fn(() => mockBucket),
  },
};

jest.mock("../../config/config", () => ({
  photoStorageDir: mockStorageDir,
  supabase: {
    url: "https://example.supabase.co",
    serviceRoleKey: "test-only-service-role-key",
    storageBucket: "aarogya-patient-images",
  },
}));
jest.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => {
    if (!mockConfigured) {
      throw Object.assign(new Error("not configured"), { status: 503, code: "IMAGE_STORAGE_UNAVAILABLE" });
    }
    return mockClient;
  },
  isConfigured: () => mockConfigured,
}));

const storage = require("../../services/privateImageStorage");

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigured = true;
  mockBucket.upload.mockResolvedValue({ data: { path: "stored" }, error: null });
  mockBucket.download.mockResolvedValue({ data: new Blob([Buffer.from("cloud-image")]), error: null });
  mockBucket.list.mockResolvedValue({ data: [], error: null });
  mockBucket.remove.mockResolvedValue({ data: [], error: null });
});

afterAll(() => fs.rmSync(mockStorageDir, { recursive: true, force: true }));

test("uploads private objects to the configured bucket without upsert", async () => {
  await storage.uploadBuffer(
    "originals/screening-id/photo-id.jpg",
    Buffer.from("original"),
    "image/jpeg"
  );
  await storage.uploadBuffer(
    "enhanced/screening-id/photo-id.jpg",
    Buffer.from("enhanced"),
    "image/jpeg"
  );

  expect(mockClient.storage.from).toHaveBeenCalledWith("aarogya-patient-images");
  expect(mockBucket.upload).toHaveBeenNthCalledWith(
    1,
    "originals/screening-id/photo-id.jpg",
    Buffer.from("original"),
    { contentType: "image/jpeg", upsert: false }
  );
  expect(mockBucket.upload.mock.calls[1][0]).toBe("enhanced/screening-id/photo-id.jpg");
});

test("can replace only a previously validated enhanced-object path when explicitly requested", async () => {
  await storage.uploadBuffer(
    "enhanced/screening-id/photo-id.jpg",
    Buffer.from("replacement"),
    "image/jpeg",
    { upsert: true }
  );
  expect(mockBucket.upload).toHaveBeenCalledWith(
    "enhanced/screening-id/photo-id.jpg",
    Buffer.from("replacement"),
    { contentType: "image/jpeg", upsert: true }
  );
});

test("downloads a Supabase object as a Buffer", async () => {
  await expect(storage.downloadBuffer("originals/screening-id/photo-id.jpg"))
    .resolves.toEqual(Buffer.from("cloud-image"));
  expect(mockBucket.download).toHaveBeenCalledWith("originals/screening-id/photo-id.jpg");
});

test("reads legacy local files before attempting Supabase", async () => {
  const key = "legacy-local-screening/photo.jpg";
  const localPath = path.join(mockStorageDir, key);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, "legacy-image");

  await expect(storage.downloadBuffer(key)).resolves.toEqual(Buffer.from("legacy-image"));
  expect(mockBucket.download).not.toHaveBeenCalled();
});

test("falls back to the matching Supabase object when a legacy local file is absent", async () => {
  const key = "legacy-cloud-screening/photo.jpg";
  await expect(storage.getFile(key)).resolves.toEqual({ data: Buffer.from("cloud-image") });
  expect(mockBucket.download).toHaveBeenCalledWith(key);
});

test("checks local and private bucket objects without creating public URLs", async () => {
  mockBucket.list.mockResolvedValue({ data: [{ name: "photo.jpg" }], error: null });

  await expect(storage.objectExists("enhanced/screening-id/photo.jpg")).resolves.toBe(true);
  expect(mockBucket.list).toHaveBeenCalledWith("enhanced/screening-id", {
    limit: 100,
    search: "photo.jpg",
  });
  expect(mockBucket).not.toHaveProperty("getPublicUrl");
});

test("rejects unsafe object keys before accessing storage", async () => {
  await expect(storage.downloadBuffer("../outside.jpg"))
    .rejects.toMatchObject({ status: 404, code: "IMAGE_FILE_MISSING" });
  expect(mockBucket.download).not.toHaveBeenCalled();
});

test("supports explicitly requested private object deletion", async () => {
  await storage.deleteObject("originals/screening-id/photo-id.jpg");
  expect(mockBucket.remove).toHaveBeenCalledWith(["originals/screening-id/photo-id.jpg"]);
});

test("an unconfigured storage service reports an explicit upload error", async () => {
  mockConfigured = false;
  await expect(storage.uploadBuffer("originals/s/p.jpg", Buffer.from("x"), "image/jpeg"))
    .rejects.toMatchObject({ status: 503, code: "IMAGE_STORAGE_UPLOAD_FAILED" });
  expect(mockBucket.upload).not.toHaveBeenCalled();
});

test("reports a safe operation-specific error when the private bucket denies upload", async () => {
  mockBucket.upload.mockResolvedValue({
    data: null,
    error: { statusCode: 403, message: "do not expose this provider error" },
  });
  await expect(storage.uploadBuffer("enhanced/s/p.jpg", Buffer.from("x"), "image/jpeg"))
    .rejects.toMatchObject({ status: 503, code: "IMAGE_STORAGE_ACCESS_DENIED" });
});

test("reports a safe operation-specific error when private bucket lookup fails", async () => {
  mockBucket.list.mockResolvedValue({
    data: null,
    error: { statusCode: 503, message: "do not expose this provider error" },
  });
  await expect(storage.objectExists("enhanced/s/p.jpg"))
    .rejects.toMatchObject({ status: 503, code: "IMAGE_STORAGE_CHECK_FAILED" });
});
