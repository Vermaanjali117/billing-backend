const mongoose = require("mongoose");

const inventoryHistorySchema = new mongoose.Schema(
  {
    rawMaterialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RawMaterial",
      required: true,
    },

    change: {
      type: Number, // negative for deduction, positive for restock
      required: true,
    },

    reason: {
      type: String,
      enum: ["ORDER", "RESTOCK", "ADJUSTMENT"],
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

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
  { timestamps: true }
);

module.exports = mongoose.model("InventoryHistory", inventoryHistorySchema);
