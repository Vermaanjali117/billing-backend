const mongoose = require("mongoose");

const rawMaterialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    unit: {
      type: String,
      enum: ["kg", "gm", "ml", "ltr", "pcs"],
      required: true,
    },

    alertAt: { type: Number, default: 0 },

    type: {
      type: String,
      enum: ["RAW", "COMPOSITE"],
      default: "RAW",
    },

    ingredients: [
      {
        rawMaterialId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RawMaterial",
        },
        quantityRequired: Number,
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("RawMaterial", rawMaterialSchema);
