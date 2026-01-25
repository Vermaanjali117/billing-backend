const mongoose = require("mongoose");
const counterSchema = new mongoose.Schema({
  branchId: { type: String, required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  seq: { type: Number, default: 0 },
});

// Compound index to quickly find the right counter
counterSchema.index({ branchId: 1, date: 1 }, { unique: true });
const Counter = mongoose.model("Counter", counterSchema);

module.exports = mongoose.model("Counter", counterSchema);
