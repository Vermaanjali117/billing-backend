const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },       // Lal Bangla
    pincode: { type: String, required: true, unique: true }, // 208007
    address: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Branch", branchSchema);
