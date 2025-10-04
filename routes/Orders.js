const express = require("express");
const Orderrouter = express.Router();
const Order = require("../models/Order");
let tokenCounter = 1; // 👈 reset daily in real-world app

// Create order
Orderrouter.post("/createorder", async (req, res) => {
  try {
    const data = req.body;
    console.log("data ====", data);
    const order = new Order({ ...data, tokenNumber: tokenCounter++ });
    console.log("Order object before saving:", order);
    await order.save();
    res.status(201).json({
      status: "success",
      message: "Order generated successfully ✅",
      order: order,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to save order" }, err);
  }
});

// Get all orders
Orderrouter.get("/getorderlist", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.status(200).json({
      status: "success",
      orders,
    });
  } catch (err) {
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
  } catch (err) { // ✅ Variable name is 'err'
    res.status(500).json({ message: "Server error", error: err.message }); // ✅ Pass the correct 'err' object, or its message
  }
});





Orderrouter.get("/salessummery", async (req, res) => {
  try {
    const sales = await Order.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$date" },
          },
          totalSales: { $sum: "$grandTotal" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: "Error fetching sales", error: err });
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
