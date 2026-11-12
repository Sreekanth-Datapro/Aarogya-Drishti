import { assessImageMetrics, MAX_IMAGE_BYTES, validateImageFile } from "./imageTools";

test("validates supported formats and the 10 MB limit", () => {
  expect(validateImageFile(new File(["image"], "photo.jpg", { type: "image/jpeg" }))).toBeNull();
  expect(validateImageFile(new File(["image"], "photo.png", { type: "image/png" }))).toBeNull();
  expect(validateImageFile(new File(["image"], "photo.webp", { type: "image/webp" }))).toBeNull();
  expect(validateImageFile(new File(["image"], "photo.gif", { type: "image/gif" }))).toBe("type");

  const large = new File(["image"], "large.jpg", { type: "image/jpeg" });
  Object.defineProperty(large, "size", { value: MAX_IMAGE_BYTES + 1 });
  expect(validateImageFile(large)).toBe("size");
});

test("quality check reports low dimensions, poor lighting and likely blur as heuristics", () => {
  expect(assessImageMetrics({ width: 320, height: 240, brightness: 20, sharpness: 2 })).toMatchObject({
    status: "check",
    warnings: ["dimensions", "dark", "blur"],
  });
  expect(assessImageMetrics({ width: 1200, height: 900, brightness: 230, sharpness: 100 })).toMatchObject({
    status: "check",
    warnings: ["bright"],
  });
  expect(assessImageMetrics({ width: 1200, height: 900, brightness: 120, sharpness: 100 })).toMatchObject({
    status: "good",
    warnings: [],
  });
});
