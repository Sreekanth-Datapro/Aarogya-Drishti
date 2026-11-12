import api from "./api";
import { fetchPrivateImageObjectUrl } from "./privateImageBlob";

jest.mock("./api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:private-image");
});

test("creates an object URL for a valid image blob", async () => {
  api.get.mockResolvedValueOnce({
    data: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    headers: { "content-type": "image/jpeg" },
  });

  await expect(fetchPrivateImageObjectUrl("/screenings/s/photos/p/file")).resolves.toBe("blob:private-image");
  expect(api.get).toHaveBeenCalledWith("/screenings/s/photos/p/file", {
    responseType: "blob",
    timeout: 180000,
  });
  expect(URL.createObjectURL).toHaveBeenCalled();
});

test("rejects JSON error payloads returned as blobs", async () => {
  api.get.mockResolvedValueOnce({
    data: new Blob([JSON.stringify({ code: "IMAGE_FILE_MISSING", message: "gone" })], {
      type: "application/json",
    }),
    headers: { "content-type": "application/json" },
  });

  await expect(fetchPrivateImageObjectUrl("/screenings/s/photos/p/file")).rejects.toMatchObject({
    response: { data: { code: "IMAGE_FILE_MISSING", message: "gone" } },
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
