const mongoose = require("mongoose");

const createadminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },

  // 🔥 ADD THIS FIELD
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },
});

const adminschema = mongoose.model("adminschema", createadminSchema);
module.exports = adminschema;
