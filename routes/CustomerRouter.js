const Customer = require("../models/Customers");
const express = require("express");
const Customerrouter = express.Router();
const Order = require("../models/Order");
const Item = require("../models/Item");
const authMiddleware = require("../middleware/Authmiddleware");
const mongoose = require("mongoose");
Customerrouter.get("/by-phone/:phone", authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findOne({
      phone: req.params.phone,
      branchId: req.branchId,
    });
    if (!customer) {
      return res.json({
        found: false,
      });
    }
    res.json({
      found: true,
      customer,
    });
  } catch (err) {
    res.status(500).json({ message: "Customer lookup failed" });
  }
});
Customerrouter.get("/search", authMiddleware, async (req, res) => {
  try {
    const q = req.query.q;
    console.log("q param:", req.query.q);
    if (q.length < 3) {
      return res.json({ status: "fail", data: [] });
    }
    console.log("req.branchId ======", req.branchId);
    const customers = await Customer.find({
      branchId: req.branchId,
      phone: { $regex: "^" + q }, // starts with
    })
      .limit(5)
      .select("name phone");

    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: "Search failed" });
  }
});

module.exports = Customerrouter;
