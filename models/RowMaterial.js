// models/RawMaterial.js
const mongoose = require("mongoose");

const rawMaterialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit: {
      type: String,
      enum: ["kg", "gm", "ml", "ltr", "pcs"],
      required: true,
    },
    quantity: { type: Number, required: true },
    alertAt: { type: Number, default: 0 },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RawMaterial", rawMaterialSchema);