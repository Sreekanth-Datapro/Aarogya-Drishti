import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import RoleManagement from "./RoleManagement";

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
  },
}));
jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../i18n/LanguageContext", () => ({
  useLanguage: () => ({
    language: "en",
    t: (key, values) => Object.entries(values || {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, value),
      key
    ),
    tm: (key) => key,
  }),
}));

const roles = [
  { id: 8, code: "SUPER_ADMIN", name: "Super administrator", name_te: null, is_active: true, is_protected: true, permissions: ["role.manage"], permission_ids: [], assigned_users: 1 },
  { id: 4, code: "MEDICAL_OFFICER", name: "Medical Officer", name_te: null, is_active: true, is_protected: true, permissions: ["review.sign"], permission_ids: [2], assigned_users: 3 },
  { id: 30, code: "CUSTOM_AUDITOR", name: "Custom auditor", name_te: null, is_active: true, is_protected: false, permissions: [], permission_ids: [], assigned_users: 0 },
];
const permissions = [
  { id: 1, code: "master.view", resource: "master", action: "read", description: "View master data", assignable: true },
  { id: 2, code: "review.sign", resource: "review", action: "sign", description: "Sign clinical review", assignable: false },
  { id: 3, code: "page.reports", resource: "page", action: "access", description: "Open reports", assignable: true },
  { id: 4, code: "page.roleManagement", resource: "page", action: "access", description: "Open role management", assignable: false },
];
const rbacUsers = [{
  id: "worker-1",
  username: "asha.worker",
  full_name: "Asha Worker",
  status: "ACTIVE",
  role_id: 4,
  role_code: "MEDICAL_OFFICER",
  district_name: "Example District",
  facility_name: "PHC Example",
}];

function setupApi() {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url === "/admin/roles"
      ? { roles }
      : url === "/admin/permissions"
        ? { permissions }
        : { users: rbacUsers, pagination: { page: 1, limit: 20, total: 1, total_pages: 1 } },
  }));
}

function renderPage() {
  return render(<RoleManagement />);
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: "admin-1", role: "SUPER_ADMIN" } });
  setupApi();
  api.post.mockResolvedValue({ data: { role: { code: "CUSTOM_NEW" } } });
  api.put.mockResolvedValue({ data: { success: true } });
  api.patch.mockResolvedValue({ data: { user: { role_code: "CUSTOM_AUDITOR" } } });
  window.confirm = jest.fn(() => true);
});

test("shows all roles and protects built-in permissions in the matrix", async () => {
  renderPage();
  expect((await screen.findAllByText("SUPER_ADMIN")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("MEDICAL_OFFICER").length).toBeGreaterThan(0);
  expect(screen.getAllByText("CUSTOM_AUDITOR").length).toBeGreaterThan(0);

  const clinicalPermission = screen.getByRole("checkbox", { name: "MEDICAL_OFFICER review.sign" });
  expect(clinicalPermission).toBeChecked();
  expect(clinicalPermission).toBeDisabled();
  expect(screen.getByText("roleManagement.permissionRegistry")).toBeInTheDocument();
  expect(screen.getAllByText("review.sign").length).toBeGreaterThan(0);
  expect(screen.getByText("roleManagement.pagesPanelTitle")).toBeInTheDocument();
  const pagesPanel = screen.getByRole("region", { name: "roleManagement.pagesPanelTitle" });
  expect(within(pagesPanel).getByRole("checkbox", { name: "CUSTOM_AUDITOR page.reports" })).not.toBeDisabled();
  expect(within(pagesPanel).getByRole("checkbox", { name: "CUSTOM_AUDITOR page.roleManagement" })).toBeDisabled();
});

test("permission matrix and registry keep readable, labeled module tables", async () => {
  renderPage();
  await screen.findByRole("checkbox", { name: "MEDICAL_OFFICER review.sign" });

  const matrix = screen.getByRole("region", { name: "roleManagement.permissionsMatrix" });
  expect(matrix).toHaveAttribute("tabindex", "0");
  expect(matrix.querySelector("table")).toHaveClass("role-permission-matrix");
  expect(screen.getByText("roleManagement.matrixHint")).toBeInTheDocument();

  const reviewRegistry = screen.getByRole("region", { name: "review roleManagement.permissionRegistry" });
  expect(reviewRegistry.querySelector("table")).toHaveClass("role-registry-table");
  expect(within(reviewRegistry).getByText("review.sign")).toBeInTheDocument();
  expect(within(reviewRegistry).getAllByText("roleManagement.permissionLocked").length).toBeGreaterThan(0);
});

test("shows role summary values from the API data and filters the role overview", async () => {
  renderPage();
  const overview = await screen.findByRole("region", { name: "roleManagement.rolesOverview" });

  expect(screen.getByText("roleManagement.totalRoles")).toBeInTheDocument();
  expect(screen.getByText("roleManagement.activeRoles")).toBeInTheDocument();
  expect(screen.getByText("roleManagement.builtInRoles")).toBeInTheDocument();
  expect(screen.getAllByText("roleManagement.assignedUsers").length).toBeGreaterThan(0);
  expect(within(overview).getAllByRole("article")).toHaveLength(3);

  fireEvent.change(screen.getByLabelText("roleManagement.typeFilter"), { target: { value: "CUSTOM" } });
  expect(within(overview).getAllByRole("article")).toHaveLength(1);
  expect(within(overview).getByRole("heading", { name: "Custom auditor" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("roleManagement.typeFilter"), { target: { value: "ALL" } });
  fireEvent.change(screen.getByPlaceholderText("roleManagement.searchRolesPlaceholder"), {
    target: { value: "Medical Officer" },
  });
  expect(within(overview).getAllByRole("article")).toHaveLength(1);
  expect(within(overview).getByRole("heading", { name: "Medical Officer" })).toBeInTheDocument();
});

test("View users opens an immediate dialog and renders the role users returned by the API", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/admin/roles/30/users") {
      return Promise.resolve({ data: { users: rbacUsers } });
    }
    return Promise.resolve({
      data: url === "/admin/roles"
        ? { roles }
        : url === "/admin/permissions"
          ? { permissions }
          : { users: rbacUsers, pagination: { page: 1, limit: 20, total: 1, total_pages: 1 } },
    });
  });
  renderPage();
  const overview = await screen.findByRole("region", { name: "roleManagement.rolesOverview" });
  const customRole = within(overview).getAllByRole("article").find((card) => (
    within(card).queryByRole("heading", { name: "Custom auditor" })
  ));

  fireEvent.click(within(customRole).getByRole("button", { name: "roleManagement.viewUsers" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "roleManagement.usersFor" })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith("/admin/roles/30/users");
  expect(within(dialog).getByText("Asha Worker")).toBeInTheDocument();
  expect(within(dialog).getByText("asha.worker")).toBeInTheDocument();
  expect(within(dialog).getByText("Active")).toBeInTheDocument();
});

test("custom role form opens from the page action and can be closed", async () => {
  renderPage();
  await screen.findByRole("button", { name: "roleManagement.createCustomRole" });

  expect(screen.queryByLabelText("roleManagement.roleName")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "roleManagement.createCustomRole" }));
  expect(screen.getByLabelText("roleManagement.roleName")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
  expect(screen.queryByLabelText("roleManagement.roleName")).not.toBeInTheDocument();
});

test("custom roles can change only policy-assignable permissions after confirmation", async () => {
  let permissionsSaved = false;
  api.get.mockImplementation((url) => Promise.resolve({
    data: url === "/admin/roles"
      ? {
          roles: roles.map((role) => role.id === 30 && permissionsSaved
            ? { ...role, permissions: ["master.view"], permission_ids: [1] }
            : role),
        }
      : url === "/admin/permissions"
        ? { permissions }
        : { users: rbacUsers, pagination: { page: 1, limit: 20, total: 1, total_pages: 1 } },
  }));
  api.put.mockImplementation(async () => {
    permissionsSaved = true;
    return { data: { success: true } };
  });

  renderPage();
  const checkbox = await screen.findByRole("checkbox", { name: "CUSTOM_AUDITOR master.view" });
  expect(checkbox).toBeEnabled();
  fireEvent.click(checkbox);

  await waitFor(() => {
    expect(api.put).toHaveBeenCalledWith("/admin/roles/30/permissions", { permission_ids: [1] });
    expect(checkbox).toBeChecked();
  });
  expect(window.confirm).toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: "CUSTOM_AUDITOR review.sign" })).toBeDisabled();
});

test("reverts a permission checkbox and reports the error when saving fails", async () => {
  api.put.mockRejectedValue(new Error("network"));
  renderPage();
  const checkbox = await screen.findByRole("checkbox", { name: "CUSTOM_AUDITOR master.view" });

  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();

  await waitFor(() => expect(checkbox).not.toBeChecked());
  expect(screen.getByText("roleManagement.permissionsFailed")).toBeInTheDocument();
});

test("searches users and requires confirmation before changing a role", async () => {
  renderPage();
  const search = await screen.findByLabelText("roleManagement.searchUsers");
  fireEvent.change(search, { target: { value: "asha" } });
  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith("/admin/users", {
      params: { search: "asha", page: 1, limit: 20 },
    });
  });
  expect(await screen.findByText("Asha Worker")).toBeInTheDocument();
  expect(screen.getByText("Example District")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("combobox", { name: "roleManagement.newRole asha.worker" }), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "roleManagement.changeRole" }));
  await waitFor(() => {
    expect(api.patch).toHaveBeenCalledWith("/admin/users/worker-1/role", { role_id: 30 });
  });
  expect(window.confirm).toHaveBeenCalled();
});

test("does not submit a role change if confirmation is declined", async () => {
  window.confirm.mockReturnValue(false);
  renderPage();
  expect(await screen.findByText("Asha Worker")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "roleManagement.newRole asha.worker" }), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "roleManagement.changeRole" }));
  expect(window.confirm).toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
});

test("SYSTEM_ADMIN can open Role Management and see View-labeled screen matrix", async () => {
  useAuth.mockReturnValue({ user: { id: "sys-1", role: "SYSTEM_ADMIN" } });
  renderPage();
  expect(await screen.findByText("roleManagement.pagesPanelTitle")).toBeInTheDocument();
  expect(screen.getByText("roleManagement.pagesPanelHint")).toBeInTheDocument();
  const pagesPanel = screen.getByRole("region", { name: "roleManagement.pagesPanelTitle" });
  expect(within(pagesPanel).getAllByText("roleManagement.action.view").length).toBeGreaterThan(0);
  expect(screen.getByText("roleManagement.actionColumnLocked")).toBeInTheDocument();
});

test("selected custom role shows View checkbox and locked action columns", async () => {
  renderPage();
  await screen.findAllByText("CUSTOM_AUDITOR");
  const editButtons = screen.getAllByRole("button", { name: "roleManagement.edit" });
  fireEvent.click(editButtons[0]);

  const screenMatrix = await screen.findByRole("region", { name: "roleManagement.screenPermissionMatrix" });
  expect(within(screenMatrix).getByText("roleManagement.action.view")).toBeInTheDocument();
  expect(within(screenMatrix).getByText("roleManagement.action.create")).toBeInTheDocument();
  expect(within(screenMatrix).getByRole("checkbox", { name: "CUSTOM_AUDITOR page.reports view" })).toBeEnabled();
  expect(within(screenMatrix).getByRole("checkbox", { name: "CUSTOM_AUDITOR page.roleManagement view" })).toBeDisabled();
  expect(within(screenMatrix).getAllByText("roleManagement.actionNotApplicable").length).toBeGreaterThan(0);
});
