const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: String,

    phone: {
      type: String,
      required: true,
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    totalOrders: {
      type: Number,
      default: 0,
    },

    lastOrderAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

customerSchema.index({ phone: 1, branchId: 1 }, { unique: true });

module.exports = mongoose.model("Customer", customerSchema);
