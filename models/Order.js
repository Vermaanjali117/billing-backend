const mongoose = require("mongoose");

// schema for a single item inside the order
const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
});

// schema for full order
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true },
  tokenNumber: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  customerName: { type: String },
  phone: { type: String },
  paymentMode: { type: String, enum: ["Cash", "UPI", "Card"], required: true },
  items: [orderItemSchema],
  subTotal: { type: Number, required: true },
  delivery: { type: Number, default: 0 },
  handling: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  ordertype: { type: String, enum: ["Dine", "Take Away",], required: true },
});

module.exports = mongoose.model("Order", orderSchema);
