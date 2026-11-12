import React, { useCallback, useEffect, useState } from "react";
import {
  BriefcaseMedical,
  Building2,
  Check,
  CircleHelp,
  HeartPulse,
  KeyRound,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  formatLocalizedDate,
  getAccountStatusLabel,
  getLocalizedMasterName,
  getRoleLabel,
} from "../../i18n/displayLabels";
import { apiMessage } from "../../i18n/translate";
import { Alert, Button, Card, Modal, TextField } from "../../components/ui";
import "./RoleManagement.css";

const EMPTY_ROLE = { name: "", name_te: "", code: "", description: "" };

export default function RoleManagement() {
  const { user: currentUser } = useAuth();
  const { t, tm, language } = useLanguage();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState(EMPTY_ROLE);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState(null);
  const [roleUsersLoading, setRoleUsersLoading] = useState(false);
  const [roleUsersError, setRoleUsersError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rbacUsers, setRbacUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userPagination, setUserPagination] = useState({ page: 1, total_pages: 0, total: 0 });
  const [userRoleEdits, setUserRoleEdits] = useState({});
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [roleStatusFilter, setRoleStatusFilter] = useState("ALL");
  const [roleTypeFilter, setRoleTypeFilter] = useState("ALL");
  const [roleCodeFilter, setRoleCodeFilter] = useState("ALL");

  // Custom role names are typed by an administrator; name_te is used when the database has one
  const roleName = (role) => role.is_protected
    ? getRoleLabel(role.code, language)
    : getLocalizedMasterName({ name_en: role.name, name_te: role.name_te }, language);

  const filteredRoles = roles.filter((role) => {
    const query = roleSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || [role.name, role.name_te, role.code, role.description]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query));
    const matchesStatus = roleStatusFilter === "ALL"
      || (role.is_active ? "ACTIVE" : "INACTIVE") === roleStatusFilter;
    const matchesType = roleTypeFilter === "ALL"
      || (role.is_protected ? "BUILT_IN" : "CUSTOM") === roleTypeFilter;
    const matchesRole = roleCodeFilter === "ALL" || role.code === roleCodeFilter;
    return matchesQuery && matchesStatus && matchesType && matchesRole;
  });
  const roleStats = {
    total: roles.length,
    active: roles.filter((role) => role.is_active).length,
    builtIn: roles.filter((role) => role.is_protected).length,
    users: roles.reduce((total, role) => total + (Number(role.assigned_users) || 0), 0),
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roleResponse, permissionResponse] = await Promise.all([
        api.get("/admin/roles"),
        api.get("/admin/permissions"),
      ]);
      setRoles(roleResponse.data.roles);
      setPermissions(permissionResponse.data.permissions);
    } catch (requestError) {
      setError(apiMessage(requestError, "roleManagement.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const response = await api.get("/admin/users", {
        params: { search: userSearch, page: userPage, limit: 20 },
      });
      setRbacUsers(response.data.users || []);
      setUserPagination(response.data.pagination);
      setUserRoleEdits({});
    } catch (requestError) {
      setUsersError(apiMessage(requestError, "roleManagement.usersFailed"));
    } finally {
      setUsersLoading(false);
    }
  }, [userPage, userSearch]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const resetForm = () => {
    setSelectedRole(null);
    setForm(EMPTY_ROLE);
    setSelectedPermissions([]);
    setRoleFormOpen(false);
  };

  const editRole = (role) => {
    setRoleFormOpen(true);
    setSelectedRole(role);
    setForm({ name: role.name, name_te: role.name_te || "", code: role.code, description: role.description || "" });
    setSelectedPermissions(
      permissions.filter((permission) => role.permissions.includes(permission.code)).map((item) => Number(item.id))
    );
    setAssignedUsers(null);
    setError("");
  };

  const togglePermission = (permissionId) => {
    setSelectedPermissions((current) => current.includes(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId]);
  };

  const saveRole = async (event) => {
    event.preventDefault();
    if (selectedRole && !window.confirm(t("roleManagement.confirmRoleDetails"))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (selectedRole) {
        await api.patch(`/admin/roles/${selectedRole.id}`, form);
        setMessage("roleManagement.detailsSaved");
        await loadData();
      } else {
        const response = await api.post("/admin/roles", {
          ...form,
          permission_ids: selectedPermissions,
        });
        setMessage({ key: "roleManagement.created", values: { code: response.data.role.code } });
        resetForm();
        await loadData();
      }
    } catch (requestError) {
      setError(apiMessage(requestError, "roleManagement.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    if (!window.confirm(t("roleManagement.confirmPermissions", { code: selectedRole.code }))) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/admin/roles/${selectedRole.id}/permissions`, {
        permission_ids: selectedPermissions,
      });
      setMessage("roleManagement.permissionsSaved");
      await loadData();
    } catch (requestError) {
      setError(apiMessage(requestError, "roleManagement.permissionsFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = async (role) => {
    if (!window.confirm(t("roleManagement.confirmRoleStatus", { code: role.code }))) return;
    setError("");
    setMessage("");
    try {
      await api.patch(`/admin/roles/${role.id}/status`, { is_active: !role.is_active });
      setMessage({
        key: role.is_active ? "roleManagement.deactivated" : "roleManagement.activated",
        values: { code: role.code },
      });
      await loadData();
    } catch (requestError) {
      setError(apiMessage(requestError, "roleManagement.statusFailed"));
    }
  };

  const showUsers = async (role) => {
    setAssignedUsers({ role, users: [] });
    setRoleUsersLoading(true);
    setRoleUsersError("");
    try {
      const response = await api.get(`/admin/roles/${role.id}/users`);
      setAssignedUsers({ role, users: response.data.users || [] });
    } catch (requestError) {
      setRoleUsersError(apiMessage(requestError, "roleManagement.usersFailed"));
    } finally {
      setRoleUsersLoading(false);
    }
  };

  const assignUserRole = async (account) => {
    const roleId = Number(userRoleEdits[account.id] ?? account.role_id);
    if (!Number.isSafeInteger(roleId) || roleId === Number(account.role_id)) return;
    const nextRole = roles.find((role) => Number(role.id) === roleId);
    const currentRole = roles.find((role) => Number(role.id) === Number(account.role_id));
    if (!nextRole || !window.confirm(t("roleManagement.confirmUserRole", {
      name: account.full_name,
      oldRole: currentRole ? roleName(currentRole) : account.role_code,
      newRole: roleName(nextRole),
    }))) return;

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.patch(`/admin/users/${account.id}/role`, { role_id: roleId });
      setMessage("roleManagement.userRoleSaved");
      await Promise.all([loadUsers(), loadData()]);
    } catch (requestError) {
      setError(apiMessage(requestError, "roleManagement.userRoleFailed"));
    } finally {
      setSaving(false);
    }
  };

  const updateMatrixPermission = async (role, permission, checked) => {
    if (!role || role.is_protected || !permission.assignable) return;
    const currentIds = (role.permission_ids || []).map(Number);
    const currentCodes = role.permissions || [];
    const nextIds = checked
      ? [...new Set([...currentIds, Number(permission.id)])]
      : currentIds.filter((id) => id !== Number(permission.id));
    const nextCodes = checked
      ? [...new Set([...currentCodes, permission.code])]
      : currentCodes.filter((code) => code !== permission.code);
    if (!window.confirm(t("roleManagement.confirmPermissions", { code: role.code }))) return;
    setRoles((currentRoles) => currentRoles.map((item) => (
      Number(item.id) === Number(role.id)
        ? { ...item, permission_ids: nextIds, permissions: nextCodes }
        : item
    )));
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/admin/roles/${role.id}/permissions`, { permission_ids: nextIds });
      setMessage("roleManagement.permissionsSaved");
      await loadData();
    } catch (requestError) {
      setRoles((currentRoles) => currentRoles.map((item) => (
        Number(item.id) === Number(role.id)
          ? { ...item, permission_ids: currentIds, permissions: currentCodes }
          : item
      )));
      setError(apiMessage(requestError, "roleManagement.permissionsFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="role-management-page">
      <header className="role-management-header">
        <div>
          <div className="role-management-title-row">
            <span className="role-management-title-icon" aria-hidden="true"><ShieldCheck size={23} /></span>
            <div>
              <h1 className="page-title">{t("roleManagement.title")}</h1>
              <p className="page-subtitle">{t("roleManagement.subtitle")}</p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          icon={roleFormOpen ? RotateCcw : Plus}
          onClick={() => {
            if (roleFormOpen) {
              resetForm();
            } else {
              setRoleFormOpen(true);
              setSelectedRole(null);
              setForm(EMPTY_ROLE);
              setSelectedPermissions([]);
              window.setTimeout(() => {
                document.getElementById("role-management-form")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
              }, 0);
            }
          }}
        >
          {roleFormOpen ? t("common.cancel") : t("roleManagement.createCustomRole")}
        </Button>
      </header>

      <section className="role-stats-grid" aria-label={t("roleManagement.title")}>
        <RoleStat icon={Shield} label={t("roleManagement.totalRoles")} value={roleStats.total} tone="green" />
        <RoleStat icon={Check} label={t("roleManagement.activeRoles")} value={roleStats.active} tone="blue" />
        <RoleStat icon={KeyRound} label={t("roleManagement.builtInRoles")} value={roleStats.builtIn} tone="violet" />
        <RoleStat icon={Users} label={t("roleManagement.assignedUsers")} value={roleStats.users} tone="orange" />
      </section>

      <section className="role-filter-bar" aria-label={t("roleManagement.searchRoles")}>
        <label className="role-filter-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t("roleManagement.searchRoles")}</span>
          <input
            type="search"
            value={roleSearch}
            onChange={(event) => setRoleSearch(event.target.value)}
            placeholder={t("roleManagement.searchRolesPlaceholder")}
          />
        </label>
        <label className="sr-only" htmlFor="role-filter-status">{t("roleManagement.statusFilter")}</label>
        <select id="role-filter-status" value={roleStatusFilter} onChange={(event) => setRoleStatusFilter(event.target.value)}>
          <option value="ALL">{t("roleManagement.allStatus")}</option>
          <option value="ACTIVE">{getAccountStatusLabel("ACTIVE", language)}</option>
          <option value="INACTIVE">{getAccountStatusLabel("INACTIVE", language)}</option>
        </select>
        <label className="sr-only" htmlFor="role-filter-type">{t("roleManagement.typeFilter")}</label>
        <select id="role-filter-type" value={roleTypeFilter} onChange={(event) => setRoleTypeFilter(event.target.value)}>
          <option value="ALL">{t("roleManagement.allTypes")}</option>
          <option value="BUILT_IN">{t("roleManagement.builtIn")}</option>
          <option value="CUSTOM">{t("roleManagement.custom")}</option>
        </select>
        <label className="sr-only" htmlFor="role-filter-role">{t("roleManagement.roleFilter")}</label>
        <select id="role-filter-role" value={roleCodeFilter} onChange={(event) => setRoleCodeFilter(event.target.value)}>
          <option value="ALL">{t("roleManagement.allRoles")}</option>
          {roles.map((role) => <option key={role.id} value={role.code}>{roleName(role)}</option>)}
        </select>
        <button type="button" className="role-filter-reset" onClick={() => {
          setRoleSearch("");
          setRoleStatusFilter("ALL");
          setRoleTypeFilter("ALL");
          setRoleCodeFilter("ALL");
        }}>
          <RotateCcw size={15} aria-hidden="true" />
          {t("roleManagement.resetFilters")}
        </button>
      </section>

      {error && <div className="section"><Alert type="error">{tm(error)}</Alert></div>}
      {message && <div className="section"><Alert type="success">{tm(message)}</Alert></div>}

      <section className="role-cards-section" aria-label={t("roleManagement.rolesOverview")}>
        {loading ? (
          <div className="role-cards-grid" role="status">{[1, 2, 3].map((item) => <div className="role-card-skeleton" key={item} />)}</div>
        ) : filteredRoles.length === 0 ? (
          <div className="role-empty-state">{t("roleManagement.noMatchingRoles")}</div>
        ) : (
          <div className="role-cards-grid">
            {filteredRoles.map((role) => (
              <RoleOverviewCard
                key={role.id}
                role={role}
                name={roleName(role)}
                statusLabel={getAccountStatusLabel(role.is_active ? "ACTIVE" : "INACTIVE", language)}
                onViewUsers={() => showUsers(role)}
                viewUsersLabel={t("roleManagement.viewUsers")}
                builtInLabel={role.is_protected ? t("roleManagement.builtIn") : t("roleManagement.custom")}
                usersLabel={t("roleManagement.assignedUsers")}
              />
            ))}
          </div>
        )}
      </section>

      {roleFormOpen && <div className="section" id="role-management-form">
        <Card title={selectedRole ? t("roleManagement.editTitle", { code: selectedRole.code }) : t("roleManagement.createTitle")}>
          <form onSubmit={saveRole}>
            <div className="grid grid-2">
              <TextField
                id="role-name"
                label={t("roleManagement.roleName")}
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <TextField
                id="role-code"
                label={t("roleManagement.roleCode")}
                required
                hint={t("roleManagement.roleCodeHint")}
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              />
              <TextField
                id="role-name-te"
                label={t("roleManagement.roleNameTe")}
                value={form.name_te}
                onChange={(event) => setForm({ ...form, name_te: event.target.value })}
              />
              <TextField
                id="role-description"
                label={t("roleManagement.description")}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>

            {!selectedRole && (
              <div className="section">
                <h3>{t("roleManagement.assignPermissions")}</h3>
                <PermissionChoices
                  permissions={permissions.filter((permission) => permission.assignable)}
                  selected={selectedPermissions}
                  onToggle={togglePermission}
                />
              </div>
            )}

            <div className="table-actions">
              <Button type="submit" loading={saving}>
                {selectedRole ? t("roleManagement.saveDetails") : t("roleManagement.createRole")}
              </Button>
              {selectedRole && (
                <>
                  <Button type="button" variant="secondary" loading={saving} onClick={savePermissions}>
                    {t("roleManagement.savePermissions")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetForm}>{t("roleManagement.cancelEdit")}</Button>
                </>
              )}
            </div>
          </form>
        </Card>
      </div>}

      <div className="section role-list-section">
        <Card title={t("roleManagement.listTitle")} subtitle={t("roleManagement.filteredRoleCount", { count: filteredRoles.length })}>
          {loading ? <p>{t("roleManagement.loading")}</p> : filteredRoles.length === 0 ? <p>{t("roleManagement.empty")}</p> : (
            <div className="table-scroll role-table-scroll">
              <table className="data-table role-list-table">
                <thead>
                  <tr>
                    <th>{t("roleManagement.colRole")}</th>
                    <th>{t("roleManagement.description")}</th>
                    <th>{t("roleManagement.roleType")}</th>
                    <th>{t("roleManagement.colStatus")}</th>
                    <th>{t("roleManagement.colUsers")}</th>
                    <th>{t("roleManagement.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoles.map((role) => (
                    <tr key={role.id}>
                      <td>
                        <strong>{roleName(role)}</strong>
                        <div className="cell-sub">{role.code}{role.is_protected ? ` · ${t("roleManagement.protected")}` : ""}</div>
                      </td>
                      <td>{role.description || "-"}</td>
                      <td><span className={`role-type-badge ${role.is_protected ? "built-in" : "custom"}`}>{role.is_protected ? t("roleManagement.builtIn") : t("roleManagement.custom")}</span></td>
                      <td><span className={`role-status-label ${role.is_active ? "active" : "inactive"}`}>{getAccountStatusLabel(role.is_active ? "ACTIVE" : "INACTIVE", language)}</span></td>
                      <td>{role.assigned_users}</td>
                      <td>
                        <div className="table-actions">
                          {!role.is_protected && <Button size="sm" variant="ghost" onClick={() => editRole(role)}>{t("roleManagement.edit")}</Button>}
                          <Button size="sm" variant="ghost" onClick={() => showUsers(role)}>{t("roleManagement.viewUsers")}</Button>
                          {!role.is_protected && (
                            <Button
                              size="sm"
                              variant={role.is_active ? "danger" : "secondary"}
                              onClick={() => toggleRole(role)}
                            >
                              {role.is_active ? t("roleManagement.deactivate") : t("roleManagement.activate")}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {selectedRole && (
        <div className="section">
          <Card title={t("roleManagement.permissionsFor", { code: selectedRole.code })}>
            <PermissionChoices
              permissions={permissions}
              selected={selectedPermissions}
              onToggle={togglePermission}
            />
          </Card>
        </div>
      )}

      <div className="section">
        <Card
          title={t("roleManagement.pagesPanelTitle")}
          subtitle={t("roleManagement.pagesPanelSubtitle")}
        >
          {loading ? <p>{t("roleManagement.loading")}</p> : (
            <>
              <p className="cell-sub">{t("roleManagement.pagesPanelHint")}</p>
              <div className="table-scroll role-matrix-scroll" role="region" aria-label={t("roleManagement.pagesPanelTitle")} tabIndex="0">
                <table className="data-table rbac-permission-matrix role-permission-matrix">
                  <thead>
                    <tr>
                      <th scope="col" className="role-matrix-role-heading">{t("roleManagement.colRole")}</th>
                      {permissions
                        .filter((permission) => permission.resource === "page")
                        .map((permission) => (
                          <th key={permission.id} scope="col" title={permission.description || permission.code}>
                            {permission.code.replace(/^page\./, "")}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => (
                      <tr key={`page-row-${role.id}`}>
                        <th scope="row" className="role-matrix-role-cell">
                          <strong>{roleName(role)}</strong>
                          <span className="cell-sub">{role.code}</span>
                          {role.is_protected && <span className="role-matrix-protected">{t("roleManagement.protected")}</span>}
                        </th>
                        {permissions
                          .filter((permission) => permission.resource === "page")
                          .map((permission) => (
                            <td key={`page-${role.id}-${permission.id}`}>
                              <label className={`role-matrix-checkbox ${role.is_protected || !permission.assignable ? "locked" : ""}`}>
                                <input
                                  type="checkbox"
                                  aria-label={`${role.code} ${permission.code}`}
                                  checked={(role.permissions || []).includes(permission.code)}
                                  disabled={saving || role.is_protected || !permission.assignable}
                                  title={role.is_protected
                                    ? t("roleManagement.builtInPermissionsLocked")
                                    : !permission.assignable
                                      ? t("roleManagement.pagePermissionLocked")
                                      : undefined}
                                  onChange={(event) => updateMatrixPermission(role, permission, event.target.checked)}
                                />
                              </label>
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="section">
        <Card className="role-matrix-card" title={t("roleManagement.permissionsMatrix")}>
          <div className="table-scroll role-matrix-scroll" role="region" aria-label={t("roleManagement.permissionsMatrix")} tabIndex="0">
            <table className="data-table rbac-permission-matrix role-permission-matrix">
              <thead>
                <tr>
                  <th rowSpan="2" scope="col" className="role-matrix-role-heading">{t("roleManagement.colRole")}</th>
                  {groupPermissions(permissions).map(([module, modulePermissions]) => (
                    <th key={module} colSpan={modulePermissions.length} scope="colgroup" className="role-matrix-module-heading">{module}</th>
                  ))}
                </tr>
                <tr>
                  {permissions.map((permission) => (
                    <th key={permission.id} scope="col" title={permission.description || permission.code}>
                      {permission.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <th scope="row" className="role-matrix-role-cell">
                      <strong>{roleName(role)}</strong>
                      <span className="cell-sub">{role.code}</span>
                      {role.is_protected && <span className="role-matrix-protected">{t("roleManagement.protected")}</span>}
                    </th>
                    {permissions.map((permission) => (
                      <td key={permission.id}>
                        <label className={`role-matrix-checkbox ${role.is_protected || !permission.assignable ? "locked" : ""}`}>
                          <input
                            type="checkbox"
                            aria-label={`${role.code} ${permission.code}`}
                            aria-describedby="role-matrix-hint"
                            checked={(role.permissions || []).includes(permission.code)}
                            disabled={saving || role.is_protected || !permission.assignable}
                            title={role.is_protected
                              ? t("roleManagement.builtInPermissionsLocked")
                              : !permission.assignable
                                ? t("roleManagement.permissionLocked")
                                : undefined}
                            onChange={(event) => updateMatrixPermission(role, permission, event.target.checked)}
                          />
                          <span className="sr-only">
                            {role.is_protected
                              ? t("roleManagement.builtInPermissionsLocked")
                              : !permission.assignable
                                ? t("roleManagement.permissionLocked")
                                : t("roleManagement.selectPermission")}
                          </span>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="role-matrix-note" id="role-matrix-hint">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>{t("roleManagement.matrixHint")}</span>
          </p>
        </Card>
      </div>

      <div className="section">
        <Card title={t("roleManagement.permissionRegistry")}>
          <div className="role-registry-list">
            {groupPermissions(permissions).map(([module, modulePermissions]) => (
              <section key={module} className="role-registry-module">
                <h3 className="role-registry-module-title">{module}</h3>
                <div className="table-scroll role-registry-scroll" role="region" aria-label={`${module} ${t("roleManagement.permissionRegistry")}`} tabIndex="0">
                  <table className="data-table role-registry-table">
                  <thead>
                    <tr>
                      <th>{t("roleManagement.permissionCode")}</th>
                      <th>{t("roleManagement.permissionName")}</th>
                      <th>{t("roleManagement.permissionAction")}</th>
                      <th>{t("roleManagement.permissionDescription")}</th>
                      <th>{t("roleManagement.permissionLocked")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulePermissions.map((permission) => (
                      <tr key={permission.id}>
                        <td><code className="role-permission-code">{permission.code}</code></td>
                        <td><strong>{permissionName(permission.code)}</strong></td>
                        <td><span className="role-permission-action">{permission.action}</span></td>
                        <td>{permission.description || "-"}</td>
                        <td>
                          <span className={`role-assignability ${permission.assignable ? "assignable" : "locked"}`}>
                            {permission.assignable ? t("roleManagement.assignable") : t("roleManagement.permissionLocked")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </Card>
      </div>

      <div className="section">
        <Card title={t("roleManagement.userAssignments")}>
          <p className="cell-sub">{t("roleManagement.singleRoleNotice")}</p>
          {usersError && <Alert type="error">{tm(usersError)}</Alert>}
          <div className="grid grid-2">
            <TextField
              id="rbac-user-search"
              label={t("roleManagement.searchUsers")}
              value={userSearch}
              onChange={(event) => {
                setUserSearch(event.target.value);
                setUserPage(1);
              }}
            />
          </div>
          {usersLoading ? <p>{t("roleManagement.usersLoading")}</p> : rbacUsers.length === 0 ? <p>{t("roleManagement.usersEmpty")}</p> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("roleManagement.userName")}</th>
                    <th>{t("roleManagement.currentRole")}</th>
                    <th>{t("roleManagement.district")}</th>
                    <th>{t("roleManagement.facility")}</th>
                    <th>{t("roleManagement.newRole")}</th>
                    <th>{t("roleManagement.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rbacUsers.map((account) => {
                    const selectedId = Number(userRoleEdits[account.id] ?? account.role_id);
                    return (
                      <tr key={account.id}>
                        <td><strong>{account.full_name}</strong><div className="cell-sub">{account.username} · {getAccountStatusLabel(account.status, language)}</div></td>
                        <td>
                          {(() => {
                            const currentRole = roles.find((role) => Number(role.id) === Number(account.role_id));
                            return currentRole ? `${roleName(currentRole)} (${currentRole.code})` : account.role_code;
                          })()}
                        </td>
                        <td>{account.district_name_te && language === "te" ? account.district_name_te : account.district_name || t("roleManagement.noScope")}</td>
                        <td>{account.facility_name_te && language === "te" ? account.facility_name_te : account.facility_name || t("roleManagement.noScope")}</td>
                        <td>
                          <select
                            aria-label={`${t("roleManagement.newRole")} ${account.username}`}
                            value={selectedId}
                            disabled={account.id === currentUser?.id || saving}
                            onChange={(event) => setUserRoleEdits((current) => ({ ...current, [account.id]: Number(event.target.value) }))}
                          >
                            {roles.filter((role) => role.is_active).map((role) => (
                              <option key={role.id} value={role.id}>{roleName(role)}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            disabled={account.id === currentUser?.id || saving || selectedId === Number(account.role_id)}
                            loading={saving}
                            onClick={() => assignUserRole(account)}
                          >
                            {t("roleManagement.changeRole")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {userPagination.total_pages > 0 && (
            <div className="table-actions" aria-label="User role assignment pagination">
              <Button size="sm" variant="secondary" disabled={userPage <= 1 || usersLoading} onClick={() => setUserPage((page) => page - 1)}>
                {t("roleManagement.previousPage")}
              </Button>
              <span>{t("roleManagement.pageOf", { page: userPage, total: userPagination.total_pages })}</span>
              <Button size="sm" variant="secondary" disabled={userPage >= userPagination.total_pages || usersLoading} onClick={() => setUserPage((page) => page + 1)}>
                {t("roleManagement.nextPage")}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(assignedUsers)}
        title={assignedUsers ? t("roleManagement.usersFor", { code: assignedUsers.role.code }) : ""}
        onClose={() => {
          setAssignedUsers(null);
          setRoleUsersError("");
        }}
        closeLabel={t("roleManagement.close")}
        className="role-users-modal"
      >
        {roleUsersLoading ? (
          <p role="status">{t("roleManagement.usersLoading")}</p>
        ) : roleUsersError ? (
          <Alert type="error">{tm(roleUsersError)}</Alert>
        ) : assignedUsers?.users.length ? (
          <>
            <p className="role-users-count">
              {t("roleManagement.assignedUsersCount", { count: assignedUsers.users.length })}
            </p>
            <div className="role-users-table-scroll">
              <table className="data-table role-users-table">
                <thead>
                  <tr>
                    <th>{t("roleManagement.userName")}</th>
                    <th>{t("roleManagement.username")}</th>
                    <th>{t("roleManagement.colStatus")}</th>
                    <th>{t("roleManagement.createdAt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedUsers.users.map((account) => (
                    <tr key={account.id}>
                      <td><strong>{account.full_name || t("common.notProvided")}</strong></td>
                      <td>{account.username || t("common.notProvided")}</td>
                      <td>
                        <span className={`role-status-label ${account.status === "ACTIVE" ? "active" : "inactive"}`}>
                          <span aria-hidden="true" />
                          {getAccountStatusLabel(account.status || "UNKNOWN", language)}
                        </span>
                      </td>
                      <td>{formatLocalizedDate(account.created_at, language) || t("common.notAvailable")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="role-users-empty">{t("roleManagement.noUsers")}</p>
        )}
      </Modal>
    </div>
  );
}

// Permission codes are technical identifiers; their descriptions come from the
// database (mst_permissions.description), which has no Telugu column yet.
function PermissionChoices({ permissions, selected, onToggle }) {
  const { t } = useLanguage();
  if (!permissions.length) return <p>{t("roleManagement.noPermissions")}</p>;
  return (
    groupPermissions(permissions).map(([module, modulePermissions]) => (
      <section key={module} className="section">
        <h4>{module}</h4>
        <div className="grid grid-2">
          {modulePermissions.map((permission) => (
            <label key={permission.id} className="checkbox">
              <input
                type="checkbox"
                checked={selected.includes(Number(permission.id))}
                onChange={() => onToggle(Number(permission.id))}
              />
              <span>
                <strong>{permission.code}</strong>
                {permission.description && <small className="cell-sub">{permission.description}</small>}
              </span>
            </label>
          ))}
        </div>
      </section>
    ))
  );
}

function RoleStat({ icon: Icon, label, value, tone }) {
  return (
    <article className={`role-stat-card role-stat-${tone}`}>
      <span className="role-stat-icon" aria-hidden="true"><Icon size={22} /></span>
      <div className="role-stat-copy">
        <span className="role-stat-label">{label}</span>
        <strong className="role-stat-value">{value}</strong>
      </div>
    </article>
  );
}

function RoleOverviewCard({ role, name, statusLabel, onViewUsers, viewUsersLabel, builtInLabel, usersLabel }) {
  const roleCode = role.code.toUpperCase();
  const RoleIcon = roleCode.includes("SUPER")
    ? ShieldCheck
    : roleCode.includes("DISTRICT")
      ? Shield
      : roleCode.includes("FACILITY")
        ? Building2
        : roleCode.includes("MEDICAL")
          ? Stethoscope
          : roleCode.includes("HEALTH")
            ? HeartPulse
            : roleCode.includes("SPECIALIST")
              ? BriefcaseMedical
              : CircleHelp;

  return (
    <article className="role-overview-card">
      <span className="role-overview-icon" aria-hidden="true"><RoleIcon size={21} /></span>
      <div className="role-overview-content">
        <div className="role-overview-heading">
          <h2>{name}</h2>
          <span className={`role-type-badge ${role.is_protected ? "built-in" : "custom"}`}>{builtInLabel}</span>
        </div>
        <p className="role-overview-description">{role.description || role.code}</p>
        <p className="role-overview-users">{usersLabel}: <strong>{Number(role.assigned_users) || 0}</strong></p>
        <div className="role-overview-footer">
          <span className={`role-status-label ${role.is_active ? "active" : "inactive"}`}>
            <span aria-hidden="true" />{statusLabel}
          </span>
          <Button size="sm" variant="secondary" onClick={onViewUsers}>{viewUsersLabel}</Button>
        </div>
      </div>
    </article>
  );
}

function groupPermissions(permissions) {
  const grouped = new Map();
  permissions.forEach((permission) => {
    const module = permission.resource || "other";
    if (!grouped.has(module)) grouped.set(module, []);
    grouped.get(module).push(permission);
  });
  return [...grouped.entries()];
}

function permissionName(code) {
  return String(code || "")
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(" ");
}
