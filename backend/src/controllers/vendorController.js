const mongoose = require("mongoose");
const Order = require("../models/Order");

// GET /api/vendors/:id/orders - list orders that include items for this vendor
exports.getVendorOrders = async (req, res) => {
  try {
    const vendorId = req.params.id;
    if (!vendorId)
      return res.status(400).json({ message: "vendor id required" });

    // Convert vendor id to ObjectId once for reuse
    const vid = new mongoose.Types.ObjectId(vendorId);

    // If caller requests aggregated data, return per-order vendor items and totals
    if (req.query.aggregated === "true" || req.query.summary === "true") {
      const vendorStatuses = ["order_confirmed", "preparing_your_meal", "ready_for_pickup"];

      const pipeline = [
            { $match: { 
                "items.vendor": vid,
                $or: [
                  { status: { $in: vendorStatuses } },
                  { "items.preparing": true },
                  { "items.ready": true },
                  { vendorAddresses: { $elemMatch: { vendor: vid, visited: true } } }
                ]
              } 
            },
        { $sort: { createdAt: 1 } },
        {
          $project: {
            _id: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            total: 1,
            customer: 1,
            vendorItems: {
              $filter: {
                input: "$items",
                as: "it",
                cond: { $eq: ["$$it.vendor", vid] },
              },
            },
          },
        },
        {
          $addFields: {
            orderVendorRevenueRaw: {
              $reduce: {
                input: "$vendorItems",
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $ifNull: [
                        "$$this.vendorRevenue",
                        {
                          $add: [
                            "$$this.price",
                            { $ifNull: ["$$this.attributesTotal", 0] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        // round to 2 decimals
        {
          $project: {
            vendorItems: 1,
            orderVendorRevenueRaw: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            total: 1,
            customer: 1,
          },
        },
      ];

      const orders = await Order.aggregate(pipeline).allowDiskUse(true);
      // Round per-order and total values in Node (avoids relying on MongoDB $round availability)
      let totalVendorRevenueRaw = 0;
      const roundedOrders = (orders || []).map((o) => {
        const raw = Number(o.orderVendorRevenueRaw || 0);
        const rounded = Math.round(raw * 100) / 100;
        totalVendorRevenueRaw += rounded;
        return Object.assign({}, o, { orderVendorRevenue: rounded });
      });
      const totalVendorRevenue = Math.round(totalVendorRevenueRaw * 100) / 100;
      return res.json({ orders: roundedOrders, totalVendorRevenue });
    }

    // Default: return orders that include items for this vendor (keeps existing FE behavior)
    // For vendor orders page, return active vendor orders (statuses matching vendor workflow)
    // Include orders where vendor-specific item flags indicate vendor activity (preparing/ready)
    // Allow caller to request all orders with `all=true` query param.
    const allowAll = String(req.query.all || '').toLowerCase() === 'true';
    const vendorStatuses = ["order_confirmed", "preparing_your_meal", "ready_for_pickup"];
    const q = { "items.vendor": vendorId };
    if (!allowAll) {
      q.$or = [
        { status: { $in: vendorStatuses } },
        { "items.preparing": true },
        { "items.ready": true },
        { vendorAddresses: { $elemMatch: { vendor: vid, visited: true } } }
      ];
    }
    const orders = await Order.find(q).sort({ createdAt: 1 }).limit(200);
    return res.json({ orders });
  } catch (e) {
    console.error("vendorController.getVendorOrders error", e);
    return res.status(500).json({ message: "Server error" });
  }
};
