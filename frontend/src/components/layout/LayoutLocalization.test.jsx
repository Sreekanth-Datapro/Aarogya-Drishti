import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider, useLanguage } from "../../i18n/LanguageContext";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      full_name: "System Administrator",
      username: "systemadmin",
      role: "SUPER_ADMIN",
    },
    logout: jest.fn(),
  }),
}));

function Controls() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button type="button" onClick={() => setLanguage("en")}>English</button>
      <button type="button" onClick={() => setLanguage("te")}>Telugu</button>
    </>
  );
}

test("sidebar and topbar switch between English and Telugu", () => {
  localStorage.setItem("language", "en");

  render(
    <LanguageProvider>
      <MemoryRouter>
        <Controls />
        <Sidebar
          user={{ full_name: "System Administrator", username: "systemadmin", role: "SUPER_ADMIN" }}
          open
          onClose={() => {}}
          onLogout={() => {}}
        />
        <Topbar
          title="Dashboard"
          user={{ full_name: "System Administrator", username: "systemadmin", role: "SUPER_ADMIN" }}
          menuOpen={false}
          onMenuClick={() => {}}
        />
      </MemoryRouter>
    </LanguageProvider>
  );

  expect(screen.getByText("Location Management")).toBeInTheDocument();
  expect(screen.getByText("Reports & Analytics")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Telugu" }));

  expect(screen.getByText("ప్రదేశ నిర్వహణ")).toBeInTheDocument();
  expect(screen.getByText("నివేదికలు & విశ్లేషణలు")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "English" }));

  expect(screen.getByText("Location Management")).toBeInTheDocument();
  expect(screen.getByText("Reports & Analytics")).toBeInTheDocument();
});
