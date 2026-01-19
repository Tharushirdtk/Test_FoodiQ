import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";
import {
  FiArrowLeft,
  FiCheck,
  FiPackage,
  FiTruck,
  FiMapPin,
  FiX,
} from "react-icons/fi";
import "../styles/OrderTrackingPage.css";
import { useSocket } from "../context/SocketContext";
import orderService from "../services/orderService";
import productService from "../services/productService";
import driverService from "../services/driverService";
import DriverCard from "../components/DriverCard";
import DriverModal from "../components/DriverModal";
import VendorModal from "../components/VendorModal";
import DriverChatModal from "../components/DriverChatModal";
import NotificationsButton from "../components/NotificationsButton";
import ChatNavigator from "../components/ChatNavigator";
import ConfirmDialog from "../components/ConfirmDialog";

const OrderTrackingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  useCart();
  const { joinOrder, leaveOrder, on } = useSocket();
  const { user, role } = useAuth();
  const [viewersCount, setViewersCount] = useState(0);
  const [assignedByOther, setAssignedByOther] = useState(null);
  const [liveOrder, setLiveOrder] = useState(null);

  const [driver, setDriver] = useState(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverModalId, setDriverModalId] = useState(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorModalId, setVendorModalId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [vendorChatOpen, setVendorChatOpen] = useState(false);
  const [customerChatOpen, setCustomerChatOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionProcessing, setActionProcessing] = useState(false);

  // Build status timeline dynamically using order timestamps when available
  const statusFlow = (() => {
    const svc = (liveOrder && liveOrder.serviceType) ? String(liveOrder.serviceType).toLowerCase() : 'delivery';
    if (svc === 'pickup') {
      return [
        { key: 'order_placed', title: 'Order Placed', icon: <FiCheck size={20} /> },
        { key: 'order_confirmed', title: 'Order Confirmed', icon: <FiCheck size={20} /> },
        { key: 'preparing_your_meal', title: 'Preparing your meal', icon: <FiPackage size={20} /> },
        { key: 'ready_for_pickup', title: 'Ready for Pickup', icon: <FiPackage size={20} /> },
        { key: 'picked_up_my_order', title: 'Picked Up', icon: <FiCheck size={20} /> },
      ];
    }
    return [
      { key: 'order_placed', title: 'Order Placed', icon: <FiCheck size={20} /> },
      { key: 'order_confirmed', title: 'Order Confirmed', icon: <FiCheck size={20} /> },
      { key: 'preparing_your_meal', title: 'Preparing your meal', icon: <FiPackage size={20} /> },
      { key: 'ready_for_pickup', title: 'Ready for Pickup', icon: <FiPackage size={20} /> },
      { key: 'driver_assigned', title: 'Driver Assigned', icon: <FiTruck size={20} /> },
      { key: 'out_for_delivery', title: 'Out for Delivery', icon: <FiTruck size={20} /> },
      { key: 'order_picked_up', title: 'Order Picked Up', icon: <FiCheck size={20} /> },
      { key: 'delivered', title: 'Delivered', icon: <FiCheck size={20} /> },
    ];
  })();

  const formatTimestamp = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Resolve image URL for order items. Prefer full URLs, fall back to API host
  const API = process.env.REACT_APP_API_URL || "http://localhost:5000";
  const resolveImage = (it) => {
    try {
      const src =
        (it && (it.image || it.imageUrl || it.photo || it.thumbnail)) ||
        (it && it.product && (it.product.image || it.product.photo)) ||
        (it && it.full && it.full.image) ||
        (it && it.product && it.product.full && it.product.full.image) ||
        null;
      if (!src) return "/images/placeholder-food.jpg";
      // if already an absolute URL or protocol-relative, return as-is
      if (/^(https?:)?\/\//.test(src) || src.startsWith("/")) return src;
      // otherwise prefix with API host
      return API.replace(/\/$/, "") + "/" + String(src).replace(/^\/+/, "");
    } catch (e) {
      return "/images/placeholder-food.jpg";
    }
  };

  // Prefer authoritative backend `order.total`. Frontend should not compute totals here.

  const currentStatus = liveOrder?.status || "pending";
  const createdAt = liveOrder?.createdAt;
  const updatedAt = liveOrder?.updatedAt;
  const normalizedStatus = currentStatus;
  const currentIndex = statusFlow.findIndex((s) => s.key === normalizedStatus);

  const getStatusBadge = (status) => {
    const map = {
      order_placed: { label: "Pending", class: "pending" },
      order_confirmed: { label: "Confirmed", class: "pending" },
      preparing_your_meal: { label: "Preparing", class: "pending" },
      ready_for_pickup: { label: "Ready", class: "pending" },
      picked_up_my_order: { label: "Picked up", class: "completed" },
      driver_assigned: { label: "Driver assigned", class: "pending" },
      out_for_delivery: { label: "On the way", class: "pending" },
      order_picked_up: { label: "Picked up", class: "pending" },
      delivered: { label: "Delivered", class: "completed" },
      cancelled: { label: "Cancelled", class: "cancelled" },
    };
    return map[status] || { label: status, class: "pending" };
  };

  const currentStopIndex = (() => {
    try {
      const arr = liveOrder?.vendorAddresses || [];
      const idx = arr.findIndex((a) => !a.visited);
      return idx === -1 ? null : idx;
    } catch (e) {
      return null;
    }
  })();

  const myVendorEntry = (() => {
    try {
      if (!liveOrder || !user || user.role !== "vendor") return null;
      const arr = liveOrder.vendorAddresses || [];
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (a && a.vendor && String(a.vendor) === String(user._id)) return a;
      }
      if (
        liveOrder.vendorAddress &&
        liveOrder.vendorAddress.vendor &&
        String(liveOrder.vendorAddress.vendor) === String(user._id)
      )
        return liveOrder.vendorAddress;
      // Fallback: check items for embedded vendor info (some orders store vendor on items)
      const items = liveOrder.items || [];
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        if (!it || !it.vendor) continue;
        try {
          const v = it.vendor;
          const vid = v && (v._id || v.id) ? v._id || v.id : v;
          if (vid && String(vid) === String(user._id)) {
            // return a lightweight vendor entry so other code can use it
            return {
              vendor: vid,
              label:
                (v.vendorProfile && v.vendorProfile.storeName) ||
                v.displayName ||
                v.name ||
                it.label ||
                "Vendor",
              preparing: !!it.preparing,
              ready: !!it.ready,
              visited: !!it.visited,
              address:
                (v.vendorProfile &&
                  v.vendorProfile.storeAddress &&
                  (v.vendorProfile.storeAddress.street ||
                    v.vendorProfile.storeAddress.label ||
                    v.vendorProfile.storeAddress.formatted)) ||
                it.label ||
                "",
            };
          }
        } catch (e) {}
      }
      return null;
    } catch (e) {
      return null;
    }
  })();

  const isDriverAssignedToMe = (() => {
    try {
      if (role !== "driver") return false;
      if (!user) return false;
      // Check liveOrder.driver first (authoritative assignment on order)
      try {
        const od = liveOrder && liveOrder.driver;
        if (od) {
          let orderDriverId = null;
          if (typeof od === "string" || typeof od === "number")
            orderDriverId = od;
          else if (od._id) orderDriverId = od._id;
          else if (od.user) orderDriverId = od.user._id || od.user;
          if (orderDriverId && String(orderDriverId) === String(user._id))
            return true;
          // If order has a driver object with a name that matches current user displayName, allow
          const nameMatches =
            od &&
            od.name &&
            user &&
            (user.displayName || user.name) &&
            String(od.name) === String(user.displayName || user.name);
          if (nameMatches) return true;
        }
      } catch (e) {
        /* ignore */
      }

      // Fallback to driver document fetched via driverService
      if (!driver) return false;
      const drvUser =
        driver.user && driver.user._id ? driver.user._id : driver.user;
      return String(drvUser) === String(user?._id);
    } catch (e) {
      return false;
    }
  })();

  const currentStopAddressString = (() => {
    try {
      if (!liveOrder) return "";
      if (
        [
          "picked_up_my_order",
          "order_picked_up",
          "out_for_delivery",
          "delivered",
        ].includes((liveOrder.status || "").toString())
      ) {
        return (
          liveOrder?.address?.street ||
          liveOrder?.address?.label ||
          "Customer Address"
        );
      }
      const arr = liveOrder.vendorAddresses || [];
      const idx = arr.findIndex((a) => !a.visited);
      if (idx === -1 && arr.length > 0)
        return (
          arr[0].address?.street || arr[0].label || "Vendor Pickup Location"
        );
      if (idx >= 0)
        return (
          arr[idx].address?.street ||
          arr[idx].label ||
          `Vendor Pickup ${idx + 1}`
        );
      return (
        liveOrder?.vendorAddress?.street ||
        liveOrder?.vendorAddress?.label ||
        "Vendor Pickup Location"
      );
    } catch (e) {
      return "";
    }
  })();

  const openMapsForAddress = (addr) => {
    try {
      const q = encodeURIComponent(addr || "");
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${q}`,
        "_blank"
      );
    } catch (e) {}
  };

  // `openMapsForOrder` removed — use `openMapsForAddress` directly where needed.

  // Map status + serviceType + role -> header icon, title and subtitle
  const headerInfo = (() => {
    try {
      const status = (liveOrder && liveOrder.status) || "order_placed";
      const svc = (liveOrder && liveOrder.serviceType) || "delivery";
      const addr = currentStopAddressString || "Vendor Pickup Location";
      const driverAssigned = !!(liveOrder && liveOrder.driver);

      const byRole = {
        customer: {},
        vendor: {},
        driver: {},
        default: {},
      };

      // Defaults
      byRole.default = {
        icon: <FiCheck size={36} />,
        title: "Order Status",
        subtitle: addr,
      };

      // order_placed
      byRole.customer.order_placed = {
        icon: <FiCheck size={36} />,
        title: "Order Received",
        subtitle: "We received your order",
      };
      byRole.vendor.order_placed = {
        icon: <FiCheck size={36} />,
        title: "New Order",
        subtitle: "Please start preparing",
      };
      byRole.driver.order_placed = {
        icon: <FiCheck size={36} />,
        title: "Order Queue",
        subtitle: "Waiting for driver assignment",
      };

      // order_confirmed
      byRole.customer.order_confirmed = {
        icon: <FiCheck size={36} />,
        title: "Order Confirmed",
        subtitle: "Vendor accepted your order",
      };
      byRole.vendor.order_confirmed = {
        icon: <FiCheck size={36} />,
        title: "Confirming",
        subtitle: "Tap to Prepare Meal",
      };
      byRole.driver.order_confirmed = {
        icon: <FiCheck size={36} />,
        title: "Waiting for Pickup",
        subtitle: "Not assigned yet",
      };

      // preparing_your_meal
      byRole.customer.preparing_your_meal = {
        icon: <FiPackage size={36} />,
        title: "Preparing your meal",
        subtitle: "Vendor is preparing items",
      };
      byRole.vendor.preparing_your_meal = {
        icon: <FiPackage size={36} />,
        title: "Preparing",
        subtitle: "Tap when ready",
      };
      byRole.driver.preparing_your_meal = {
        icon: <FiPackage size={36} />,
        title: "Preparing",
        subtitle: "Pickup not ready yet",
      };

      // ready_for_pickup
      byRole.customer.ready_for_pickup = {
        icon: <FiPackage size={36} />,
        title: "Ready for Pickup",
        subtitle:
          svc === "pickup"
            ? "Ready — come collect your order"
            : !driverAssigned
            ? "Waiting for a driver to assign the order"
            : "Vendor finished — driver coming soon",
      };
      byRole.vendor.ready_for_pickup = {
        icon: <FiPackage size={36} />,
        title: "Ready for Pickup",
        subtitle:
          !driverAssigned && svc === "delivery"
            ? "Waiting for a driver to assign the order"
            : "Mark when picked up",
      };
      byRole.driver.ready_for_pickup = {
        icon: <FiPackage size={36} />,
        title: "Pickup Location",
        subtitle: "Go pick up the order",
      };

      // driver_assigned
      byRole.customer.driver_assigned = {
        icon: <FiTruck size={36} />,
        title: "Driver Assigned",
        subtitle: "Driver is on their way to vendor",
      };
      byRole.vendor.driver_assigned = {
        icon: <FiTruck size={36} />,
        title: "Driver Assigned",
        subtitle: "Driver will collect the order",
      };
      byRole.driver.driver_assigned = {
        icon: <FiTruck size={36} />,
        title: "Driver Assigned",
        subtitle: "Tap to start",
      };

      // out_for_delivery
      byRole.customer.out_for_delivery = {
        icon: <FiTruck size={36} />,
        title: "Out for Delivery",
        subtitle:
          svc === "pickup"
            ? "Driver picked up — on route to pickup"
            : "Driver is en route",
      };
      byRole.vendor.out_for_delivery = {
        icon: <FiTruck size={36} />,
        title: "Out for Delivery",
        subtitle: "Order picked up",
      };
      byRole.driver.out_for_delivery = {
        icon: <FiTruck size={36} />,
        title: "Out for Delivery",
        subtitle: "Deliver to customer",
      };

      // order_picked_up
      byRole.customer.order_picked_up = {
        icon: <FiCheck size={36} />,
        title: "Picked Up",
        subtitle: "Order is with the driver",
      };
      byRole.vendor.order_picked_up = {
        icon: <FiCheck size={36} />,
        title: "Picked Up",
        subtitle: "Driver has collected the order",
      };
      byRole.driver.order_picked_up = {
        icon: <FiCheck size={36} />,
        title: "On Delivery",
        subtitle: "Complete delivery",
      };

      // delivered
      byRole.customer.delivered = {
        icon: <FiCheck size={36} />,
        title: "Delivered",
        subtitle: "Order delivered — enjoy!",
      };
      byRole.vendor.delivered = {
        icon: <FiCheck size={36} />,
        title: "Delivered",
        subtitle: "Order completed",
      };
      byRole.driver.delivered = {
        icon: <FiCheck size={36} />,
        title: "Completed",
        subtitle: "Delivery finished",
      };

      // cancelled
      byRole.customer.cancelled = {
        icon: <FiX size={36} />,
        title: "Cancelled",
        subtitle: "This order was cancelled",
      };
      byRole.vendor.cancelled = byRole.customer.cancelled;
      byRole.driver.cancelled = byRole.customer.cancelled;

      const roleKey = role || "default";
      const roleMap = byRole[roleKey] || byRole.default;

      // If driver and order is picked up, surface the delivery note prominently in the banner
      try {
        const deliveryNote =
          (liveOrder &&
            (liveOrder.deliveryNote ||
              liveOrder.note ||
              (liveOrder.address && liveOrder.address.note))) ||
          null;
        if (role === "driver" && status === "order_picked_up" && deliveryNote) {
          const base = roleMap[status] || byRole.default;
          const subtitleWithNote = (
            <div>
              <div style={{ fontWeight: 600 }}>{deliveryNote}</div>
              <div style={{ marginTop: 6 }}>{base.subtitle}</div>
            </div>
          );
          return { ...(base || {}), subtitle: subtitleWithNote };
        }
      } catch (e) {
        /* ignore */
      }

      return roleMap[status] || byRole.default;
    } catch (e) {
      return {
        icon: <FiCheck size={36} />,
        title: "Order Status",
        subtitle: currentStopAddressString,
      };
    }
  })();

  const handleStart = async () => {
    try {
      setActionProcessing(true);
      await orderService.startDelivery(id);
      const d = await orderService.getOrder(id);
      setLiveOrder(d);
    } catch (e) {
      console.error("start failed", e);
    } finally {
      setActionProcessing(false);
    }
  };

  const handleVisit = async () => {
    try {
      if (currentStopIndex === null) return;
      setActionProcessing(true);
      await orderService.visitStop(id, currentStopIndex);
      const d = await orderService.getOrder(id);
      setLiveOrder(d);
    } catch (e) {
      console.error("visit failed", e);
    } finally {
      setActionProcessing(false);
    }
  };

  const handleDeliver = async () => {
    try {
      setActionProcessing(true);
      await orderService.deliverOrder(id);
      const d = await orderService.getOrder(id);
      setLiveOrder(d);
    } catch (e) {
      console.error("deliver failed", e);
    } finally {
      setActionProcessing(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await orderService.getOrder(id);
        if (!mounted) return;
        setLiveOrder(data);

        // If items don't include image fields, fetch product details and attach images
        (async function attachMissingImages(orderData) {
          try {
            if (!orderData || !Array.isArray(orderData.items)) return;
            const items = orderData.items;
            const missing = items.filter((it) => {
              try {
                if (!it) return false;
                const hasImg = Boolean(
                  it.image || it.imageUrl || it.photo || it.thumbnail ||
                  (it.product && typeof it.product === 'object' && (it.product.image || it.product.photo))
                );
                return !hasImg && it.product;
              } catch (e) {
                return false;
              }
            });
            if (missing.length === 0) return;

            const uniqIds = Array.from(new Set(missing.map((m) => String(m.product))));
            const fetched = await Promise.all(
              uniqIds.map(async (pid) => {
                try {
                  const res = await productService.getProduct(pid);
                  return res?.product || res || null;
                } catch (e) {
                  return null;
                }
              })
            );

            const byId = new Map();
            uniqIds.forEach((id, i) => { if (fetched[i]) byId.set(String(id), fetched[i]); });

            const updated = items.map((it) => {
              try {
                if (!it) return it;
                if (it.image || it.imageUrl || it.photo || it.thumbnail) return it;
                const pid = it.product && String(it.product);
                const p = pid && byId.has(pid) ? byId.get(pid) : null;
                if (p) {
                  return { ...it, image: p.image || p.photo || (p.full && p.full.image) || it.image };
                }
                return it;
              } catch (e) { return it; }
            });

            setLiveOrder((prev) => ({ ...(prev || {}), items: updated }));
          } catch (e) {
            /* ignore image attach errors */
          }
        })(data);

        try {
          // For drivers: if they're not related/assigned to this order, redirect home
          if (role === "driver") {
            const userId = user && (user._id || user.id);
            const drv = data.driver;
            let orderDriverId = null;
            if (drv) {
              if (typeof drv === "string" || typeof drv === "number")
                orderDriverId = drv;
              else if (drv._id) orderDriverId = drv._id;
              else if (drv.user) orderDriverId = drv.user._id || drv.user;
            }
            const nameMatches =
              drv &&
              drv.name &&
              user &&
              (user.displayName || user.name) &&
              String(drv.name) === String(user.displayName || user.name);
            const related =
              !!(orderDriverId && String(orderDriverId) === String(userId)) ||
              !!nameMatches;
            if (!related) {
              // Do not auto-redirect drivers away when the order was just marked
              // as picked up by the customer — keep driver on the page to allow
              // viewing/order history. Only redirect if this order no longer
              // pertains to them for other reasons.
              // If status indicates the order was picked up, allow driver to stay on page
              try {
                const st = data && data.status ? String(data.status) : '';
                if (/picked/.test(st)) {
                  // intentionally do not navigate when picked up
                  console.debug('[OrderTrackingPage] not redirecting driver after picked-up status', { orderId: id, status: st });
                } else {
                  console.debug('[OrderTrackingPage] redirecting driver away (not related)', { orderId: id, status: st });
                  navigate("/driver/orders");
                  return;
                }
              } catch (e) { navigate("/driver/orders"); return; }
            }
          }
        } catch (e) {
          /* ignore */
        }

        try {
          const drv = await driverService.getDriverForOrder(id);
          if (mounted) setDriver(drv);
        } catch (e) {
          console.debug(
            "[OrderTrackingPage] getDriverForOrder failed for",
            id,
            "error=",
            e && e.response ? e.response.data : e.message || e
          );
        }
      } catch (e) {
        // ignore fetch error for now
        console.error("Failed to fetch order", e);
      }
    })();

    const off = on("orderUpdate", async (payload) => {
      try {
        if (!payload) return;
        const pid = payload.orderId || payload.order?._id || payload.order?.id;
        if (!pid) return;
        if (String(pid) !== String(id)) return;

        // If server sent full order, replace state
        if (payload.order) {
          setLiveOrder(payload.order);
          return;
        }

        // Actions that warrant fetching the full order to ensure consistency
        const fetchActions = new Set([
          "vendorPreparing",
          "vendorReady",
          "vendorPicked",
          "status",
          "stopVisited",
          "delivered",
          "cancel",
          "orderAssigned",
        ]);
        if (payload.action && fetchActions.has(payload.action)) {
          try {
            const d = await orderService.getOrder(id);
            setLiveOrder(d);
            return;
          } catch (e) {
            /* fallback to merge below */
          }
        }

        // Fallback: merge any partial order payload the server sent
        setLiveOrder((prev) => ({ ...(prev || {}), ...(payload.order || {}) }));
      } catch (e) {
        /* swallow */
      }
    });

    const offAssigned = on("orderAssigned", (payload) => {
      try {
        console.debug("[OrderTrackingPage] orderAssigned socket", payload);
        if (!payload || payload.orderId !== id) return;

        // Drivers: keep existing behavior (detect assignment to another driver)
        if (role === "driver") {
          const assignedTo = payload.assignedTo;
          const assignedName =
            assignedTo && (assignedTo.name || assignedTo._id);
          const myName = user?.displayName || user?.name;
          if (
            assignedName &&
            myName &&
            String(assignedName) !== String(myName)
          ) {
            setAssignedByOther(assignedTo || { name: "another driver" });
            setLiveOrder(null);
            return;
          }
          (async () => {
            try {
              const d = await orderService.getOrder(id);
              setLiveOrder(d);
            } catch (e) {
              /* ignore */
            }
          })();
          return;
        }

        // Customers and Vendors: when an assignment occurs, refresh the order
        (async () => {
          try {
            const d = await orderService.getOrder(id);
            setLiveOrder(d);
          } catch (e) {
            /* ignore */
          }
        })();
      } catch (e) {
        /* ignore */
      }
    });

    const offViewers = on("order:viewers", (payload) => {
      try {
        if (!payload || payload.orderId !== id) return;
        setViewersCount(
          Array.isArray(payload.viewers) ? payload.viewers.length : 0
        );
      } catch (e) {
        /* ignore */
      }
    });

    const offDriverUpdated = on('driverUpdated', async (payload) => {
      try {
        if (!payload) return;
        // If liveOrder has a driver, check if the update pertains to that driver
        const liveDriver = liveOrder && liveOrder.driver ? (liveOrder.driver._id || liveOrder.driver) : null;
        const pUserId = payload.userId ? String(payload.userId) : null;
        const pDriverId = payload.driverId ? String(payload.driverId) : null;
        if (!liveDriver) return;
        if (pDriverId && String(pDriverId) === String(liveDriver)) {
          try { const drv = await driverService.getDriverForOrder(id); setDriver(drv); } catch (e) { /* ignore */ }
        } else if (pUserId && String(pUserId) === String(liveDriver)) {
          try { const drv = await driverService.getDriverForOrder(id); setDriver(drv); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    });

    // join after listeners registered
    joinOrder(id);

    return () => {
      mounted = false;
      off && off();
      offAssigned && offAssigned();
      offViewers && offViewers();
      offDriverUpdated && offDriverUpdated();
      leaveOrder(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // If user and liveOrder become available after initial load, ensure unassigned drivers are redirected
  useEffect(() => {
    try {
      if (role === "driver" && user && liveOrder) {
        const userId = user && (user._id || user.id);
        const drv = liveOrder.driver;
        let orderDriverId = null;
        if (drv) {
          if (typeof drv === "string" || typeof drv === "number")
            orderDriverId = drv;
          else if (drv._id) orderDriverId = drv._id;
          else if (drv.user) orderDriverId = drv.user._id || drv.user;
        }
        const nameMatches =
          drv &&
          drv.name &&
          user &&
          (user.displayName || user.name) &&
          String(drv.name) === String(user.displayName || user.name);
        const related =
          !!(orderDriverId && String(orderDriverId) === String(userId)) ||
          !!nameMatches;
        if (!related) {
          // Avoid redirecting drivers when the order status is customer-picked-up;
          // let them stay on the page to inspect the order.
          try {
            const st = liveOrder && liveOrder.status ? String(liveOrder.status) : '';
            if (!/picked/.test(st)) {
              console.debug('[OrderTrackingPage] redirecting driver (liveOrder not related)', { orderId: id, status: st });
              navigate("/driver/orders");
            } else {
              console.debug('[OrderTrackingPage] not redirecting driver for picked-up liveOrder', { orderId: id, status: st });
            }
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }, [role, user, liveOrder, id, navigate]);

  // Auto-open vendor modal when query param present (used by notifications)
  const location = useLocation();
  useEffect(() => {
    try {
      const qp = new URLSearchParams(location.search);
      const openVendor = qp.get("openVendor");
      if (openVendor) {
        setVendorModalId(openVendor);
        setShowVendorModal(true);
      }
    } catch (e) {}
  }, [location.search]);

  // Dynamic action button component: centralizes status actions per role
  const DynamicStatusAction = ({ order, role, onUpdate }) => {
    const { user } = useAuth();
    const [processingLocal, setProcessingLocal] = useState(false);

    const findMyVendorEntry = () => {
      try {
        if (!order || !user || user.role !== "vendor") return null;
        const arr = order.vendorAddresses || [];
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          if (
            a &&
            (a.vendor || a.vendorId) &&
            String(a.vendor || a.vendorId) === String(user._id)
          )
            return a;
        }
        if (
          order.vendorAddress &&
          order.vendorAddress.vendor &&
          String(order.vendorAddress.vendor) === String(user._id)
        )
          return order.vendorAddress;
        // Fallback: check items for vendor embedded inside order.items
        const items = order.items || [];
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          if (!it || !it.vendor) continue;
          try {
            const v = it.vendor;
            const vid = v && (v._id || v.id) ? v._id || v.id : v;
            if (vid && String(vid) === String(user._id)) {
              return {
                vendor: vid,
                label:
                  (v.vendorProfile && v.vendorProfile.storeName) ||
                  v.displayName ||
                  v.name ||
                  it.label ||
                  "Vendor",
                preparing: !!it.preparing,
                ready: !!it.ready,
                visited: !!it.visited,
              };
            }
          } catch (e) {}
        }
      } catch (e) {}
      return null;
    };

    const handleVendorPrepare = async () => {
      try {
        setProcessingLocal(true);
        await orderService.vendorPrepare(order._id || order.id, user._id);
        const d = await orderService.getOrder(order._id || order.id);
        onUpdate(d);
      } catch (e) {
        console.error(e);
      } finally {
        setProcessingLocal(false);
      }
    };

    const handleVendorReady = async () => {
      try {
        setProcessingLocal(true);
        await orderService.vendorReady(order._id || order.id, user._id);
        const d = await orderService.getOrder(order._id || order.id);
        onUpdate(d);
      } catch (e) {
        console.error(e);
      } finally {
        setProcessingLocal(false);
      }
    };

    const handleVendorPicked = async () => {
      try {
        setProcessingLocal(true);
        await orderService.vendorPicked(order._id || order.id, user._id);
        const d = await orderService.getOrder(order._id || order.id);
        onUpdate(d);
      } catch (e) {
        console.error(e);
      } finally {
        setProcessingLocal(false);
      }
    };

    const handleConfirmPickup = async () => {
      try {
        setProcessingLocal(true);
        await orderService.confirmPickup(order._id || order.id);
        const d = await orderService.getOrder(order._id || order.id);
        onUpdate(d);
      } catch (e) {
        console.error(e);
      } finally {
        setProcessingLocal(false);
      }
    };

    // const handleCompleteOrder = async () => {
    //   try {
    //     setProcessingLocal(true);
    //     await orderService.completeOrder(order._id || order.id);
    //     const d = await orderService.getOrder(order._id || order.id);
    //     onUpdate(d);
    //   } catch (e) {
    //     console.error(e);
    //   } finally {
    //     setProcessingLocal(false);
    //   }
    // };

    // Driver actions are handled by separate buttons; do not render here for drivers
    if (role === "driver") return null;

    // Vendor actions — show only for canonical vendor-visible global statuses
    if (role === "vendor") {
      const myEntry = findMyVendorEntry();
      if (!myEntry) return null;
      const allowed = [
        "order_confirmed",
        "preparing_your_meal",
        "ready_for_pickup",
      ];
      if (!order || !allowed.includes(order.status)) return null;

      if (order.status === "order_confirmed") {
        return (
          <button
            className="btn"
            onClick={handleVendorPrepare}
            disabled={processingLocal}
          >
            {processingLocal ? "Processing..." : "Prepare Meal"}
          </button>
        );
      }

      if (order.status === "preparing_your_meal") {
        return (
          <button
            className="btn"
            onClick={handleVendorReady}
            disabled={processingLocal}
          >
            {processingLocal ? "Processing..." : "Ready"}
          </button>
        );
      }

      if (order.status === "ready_for_pickup") {
        // For delivery orders, only allow vendor to mark picked when a driver is assigned
        if (order.serviceType === "delivery" && !order.driver) return null;
        return (
          <button
            className="btn"
            onClick={handleVendorPicked}
            disabled={processingLocal}
          >
            {processingLocal ? "Processing..." : "Picked Up"}
          </button>
        );
      }

      return null;
    }

    // Customer pickup flows
    if (order && order.serviceType === "pickup") {
      if (order.status === "ready_for_pickup") {
        return (
          <button
            className="btn"
            onClick={handleConfirmPickup}
            disabled={processingLocal}
          >
            {processingLocal ? "Processing..." : "I've Picked Up"}
          </button>
        );
      }
    }

    return null;
  };

  // Auto-open driver modal when query param present (used by notifications)
  useEffect(() => {
    try {
      const qp = new URLSearchParams(location.search);
      const openDriver = qp.get("openDriver");
      if (openDriver) {
        setDriverModalId(openDriver);
        setShowDriverModal(true);
      }
    } catch (e) {}
  }, [location.search]);

  if (assignedByOther) {
    return (
      <div className="order-tracking-page">
        <header className="tracking-header">
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <FiArrowLeft size={24} />
          </button>
          <div className="header-info">
            <h1>Order #{id}</h1>
          </div>
        </header>

        <div style={{ padding: 16 }}>
          <div className="cancelled-banner">
            Order was assigned to {assignedByOther.name || "another driver"}.
            You no longer have access.
          </div>
        </div>
      </div>
    );
  }

  // Helper: decide whether to show multi-vendor banner and its content
  const renderMultiVendorBanner = () => {
    if (!liveOrder) return null;
    // prefer vendorAddresses/vendorAddress, otherwise derive unique vendors from items
    let vendorsArr = [];
    if (liveOrder.vendorAddresses && liveOrder.vendorAddresses.length > 0)
      vendorsArr = liveOrder.vendorAddresses;
    else if (liveOrder.vendorAddress) vendorsArr = [liveOrder.vendorAddress];
    else if (Array.isArray(liveOrder.items) && liveOrder.items.length > 0) {
      const seen = new Set();
      for (const it of liveOrder.items) {
        try {
          const v = it.vendor;
          const vid = v && (v._id || v.id) ? v._id || v.id : v;
          if (vid && !seen.has(String(vid))) {
            seen.add(String(vid));
            vendorsArr.push({
              vendor: vid,
              label:
                (v && v.vendorProfile && v.vendorProfile.storeName) ||
                (v && (v.displayName || v.name)) ||
                it.label ||
                "Vendor",
              ready: !!it.ready,
              preparing: !!it.preparing,
            });
          }
        } catch (e) {
          /* ignore */
        }
      }
    }

    if (vendorsArr.length <= 1) return null;

    const total = vendorsArr.length;
    const readyCount = vendorsArr.filter((v) => v && v.ready).length;

    if (readyCount === total) return null;

    if (role === "vendor" && myVendorEntry) {
      if (!myVendorEntry.ready && myVendorEntry.preparing) {
        return (
              <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 8,
              background: "var(--bg-warning, #fff7e6)",
              color: "var(--warning-color, #6a4b00)",
            }}
          >
            Waiting for other vendors to mark their items ready ({readyCount}/
            {total} ready)
          </div>
        );
      }
      if (!myVendorEntry.preparing && !myVendorEntry.ready) {
        return (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              borderRadius: 8,
              background: "#fff7e6",
              color: "#6a4b00",
            }}
          >
            You haven't started preparing yet. Mark items as preparing when
            ready.
          </div>
        );
      }
    }

    return (
            <div
        style={{
          marginTop: 8,
          padding: 8,
          borderRadius: 8,
          background: "var(--info-bg, #f0f4ff)",
          color: "var(--info-color, #003366)",
        }}
      >
        Waiting for all vendors to be ready ({readyCount}/{total} ready)
      </div>
    );
  };

  // Decide when totals should be visible based on status and role
  const showTotals = (() => {
    try {
      if (!liveOrder) return false;
      const s = liveOrder.status;
      const svc = liveOrder.serviceType;
      // 1) order_confirmed && vendor
      if (s === 'order_confirmed' && role === 'vendor') return true;
      // 2) ready_for_pickup && pickup && (vendor || customer)
      if (s === 'ready_for_pickup' && svc === 'pickup' && (role === 'vendor' || role === 'customer')) return true;
      // 3) out_for_delivery && (driver || vendor)
      if (s === 'out_for_delivery' && (role === 'driver' || role === 'vendor')) return true;
      // 4) order_picked_up && (customer || vendor) — show to drivers as well
      if (s === 'order_picked_up' && (role === 'customer' || role === 'vendor' || role === 'driver')) return true;
      if (s === 'picked_up_my_order' && (role === 'customer' || role === 'vendor' || role === 'driver')) return true;
      return false;
    } catch (e) { return false; }
  })();

  return (
    <div className="order-tracking-page">
      {/* Header */}
      <header className="tracking-header">
        {role === "driver" ? (
          <button
            className="btn btn-icon logo-btn"
            onClick={() => navigate("/driver/orders")}
          >
            <img
              src="/images/logo.png"
              alt="FoodIQ"
              className="header-logo-small"
            />
          </button>
        ) : (
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <FiArrowLeft size={24} />
          </button>
        )}

        <div className="header-info">
          <h1>Order #{id}</h1>
          {viewersCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-gray, #666)', marginTop: 4 }}>{viewersCount} viewing</div>
          )}
          {liveOrder &&
            (() => {
              const s = getStatusBadge(liveOrder.status);
              return (
                <span className={`order-badge ${s.class}`}>{s.label}</span>
              );
            })()}
        </div>

        <NotificationsButton />
      </header>

      {/* Optional multi-vendor status banner (rendered beneath header) */}
      <div style={{ padding: "0 16px" }}>{renderMultiVendorBanner()}</div>

      <div className="tracking-content">
        <ChatNavigator order={liveOrder} orderId={id} />

        {/* Arrival Info */}
        <div className="arrival-card">
          <div className="arrival-icon">{headerInfo.icon}</div>
          <div className="arrival-info">
            <h2>{headerInfo.title}</h2>
            {typeof headerInfo.subtitle === "string" ? (
              <p>{headerInfo.subtitle}</p>
            ) : (
              headerInfo.subtitle
            )}
          </div>

          {/* vendor preview removed to avoid visual overlap with action buttons */}

          <div className="arrival-actions">
            {role === "driver" && isDriverAssignedToMe && (
              <>
                {liveOrder?.status === "driver_assigned" && (
                  <button
                    className="btn small"
                    onClick={handleStart}
                    disabled={actionProcessing}
                  >
                    {actionProcessing ? "Starting..." : "Start"}
                  </button>
                )}
                {["out_for_delivery"].includes(liveOrder?.status) &&
                  currentStopIndex !== null &&
                  (() => {
                    // derive vendor name for current stop to show friendly button label
                    try {
                      const vendorEntry =
                        (liveOrder.vendorAddresses || [])[currentStopIndex] ||
                        null;
                      const vendorObj =
                        vendorEntry &&
                        (vendorEntry.vendor ||
                          vendorEntry.vendorId ||
                          vendorEntry.vendor_id)
                          ? vendorEntry.vendor ||
                            vendorEntry.vendorId ||
                            vendorEntry.vendor_id
                          : null;
                      const vName = vendorObj
                        ? vendorObj.displayName ||
                          vendorObj.name ||
                          vendorEntry.label ||
                          "Vendor"
                        : vendorEntry && (vendorEntry.label || "Vendor");
                      return (
                        <button
                          className="btn small"
                          onClick={handleVisit}
                          disabled={actionProcessing}
                        >
                          {actionProcessing
                            ? "Updating..."
                            : `Picked up — ${vName}`}
                        </button>
                      );
                    } catch (e) {
                      return (
                        <button
                          className="btn small"
                          onClick={handleVisit}
                          disabled={actionProcessing}
                        >
                          {actionProcessing ? "Updating..." : "Visited"}
                        </button>
                      );
                    }
                  })()}
                {liveOrder?.status === "order_picked_up" && (
                  <button
                    className="btn small"
                    onClick={handleDeliver}
                    disabled={actionProcessing}
                  >
                    {actionProcessing ? "Processing..." : "Delivered"}
                  </button>
                )}
              </>
            )}
            {role !== "vendor" &&
              (role !== "customer" ||
                (liveOrder && liveOrder.serviceType === "pickup")) && (
                <button
                  className="btn btn-icon"
                  onClick={() => openMapsForAddress(currentStopAddressString)}
                  title="Open in Google Maps"
                >
                  <FiMapPin size={18} />
                </button>
              )}
            {/* Dynamic action button: label and visibility depend on role and order status */}
            {liveOrder && (
              <DynamicStatusAction
                order={liveOrder}
                role={role}
                onUpdate={(updated) => setLiveOrder(updated)}
              />
            )}
          </div>
        </div>

        {/* Driver Info (show to customers/vendors only) */}
        {role !== "driver" && driver && (
          <DriverCard
            driver={driver}
            role={role}
            onCall={(d) => {
              try {
                window.location.href = `tel:${
                  d && d.phone ? d.phone.replace(/\s+/g, "") : ""
                }`;
              } catch (e) {}
            }}
            showChat={false}
            onAvatarClick={(d) => {
              setDriverModalId(
                d._id || (d.user && d.user._id) || d.user || d.id
              );
              setShowDriverModal(true);
            }}
          />
        )}

        <DriverChatModal
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          orderId={id}
          driver={driver}
        />
        <DriverChatModal
          isOpen={vendorChatOpen}
          onClose={() => setVendorChatOpen(false)}
          orderId={id}
          driver={{ name: liveOrder?.vendorAddress?.label || "Vendor" }}
        />
        <DriverChatModal
          isOpen={customerChatOpen}
          onClose={() => setCustomerChatOpen(false)}
          orderId={id}
          driver={{
            name:
              liveOrder?.user?.displayName ||
              liveOrder?.user?.name ||
              "Customer",
            avatar: liveOrder?.user?.avatar,
          }}
        />

        {/* Order Details (moved above status) */}
        <div
          className="order-details-section"
          style={{ padding: "0 16px", marginTop: 12 }}
        >
          {/* Order Items (vendor or grouped) */}
          {role === "vendor" &&
            liveOrder &&
            liveOrder.status === "preparing_your_meal" &&
            (() => {
              const items = Array.isArray(liveOrder.items)
                ? liveOrder.items
                : [];
              const myItems = items.filter((it) => {
                try {
                  const v = it.vendor;
                  const vid = v && (v._id || v.id) ? v._id || v.id : v;
                  return vid && String(vid) === String(user?._id);
                } catch (e) {
                  return false;
                }
              });
              if (myItems.length === 0) return null;
              return (
                <div className="order-summary-card">
                  <h3 style={{ marginTop: 0 }}>Order Items</h3>
                  <div style={{ marginTop: 8 }}>
                    {myItems.map((it, idx) => (
                      <div key={idx} style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <img
                          src={resolveImage(it)}
                          alt={it.name || 'product'}
                          className="order-item-image"
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{it.name} x{it.quantity}</div>
                          {it.selectedAttributes && it.selectedAttributes.length > 0 && (
                            <div className="item-attributes">
                              {it.selectedAttributes.map((a, ai) => (
                                <div key={ai}>{a.name}{a.quantity && ` x${a.quantity}`}</div>
                              ))}
                            </div>
                          )}
                          {it.options && it.options.instructions && (
                            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>Notes: {it.options.instructions}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {role === "driver" &&
            liveOrder &&
            [
              "ready_for_pickup",
                  "driver_assigned",
                  "out_for_delivery",
                  "order_picked_up",
                  "picked_up_my_order",
                ].includes(liveOrder.status) &&
            (() => {
              const items = Array.isArray(liveOrder.items)
                ? liveOrder.items
                : [];
              const groups = new Map();
              for (const it of items) {
                try {
                  const v = it.vendor;
                  let vid = null;
                  let vlabel = null;
                  if (!v) {
                    vid = "unknown";
                    vlabel = it.vendorName || "Vendor";
                  } else if (typeof v === "string" || typeof v === "number") {
                    vid = String(v);
                    vlabel = it.vendorName || "Vendor";
                  } else {
                    vid = v._id || v.id || String(v);
                    vlabel =
                      (v.vendorProfile && v.vendorProfile.storeName) ||
                      v.displayName ||
                      v.name ||
                      it.vendorLabel ||
                      "Vendor";
                  }
                  if (!groups.has(vid))
                    groups.set(vid, { label: vlabel, items: [] });
                  groups.get(vid).items.push(it);
                } catch (e) {
                  /* ignore */
                }
              }
              if (groups.size === 0) return null;
              return (
                <div className="order-summary-card">
                  <h3 style={{ marginTop: 0 }}>Order Items</h3>
                  <div style={{ marginTop: 8 }}>
                    {Array.from(groups.entries()).map(([vid, g]) => (
                      <div key={vid} className="vendor-group">
                        <div className="vendor-label">{g.label}</div>
                        <div style={{ paddingLeft: 8 }}>
                          {g.items.map((it, i) => (
                            <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <img
                                src={resolveImage(it)}
                                alt={it.name || 'product'}
                                className="order-item-image"
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{it.name} x{it.quantity}</div>
                                  {it.selectedAttributes && it.selectedAttributes.length > 0 && (
                                    <div className="item-attributes">
                                      {it.selectedAttributes.map((a, ai) => (
                                        <div key={ai}>{a.name}{a.quantity && ` x${a.quantity}`}</div>
                                      ))}
                                    </div>
                                  )}
                                {it.options && it.options.instructions && (
                                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Notes: {it.options.instructions}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {/* Totals card */}
          {showTotals && liveOrder && (
            <div style={{ marginTop: 12 }} className="order-summary-card">
              <div className="order-row">
                <span className="label">Subtotal</span>
                <span className="value">
                  Rs {Number(liveOrder.subtotal || 0).toLocaleString()}
                </span>
              </div>
              <div className="order-row">
                <span className="label">Delivery Fee</span>
                <span className="value">
                  Rs {Number(liveOrder.deliveryFee || 0).toLocaleString()}
                </span>
              </div>
              <div className="order-row divider" />
              <div className="order-row total">
                <span className="label">Total</span>
                <span className="value">
                  Rs {Number(liveOrder.total || 0).toLocaleString()}
                </span>
              </div>
              {liveOrder.driverRevenue != null &&
                ['delivered', 'picked_up_my_order', 'completed'].includes(liveOrder?.status) && (
                  <div className="order-row earnings">
                    <span className="label">Your earnings</span>
                    <span className="value">
                      Rs {Number(liveOrder.driverRevenue).toLocaleString()}
                    </span>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Order Status Timeline */}
        <div className="status-section">
          <h2>Order Status</h2>
          <div className="status-timeline">
            {statusFlow.map((step, index) => {
              const stepIndex = index;
              const completed = currentIndex > -1 && stepIndex < currentIndex;
              const active = currentIndex === stepIndex;

              let timeLabel = "";
              if (stepIndex === 0) timeLabel = formatTimestamp(createdAt);
              else if (active) timeLabel = formatTimestamp(updatedAt) || "";
              else if (completed)
                timeLabel =
                  formatTimestamp(updatedAt) ||
                  formatTimestamp(createdAt) ||
                  "";

              return (
                <div
                  key={step.key}
                  className={`status-item ${completed ? "completed" : ""} ${
                    active ? "active" : ""
                  }`}
                >
                  <div className="status-icon-wrapper">
                    <div className="status-icon">{step.icon}</div>
                    {index < statusFlow.length - 1 && (
                      <div className="status-line"></div>
                    )}
                  </div>
                  <div className="status-content">
                    <div className="status-header">
                      <h4>{step.title}</h4>
                      <span className="status-time">{timeLabel}</span>
                    </div>
                    <p className="status-description">
                      {step.title === "Order Placed"
                        ? "We received your order"
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid: main timeline (left) + sidebar (right) */}
        <div className="tracking-grid">
          <div className="main-column">
            {/* Driver / Vendor profile modals */}
            <DriverModal
              driverId={driverModalId}
              isOpen={showDriverModal}
              onClose={() => setShowDriverModal(false)}
            />
            <VendorModal
              vendorId={vendorModalId}
              isOpen={showVendorModal}
              onClose={() => setShowVendorModal(false)}
              orderId={id}
            />

            {/* Driver actions and totals (for drivers) */}
            <div style={{ marginTop: 16 }}>
              {role === "driver" &&
                liveOrder &&
                !liveOrder.driver &&
                !assignedByOther && (
                  <button
                    className="btn"
                    style={{ marginBottom: 12 }}
                    onClick={() => navigate(`/driver/order/${id}`)}
                  >
                    Open driver view
                  </button>
                )}

              {/* Deprecated quick status buttons removed — status updates now via the action button beside the map */}

              {/* close main column */}
            </div>
          </div>
        </div>

        {/* Cancel Order (hidden when already cancelled) */}
        {liveOrder?.status !== "cancelled" &&
          (["customer", "vendor", "admin"].includes(role) ||
            !role ||
            (role === "driver" &&
              isDriverAssignedToMe &&
              ["driver_assigned", "out_for_delivery"].includes(
                liveOrder?.status
              ))) && (
            <>
              <ConfirmDialog
                isOpen={showCancelConfirm}
                onClose={() => setShowCancelConfirm(false)}
                onConfirm={async () => {
                  setCancelling(true);
                  try {
                    let res;
                    // Vendors should unassign drivers instead of cancelling the order
                    if (role === "vendor" && liveOrder && liveOrder.driver) {
                      res = await orderService.unassignOrder(id);
                    } else if (
                      role === "driver" &&
                      isDriverAssignedToMe &&
                      ["driver_assigned", "out_for_delivery"].includes(
                        liveOrder?.status
                      )
                    ) {
                      // Assigned driver may unassign the order (return to ready_for_pickup)
                      res = await orderService.unassignOrder(id);
                    } else {
                      res = await orderService.cancelOrder(id);
                    }
                    const updated = res.order || res;
                    setLiveOrder(updated);
                  } catch (e) {
                    console.error("Failed to cancel/unassign order", e);
                  } finally {
                    setCancelling(false);
                    setShowCancelConfirm(false);
                  }
                }}
                title={
                  role === "vendor" && liveOrder && liveOrder.driver
                    ? "Unassign Order"
                    : role === "driver" &&
                      isDriverAssignedToMe &&
                      ["driver_assigned", "out_for_delivery"].includes(
                        liveOrder?.status
                      )
                    ? "Unassign Order"
                    : "Cancel Order"
                }
                message={
                  role === "vendor" && liveOrder && liveOrder.driver
                    ? "Are you sure you want to unassign the driver from this order? This will return the order to ready-for-pickup."
                    : role === "driver" &&
                      isDriverAssignedToMe &&
                      ["driver_assigned", "out_for_delivery"].includes(
                        liveOrder?.status
                      )
                    ? "Are you sure you want to unassign this order? This will return the order to ready-for-pickup."
                    : "Are you sure you want to cancel this order? This action cannot be undone."
                }
                confirmText={
                  cancelling
                    ? role === "vendor" && liveOrder && liveOrder.driver
                      ? "Unassigning..."
                      : role === "driver" &&
                        isDriverAssignedToMe &&
                        ["driver_assigned", "out_for_delivery"].includes(
                          liveOrder?.status
                        )
                      ? "Unassigning..."
                      : "Cancelling..."
                    : role === "vendor" && liveOrder && liveOrder.driver
                    ? "Yes, Unassign"
                    : role === "driver" &&
                      isDriverAssignedToMe &&
                      ["driver_assigned", "out_for_delivery"].includes(
                        liveOrder?.status
                      )
                    ? "Yes, Unassign"
                    : "Yes, Cancel"
                }
                cancelText="No"
                variant="danger"
              />

              <button
                className="btn cancel-order-btn"
                onClick={() => setShowCancelConfirm(true)}
                disabled={
                  ['delivered', 'picked_up_my_order', 'completed'].includes(liveOrder?.status) || cancelling
                }
              >
                {cancelling
                  ? role === "vendor" && liveOrder && liveOrder.driver
                    ? "Unassigning..."
                    : role === "driver" &&
                      isDriverAssignedToMe &&
                      ["driver_assigned", "out_for_delivery"].includes(
                        liveOrder?.status
                      )
                    ? "Unassigning..."
                    : "Cancelling..."
                  : role === "vendor" && liveOrder && liveOrder.driver
                  ? "Unassign driver"
                  : role === "driver" &&
                    isDriverAssignedToMe &&
                    ["driver_assigned", "out_for_delivery"].includes(
                      liveOrder?.status
                    )
                  ? "Unassign Order"
                  : "Cancel Order"}
              </button>
            </>
          )}
      </div>
    </div>
  );
};

export default OrderTrackingPage;
