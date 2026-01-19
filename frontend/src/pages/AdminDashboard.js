import React, { useEffect, useState, useCallback } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import adminService from "../services/adminService";
import analyticsService from "../services/analyticsService";
import DatePicker from "../components/DatePicker";
import api from "../utils/apiClient";
import { useAuth } from "../context/AuthContext";
import ProtectedRoute from "../components/ProtectedRoute";
import Dropdown from "../components/Dropdown";
import TimeSeriesChart from "../components/TimeSeriesChart";
import ConfirmDialog from "../components/ConfirmDialog";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import NotificationsButton from "../components/NotificationsButton";
import Pagination from "../components/Pagination";
import LoadingSpinner from "../components/LoadingSpinner";
import "../styles/AdminDashboard.css";
import "../styles/AdminDashboardExport.css";
import "../styles/TimeSeriesChart.css";

const AdminDashboard = () => {
  useAuth();
  const navigate = useNavigate();

  // stats & analytics
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [sampling, setSampling] = useState("monthly");
  const [platformSeries, setPlatformSeries] = useState([]);

  // vendors for order export filter
  const [vendors, setVendors] = useState([]);
  const [vendorFilter, setVendorFilter] = useState("");
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);

  // export controls state
  const [exportChart, setExportChart] = useState("orders");

  // accordion state
  const [usersOpen, setUsersOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(true);

  const rangeOptions = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ];

  const chartOptions = [
    { value: "totalRevenue", label: "Total Revenue export" },
    { value: "driverRevenue", label: "Driver Revenue export" },
    { value: "platformFee", label: "Platform Fee export" },
    { value: "orders", label: "orders export" },
  ];

  // users list & filters
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [roleOptions, setRoleOptions] = useState([
    "customer",
    "driver",
    "support",
    "admin",
    "vendor",
  ]);

  // pagination / loading / UI states
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // user form modal state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "customer",
  });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  // delete confirm dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);

  // view user modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUserData, setSelectedUserData] = useState(null);
  const [userModalLoading, setUserModalLoading] = useState(false);

  // load basic stats and vendor list on mount
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoadingStats(true);
      try {
        const s = await adminService.getStats();
        if (!mounted) return;
        setStats(s || null);
      } catch (e) {
        console.error("Failed to fetch stats", e);
        setStats(null);
      } finally {
        if (mounted) setLoadingStats(false);
      }
    })();

    (async () => {
      try {
        const res = await adminService.listUsers({
          roles: "vendor",
          limit: 1000,
        });
        if (mounted) setVendors(res.users || []);
      } catch (e) {
        console.error("Failed to load vendors", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // compute default from/to when sampling changes (only used to get defaults initially)
  const computeRangeDates = (r) => {
    const now = new Date();
    let from;
    let to = new Date(now);
    to.setHours(23, 59, 59, 999);
    switch (r) {
      case "daily":
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "weekly":
        from = new Date(now);
        from.setDate(now.getDate() - 6);
        from.setHours(0, 0, 0, 0);
        break;
      case "monthly":
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "yearly":
        from = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { from, to };
  };

  // set initial from/to on mount only
  useEffect(() => {
    const { from, to } = computeRangeDates(sampling);
    setFromDate(from);
    setToDate(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeStartOfDay = (d) => {
    if (!d) return null;
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  };

  const normalizeEndOfDay = (d) => {
    if (!d) return null;
    const nd = new Date(d);
    nd.setHours(23, 59, 59, 999);
    return nd;
  };

  // helper to fetch platform analytics series (used by multiple triggers)
  const fetchPlatformSeries = React.useCallback(async () => {
    try {
      const params = { entity: "platform" };
      const fmtLocalDate = (d) => {
        if (!d) return null;
        const y = d.getFullYear();
        const m = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      if (fromDate) params.from = fmtLocalDate(fromDate);
      if (toDate) params.to = fmtLocalDate(toDate);
      if (sampling) params.interval = sampling;
      const res = await analyticsService.getRevenueSeries(params);
      setPlatformSeries(res.series || []);
    } catch (e) {
      console.error("Failed to load platform series", e);
    }
  }, [fromDate, toDate, sampling]);

  // fetch when sampling or date range changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await fetchPlatformSeries();
    })();
    return () => {
      mounted = false;
    };
  }, [sampling, fromDate, toDate, fetchPlatformSeries]);

  // also fetch when analytics accordion is expanded
  useEffect(() => {
    if (analyticsOpen) {
      fetchPlatformSeries();
    }
    // only care about analyticsOpen changes
  }, [analyticsOpen, fetchPlatformSeries]);

  // load users (function used multiple places)
  const loadUsers = useCallback(
    async ({
      page: p = page,
      search: q = search,
      roles: r = selectedRoles,
    } = {}) => {
      setLoading(true);
      setError("");
      try {
        const params = { page: p, limit: 20 };
        if (q) params.search = q;
        if (r && Array.isArray(r) && r.length > 0) params.roles = r.join(",");
        const res = await adminService.listUsers(params);
        setUsers(res.users || []);
        setTotal(res.total || 0);
        setPages(res.pages || 1);
        setPage(res.page || p);

        // Only update roleOptions if we get valid data from API
        if (
          res.filters &&
          Array.isArray(res.filters.roles) &&
          res.filters.roles.length > 0
        ) {
          const normalized = res.filters.roles
            .map((r) => {
              if (typeof r === "string") return r;
              if (!r) return "";
              return r.value || r.name || r.key || r.label || String(r);
            })
            .filter(Boolean);

          // Only set if we got valid normalized options
          if (normalized.length > 0) {
            setRoleOptions(normalized);
            console.log("AdminDashboard: setRoleOptions ->", normalized);
          }
          // Otherwise keep the default roleOptions
        }
        // If no filters from API, keep the default roleOptions
      } catch (e) {
        console.error("Failed to load users", e);
        setError("Failed to load users");
      } finally {
        setLoading(false);
      }
    },
    [page, search, selectedRoles]
  );

  // initial users load on mount
  useEffect(() => {
    loadUsers({ page: 1, search: "", roles: [] });
  }, [loadUsers]);

  // load users when the User Management accordion is opened
  useEffect(() => {
    if (usersOpen) {
      setPage(1);
      loadUsers({ page: 1, search, roles: selectedRoles });
    }
    // only trigger when usersOpen changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersOpen]);

  // debounce search + reload
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      loadUsers({ page: 1, search, roles: selectedRoles });
    }, 300);
    return () => clearTimeout(t);
  }, [search, selectedRoles, loadUsers]);

  // reload when selected roles change (immediate)
  useEffect(() => {
    setPage(1);
    loadUsers({ page: 1, search, roles: selectedRoles });
  }, [selectedRoles, loadUsers, search]);

  const handleEdit = (u) => {
    setEditing(u._id);
    setForm({
      name: u.name || "",
      email: u.email || "",
      password: "",
      role: u.role || "customer",
    });
    setShowForm(true);
    setFormError("");
    setFormErrors({});
  };

  const handleDelete = (id) => {
    setDeletingUserId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteUser = async () => {
    if (!deletingUserId) return;
    try {
      await adminService.deleteUser(deletingUserId);
      await loadUsers({ page, search, roles: selectedRoles });
    } catch (e) {
      console.error("Delete failed", e);
      setError("Failed to delete user");
    } finally {
      setShowDeleteConfirm(false);
      setDeletingUserId(null);
    }
  };

  const gotoPage = (p) => {
    if (p < 1) return;
    setPage(p);
    loadUsers({ page: p, search, roles: selectedRoles });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    setFormErrors({});
    try {
      if (editing) {
        await adminService.updateUser(editing, form);
      } else {
        await adminService.createUser(form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: "", email: "", password: "", role: "customer" });
      await loadUsers({ page, roles: selectedRoles });
    } catch (e) {
      console.error("Save user failed", e);
      const resp = e?.response?.data;
      const msg = resp?.message || "Failed to save user";
      setFormError(msg);
      setFormErrors(resp?.errors || {});
    } finally {
      setSaving(false);
    }
  };

  // small helper to safely format revenue
  const formatRevenue = (val) => {
    const n = Number(val || 0);
    return n.toLocaleString();
  };

  // helper to build avatar URL (handles filenames, absolute urls and leading /uploads paths)
  const getAvatarUrl = (avatar) => {
    if (!avatar) return null;
    try {
      if (/^https?:\/\//.test(avatar)) return avatar;
      const defaultBackendPort = "5000";
      const inferredBackend = `${window.location.protocol}//${window.location.hostname}:${defaultBackendPort}`;
      const apiBase =
        process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()
          ? process.env.REACT_APP_API_URL.replace(/\/$/, "")
          : inferredBackend;
      if (avatar.startsWith("/")) return apiBase + avatar;
      return `${apiBase}/uploads/avatars/${avatar}`;
    } catch (e) {
      return avatar;
    }
  };

  // export orders handler (shared)
  const handleExportOrders = async () => {
    try {
      const params = {};
      // chart selection and sampling interval
      params.chart = exportChart;
      params.interval = sampling;
      if (vendorFilter && exportChart === "orders")
        params.vendorId = vendorFilter;
      const fmtLocalDate = (d) => {
        if (!d) return null;
        const y = d.getFullYear();
        const m = `${d.getMonth() + 1}`.padStart(2, '0');
        const day = `${d.getDate()}`.padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      if (fromDate) params.from = fmtLocalDate(fromDate);
      if (toDate) params.to = fmtLocalDate(toDate);
      const blob = await adminService.exportOrdersCsv(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportChart}-export${
        vendorFilter && exportChart === "orders" ? `-${vendorFilter}` : ""
      }-${params.from || "all"}-${params.to || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export orders CSV", e);
      alert("Failed to export orders CSV");
    }
  };

  // open user modal by fetching details (keeps modal logic simple)
  const openUserModal = async (userId, fallbackData = null) => {
    setShowUserModal(true);
    setUserModalLoading(true);
    setSelectedUserData(null);
    try {
      const resp = await api.get(`/admin/users/${userId}`);
      setSelectedUserData(resp.data.user || resp.data || fallbackData);
    } catch (e) {
      console.error("Failed to fetch user details", e);
      setSelectedUserData(fallbackData);
    } finally {
      setUserModalLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredRoles="admin">
      <div className="account-page">
        <header className="account-header">
          <button
            className="btn btn-icon logo-btn"
            onClick={() => navigate("/")}
          >
            <img
              src="/images/logo.png"
              alt="FoodIQ"
              className="header-logo-small"
            />
          </button>
          <h1>Admin Dashboard</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <NotificationsButton />
          </div>
        </header>

        <div className="account-content">
          <div className="admin-stats">
            {loadingStats ? (
              <p>Loading stats...</p>
            ) : stats ? (
              <>
                <div className="admin-stats-grid">
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Users</div>
                    <div className="admin-stat-value">
                      {stats.userCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Customers</div>
                    <div className="admin-stat-value">
                      {stats.customerCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Support</div>
                    <div className="admin-stat-value">
                      {stats.supportCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Orders</div>
                    <div className="admin-stat-value">
                      {stats.orderCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Products</div>
                    <div className="admin-stat-value">
                      {stats.productCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Vendors</div>
                    <div className="admin-stat-value">
                      {stats.vendorCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Drivers</div>
                    <div className="admin-stat-value">
                      {stats.driverCount ?? 0}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Revenue</div>
                    <div className="admin-stat-value">
                      Rs {formatRevenue(stats.revenue)}
                    </div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Sales Tax Collected</div>
                    <div className="admin-stat-value">Rs {formatRevenue(stats.totalSalesTax || 0)}</div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Platform Cut</div>
                    <div className="admin-stat-value">Rs {formatRevenue(stats.totalPlatformCut || 0)}</div>
                  </div>
                  <div className="admin-stat-card">
                    <div className="admin-stat-label">Driver Platform Cut</div>
                    <div className="admin-stat-value">Rs {formatRevenue(stats.totalDriverPlatformCut || 0)}</div>
                  </div>
                </div>

                {/* User Management accordion */}
                <div
                  className={`admin-accordion ${usersOpen ? "open" : ""}`}
                  style={{ marginTop: 12 }}
                >
                  <div
                    className="admin-accordion-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={usersOpen}
                    onClick={() => setUsersOpen((s) => !s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setUsersOpen((s) => !s);
                      }
                    }}
                  >
                    <h3>User Management</h3>
                  </div>

                  {usersOpen && (
                    <div className="admin-accordion-body">
                      <div style={{ marginBottom: 12 }}>
                        <button
                          className="btn"
                          onClick={() => {
                            setShowForm(true);
                            setEditing(null);
                            setForm({
                              name: "",
                              email: "",
                              password: "",
                              role: "customer",
                            });
                            setFormError("");
                            setFormErrors({});
                          }}
                        >
                          Create User
                        </button>
                        {error && (
                          <div className="error" style={{ marginTop: 8 }}>
                            {error}
                          </div>
                        )}
                      </div>

                      {/* users table header (always rendered so inputs keep focus) */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          margin: "12px 0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <input
                            placeholder="Search users by name or email"
                            value={search}
                            onChange={(e) => {
                              console.log(
                                "AdminDashboard: search input ->",
                                e.target.value
                              );
                              setSearch(e.target.value);
                            }}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid var(--border-color)",
                              minWidth: 300,
                            }}
                          />

                          <div style={{ minWidth: 240 }}>
                            <MultiSelectDropdown
                              options={roleOptions}
                              selected={selectedRoles}
                              onChange={(newSel) => {
                                console.log(
                                  "AdminDashboard: selectedRoles change ->",
                                  newSel
                                );
                                // show loading immediately when a role filter is applied
                                setLoading(true);
                                setPage(1);
                                setSelectedRoles(newSel);
                              }}
                              placeholder="Filter by role"
                              allOptionLabel="All Roles"
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            color: "var(--text-gray)",
                            fontSize: 14,
                          }}
                        >
                          {total > 0
                            ? `Showing ${(page - 1) * 20 + 1}–${Math.min(
                                total,
                                page * 20
                              )} of ${total}`
                            : "No users"}
                        </div>
                      </div>

                      {/* table area: only this region shows loading */}
                      {loading ? (
                        <div
                          className="loading-spinner-container"
                          style={{ marginTop: 24 }}
                        >
                          <LoadingSpinner />
                        </div>
                      ) : (
                        <>
                          <table className="admin-user-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {users.map((u) => (
                                <tr key={u._id}>
                                  <td>{u.name}</td>
                                  <td>{u.email}</td>
                                  <td>{u.role}</td>
                                  <td>
                                    <button
                                      className="btn btn-sm"
                                      onClick={() => handleEdit(u)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="btn btn-sm btn-view"
                                      onClick={async () =>
                                        openUserModal(u._id, u)
                                      }
                                    >
                                      View
                                    </button>
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() => handleDelete(u._id)}
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "center",
                              marginTop: 12,
                            }}
                          >
                            <small style={{ color: "var(--text-gray)" }}>
                              Page {page} of {pages} — {total} users
                            </small>
                          </div>

                          <Pagination
                            page={page}
                            pages={pages}
                            total={total}
                            perPage={20}
                            onChange={gotoPage}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Analytics accordion */}
                <div
                  className={`admin-accordion ${analyticsOpen ? "open" : ""}`}
                  style={{ marginTop: 12 }}
                >
                  <div
                    className="admin-accordion-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={analyticsOpen}
                    onClick={() => setAnalyticsOpen((s) => !s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setAnalyticsOpen((s) => !s);
                      }
                    }}
                  >
                    <h3>Analytics</h3>
                  </div>

                  {analyticsOpen && (
                    <div className="admin-accordion-body">
                      <div style={{ marginTop: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginBottom: 12,
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{ color: "var(--text-gray)", fontSize: 12 }}
                          >
                            Sampling (how often to show points):
                          </div>
                          <div style={{ minWidth: 160 }}>
                            <Dropdown
                              options={rangeOptions}
                              value={sampling}
                              onChange={setSampling}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#fff",
                            padding: 12,
                            borderRadius: 6,
                            marginBottom: 12,
                          }}
                        >
                          <h4>Total Revenue</h4>
                          <div style={{ height: 240 }}>
                            <TimeSeriesChart
                              series={platformSeries}
                              labelKey="period"
                              valueKey="totalRevenue"
                              title="Total Revenue"
                              color="#4caf50"
                              sampling={sampling}
                              xMin={fromDate}
                              xMax={toDate}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#fff",
                            padding: 12,
                            borderRadius: 6,
                            marginBottom: 12,
                          }}
                        >
                          <h4>Driver Revenue</h4>
                          <div style={{ height: 240 }}>
                            <TimeSeriesChart
                              series={platformSeries}
                              labelKey="period"
                              valueKey="driverRevenue"
                              title="Driver Revenue"
                              color="#2196f3"
                              sampling={sampling}
                              xMin={fromDate}
                              xMax={toDate}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#fff",
                            padding: 12,
                            borderRadius: 6,
                            marginBottom: 12,
                          }}
                        >
                          <h4>Platform Fee</h4>
                          <div style={{ height: 240 }}>
                            <TimeSeriesChart
                              series={platformSeries}
                              labelKey="period"
                              valueKey="platformFee"
                              title="Platform Fee"
                              color="#ff9800"
                              sampling={sampling}
                              xMin={fromDate}
                              xMax={toDate}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#fff",
                            padding: 12,
                            borderRadius: 6,
                            marginBottom: 12,
                          }}
                        >
                          <h4>Orders</h4>
                          <div style={{ height: 240 }}>
                            <TimeSeriesChart
                              series={platformSeries}
                              labelKey="period"
                              valueKey="orders"
                              title="Orders"
                              color="#9c27b0"
                              sampling={sampling}
                              xMin={fromDate}
                              xMax={toDate}
                            />
                          </div>
                        </div>

                        {/* Orders Export controls */}
                        <div
                          className={`admin-export-wrapper ${
                            exportChart === "orders" ? "has-vendor-filter" : ""
                          }`}
                        >
                          <div className="export-dates">
                            <DatePicker
                              value={fromDate}
                              onChange={(d) =>
                                setFromDate(normalizeStartOfDay(d))
                              }
                              placeholder="From"
                            />
                            <DatePicker
                              value={toDate}
                              onChange={(d) => setToDate(normalizeEndOfDay(d))}
                              placeholder="To"
                            />
                          </div>

                          <div className="export-controls-row">
                            <div className="export-chart-select">
                              <Dropdown
                                options={chartOptions}
                                value={exportChart}
                                onChange={setExportChart}
                              />
                            </div>

                            {exportChart === "orders" && (
                              <div className="export-vendor">
                                <Dropdown
                                  options={[
                                    { value: "", label: "All Vendors" },
                                    ...vendors.map((v) => ({
                                      value: v._id,
                                      label: v.name,
                                    })),
                                  ]}
                                  value={vendorFilter}
                                  onChange={setVendorFilter}
                                />
                              </div>
                            )}

                            <button
                              className="btn export-btn"
                              onClick={handleExportOrders}
                            >
                              Export Orders CSV
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p>No stats available</p>
            )}
          </div>

          {/* Create / Edit user modal */}
          {showForm && (
            <div
              className="modal-overlay"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setFormError("");
                setFormErrors({});
              }}
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2 style={{ margin: 0 }}>
                    {editing ? "Edit User" : "Create User"}
                  </h2>
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                      setFormError("");
                      setFormErrors({});
                    }}
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="modal-body">
                    {formError && (
                      <div
                        className="error-message"
                        style={{ marginBottom: 12 }}
                      >
                        {formError}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 240px" }}>
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            required
                            placeholder="Name"
                            value={form.name}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, name: e.target.value }))
                            }
                          />
                          {formErrors?.name && (
                            <div
                              className="field-error"
                              style={{
                                color: "var(--danger-color)",
                                marginTop: 6,
                              }}
                            >
                              {formErrors.name}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ flex: "1 1 240px" }}>
                        <div className="form-group">
                          <label>Email</label>
                          <input
                            required
                            placeholder="Email"
                            value={form.email}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, email: e.target.value }))
                            }
                          />
                          {formErrors?.email && (
                            <div
                              className="field-error"
                              style={{
                                color: "var(--danger-color)",
                                marginTop: 6,
                              }}
                            >
                              {formErrors.email}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ flex: "1 1 240px" }}>
                        <div className="form-group">
                          <label>Password</label>
                          <div className="password-field">
                            <input
                              type={showPassword ? "text" : "password"}
                              placeholder="Password"
                              value={form.password}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  password: e.target.value,
                                }))
                              }
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="password-toggle"
                              onClick={() => setShowPassword((s) => !s)}
                              aria-label={
                                showPassword ? "Hide password" : "Show password"
                              }
                            >
                              {showPassword ? (
                                <FiEyeOff size={18} />
                              ) : (
                                <FiEye size={18} />
                              )}
                            </button>
                          </div>
                          {formErrors?.password && (
                            <div
                              className="field-error"
                              style={{
                                color: "var(--danger-color)",
                                marginTop: 6,
                              }}
                            >
                              {formErrors.password}
                            </div>
                          )}

                          <div className="password-hint">
                            <p>Requirements:</p>
                            <ul className="password-criteria">
                              <li>At least 8 characters</li>
                              <li>At least one uppercase letter (A-Z)</li>
                              <li>At least one lowercase letter (a-z)</li>
                              <li>At least one number (0-9)</li>
                              <li>
                                At least one special character (e.g. !@#$%)
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div style={{ minWidth: 160 }}>
                        <div className="form-group">
                          <label>Role</label>
                          <Dropdown
                            options={[
                              { value: "customer", label: "Customer" },
                              { value: "driver", label: "Driver" },
                              { value: "support", label: "Support" },
                              { value: "admin", label: "Admin" },
                              { value: "vendor", label: "Vendor" },
                            ]}
                            value={form.role}
                            onChange={(val) =>
                              setForm((f) => ({ ...f, role: val }))
                            }
                            placeholder="Select role"
                          />
                          {formErrors?.role && (
                            <div
                              className="field-error"
                              style={{
                                color: "var(--danger-color)",
                                marginTop: 6,
                              }}
                            >
                              {formErrors.role}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-cancel"
                      onClick={() => {
                        setShowForm(false);
                        setEditing(null);
                        setFormError("");
                        setFormErrors({});
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-submit"
                      disabled={saving}
                    >
                      {saving
                        ? editing
                          ? "Updating..."
                          : "Creating..."
                        : editing
                        ? "Update"
                        : "Create"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* confirm delete */}
          <ConfirmDialog
            isOpen={showDeleteConfirm}
            onClose={() => {
              setShowDeleteConfirm(false);
              setDeletingUserId(null);
            }}
            onConfirm={confirmDeleteUser}
            title="Delete User"
            message="Delete this user? This action cannot be undone."
            confirmText="Delete"
            cancelText="Cancel"
            variant="danger"
          />

          {/* user details modal */}
          {showUserModal && (
            <div
              className="modal-overlay"
              onClick={() => {
                setShowUserModal(false);
                setSelectedUserData(null);
              }}
            >
              <div
                className="modal-content"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2 style={{ margin: 0 }}>User details</h2>
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowUserModal(false);
                      setSelectedUserData(null);
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body">
                  {userModalLoading ? (
                    <div style={{ textAlign: "center", padding: 24 }}>
                      <LoadingSpinner />
                    </div>
                  ) : selectedUserData ? (
                    <div style={{ display: "flex", gap: 12 }}>
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        {selectedUserData.avatar ? (
                          <img
                            src={getAvatarUrl(selectedUserData.avatar)}
                            alt={
                              selectedUserData.displayName ||
                              selectedUserData.name ||
                              "user"
                            }
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              background: "var(--bg-light, #f4f4f4)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ color: "var(--text-muted, #999)" }}>No image</span>
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1 }}>
                        <h3>
                          {selectedUserData.displayName ||
                            selectedUserData.name}
                        </h3>
                        <div style={{ color: "var(--text-gray, #666)" }}>
                          {selectedUserData.email}
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <strong>Role:</strong> {selectedUserData.role}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <strong>Phone:</strong>{" "}
                          {selectedUserData.phone || "Not set"}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <strong>Phone verified:</strong>{" "}
                          {selectedUserData.phoneVerified ? "Yes" : "No"}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <strong>Email verified:</strong>{" "}
                          {selectedUserData.emailVerified ? "Yes" : "No"}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <strong>Created:</strong>{" "}
                          {selectedUserData.createdAt
                            ? new Date(
                                selectedUserData.createdAt
                              ).toLocaleString()
                            : "Unknown"}
                        </div>

                        {selectedUserData.birthdate && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Birthdate:</strong>{" "}
                            {new Date(
                              selectedUserData.birthdate
                            ).toLocaleDateString()}
                          </div>
                        )}

                        {selectedUserData.gender && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Gender:</strong> {selectedUserData.gender}
                          </div>
                        )}

                        {Array.isArray(selectedUserData.contacts) &&
                          selectedUserData.contacts.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <strong>Contacts:</strong>
                              <div style={{ marginTop: 6 }}>
                                {selectedUserData.contacts.map((c, idx) => (
                                  <div
                                    key={idx}
                                    style={{ fontSize: 13, color: "var(--text-dark, #444)" }}
                                  >
                                    {c.label}: {c.number}{" "}
                                    {c.verified ? "✓" : ""}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {selectedUserData.driverProfile && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Vehicle:</strong>{" "}
                            {selectedUserData.driverProfile.vehicleNumber
                              ? "Hidden"
                              : "None"}
                          </div>
                        )}

                        {selectedUserData.vendorProfile && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Location:</strong>{" "}
                            {selectedUserData.vendorProfile.storeAddress &&
                            typeof selectedUserData.vendorProfile
                              .storeAddress === "object"
                              ? `${
                                  selectedUserData.vendorProfile.storeAddress
                                    .street || ""
                                } ${
                                  selectedUserData.vendorProfile.storeAddress
                                    .city || ""
                                } ${
                                  selectedUserData.vendorProfile.storeAddress
                                    .country || ""
                                }`.trim()
                              : selectedUserData.vendorProfile.storeAddress ||
                                `${selectedUserData.vendorProfile.city || ""} ${
                                  selectedUserData.vendorProfile.country || ""
                                }`}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: 24 }}>
                      <div>No user data available.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default AdminDashboard;
