import React from "react";
import { render, screen } from "@testing-library/react";
import AnalyticsOverview from "./AnalyticsOverview";

jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", t: (key) => key }),
}));

test("analytics shows an empty state instead of fabricated monthly values", () => {
  const { container } = render(<AnalyticsOverview trends={[]} />);

  expect(screen.getByText("dashboard.noTrendData")).toBeInTheDocument();
  expect(container.querySelector("svg")).not.toBeInTheDocument();
});
