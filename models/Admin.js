const mongoose = require("mongoose");
const createadminSchema = new mongoose.Schema({
  email: {
    type: String,  // use String instead of 'email'
    required: true,
    unique: true,  // optional: to prevent duplicate emails
  },
  password: {
    type: String,  // use String instead of 'password'
    required: true,
  },
})
const adminschema = mongoose.model("adminschema", createadminSchema);

module.exports = adminschema;