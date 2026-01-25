const mongoose = require("mongoose");

// schema for a single item inside the order
const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
});

// schema for full order
const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true },
    tokenNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },

    customerName: { type: String },
    phone: { type: String },

    paymentMode: {
      type: String,
      enum: ["Cash", "UPI", "Card"],
      required: true,
    },

    items: [orderItemSchema],

    subTotal: { type: Number, required: true },
    delivery: { type: Number, default: 0 },
    handling: { type: Number, default: 0 },

    discountAmount: { type: Number, default: 0 },
    discountType: {
      type: String,
      enum: ["percentage", "fixed", null],
      default: null,
    },
    discountValue: { type: Number, default: 0 },
    discountReason: { type: String, default: null },

    grandTotal: { type: Number, required: true },

    ordertype: {
      type: String,
      enum: ["Dine", "Take Away"],
      required: true,
    },

    // 🔥 branch-wise fields
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "adminschema",
    },
  },
  {
    timestamps: true, // ✅ CORRECT PLACE
  }
);

module.exports = mongoose.model("Order", orderSchema);
