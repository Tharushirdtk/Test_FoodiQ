import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FiArrowLeft } from "react-icons/fi";
import NotificationsButton from "../components/NotificationsButton";
import QuickNavSidebar from "../components/QuickNavSidebar";
import orderService from "../services/orderService";
import api from "../utils/apiClient";
import Dropdown from "../components/Dropdown";
import DatePicker from "../components/DatePicker";
import ordersService from "../services/ordersService";
import TimeSeriesChart from "../components/TimeSeriesChart";
import analyticsService from "../services/analyticsService";
import "../styles/SubPage.css";
import "../styles/WalletPage.css";
import "../styles/AdminDashboard.css";
import "../styles/AdminDashboardExport.css";
import "../styles/TimeSeriesChart.css";

const rangeOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const WalletPage = () => {
  const { user, role } = useAuth();
  const [earnings, setEarnings] = useState({ total: 0, orders: [] });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // match admin naming (sampling) so behaviour and prop names align
  const [sampling, setSampling] = useState("monthly");
  const [series, setSeries] = useState([]);

  // make analytics accordion default open like admin so UI is identical
  const [analyticsOpen, setAnalyticsOpen] = useState(true);

  // date range controls
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);

  // compute default range dates (copied from AdminDashboard)
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

  // fetch assigned/completed orders and the analytics series
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        if (role === 'vendor') {
          // vendor: call aggregated vendor orders endpoint
          const uid = (user && user._id) || (window.__USER__ && window.__USER__._id) || localStorage.getItem('userId');
          if (!uid) throw new Error('Missing vendor id');
          const res = await api.get(`/vendors/${uid}/orders`, { params: { aggregated: true } });
          const orders = Array.isArray(res.data?.orders) ? res.data.orders : [];
          let total = typeof res.data?.totalVendorRevenue === 'number' ? res.data.totalVendorRevenue : orders.reduce((s,o)=>s+(o.orderVendorRevenue||0),0);
          total = Math.round((total || 0) * 100) / 100;
          // normalize to driverRevenue field used by this UI so minimal FE changes are required
          const mapped = orders.map(o => ({ ...o, driverRevenue: Math.round((o.orderVendorRevenue || 0) * 100) / 100 }));
          if (!mounted) return;
          setEarnings({ total, orders: mapped });
        } else {
          // driver/admin: keep previous behaviour (driver history)
          const history = await orderService.getDriverHistory({});
          if (!mounted) return;
          const completed = Array.isArray(history) ? history.filter((o) => ['delivered', 'picked_up_my_order', 'completed'].includes(o.status)) : [];
          const totalRaw = completed.reduce((s, o) => s + (o.driverRevenue || 0), 0);
          const total = Math.round(totalRaw * 100) / 100;
          const mapped = completed.map(o => ({ ...o, driverRevenue: Math.round((o.driverRevenue || 0) * 100) / 100 }));
          setEarnings({ total, orders: mapped });
        }
      } catch (e) {
        console.error("Failed to load orders", e);
        setEarnings({ total: 0, orders: [] });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
    // re-run when role/user changes
  }, [role, user]);

  // helper to fetch entity-specific series (vendor/driver)
  const fetchSeries = useCallback(
    async (opts = {}) => {
      try {
        const uid =
          (user && user._id) ||
          (window.__USER__ && window.__USER__._id) ||
          localStorage.getItem("userId") ||
          null;
        const entity = role === "vendor" ? "vendor" : "driver";
        if (!uid) return;
        const params = { entity, entityId: uid };
        const fmtLocalDate = (d) => {
          if (!d) return null;
          const y = d.getFullYear();
          const m = `${d.getMonth() + 1}`.padStart(2, '0');
          const day = `${d.getDate()}`.padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        if (opts.from || fromDate) params.from = fmtLocalDate(opts.from || fromDate);
        if (opts.to || toDate) params.to = fmtLocalDate(opts.to || toDate);
        params.interval = opts.sampling || sampling;
        const res = await analyticsService.getRevenueSeries(params);
        setSeries(res.series || []);
      } catch (e) {
        console.error("Failed to load analytics series", e);
        setSeries([]);
      }
    },
    [fromDate, toDate, sampling, role, user]
  );

  // fetch when sampling or date range changes
  useEffect(() => {
    fetchSeries();
  }, [sampling, fromDate, toDate, fetchSeries]);

  // also fetch when accordion is opened (match admin behaviour)
  useEffect(() => {
    if (analyticsOpen) {
      fetchSeries();
    }
  }, [analyticsOpen, fetchSeries]);

  const handleExportOrders = async () => {
    try {
      const params = {};
      if (fromDate) params.from = fromDate.toISOString().slice(0, 10);
      if (toDate) params.to = toDate.toISOString().slice(0, 10);
      // backend will restrict vendor/driver to their own data
      const blob = await ordersService.exportOrdersCsv(params);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-export-${params.from || "all"}-${
        params.to || "all"
      }.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export CSV", e);
      alert("Failed to export CSV");
    }
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate("/account")}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Wallet</h1>
        <div style={{ marginLeft: "auto" }}>
          <NotificationsButton />
        </div>
      </header>

      <div className="sub-content">
        <div className="info-section">
          {loading ? (
            <div className="loading-spinner-container">
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <div className="wallet-page modern-wallet">
              {/* top row: total + sampling dropdown (matches AdminDashboard layout) */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div>
                  <div className="wallet-balance">
                    <div className="wallet-amount">Rs {Number(earnings.total || 0).toFixed(2)}</div>
                    <div className="wallet-label">Total earnings</div>
                  </div>
                </div>
              </div>

              <div
                className={`admin-accordion ${analyticsOpen ? "open" : ""}`}
                style={{ marginTop: 28 }}
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

                      <h3 style={{ marginTop: 0 }}>Completed orders</h3>
                      <div style={{ height: 280 }}>
                        <TimeSeriesChart
                          series={series}
                          labelKey="period"
                          valueKey={role === 'vendor' ? 'value' : 'driverRevenue'}
                          title={role === 'vendor' ? 'Revenue' : 'Driver Revenue'}
                          color="#2196f3"
                          sampling={sampling}
                          xMin={fromDate}
                          xMax={toDate}
                        />
                      </div>

                      {/* Export controls row - match AdminDashboard styling */}
                      <div className="admin-export-wrapper">
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

              <div className="history-cards">
                {earnings.orders.map((o) => (
                  <div key={o._id} className="history-card">
                    <div className="history-card-row">
                      <div className="history-card-title">
                        #{String(o._id).slice(-6).toUpperCase()}
                      </div>
                      <div className="history-card-badge">
                        Rs {Number(o.driverRevenue || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="history-card-meta">
                      Delivered on: {new Date(o.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}

                {earnings.orders.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon">$</div>
                    <h3>No completed orders yet.</h3>
                    <p>
                      Your wallet will populate after deliveries are completed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <QuickNavSidebar />
    </div>
  );
};

export default WalletPage;
