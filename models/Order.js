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

  // new, explicit discount fields
  discountAmount: { type: Number, default: 0 }, // rupees deducted
  discountType: {
    type: String,
    enum: ["percentage", "fixed", null],
    default: null,
  },
  discountValue: { type: Number, default: 0 }, // 20 for 20% or 50 for ₹50
  discountReason: { type: String, default: null },

  grandTotal: { type: Number, required: true },

  ordertype: { type: String, enum: ["Dine", "Take Away"], required: true },
});

module.exports = mongoose.model("Order", orderSchema);
