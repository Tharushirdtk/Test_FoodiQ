#!/usr/bin/env node
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Order = require('../src/models/Order');
const Driver = require('../src/models/Driver');

const argv = process.argv.slice(2);
const doFix = argv.includes('--fix');

(async function main(){
  try {
    await connectDB();
    console.log('Running driver-assignment reconciliation...');

    // 1) Orders with driver set but driver.assignedOrders missing the order
    const ordersWithDriver = await Order.find({ driver: { $ne: null } }).select('_id driver status').lean();
    console.log(`Found ${ordersWithDriver.length} orders with a driver set.`);

    let missingInDriver = 0;
    for (const o of ordersWithDriver) {
      const d = await Driver.findById(o.driver).select('assignedOrders');
      if (!d) {
        console.warn(`Order ${o._id} references missing Driver ${o.driver}`);
        continue;
      }
      const has = (d.assignedOrders || []).some(x => x.toString() === o._id.toString());
      if (!has) {
        missingInDriver++;
        console.log(`Order ${o._id} not present in Driver ${d._id}.assignedOrders`);
        if (doFix) {
          await Driver.findByIdAndUpdate(d._id, { $addToSet: { assignedOrders: o._id } });
          console.log(`  -> fixed: added to Driver.assignedOrders`);
        }
      }
    }

    // 2) Driver.assignedOrders entries that point to orders where order.driver is null or points to a different driver
    const drivers = await Driver.find({ assignedOrders: { $exists: true, $ne: [] } }).lean();
    console.log(`Scanning ${drivers.length} drivers with assignedOrders entries.`);
    let inconsistent = 0;
    for (const drv of drivers) {
      for (const oid of drv.assignedOrders || []) {
        const ord = await Order.findById(oid).select('driver status').lean();
        if (!ord) {
          inconsistent++;
          console.log(`Driver ${drv._id} has assignedOrders entry ${oid} but order not found`);
          if (doFix) {
            await Driver.findByIdAndUpdate(drv._id, { $pull: { assignedOrders: oid } });
            console.log(`  -> fixed: removed missing order ref from driver`);
          }
          continue;
        }
        if (!ord.driver || ord.driver.toString() !== drv._id.toString()) {
          inconsistent++;
          console.log(`Mismatch: Driver ${drv._id} references Order ${oid} but order.driver=${ord.driver}`);
          if (doFix) {
            // If order.driver is null and order is still active assigned status, set it to driver
            if (!ord.driver && ['assigned','delivering'].includes(ord.status)) {
              await Order.findByIdAndUpdate(oid, { $set: { driver: drv._id } });
              console.log(`  -> fixed: set Order.driver to Driver`);
            } else {
              // otherwise remove from driver.assignedOrders
              await Driver.findByIdAndUpdate(drv._id, { $pull: { assignedOrders: oid } });
              console.log(`  -> fixed: removed order ref from driver`);
            }
          }
        }
      }
    }

    console.log('Reconciliation complete.');
    console.log(`Missing in driver lists: ${missingInDriver}. Inconsistent refs: ${inconsistent}.`);

    process.exit(0);
  } catch (e) {
    console.error('Reconciliation failed', e);
    process.exit(2);
  }
})();
