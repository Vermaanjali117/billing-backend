const mongoose = require("mongoose");

const recipeSchema = new mongoose.Schema(
  {
    productType: {
      type: String,
      enum: ["ITEM", "COMPOSITE"],
      required: true,
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "productTypeRef",
    },

    productTypeRef: {
      type: String,
      required: true,
      enum: ["Item", "RawMaterial"],
    },

    outputQuantity: {
      type: Number,
      required: true,
    },

    outputUnit: {
      type: String,
      enum: ["gm", "kg", "ml", "ltr", "pcs"],
    },

    materials: [
      {
        rawMaterialId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RawMaterial",
          required: true,
        },
        quantityRequired: {
          type: Number,
          required: true,
        },
        // 🔹 ADD THIS FIELD TO SAVE THE UNIT
        unit: {
          type: String,
          enum: ["gm", "kg", "ml", "ltr", "pcs"],
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

recipeSchema.index({ productId: 1 }, { unique: true });

module.exports = mongoose.model("Recipe", recipeSchema);
