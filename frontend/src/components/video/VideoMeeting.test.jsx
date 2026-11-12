import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VideoMeeting from "./VideoMeeting";

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    t: (key) => key,
    language: "en",
  }),
}));

beforeEach(() => {
  document.body.innerHTML = "";
  delete window.JitsiMeetExternalAPI;
});

test("loads the public Jitsi script and creates an external API instance", async () => {
  const dispose = jest.fn();
  const addListener = jest.fn();
  const executeCommand = jest.fn();
  window.JitsiMeetExternalAPI = jest.fn().mockImplementation(() => ({
    addListener,
    dispose,
    executeCommand,
  }));

  render(
    <VideoMeeting
      domain="meet.jit.si"
      roomName="ad-testroom"
      displayName="Health Worker"
    />
  );

  await waitFor(() => {
    expect(window.JitsiMeetExternalAPI).toHaveBeenCalledWith(
      "meet.jit.si",
      expect.objectContaining({ roomName: "ad-testroom" })
    );
  });
  expect(screen.getByText("videoMeeting.publicWarning")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "videoMeeting.leave" }));
  expect(executeCommand).toHaveBeenCalledWith("hangup");
  expect(dispose).toHaveBeenCalled();
});
