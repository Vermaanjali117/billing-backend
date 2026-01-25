const express = require("express");
const Orderrouter = express.Router();
const Order = require("../models/Order");
const InventoryHistory = require("../models/InventoryHistory");
const Item = require("../models/Item");
const Counter = require("../models/Counter");
const Customer = require("../models/Customers");
const RawMaterial = require("../models/RowMaterial");
const Recipe = require("../models/Recipe");
const authMiddleware = require("../middleware/Authmiddleware");
const mongoose = require("mongoose");

Orderrouter.post("/createorder", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, ...orderData } = req.body;

    if (!items || items.length === 0) {
      throw new Error("Order must contain at least one item");
    }
    let customer = await Customer.findOne({
      phone: orderData.phone,
      branchId: req.branchId,
    }).session(session);
    if (!customer) {
      await Customer.create(
        [
          {
            name: orderData.customerName,
            phone: orderData.phone,
            branchId: req.branchId,
            totalOrders: 1,
            lastOrderAt: new Date(),
          },
        ],
        { session },
      );
    } else {
      await Customer.updateOne(
        { _id: customer._id },
        {
          $set: {
            name: orderData.customerName,
            lastOrderAt: new Date(),
          },
          $inc: { totalOrders: 1 },
        },
        { session },
      );
    }

    // ✅ STEP 2: BUILD MATERIAL MAP
    const materialMap = {};

    for (const item of items) {
      const recipe = await Recipe.findOne({
        itemId: item.itemid,
        branchId: req.branchId,
      }).session(session);

      if (!recipe) {
        throw new Error("Recipe not found for item");
      }

      for (const mat of recipe.materials) {
        const usedQty = mat.quantityRequired * item.qty;
        const key = mat.rawMaterialId.toString();

        materialMap[key] = (materialMap[key] || 0) + usedQty;
      }
    }

    // ✅ STEP 3: VALIDATE STOCK
    for (const materialId in materialMap) {
      const material = await RawMaterial.findOne({
        _id: materialId,
        branchId: req.branchId,
      }).session(session);

      if (!material || material.quantity < materialMap[materialId]) {
        throw new Error(`Insufficient stock`);
      }
    }

    // ✅ STEP 4: DEDUCT STOCK + HISTORY
    for (const materialId in materialMap) {
      const qty = materialMap[materialId];

      await RawMaterial.updateOne(
        { _id: materialId, branchId: req.branchId },
        { $inc: { quantity: -qty } },
        { session },
      );

      await InventoryHistory.create(
        [
          {
            rawMaterialId: materialId,
            change: -qty,
            reason: "ORDER",
            branchId: req.branchId,
            createdBy: req.userId,
          },
        ],
        { session },
      );
    }

    // ✅ STEP 5: BUILD FINAL ITEMS
    const finalItems = [];
    let subTotal = 0;

    for (const item of items) {
      const dbItem = await Item.findById(item.itemid).session(session);
      const total = dbItem.price * item.qty;

      subTotal += total;

      finalItems.push({
        name: dbItem.name,
        qty: item.qty,
        price: dbItem.price,
        total,
      });
    }
    // ✅ STEP 0: Get Today's Date String (2026-01-21)
    const today = new Date().toISOString().split("T")[0];

    // ✅ STEP 1: Increment/Get Token
    // We use the 'session' so this is part of the atomic transaction
    const counter = await Counter.findOneAndUpdate(
      { branchId: req.branchId, date: today },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true,
        session: session, // Very important for transactions!
      },
    );

    if (!counter) {
      throw new Error("Failed to generate token number");
    }
    const newTokenNumber = counter.seq;
    // ✅ STEP 6: SAVE ORDER
    const order = new Order({
      orderNumber: `ORD-${Date.now()}`,
      tokenNumber: newTokenNumber,
      date: new Date(),

      customerName: orderData.customerName,
      phone: orderData.phone,
      paymentMode: orderData.paymentMode,
      ordertype: orderData.ordertype,

      items: finalItems,
      subTotal,
      delivery: orderData.delivery || 0,
      handling: orderData.handling || 0,
      discountAmount: orderData.discountAmount || 0,
      discountType: orderData.discountType || null,
      discountValue: orderData.discountValue || 0,
      discountReason: orderData.discountReason || null,
      grandTotal: subTotal,

      branchId: req.branchId,
      createdBy: req.userId,
    });

    await order.save({ session });

    // ✅ COMMIT ONLY AT THE END
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      status: "success",
      message: "Order + customer + inventory saved ✅",
      order,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      message: err.message || "Order failed",
    });
  }
});

// Get all orders
Orderrouter.get("/getorderlist", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({
      branchId: req.branchId, // 🔥 THIS IS THE KEY
    }).sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      orders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// getorderdetail

Orderrouter.get("/getorderdetail/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(200).json({
      status: "successful",
      message: "Order fetched successfully",
      data: order,
    });
  } catch (err) {
    // ✅ Variable name is 'err'
    res.status(500).json({ message: "Server error", error: err.message }); // ✅ Pass the correct 'err' object, or its message
  }
});

Orderrouter.get("/salessummery", authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query;

    const match = {
      branchId: new mongoose.Types.ObjectId(req.branchId),
    };

    // ✅ USE `date` FIELD (NOT createdAt)
    if (from && to) {
      match.date = {
        $gte: new Date(from),
        $lte: new Date(to + "T23:59:59.999Z"),
      };
    }

    const sales = await Order.aggregate([
      { $match: match },

      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$date", // ✅ IMPORTANT
            },
          },
          totalSales: { $sum: "$grandTotal" },
          orderCount: { $sum: 1 },
        },
      },

      { $sort: { _id: 1 } },
    ]);

    res.json({
      status: "success",
      sales,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching sales" });
  }
});



// Delete an order by ID
Orderrouter.delete("/deleteorder/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find and delete the order
    const deletedOrder = await Order.findByIdAndDelete(id);

    if (!deletedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({
      status: "success",
      message: "Order deleted successfully",
      deletedOrder,
    });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

module.exports = Orderrouter;
