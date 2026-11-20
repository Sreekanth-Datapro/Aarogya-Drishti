const express = require("express");
const request = require("supertest");

jest.mock("../../middleware/authMiddleware", () => ({
  authenticate: (_req, _res, next) => next(),
}));

const assistantRoutes = require("../../routes/assistant");

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/assistant", assistantRoutes);
  return app;
}

test("rejects unsupported image MIME types at the upload route", async () => {
  const response = await request(createApp())
    .post("/api/assistant/chat")
    .field("messages", JSON.stringify([{ role: "user", content: "Describe this." }]))
    .attach("image", Buffer.from("not an image"), {
      filename: "sample.gif",
      contentType: "image/gif",
    });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe("CHAT_IMAGE_TYPE_UNSUPPORTED");
});

test("rejects image uploads over 10 MB at the upload route", async () => {
  const response = await request(createApp())
    .post("/api/assistant/chat")
    .field("messages", JSON.stringify([{ role: "user", content: "Describe this." }]))
    .attach("image", Buffer.alloc(10 * 1024 * 1024 + 1), {
      filename: "large.png",
      contentType: "image/png",
    });

  expect(response.status).toBe(413);
  expect(response.body.code).toBe("CHAT_IMAGE_TOO_LARGE");
});
