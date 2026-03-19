const mongoose = require("mongoose");

const branchStockSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },
  rawMaterialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RawMaterial", // This links to your RawMaterial schema where 'unit' lives
    required: true,
  },
  quantity: {
    type: Number,
    default: 0,
  },
});

// This ensures a branch can't have duplicate entries for the same material
branchStockSchema.index({ branchId: 1, rawMaterialId: 1 }, { unique: true });

module.exports = mongoose.model("BranchStock", branchStockSchema);
