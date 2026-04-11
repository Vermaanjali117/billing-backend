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

    // ─── COMPOSITE ONLY ──────────────────────────────────────
    // What goes IN to make 1 batch (e.g. 1000gm Premix + 100gm Oil)
    ingredients: [
      {
        rawMaterialId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RawMaterial",
          required: true,
        },
        // Stored in BASE UNITS (gm / ml / pcs)
        // e.g. user enters 1000 gm → stored as 1000
        //      user enters 1 kg   → stored as 1000
        quantityRequired: {
          type: Number,
          required: true,
        },
        // Original unit the user chose (kept for display reference)
        unit: {
          type: String,
          enum: ["kg", "gm", "ml", "ltr", "pcs"],
          required: true,
        },
      },
    ],

    // What comes OUT of 1 batch (e.g. 22 gm Dark Batter)
    // Stored in DISPLAY UNITS — converted to base at produce time
    yieldQuantity: {
      type: Number,
      default: 0,
    },
    yieldUnit: {
      type: String,
      enum: ["kg", "gm", "ml", "ltr", "pcs"],
      default: "gm",
    },
    // ─────────────────────────────────────────────────────────
  },
  { timestamps: true }
);

module.exports = mongoose.model("RawMaterial", rawMaterialSchema);
