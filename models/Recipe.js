const mongoose = require("mongoose");

const recipeSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
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
          required: true, // per 1 item
        },
      },
    ],

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
  },
  { timestamps: true }
);

// One recipe per item per branch
recipeSchema.index({ itemId: 1, branchId: 1 }, { unique: true });

module.exports = mongoose.model("Recipe", recipeSchema);
