import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import VoiceFormAssist from "./VoiceFormAssist";

jest.mock("./useSpeechRecognition", () => ({
  __esModule: true,
  default: () => ({
    supported: true,
    status: "idle",
    transcript: "Patient name is Lakshmi Devi, female, age 45 years",
    interimTranscript: "",
    errorKey: "",
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    clear: jest.fn(),
    setTranscript: jest.fn(),
  }),
}));

function Harness() {
  const [form, setForm] = useState({ full_name: "", sex: "", age_years: "" });
  const [filled, setFilled] = useState([]);
  return (
    <LanguageProvider>
      <VoiceFormAssist
        form={form}
        parseTranscript={() => ({
          patches: [
            { field: "full_name", value: "Lakshmi Devi", labelKey: "patientRegistration.fullName", displayValue: "Lakshmi Devi" },
            { field: "sex", value: "FEMALE", labelKey: "patientRegistration.sex", displayValue: "FEMALE" },
            { field: "age_years", value: "45", labelKey: "patientRegistration.age", displayValue: "45" },
          ],
          unclear: [],
        })}
        parseContext={{ form }}
        onApply={(updates, fields) => {
          setForm((current) => ({ ...current, ...updates }));
          setFilled(fields);
        }}
      />
      <div data-testid="form-name">{form.full_name}</div>
      <div data-testid="form-sex">{form.sex}</div>
      <div data-testid="filled">{filled.join(",")}</div>
      <form onSubmit={(event) => {
        event.preventDefault();
        throw new Error("form must not auto-submit from voice");
      }}
      >
        <button type="submit">Register patient</button>
      </form>
    </LanguageProvider>
  );
}

describe("VoiceFormAssist", () => {
  test("requires confirm before applying fields and never submits the form", () => {
    render(<Harness />);

    expect(screen.getByTestId("form-name")).toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Review proposed fields" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Lakshmi Devi/)).toBeInTheDocument();
    expect(screen.getByTestId("form-name")).toHaveTextContent("");

    fireEvent.click(within(dialog).getByRole("button", { name: "Apply confirmed values" }));
    expect(screen.getByTestId("form-name")).toHaveTextContent("Lakshmi Devi");
    expect(screen.getByTestId("form-sex")).toHaveTextContent("FEMALE");
    expect(screen.getByTestId("filled")).toHaveTextContent("full_name,sex,age_years");
    expect(screen.getByText(/Voice values applied/i)).toBeInTheDocument();
  });

  test("shows privacy notice about Web Speech API", () => {
    render(<Harness />);
    expect(screen.getByText(/Privacy notice/i)).toBeInTheDocument();
    expect(screen.getByText(/browser vendor/i)).toBeInTheDocument();
  });
});

describe("VoiceFormAssist conflicts", () => {
  test("does not overwrite existing values unless user chooses voice", () => {
    function ConflictHarness() {
      const [form, setForm] = useState({ full_name: "Existing", sex: "" });
      return (
        <LanguageProvider>
          <VoiceFormAssist
            form={form}
            parseTranscript={() => ({
              patches: [
                { field: "full_name", value: "Voice Name", labelKey: "patientRegistration.fullName", displayValue: "Voice Name" },
                { field: "sex", value: "MALE", labelKey: "patientRegistration.sex", displayValue: "MALE" },
              ],
              unclear: [],
            })}
            parseContext={{ form }}
            onApply={(updates) => setForm((current) => ({ ...current, ...updates }))}
          />
          <div data-testid="name">{form.full_name}</div>
          <div data-testid="sex">{form.sex}</div>
        </LanguageProvider>
      );
    }

    render(<ConflictHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Review proposed fields" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Fields already have values/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply confirmed values" }));
    expect(screen.getByTestId("name")).toHaveTextContent("Existing");
    expect(screen.getByTestId("sex")).toHaveTextContent("MALE");
  });
});
