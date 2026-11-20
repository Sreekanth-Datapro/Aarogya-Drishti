import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FloatingAssistant from "./FloatingAssistant";
import api from "../../services/api";
import { unlockAzureAudio } from "../azureTtsPlayer";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "en" }),
}));

jest.mock("./GlobalVoiceContext", () => ({
  useGlobalVoice: () => ({
    speechConfigured: true,
    sessionActive: false,
    navListening: false,
    setPlaybackPhase: jest.fn(),
  }),
}));

jest.mock("../useAzureSpeechRecognition", () => () => ({
  status: "idle",
  transcript: "",
  errorKey: "",
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
}));

jest.mock("../azureTtsPlayer", () => ({
  cancelAzureSpeech: jest.fn(),
  speakAzureText: jest.fn(async () => ({ ok: true })),
  unlockAzureAudio: jest.fn(async () => true),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("uses the mascot as the only launcher and toggles the assistant panel", () => {
  render(<FloatingAssistant />);

  const mascot = screen.getByRole("button", { name: "Open Aarogya assistant" });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Ask me anything!" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open Aarogya assistant" })).toBe(mascot);
  expect(screen.getByAltText("Aarogya Drishti assistant")).toHaveAttribute(
    "src",
    "/assets/images/robot-mascot.png"
  );

  fireEvent.click(mascot);
  expect(screen.getByText("Aarogya Assistant")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close Aarogya assistant" })).toBe(mascot);

  fireEvent.click(mascot);
  expect(screen.queryByText("Aarogya Assistant")).not.toBeInTheDocument();
  fireEvent.click(mascot);
  expect(screen.getByText("Aarogya Assistant")).toBeInTheDocument();
});

test("sends a chat message through the authenticated assistant API", async () => {
  api.post.mockResolvedValue({
    data: {
      reply: "Aarogya Drishti supports oral screening.",
      model_information: { provider: "cloudflare-workers-ai" },
    },
  });
  render(<FloatingAssistant />);
  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Type a message…" }), {
    target: { value: "What is Aarogya Drishti?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith(
      "/assistant/chat",
      {
        locale: "auto",
        messages: [{ role: "user", content: "What is Aarogya Drishti?" }],
      },
      { timeout: 60000 }
    );
    expect(screen.getByText("Aarogya Drishti supports oral screening.")).toBeInTheDocument();
  });
});

test("sends text even when audio unlock fails", async () => {
  api.post.mockResolvedValue({
    data: {
      reply: "Hello!",
      model_information: { provider: "cloudflare-workers-ai" },
    },
  });
  unlockAzureAudio.mockRejectedValueOnce(new Error("Audio is unavailable"));
  render(<FloatingAssistant />);

  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Type a message…" }), {
    target: { value: "Hello" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith(
      "/assistant/chat",
      {
        locale: "auto",
        messages: [{ role: "user", content: "Hello" }],
      },
      { timeout: 60000 }
    );
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });
});

test("previews and submits an image with its text prompt using multipart form data", async () => {
  api.post.mockResolvedValue({
    data: {
      reply: "The image shows a blue square.",
      model_information: { provider: "cloudflare-workers-ai" },
    },
  });
  URL.createObjectURL = jest.fn(() => "blob:assistant-image");
  URL.revokeObjectURL = jest.fn();
  render(<FloatingAssistant />);

  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  const image = new File(["synthetic image"], "sample.png", { type: "image/png" });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [image] } });
  expect(screen.getByAltText("Image preview")).toHaveAttribute("src", "blob:assistant-image");
  fireEvent.change(screen.getByRole("textbox", { name: "Type a message…" }), {
    target: { value: "What is in this picture?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body, options] = api.post.mock.calls[0];
    expect(path).toBe("/assistant/chat");
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(body.get("messages"))).toEqual([
      { role: "user", content: "What is in this picture?" },
    ]);
    expect(body.get("locale")).toBe("auto");
    expect(body.get("image")).toMatchObject({
      name: "sample.png",
      type: "image/png",
      size: image.size,
    });
    expect(options).toEqual({ timeout: 180000 });
    expect(screen.getByAltText("User attachment")).toBeInTheDocument();
    expect(screen.getByText("The image shows a blue square.")).toBeInTheDocument();
  });
});

test("allows image-only submission with a default image description prompt", async () => {
  api.post.mockResolvedValue({
    data: {
      reply: "The image contains a simple shape.",
      model_information: { provider: "cloudflare-workers-ai" },
    },
  });
  URL.createObjectURL = jest.fn(() => "blob:assistant-image-only");
  URL.revokeObjectURL = jest.fn();
  render(<FloatingAssistant />);

  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  const image = new File(["synthetic image"], "sample.webp", { type: "image/webp" });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [image] } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => {
    const body = api.post.mock.calls[0][1];
    expect(JSON.parse(body.get("messages"))).toEqual([
      { role: "user", content: "Describe this image." },
    ]);
    expect(body.get("image")).toMatchObject({
      name: "sample.webp",
      type: "image/webp",
      size: image.size,
    });
    expect(screen.getByText("The image contains a simple shape.")).toBeInTheDocument();
  });
});

test("removes a selected image before submission", () => {
  URL.createObjectURL = jest.fn(() => "blob:removable-image");
  URL.revokeObjectURL = jest.fn();
  render(<FloatingAssistant />);
  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  const image = new File(["synthetic image"], "sample.png", { type: "image/png" });
  fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [image] } });

  expect(screen.getByAltText("Image preview")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
  expect(screen.queryByAltText("Image preview")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("shows a safe image error when the backend rejects the uploaded image", async () => {
  api.post.mockRejectedValue({
    response: { data: { code: "CHAT_IMAGE_INVALID" } },
  });
  URL.createObjectURL = jest.fn(() => "blob:rejected-image");
  URL.revokeObjectURL = jest.fn();
  render(<FloatingAssistant />);
  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  fireEvent.change(document.querySelector('input[type="file"]'), {
    target: { files: [new File(["bad image"], "sample.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  expect(await screen.findByText("The image could not be uploaded. Please try another image."))
    .toBeInTheDocument();
});

test("rejects unsupported image types and files larger than 10 MB", () => {
  URL.createObjectURL = jest.fn(() => "blob:unused-image");
  URL.revokeObjectURL = jest.fn();
  render(<FloatingAssistant />);
  fireEvent.click(screen.getByRole("button", { name: "Open Aarogya assistant" }));
  const input = document.querySelector('input[type="file"]');

  fireEvent.change(input, {
    target: { files: [new File(["not an image"], "sample.gif", { type: "image/gif" })] },
  });
  expect(screen.getByText("Choose a JPEG, PNG, or WEBP image.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

  const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
    type: "image/png",
  });
  fireEvent.change(input, { target: { files: [oversized] } });
  expect(screen.getByText("Images must be 10 MB or smaller.")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
