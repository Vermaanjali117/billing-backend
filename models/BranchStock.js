const mongoose = require("mongoose");

const branchStockSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },

  rawMaterialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RawMaterial",
    required: true,
  },

  quantity: {
    type: Number,
    default: 0,
  },
});

branchStockSchema.index({ branchId: 1, rawMaterialId: 1 }, { unique: true });

module.exports = mongoose.model("BranchStock", branchStockSchema);
